-- DealershipService: buying cars (cash / finance / trade-in), test drives and the showroom.
--
-- World:
--   * "Dealership" tagged counters get a ProximityPrompt "Browse Cars" → opens the client "Dealership" panel
--   * "DealershipDisplay" pads show featured cars (rotated every few minutes) with a "View" prompt
--   * "TestDriveSpawn" parts are where test-drive cars appear
--
-- Remote "Dealership" (Net.HandleActions):
--   GetCatalog()                                  -> { Cars, Brands, Classes, Finance, TradeIns, TestDrive, ... }
--   Buy(ModelId, Color, Finish, PayMode, Payments?, TradeInUid?, Plate?) -> { ok, Uid, Paid }
--   TestDrive(ModelId)                            -> { ok }
--   EndTestDrive()                                -> { ok }
--   PayFinanceEarly(Uid)                          -> { ok }
--   GetFinance()                                  -> { ok, Finance }
--
-- Server API (optional for peers, not part of the §5 contract):
--   DealershipService:IsTestDriving(player) -> boolean
--   DealershipService:GetFinanceSummary(player) -> table

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Table = require(Shared.Util.Table)
local World = require(Shared.Config.World)
local DealerCfg = require(Shared.Config.Dealership)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local DealerFolder = script.Parent:WaitForChild("Dealer")
local Catalog = require(DealerFolder:WaitForChild("Catalog"))
local Common = require(DealerFolder:WaitForChild("Common"))
local Finance = require(DealerFolder:WaitForChild("Finance"))
local Displays = require(DealerFolder:WaitForChild("Displays"))
local TestDrive = require(DealerFolder:WaitForChild("TestDrive"))

local DealershipService = {
	Name = "DealershipService",
	Priority = 70,
}

local PROMPT_NAME = "DealershipBrowsePrompt"
local MAX_PRICE = 2_000_000_000

local DataService
local Economy
local Notify

local buying: { [Player]: boolean } = {}

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function nearDealership(player: Player): Instance?
	local counter = Guard.NearTagged(player, World.Tags.Dealership, DealerCfg.UseDistance)
	if counter then
		return counter
	end
	return Guard.NearTagged(player, World.Tags.DealershipDisplay, DealerCfg.UseDistance)
end

local function hasVip(player: Player): boolean
	return Common.HasPass(player, "VIP")
end

local function maxOwned(player: Player): number
	-- VehicleService owns the real garage limit (it refuses GrantVehicle when full); use it when present
	local vs = Common.VehicleService()
	if vs and type(vs.GetGarageSlots) == "function" then
		local ok, slots = pcall(vs.GetGarageSlots, vs, player)
		if ok and type(slots) == "number" and slots == slots and slots >= 1 then
			return math.floor(slots)
		end
	end
	local n = DealerCfg.MaxOwnedCars
	if Common.HasPass(player, "PremiumCarPark") then
		n += DealerCfg.PremiumCarParkBonusCars
	end
	return n
end

local function carPrice(player: Player, def: { [string]: any }): number
	return Economy:GetPrice(player, Catalog.Price(def), DealerCfg.PriceCategory)
end

local function finishExtra(player: Player, finish: string): number
	local row = DealerCfg.Finishes[finish]
	if not row or (row.Extra or 0) <= 0 then
		return 0
	end
	return Economy:GetPrice(player, row.Extra, DealerCfg.PriceCategory)
end

-- Is this car the one the player is driving / a job / test car? (trade-in safety)
local function isInUse(player: Player, uid: string): boolean
	local occupied = Common.OccupiedModel(player)
	if occupied and occupied:GetAttribute("CarUid") == uid then
		return true
	end
	return false
end

-- Trade-in credit for an owned car: value * fraction, minus its outstanding loan. Returns (credit, err?)
local function tradeInCredit(player: Player, uid: string): (number, string?)
	local car = Common.GetCarData(player, uid)
	if not car then
		return 0, "Trade-in car not found."
	end
	local value = Common.CarValue(player, uid)
	if value < DealerCfg.TradeIn.MinValue then
		return 0, "That car isn't worth enough to trade in."
	end
	local credit = math.floor(value * DealerCfg.TradeIn.Fraction)
	local owed = 0
	if type(car.Finance) == "table" and type(car.Finance.Remaining) == "number" then
		owed = math.max(0, math.floor(car.Finance.Remaining))
	end
	if owed > credit then
		return 0, ("You still owe %s on that car — more than its trade-in value."):format(Format.Money(owed))
	end
	return credit - owed, nil
end

local function tradeIns(player: Player)
	local out = {}
	local data = DataService:GetData(player)
	if data and type(data.Vehicles) == "table" then
		for uid, car in pairs(data.Vehicles) do
			if type(car) == "table" then
				local credit, err = tradeInCredit(player, uid)
				local def = Catalog.GetAnyCar(car.ModelId)
				table.insert(out, {
					Uid = uid,
					ModelId = car.ModelId,
					Name = def and def.Name or tostring(car.ModelId),
					Credit = credit,
					Eligible = err == nil and not isInUse(player, uid),
					Reason = err,
				})
			end
		end
	end
	table.sort(out, function(a, b)
		return a.Credit > b.Credit
	end)
	return out
end

local function catalogFor(player: Player)
	local cars = {}
	local classes = {}
	local classSeen = {}
	local brandsUsed = {}
	local vip = hasVip(player)
	for _, entry in ipairs(Catalog.List()) do
		local s = Catalog.Summary(entry.Id, entry.Def)
		s.Price = carPrice(player, entry.Def)
		s.Locked = s.VipOnly and not vip
		table.insert(cars, s)
		if not classSeen[s.Class] then
			classSeen[s.Class] = true
			table.insert(classes, s.Class)
		end
		if s.Brand ~= "" then
			brandsUsed[s.Brand] = true
		end
	end
	table.sort(classes)
	local brands = {}
	for id in pairs(brandsUsed) do
		local b = Catalog.GetBrand(id)
		brands[id] = { Id = id, Name = b.Name, Code = b.Code, Tagline = b.Tagline, Badge = b.Badge }
	end
	local finishes = {}
	for _, id in ipairs(DealerCfg.FinishOrder) do
		local row = DealerCfg.Finishes[id]
		if row then
			table.insert(finishes, { Id = id, Name = row.Name, Extra = finishExtra(player, id) })
		end
	end
	return {
		Cars = cars,
		Brands = brands,
		Classes = classes,
		Finishes = finishes,
		HasVip = vip,
		Finance = Finance.Summary(player),
		TradeIns = tradeIns(player),
		Owned = Common.CountCars(player),
		MaxOwned = maxOwned(player),
		TestDrive = {
			Seconds = DealerCfg.TestDrive.Seconds,
			CooldownLeft = TestDrive.CooldownLeft(player),
			Active = TestDrive.IsActive(player),
		},
	}
end

local function openCatalog(player: Player, focus: string?)
	if not DataService:IsLoaded(player) then
		return
	end
	Notify:OpenUI(player, "Dealership", { Focus = focus })
end

---------------------------------------------------------------------------
-- Buy
---------------------------------------------------------------------------
local function snapshotCar(car: { [string]: any }): { [string]: any }
	return Table.DeepCopy(car)
end

local function restoreCar(player: Player, snap: { [string]: any })
	local vs = Common.VehicleService()
	if not vs or type(vs.GrantVehicle) ~= "function" then
		return
	end
	local ok, uid = pcall(vs.GrantVehicle, vs, player, snap.ModelId, {
		Value = snap.Value,
		Paint = snap.Paint,
		Finance = snap.Finance,
		Plate = snap.Plate,
		IgnoreLimit = true, -- the slot was ours a moment ago
	})
	if not ok or type(uid) ~= "string" then
		warn(("[Dealership] could not restore traded-in %s for %s"):format(tostring(snap.ModelId), player.Name))
		return
	end
	if Common.GetCarData(player, uid) then
		-- GrantVehicle normalises opts; write the exact saved fields back (Finance keeps Missed/Since/Total)
		for _, key in ipairs({ "Paint", "Finance", "Value", "Plate", "Rims", "RimColor", "Tint", "BodyKit", "Spoiler", "Underglow", "Upgrades", "Mileage", "Health", "Fuel", "PurchasedAt" }) do
			if snap[key] ~= nil then
				DataService:Set(player, "Vehicles." .. uid .. "." .. key, Table.DeepCopy(snap[key]))
			end
		end
	end
end

local function doBuy(player: Player, payload: { [string]: any })
	local modelId = Guard.Id(payload.ModelId, 64)
	local def = modelId and Catalog.GetCar(modelId)
	if not modelId or not def then
		return { ok = false, err = "That car isn't for sale." }
	end
	if not nearDealership(player) then
		return { ok = false, err = "Visit a dealership to buy cars." }
	end
	if def.VipOnly == true and not hasVip(player) then
		return { ok = false, err = "👑 This car is VIP only." }
	end
	if TestDrive.IsActive(player) then
		return { ok = false, err = "Finish your test drive first." }
	end
	local vs = Common.VehicleService()
	if not vs or type(vs.GrantVehicle) ~= "function" then
		return { ok = false, err = "The dealership is closed right now. Try again soon." }
	end

	-- options ---------------------------------------------------------------
	local color = payload.Color ~= nil and Guard.Color(payload.Color) or nil
	if payload.Color ~= nil and not color then
		return { ok = false, err = "Invalid colour." }
	end
	color = color or table.clone(DealerCfg.Colors[1].Color)
	local finish = "Gloss"
	if payload.Finish ~= nil then
		finish = Guard.OneOf(payload.Finish, DealerCfg.Finishes)
		if type(finish) ~= "string" then
			return { ok = false, err = "Invalid finish." }
		end
	end
	local payMode = payload.PayMode == "Finance" and "Finance" or "Cash"
	if payload.PayMode ~= nil and payload.PayMode ~= "Cash" and payload.PayMode ~= "Finance" then
		return { ok = false, err = "Invalid payment mode." }
	end
	local payments = DealerCfg.Finance.DefaultPayments
	if payload.Payments ~= nil then
		local n = Guard.Int(payload.Payments, 1, 1000)
		if not n or not table.find(DealerCfg.Finance.PaymentOptions, n) then
			return { ok = false, err = "Invalid payment plan." }
		end
		payments = n
	end
	local tradeUid: string? = nil
	if payload.TradeInUid ~= nil and payload.TradeInUid ~= "" then
		tradeUid = Guard.Id(payload.TradeInUid, 32)
		if not tradeUid or not Common.GetCarData(player, tradeUid) then
			return { ok = false, err = "Trade-in car not found." }
		end
		if isInUse(player, tradeUid) then
			return { ok = false, err = "Step out of the car you're trading in." }
		end
	end
	local plate: string? = nil
	if payload.Plate ~= nil and payload.Plate ~= "" then
		local clean = Common.CleanPlate(payload.Plate, DealerCfg.PlateMaxLength)
		if not clean then
			return { ok = false, err = ("Plates are 1-%d letters, numbers or spaces."):format(DealerCfg.PlateMaxLength) }
		end
		plate = Common.FilterPlate(player, clean)
		if not plate then
			return { ok = false, err = "That plate text isn't allowed." }
		end
		if not Common.IsPlaying(player) then
			return { ok = false, err = "Left the game." }
		end
	end

	-- garage space (a trade-in frees one slot)
	local owned = Common.CountCars(player) - (tradeUid and 1 or 0)
	if owned >= maxOwned(player) then
		return { ok = false, err = "Your garage is full. Sell or trade in a car first." }
	end

	-- price -----------------------------------------------------------------
	local price = carPrice(player, def) + finishExtra(player, finish)
	if price <= 0 or price > MAX_PRICE then
		return { ok = false, err = "Price unavailable." }
	end
	local credit = 0
	if tradeUid then
		local c, err = tradeInCredit(player, tradeUid)
		if err then
			return { ok = false, err = err }
		end
		credit = c
	end

	local due: number
	local financeTable: any = false
	if payMode == "Finance" then
		if price < DealerCfg.Finance.MinCarPrice then
			return { ok = false, err = ("Financing starts at %s."):format(Format.Money(DealerCfg.Finance.MinCarPrice)) }
		end
		local q = DealerCfg.Quote(price, credit, payments)
		if q.Financed <= 0 then
			-- trade-in covers the car: treat as cash
			payMode = "Cash"
			due = price - credit
		else
			local okLoan, loanErr = Finance.CheckNewLoan(player, q.TotalOwed, tradeUid)
			if not okLoan then
				return { ok = false, err = loanErr }
			end
			due = q.Down
			financeTable = {
				Remaining = q.TotalOwed,
				Payment = q.Payment,
				PaymentsLeft = q.Payments,
				Missed = 0,
				Since = os.time(),
				Total = q.TotalOwed,
			}
		end
	else
		due = price - credit
	end

	local balances = (DataService:Get(player, "Cash") or 0) + (DataService:Get(player, "Bank") or 0)
	if due > 0 and balances < due then
		return { ok = false, err = ("You need %s (wallet + bank)."):format(Format.Money(due)) }
	end

	-- execute ---------------------------------------------------------------
	local reason = "Buy:Car:" .. modelId
	if due > 0 and not Economy:Charge(player, due, reason) then
		return { ok = false, err = "Payment declined." }
	end
	local function refund()
		if due > 0 then
			Economy:AddCash(player, due, "Refund:Car:" .. modelId)
		end
	end

	local snap: { [string]: any }? = nil
	if tradeUid then
		local car = Common.GetCarData(player, tradeUid)
		if not car then
			refund()
			return { ok = false, err = "Trade-in car not found." }
		end
		snap = snapshotCar(car)
		local okRemove, removed = pcall(vs.RemoveVehicle, vs, player, tradeUid)
		if not okRemove or removed == false then
			refund()
			return { ok = false, err = "Couldn't process the trade-in. Try again." }
		end
	end

	local paint = { Color = color, Finish = finish }
	local okGrant, uid = pcall(vs.GrantVehicle, vs, player, modelId, {
		Value = price,
		Paint = paint,
		Finance = financeTable,
		Plate = plate or Common.RandomPlate(DealerCfg.PlatePrefix),
	})
	if not okGrant or type(uid) ~= "string" then
		if not okGrant then
			warn("[Dealership] GrantVehicle failed:", uid)
		end
		refund()
		if snap then
			restoreCar(player, snap)
		end
		return { ok = false, err = "Couldn't register the car. You were refunded." }
	end

	-- make sure our fields are saved exactly (GrantVehicle may only copy known keys)
	local base = "Vehicles." .. uid
	if Common.GetCarData(player, uid) then
		DataService:Set(player, base .. ".Paint", Table.DeepCopy(paint))
		DataService:Set(player, base .. ".Finance", financeTable and Table.DeepCopy(financeTable) or false)
		DataService:Set(player, base .. ".Value", price)
		if plate then
			DataService:Set(player, base .. ".Plate", plate)
		end
	end

	-- trade-in worth more than the car (cash mode only): pay out the difference
	if payMode == "Cash" and credit > price then
		Economy:AddCash(player, credit - price, "Sell:TradeIn")
	end

	Common.Tutorial(player, "BuyCar")
	local name = tostring(def.Name or modelId)
	if financeTable then
		Common.PhoneMessage(
			player,
			DealerCfg.Finance.SenderName,
			("Welcome to the family! Your %s loan: %s over %d daily payments of %s. Don't miss %d in a row or it's repossessed."):format(
				name,
				Format.Money(financeTable.Remaining),
				financeTable.PaymentsLeft,
				Format.Money(financeTable.Payment),
				DealerCfg.Finance.MissedLimit
			)
		)
	end
	Notify:Send(player, ("🚗 You bought a %s! Find it in your garage."):format(name), "success", 6)
	return { ok = true, Uid = uid, Paid = math.max(0, due), Financed = financeTable ~= false }
end

---------------------------------------------------------------------------
-- Prompts
---------------------------------------------------------------------------
local function attachCounterPrompt(inst: Instance)
	if not inst:IsA("BasePart") or inst:FindFirstChild(PROMPT_NAME) then
		return
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = PROMPT_NAME
	prompt.ActionText = "Browse Cars"
	prompt.ObjectText = tostring(inst:GetAttribute("DealerName") or "Skyline Motors")
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.HoldDuration = DealerCfg.PromptHoldDuration
	prompt.MaxActivationDistance = DealerCfg.PromptDistance
	prompt.RequiresLineOfSight = false
	prompt.Style = Enum.ProximityPromptStyle.Default
	prompt.Triggered:Connect(function(player: Player)
		openCatalog(player, nil)
	end)
	prompt.Parent = inst
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function DealershipService:IsTestDriving(player: Player): boolean
	return TestDrive.IsActive(player)
end

function DealershipService:GetFinanceSummary(player: Player)
	return Finance.Summary(player)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function DealershipService:Init()
	DataService = Registry.Get("DataService")
	Economy = Registry.Get("EconomyService")
	Notify = Registry.Get("NotifyService")

	Finance.Init({ DataService = DataService, EconomyService = Economy })
	TestDrive.Init({ NotifyService = Notify })
	Displays.Init({
		OnView = function(player, modelId)
			openCatalog(player, modelId)
		end,
	})

	Net.HandleActions("Dealership", {
		GetCatalog = function(player)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Still loading your data." }
			end
			local res = catalogFor(player)
			res.ok = true
			return res
		end,

		GetFinance = function(player)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Still loading your data." }
			end
			return { ok = true, Finance = Finance.Summary(player), TradeIns = tradeIns(player) }
		end,

		Buy = function(player, payload)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Still loading your data." }
			end
			if buying[player] then
				return { ok = false, err = "Already processing a purchase." }
			end
			buying[player] = true
			local ok, res = pcall(doBuy, player, payload)
			buying[player] = nil
			if not ok then
				warn("[Dealership] Buy error:", res)
				return { ok = false, err = "Server error" }
			end
			return res
		end,

		TestDrive = function(player, payload)
			local modelId = Guard.Id(payload.ModelId, 64)
			local def = modelId and Catalog.GetCar(modelId)
			if not modelId or not def then
				return { ok = false, err = "That car isn't available." }
			end
			if def.VipOnly == true and not DealerCfg.TestDrive.AllowVipCars and not hasVip(player) then
				return { ok = false, err = "👑 VIP only." }
			end
			local counter = nearDealership(player)
			if not counter then
				return { ok = false, err = "Test drives start at the dealership." }
			end
			local ok, err = TestDrive.Start(player, modelId, counter)
			return { ok = ok, err = err }
		end,

		EndTestDrive = function(player)
			if not TestDrive.IsActive(player) then
				return { ok = false, err = "No test drive running." }
			end
			TestDrive.Stop(player, "manual")
			return { ok = true }
		end,

		PayFinanceEarly = function(player, payload)
			local uid = Guard.Id(payload.Uid, 32)
			if not uid then
				return { ok = false, err = "Invalid car." }
			end
			local ok, err = Finance.PayEarly(player, uid)
			return { ok = ok, err = err }
		end,
	}, {
		rate = 4,
		burst = 8,
		perAction = {
			Buy = { rate = 0.5, burst = 2 },
			TestDrive = { rate = 0.2, burst = 2 },
			PayFinanceEarly = { rate = 0.5, burst = 2 },
		},
	})

	Players.PlayerRemoving:Connect(function(player)
		buying[player] = nil
	end)
end

function DealershipService:Start()
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.Dealership)) do
		task.spawn(attachCounterPrompt, inst)
	end
	CollectionService:GetInstanceAddedSignal(World.Tags.Dealership):Connect(function(inst)
		task.defer(attachCounterPrompt, inst)
	end)

	Displays.Start()
	TestDrive.StartLoop()

	-- finance: once per in-game day, or a fallback timer
	local world = Registry.Find("WorldService")
	if world and world.DayChanged and world.DayChanged.Connect then
		world.DayChanged:Connect(function()
			Finance.Tick()
		end)
	else
		task.spawn(function()
			while true do
				task.wait(math.max(60, DealerCfg.Finance.FallbackDayMinutes * 60))
				Finance.Tick()
			end
		end)
	end
end

return DealershipService
