-- SafeZones: anti-griefing collision groups (server).
--
--   SafeZones.Init(find)           registers collision groups "Vehicles", "Characters", "SafeCharacters"
--                                  (Vehicles never collide with SafeCharacters)
--   SafeZones.Start(find)          every Config.Vehicles.SafeZone.CheckInterval seconds, characters inside a safe zone
--                                  are moved to SafeCharacters (cars pass through them) and back to Characters outside
--   SafeZones.IsSafe(find, pos)    WorldService:IsInSafeZone when available, else SafeZone-tagged volumes
--
-- `find` is Registry.Find (optional peers).

local CollectionService = game:GetService("CollectionService")
local PhysicsService = game:GetService("PhysicsService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local VehiclesConfig = require(Shared.Config.Vehicles)

local SafeZones = {}

local PHYS = VehiclesConfig.Physics
local state: { [Player]: { safe: boolean, char: Model?, conn: RBXScriptConnection? } } = {}

local function register(name: string)
	local ok, registered = pcall(function()
		return PhysicsService:IsCollisionGroupRegistered(name)
	end)
	if ok and registered then
		return
	end
	local ok2, err = pcall(function()
		PhysicsService:RegisterCollisionGroup(name)
	end)
	if not ok2 then
		warn("[SafeZones] could not register collision group " .. name .. ": " .. tostring(err))
	end
end

function SafeZones.Init(_find)
	register(PHYS.CollisionGroup)
	register(PHYS.CharacterGroup)
	register(PHYS.SafeCharacterGroup)
	pcall(function()
		PhysicsService:CollisionGroupSetCollidable(PHYS.CollisionGroup, PHYS.SafeCharacterGroup, false)
		PhysicsService:CollisionGroupSetCollidable(PHYS.CollisionGroup, PHYS.CharacterGroup, true)
		PhysicsService:CollisionGroupSetCollidable(PHYS.CollisionGroup, PHYS.CollisionGroup, true)
	end)
end

local function inVolume(part: BasePart, pos: Vector3): boolean
	local lp = part.CFrame:PointToObjectSpace(pos)
	local h = part.Size / 2
	return math.abs(lp.X) <= h.X and math.abs(lp.Y) <= h.Y + 4 and math.abs(lp.Z) <= h.Z
end

function SafeZones.IsSafe(find, pos: Vector3): boolean
	local world = find and find("WorldService")
	if world and type(world.IsInSafeZone) == "function" then
		local ok, safe = pcall(world.IsInSafeZone, world, pos)
		if ok then
			return safe == true
		end
	end
	for _, z in ipairs(CollectionService:GetTagged(World.Tags.SafeZone)) do
		if z:IsA("BasePart") and inVolume(z, pos) then
			return true
		end
	end
	return false
end

local function applyGroup(char: Model, group: string)
	for _, d in ipairs(char:GetDescendants()) do
		if d:IsA("BasePart") then
			d.CollisionGroup = group
		end
	end
end

local function update(find, player: Player)
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	local s = state[player]
	if not s then
		s = { safe = false, char = nil, conn = nil }
		state[player] = s
	end
	if not (char and root and root:IsA("BasePart")) then
		return
	end
	local safe = SafeZones.IsSafe(find, root.Position)
	local world = find and find("WorldService")
	if not (world and type(world.IsInSafeZone) == "function") then
		if player:GetAttribute("InSafeZone") ~= safe then
			player:SetAttribute("InSafeZone", safe)
		end
	end
	if s.char ~= char then
		if s.conn then
			s.conn:Disconnect()
		end
		s.char = char
		s.safe = safe
		applyGroup(char, safe and PHYS.SafeCharacterGroup or PHYS.CharacterGroup)
		s.conn = char.DescendantAdded:Connect(function(d)
			if d:IsA("BasePart") then
				d.CollisionGroup = s.safe and PHYS.SafeCharacterGroup or PHYS.CharacterGroup
			end
		end)
		return
	end
	if s.safe ~= safe then
		s.safe = safe
		applyGroup(char, safe and PHYS.SafeCharacterGroup or PHYS.CharacterGroup)
	end
end

function SafeZones.Start(find)
	Players.PlayerRemoving:Connect(function(player)
		local s = state[player]
		if s and s.conn then
			s.conn:Disconnect()
		end
		state[player] = nil
	end)
	task.spawn(function()
		while true do
			task.wait(VehiclesConfig.SafeZone.CheckInterval)
			for _, player in ipairs(Players:GetPlayers()) do
				local ok, err = pcall(update, find, player)
				if not ok then
					warn("[SafeZones] update failed:", err)
				end
			end
		end
	end)
end

return SafeZones
