-- Access (World helper): elevators and VIP gating.
--   * Elevator-tagged parts get a server ProximityPrompt. Riding checks attribute RequiresPass
--     (MonetizationService:HasPass, falling back to the Pass_<key> / VIP player attributes) and teleports to
--     attribute ToCFrame through WorldService:Teleport (anti-exploit whitelisted).
--   * VIPDoor-tagged parts get a prompt that lets VIP members step through (InsideCFrame / OutsideCFrame).
--     VIP clients also turn the door's collision off locally (AmbientController) so VIP cars can drive in.
--   * VIPArea volumes: non-VIP players found inside are moved to the area's ExitCFrame (checked by WorldService),
--     unless Monetization's VIPService is running (it owns that sweep then).
--
--   Access.Init(worldService)
--   Access.HasPass(player, key) -> boolean
--   Access.CheckVip(player, pos)       call from the zone tick
--   Access.Forget(player)

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Ambient = require(Shared.Config.Ambient)
local Net = require(Shared.Net)
local Registry = require(ServerScriptService.Server.Registry)

local Zones = require(script.Parent.Zones)

local Access = {}

local Tags = World.Tags
local worldService
local lastRide: { [Player]: number } = {}
local lastEject: { [Player]: number } = {}
local prompts: { [Instance]: ProximityPrompt } = {}

local function notify(player: Player, text: string, kind: string?)
	local n = Registry.Find("NotifyService")
	if n then
		n:Send(player, text, kind or "info")
	end
end

function Access.HasPass(player: Player, key: string): boolean
	local mon = Registry.Find("MonetizationService")
	if mon and mon.HasPass then
		local ok, res = pcall(mon.HasPass, mon, player, key)
		if ok and res == true then
			return true
		end
	end
	if player:GetAttribute("Pass_" .. key) == true then
		return true
	end
	return key == "VIP" and player:GetAttribute("VIP") == true
end

local function cooldown(player: Player): boolean
	local now = os.clock()
	if lastRide[player] and now - lastRide[player] < Ambient.Elevators.Cooldown then
		return false
	end
	lastRide[player] = now
	return true
end

local function ride(player: Player, part: BasePart)
	if not cooldown(player) then
		return
	end
	local pass = part:GetAttribute("RequiresPass")
	if type(pass) == "string" and pass ~= "" and not Access.HasPass(player, pass) then
		local label = pass == "ExclusiveApartments" and "Exclusive Apartments" or pass
		notify(player, ("🔒 This elevator needs the %s pass."):format(label), "warning")
		return
	end
	local to = part:GetAttribute("ToCFrame")
	if typeof(to) ~= "CFrame" then
		return
	end
	Net.Fire(player, "WorldEvent", "Fade", { Text = part:GetAttribute("Label") })
	task.spawn(function()
		-- make sure the destination floor is streamed in before we move the character there
		pcall(player.RequestStreamAroundAsync, player, to.Position, 2)
		task.wait(0.1)
		if player.Parent then
			worldService:Teleport(player, to)
		end
	end)
end

local function door(player: Player, part: BasePart)
	if not cooldown(player) then
		return
	end
	if not Access.HasPass(player, "VIP") then
		notify(player, "👑 VIP members only. Get VIP in the shop to unlock the lounge, club and free VIP parking.", "warning")
		return
	end
	local inside = part:GetAttribute("InsideCFrame")
	local outside = part:GetAttribute("OutsideCFrame")
	if typeof(inside) ~= "CFrame" or typeof(outside) ~= "CFrame" then
		return
	end
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if not (root and root:IsA("BasePart")) then
		return
	end
	-- go to whichever side is farther from where the player stands
	local target = (root.Position - inside.Position).Magnitude < (root.Position - outside.Position).Magnitude and outside or inside
	worldService:Teleport(player, target)
end

local function attach(inst: Instance, kind: string)
	if prompts[inst] or not inst:IsA("BasePart") then
		return
	end
	local part = inst :: BasePart
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = kind == "Elevator" and "ElevatorPrompt" or "VIPDoorPrompt"
	prompt.ObjectText = kind == "Elevator" and "Elevator" or "👑 VIP"
	prompt.ActionText = kind == "Elevator" and ("Ride: " .. tostring(part:GetAttribute("Label") or "Elevator")) or "Enter / Exit"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = Ambient.Elevators.PromptDistance
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = part
	prompts[inst] = prompt
	prompt.Triggered:Connect(function(player: Player)
		if kind == "Elevator" then
			ride(player, part)
		else
			door(player, part)
		end
	end)
end

local function detach(inst: Instance)
	local p = prompts[inst]
	if p then
		p:Destroy()
		prompts[inst] = nil
	end
end

function Access.Init(ws)
	worldService = ws
	for _, pair in ipairs({ { Tags.Elevator, "Elevator" }, { Tags.VIPDoor, "VIPDoor" } }) do
		local tag, kind = pair[1], pair[2]
		for _, inst in ipairs(CollectionService:GetTagged(tag)) do
			attach(inst, kind)
		end
		CollectionService:GetInstanceAddedSignal(tag):Connect(function(inst)
			attach(inst, kind)
		end)
		CollectionService:GetInstanceRemovedSignal(tag):Connect(detach)
	end
end

-- Non-VIP players inside a VIPArea are moved to its ExitCFrame.
-- When the Monetization subsystem's VIPService is present it owns the VIPArea sweep (same ExitCFrame attribute),
-- so we stay out of its way to avoid double teleports / double warnings.
function Access.CheckVip(player: Player, pos: Vector3)
	if Registry.Find("VIPService") then
		return
	end
	local area = Zones.Find(Tags.VIPArea, pos)
	if not area or Access.HasPass(player, "VIP") then
		return
	end
	local now = os.clock()
	if lastEject[player] and now - lastEject[player] < Ambient.Zones.VipEjectCooldown then
		return
	end
	lastEject[player] = now
	local exit = area:GetAttribute("ExitCFrame")
	if typeof(exit) ~= "CFrame" then
		exit = area.CFrame * CFrame.new(0, -area.Size.Y / 2 + 3, -area.Size.Z / 2 - 8)
	end
	worldService:Teleport(player, exit)
	notify(player, "👑 That area is for VIP members only.", "warning")
end

function Access.Forget(player: Player)
	lastRide[player] = nil
	lastEject[player] = nil
end

return Access
