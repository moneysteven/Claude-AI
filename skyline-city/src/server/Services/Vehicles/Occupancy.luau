-- Occupancy: who sits in a car and what that means (server).
--
--   Occupancy.Setup(ctx, info)                 seats, entry prompts, ram detection; returns nothing (uses info.Maid)
--   Occupancy.CanUse(ctx, info, player, asDriver) -> (bool, reason?)
--   Occupancy.Enter(ctx, info, player, door)   prompt handler: picks a seat and sits the player
--   Occupancy.Eject(ctx, info, player, notice?) / Occupancy.ExitSafely(ctx, info, player)
--   Occupancy.EjectAll(ctx, info)
--   Occupancy.Sleep(info) / Occupancy.Wake(info)   anchored parking (no physics cost) / unanchor
--   Occupancy.SeatOf(player) -> (Seat?, Humanoid?)
--
-- Network ownership: the DriveSeat occupant owns the physics; empty cars go back to the server and are
-- snapped to ride height + anchored once slow (see Watchdog).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local VehiclesConfig = require(Shared.Config.Vehicles)
local Units = require(Shared.Vehicle.Units)

local Spawner = require(script.Parent.Spawner)

local Occupancy = {}

local G = VehiclesConfig.Garage
local I = VehiclesConfig.Interaction

function Occupancy.SeatOf(player: Player): (BasePart?, Humanoid?)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum and hum.SeatPart then
		return hum.SeatPart, hum
	end
	return nil, hum
end

local function isKeyholder(ctx, info, player: Player): boolean
	local owner = info.Owner
	if owner == player then
		return true
	end
	if info.Keyholders and info.Keyholders[player.UserId] then
		return true
	end
	if G.GroupMembersHaveKeys and owner then
		local a, b = owner:GetAttribute("GroupName"), player:GetAttribute("GroupName")
		if type(a) == "string" and a ~= "" and a == b then
			return true
		end
	end
	return false
end
Occupancy.IsKeyholder = isKeyholder

function Occupancy.CanUse(ctx, info, player: Player, asDriver: boolean): (boolean, string?)
	-- cuffed players (Police job roleplay arrest) can't get into any vehicle, not even their own
	if player:GetAttribute("Cuffed") == true then
		return false, "You can't do that while handcuffed"
	end
	local owner = info.Owner
	if owner == player then
		return true
	end
	local mod = ctx.Find("ModerationService")
	if mod and owner and type(mod.IsBlocked) == "function" then
		local ok, blocked = pcall(mod.IsBlocked, mod, owner, player)
		if ok and blocked then
			return false, "You can't use this player's vehicle"
		end
	end
	local locked = info.Model:GetAttribute("Locked") == true
	if info.Kind ~= "Owned" then
		if asDriver then
			return false, "Only the assigned driver can drive this vehicle"
		end
		if locked then
			return false, "This vehicle is locked"
		end
		return true
	end
	if isKeyholder(ctx, info, player) then
		return true
	end
	if locked then
		return false, "This car is locked 🔒"
	end
	if asDriver and not G.AllowOthersToDriveUnlocked then
		return false, "Only the owner can drive this car"
	end
	return true
end

---------------------------------------------------------------------------
-- Sleep / wake
---------------------------------------------------------------------------
function Occupancy.Sleep(info)
	local root: BasePart = info.Root
	if info.Sleeping or not root.Parent then
		return
	end
	-- upright at ride height on whatever is under the car
	local pivot = info.Model:GetPivot()
	local look = Vector3.new(pivot.LookVector.X, 0, pivot.LookVector.Z)
	if look.Magnitude < 0.01 then
		look = Vector3.new(0, 0, -1)
	end
	local ground = Spawner.Ground(root.Position, { info.Model }, 0.2)
	local pos = ground and (ground + Vector3.new(0, 0.05, 0)) or pivot.Position
	if (pos - pivot.Position).Magnitude < 12 then
		root.AssemblyLinearVelocity = Vector3.zero
		root.AssemblyAngularVelocity = Vector3.zero
		info.ServerMoveUntil = os.clock() + 1
		info.Model:PivotTo(CFrame.lookAt(pos, pos + look.Unit))
	end
	root.Anchored = true
	info.Sleeping = true
	info.SlowSince = nil
	info.LastPos = root.Position
end

function Occupancy.Wake(info)
	local root: BasePart = info.Root
	if root.Anchored then
		root.Anchored = false
	end
	info.Sleeping = false
end

local function setDriver(ctx, info, player: Player?)
	local root: BasePart = info.Root
	local model: Model = info.Model
	if player then
		info.Driver = player
		info.EmptySince = nil
		info.SlowSince = nil
		Occupancy.Wake(info)
		local anti = ctx.Find("AntiExploitService")
		if anti and anti.Whitelist then
			pcall(anti.Whitelist, anti, player, 3)
		end
		local ok, err = pcall(function()
			root:SetNetworkOwner(player)
		end)
		if not ok then
			warn("[Vehicles] SetNetworkOwner failed:", err)
		end
		info.LastPos = root.Position
		info.LastAt = os.clock()
	else
		info.Driver = nil
		info.EmptySince = os.clock()
		model:SetAttribute("Horn", false)
		model:SetAttribute("Brake", false)
		model:SetAttribute("Reverse", false)
		model:SetAttribute("RPM", 0)
		model:SetAttribute("Gear", 0)
		model:SetAttribute("Engine", false)
		if model:GetAttribute("Indicator") ~= "Hazard" then
			model:SetAttribute("Indicator", "")
		end
		if not root.Anchored then
			pcall(function()
				root:SetNetworkOwner(nil)
			end)
		end
	end
end

local function stillSeated(player: Player): boolean
	local seat = Occupancy.SeatOf(player)
	return seat ~= nil
end

---------------------------------------------------------------------------
-- Exits
---------------------------------------------------------------------------
local function exitCFrame(info, seat: BasePart?): CFrame
	local root: BasePart = info.Root
	local pivot = info.Model:GetPivot()
	local door = seat and seat:GetAttribute("Door") or "FL"
	local side = (door == "FL" or door == "RL") and -1 or 1
	local localZ = seat and pivot:PointToObjectSpace(seat.Position).Z or 0
	local half = root.Size.X / 2 + 2.4
	local tries = {
		Vector3.new(side * half, 0, localZ),
		Vector3.new(-side * half, 0, localZ),
		Vector3.new(0, 0, root.Size.Z / 2 + 3),
		Vector3.new(0, 0, -(root.Size.Z / 2 + 3)),
	}
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { info.Model, Workspace.Terrain }
	params.RespectCanCollide = true
	params.MaxParts = 1
	for _, offset in ipairs(tries) do
		local world = pivot:PointToWorldSpace(offset)
		local ground = Spawner.Ground(world, { info.Model })
		local base = ground or world
		local centre = base + Vector3.new(0, 3, 0)
		if #Workspace:GetPartBoundsInBox(CFrame.new(centre), Vector3.new(2, 4.6, 2), params) == 0 then
			return CFrame.lookAt(centre, centre + (centre - pivot.Position) * Vector3.new(1, 0, 1))
		end
	end
	local top = pivot.Position + Vector3.new(0, (info.Model:GetExtentsSize()).Y + 3, 0)
	return CFrame.new(top)
end

function Occupancy.Eject(ctx, info, player: Player, notice: string?)
	local seat, hum = Occupancy.SeatOf(player)
	local char = player.Character
	if not (hum and char) then
		return
	end
	local target = exitCFrame(info, seat)
	if seat then
		for _, w in ipairs(seat:GetChildren()) do
			if w:IsA("Weld") and w.Name == "SeatWeld" then
				w:Destroy()
			end
		end
	end
	hum.Sit = false
	local anti = ctx.Find("AntiExploitService")
	if anti and anti.Whitelist then
		pcall(anti.Whitelist, anti, player, 2)
	end
	task.defer(function()
		if char.Parent and hum.Health > 0 then
			char:PivotTo(target)
			hum:ChangeState(Enum.HumanoidStateType.GettingUp)
		end
	end)
	if notice then
		ctx.Notify(player, notice, "warning", 3)
	end
end

function Occupancy.ExitSafely(ctx, info, player: Player)
	local root: BasePart = info.Root
	local speedMph = Units.StudsToMph(root.AssemblyLinearVelocity.Magnitude)
	if info.Driver == player and speedMph > I.ExitSpeedMph and not root.Anchored then
		-- stop the car first so nobody gets flung across the map. The driver's client owns the physics, so
		-- take ownership back before touching the velocity (writes to a client-owned assembly are ignored).
		pcall(function()
			root:SetNetworkOwner(nil)
		end)
		info.ServerMoveUntil = os.clock() + 1
		root.AssemblyLinearVelocity = root.AssemblyLinearVelocity * 0.2
		root.AssemblyAngularVelocity = root.AssemblyAngularVelocity * 0.2
	end
	Occupancy.Eject(ctx, info, player)
end

function Occupancy.EjectAll(ctx, info)
	for player in pairs(info.Occupants) do
		Occupancy.Eject(ctx, info, player)
	end
	-- NPC passengers (taxi fares etc.)
	for _, seat in ipairs(info.Seats) do
		local occ = (seat :: any).Occupant
		if occ then
			for _, w in ipairs(seat:GetChildren()) do
				if w:IsA("Weld") and w.Name == "SeatWeld" then
					w:Destroy()
				end
			end
			occ.Sit = false
		end
	end
end

---------------------------------------------------------------------------
-- Entry
---------------------------------------------------------------------------
local function freeSeat(seat: BasePart): boolean
	return (seat :: any).Occupant == nil and not (seat :: any).Disabled
end

function Occupancy.Enter(ctx, info, player: Player, door: string)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not hum or hum.Health <= 0 then
		return
	end
	if hum.SeatPart then
		return
	end
	local root: BasePart = info.Root
	if Units.StudsToMph(root.AssemblyLinearVelocity.Magnitude) > 12 then
		ctx.Notify(player, "Wait for the vehicle to stop", "warning", 2)
		return
	end
	-- choose a seat: driver door → DriveSeat (if allowed + free), else passenger seats by door
	local candidates = {}
	local driveSeat = info.DriveSeat
	if door == "FL" and driveSeat and freeSeat(driveSeat) then
		local ok = Occupancy.CanUse(ctx, info, player, true)
		if ok then
			table.insert(candidates, driveSeat)
		end
	end
	for _, seat in ipairs(info.Seats) do
		if seat ~= driveSeat and freeSeat(seat) and seat:GetAttribute("Door") == door then
			table.insert(candidates, seat)
		end
	end
	for _, seat in ipairs(info.Seats) do
		if seat ~= driveSeat and freeSeat(seat) and not table.find(candidates, seat) then
			table.insert(candidates, seat)
		end
	end
	if #candidates == 0 and driveSeat and freeSeat(driveSeat) and door ~= "FL" then
		local ok = Occupancy.CanUse(ctx, info, player, true)
		if ok then
			table.insert(candidates, driveSeat)
		end
	end
	local seat = candidates[1]
	if not seat then
		ctx.Notify(player, "No free seats", "info", 2)
		return
	end
	local ok, reason = Occupancy.CanUse(ctx, info, player, seat == driveSeat)
	if not ok then
		ctx.Notify(player, reason or "You can't use this vehicle", "warning", 3)
		return
	end
	local anti = ctx.Find("AntiExploitService")
	if anti and anti.Whitelist then
		pcall(anti.Whitelist, anti, player, 3)
	end
	if info.Sleeping and seat == driveSeat then
		Occupancy.Wake(info)
	end
	pcall(function()
		(seat :: any):Sit(hum)
	end)
end

---------------------------------------------------------------------------
-- Setup
---------------------------------------------------------------------------
local function promptFor(ctx, info, att: Attachment)
	local door = att:GetAttribute("Door") or "FL"
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "EnterPrompt"
	prompt.ActionText = door == "FL" and "Drive" or "Ride"
	prompt.ObjectText = info.Def.Name or "Vehicle"
	prompt.MaxActivationDistance = I.EntryPromptDistance
	prompt.HoldDuration = 0
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Exclusivity = Enum.ProximityPromptExclusivity.OnePerButton
	prompt.UIOffset = Vector2.new(0, 0)
	prompt.Parent = att
	info.Maid:Give(prompt.Triggered:Connect(function(player)
		Occupancy.Enter(ctx, info, player, door)
	end))
	table.insert(info.Prompts, prompt)
end

function Occupancy.Setup(ctx, info)
	local model: Model = info.Model
	local root: BasePart = info.Root
	info.Seats = {}
	info.Occupants = {}
	info.Prompts = {}
	local seatOcc: { [BasePart]: Player } = {}
	local drive = model:FindFirstChild("DriveSeat")
	if drive and drive:IsA("VehicleSeat") then
		info.DriveSeat = drive
		table.insert(info.Seats, drive)
	end
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("Seat") then
			table.insert(info.Seats, d)
		end
	end

	local function onOccupant(seat: BasePart)
		local hum: Humanoid? = (seat :: any).Occupant
		local prev = seatOcc[seat]
		if prev and (not hum or Players:GetPlayerFromCharacter(hum.Parent) ~= prev) then
			seatOcc[seat] = nil
			if info.Occupants[prev] == seat then
				info.Occupants[prev] = nil
			end
			if seat == info.DriveSeat and info.Driver == prev then
				setDriver(ctx, info, nil)
			end
			task.defer(function()
				if prev.Parent and not stillSeated(prev) then
					prev:SetAttribute("InVehicle", false)
					prev:SetAttribute("Seatbelt", false)
				end
			end)
			ctx.OnOccupancyChanged(info)
		end
		if not hum then
			return
		end
		local player = Players:GetPlayerFromCharacter(hum.Parent)
		if not player then
			return -- NPC passengers (taxi fares) are always allowed
		end
		if seatOcc[seat] == player then
			return
		end
		local isDriver = seat == info.DriveSeat
		local ok, reason = Occupancy.CanUse(ctx, info, player, isDriver)
		if not ok then
			task.defer(function()
				Occupancy.Eject(ctx, info, player, reason)
			end)
			return
		end
		seatOcc[seat] = player
		info.Occupants[player] = seat
		player:SetAttribute("InVehicle", true)
		if isDriver then
			setDriver(ctx, info, player)
		end
		ctx.OnOccupancyChanged(info)
	end

	for _, seat in ipairs(info.Seats) do
		info.Maid:Give(seat:GetPropertyChangedSignal("Occupant"):Connect(function()
			onOccupant(seat)
		end))
	end
	info.Maid:Give(function()
		for seat, player in pairs(seatOcc) do
			seatOcc[seat] = nil
			if player.Parent then
				task.defer(function()
					if not stillSeated(player) then
						player:SetAttribute("InVehicle", false)
						player:SetAttribute("Seatbelt", false)
					end
				end)
			end
		end
	end)

	for _, c in ipairs(root:GetChildren()) do
		if c:IsA("Attachment") and c.Name:sub(1, 6) == "Entry_" then
			promptFor(ctx, info, c)
		end
	end

	-- hitting pedestrians at speed outside a safe zone makes the driver Wanted (police roleplay)
	info.Maid:Give(root.Touched:Connect(function(hit)
		local driver = info.Driver
		if not driver then
			return
		end
		local victimChar = hit:FindFirstAncestorOfClass("Model")
		local victim = victimChar and Players:GetPlayerFromCharacter(victimChar)
		if not victim or victim == driver or info.Occupants[victim] then
			return
		end
		ctx.OnPedestrianHit(info, driver, victim)
	end))
end

return Occupancy
