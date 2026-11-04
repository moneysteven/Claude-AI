-- Shared widgets for job minigames (mobile + PC + gamepad).
--
--   Common.Heading(parent, text, order)
--   Common.Sub(parent, text, order)
--   Common.TimingBar(parent, opts) -> { Start(), Stop() -> quality 0..1, SetSpeed(n), Destroy() }
--   Common.Bind(maid, name, fn, keys...)          ContextActionService binding at high priority (sinks input)
--   Common.Shake(guiObject)
--   Common.Feedback(parent, text, color)            floating "Perfect!" text
--   Common.SelectFirst(button)                       gamepad selection
--   Common.Row(parent, height, order) -> Frame       horizontal list row

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local RunService = game:GetService("RunService")

local UI = script.Parent.Parent.Parent.Parent:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local Common = {}
Common.Kit = Kit
Common.Theme = Theme

function Common.Heading(parent: Instance, text: string, order: number?)
	return Kit.Label(text, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = order or 1,
		Parent = parent,
	})
end

function Common.Sub(parent: Instance, text: string, order: number?)
	return Kit.Label(text, {
		TextColor3 = Theme.Colors.TextDim,
		TextSize = Theme.TextSize.Body,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = order or 2,
		Parent = parent,
	})
end

function Common.Row(parent: Instance, height: number, order: number?): Frame
	local row = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, height),
		BackgroundTransparency = 1,
		LayoutOrder = order or 5,
		Parent = parent,
	})
	Kit.List(row, 8, true, Enum.HorizontalAlignment.Center)
	return row
end

function Common.SelectFirst(button: GuiObject?)
	if button and Kit.IsGamepad() then
		GuiService.SelectedObject = button
	end
end

function Common.Shake(obj: GuiObject)
	local base = obj.Position
	task.spawn(function()
		for i = 1, 6 do
			if not obj.Parent then
				return
			end
			local dx = (i % 2 == 0) and 6 or -6
			obj.Position = base + UDim2.fromOffset(dx, 0)
			task.wait(0.03)
		end
		if obj.Parent then
			obj.Position = base
		end
	end)
end

-- Floating text must not live inside a list/grid layout (it would be stacked like a row), so climb to
-- the first ancestor that lays children out freely.
local function freeParent(parent: Instance): Instance
	local node: Instance? = parent
	while node and node:IsA("GuiObject") do
		if not (node:IsA("ScrollingFrame") or node:FindFirstChildWhichIsA("UIGridStyleLayout")) then
			return node
		end
		node = node.Parent
	end
	return parent
end

function Common.Feedback(parent: GuiObject, text: string, color: Color3?)
	parent = freeParent(parent) :: GuiObject
	local label = Kit.new("TextLabel", {
		Text = text,
		Font = Theme.FontBold,
		TextSize = 28,
		TextColor3 = color or Theme.Colors.Success,
		TextStrokeTransparency = 0.5,
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.4),
		Size = UDim2.fromOffset(240, 40),
		ZIndex = 20,
		Parent = parent,
	})
	Kit.Tween(label, { Position = UDim2.fromScale(0.5, 0.25), TextTransparency = 1, TextStrokeTransparency = 1 }, TweenInfo.new(0.7))
	task.delay(0.75, function()
		label:Destroy()
	end)
end

-- High-priority binding so minigame keys (Space, ButtonA, arrows) don't also jump / move.
function Common.Bind(maid, name: string, fn: (Enum.UserInputState) -> (), ...: Enum.KeyCode | Enum.UserInputType)
	local actionName = "JobMinigame_" .. name
	ContextActionService:BindActionAtPriority(actionName, function(_, state)
		fn(state)
		return Enum.ContextActionResult.Sink
	end, false, Enum.ContextActionPriority.High.Value, ...)
	maid:Give(function()
		ContextActionService:UnbindAction(actionName)
	end)
end

-- Moving needle over a bar with a green "perfect" zone.
function Common.TimingBar(parent: Instance, opts: { [string]: any }?)
	local o = opts or {}
	local speed = o.Speed or 1.1 -- full sweeps per second
	local zoneSize = o.ZoneSize or 0.2
	local holder = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 36),
		BackgroundColor3 = Theme.Colors.Background,
		LayoutOrder = o.LayoutOrder or 5,
		Parent = parent,
	})
	Kit.Corner(holder, UDim.new(0, 10))
	Kit.Stroke(holder)
	local zoneCenter = 0.5
	local zone = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0),
		Size = UDim2.fromScale(zoneSize, 1),
		Position = UDim2.fromScale(zoneCenter, 0),
		BackgroundColor3 = Theme.Colors.Success,
		BackgroundTransparency = 0.25,
		Parent = holder,
	})
	Kit.Corner(zone, UDim.new(0, 8))
	local needle = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Size = UDim2.new(0, 6, 1, 10),
		Position = UDim2.fromScale(0, 0.5),
		BackgroundColor3 = Theme.Colors.Text,
		ZIndex = 3,
		Parent = holder,
	})
	Kit.Corner(needle, UDim.new(1, 0))

	local pos = 0
	local dir = 1
	local running = false
	local conn: RBXScriptConnection? = nil
	local api = {}

	local function randomizeZone()
		zoneCenter = math.random(25, 75) / 100
		zone.Position = UDim2.fromScale(zoneCenter, 0)
	end

	function api.Start()
		if running then
			return
		end
		running = true
		randomizeZone()
		pos = 0
		dir = 1
		conn = RunService.RenderStepped:Connect(function(dt)
			pos += dir * dt * speed * 2
			if pos >= 1 then
				pos = 1
				dir = -1
			elseif pos <= 0 then
				pos = 0
				dir = 1
			end
			needle.Position = UDim2.fromScale(pos, 0.5)
		end)
	end

	function api.Stop(): number
		running = false
		if conn then
			conn:Disconnect()
			conn = nil
		end
		local dist = math.abs(pos - zoneCenter)
		local half = zoneSize / 2
		if dist <= half then
			return 1 - 0.5 * (dist / half) -- 0.5..1 inside the zone
		end
		return math.max(0, 0.5 - (dist - half) * 1.5)
	end

	function api.IsRunning(): boolean
		return running
	end

	function api.SetSpeed(s: number)
		speed = s
	end

	function api.Destroy()
		if conn then
			conn:Disconnect()
			conn = nil
		end
		holder:Destroy()
	end

	api.Instance = holder
	return api
end

function Common.QualityText(q: number): (string, Color3)
	if q >= 0.85 then
		return "PERFECT!", Theme.Colors.Success
	elseif q >= 0.5 then
		return "Good", Theme.Colors.Accent
	elseif q >= 0.25 then
		return "Okay", Theme.Colors.Warning
	end
	return "Miss", Theme.Colors.Danger
end

return Common
