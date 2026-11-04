-- BusinessService: player-owned businesses (Restaurant, ClothingStore, CarDealership, RealEstateOffice, GasStation,
-- Nightclub, Office) on BusinessLot lots, decorated with build mode, earning passive income ONLY while the owner is
-- online, plus real player-to-player commerce at registers and player employees.
--
-- PUBLIC API (ARCHITECTURE §5)
--   BusinessService:GetEmployer(p) -> (ownerPlayer?, bizId?)
-- Extra API (optional for peers):
--   BusinessService:GetBusinesses(p) -> { [bizId] = { TypeId, Name, LotId?, Loaded, Open } }
--   BusinessService:GetLoaded(p, bizId) -> biz runtime?
--
-- REMOTE "Business" (Net.HandleActions)
--   GetState {} · GetLots {} · BuyLot {LotId, TypeId} · Rename {BizId, Name} · SetPrice {BizId, ProductId, Price}
--   BuyStock {BizId, Amount} · Upgrade {BizId, UpgradeId} · HireNPC/FireNPC {BizId, Role} · Open/Close {BizId}
--   OpenBuildMode {BizId} -> {ContextId} · CollectVault {BizId} · SellBusiness {BizId}
--   HirePlayer {BizId, UserId, Role, Wage} · FireEmployee {BizId, UserId} · AcceptJob/DeclineJob {OfferId} · QuitJob {}
--   WorkTask {} · GetShop {Key} · BuyProduct {Key, ProductId}
-- Panels opened from the server: "Business" ({BizId} | {LotId}), "BusinessShop" (shop data), "JobOfferBusiness" (offer).
--
-- Saved record: Businesses.<bizId> = { TypeId, LotId, Name, Value, Level, Upgrades, Prices, Staff, Stock, Vault,
--   Build, Open, Lifetime, Employees, Stats = { Day, Customers, Revenue, HourStart, HourEarned, History }, CreatedAt }

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local TextService = game:GetService("TextService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Maid = require(Shared.Util.Maid)
local Format = require(Shared.Util.Format)
local EconomyConfig = require(Shared.Config.Economy)

local Server = ServerScriptService.Server
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local BizState = require(script.Parent.BizState)
local BizMath = require(script.Parent.BizMath)
local Ledger = require(script.Parent.Ledger)
local Lots = require(script.Parent.Lots)
local Shell = require(script.Parent.Shell)
local Stations = require(script.Parent.Stations)
local Staff = require(script.Parent.Staff)
local Income = require(script.Parent.Income)

local Config = BizState.Config
local G = Config.General

local BusinessService = {
	Name = "BusinessService",
	Priority = 60, -- after BuildService (40)
}

local DataService, EconomyService, NotifyService
local BuildService = nil

local unplaced: { [Player]: { [string]: boolean } } = {}
local pendingOwners: { [Player]: boolean } = {}
local buying: { [Player]: boolean } = {}
local lastSaleNotify: { [string]: number } = {}

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function fail(err: string)
	return { ok = false, err = err }
end

local function businessesOf(player: Player): { [string]: any }
	local b = DataService:Get(player, "Businesses")
	return type(b) == "table" and b or {}
end

local function countBusinesses(player: Player): number
	local n = 0
	for _, rec in pairs(businessesOf(player)) do
		if type(rec) == "table" then
			n += 1
		end
	end
	return n
end

local function pseudo(player: Player, bizId: string, rec)
	return { Owner = player, Id = bizId, TypeId = rec.TypeId, Key = BizState.Key(player, bizId) }
end

-- Resolve an owned business from a payload. Returns (bizOrPseudo, rec, loadedBiz?) or (nil, err).
local function owned(player: Player, payload)
	local bizId = Guard.Id(payload.BizId, 24)
	if not bizId then
		return nil, "Business not found"
	end
	local rec = BizState.Rec(player, bizId)
	if not rec or not Config.Types[rec.TypeId] then
		return nil, "Business not found"
	end
	local loaded = BizState.Get(player, bizId)
	return loaded or pseudo(player, bizId, rec), rec, loaded
end

local function setLotAttributes(biz)
	local lot = biz.Lot
	local part = lot and lot.Part
	if not part or not part.Parent then
		return
	end
	local rec = BizState.RecOf(biz)
	part:SetAttribute("Occupied", true)
	part:SetAttribute("OwnerUserId", biz.Owner.UserId)
	part:SetAttribute("OwnerName", biz.Owner.DisplayName)
	part:SetAttribute("BizId", biz.Id)
	part:SetAttribute("BizKey", biz.Key)
	part:SetAttribute("BizName", BizState.DisplayName(rec, biz.Owner))
	part:SetAttribute("BizType", biz.TypeId)
	part:SetAttribute("Open", rec ~= nil and rec.Open == true)
	part:SetAttribute("CustomersPerMinute", math.floor((biz.CPM or 0) * 10 + 0.5) / 10)
end

local function clearLotAttributes(lot)
	local part = lot.Part
	if not part or not part.Parent then
		return
	end
	part:SetAttribute("Occupied", false)
	part:SetAttribute("OwnerUserId", nil)
	part:SetAttribute("OwnerName", nil)
	part:SetAttribute("BizId", nil)
	part:SetAttribute("BizKey", nil)
	part:SetAttribute("BizName", nil)
	part:SetAttribute("BizType", nil)
	part:SetAttribute("Open", false)
	part:SetAttribute("CustomersPerMinute", 0)
end

local function refreshVisuals(biz)
	if biz.Lot then
		setLotAttributes(biz)
		Lots.UpdateSign(biz.Lot)
	end
	Stations.RefreshPrompts(biz)
	Staff.RefreshAttributes(biz)
	if biz.Ctx then
		biz.Ctx.Label = BizState.DisplayName(BizState.RecOf(biz), biz.Owner)
	end
end

local function refreshBuildLimits(biz)
	local rec = BizState.RecOf(biz)
	if not rec or not biz.Ctx then
		return
	end
	biz.Ctx.MaxItems = BizMath.MaxItems(rec)
	biz.Ctx.Floors = BizMath.Floors(rec)
	if BuildService then
		BuildService:RefreshContext(biz.Key)
	end
end

local function phone(player: Player, from: string, text: string)
	local ps = Registry.Find("PhoneService")
	if ps and ps.SendSystemMessage then
		task.spawn(function()
			pcall(ps.SendSystemMessage, ps, player, from, text)
		end)
	end
end

local function filterName(text: string, player: Player): string?
	local mod = Registry.Find("ModerationService")
	if mod and mod.FilterText then
		local ok, res = pcall(mod.FilterText, mod, text, player)
		if ok then
			return res
		end
		return nil
	end
	local ok, res = pcall(function()
		local result = TextService:FilterStringAsync(text, player.UserId, Enum.TextFilterContext.PublicChat)
		return result:GetNonChatStringForBroadcastAsync()
	end)
	if ok and type(res) == "string" then
		return res
	end
	return nil
end

local function shopData(biz)
	local rec = BizState.RecOf(biz)
	local t = BizState.TypeOf(biz)
	local products = {}
	if rec and t then
		local stock = math.floor(tonumber(rec.Stock) or 0)
		for _, p in ipairs(t.Products) do
			if not p.NpcOnly then
				table.insert(products, {
					Id = p.Id,
					Name = p.Name,
					Icon = p.Icon,
					Kind = p.Kind,
					Price = BizMath.PriceOf(rec, p),
					InStock = (p.Stock or 0) <= stock,
				})
			end
		end
	end
	return {
		Key = biz.Key,
		BizName = BizState.DisplayName(rec, biz.Owner),
		OwnerName = biz.Owner.DisplayName,
		TypeId = biz.TypeId,
		Open = rec ~= nil and rec.Open == true,
		Products = products,
	}
end

local function newRecord(player: Player, typeId: string, lot, price: number)
	local t = Config.Types[typeId]
	return {
		TypeId = typeId,
		LotId = lot.Id,
		Name = player.DisplayName .. "'s " .. t.Name,
		Value = price,
		Level = 1,
		Upgrades = {},
		Prices = {},
		Staff = {},
		Stock = t.StartStock,
		Vault = 0,
		Build = Shell.StarterBuild(typeId, lot.Size, 1),
		Open = false,
		Lifetime = 0,
		Employees = {},
		Stats = { Day = BizState.Today(), Customers = 0, Revenue = 0, HourStart = os.time(), HourEarned = 0, History = {} },
		CreatedAt = os.time(),
	}
end

---------------------------------------------------------------------------
-- Load / unload onto lots
---------------------------------------------------------------------------
local onStationPrompt

local function markUnplaced(owner: Player, bizId: string, value: boolean)
	local set = unplaced[owner]
	if value then
		if not set then
			set = {}
			unplaced[owner] = set
		end
		set[bizId] = true
	elseif set then
		set[bizId] = nil
		if next(set) == nil then
			unplaced[owner] = nil
		end
	end
end

local function loadBusiness(owner: Player, bizId: string, forcedLot)
	local existing = BizState.Get(owner, bizId)
	if existing then
		return existing
	end
	local rec = BizState.Rec(owner, bizId)
	local t = rec and Config.Types[rec.TypeId]
	if not rec or not t then
		return nil
	end
	local lot = forcedLot or Lots.FindFree(rec.TypeId, rec.LotId)
	if not lot or lot.Biz then
		markUnplaced(owner, bizId, true)
		BizState.Notify(owner, ("No free lot for %s in this server right now — it'll open as soon as one frees up."):format(BizState.DisplayName(rec, owner)), "warning", 6)
		return nil
	end
	markUnplaced(owner, bizId, false)

	local root = Lots.Root(lot)
	local buildFolder = Instance.new("Folder")
	buildFolder.Name = "Build"
	buildFolder.Parent = root

	local biz = {
		Key = BizState.Key(owner, bizId),
		Id = bizId,
		Owner = owner,
		TypeId = rec.TypeId,
		Lot = lot,
		Folder = root,
		BuildFolder = buildFolder,
		Maid = Maid.new(),
		Carry = 0,
		BaseCarry = 0,
		WageCarry = 0,
		CPM = 0,
		Stations = {},
		DecorCount = 0,
		TickRevenue = 0,
		LastRevenue = 0,
		Warned = {},
	}
	lot.Biz = biz
	BizState.Loaded[biz.Key] = biz
	BizState.ByOwner[owner] = BizState.ByOwner[owner] or {}
	BizState.ByOwner[owner][bizId] = biz

	local shell = Shell.PlaceAsset(rec.TypeId, root, lot.Origin)
	if shell then
		biz.Maid:Give(shell)
	end
	if rec.LotId ~= lot.Id then
		BizState.Set(biz, "LotId", lot.Id)
	end
	if type(rec.Build) ~= "table" then
		BizState.Set(biz, "Build", Shell.StarterBuild(rec.TypeId, lot.Size, BizMath.Floors(rec)))
	end

	local ctx = {
		Owner = owner,
		Origin = lot.Origin,
		Size = lot.Size,
		DataPath = BizState.Path(bizId, "Build"),
		Catalog = "Business",
		MaxItems = BizMath.MaxItems(rec),
		Floors = BizMath.Floors(rec),
		Folder = buildFolder,
		Label = BizState.DisplayName(rec, owner),
		CanBuild = function(p: Player)
			return p == owner
		end,
		OnItemsChanged = function(delta: number)
			if type(delta) == "number" and delta == delta and delta ~= 0 then
				local now = BizState.Rec(owner, bizId)
				if now then
					local value = math.max(1, math.floor((tonumber(now.Value) or 0) + delta))
					DataService:Set(owner, BizState.Path(bizId, "Value"), value)
				end
			end
		end,
	}
	biz.Ctx = ctx
	if BuildService then
		local ok, err = pcall(function()
			BuildService:RegisterContext(biz.Key, ctx)
			BuildService:LoadBuild(biz.Key)
		end)
		if not ok then
			warn("[Business] build context failed for", biz.Key, err)
		end
	end
	Stations.Watch(biz, onStationPrompt)
	setLotAttributes(biz)
	Lots.UpdateSign(lot)
	Staff.OnBizLoaded(biz)
	return biz
end

local placeUnplaced

local function unloadBusiness(biz)
	if BizState.Loaded[biz.Key] ~= biz then
		return
	end
	BizState.Loaded[biz.Key] = nil
	local map = BizState.ByOwner[biz.Owner]
	if map then
		map[biz.Id] = nil
		if next(map) == nil then
			BizState.ByOwner[biz.Owner] = nil
		end
	end
	if BuildService then
		pcall(BuildService.UnregisterContext, BuildService, biz.Key)
	end
	Staff.OnBizUnloaded(biz)
	biz.Maid:Clean()
	if biz.BuildFolder then
		biz.BuildFolder:Destroy()
	end
	lastSaleNotify[biz.Key] = nil
	local lot = biz.Lot
	if lot and lot.Biz == biz then
		lot.Biz = nil
		clearLotAttributes(lot)
		Lots.UpdateSign(lot)
	end
	task.defer(placeUnplaced)
end

local function loadAll(player: Player)
	if not Lots.Ready() then
		pendingOwners[player] = true
		return
	end
	local ids = {}
	for bizId, rec in pairs(businessesOf(player)) do
		if type(rec) == "table" then
			table.insert(ids, bizId)
		end
	end
	table.sort(ids)
	for _, bizId in ipairs(ids) do
		loadBusiness(player, bizId)
	end
end

local function unloadAll(player: Player)
	local map = BizState.ByOwner[player]
	if map then
		local list = {}
		for _, biz in pairs(map) do
			table.insert(list, biz)
		end
		for _, biz in ipairs(list) do
			unloadBusiness(biz)
		end
	end
	unplaced[player] = nil
	pendingOwners[player] = nil
end

placeUnplaced = function()
	for owner, set in pairs(unplaced) do
		if owner.Parent == Players and DataService:IsLoaded(owner) then
			for bizId in pairs(table.clone(set)) do
				local rec = BizState.Rec(owner, bizId)
				if not rec then
					set[bizId] = nil
				elseif Lots.FindFree(rec.TypeId, rec.LotId) then
					local biz = loadBusiness(owner, bizId)
					if biz then
						BizState.Notify(owner, ("%s is now set up on lot %s."):format(BizState.DisplayName(rec, owner), biz.Lot.Id), "success")
					end
				end
			end
		else
			unplaced[owner] = nil
		end
	end
end

---------------------------------------------------------------------------
-- Prompts
---------------------------------------------------------------------------
onStationPrompt = function(player: Player, biz, _model)
	if BizState.Loaded[biz.Key] ~= biz then
		return
	end
	if player == biz.Owner then
		NotifyService:OpenUI(player, "Business", { BizId = biz.Id })
		return
	end
	local rec = BizState.RecOf(biz)
	if not rec or rec.Open ~= true then
		BizState.Notify(player, ("%s is closed right now."):format(BizState.DisplayName(rec, biz.Owner)), "info")
		return
	end
	NotifyService:OpenUI(player, "BusinessShop", shopData(biz))
end

local function onLotPrompt(player: Player, lot)
	local biz = lot.Biz
	if biz then
		if player == biz.Owner then
			NotifyService:OpenUI(player, "Business", { BizId = biz.Id })
			return
		end
		local rec = BizState.RecOf(biz)
		local open = rec and rec.Open == true
		BizState.Notify(
			player,
			("%s by %s is %s."):format(
				BizState.DisplayName(rec, biz.Owner),
				biz.Owner.DisplayName,
				open and "OPEN — walk inside to the counter to shop" or "closed right now"
			),
			"info",
			5
		)
		return
	end
	NotifyService:OpenUI(player, "Business", { LotId = lot.Id })
end

---------------------------------------------------------------------------
-- State for the dashboard
---------------------------------------------------------------------------
local function describe(player: Player, bizId: string, rec, env)
	local biz = BizState.Get(player, bizId)
	local subject = biz or pseudo(player, bizId, rec)
	local level = BizMath.Level(rec)
	local nextLevel = Config.Levels.List[level + 1]
	local info = {
		Loaded = biz ~= nil,
		LotId = biz and biz.Lot.Id or rec.LotId,
		Position = biz and biz.Lot.Origin.Position or nil,
		CPM = biz and biz.CPM or 0,
		PreviewCPM = biz and Income.Preview(biz, table.clone(env)) or 0,
		Stations = biz and biz.Stations or {},
		Missing = biz and Stations.Missing(biz) or {},
		DecorCount = biz and biz.DecorCount or 0,
		Employees = Staff.List(subject),
		MaxStock = BizMath.MaxStock(rec),
		VaultCap = BizMath.VaultCap(rec),
		MaxStaff = BizMath.MaxStaff(rec),
		StaffCount = BizMath.StaffCount(rec),
		Level = level,
		NextLevelAt = nextLevel and nextLevel.Lifetime or nil,
		Floors = BizMath.Floors(rec),
		MaxItems = BizMath.MaxItems(rec),
		HourRoom = biz and Ledger.HourRoom(biz) or G.MaxPassivePerHour,
		SellValue = math.floor((tonumber(rec.Value) or 0) * EconomyConfig.ResaleFraction),
		ContextId = biz and biz.Key or nil,
	}
	return info
end

---------------------------------------------------------------------------
-- Remote actions
---------------------------------------------------------------------------
local actions = {}

function actions.GetState(player: Player)
	if not DataService:IsLoaded(player) then
		return fail("Still loading")
	end
	local env = Income.Env()
	local out = {}
	for bizId, rec in pairs(businessesOf(player)) do
		if type(rec) == "table" and Config.Types[rec.TypeId] then
			out[bizId] = describe(player, bizId, rec, env)
		end
	end
	local employer = nil
	local empBiz = BizState.EmployeeOf[player.UserId]
	if empBiz and BizState.Loaded[empBiz.Key] == empBiz then
		local rec = BizState.RecOf(empBiz)
		local entry = rec and type(rec.Employees) == "table" and rec.Employees[tostring(player.UserId)]
		if entry then
			employer = {
				BizName = BizState.DisplayName(rec, empBiz.Owner),
				OwnerName = empBiz.Owner.DisplayName,
				TypeId = empBiz.TypeId,
				Role = entry.Role,
				Wage = entry.Wage,
				LotId = empBiz.Lot.Id,
				Position = empBiz.Lot.Origin.Position,
				Open = rec.Open == true,
			}
		end
	end
	return { ok = true, Businesses = out, Max = G.MaxPerPlayer, Employer = employer, Clock = env.Clock }
end

function actions.GetLots(_player: Player)
	local list = {}
	for _, lot in ipairs(Lots.List()) do
		local allowed = {}
		for _, id in ipairs(Config.TypeOrder) do
			if Lots.Allows(lot, id) then
				table.insert(allowed, id)
			end
		end
		local biz = lot.Biz
		local rec = biz and BizState.RecOf(biz)
		table.insert(list, {
			LotId = lot.Id,
			Position = lot.Origin.Position,
			Size = Vector2.new(lot.Size.X, lot.Size.Z),
			Allowed = allowed,
			Free = biz == nil,
			BizName = biz and BizState.DisplayName(rec, biz.Owner) or nil,
			OwnerName = biz and biz.Owner.DisplayName or nil,
			TypeId = biz and biz.TypeId or nil,
			Open = rec ~= nil and rec.Open == true,
		})
	end
	return { ok = true, Lots = list, Ready = Lots.Ready() }
end

function actions.BuyLot(player: Player, payload)
	if not Lots.Ready() then
		return fail("Business lots are still loading — try again in a moment")
	end
	local typeId = Guard.OneOf(payload.TypeId, Config.Types)
	local lotId = Guard.Id(payload.LotId, 32)
	local lot = lotId and Lots.Find(lotId)
	if not typeId or not lot then
		return fail("Pick a business type and a lot")
	end
	local t = Config.Types[typeId]
	if lot.Biz or lot.Reserved then
		return fail("That lot is already taken")
	end
	if not Lots.Allows(lot, typeId) then
		return fail(("A %s can't be built on this lot"):format(t.Name))
	end
	if countBusinesses(player) >= G.MaxPerPlayer then
		return fail(("You can own up to %d businesses"):format(G.MaxPerPlayer))
	end
	if buying[player] then
		return fail("Please wait…")
	end
	buying[player] = true
	lot.Reserved = true
	local charged = 0
	local created = false
	local ok, res = pcall(function()
		local price = EconomyService:GetPrice(player, t.LotPrice, "Business")
		if price <= 0 or not EconomyService:TrySpend(player, price, "Buy:Business:" .. typeId) then
			return fail(("You need %s cash to buy this lot"):format(Format.Money(price)))
		end
		charged = price
		local n = math.max(1, math.floor(tonumber(DataService:Get(player, "NextBusinessNumber")) or 1))
		local bizId = "b_" .. n
		while BizState.Rec(player, bizId) do
			n += 1
			bizId = "b_" .. n
		end
		DataService:Set(player, "NextBusinessNumber", n + 1)
		DataService:Set(player, "Businesses." .. bizId, newRecord(player, typeId, lot, price))
		created = true
		lot.Reserved = nil
		local biz = loadBusiness(player, bizId, lot)
		BizState.Notify(player, ("🎉 You bought a %s %s! Decorate it, then open for business."):format(t.Icon, t.Name), "success", 6)
		phone(player, "Skyline Business Bureau", ("Congratulations on your new %s on lot %s! Build at least: %s."):format(t.Name, lot.Id, (function()
			local parts = {}
			for fn, c in pairs(t.Required) do
				table.insert(parts, ("%d× %s"):format(c, Config.FunctionNames[fn] or fn))
			end
			table.sort(parts)
			return table.concat(parts, ", ")
		end)()))
		return { ok = true, BizId = bizId, Loaded = biz ~= nil }
	end)
	lot.Reserved = nil
	buying[player] = nil
	if not ok then
		warn("[Business] BuyLot error:", res)
		if charged > 0 and not created then
			EconomyService:AddCash(player, charged, "Refund:Business:" .. typeId)
		end
		return fail("Something went wrong")
	end
	return res
end

function actions.Rename(player: Player, payload)
	local biz, rec = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	local raw = Guard.String(payload.Name, 120)
	if not raw then
		return fail("Invalid name")
	end
	local name = raw:gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s+", " ")
	local len = utf8.len(name) or 0
	if len < G.NameMinLength or len > G.NameMaxLength then
		return fail(("Names must be %d-%d characters"):format(G.NameMinLength, G.NameMaxLength))
	end
	local filtered = filterName(name, player)
	if not filtered or filtered == "" then
		return fail("That name couldn't be checked — try another")
	end
	BizState.Set(biz, "Name", filtered)
	local loaded = BizState.Get(player, biz.Id)
	if loaded then
		refreshVisuals(loaded)
	end
	return { ok = true, Name = filtered }
end

function actions.SetPrice(player: Player, payload)
	local biz, rec = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	local t = Config.Types[rec.TypeId]
	local productId = Guard.Id(payload.ProductId, 32)
	local product = productId and t.ProductById[productId]
	if not product then
		return fail("Unknown product")
	end
	local lo, hi = Config.PriceBounds(rec.TypeId, product.Id)
	local price = Guard.Int(payload.Price, lo :: number, hi :: number)
	if not price then
		return fail(("Price must be $%d - $%d"):format(lo :: number, hi :: number))
	end
	BizState.Set(biz, "Prices." .. product.Id, price ~= product.Price and price or nil)
	return { ok = true, Price = price }
end

function actions.BuyStock(player: Player, payload)
	local biz, rec = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	local t = Config.Types[rec.TypeId]
	local amount = Guard.Int(payload.Amount, 1, 10_000_000)
	if not amount then
		return fail("Invalid amount")
	end
	local stock = math.max(0, math.floor(tonumber(rec.Stock) or 0))
	local space = BizMath.MaxStock(rec) - stock
	if space <= 0 then
		return fail("Your storage is full — upgrade the Storage Room for more")
	end
	amount = math.min(amount, space)
	local cost = math.max(1, math.ceil(amount * t.StockUnitCost))
	if not EconomyService:TrySpend(player, cost, "BizStock:" .. rec.TypeId) then
		return fail(("You need %s cash for that much stock"):format(Format.Money(cost)))
	end
	BizState.Set(biz, "Stock", stock + amount)
	return { ok = true, Amount = amount, Cost = cost }
end

function actions.Upgrade(player: Player, payload)
	local biz, rec, loaded = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	local upgradeId = Guard.Id(payload.UpgradeId, 32)
	if not upgradeId or not Config.UpgradeAllowed(rec.TypeId, upgradeId) then
		return fail("Unknown upgrade")
	end
	local level = math.floor(tonumber(type(rec.Upgrades) == "table" and rec.Upgrades[upgradeId] or 0) or 0)
	local price = Config.UpgradePrice(rec.TypeId, upgradeId, level + 1)
	if not price then
		return fail("Already at max level")
	end
	if not EconomyService:TrySpend(player, price, "BizUpgrade:" .. upgradeId) then
		return fail(("You need %s cash"):format(Format.Money(price)))
	end
	BizState.Set(biz, "Upgrades." .. upgradeId, level + 1)
	BizState.Set(biz, "Value", math.floor((tonumber(rec.Value) or 0) + price * G.UpgradeValueFraction))
	if loaded then
		refreshBuildLimits(loaded)
	end
	return { ok = true, Level = level + 1 }
end

function actions.HireNPC(player: Player, payload)
	local biz, rec = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	local role = Guard.OneOf(payload.Role, Config.Roles)
	if not role then
		return fail("Unknown role")
	end
	return Staff.HireNPC(player, biz, role)
end

function actions.FireNPC(player: Player, payload)
	local biz, rec = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	local role = Guard.OneOf(payload.Role, Config.Roles)
	if not role then
		return fail("Unknown role")
	end
	return Staff.FireNPC(player, biz, role)
end

function actions.Open(player: Player, payload)
	local biz, rec, loaded = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	if not loaded then
		return fail("This business has no lot in this server yet")
	end
	if rec.Open == true then
		return { ok = true }
	end
	Stations.Scan(loaded)
	local missing = Stations.Missing(loaded)
	if #missing > 0 then
		local names = {}
		for _, m in ipairs(missing) do
			table.insert(names, ("%s (%d/%d)"):format(Config.FunctionNames[m.Function] or m.Function, m.Have, m.Need))
		end
		return fail("Build these first: " .. table.concat(names, ", "))
	end
	BizState.Set(loaded, "Open", true)
	loaded.CPM = Income.Preview(loaded)
	refreshVisuals(loaded)
	return { ok = true, CPM = loaded.CPM }
end

function actions.Close(player: Player, payload)
	local biz, rec, loaded = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	BizState.Set(biz, "Open", false)
	if loaded then
		loaded.CPM = 0
		refreshVisuals(loaded)
	end
	return { ok = true }
end

function actions.OpenBuildMode(player: Player, payload)
	local biz, rec, loaded = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	if not loaded then
		return fail("This business has no lot in this server yet")
	end
	if not BuildService or not BuildService:GetContext(loaded.Key) then
		return fail("Build mode is unavailable right now")
	end
	local lot = loaded.Lot
	local reach = math.max(lot.Size.X, lot.Size.Z) / 2 + G.BuildModeDistance
	if not Guard.Near(player, lot.Origin.Position, reach) then
		return fail("Go to your business to decorate it")
	end
	return { ok = true, ContextId = loaded.Key }
end

function actions.CollectVault(player: Player, payload)
	local biz, rec, loaded = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	if G.CollectRequiresNearby then
		local lot = loaded and loaded.Lot
		if not lot or not Guard.Near(player, lot.Origin.Position, math.max(lot.Size.X, lot.Size.Z) / 2 + G.NearLotDistance) then
			return fail("Go to your business to collect the vault")
		end
	end
	local amount = math.floor(tonumber(rec.Vault) or 0)
	if amount <= 0 then
		return fail("The vault is empty")
	end
	BizState.Set(biz, "Vault", 0)
	if not EconomyService:AddCash(player, amount, "Business:" .. rec.TypeId) then
		BizState.Set(biz, "Vault", amount)
		return fail("Your wallet is full")
	end
	return { ok = true, Amount = amount }
end

function actions.SellBusiness(player: Player, payload)
	local biz, rec, loaded = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	local t = Config.Types[rec.TypeId]
	local value = math.floor((tonumber(rec.Value) or 0) * EconomyConfig.ResaleFraction)
	local vault = math.max(0, math.floor(tonumber(rec.Vault) or 0))
	local stockRefund = math.floor(math.max(0, tonumber(rec.Stock) or 0) * t.StockUnitCost * G.StockRefundFraction)
	local payout = value + vault + stockRefund
	local name = BizState.DisplayName(rec, player)
	if loaded then
		-- tell employees before they lose the job
		for userId, b in pairs(BizState.EmployeeOf) do
			if b == loaded then
				local p = Players:GetPlayerByUserId(userId)
				if p then
					BizState.Notify(p, ("%s was sold — your job there has ended."):format(name), "warning", 6)
				end
			end
		end
		unloadBusiness(loaded)
	end
	markUnplaced(player, biz.Id, false)
	DataService:Set(player, BizState.Path(biz.Id), nil)
	if payout > 0 then
		EconomyService:AddCash(player, payout, "Sell:Business:" .. rec.TypeId)
	end
	return { ok = true, Payout = payout }
end

function actions.HirePlayer(player: Player, payload)
	local biz, rec, loaded = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	if not loaded then
		return fail("Your business needs a lot in this server first")
	end
	local userId = Staff.UserId(payload.UserId)
	local role = Guard.OneOf(payload.Role, Config.Roles)
	local def = role and Config.Roles[role]
	local wage = def and Guard.Int(payload.Wage, def.Wage.Min, def.Wage.Max)
	if not userId or not role then
		return fail("Pick a player and a role")
	end
	if not wage then
		return fail(("Wage must be $%d - $%d per task"):format(def.Wage.Min, def.Wage.Max))
	end
	return Staff.Offer(player, loaded, userId, role, wage)
end

function actions.FireEmployee(player: Player, payload)
	local biz, rec = owned(player, payload)
	if not biz then
		return fail(rec)
	end
	local userId = Staff.UserId(payload.UserId)
	if not userId then
		return fail("Unknown employee")
	end
	return Staff.FireEmployee(player, biz, userId)
end

function actions.AcceptJob(player: Player, payload)
	local offerId = Guard.Id(payload.OfferId, 24)
	if not offerId then
		return fail("Invalid offer")
	end
	return Staff.Accept(player, offerId)
end

function actions.DeclineJob(player: Player, payload)
	local offerId = Guard.Id(payload.OfferId, 24)
	if not offerId then
		return fail("Invalid offer")
	end
	return Staff.Decline(player, offerId)
end

function actions.QuitJob(player: Player)
	return Staff.Quit(player)
end

function actions.WorkTask(player: Player)
	return Staff.WorkTask(player)
end

function actions.GetShop(player: Player, payload)
	local key = Guard.Id(payload.Key, 64)
	local biz = key and BizState.Loaded[key]
	if not biz then
		return fail("This business isn't here any more")
	end
	if not Stations.NearAny(player, biz, BizState.TypeOf(biz).ShopFunctions, G.ShopDistance + 10) then
		return fail("Walk up to the counter")
	end
	local data = shopData(biz)
	data.ok = true
	return data
end

function actions.BuyProduct(player: Player, payload)
	local key = Guard.Id(payload.Key, 64)
	local biz = key and BizState.Loaded[key]
	if not biz then
		return fail("This business isn't here any more")
	end
	if biz.Owner == player then
		return fail("You can't buy from your own business")
	end
	local rec = BizState.RecOf(biz)
	local t = BizState.TypeOf(biz)
	if not rec or not t or rec.Open ~= true then
		return fail("This business is closed")
	end
	local productId = Guard.Id(payload.ProductId, 32)
	local product = productId and t.ProductById[productId]
	if not product or product.NpcOnly then
		return fail("That isn't for sale")
	end
	if not Stations.NearAny(player, biz, t.ShopFunctions, G.ShopDistance) then
		return fail("Walk up to the counter")
	end
	local stock = math.max(0, math.floor(tonumber(rec.Stock) or 0))
	local units = product.Stock or 0
	if units > stock then
		return fail("Sold out — tell the owner to restock!")
	end
	local price = BizMath.PriceOf(rec, product)
	if not EconomyService:TrySpend(player, price, "BizBuy:" .. biz.TypeId .. ":" .. product.Id) then
		return fail("Not enough cash")
	end
	if units > 0 then
		BizState.Set(biz, "Stock", stock - units)
	end
	Ledger.Credit(biz, price, 1, "Sale")

	if type(product.Inventory) == "string" then
		DataService:Increment(player, "Inventory." .. product.Inventory, 1)
	end
	if type(product.Heal) == "number" and product.Heal > 0 then
		local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 then
			hum.Health = math.min(hum.MaxHealth, hum.Health + product.Heal)
		end
	end
	local now = os.clock()
	if not lastSaleNotify[biz.Key] or now - lastSaleNotify[biz.Key] > 6 then
		lastSaleNotify[biz.Key] = now
		BizState.Notify(biz.Owner, ("🛒 %s bought %s %s for %s"):format(player.DisplayName, product.Icon, product.Name, Format.Money(price)), "money", 3)
	end
	return { ok = true, Item = product.Name, Icon = product.Icon, Price = price, Kind = product.Kind }
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function BusinessService:GetEmployer(p: Player): (Player?, string?)
	return Staff.GetEmployer(p)
end

function BusinessService:GetBusinesses(p: Player)
	local out = {}
	for bizId, rec in pairs(businessesOf(p)) do
		if type(rec) == "table" then
			local biz = BizState.Get(p, bizId)
			out[bizId] = {
				TypeId = rec.TypeId,
				Name = BizState.DisplayName(rec, p),
				LotId = biz and biz.Lot.Id or nil,
				Loaded = biz ~= nil,
				Open = rec.Open == true,
			}
		end
	end
	return out
end

function BusinessService:GetLoaded(p: Player, bizId: string)
	return BizState.Get(p, bizId)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function BusinessService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	BizState.Deps.DataService = DataService
	BizState.Deps.EconomyService = EconomyService
	BizState.Deps.NotifyService = NotifyService

	Ledger.OnLevelUp = function(biz, level)
		local rec = BizState.RecOf(biz)
		BizState.Notify(biz.Owner, ("⭐ %s reached level %d! More staff, vault space and build slots unlocked."):format(BizState.DisplayName(rec, biz.Owner), level), "success", 6)
		if BizState.Loaded[biz.Key] == biz then
			refreshBuildLimits(biz)
		end
	end
	Income.OnClosed = function(biz)
		if BizState.Loaded[biz.Key] == biz then
			refreshVisuals(biz)
		end
	end
	Lots.SetPromptHandler(onLotPrompt)

	Net.HandleActions("Business", actions, {
		rate = 6,
		burst = 14,
		perAction = {
			BuyLot = { rate = 0.5, burst = 2 },
			Rename = { rate = 0.2, burst = 2 },
			SellBusiness = { rate = 0.2, burst = 1 },
			HirePlayer = { rate = 0.3, burst = 2 },
			WorkTask = { rate = 1, burst = 2 },
			BuyProduct = { rate = 2, burst = 4 },
			SetPrice = { rate = 4, burst = 10 },
			GetState = { rate = 2, burst = 4 },
			GetLots = { rate = 1, burst = 3 },
		},
	})
end

function BusinessService:Start()
	BuildService = Registry.Find("BuildService")
	BizState.Deps.BuildService = BuildService
	if not BuildService then
		warn("[Business] BuildService missing — businesses can't be decorated or opened")
	end

	Players.PlayerAdded:Connect(function(player)
		Staff.OnPlayerAdded(player)
	end)
	for _, player in ipairs(Players:GetPlayers()) do
		Staff.OnPlayerAdded(player)
	end
	Players.PlayerRemoving:Connect(function(player)
		unloadAll(player)
		Staff.OnPlayerRemoving(player)
		buying[player] = nil
	end)
	-- synchronous: take businesses off their lots before the final save
	DataService.Releasing:Connect(function(player)
		unloadAll(player)
	end)
	DataService:OnLoaded(function(player)
		loadAll(player)
	end)

	task.spawn(function()
		Lots.Start(function()
			if Lots.Ready() then
				placeUnplaced()
			end
		end)
		for player in pairs(table.clone(pendingOwners)) do
			pendingOwners[player] = nil
			if player.Parent == Players and DataService:IsLoaded(player) then
				loadAll(player)
			end
		end
	end)

	-- passive income: one batched tick for all businesses
	task.spawn(function()
		local last = os.clock()
		while true do
			task.wait(G.TickSeconds)
			local now = os.clock()
			local dt = math.clamp(now - last, 0, G.TickSeconds * 2)
			last = now
			Income.Tick(dt)
		end
	end)
end

return BusinessService
