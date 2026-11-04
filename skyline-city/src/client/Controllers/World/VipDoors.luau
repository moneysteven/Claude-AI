-- VipDoors (client helper): VIPDoor-tagged parts become locally non-collidable for VIP members, so VIPs (and the
-- cars they drive, which their client simulates) pass straight through. Everyone else keeps the solid door.
-- The server still enforces VIPArea volumes, so this is purely a convenience. StreamingEnabled-safe.
--
--   VipDoors.Start()

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)

local Client = script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))

local VipDoors = {}

local player = Players.LocalPlayer
local doors: { [BasePart]: boolean } = {}

local function isVip(): boolean
	return player:GetAttribute("VIP") == true or player:GetAttribute("Pass_VIP") == true
end

local function apply(part: BasePart)
	local vip = isVip()
	-- Monetization's VIPController owns door collision when it exists; we only handle the look then.
	if not Registry.Find("VIPController") then
		part.CanCollide = not vip
	end
	part.Transparency = vip and 0.7 or 0.35
end

local function add(inst: Instance)
	if inst:IsA("BasePart") and not doors[inst] then
		doors[inst] = true
		apply(inst)
	end
end

local function refreshAll()
	for part in pairs(doors) do
		if part.Parent then
			apply(part)
		end
	end
end

function VipDoors.Start()
	local tag = World.Tags.VIPDoor
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		add(inst)
	end
	CollectionService:GetInstanceAddedSignal(tag):Connect(add)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(function(inst)
		doors[inst :: BasePart] = nil
	end)
	player.CharacterAdded:Connect(refreshAll)
	player:GetAttributeChangedSignal("VIP"):Connect(refreshAll)
	player:GetAttributeChangedSignal("Pass_VIP"):Connect(refreshAll)
end

return VipDoors
