-- VIPController: client-side VIP perks.
--
--   * VIP doors: VIPDoor-tagged parts are solid on the server. For VIP players this client sets CanCollide = false
--     LOCALLY (the local character's physics is client-owned, so VIPs walk straight through while everyone else
--     is blocked). The server also sweeps VIPArea volumes for non-VIP players (VIPService), so this is not a hole.
--   * VIP chip in the HUD status card (tap -> Shop). Gold chat colour / name tags are rendered by SocialController.
--
-- Handles StreamingEnabled: doors are tracked with CollectionService added/removed signals.
--
-- API (client):
--   VIPController:IsVip() -> boolean

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)

local Client = script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local VIPController = {
	Name = "VIPController",
	Priority = 74,
}

local localPlayer = Players.LocalPlayer
local GOLD_TEXT = Color3.fromRGB(30, 24, 8)

-- tracked VIPDoor parts. Only CanCollide is changed here: door visuals (transparency) belong to the world
-- subsystem's door helper, and two writers would make the door flicker.
local doors: { [BasePart]: boolean } = {}
local chip: TextButton? = nil

function VIPController:IsVip(): boolean
	return localPlayer:GetAttribute("VIP") == true or localPlayer:GetAttribute("Pass_VIP") == true
end

local function applyDoor(part: BasePart)
	local solid = not VIPController:IsVip()
	if part.CanCollide ~= solid then
		part.CanCollide = solid
	end
end

local function addDoor(inst: Instance)
	if not inst:IsA("BasePart") then
		return
	end
	local part = inst :: BasePart
	if not doors[part] then
		doors[part] = true
		-- if the server re-replicates CanCollide (e.g. the door streams back in), re-apply our local value
		part:GetPropertyChangedSignal("CanCollide"):Connect(function()
			if doors[part] then
				applyDoor(part)
			end
		end)
	end
	applyDoor(part)
end

local function removeDoor(inst: Instance)
	if inst:IsA("BasePart") then
		doors[inst :: BasePart] = nil
	end
end

local function refreshDoors()
	for part in pairs(doors) do
		if part.Parent then
			applyDoor(part)
		else
			doors[part] = nil
		end
	end
end

local function buildChip()
	local hud = Registry.Find("HUDController")
	local card: Frame? = nil
	if hud and type(hud.GetCard) == "function" then
		for _ = 1, 50 do
			local ok, c = pcall(hud.GetCard, hud)
			if ok and c then
				card = c
				break
			end
			task.wait(0.1)
		end
	end
	local props: { [string]: any } = {
		Name = "VipChip",
		Text = "",
		AutoButtonColor = true,
		BackgroundColor3 = Theme.Colors.VIP,
		Visible = false,
	}
	if card then
		props.Size = UDim2.new(1, 0, 0, Kit.IsMobile() and 26 or 30)
		props.LayoutOrder = 6
		props.Parent = card
	else
		props.Position = UDim2.fromOffset(10, 180)
		props.Size = UDim2.fromOffset(150, 32)
		props.Parent = Router.GetLayer("HUD")
	end
	local b = Kit.new("TextButton", props)
	Kit.Corner(b, UDim.new(1, 0))
	Kit.Ripple(b)
	Kit.new("UIGradient", {
		Color = ColorSequence.new(Color3.fromRGB(255, 226, 120), Color3.fromRGB(255, 170, 30)),
		Rotation = 0,
		Parent = b,
	})
	Kit.Label("👑 VIP MEMBER", {
		Font = Theme.FontBold,
		TextSize = Kit.IsMobile() and 13 or 14,
		TextColor3 = GOLD_TEXT,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextYAlignment = Enum.TextYAlignment.Center,
		AutomaticSize = Enum.AutomaticSize.None,
		Size = UDim2.fromScale(1, 1),
		TextWrapped = false,
		Parent = b,
	})
	b.Activated:Connect(function()
		Router.Toggle("Shop", { Tab = "Passes" })
	end)
	chip = b
end

local function refreshChip()
	if not chip then
		return
	end
	local vip = VIPController:IsVip()
	if vip and not chip.Visible then
		chip.Visible = true
		local s = chip:FindFirstChildOfClass("UIScale")
		if s then
			s.Scale = 0.5
			Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
		end
	elseif not vip then
		chip.Visible = false
	end
end

function VIPController:Start()
	local tag = World.Tags.VIPDoor
	CollectionService:GetInstanceAddedSignal(tag):Connect(addDoor)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(removeDoor)
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		addDoor(inst)
	end

	local function onVipChanged()
		refreshDoors()
		refreshChip()
	end
	localPlayer:GetAttributeChangedSignal("VIP"):Connect(onVipChanged)
	localPlayer:GetAttributeChangedSignal("Pass_VIP"):Connect(onVipChanged)

	-- the server may re-replicate CanCollide when a door streams back in; re-apply after respawns too
	localPlayer.CharacterAdded:Connect(function()
		task.delay(1, refreshDoors)
	end)

	task.spawn(function()
		buildChip()
		refreshChip()
	end)
end

return VIPController
