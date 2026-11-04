-- VoiceZones (Social helper, client-only): shows a small "🎙️ Voice Hangout" chip while your character is inside
-- a part tagged "VoiceZone" (Config.World.Tags.VoiceZone). StreamingEnabled-safe: zones are tracked through
-- CollectionService added/removed signals; the check runs at Config.Social.VoiceZones.CheckHz.
--
--   VoiceZones.Start()
--   VoiceZones.IsInside() -> boolean

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local SocialConfig = require(Shared.Config.Social)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local VoiceZones = {}

local TAG = World.Tags.VoiceZone
local CFG = SocialConfig.VoiceZones
local localPlayer = Players.LocalPlayer

local zones: { [BasePart]: boolean } = {}
local inside = false
local chip: Frame? = nil

local function addZone(inst: Instance)
	if inst:IsA("BasePart") then
		zones[inst] = true
	end
end

local function removeZone(inst: Instance)
	if inst:IsA("BasePart") then
		zones[inst] = nil
	end
end

local function pointInside(part: BasePart, point: Vector3): boolean
	local rel = part.CFrame:PointToObjectSpace(point)
	local half = part.Size / 2
	return math.abs(rel.X) <= half.X and math.abs(rel.Y) <= half.Y + 3 and math.abs(rel.Z) <= half.Z
end

local function getChip(): Frame?
	if chip and chip.Parent then
		return chip
	end
	local hud = Router.GetLayer("HUD")
	if not hud then
		return nil
	end
	local c = Kit.new("Frame", {
		Name = "VoiceZoneChip",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 114),
		Size = UDim2.fromOffset(0, 34),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.15,
		Visible = false,
		Parent = hud,
	})
	Kit.Corner(c, UDim.new(1, 0))
	Kit.Stroke(c, Theme.Colors.Success, 1.5, 0.1)
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14), Parent = c })
	Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(0, 34),
		AutomaticSize = Enum.AutomaticSize.X,
		Font = Theme.FontBold,
		TextSize = 14,
		TextColor3 = Theme.Colors.Text,
		Text = CFG.ChipText,
		Parent = c,
	})
	Kit.new("UIScale", { Scale = 1, Parent = c })
	chip = c
	return c
end

local function setInside(v: boolean)
	if v == inside then
		return
	end
	inside = v
	local c = getChip()
	if not c then
		return
	end
	local s = c:FindFirstChildOfClass("UIScale")
	if v then
		c.Visible = true
		if s then
			s.Scale = 0.6
			Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
		end
	else
		if s then
			Kit.Tween(s, { Scale = 0.01 }, Theme.Tween.Fast)
		end
		task.delay(0.16, function()
			if not inside and c.Parent then
				c.Visible = false
			end
		end)
	end
end

function VoiceZones.IsInside(): boolean
	return inside
end

function VoiceZones.Start()
	CollectionService:GetInstanceAddedSignal(TAG):Connect(addZone)
	CollectionService:GetInstanceRemovedSignal(TAG):Connect(removeZone)
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		addZone(inst)
	end
	task.spawn(function()
		local interval = 1 / math.max(0.5, CFG.CheckHz)
		while true do
			task.wait(interval)
			local char = localPlayer.Character
			local root = char and char:FindFirstChild("HumanoidRootPart")
			local found = false
			if root and root:IsA("BasePart") then
				for part in pairs(zones) do
					if part.Parent and pointInside(part, root.Position) then
						found = true
						break
					end
				end
			end
			setInside(found)
		end
	end)
end

return VoiceZones
