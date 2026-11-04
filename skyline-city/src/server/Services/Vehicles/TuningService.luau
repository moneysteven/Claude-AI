-- TuningService: the tuning shop (paint, rims, tint, body kits, spoilers, underglow, plates, performance).
--
-- World: "TuningShop" tagged parts are zones. A player must be DRIVING their own car inside a zone, or be
-- standing within Tuning.ShopDistance of their own spawned car that is parked inside one.
-- Each zone gets a server ProximityPrompt "Tuning Shop"; the client also auto-opens the panel when the
-- player drives in.
--
-- Remote "Tuning" (Net.HandleActions):
--   GetOptions({ Uid? })              -> { ok, Uid, ModelId, Name, Class, Current, Prices, Passes }
--   Apply({ Uid, Changes })            -> { ok, Spent, Lines }
--     Changes = { Paint = { Color = {R,G,B}, Finish } | { Exclusive = id }, Rims, RimColor, Tint, BodyKit,
--                 Spoiler, Underglow = false | {R,G,B}, Plate, Upgrades = { [cat] = targetLevel } }
--
-- Prices always come from Config/Tuning × the car's price tier (TuningPricing).

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Table = require(Shared.Util.Table)
local World = require(Shared.Config.World)
local Tuning = require(Shared.Config.Tuning)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local DealerFolder = script.Parent:WaitForChild("Dealer")
local Catalog = require(DealerFolder:WaitForChild("Catalog"))
local Common = require(DealerFolder:WaitForChild("Common"))
local TuningPricing = require(DealerFolder:WaitForChild("TuningPricing"))

local TuningService = {
	Name = "TuningService",
	Priority = 72,
}

local PROMPT_NAME = "TuningShopPrompt"
local LOOK_FIELDS = { "Paint", "Rims", "RimColor", "Tint", "BodyKit", "Spoiler", "Underglow", "Plate", "Upgrades" }

local DataService
local Economy
local Notify

local applying: { [Player]: boolean } = {}

---------------------------------------------------------------------------
-- Zones
---------------------------------------------------------------------------
-- Returns the TuningShop zone containing `pos`, if any.
local function zoneAt(pos: Vector3): BasePart?
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.TuningShop)) do
		if inst:IsA("BasePart") then
			local rel = inst.CFrame:PointToObjectSpace(pos)
			local half = inst.Size / 2
			local m = Tuning.ZoneMargin
			local halfY = math.max(half.Y, Tuning.ZoneHeight / 2)
			-- flat floor zones: measure height from the floor upwards
			local relY = rel.Y
			if inst.Size.Y < Tuning.ZoneHeight then
				relY = rel.Y + half.Y - halfY
			end
			if math.abs(rel.X) <= half.X + m and math.abs(rel.Z) <= half.Z + m and math.abs(relY) <= halfY + m then
				return inst
			end
		end
	end
	return nil
end

local function modelPos(model: Model): Vector3?
	local ok, pivot = pcall(function()
		return model:GetPivot()
	end)
	if ok then
		return pivot.Position
	end
	return nil
end

-- Find the car the player is tuning. Returns (uid, model) or (nil, err).
local function resolveCar(player: Player, wantedUid: string?): (string?, any)
	local occupied = Common.OccupiedModel(player)
	local candidate: Model? = nil
	if occupied and occupied:GetAttribute("OwnerUserId") == player.UserId and occupied:GetAttribute("CarUid") then
		candidate = occupied
	elseif occupied then
		return nil, "You can only tune your own car."
	else
		candidate = Common.ActiveModel(player)
	end
	if not candidate then
		return nil, "Bring your car to the tuning shop first."
	end
	if candidate:GetAttribute("IsTestDrive") == true or candidate:GetAttribute("IsJobVehicle") == true then
		return nil, "Test-drive and work vehicles can't be tuned."
	end
	local uid = candidate:GetAttribute("CarUid")
	if type(uid) ~= "string" then
		return nil, "Bring your car to the tuning shop first."
	end
	if wantedUid and wantedUid ~= uid then
		return nil, "That isn't the car you brought in."
	end
	if not Common.GetCarData(player, uid) then
		return nil, "Only cars you own can be tuned."
	end
	local pos = modelPos(candidate)
	if not pos or not zoneAt(pos) then
		return nil, "Park your car inside the tuning shop."
	end
	if candidate ~= occupied and not Guard.Near(player, candidate, Tuning.ShopDistance) then
		return nil, "Stand next to your car (or drive it) to tune it."
	end
	return uid, candidate
end

local function currentLook(car: { [string]: any })
	local out = {}
	for _, key in ipairs(LOOK_FIELDS) do
		if car[key] ~= nil then
			out[key] = Table.DeepCopy(car[key])
		end
	end
	return out
end

local function passes(player: Player)
	return {
		VIP = Common.HasPass(player, "VIP"),
		PremiumCarPark = Common.HasPass(player, "PremiumCarPark"),
	}
end

---------------------------------------------------------------------------
-- Actions
---------------------------------------------------------------------------
local function getOptions(player: Player, payload: { [string]: any })
	local wanted = nil
	if payload.Uid ~= nil then
		wanted = Guard.Id(payload.Uid, 32)
		if not wanted then
			return { ok = false, err = "Invalid car." }
		end
	end
	local uid, modelOrErr = resolveCar(player, wanted)
	if not uid then
		return { ok = false, err = modelOrErr }
	end
	local car = Common.GetCarData(player, uid) :: { [string]: any }
	local def = Catalog.GetAnyCar(car.ModelId)
	return {
		ok = true,
		Uid = uid,
		ModelId = car.ModelId,
		Name = def and def.Name or tostring(car.ModelId),
		Class = def and def.Class or "",
		CarPrice = Catalog.Price(def),
		Current = currentLook(car),
		Prices = TuningPricing.PriceTable(player, def),
		Passes = passes(player),
	}
end

local function apply(player: Player, payload: { [string]: any })
	local uidIn = Guard.Id(payload.Uid, 32)
	if not uidIn then
		return { ok = false, err = "Invalid car." }
	end
	local uid, modelOrErr = resolveCar(player, uidIn)
	if not uid then
		return { ok = false, err = modelOrErr }
	end
	local car = Common.GetCarData(player, uid) :: { [string]: any }
	local def = Catalog.GetAnyCar(car.ModelId)

	local quote, err = TuningPricing.Quote(player, uid, car, def, payload.Changes)
	if not quote then
		return { ok = false, err = err }
	end

	-- plate filtering yields; re-validate afterwards
	if quote.Plate then
		local ok = Common.FilterPlate(player, quote.Plate)
		if not ok then
			return { ok = false, err = "That plate text isn't allowed." }
		end
		if not Common.IsPlaying(player) then
			return { ok = false, err = "Left the game." }
		end
		local uid2 = resolveCar(player, uid)
		if uid2 ~= uid or Common.GetCarData(player, uid) ~= car then
			return { ok = false, err = "Your car moved. Try again." }
		end
	end

	if quote.Total > 0 then
		if not Economy:TrySpend(player, quote.Total, "Tuning:" .. tostring(car.ModelId)) then
			return { ok = false, err = ("You need %s cash for this."):format(Format.Money(quote.Total)) }
		end
	end

	for _, w in ipairs(quote.Writes) do
		DataService:Set(player, w.Path, TuningPricing.CopyValue(w.Value))
	end

	-- tuning adds to the car's value (net worth)
	local addValue = math.floor(
		quote.PerfSpend * Tuning.ValueFraction.Performance + quote.CosmeticSpend * Tuning.ValueFraction.Cosmetic
	)
	if addValue > 0 then
		DataService:Increment(player, "Vehicles." .. uid .. ".Value", addValue)
	end

	-- other players' clients read upgrade levels from attributes
	local model = modelOrErr
	if typeof(model) == "Instance" and model.Parent then
		local ups = Common.GetCarData(player, uid)
		ups = ups and ups.Upgrades
		if type(ups) == "table" then
			for _, cat in ipairs(Tuning.UpgradeOrder) do
				model:SetAttribute("Up_" .. cat, math.floor(tonumber(ups[cat]) or 0))
			end
		end
	end
	Common.RefreshLook(player, uid)

	if quote.Total > 0 then
		Notify:Send(player, ("🎨 Tuning done! Spent %s."):format(Format.Money(quote.Total)), "success", 5)
	else
		Notify:Send(player, "🎨 Changes applied.", "success", 4)
	end
	return { ok = true, Spent = quote.Total, Lines = quote.Lines }
end

---------------------------------------------------------------------------
-- Prompts
---------------------------------------------------------------------------
local function attachPrompt(inst: Instance)
	if not inst:IsA("BasePart") or inst:FindFirstChild(PROMPT_NAME) then
		return
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = PROMPT_NAME
	prompt.ActionText = "Tuning Shop"
	prompt.ObjectText = tostring(inst:GetAttribute("ShopName") or "Skyline Customs")
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = math.max(inst.Size.X, inst.Size.Z) / 2 + Tuning.PromptDistanceExtra
	prompt.RequiresLineOfSight = false
	prompt.Style = Enum.ProximityPromptStyle.Default
	prompt.Triggered:Connect(function(player: Player)
		if not DataService:IsLoaded(player) then
			return
		end
		local uid, err = resolveCar(player, nil)
		if not uid then
			Notify:Send(player, tostring(err), "warning", 4)
			return
		end
		Notify:OpenUI(player, "Tuning", { Uid = uid })
	end)
	prompt.Parent = inst
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
-- Config/Tuning sells finishes the shared car-look helper (Shared/Vehicle/Looks, vehicle subsystem) may not
-- know by the same id (it calls pearlescent "Pearl"). Alias any missing Tuning finish so RefreshLook renders it
-- instead of silently falling back to the default finish. Runs once, server-side only.
local function aliasFinishes()
	local vehicleFolder = Shared:FindFirstChild("Vehicle")
	local module = vehicleFolder and vehicleFolder:FindFirstChild("Looks")
	if not module or not module:IsA("ModuleScript") then
		return
	end
	local ok, Looks = pcall(require, module)
	if not ok or type(Looks) ~= "table" or type(Looks.Finishes) ~= "table" then
		return
	end
	for id, row in pairs(Tuning.Finishes) do
		if Looks.Finishes[id] == nil then
			local alias = id == "Pearlescent" and Looks.Finishes.Pearl or nil
			local okMat, mat = pcall(function()
				return (Enum.Material :: any)[row.Material]
			end)
			Looks.Finishes[id] = alias
				or { Material = (okMat and typeof(mat) == "EnumItem") and mat or Enum.Material.SmoothPlastic, Reflectance = row.Reflectance or 0 }
		end
	end
end

function TuningService:Init()
	aliasFinishes()
	DataService = Registry.Get("DataService")
	Economy = Registry.Get("EconomyService")
	Notify = Registry.Get("NotifyService")
	TuningPricing.Init({ EconomyService = Economy })

	Net.HandleActions("Tuning", {
		GetOptions = function(player, payload)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Still loading your data." }
			end
			return getOptions(player, payload)
		end,
		Apply = function(player, payload)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Still loading your data." }
			end
			if applying[player] then
				return { ok = false, err = "Already applying changes." }
			end
			applying[player] = true
			local ok, res = pcall(apply, player, payload)
			applying[player] = nil
			if not ok then
				warn("[Tuning] Apply error:", res)
				return { ok = false, err = "Server error" }
			end
			return res
		end,
	}, {
		rate = 3,
		burst = 6,
		perAction = { Apply = { rate = 0.5, burst = 2 } },
	})

	Players.PlayerRemoving:Connect(function(player)
		applying[player] = nil
	end)
end

function TuningService:Start()
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.TuningShop)) do
		task.spawn(attachPrompt, inst)
	end
	CollectionService:GetInstanceAddedSignal(World.Tags.TuningShop):Connect(function(inst)
		task.defer(attachPrompt, inst)
	end)
end

return TuningService
