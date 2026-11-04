-- Elevators: every part tagged "Elevator" (Config/World.Tags.Elevator) becomes a ride.
--
--   Attributes on the tagged part (or Model with a PrimaryPart):
--     ToCFrame      CFrame   destination = standing position (required)
--     RequiresPass  string?  MonetizationService pass key, e.g. "ExclusiveApartments" (private elevators)
--     Label         string?  prompt object text (default "Elevator")
--
--   Elevators.Start(deps)   deps = { HasPass = fn(player, key) -> bool }
--
-- A server-side ProximityPrompt is created on each one. Players without the required pass are offered the
-- pass (MarketplaceService:PromptGamePassPurchase from the server) instead of riding.
--
-- Cooperation with other systems: if another system (e.g. the World subsystem's Access helper) already puts its
-- own ProximityPrompt on the elevator part, we do NOT add a second prompt (two stacked "Ride" prompts would be
-- confusing). Instead we listen to that prompt and only add the missing piece: offering the pass purchase to
-- players who don't own the required pass. That prompt's owner does the actual ride. Works in either load order.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config.Monetization)
local World = require(Shared.Config.World)

local MonUtil = require(script.Parent.MonUtil)

local Elevators = {}

local PROMPT_NAME = "SkylineElevatorPrompt"
local cfg = Config.Elevator

type Entry = {
	conns: { RBXScriptConnection },
	own: ProximityPrompt?,
	ownConn: RBXScriptConnection?,
	foreign: ProximityPrompt?,
}

local lastRide: { [Player]: number } = {}
local entries: { [Instance]: Entry } = {}
local deps = nil

local function promptParent(inst: Instance): BasePart?
	if inst:IsA("BasePart") then
		return inst
	elseif inst:IsA("Model") then
		return inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	return nil
end

local function cooldownOk(player: Player): boolean
	local now = os.clock()
	if lastRide[player] and now - lastRide[player] < cfg.Cooldown then
		return false
	end
	lastRide[player] = now
	return true
end

-- returns true if the player is allowed through; otherwise offers the pass (and returns false)
local function checkPass(player: Player, elevator: Instance, notify: boolean): boolean
	local passKey = elevator:GetAttribute("RequiresPass")
	if type(passKey) ~= "string" or passKey == "" then
		return true
	end
	if deps and deps.HasPass(player, passKey) then
		return true
	end
	if notify then
		local pass = Config.PassByKey[passKey]
		local name = pass and pass.Name or passKey
		MonUtil.Notify(player, ("🔒 This private elevator needs the %s pass."):format(name), "warning")
	end
	local ok, err = MonUtil.PromptPass(player, passKey)
	if not ok and err then
		MonUtil.Notify(player, err, "info")
	end
	return false
end

local function ride(player: Player, elevator: Instance)
	if not cooldownOk(player) then
		return
	end
	if not checkPass(player, elevator, true) then
		return
	end
	local to = elevator:GetAttribute("ToCFrame")
	if typeof(to) ~= "CFrame" then
		warn(("[Elevators] %s has no ToCFrame attribute"):format(elevator:GetFullName()))
		MonUtil.Notify(player, "This elevator is out of order.", "error")
		return
	end
	local target = to + cfg.ArriveOffset
	-- StreamingEnabled: make sure the destination floor exists on the client before the character lands there
	pcall(player.RequestStreamAroundAsync, player, target.Position, 2)
	if player.Parent == Players then
		MonUtil.Teleport(player, target)
	end
end

-- another system's prompt rides the elevator; we only offer the pass to players without it
local function offerOnly(player: Player, elevator: Instance)
	if not cooldownOk(player) then
		return
	end
	checkPass(player, elevator, false)
end

local function isForeign(c: Instance): boolean
	return c:IsA("ProximityPrompt") and c.Name ~= PROMPT_NAME
end

local function useForeign(inst: Instance, entry: Entry, prompt: ProximityPrompt)
	if entry.foreign == prompt then
		return
	end
	entry.foreign = prompt
	if entry.ownConn then
		entry.ownConn:Disconnect()
		entry.ownConn = nil
	end
	if entry.own then
		entry.own:Destroy()
		entry.own = nil
	end
	table.insert(entry.conns, prompt.Triggered:Connect(function(player: Player)
		offerOnly(player, inst)
	end))
end

local function createOwn(inst: Instance, entry: Entry, part: BasePart)
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = PROMPT_NAME
	prompt.ActionText = "Ride"
	local label = inst:GetAttribute("Label")
	prompt.ObjectText = (type(label) == "string" and label ~= "") and label or "🛗 Elevator"
	prompt.HoldDuration = cfg.HoldDuration
	prompt.MaxActivationDistance = cfg.PromptDistance
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = part
	entry.own = prompt
	entry.ownConn = prompt.Triggered:Connect(function(player: Player)
		ride(player, inst)
	end)
end

local function setup(inst: Instance)
	if entries[inst] then
		return
	end
	local part = promptParent(inst)
	if not part then
		return
	end
	local entry: Entry = { conns = {}, own = nil, ownConn = nil, foreign = nil }
	entries[inst] = entry

	-- a stale prompt of ours (e.g. module reloaded) is replaced
	local stale = part:FindFirstChild(PROMPT_NAME)
	if stale then
		stale:Destroy()
	end

	local foreign: ProximityPrompt? = nil
	for _, c in ipairs(part:GetChildren()) do
		if isForeign(c) then
			foreign = c :: ProximityPrompt
			break
		end
	end
	if foreign then
		useForeign(inst, entry, foreign)
	else
		createOwn(inst, entry, part)
	end

	-- the other system may add its prompt after us
	table.insert(entry.conns, part.ChildAdded:Connect(function(c)
		if entries[inst] == entry and isForeign(c) and not entry.foreign then
			useForeign(inst, entry, c :: ProximityPrompt)
		end
	end))
end

local function teardown(inst: Instance)
	local entry = entries[inst]
	if not entry then
		return
	end
	entries[inst] = nil
	for _, c in ipairs(entry.conns) do
		c:Disconnect()
	end
	if entry.ownConn then
		entry.ownConn:Disconnect()
	end
	if entry.own then
		entry.own:Destroy()
	end
end

function Elevators.Start(d)
	deps = d
	local tag = World.Tags.Elevator
	CollectionService:GetInstanceAddedSignal(tag):Connect(setup)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(teardown)
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		setup(inst)
	end
	Players.PlayerRemoving:Connect(function(player)
		lastRide[player] = nil
	end)
end

return Elevators
