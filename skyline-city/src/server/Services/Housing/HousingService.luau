-- HousingService: homes, rent, plots, doors, keys, visiting.
--
-- CONTRACT (ARCHITECTURE §5)
--   HousingService:GetActivePlot(p) -> plotPart?
--   HousingService:GetHome(p) -> { HouseId?, TierId, Plot }
--   HousingService:CanEnter(p, plotPart) -> boolean
--   HousingService:GrantHouse(p, tierId, opts) -> houseId?
--       opts = { Value?, Name?, Build?, Floors?, SetActive?, IgnoreSlots? }
-- Extra API (used by RealEstateService):
--   :RemoveHouse(p, houseId, reason) -> record?     :RestoreHouse(p, houseId, record)
--   :GetSlotInfo(p) -> (used, limit)                 :HasRentDebt(p) -> boolean
--   :AddGuestKey(owner, houseId, userId) / :RemoveGuestKey(owner, houseId, userId)   (in-memory, tenants)
--   :Teleport(p, cframe)                             :GetHomeEntrance(owner) -> CFrame?
--   .HomeChanged(p, home) · .HouseRemoved(p, houseId, reason) · .WeekTick(week)
--
-- Remote "Housing": GetState, GetVisitable, BuyHouse, RentTier, StopRenting, PayRent, SetActiveHouse, SellHouse,
--   RenameHouse, LockDoors, GiveKey, RevokeKey, AllowBuild, DisallowBuild, Visit, GoHome, AddFloor

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local TextService = game:GetService("TextService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Maid = require(Shared.Util.Maid)
local Table = require(Shared.Util.Table)
local Format = require(Shared.Util.Format)
local HousingConfig = require(Shared.Config.Housing)
local EconomyConfig = require(Shared.Config.Economy)
local BuildMath = require(Shared.Build.BuildMath)
local Serializer = require(Shared.Build.Serializer)

local Server = ServerScriptService.Server
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local PlotManager = require(script.Parent.PlotManager)
local HouseShell = require(script.Parent.HouseShell)
local Interactables = require(script.Parent.Interactables)

local HousingService = {
	Name = "HousingService",
	Priority = 45,
}

HousingService.HomeChanged = Signal.new()
HousingService.HouseRemoved = Signal.new()
HousingService.WeekTick = Signal.new()

local TIERS = HousingConfig.Tiers
local FH = HousingConfig.Build.FloorHeight
local RENT = HousingConfig.Rent

local DataService, EconomyService, NotifyService, BuildService

type Home = {
	Player: Player,
	HouseId: string,
	TierId: string,
	Tier: any,
	Plot: any,
	Origin: CFrame,
	Size: Vector3,
	Floors: number,
	ContextId: string,
	Folder: Folder,
	Shell: Model?,
	Sign: BasePart?,
	Ctx: any,
	Maid: any,
	SpawnCFrame: CFrame,
	EjectCFrame: CFrame,
}

local homes: { [Player]: Home } = {}
local guestKeys: { [Player]: { [string]: { [string]: boolean } } } = {}
local spawnedOnce: { [Player]: boolean } = {}
local lastTeleport: { [Player]: number } = {}
local sessionStart: { [Player]: number } = {}
local homesFolder: Folder

---------------------------------------------------------------------------
-- Small helpers
---------------------------------------------------------------------------
local function notify(player: Player, text: string, kind: string?)
	NotifyService:Send(player, text, kind or "info")
end

local function phone(player: Player, text: string)
	local ps = Registry.Find("PhoneService")
	if ps and ps.SendSystemMessage then
		task.spawn(function()
			pcall(ps.SendSystemMessage, ps, player, RENT.SenderName, text)
		end)
	end
end

local function hasPass(player: Player, key: string): boolean
	local mon = Registry.Find("MonetizationService")
	if mon and mon.HasPass then
		local ok, res = pcall(mon.HasPass, mon, player, key)
		if ok then
			return res == true
		end
	end
	return player:GetAttribute("Pass_" .. key) == true
end

local function uidKey(userId: number): string
	return tostring(math.floor(userId))
end

local function housing(player: Player)
	local h = DataService:Get(player, "Housing")
	if type(h) ~= "table" then
		return nil
	end
	return h
end

local function recordPath(houseId: string): string
	if houseId == "" then
		return "Housing.Rented"
	end
	return "Housing.Owned." .. houseId
end

local function getRecord(player: Player, houseId: string)
	local h = housing(player)
	if not h then
		return nil
	end
	if houseId == "" then
		return type(h.Rented) == "table" and h.Rented or nil
	end
	local owned = type(h.Owned) == "table" and h.Owned or {}
	local rec = owned[houseId]
	return type(rec) == "table" and rec or nil
end

local function tierName(tierId: string): string
	local t = TIERS[tierId]
	return t and t.Name or tierId
end

local function houseName(player: Player, rec, tierId: string): string
	if rec and type(rec.Name) == "string" and rec.Name ~= "" then
		return rec.Name
	end
	return HousingConfig.Names.Default:format(player.DisplayName, tierName(tierId))
end

local function ownedCount(player: Player): number
	local h = housing(player)
	if not h or type(h.Owned) ~= "table" then
		return 0
	end
	local n = 0
	for _, rec in pairs(h.Owned) do
		if type(rec) == "table" then
			n += 1
		end
	end
	return n
end

local function slotLimit(player: Player): number
	local h = housing(player)
	local extra = h and tonumber(h.ExtraSlots) or 0
	local limit = HousingConfig.Slots.Base + math.max(0, extra)
	if hasPass(player, "ExtraHouse") then
		limit += HousingConfig.Slots.ExtraHousePassSlots
	end
	return math.min(limit, HousingConfig.Slots.MaxTotal)
end

local function maxFloorsFor(player: Player, tier): number
	local n = tier.MaxFloors or 1
	if hasPass(player, "ExtraHouse") then
		n += HousingConfig.Floors.ExtraHousePassBonus
	end
	return math.max(1, n)
end

local function maxItemsFor(tier, floors: number): number
	return math.floor(tier.BaseMaxItems * (1 + HousingConfig.Build.ExtraItemsPerFloor * (math.max(1, floors) - 1)))
end

local function spend(player: Player, amount: number, reason: string): boolean
	if amount <= 0 then
		return true
	end
	if HousingConfig.Purchase.AllowBank then
		return EconomyService:Charge(player, amount, reason)
	end
	return EconomyService:TrySpend(player, amount, reason)
end

local function rentDebt(player: Player): number
	local rec = getRecord(player, "")
	if not rec then
		return 0
	end
	local missed = tonumber(rec.MissedPayments) or 0
	local tier = TIERS[rec.TierId]
	if missed <= 0 or not tier then
		return 0
	end
	return missed * tier.WeeklyRent
end

local function saveSoon(player: Player)
	task.spawn(function()
		DataService:SaveNow(player)
	end)
end

local function filterName(player: Player, text: string): string?
	local mod = Registry.Find("ModerationService")
	if mod and mod.FilterText then
		local ok, res = pcall(mod.FilterText, mod, text, player)
		if ok then
			return res
		end
		return nil
	end
	local ok, result = pcall(function()
		local filtered = TextService:FilterStringAsync(text, player.UserId)
		return filtered:GetNonChatStringForBroadcastAsync()
	end)
	return ok and result or nil
end

local function blocked(a: Player, b: Player): boolean
	local mod = Registry.Find("ModerationService")
	if mod and mod.IsBlocked then
		local ok, res = pcall(mod.IsBlocked, mod, a, b)
		return ok and res == true
	end
	return false
end

---------------------------------------------------------------------------
-- Permissions
---------------------------------------------------------------------------
local function permitted(home: Home, player: Player): boolean
	local owner = home.Player
	if player == owner then
		return true
	end
	local rec = getRecord(owner, home.HouseId)
	local key = uidKey(player.UserId)
	if rec then
		if type(rec.Roommates) == "table" and rec.Roommates[key] then
			return true
		end
		if type(rec.Builders) == "table" and rec.Builders[key] then
			return true
		end
	end
	local g = guestKeys[owner]
	local set = g and g[home.HouseId]
	return set ~= nil and set[key] == true
end

local function isLocked(home: Home): boolean
	local rec = getRecord(home.Player, home.HouseId)
	return rec ~= nil and rec.Locked == true
end

local function canUseHome(home: Home, player: Player): boolean
	return not isLocked(home) or permitted(home, player)
end

local function canBuildHome(home: Home, player: Player): boolean
	if player == home.Player then
		return true
	end
	local rec = getRecord(home.Player, home.HouseId)
	return rec ~= nil and type(rec.Builders) == "table" and rec.Builders[uidKey(player.UserId)] == true
end

local function homeOfPlot(part: BasePart): Home?
	for _, home in pairs(homes) do
		if home.Plot.Part == part then
			return home
		end
	end
	return nil
end

local function insideHome(home: Home, pos: Vector3): boolean
	local height = home.Floors * FH + HousingConfig.Boundary.ExtraHeight
	return BuildMath.PointInArea(home.Origin, home.Size, pos, 0, height)
end

---------------------------------------------------------------------------
-- Teleport
---------------------------------------------------------------------------
function HousingService:Teleport(player: Player, cf: CFrame)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum and hum.Sit then
		hum.Sit = false
	end
	local world = Registry.Find("WorldService")
	if world and world.Teleport then
		local ok = pcall(world.Teleport, world, player, cf)
		if ok then
			return
		end
	end
	local anti = Registry.Find("AntiExploitService")
	if anti and anti.Whitelist then
		pcall(anti.Whitelist, anti, player, 3)
	end
	if char then
		char:PivotTo(cf)
	end
end

---------------------------------------------------------------------------
-- Home setup / teardown
---------------------------------------------------------------------------
local function refreshSign(home: Home)
	local rec = getRecord(home.Player, home.HouseId)
	local locked = rec ~= nil and rec.Locked == true
	local name = houseName(home.Player, rec, home.TierId)
	local sub = home.Player.DisplayName .. " · " .. tierName(home.TierId) .. (home.HouseId == "" and " (rented)" or "")
	HouseShell.UpdateSign(home.Sign, name, sub, locked)
	home.Folder:SetAttribute("Locked", locked)
	local part = home.Plot.Part
	if part and part.Parent then
		part:SetAttribute("Locked", locked)
		part:SetAttribute("HouseName", name)
	end
end

-- Pick the active home id; guarantees the player always has somewhere to live.
local function resolveActive(player: Player): string
	local h = housing(player)
	if not h then
		return ""
	end
	local owned = type(h.Owned) == "table" and h.Owned or {}
	local active = type(h.ActiveHouseId) == "string" and h.ActiveHouseId or ""
	if active ~= "" and type(owned[active]) == "table" and TIERS[owned[active].TierId] then
		return active
	end
	if type(h.Rented) == "table" then
		if not TIERS[h.Rented.TierId] then
			DataService:Set(player, "Housing.Rented.TierId", RENT.StartingTier)
		end
		if active ~= "" then
			DataService:Set(player, "Housing.ActiveHouseId", "")
		end
		return ""
	end
	local ids = {}
	for id, rec in pairs(owned) do
		if type(rec) == "table" and TIERS[rec.TierId] then
			table.insert(ids, id)
		end
	end
	table.sort(ids)
	if ids[1] then
		DataService:Set(player, "Housing.ActiveHouseId", ids[1])
		return ids[1]
	end
	-- never homeless: free starter rental
	DataService:Set(player, "Housing.Rented", { TierId = RENT.StartingTier, Since = os.time(), MissedPayments = 0 })
	DataService:Set(player, "Housing.ActiveHouseId", "")
	return ""
end

local function teardownHome(player: Player, keepPlot: boolean?)
	local home = homes[player]
	if not home then
		return nil
	end
	homes[player] = nil
	if BuildService then
		BuildService:UnregisterContext(home.ContextId)
	end
	home.Maid:Clean()
	if home.Folder then
		home.Folder:Destroy()
	end
	if not keepPlot then
		PlotManager.Release(home.Plot)
	end
	return home.Plot
end

local function valueChanged(player: Player, houseId: string, delta: number)
	if houseId == "" or delta == 0 or not getRecord(player, houseId) then
		return
	end
	DataService:Update(player, recordPath(houseId) .. ".Value", function(old)
		return math.max(0, math.floor((tonumber(old) or 0) + delta))
	end)
end

local function setupHome(player: Player, reusePlot: any?): Home?
	if not DataService:IsLoaded(player) or player.Parent ~= Players then
		return nil
	end
	local oldPlot = teardownHome(player, reusePlot ~= nil)
	local houseId = resolveActive(player)
	local rec = getRecord(player, houseId)
	if not rec then
		return nil
	end
	local tier = TIERS[rec.TierId] or TIERS[RENT.StartingTier]
	local floors = math.clamp(math.floor(tonumber(rec.Floors) or 1), 1, maxFloorsFor(player, tier))

	local plot = nil
	if reusePlot and oldPlot == reusePlot and reusePlot.Part.Parent then
		local need = tier.PlotSize
		if reusePlot.Footprint.X >= need.X - 0.5 and reusePlot.Footprint.Z >= need.Y - 0.5 then
			plot = reusePlot
			plot.Occupant = player
		else
			PlotManager.Release(reusePlot)
		end
	elseif reusePlot then
		PlotManager.Release(reusePlot)
	end
	plot = plot or PlotManager.Acquire(player, tier)

	local origin = PlotManager.Origin(plot)
	local size = Vector3.new(tier.PlotSize.X, floors * FH, tier.PlotSize.Y)
	local isApartment = tier.Catalog == "Apartment"

	local folder = Instance.new("Folder")
	folder.Name = "Home_" .. player.UserId
	folder:SetAttribute("OwnerUserId", player.UserId)
	folder:SetAttribute("TierId", tier.Id)
	folder:SetAttribute("Locked", rec.Locked == true)
	local buildFolder = Instance.new("Folder")
	buildFolder.Name = "Build"
	buildFolder.Parent = folder
	folder.Parent = homesFolder

	local contextId = "home_" .. player.UserId
	local home: Home = {
		Player = player,
		HouseId = houseId,
		TierId = tier.Id,
		Tier = tier,
		Plot = plot,
		Origin = origin,
		Size = size,
		Floors = floors,
		ContextId = contextId,
		Folder = folder,
		Shell = nil,
		Sign = nil,
		Ctx = nil,
		Maid = Maid.new(),
		SpawnCFrame = origin * CFrame.new(0, 3.5, size.Z / 2 - 3),
		EjectCFrame = origin * CFrame.new(0, 3.5, size.Z / 2 + HousingConfig.Boundary.EjectOffset) * CFrame.Angles(0, math.pi, 0),
	}

	local function onDenied(p: Player)
		notify(p, "🔒 This home is locked", "warning")
	end

	if isApartment and not plot.Part:GetAttribute("HasShell") then
		local shell, door = HouseShell.BuildInterior(folder, origin, size, floors, tier)
		home.Shell = shell
		home.SpawnCFrame = origin * CFrame.new(0, 3.5, size.Z / 2 - 4)
		home.Maid:Give(Interactables.AttachDoor(door, {
			Style = "Swing",
			CanOpen = function(p)
				return canUseHome(home, p), "🔒 Locked"
			end,
			LockHost = folder,
			OnDenied = onDenied,
		}))
	end
	home.Sign = HouseShell.BuildSign(folder, origin, size, isApartment)

	-- private elevator for elevated (fallback) sky apartments
	local lobby = plot.LobbyCFrame
	if typeof(lobby) == "CFrame" then
		local unitCF = origin * CFrame.new(size.X / 2 - 5, 0, size.Z / 2 - 5)
		HouseShell.BuildElevator(folder, lobby, unitCF, {
			CanUse = function(p)
				return canUseHome(home, p)
			end,
			Teleport = function(p, cf)
				HousingService:Teleport(p, cf)
			end,
			OnDenied = onDenied,
		})
		home.EjectCFrame = lobby * CFrame.new(0, 3.5, 4)
	end

	local ctx = {
		Owner = player,
		Origin = origin,
		Size = size,
		DataPath = recordPath(houseId) .. ".Build",
		Catalog = tier.Catalog,
		MaxItems = maxItemsFor(tier, floors),
		Floors = floors,
		FloorHeight = FH,
		Folder = buildFolder,
		Label = houseName(player, rec, tier.Id),
		CanBuild = function(p: Player)
			return canBuildHome(home, p)
		end,
		CanUse = function(p: Player)
			return canUseHome(home, p)
		end,
		LockHost = folder,
		SurfaceRoot = home.Shell,
		OnItemsChanged = function(delta: number)
			valueChanged(player, houseId, delta)
		end,
	}
	home.Ctx = ctx
	homes[player] = home

	local part = plot.Part
	part:SetAttribute("OwnerUserId", player.UserId)
	part:SetAttribute("OwnerName", player.DisplayName)
	part:SetAttribute("Occupied", true)
	part:SetAttribute("ContextId", contextId)
	player:SetAttribute("HouseId", houseId)
	refreshSign(home)

	if BuildService then
		BuildService:RegisterContext(contextId, ctx)
		BuildService:LoadBuild(contextId)
	end
	HousingService.HomeChanged:Fire(player, home)
	return home
end

-- After a home change: if the player was standing in the old home (or anywhere when forced), send them home.
local function moveHome(player: Player, force: boolean?)
	local home = homes[player]
	if home and (force or player.Character) then
		HousingService:Teleport(player, home.SpawnCFrame)
	end
end

local function sellBackBuild(player: Player, houseId: string): number
	local rec = getRecord(player, houseId)
	if not rec or not BuildService then
		return 0
	end
	local refund = BuildService:SellBackValue(rec.Build)
	if refund > 0 then
		EconomyService:AddCash(player, refund, "Build:SellBack")
	end
	return refund
end

local function newRental(tier)
	return {
		TierId = tier.Id,
		Since = os.time(),
		MissedPayments = 0,
		Locked = false,
		Roommates = {},
		Builders = {},
		Build = HouseShell.StarterBuild(tier),
	}
end

---------------------------------------------------------------------------
-- Rent
---------------------------------------------------------------------------
local function evict(player: Player)
	local refund = sellBackBuild(player, "")
	local wasActive = homes[player] and homes[player].HouseId == ""
	DataService:Set(player, "Housing.Rented", newRental(TIERS[RENT.NeverEvictTier]))
	local msg = ("You were evicted for missing rent twice. You've been moved to a %s."):format(tierName(RENT.NeverEvictTier))
	if refund > 0 then
		msg ..= (" Your furniture was sold back for %s."):format(Format.Money(refund))
	end
	notify(player, msg, "error")
	phone(player, msg)
	if wasActive then
		setupHome(player)
		moveHome(player, true)
	end
end

local function chargeRent(player: Player)
	local rec = getRecord(player, "")
	if not rec then
		return
	end
	local tier = TIERS[rec.TierId]
	if not tier or tier.WeeklyRent <= 0 then
		return
	end
	if os.clock() - (sessionStart[player] or os.clock()) < RENT.MinSessionMinutes * 60 then
		return
	end
	local rent = tier.WeeklyRent
	local neverEvict = tier.Id == RENT.NeverEvictTier
	if EconomyService:Charge(player, rent, "Rent:" .. tier.Id) then
		if not neverEvict and (tonumber(rec.MissedPayments) or 0) > 0 then
			DataService:Set(player, "Housing.Rented.MissedPayments", 0)
		end
		local text = ("Rent of %s paid for your %s. Thanks!"):format(Format.Money(rent), tier.Name)
		phone(player, text)
		notify(player, "🏠 " .. text, "money")
		return
	end
	local missed = (tonumber(rec.MissedPayments) or 0) + 1
	if neverEvict then
		DataService:Set(player, "Housing.Rented.MissedPayments", missed)
		local text = ("You couldn't pay rent (%s). You now owe %s — buying homes is blocked until you pay (Homes → Pay rent)."):format(
			Format.Money(rent),
			Format.Money(missed * rent)
		)
		phone(player, text)
		notify(player, "⚠️ " .. text, "warning")
	elseif missed >= RENT.MissedBeforeEviction then
		evict(player)
	else
		DataService:Set(player, "Housing.Rented.MissedPayments", missed)
		local text = ("Rent of %s for your %s is overdue! Miss %d more payment(s) and you'll be evicted. Pay in Homes → Pay rent."):format(
			Format.Money(rent),
			tier.Name,
			RENT.MissedBeforeEviction - missed
		)
		phone(player, text)
		notify(player, "⚠️ " .. text, "warning")
	end
end

local function onWeek(week: any)
	local list = {}
	for player in pairs(homes) do
		table.insert(list, player)
	end
	for _, player in ipairs(list) do
		if player.Parent == Players and homes[player] then
			local ok, err = pcall(chargeRent, player)
			if not ok then
				warn("[HousingService] rent error:", err)
			end
		end
	end
	HousingService.WeekTick:Fire(week)
end

---------------------------------------------------------------------------
-- Public API (contract)
---------------------------------------------------------------------------
function HousingService:GetActivePlot(player: Player): BasePart?
	local home = homes[player]
	return home and home.Plot.Part or nil
end

function HousingService:GetHome(player: Player)
	local home = homes[player]
	if not home then
		return nil
	end
	return {
		HouseId = home.HouseId ~= "" and home.HouseId or nil,
		TierId = home.TierId,
		Plot = home.Plot.Part,
		ContextId = home.ContextId,
		Origin = home.Origin,
		Size = home.Size,
	}
end

function HousingService:CanEnter(player: Player, plotPart: BasePart): boolean
	local home = homeOfPlot(plotPart)
	if not home then
		return true
	end
	return canUseHome(home, player)
end

function HousingService:GrantHouse(player: Player, tierId: string, opts: { [string]: any }?): string?
	local o = opts or {}
	local tier = TIERS[tierId]
	if not tier or not DataService:IsLoaded(player) then
		return nil
	end
	if not o.IgnoreSlots and ownedCount(player) >= slotLimit(player) then
		return nil
	end
	local h = housing(player)
	if not h then
		return nil
	end
	local n = math.max(1, math.floor(tonumber(h.NextHouseNumber) or 1))
	local id = "h_" .. n
	while type(h.Owned) == "table" and h.Owned[id] ~= nil do
		n += 1
		id = "h_" .. n
	end
	DataService:Set(player, "Housing.NextHouseNumber", n + 1)
	local floors = math.clamp(math.floor(tonumber(o.Floors) or 1), 1, maxFloorsFor(player, tier))
	local record = {
		TierId = tier.Id,
		Value = math.max(0, math.floor(tonumber(o.Value) or tier.BuyPrice)),
		Name = type(o.Name) == "string" and o.Name:sub(1, HousingConfig.Names.MaxLength * 4) or "",
		Build = type(o.Build) == "table" and Table.DeepCopy(o.Build) or HouseShell.StarterBuild(tier),
		Locked = false,
		Roommates = {},
		Builders = {},
		Floors = floors,
		Listing = false,
		PurchasedAt = os.time(),
	}
	DataService:Set(player, "Housing.Owned." .. id, record)
	if o.SetActive then
		DataService:Set(player, "Housing.ActiveHouseId", id)
		setupHome(player)
	end
	return id
end

---------------------------------------------------------------------------
-- Extra API
---------------------------------------------------------------------------
function HousingService:GetSlotInfo(player: Player): (number, number)
	return ownedCount(player), slotLimit(player)
end

function HousingService:HasRentDebt(player: Player): boolean
	return rentDebt(player) > 0
end

function HousingService:GetHomeEntrance(owner: Player): CFrame?
	local home = homes[owner]
	return home and home.SpawnCFrame or nil
end

function HousingService:GetHouseRecord(player: Player, houseId: string)
	return getRecord(player, houseId)
end

function HousingService:AddGuestKey(owner: Player, houseId: string, userId: number)
	guestKeys[owner] = guestKeys[owner] or {}
	local set = guestKeys[owner][houseId] or {}
	guestKeys[owner][houseId] = set
	set[uidKey(userId)] = true
end

function HousingService:RemoveGuestKey(owner: Player, houseId: string, userId: number)
	local g = guestKeys[owner]
	local set = g and g[houseId]
	if set then
		set[uidKey(userId)] = nil
	end
end

-- Removes an owned house record (sale / transfer). Moves the player to another home if it was active.
function HousingService:RemoveHouse(player: Player, houseId: string, reason: string?)
	local rec = getRecord(player, houseId)
	if houseId == "" or not rec then
		return nil
	end
	local copy = Table.DeepCopy(rec)
	DataService:Set(player, "Housing.Owned." .. houseId, nil)
	local g = guestKeys[player]
	if g then
		g[houseId] = nil
	end
	local home = homes[player]
	local wasActive = home ~= nil and home.HouseId == houseId
	if DataService:Get(player, "Housing.ActiveHouseId") == houseId then
		DataService:Set(player, "Housing.ActiveHouseId", "")
	end
	HousingService.HouseRemoved:Fire(player, houseId, reason or "Removed")
	if wasActive then
		local inside = false
		local pos = Guard.RootPosition(player)
		if pos and home then
			inside = insideHome(home, pos)
		end
		setupHome(player)
		if inside then
			moveHome(player, true)
		end
	end
	return copy
end

function HousingService:RestoreHouse(player: Player, houseId: string, record)
	if type(record) ~= "table" or not DataService:IsLoaded(player) then
		return false
	end
	DataService:Set(player, "Housing.Owned." .. houseId, Table.DeepCopy(record))
	return true
end

---------------------------------------------------------------------------
-- Remote handlers
---------------------------------------------------------------------------
local function houseArg(player: Player, payload): (string?, any?)
	local id = payload.HouseId
	if id == nil then
		local home = homes[player]
		id = home and home.HouseId or ""
	end
	if id == "" then
		local rec = getRecord(player, "")
		return rec and "" or nil, rec
	end
	local clean = Guard.Id(id, 16)
	if not clean then
		return nil, nil
	end
	local rec = getRecord(player, clean)
	if not rec then
		return nil, nil
	end
	return clean, rec
end

local function onRecordChanged(player: Player, houseId: string)
	local home = homes[player]
	if home and home.HouseId == houseId then
		refreshSign(home)
		if home.Ctx then
			home.Ctx.Label = houseName(player, getRecord(player, houseId), home.TierId)
		end
		if BuildService then
			BuildService:RefreshPermissions()
		end
	end
end

local function cooldownOk(player: Player): boolean
	local now = os.clock()
	if now - (lastTeleport[player] or -math.huge) < HousingConfig.Visit.Cooldown then
		return false
	end
	lastTeleport[player] = now
	return true
end

local function stateFor(player: Player)
	local home = homes[player]
	local used, limit = ownedCount(player), slotLimit(player)
	local rented = getRecord(player, "")
	local names = {}
	for _, p in ipairs(Players:GetPlayers()) do
		names[uidKey(p.UserId)] = p.DisplayName
	end
	local re = Registry.Find("RealEstateService")
	local tenancies = {}
	if re and re.GetTenancies then
		local ok, list = pcall(re.GetTenancies, re, player)
		if ok and type(list) == "table" then
			tenancies = list
		end
	end
	local floorsInfo = {}
	local h = housing(player)
	if h and type(h.Owned) == "table" then
		for id, rec in pairs(h.Owned) do
			if type(rec) == "table" and TIERS[rec.TierId] then
				local tier = TIERS[rec.TierId]
				local floors = math.max(1, tonumber(rec.Floors) or 1)
				floorsInfo[id] = {
					Floors = floors,
					MaxFloors = maxFloorsFor(player, tier),
					FloorPrice = math.max(HousingConfig.Floors.MinPrice, math.floor(tier.BuyPrice * HousingConfig.Floors.PriceFraction)),
					SellPrice = math.floor((tonumber(rec.Value) or 0) * EconomyConfig.ResaleFraction),
					Items = Serializer.Count(rec.Build),
				}
			end
		end
	end
	return {
		ok = true,
		Active = home and {
			HouseId = home.HouseId,
			TierId = home.TierId,
			PlotId = home.Plot.Id,
			ContextId = home.ContextId,
			Floors = home.Floors,
			Locked = isLocked(home),
		} or nil,
		SlotsUsed = used,
		SlotLimit = limit,
		RentDue = rentDebt(player),
		WeeklyRent = rented and TIERS[rented.TierId] and TIERS[rented.TierId].WeeklyRent or 0,
		Houses = floorsInfo,
		Names = names,
		Tenancies = tenancies,
		HasExclusive = hasPass(player, "ExclusiveApartments"),
	}
end

local function buyHouse(player: Player, payload)
	local tierId = Guard.Id(payload.TierId, 24)
	local tier = tierId and TIERS[tierId]
	if not tier then
		return { ok = false, err = "Unknown home" }
	end
	if (tier.Kind ~= "Buy" and tier.Kind ~= "Both") or tier.BuyPrice <= 0 then
		return { ok = false, err = tier.Name .. " can only be rented" }
	end
	if tier.RequiresPass and not hasPass(player, tier.RequiresPass) then
		return { ok = false, err = "Requires the Exclusive Apartments pass" }
	end
	if rentDebt(player) > 0 then
		return { ok = false, err = ("Pay your overdue rent first (%s)"):format(Format.Money(rentDebt(player))) }
	end
	if ownedCount(player) >= slotLimit(player) then
		return { ok = false, err = ("You own the maximum of %d home(s). Sell one or get more slots."):format(slotLimit(player)) }
	end
	local price = EconomyService:GetPrice(player, tier.BuyPrice, HousingConfig.Purchase.PriceCategory)
	if not spend(player, price, "Buy:House:" .. tier.Id) then
		return { ok = false, err = ("You need %s"):format(Format.Money(price)) }
	end
	-- Value = what was actually paid (a sale-event discount must never let a house resell for profit)
	local id = HousingService:GrantHouse(player, tier.Id, { Value = math.min(tier.BuyPrice, price), SetActive = true })
	if not id then
		EconomyService:AddCash(player, price, "Refund:House")
		return { ok = false, err = "Couldn't complete the purchase — you were refunded" }
	end
	moveHome(player, true)
	saveSoon(player)
	notify(player, ("🏡 You bought a %s for %s!"):format(tier.Name, Format.Money(price)), "success")
	phone(player, ("Congratulations on your new %s! Open build mode at your plot to make it yours."):format(tier.Name))
	local ps = Registry.Find("PhoneService")
	if ps and ps.PostToFeed then
		task.spawn(pcall, ps.PostToFeed, ps, nil, ("🏡 %s just bought a %s!"):format(player.DisplayName, tier.Name))
	end
	return { ok = true, HouseId = id }
end

local function rentTier(player: Player, payload)
	local tierId = Guard.Id(payload.TierId, 24)
	local tier = tierId and TIERS[tierId]
	if not tier then
		return { ok = false, err = "Unknown home" }
	end
	if (tier.Kind ~= "Rent" and tier.Kind ~= "Both") or tier.WeeklyRent <= 0 then
		return { ok = false, err = tier.Name .. " can't be rented" }
	end
	if tier.RequiresPass and not hasPass(player, tier.RequiresPass) then
		return { ok = false, err = "Requires the Exclusive Apartments pass" }
	end
	if rentDebt(player) > 0 then
		return { ok = false, err = ("Pay your overdue rent first (%s)"):format(Format.Money(rentDebt(player))) }
	end
	local current = getRecord(player, "")
	if current and current.TierId == tier.Id then
		return { ok = false, err = "You already rent a " .. tier.Name }
	end
	if RENT.ChargeFirstWeekOnRent and not EconomyService:Charge(player, tier.WeeklyRent, "Rent:" .. tier.Id) then
		return { ok = false, err = ("You need %s for the first week"):format(Format.Money(tier.WeeklyRent)) }
	end
	local refund = current and sellBackBuild(player, "") or 0
	DataService:Set(player, "Housing.Rented", newRental(tier))
	DataService:Set(player, "Housing.ActiveHouseId", "")
	setupHome(player)
	moveHome(player, true)
	saveSoon(player)
	local msg = ("🔑 You're now renting a %s (%s/week)."):format(tier.Name, Format.Money(tier.WeeklyRent))
	if refund > 0 then
		msg ..= (" Old furniture sold back for %s."):format(Format.Money(refund))
	end
	notify(player, msg, "success")
	phone(player, msg)
	return { ok = true }
end

local function stopRenting(player: Player)
	local rec = getRecord(player, "")
	if not rec then
		return { ok = false, err = "You're not renting" }
	end
	if ownedCount(player) <= 0 then
		return { ok = false, err = "You need to own a home before you stop renting" }
	end
	local debt = rentDebt(player)
	if debt > 0 then
		if not EconomyService:Charge(player, debt, "Rent:Debt") then
			return { ok = false, err = ("Pay your overdue rent first (%s)"):format(Format.Money(debt)) }
		end
	end
	local refund = sellBackBuild(player, "")
	local wasActive = homes[player] and homes[player].HouseId == ""
	DataService:Set(player, "Housing.Rented", false)
	if wasActive then
		DataService:Set(player, "Housing.ActiveHouseId", "")
		setupHome(player) -- resolveActive picks an owned house
		moveHome(player, true)
	end
	saveSoon(player)
	notify(player, refund > 0 and ("Lease ended. Furniture sold back for %s."):format(Format.Money(refund)) or "Lease ended.", "success")
	return { ok = true }
end

local function payRent(player: Player)
	local debt = rentDebt(player)
	if debt <= 0 then
		return { ok = false, err = "You don't owe any rent" }
	end
	if not EconomyService:Charge(player, debt, "Rent:Debt") then
		return { ok = false, err = ("You need %s"):format(Format.Money(debt)) }
	end
	DataService:Set(player, "Housing.Rented.MissedPayments", 0)
	notify(player, ("Paid %s of overdue rent. You're all caught up!"):format(Format.Money(debt)), "success")
	return { ok = true }
end

local function setActive(player: Player, payload)
	local id = payload.HouseId
	if id ~= "" then
		id = Guard.Id(id, 16)
		if not id or not getRecord(player, id) then
			return { ok = false, err = "Unknown house" }
		end
	elseif not getRecord(player, "") then
		return { ok = false, err = "You're not renting" }
	end
	local home = homes[player]
	if not home or home.HouseId ~= id then
		DataService:Set(player, "Housing.ActiveHouseId", id)
		setupHome(player)
	end
	if cooldownOk(player) then
		moveHome(player, true)
	end
	return { ok = true }
end

local function sellHouse(player: Player, payload)
	local id = Guard.Id(payload.HouseId, 16)
	local rec = id and getRecord(player, id)
	if not id or not rec then
		return { ok = false, err = "Unknown house" }
	end
	local re = Registry.Find("RealEstateService")
	if re and re.UnlistHouse then
		pcall(re.UnlistHouse, re, player, id, "Sold to the city")
	end
	local refund = math.floor((tonumber(rec.Value) or 0) * EconomyConfig.ResaleFraction)
	local removed = HousingService:RemoveHouse(player, id, "SoldToGame")
	if not removed then
		return { ok = false, err = "Couldn't sell that house" }
	end
	if refund > 0 then
		EconomyService:AddCash(player, refund, "Sell:House:" .. tostring(removed.TierId))
	end
	saveSoon(player)
	notify(player, ("Sold %s for %s"):format(houseName(player, removed, removed.TierId), Format.Money(refund)), "money")
	return { ok = true, Amount = refund }
end

local function renameHouse(player: Player, payload)
	local id, rec = houseArg(player, payload)
	if not id or not rec then
		return { ok = false, err = "Unknown house" }
	end
	local raw = Guard.String(payload.Name, HousingConfig.Names.MaxLength * 4)
	if not raw then
		return { ok = false, err = "Name too long" }
	end
	raw = raw:gsub("^%s+", ""):gsub("%s+$", "")
	local len = utf8.len(raw) or 0
	if len < 1 or len > HousingConfig.Names.MaxLength then
		return { ok = false, err = ("Names are 1-%d characters"):format(HousingConfig.Names.MaxLength) }
	end
	local filtered = filterName(player, raw)
	if not filtered or filtered == "" then
		return { ok = false, err = "That name isn't allowed" }
	end
	DataService:Set(player, recordPath(id) .. ".Name", filtered)
	onRecordChanged(player, id)
	return { ok = true, Name = filtered }
end

local function lockDoors(player: Player, payload)
	local id, rec = houseArg(player, payload)
	if not id or not rec then
		return { ok = false, err = "Unknown house" }
	end
	local locked = Guard.Bool(payload.Locked)
	if locked == nil then
		return { ok = false, err = "Bad request" }
	end
	DataService:Set(player, recordPath(id) .. ".Locked", locked)
	onRecordChanged(player, id)
	notify(player, locked and "🔒 Doors locked" or "🔓 Doors unlocked", "info")
	return { ok = true, Locked = locked }
end

local function editPeople(field: string, add: boolean, maxCount: number)
	return function(player: Player, payload)
		local id, rec = houseArg(player, payload)
		if not id or not rec then
			return { ok = false, err = "Unknown house" }
		end
		local userId = Guard.Int(payload.UserId, 1, 2 ^ 53)
		if not userId or userId == player.UserId then
			return { ok = false, err = "Pick another player" }
		end
		local key = uidKey(userId)
		local list = type(rec[field]) == "table" and rec[field] or {}
		if add then
			local target = Players:GetPlayerByUserId(userId)
			if not target then
				return { ok = false, err = "That player isn't in this server" }
			end
			if blocked(player, target) then
				return { ok = false, err = "You can't do that with this player" }
			end
			if not list[key] and Table.Count(list) >= maxCount then
				return { ok = false, err = ("Limit of %d reached"):format(maxCount) }
			end
			if type(rec[field]) ~= "table" then
				DataService:Set(player, recordPath(id) .. "." .. field, {})
			end
			DataService:Set(player, recordPath(id) .. "." .. field .. "." .. key, true)
			local what = field == "Roommates" and "a key to" or "build access to"
			notify(target, ("%s gave you %s their home!"):format(player.DisplayName, what), "success")
		else
			if not list[key] then
				return { ok = false, err = "They don't have access" }
			end
			DataService:Set(player, recordPath(id) .. "." .. field .. "." .. key, nil)
		end
		onRecordChanged(player, id)
		return { ok = true }
	end
end

local function visit(player: Player, payload)
	local userId = Guard.Int(payload.UserId, 1, 2 ^ 53)
	local target = userId and Players:GetPlayerByUserId(userId)
	if not target then
		return { ok = false, err = "That player isn't in this server" }
	end
	local home = homes[target]
	if not home then
		return { ok = false, err = "They don't have a home loaded yet" }
	end
	if target ~= player and blocked(player, target) then
		return { ok = false, err = "You can't visit this player" }
	end
	if not canUseHome(home, player) then
		return { ok = false, err = "🔒 Their home is locked" }
	end
	if player:GetAttribute("InVehicle") then
		return { ok = false, err = "Get out of your vehicle first" }
	end
	if not cooldownOk(player) then
		return { ok = false, err = "Wait a moment before travelling again" }
	end
	HousingService:Teleport(player, home.SpawnCFrame)
	if target ~= player then
		notify(target, ("👋 %s is visiting your home"):format(player.DisplayName), "info")
	end
	return { ok = true }
end

local function goHome(player: Player)
	local home = homes[player]
	if not home then
		return { ok = false, err = "Your home is still loading" }
	end
	if player:GetAttribute("InVehicle") then
		return { ok = false, err = "Get out of your vehicle first" }
	end
	if not cooldownOk(player) then
		return { ok = false, err = "Wait a moment before travelling again" }
	end
	HousingService:Teleport(player, home.SpawnCFrame)
	return { ok = true }
end

local function addFloor(player: Player, payload)
	local id, rec = houseArg(player, payload)
	if not id or id == "" or not rec then
		return { ok = false, err = "You can only add floors to a home you own" }
	end
	local tier = TIERS[rec.TierId]
	if not tier then
		return { ok = false, err = "Unknown house" }
	end
	local floors = math.max(1, math.floor(tonumber(rec.Floors) or 1))
	local maxF = maxFloorsFor(player, tier)
	if floors >= maxF then
		if not hasPass(player, "ExtraHouse") and floors >= (tier.MaxFloors or 1) then
			return { ok = false, err = "Max floors reached — the Extra House pass adds one more" }
		end
		return { ok = false, err = "Max floors reached" }
	end
	local price = math.max(HousingConfig.Floors.MinPrice, math.floor(tier.BuyPrice * HousingConfig.Floors.PriceFraction))
	if not spend(player, price, "Build:Floor") then
		return { ok = false, err = ("You need %s"):format(Format.Money(price)) }
	end
	DataService:Set(player, recordPath(id) .. ".Floors", floors + 1)
	valueChanged(player, id, price)
	local home = homes[player]
	if home and home.HouseId == id then
		setupHome(player, home.Plot)
	end
	notify(player, ("🏗️ Floor %d unlocked!"):format(floors + 1), "success")
	return { ok = true, Floors = floors + 1 }
end

local function getVisitable(player: Player)
	local list = {}
	for other, home in pairs(homes) do
		if other ~= player and other.Parent == Players then
			local rec = getRecord(other, home.HouseId)
			table.insert(list, {
				UserId = other.UserId,
				Name = other.DisplayName,
				TierId = home.TierId,
				TierName = tierName(home.TierId),
				HouseName = houseName(other, rec, home.TierId),
				Locked = isLocked(home),
				CanEnter = canUseHome(home, player),
				HasKey = permitted(home, player),
			})
		end
	end
	table.sort(list, function(a, b)
		return a.Name < b.Name
	end)
	return { ok = true, List = list }
end

---------------------------------------------------------------------------
-- Boundary (locked homes) — 1 Hz, batched over all homes
---------------------------------------------------------------------------
local function boundaryTick()
	local locked = {}
	for _, home in pairs(homes) do
		if isLocked(home) then
			table.insert(locked, home)
		end
	end
	if #locked == 0 then
		return
	end
	for _, p in ipairs(Players:GetPlayers()) do
		local pos = Guard.RootPosition(p)
		if pos then
			for _, home in ipairs(locked) do
				if p ~= home.Player and insideHome(home, pos) and not permitted(home, p) then
					HousingService:Teleport(p, home.EjectCFrame)
					notify(p, "🔒 That home is locked", "warning")
					break
				end
			end
		end
	end
end

---------------------------------------------------------------------------
-- Spawning
---------------------------------------------------------------------------
local function onCharacter(player: Player, char: Model)
	if spawnedOnce[player] and not HousingConfig.Spawn.AtHomeOnRespawn then
		return
	end
	if not HousingConfig.Spawn.AtHomeOnJoin and not spawnedOnce[player] then
		spawnedOnce[player] = true
		return
	end
	task.spawn(function()
		local root = char:WaitForChild("HumanoidRootPart", 15)
		if not root then
			return
		end
		local t = 0
		while not homes[player] and t < 40 and player.Parent == Players do
			task.wait(0.25)
			t += 0.25
		end
		local home = homes[player]
		if not home or player.Character ~= char then
			return
		end
		spawnedOnce[player] = true
		task.wait(0.2)
		HousingService:Teleport(player, home.SpawnCFrame)
	end)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function HousingService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	BuildService = Registry.Find("BuildService")

	homesFolder = Workspace:FindFirstChild("Homes") :: Folder
	if not homesFolder then
		homesFolder = Instance.new("Folder")
		homesFolder.Name = "Homes"
		homesFolder.Parent = Workspace
	end

	PlotManager.Init()
	PlotManager.OnRemoved = function(plot)
		local p = plot.Occupant
		if p and homes[p] and homes[p].Plot == plot then
			setupHome(p)
		end
	end

	Net.HandleActions("Housing", {
		GetState = stateFor,
		GetVisitable = getVisitable,
		BuyHouse = buyHouse,
		RentTier = rentTier,
		StopRenting = stopRenting,
		PayRent = payRent,
		SetActiveHouse = setActive,
		SellHouse = sellHouse,
		RenameHouse = renameHouse,
		LockDoors = lockDoors,
		GiveKey = editPeople("Roommates", true, HousingConfig.Keys.MaxRoommates),
		RevokeKey = editPeople("Roommates", false, HousingConfig.Keys.MaxRoommates),
		AllowBuild = editPeople("Builders", true, HousingConfig.Keys.MaxBuilders),
		DisallowBuild = editPeople("Builders", false, HousingConfig.Keys.MaxBuilders),
		Visit = visit,
		GoHome = goHome,
		AddFloor = addFloor,
	}, {
		rate = 4,
		burst = 10,
		perAction = {
			BuyHouse = { rate = 0.5, burst = 2 },
			RentTier = { rate = 0.5, burst = 2 },
			SellHouse = { rate = 0.5, burst = 2 },
			AddFloor = { rate = 0.5, burst = 2 },
			-- switching homes rebuilds the whole home (shell + every item): keep it slow
			SetActiveHouse = { rate = 0.25, burst = 2 },
			StopRenting = { rate = 0.25, burst = 2 },
			GetVisitable = { rate = 1, burst = 3 },
			RenameHouse = { rate = 0.3, burst = 2 },
			Visit = { rate = 0.5, burst = 2 },
			GoHome = { rate = 0.5, burst = 2 },
		},
	})
end

function HousingService:Start()
	BuildService = BuildService or Registry.Find("BuildService")

	Players.PlayerAdded:Connect(function(player)
		sessionStart[player] = os.clock()
		player.CharacterAdded:Connect(function(char)
			onCharacter(player, char)
		end)
	end)
	for _, player in ipairs(Players:GetPlayers()) do
		sessionStart[player] = sessionStart[player] or os.clock()
		player.CharacterAdded:Connect(function(char)
			onCharacter(player, char)
		end)
		if player.Character then
			onCharacter(player, player.Character)
		end
	end

	DataService:OnLoaded(function(player)
		sessionStart[player] = sessionStart[player] or os.clock()
		local ok, err = pcall(setupHome, player)
		if not ok then
			warn("[HousingService] setupHome failed for", player.Name, err)
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		teardownHome(player)
		guestKeys[player] = nil
		spawnedOnce[player] = nil
		lastTeleport[player] = nil
		sessionStart[player] = nil
	end)

	-- rent: WorldService week (or fallback timer)
	local world = Registry.Find("WorldService")
	if world and type(world.WeekChanged) == "table" and type(world.WeekChanged.Connect) == "function" then
		world.WeekChanged:Connect(onWeek)
	else
		task.spawn(function()
			local week = 0
			while true do
				task.wait(RENT.FallbackWeekMinutes * 60)
				week += 1
				onWeek(week)
			end
		end)
	end

	-- locked-home boundary
	task.spawn(function()
		while true do
			task.wait(HousingConfig.Boundary.CheckInterval)
			local ok, err = pcall(boundaryTick)
			if not ok then
				warn("[HousingService] boundary error:", err)
			end
		end
	end)
end

return HousingService
