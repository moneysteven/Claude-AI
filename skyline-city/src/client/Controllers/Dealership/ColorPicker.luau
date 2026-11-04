-- ColorPicker: HSV picker built purely from Frames + UIGradients (no image assets).
--   * saturation/value square + hue bar (mouse / touch drag)
--   * gamepad: select the square or hue bar and use the RIGHT thumbstick to adjust
--   * hex input (#RRGGBB) and live swatch
--
--   local picker = ColorPicker.new(parent, initialColor3, onChange, order?)
--   picker.Set(color3, silent?)  picker.Get() -> Color3  picker.Destroy()

local GuiService = game:GetService("GuiService")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Client = script:FindFirstAncestor("Client") :: Instance
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local ColorPicker = {}

local function toHex(c: Color3): string
	return string.format("%02X%02X%02X", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5))
end

local function fromHex(s: string): Color3?
	local hex = s:gsub("#", ""):gsub("%s", "")
	if #hex == 3 then
		hex = hex:sub(1, 1):rep(2) .. hex:sub(2, 2):rep(2) .. hex:sub(3, 3):rep(2)
	end
	if #hex ~= 6 or hex:find("[^%x]") then
		return nil
	end
	local r = tonumber(hex:sub(1, 2), 16)
	local g = tonumber(hex:sub(3, 4), 16)
	local b = tonumber(hex:sub(5, 6), 16)
	if not (r and g and b) then
		return nil
	end
	return Color3.fromRGB(r, g, b)
end

function ColorPicker.new(parent: Instance, initial: Color3, onChange: (Color3) -> (), order: number?)
	local h, s, v = initial:ToHSV()
	local conns: { RBXScriptConnection } = {}

	local holder = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Background,
		LayoutOrder = order or 0,
		Parent = parent,
	})
	Kit.Corner(holder, Theme.CornerSmall)
	Kit.Padding(holder, 10)
	Kit.List(holder, 8)

	-- SV square ----------------------------------------------------------------
	local square = Kit.new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.new(1, 0, 0, 150),
		BackgroundColor3 = Color3.fromHSV(h, 1, 1),
		LayoutOrder = 1,
		Selectable = true,
		Parent = holder,
	})
	Kit.Corner(square, Theme.CornerSmall)
	local white = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(1, 1, 1), Parent = square })
	Kit.Corner(white, Theme.CornerSmall)
	Kit.new("UIGradient", {
		Transparency = NumberSequence.new(0, 1),
		Parent = white,
	})
	local black = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0), Parent = square })
	Kit.Corner(black, Theme.CornerSmall)
	Kit.new("UIGradient", {
		Transparency = NumberSequence.new(1, 0),
		Rotation = 90,
		Parent = black,
	})
	local svKnob = Kit.new("Frame", {
		Size = UDim2.fromOffset(18, 18),
		AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundTransparency = 1,
		ZIndex = 3,
		Parent = square,
	})
	Kit.Corner(svKnob, UDim.new(1, 0))
	Kit.Stroke(svKnob, Color3.new(1, 1, 1), 3, 0)

	-- Hue bar --------------------------------------------------------------------
	local hueBar = Kit.new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.new(1, 0, 0, 28),
		BackgroundColor3 = Color3.new(1, 1, 1),
		LayoutOrder = 2,
		Selectable = true,
		Parent = holder,
	})
	Kit.Corner(hueBar, UDim.new(1, 0))
	local keys = {}
	for i = 0, 6 do
		table.insert(keys, ColorSequenceKeypoint.new(i / 6, Color3.fromHSV((i / 6) % 1, 1, 1)))
	end
	Kit.new("UIGradient", { Color = ColorSequence.new(keys), Parent = hueBar })
	local hueKnob = Kit.new("Frame", {
		Size = UDim2.new(0, 8, 1, 6),
		AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundColor3 = Color3.new(1, 1, 1),
		ZIndex = 3,
		Parent = hueBar,
	})
	Kit.Corner(hueKnob, UDim.new(1, 0))
	Kit.Stroke(hueKnob, Color3.new(0, 0, 0), 1, 0.4)

	-- Hex + preview -----------------------------------------------------------------
	local row = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 3, Parent = holder })
	local preview = Kit.new("Frame", { Size = UDim2.fromOffset(44, 44), BackgroundColor3 = initial, Parent = row })
	Kit.Corner(preview, Theme.CornerSmall)
	Kit.Stroke(preview, Color3.new(1, 1, 1), 2, 0.5)
	local hexBox = Kit.TextBox("#RRGGBB", {
		Text = "#" .. toHex(initial),
		Position = UDim2.fromOffset(54, 0),
		Size = UDim2.new(1, -54, 1, 0),
		Font = Theme.FontMono,
		Parent = row,
	})

	local api = {}
	local function current(): Color3
		return Color3.fromHSV(h, s, v)
	end
	local function redraw()
		square.BackgroundColor3 = Color3.fromHSV(h, 1, 1)
		svKnob.Position = UDim2.fromScale(s, 1 - v)
		hueKnob.Position = UDim2.new(h, 0, 0.5, 0)
		local c = current()
		preview.BackgroundColor3 = c
		if not hexBox:IsFocused() then
			hexBox.Text = "#" .. toHex(c)
		end
	end
	local function changed()
		redraw()
		task.spawn(onChange, current())
	end

	-- dragging (the parent ScrollingFrame is frozen while dragging so touch drags don't scroll the sheet)
	local dragging: string? = nil
	local frozen: ScrollingFrame? = nil
	local function setDragging(mode: string?)
		dragging = mode
		if mode and not frozen then
			local sf = holder:FindFirstAncestorWhichIsA("ScrollingFrame")
			if sf and sf.ScrollingEnabled then
				frozen = sf
				sf.ScrollingEnabled = false
			end
		elseif not mode and frozen then
			frozen.ScrollingEnabled = true
			frozen = nil
		end
	end
	local function updateFrom(pos: Vector3 | Vector2)
		if dragging == "sv" then
			local rel = Vector2.new(pos.X, pos.Y) - square.AbsolutePosition
			s = math.clamp(rel.X / math.max(1, square.AbsoluteSize.X), 0, 1)
			v = 1 - math.clamp(rel.Y / math.max(1, square.AbsoluteSize.Y), 0, 1)
			changed()
		elseif dragging == "h" then
			local rel = pos.X - hueBar.AbsolutePosition.X
			h = math.clamp(rel / math.max(1, hueBar.AbsoluteSize.X), 0, 0.999)
			changed()
		end
	end
	local function isPress(input: InputObject): boolean
		return input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch
	end
	table.insert(conns, square.InputBegan:Connect(function(input)
		if isPress(input) then
			setDragging("sv")
			updateFrom(input.Position)
		end
	end))
	table.insert(conns, hueBar.InputBegan:Connect(function(input)
		if isPress(input) then
			setDragging("h")
			updateFrom(input.Position)
		end
	end))
	table.insert(conns, UserInputService.InputChanged:Connect(function(input)
		if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
			updateFrom(input.Position)
		end
	end))
	table.insert(conns, UserInputService.InputEnded:Connect(function(input)
		if isPress(input) and dragging then
			setDragging(nil)
		end
	end))

	-- gamepad: right thumbstick adjusts the selected control
	table.insert(conns, RunService.RenderStepped:Connect(function(dt)
		local sel = GuiService.SelectedObject
		if sel ~= square and sel ~= hueBar then
			return
		end
		local stick: Vector3? = nil
		for _, state in ipairs(UserInputService:GetGamepadState(Enum.UserInputType.Gamepad1)) do
			if state.KeyCode == Enum.KeyCode.Thumbstick2 then
				stick = state.Position
				break
			end
		end
		if not stick or stick.Magnitude < 0.2 then
			return
		end
		if sel == square then
			s = math.clamp(s + stick.X * dt * 0.8, 0, 1)
			v = math.clamp(v + stick.Y * dt * 0.8, 0, 1)
		else
			h = (h + stick.X * dt * 0.3) % 1
		end
		changed()
	end))

	table.insert(conns, hexBox.FocusLost:Connect(function()
		local c = fromHex(hexBox.Text)
		if c then
			h, s, v = c:ToHSV()
			changed()
		else
			redraw()
		end
	end))

	function api.Set(c: Color3, silent: boolean?)
		h, s, v = c:ToHSV()
		if silent then
			redraw()
		else
			changed()
		end
	end
	function api.Get(): Color3
		return current()
	end
	function api.Destroy()
		setDragging(nil)
		for _, c in ipairs(conns) do
			c:Disconnect()
		end
		table.clear(conns)
		holder:Destroy()
	end
	api.Frame = holder

	redraw()
	return api
end

ColorPicker.ToHex = toHex
ColorPicker.FromHex = fromHex

return ColorPicker
