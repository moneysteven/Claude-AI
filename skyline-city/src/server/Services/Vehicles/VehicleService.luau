-- VehicleService: owned cars, job vehicles, test drives and showroom displays (ARCHITECTURE §5 Vehicles API).
--
-- API (server):
--   VehicleService:GrantVehicle(p, modelId, opts?) -> uid?        opts = { Value, Paint, Finance, Plate, IgnoreLimit }
--   VehicleService:RemoveVehicle(p, uid) -> bool
--   VehicleService:SpawnVehicle(p, uid, cframe?) -> (Model?, err?)
--   VehicleService:DespawnVehicle(p)
--   VehicleService:GetActiveVehicle(p) -> Model?
--   VehicleService:GetOccupiedVehicle(p) -> (Model?, seat?)
--   VehicleService:SpawnJobVehicle(p, modelId, cframe) -> Model?
--   VehicleService:DespawnJobVehicle(p)
--   VehicleService:SpawnTestDrive(p, modelId, cframe, seconds) -> Model?
--   VehicleService:BuildDisplay(modelId, cframe, look?) -> Model      anchored showroom copy (pivot = bottom centre)
--   VehicleService:RefreshLook(p, uid)
--   VehicleService:Repair(p, uid, amount?)
--   VehicleService:GetCarValue(p, uid) -> number
--   VehicleService.VehicleSpawned : Signal(p, model)
--   extras: :GetGarageSlots(p) -> number, :GetOwnedCount(p) -> number, :GetVehicleInfo(model) -> info?
--
-- Remotes: "Vehicle" (List, Spawn, Despawn, Call, SetFavorite, Lock, Locate, Sell, GiveKey, RevokeKeys,
--          ParkVip {Uid} (VIP reserved bay), SetShowcase {Uid?} (Premium Car Park showroom; see Vehicles/Showcase)),
--          "VehicleAction" (c→s), "VehicleTelemetry" (c→s, unreliable).

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Maid = require(Shared.Util.Maid)
local Format = require(Shared.Util.Format)
local Cars = require(Shared.Config.Cars)
local VehiclesConfig = require(Shared.Config.Vehicles)
local Units = require(Shared.Vehicle.Units)
local Looks = require(Shared.Vehicle.Looks)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local Vehicles = script.Parent
local CarBuilder = require(Vehicles.CarBuilder)
local CarLooks = require(Vehicles.CarLooks)
local Spawner = require(Vehicles.Spawner)
local Occupancy = require(Vehicles.Occupancy)
local Watchdog = require(Vehicles.Watchdog)
local SafeZones = require(Vehicles.SafeZones)
local CarActions = require(Vehicles.CarActions)
local Garage = require(Vehicles.Garage)
local Plates = require(Vehicles.Plates)
local Showcase = require(Vehicles.Showcase)

local VehicleService = {
	Name = "VehicleService",
	Priority = 40,
}

VehicleService.VehicleSpawned = Signal.new()

local CFG = VehiclesConfig
local UPGRADE_KEYS = { "Engine", "Turbo", "Brakes", "Suspension", "Transmission" }

local DataService
local EconomyService
local NotifyService

local carsFolder: Folder
local displayFolder: Folder

-- shared context for the helper modules
local ctx = {
	Cars = {} :: { [Model]: any },
	ByOwner = {} :: { [Player]: { Owned: any?, Job: any?, Test: any? } },
	Wanted = {} :: { [Player]: number },
	CallReadyAt = {} :: { [Player]: number },
	SpawnReadyAt = {} :: { [Player]: number },
	RamAt = {} :: { [Player]: number },
}

ctx.Find = function(name: string)
	return Registry.Find(name)
end

ctx.Notify = function(player: Player, text: string, kind: string?, duration: number?)
	if NotifyService and player and player.Parent then
		NotifyService:Send(player, text, kind, duration)
	end
end

local function slotFor(player: Player)
	local s = ctx.ByOwner[player]
	if not s then
		s = {}
		ctx.ByOwner[player] = s
	end
	return s
end

ctx.ActiveInfo = function(player: Player)
	local s = ctx.ByOwner[player]
	return s and s.Owned or nil
end

ctx.InfoForUid = function(player: Player, uid: string)
	local s = ctx.ByOwner[player]
	if not s then
		return nil
	end
	for _, kind in ipairs({ "Owned", "Job", "Test" }) do
		local info = s[kind]
		if info and info.Uid == uid then
			return info
		end
	end
	return nil
end

ctx.InfoFromPart = function(part: Instance)
	local node = part
	while node and node ~= Workspace do
		local info = ctx.Cars[node :: any]
		if info then
			return info
		end
		node = node.Parent
	end
	return nil
end

---------------------------------------------------------------------------
-- Persistence
---------------------------------------------------------------------------
ctx.SaveInfo = function(info)
	local owner: Player = info.Owner
	if info.Kind ~= "Owned" or not (DataService and owner and DataService:IsLoaded(owner)) then
		return
	end
	local entry = Garage.Entry(ctx, owner, info.Uid)
	if not entry then
		return
	end
	local base = "Vehicles." .. info.Uid
	local unsaved = info.MileageUnsaved or 0
	DataService:Set(owner, base .. ".Fuel", math.floor((info.Fuel or 1) * 1000 + 0.5) / 1000)
	DataService:Set(owner, base .. ".Health", math.floor((info.Health or 100) * 10 + 0.5) / 10)
	if unsaved > 0 then
		DataService:Set(owner, base .. ".Mileage", math.floor((tonumber(entry.Mileage) or 0) + unsaved))
		DataService:Increment(owner, "Stats.Mileage", math.floor(unsaved))
		info.MileageUnsaved = unsaved - math.floor(unsaved)
	end
	info.Dirty = false
	info.LastSave = os.clock()
end

---------------------------------------------------------------------------
-- Registration / despawn
---------------------------------------------------------------------------
local function applyUpgradeAttributes(model: Model, entry)
	local up = type(entry) == "table" and type(entry.Upgrades) == "table" and entry.Upgrades or {}
	for _, key in ipairs(UPGRADE_KEYS) do
		local lvl = tonumber(up[key]) or 0
		model:SetAttribute("Up_" .. key, math.clamp(math.floor(lvl), 0, 10))
	end
end

local function register(player: Player, model: Model, B, kind: string, uid: string, def, entry)
	local root = model.PrimaryPart :: BasePart
	local info = {
		Model = model,
		Root = root,
		Def = def,
		ModelId = def.Id,
		Uid = uid,
		Owner = player,
		Kind = kind,
		Maid = Maid.new(),
		B = B,
		Fuel = math.clamp(tonumber(entry and entry.Fuel) or 1, 0, 1),
		Health = math.clamp(tonumber(entry and entry.Health) or 100, 0, 100),
		MileageUnsaved = 0,
		Keyholders = {},
		Sleeping = root.Anchored,
		LastPos = root.Position,
		LastAt = os.clock(),
		LastSave = os.clock(),
		EmptySince = os.clock(),
		Occupants = {},
		Seats = {},
		Prompts = {},
	}
	ctx.Cars[model] = info
	slotFor(player)[kind] = info
	Occupancy.Setup(ctx, info)
	Watchdog.UpdateSmoke(info)
	CollectionService:AddTag(model, CFG.Tag)
	VehicleService.VehicleSpawned:Fire(player, model)
	return info
end

ctx.Despawn = function(info, _reason: string?)
	local model: Model = info.Model
	if ctx.Cars[model] ~= info then
		return
	end
	ctx.SaveInfo(info)
	pcall(Occupancy.EjectAll, ctx, info)
	ctx.Cars[model] = nil
	local s = ctx.ByOwner[info.Owner]
	if s and s[info.Kind] == info then
		s[info.Kind] = nil
	end
	info.Maid:Clean()
	model:Destroy()
end

ctx.EndTestDrive = function(info, reason: string?)
	local owner: Player = info.Owner
	local returnCF = info.TestReturn
	ctx.Despawn(info, reason)
	if not owner.Parent then
		return
	end
	if returnCF then
		task.delay(0.2, function()
			local char = owner.Character
			if not char then
				return
			end
			local world = Registry.Find("WorldService")
			if world and type(world.Teleport) == "function" then
				pcall(world.Teleport, world, owner, returnCF)
			else
				local anti = Registry.Find("AntiExploitService")
				if anti and anti.Whitelist then
					pcall(anti.Whitelist, anti, owner, 3)
				end
				char:PivotTo(returnCF)
			end
		end)
	end
	ctx.Notify(owner, reason == "time" and "🏁 Test drive over! Visit the dealership to buy it." or "🏁 Test drive ended.", "info", 5)
end

ctx.SetLocked = function(info, locked: boolean, by: Player?)
	local model: Model = info.Model
	model:SetAttribute("Locked", locked)
	if info.Kind == "Owned" and DataService:IsLoaded(info.Owner) and Garage.Entry(ctx, info.Owner, info.Uid) then
		DataService:Set(info.Owner, "Vehicles." .. info.Uid .. ".Locked", locked)
	end
	if by then
		ctx.Notify(by, locked and "🔒 Car locked" or "🔓 Car unlocked", "info", 2)
	end
end

ctx.OnOccupancyChanged = function(info)
	info.LastOccupancyChange = os.clock()
end

ctx.OnPedestrianHit = function(info, driver: Player, victim: Player)
	local root: BasePart = info.Root
	local mph = Units.StudsToMph(root.AssemblyLinearVelocity.Magnitude)
	if mph < CFG.Ram.MinSpeedMph then
		return
	end
	local now = os.clock()
	if now - (ctx.RamAt[driver] or 0) < CFG.Ram.Cooldown then
		return
	end
	local vroot = victim.Character and victim.Character:FindFirstChild("HumanoidRootPart")
	if not (vroot and vroot:IsA("BasePart")) or SafeZones.IsSafe(ctx.Find, vroot.Position) then
		return
	end
	ctx.RamAt[driver] = now
	ctx.Wanted[driver] = os.time() + CFG.Ram.WantedSeconds
	driver:SetAttribute("Wanted", true)
	ctx.Notify(driver, ("🚨 You hit %s! You're wanted by the police for %ds."):format(victim.DisplayName, CFG.Ram.WantedSeconds), "warning", 5)
	ctx.Notify(victim, ("You were hit by %s's car. The police have been notified."):format(driver.DisplayName), "info", 4)
end

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function defFor(modelId: any)
	if type(modelId) ~= "string" then
		return nil
	end
	local def = Cars[modelId]
	return type(def) == "table" and def or nil
end

local function hasPremiumPark(player: Player): boolean
	return Garage.HasPass(ctx, player, "PremiumCarPark")
end

local function normalisePaint(paint: any, def)
	local look = Looks.Default(def)
	if paint == nil then
		return look.Paint
	end
	local resolved = Looks.Resolve({ Paint = paint }, def)
	return resolved.Paint
end

local function finiteNumber(v: any): number?
	local n = tonumber(v)
	if n == nil or n ~= n or n == math.huge or n == -math.huge then
		return nil
	end
	return n
end

-- Finance records are owned by the dealership (Remaining, Payment, PaymentsLeft, Missed, Since, Total, ...).
-- Keep every DataStore-safe scalar field so its bookkeeping (first-payment grace, missed count) survives.
local function cleanFinance(f: any)
	if type(f) ~= "table" then
		return false
	end
	local remaining = finiteNumber(f.Remaining)
	if not remaining or remaining <= 0 then
		return false
	end
	local out = {}
	for k, v in pairs(f) do
		if type(k) == "string" and not k:find("%.") then
			if type(v) == "number" then
				local n = finiteNumber(v)
				if n then
					out[k] = n
				end
			elseif type(v) == "boolean" or type(v) == "string" then
				out[k] = v
			end
		end
	end
	out.Remaining = math.floor(remaining)
	out.Payment = math.max(0, math.floor(finiteNumber(f.Payment) or 0))
	out.PaymentsLeft = math.max(0, math.floor(finiteNumber(f.PaymentsLeft) or 0))
	return out
end

local function buildFor(player: Player, def, look, name: string)
	local model, B = CarBuilder.Build(def.Id, look, { Name = name })
	if not model then
		return nil, nil
	end
	model:SetAttribute("OwnerUserId", player.UserId)
	model:SetAttribute("OwnerName", player.DisplayName)
	return model, B
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function VehicleService:GetGarageSlots(player: Player): number
	return Garage.Slots(ctx, player)
end

function VehicleService:GetOwnedCount(player: Player): number
	return Garage.Count(ctx, player)
end

function VehicleService:GetVehicleInfo(model: Model)
	return ctx.Cars[model]
end

function VehicleService:GrantVehicle(player: Player, modelId: string, opts: { [string]: any }?): string?
	local def = defFor(modelId)
	if not def or not DataService:IsLoaded(player) then
		return nil
	end
	local o = opts or {}
	if not o.IgnoreLimit and Garage.Count(ctx, player) >= Garage.Slots(ctx, player) then
		ctx.Notify(player, "🅿️ Your garage is full! Sell a car or get more slots.", "warning", 5)
		return nil
	end
	local n = DataService:Get(player, "NextVehicleNumber") or 1
	local uid = "v_" .. tostring(n)
	while Garage.Entry(ctx, player, uid) do
		n += 1
		uid = "v_" .. tostring(n)
	end
	DataService:Set(player, "NextVehicleNumber", n + 1)
	local look = Looks.Default(def)
	local rimStyle = Looks.RimStyle(look.Rims)
	local value = finiteNumber(o.Value)
	local entry = {
		ModelId = def.Id,
		Value = math.clamp(math.floor(value or def.Price or 0), 0, 1e9),
		Paint = normalisePaint(o.Paint, def),
		Rims = look.Rims,
		RimColor = { rimStyle.Color[1], rimStyle.Color[2], rimStyle.Color[3] },
		Tint = look.Tint,
		BodyKit = "Stock",
		Spoiler = look.Spoiler,
		Underglow = false,
		Plate = Plates.Clean(o.Plate) or Plates.Generate(),
		Upgrades = { Engine = 0, Turbo = 0, Brakes = 0, Suspension = 0, Transmission = 0 },
		Fuel = 1,
		Mileage = 0,
		Health = 100,
		PurchasedAt = os.time(),
		Finance = cleanFinance(o.Finance),
		Locked = CFG.Garage.LockOnSpawn,
	}
	DataService:Set(player, "Vehicles." .. uid, entry)
	local fav = DataService:Get(player, "FavoriteVehicle")
	if type(fav) ~= "string" or fav == "" then
		DataService:Set(player, "FavoriteVehicle", uid)
	end
	return uid
end

function VehicleService:RemoveVehicle(player: Player, uid: string): boolean
	if type(uid) ~= "string" or not Garage.Entry(ctx, player, uid) then
		return false
	end
	local info = ctx.InfoForUid(player, uid)
	if info then
		info.Kind = "Removed" -- don't write stats back for a car that no longer exists
		local s = ctx.ByOwner[player]
		if s and s.Owned == info then
			s.Owned = nil
		end
		pcall(Occupancy.EjectAll, ctx, info)
		ctx.Cars[info.Model] = nil
		info.Maid:Clean()
		info.Model:Destroy()
	end
	DataService:Set(player, "Vehicles." .. uid, nil)
	if DataService:Get(player, "FavoriteVehicle") == uid then
		DataService:Set(player, "FavoriteVehicle", "")
	end
	Showcase.Refresh(player) -- the sold / removed car may have been on the showroom pad
	return true
end

local function spawnOwned(player: Player, uid: string, cframe: CFrame?, preferRoad: boolean?): (Model?, string?)
	if type(uid) ~= "string" then
		return nil, "Unknown car"
	end
	local entry = Garage.Entry(ctx, player, uid)
	local def = entry and defFor(entry.ModelId)
	if not (entry and def) then
		return nil, "You don't own that car"
	end
	if def.VipOnly and not Garage.HasPass(ctx, player, "VIP") then
		return nil, "This car needs the VIP pass ⭐"
	end
	local active = ctx.ActiveInfo(player)
	if active and active.Uid == uid then
		if cframe and next(active.Occupants) == nil then
			local pivot = Spawner.PlaceAt(cframe, active.B, { active.Model })
			active.ServerMoveUntil = os.clock() + 1
			active.Model:PivotTo(pivot)
			active.LastPos = active.Root.Position
		end
		return active.Model
	end
	local look = Looks.Resolve(entry, def)
	local plate = Plates.Clean(entry.Plate)
	if not plate then
		plate = Plates.Generate()
		DataService:Set(player, "Vehicles." .. uid .. ".Plate", plate)
	end
	look.Plate = plate
	local model, B = buildFor(player, def, look, uid)
	if not model then
		return nil, "That car couldn't be built"
	end
	local ignore = active and { active.Model } or nil
	local pivot
	if cframe then
		pivot = Spawner.PlaceAt(cframe, B, ignore)
	else
		pivot = Spawner.FindSpot(player, B, { Premium = hasPremiumPark(player), PreferRoad = preferRoad == true, Exclude = ignore })
	end
	if not pivot then
		model:Destroy()
		return nil, "No free space nearby — try somewhere more open"
	end
	if active then
		ctx.Despawn(active, "replaced")
	end
	model:PivotTo(pivot)
	model:SetAttribute("CarUid", uid)
	model:SetAttribute("IsJobVehicle", false)
	model:SetAttribute("IsTestDrive", false)
	local locked = entry.Locked
	if type(locked) ~= "boolean" then
		locked = CFG.Garage.LockOnSpawn
	end
	model:SetAttribute("Locked", locked)
	local fuel = math.clamp(tonumber(entry.Fuel) or 1, 0, 1)
	local health = math.clamp(tonumber(entry.Health) or 100, 0, 100)
	model:SetAttribute("Fuel", fuel)
	model:SetAttribute("Health", health)
	model:SetAttribute("EngineDead", health <= CFG.Damage.EngineDeadAt)
	applyUpgradeAttributes(model, entry)
	model.Parent = carsFolder
	register(player, model, B, "Owned", uid, def, entry)
	return model
end

function VehicleService:SpawnVehicle(player: Player, uid: string, cframe: CFrame?): (Model?, string?)
	if cframe ~= nil and typeof(cframe) ~= "CFrame" then
		cframe = nil
	end
	return spawnOwned(player, uid, cframe, false)
end

function VehicleService:DespawnVehicle(player: Player)
	local info = ctx.ActiveInfo(player)
	if info then
		ctx.Despawn(info, "despawn")
	end
end

function VehicleService:GetActiveVehicle(player: Player): Model?
	local info = ctx.ActiveInfo(player)
	return info and info.Model or nil
end

function VehicleService:GetOccupiedVehicle(player: Player): (Model?, BasePart?)
	local seat = Occupancy.SeatOf(player)
	if not seat then
		return nil, nil
	end
	local info = ctx.InfoFromPart(seat)
	if info then
		return info.Model, seat
	end
	return nil, nil
end

function VehicleService:SpawnJobVehicle(player: Player, modelId: string, cframe: CFrame): Model?
	local def = defFor(modelId)
	if not def or typeof(cframe) ~= "CFrame" then
		return nil
	end
	self:DespawnJobVehicle(player)
	local look = Looks.Default(def)
	look.Plate = Plates.ForJob(modelId, player.UserId)
	local model, B = buildFor(player, def, look, "job_" .. player.UserId)
	if not model then
		return nil
	end
	model:PivotTo(Spawner.PlaceNear(cframe, B))
	model:SetAttribute("CarUid", "job_" .. player.UserId)
	model:SetAttribute("IsJobVehicle", true)
	model:SetAttribute("IsTestDrive", false)
	model:SetAttribute("Locked", false)
	model:SetAttribute("Fuel", 1)
	model:SetAttribute("Health", 100)
	applyUpgradeAttributes(model, nil)
	model.Parent = carsFolder
	register(player, model, B, "Job", "job_" .. player.UserId, def, nil)
	return model
end

function VehicleService:DespawnJobVehicle(player: Player)
	local s = ctx.ByOwner[player]
	if s and s.Job then
		ctx.Despawn(s.Job, "job")
	end
end

function VehicleService:SpawnTestDrive(player: Player, modelId: string, cframe: CFrame, seconds: number?): Model?
	local def = defFor(modelId)
	if not def or typeof(cframe) ~= "CFrame" then
		return nil
	end
	local s = slotFor(player)
	if s.Test then
		ctx.Despawn(s.Test, "replaced")
	end
	local duration = math.clamp(tonumber(seconds) or 60, 10, 900)
	local look = Looks.Default(def)
	look.Plate = CFG.TestDrive.Plate .. " " .. tostring(player.UserId % 1000)
	local model, B = buildFor(player, def, look, "test_" .. player.UserId)
	if not model then
		return nil
	end
	model:PivotTo(Spawner.PlaceNear(cframe, B))
	model:SetAttribute("CarUid", "test_" .. player.UserId)
	model:SetAttribute("IsJobVehicle", false)
	model:SetAttribute("IsTestDrive", true)
	model:SetAttribute("Locked", false)
	model:SetAttribute("Fuel", 1)
	model:SetAttribute("Health", 100)
	model:SetAttribute("TestEndsAt", os.time() + duration)
	applyUpgradeAttributes(model, nil)
	model.Parent = carsFolder
	local info = register(player, model, B, "Test", "test_" .. player.UserId, def, nil)
	info.TestEnds = os.clock() + duration + 3 -- small grace: the dealership ends its own session first
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		info.TestReturn = root.CFrame
	end
	-- put the player behind the wheel
	task.defer(function()
		local char = player.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 and info.DriveSeat and ctx.Cars[model] == info then
			if hum.SeatPart then
				hum.Sit = false
			end
			local anti = Registry.Find("AntiExploitService")
			if anti and anti.Whitelist then
				pcall(anti.Whitelist, anti, player, 4)
			end
			char:PivotTo(info.DriveSeat.CFrame + Vector3.new(0, 3, 0))
			info.DriveSeat:Sit(hum)
		end
	end)
	ctx.Notify(player, ("🚗 Test drive: %s — %s"):format(def.Name, Format.Duration(duration)), "info", 4)
	return model
end

function VehicleService:BuildDisplay(modelId: string, cframe: CFrame, look: any?): Model
	local def = defFor(modelId)
	assert(def, "BuildDisplay: unknown model id " .. tostring(modelId))
	local resolved = Looks.Resolve(type(look) == "table" and look or nil, def)
	if resolved.Plate == "" then
		resolved.Plate = "SKY " .. Looks.Brand(def.Brand).Short
	end
	local model = CarBuilder.Build(modelId, resolved, { Name = "Display_" .. modelId })
	assert(model, "BuildDisplay: build failed for " .. tostring(modelId))
	if typeof(cframe) == "CFrame" then
		model:PivotTo(cframe)
	end
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("Seat") or d:IsA("VehicleSeat") then
			(d :: any).Disabled = true
		elseif d:IsA("ProximityPrompt") then
			d:Destroy()
		end
	end
	if model.PrimaryPart then
		model.PrimaryPart.Anchored = true
	end
	model:SetAttribute("IsDisplay", true)
	CollectionService:AddTag(model, CFG.Tag)
	model.Parent = displayFolder
	return model
end

function VehicleService:RefreshLook(player: Player, uid: string)
	local entry = Garage.Entry(ctx, player, uid)
	if entry and entry.Showcase == true then
		Showcase.Refresh(player) -- rebuild the showroom copy with the new paint / parts
	end
	local info = ctx.InfoForUid(player, uid)
	if not (entry and info) then
		return
	end
	local look = Looks.Resolve(entry, info.Def)
	look.Plate = Plates.Clean(entry.Plate) or info.Model:GetAttribute("Plate") or ""
	CarLooks.Apply(info.Model, look, info.Def, info.B)
	applyUpgradeAttributes(info.Model, entry)
end

function VehicleService:Repair(player: Player, uid: string, amount: number?)
	local add = (type(amount) == "number" and amount > 0) and amount or 100
	local entry = Garage.Entry(ctx, player, uid)
	local info = ctx.InfoForUid(player, uid)
	if not entry and not info then
		return false
	end
	local current = info and info.Health or tonumber(entry.Health) or 100
	local new = math.min(100, current + add)
	if entry then
		DataService:Set(player, "Vehicles." .. uid .. ".Health", new)
	end
	if info then
		info.Health = new
		info.Model:SetAttribute("Health", new)
		if new > CFG.Damage.EngineDeadAt then
			info.Model:SetAttribute("EngineDead", false)
		end
		Watchdog.UpdateSmoke(info)
	end
	return true
end

function VehicleService:GetCarValue(player: Player, uid: string): number
	return Garage.Value(ctx, player, uid)
end

---------------------------------------------------------------------------
-- Call your car
---------------------------------------------------------------------------
local function callCar(player: Player, uid: string)
	local now = os.clock()
	if (ctx.CallReadyAt[player] or 0) > now then
		return { ok = false, err = ("You can call your car again in %ds"):format(math.ceil(ctx.CallReadyAt[player] - now)) }
	end
	local entry = Garage.Entry(ctx, player, uid)
	if not entry then
		return { ok = false, err = "You don't own that car" }
	end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if not root then
		return { ok = false, err = "Respawn first" }
	end
	local info = ctx.ActiveInfo(player)
	if info and info.Uid == uid then
		if next(info.Occupants) ~= nil then
			return { ok = false, err = "Someone is in your car" }
		end
		if (info.Root.Position - root.Position).Magnitude < CFG.Call.MinDistance then
			return { ok = false, err = "Your car is already right here" }
		end
	end
	ctx.CallReadyAt[player] = now + CFG.Call.Cooldown
	task.delay(CFG.Call.Delay, function()
		if not player.Parent then
			return
		end
		local current = ctx.ActiveInfo(player)
		if current and current.Uid == uid then
			if next(current.Occupants) ~= nil or not current.Model.Parent then
				return
			end
			local pivot = Spawner.FindSpot(player, current.B, {
				Premium = hasPremiumPark(player),
				PreferRoad = true,
				Exclude = { current.Model },
			})
			if not pivot then
				ctx.Notify(player, "Your car couldn't find a spot near you — try a more open area", "warning", 4)
				ctx.CallReadyAt[player] = 0
				return
			end
			current.Root.Anchored = true
			current.ServerMoveUntil = os.clock() + 1
			current.Model:PivotTo(pivot)
			current.Sleeping = true
			current.LastPos = current.Root.Position
			ctx.Notify(player, "🚗 Your car has arrived!", "success", 3)
		else
			local _, err = spawnOwned(player, uid, nil, true)
			if err then
				ctx.Notify(player, err, "error", 4)
				ctx.CallReadyAt[player] = 0
			else
				ctx.Notify(player, "🚗 Your car has arrived!", "success", 3)
			end
		end
	end)
	return { ok = true, Eta = CFG.Call.Delay }
end

---------------------------------------------------------------------------
-- Remote "Vehicle"
---------------------------------------------------------------------------
local function uidArg(payload): string?
	return Guard.Id(payload and payload.Uid, 24)
end

local actions = {}

function actions.List(player: Player)
	if not DataService:IsLoaded(player) then
		return { ok = false, err = "Loading…" }
	end
	local payload = Garage.ListPayload(ctx, player)
	local perks = Showcase.Info(player)
	payload.Vip = perks.Vip
	payload.VipBay = perks.VipBay
	payload.ShowcaseUid = perks.ShowcaseUid
	payload.ShowcaseLive = perks.ShowcaseLive
	payload.ok = true
	return payload
end

function actions.Spawn(player: Player, payload)
	local uid = uidArg(payload)
	if not uid then
		return { ok = false, err = "Bad request" }
	end
	local now = os.clock()
	if (ctx.SpawnReadyAt[player] or 0) > now then
		return { ok = false, err = "Slow down!" }
	end
	ctx.SpawnReadyAt[player] = now + CFG.Spawn.Cooldown
	if not (player.Character and player.Character:FindFirstChild("HumanoidRootPart")) then
		return { ok = false, err = "Respawn first" }
	end
	local model, err = VehicleService:SpawnVehicle(player, uid)
	if not model then
		return { ok = false, err = err or "Couldn't spawn your car" }
	end
	return { ok = true, Position = model:GetPivot().Position }
end

function actions.Despawn(player: Player)
	if not ctx.ActiveInfo(player) then
		return { ok = false, err = "No car is out" }
	end
	VehicleService:DespawnVehicle(player)
	return { ok = true }
end

function actions.Call(player: Player, payload)
	local uid = uidArg(payload)
	if not uid then
		return { ok = false, err = "Bad request" }
	end
	return callCar(player, uid)
end

function actions.SetFavorite(player: Player, payload)
	local uid = uidArg(payload)
	if not uid or not Garage.Entry(ctx, player, uid) then
		return { ok = false, err = "You don't own that car" }
	end
	local current = DataService:Get(player, "FavoriteVehicle")
	DataService:Set(player, "FavoriteVehicle", current == uid and "" or uid)
	return { ok = true, Favorite = current ~= uid }
end

function actions.Lock(player: Player, payload)
	local info = ctx.ActiveInfo(player) or (ctx.ByOwner[player] and ctx.ByOwner[player].Job)
	if not info then
		return { ok = false, err = "No car is out" }
	end
	local want = Guard.Bool(payload.Locked)
	if want == nil then
		want = not (info.Model:GetAttribute("Locked") == true)
	end
	ctx.SetLocked(info, want, nil)
	return { ok = true, Locked = want }
end

function actions.Locate(player: Player, payload)
	local info = ctx.ActiveInfo(player)
	local uid = payload and Guard.Id(payload.Uid, 24)
	if uid and (not info or info.Uid ~= uid) then
		info = ctx.InfoForUid(player, uid)
	end
	if not info or not info.Model.Parent then
		return { ok = false, err = "That car isn't out right now" }
	end
	return { ok = true, Position = info.Root.Position, Name = info.Def.Name }
end

function actions.Sell(player: Player, payload)
	local uid = uidArg(payload)
	local entry = uid and Garage.Entry(ctx, player, uid)
	local def = entry and defFor(entry.ModelId)
	if not (uid and entry and def) then
		return { ok = false, err = "You don't own that car" }
	end
	local payout, gross, owed = Garage.Resale(ctx, player, uid)
	if owed > 0 and payout < 0 then
		return { ok = false, err = ("You still owe %s on this car — that's more than it's worth. Pay off the finance first."):format(Format.Money(owed)) }
	end
	if gross <= 0 then
		return { ok = false, err = "This car can't be sold" }
	end
	if not VehicleService:RemoveVehicle(player, uid) then
		return { ok = false, err = "Couldn't sell that car" }
	end
	if payout > 0 then
		EconomyService:AddCash(player, payout, "Sell:Car:" .. def.Id)
	end
	ctx.Notify(player, ("💰 Sold your %s for %s%s"):format(def.Name, Format.Money(payout), owed > 0 and (" (after paying off %s of finance)"):format(Format.Money(owed)) or ""), "money", 5)
	return { ok = true, Payout = payout }
end

function actions.GiveKey(player: Player, payload)
	local userId = Guard.Int(payload.UserId, 1, 1e12)
	local info = ctx.ActiveInfo(player)
	if not (userId and info) then
		return { ok = false, err = "No car is out" }
	end
	local target = Players:GetPlayerByUserId(userId)
	if not target or target == player then
		return { ok = false, err = "That player isn't here" }
	end
	local count = 0
	for _ in pairs(info.Keyholders) do
		count += 1
	end
	if count >= CFG.Garage.MaxKeyholders then
		return { ok = false, err = "Too many keyholders" }
	end
	info.Keyholders[userId] = true
	ctx.Notify(target, ("🔑 %s gave you the keys to their %s"):format(player.DisplayName, info.Def.Name), "info", 4)
	return { ok = true }
end

function actions.ParkVip(player: Player, payload)
	local uid = uidArg(payload)
	if not uid then
		return { ok = false, err = "Bad request" }
	end
	if not (player.Character and player.Character:FindFirstChild("HumanoidRootPart")) then
		return { ok = false, err = "Respawn first" }
	end
	return Showcase.ParkVip(player, uid)
end

function actions.SetShowcase(player: Player, payload)
	local uid = nil
	if type(payload) == "table" and payload.Uid ~= nil and payload.Uid ~= "" then
		uid = uidArg(payload)
		if not uid then
			return { ok = false, err = "Bad request" }
		end
	end
	return Showcase.SetShowcase(player, uid)
end

function actions.RevokeKeys(player: Player)
	local info = ctx.ActiveInfo(player)
	if info then
		table.clear(info.Keyholders)
	end
	return { ok = true }
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
local function folder(name: string): Folder
	local f = Workspace:FindFirstChild(name)
	if not f then
		f = Instance.new("Folder")
		f.Name = name
		f.Parent = Workspace
	end
	return f :: Folder
end

function VehicleService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	ctx.Data = DataService
	carsFolder = folder(CFG.FolderName)
	displayFolder = folder(CFG.DisplayFolderName)
	SafeZones.Init(ctx.Find)
	Showcase.Init({
		Data = DataService,
		HasPass = function(player: Player, key: string): boolean
			return Garage.HasPass(ctx, player, key)
		end,
		BuildDisplay = function(modelId: string, cf: CFrame, look)
			return VehicleService:BuildDisplay(modelId, cf, look)
		end,
		SpawnAt = function(player: Player, uid: string, cf: CFrame)
			return spawnOwned(player, uid, cf, false)
		end,
		ActiveInfo = ctx.ActiveInfo,
		Notify = ctx.Notify,
	})
	DataService:OnLoaded(function(player: Player)
		task.defer(Showcase.Refresh, player)
	end)

	Net.HandleActions("Vehicle", actions, {
		rate = 8,
		burst = 14,
		perAction = {
			List = { rate = 2, burst = 4 },
			Spawn = { rate = 0.5, burst = 2 },
			Call = { rate = 0.25, burst = 2 },
			Sell = { rate = 0.5, burst = 2 },
			GiveKey = { rate = 0.5, burst = 2 },
			ParkVip = { rate = 0.25, burst = 2 },
			SetShowcase = { rate = 0.5, burst = 2 },
		},
	})
	Net.On("VehicleAction", function(player, action, a, b)
		CarActions.Handle(ctx, player, action, a, b)
	end, { rate = 20, burst = 30 })
	Net.On("VehicleTelemetry", function(player, payload, gear, brake, reverse)
		CarActions.Telemetry(ctx, player, payload, gear, brake, reverse)
	end, { rate = 8, burst = 12, unreliable = true })

	-- write live fuel / mileage / health into the save before it is released (synchronous)
	DataService.Releasing:Connect(function(player)
		local s = ctx.ByOwner[player]
		if s and s.Owned then
			ctx.SaveInfo(s.Owned)
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		Showcase.PlayerRemoving(player)
		local s = ctx.ByOwner[player]
		if s then
			for _, kind in ipairs({ "Owned", "Job", "Test" }) do
				local info = s[kind]
				if info then
					ctx.Despawn(info, "left")
				end
			end
		end
		ctx.ByOwner[player] = nil
		ctx.CallReadyAt[player] = nil
		ctx.SpawnReadyAt[player] = nil
		ctx.RamAt[player] = nil
		ctx.Wanted[player] = nil
		for _, info in pairs(ctx.Cars) do
			info.Keyholders[player.UserId] = nil
		end
	end)
end

function VehicleService:Start()
	SafeZones.Start(ctx.Find)
	Watchdog.Start(ctx)
	-- a Premium Car Park bought mid-session shows the saved showroom choice straight away
	local mon = Registry.Find("MonetizationService")
	if mon and mon.PassGranted then
		mon.PassGranted:Connect(function(player: Player, key: string)
			if key == "PremiumCarPark" then
				Showcase.Refresh(player)
			end
		end)
	end
end

return VehicleService
