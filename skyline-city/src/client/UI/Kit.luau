-- Kit: tiny declarative UI helpers so every screen looks consistent and is built in code
-- (code-built UI syncs cleanly with Rojo — no binary .rbxm GUIs to merge).
--
--   Kit.new("Frame", { Size = ..., Parent = ... }, { children... })
--   Kit.Corner(parent, radius?) / Kit.Stroke(parent) / Kit.Padding(parent, px) / Kit.List(parent, padding, horizontal?)
--   Kit.Label(text, props?)           Kit.Title(text, props?)
--   Kit.Button(text, style?, onClick, props?)    style: "primary" | "secondary" | "danger" | "success" | "ghost"
--   Kit.IconButton(icon, onClick, props?)        icon = emoji / short text
--   Kit.TextBox(placeholder, props?)
--   Kit.Scroll(props?)   -> ScrollingFrame with auto canvas + list layout
--   Kit.Grid(cellSize, props?) -> ScrollingFrame with UIGridLayout
--   Kit.Toggle(initial, onChange, props?)  -> Frame (call .Set(value))
--   Kit.Slider(initial 0..1, onChange, props?)
--   Kit.Card(props?) -> rounded surface frame
--   Kit.Tween(instance, props, tweenInfo?)
--   Kit.Ripple(button) adds press feedback
--   Kit.IsMobile() / Kit.IsGamepad()

local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local GuiService = game:GetService("GuiService")

local Theme = require(script.Parent.Theme)

local Kit = {}
Kit.Theme = Theme

function Kit.new(className: string, props: { [string]: any }?, children: { Instance }?): any
	local inst = Instance.new(className)
	local parent = nil
	if props then
		for k, v in pairs(props) do
			if k == "Parent" then
				parent = v
			elseif type(k) == "string" then
				(inst :: any)[k] = v
			end
		end
	end
	if children then
		for _, child in ipairs(children) do
			child.Parent = inst
		end
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

function Kit.Corner(parent: Instance, radius: UDim?)
	return Kit.new("UICorner", { CornerRadius = radius or Theme.Corner, Parent = parent })
end

function Kit.Stroke(parent: Instance, color: Color3?, thickness: number?, transparency: number?)
	return Kit.new("UIStroke", {
		Color = color or Theme.Colors.Stroke,
		Thickness = thickness or 1,
		Transparency = transparency or 0.3,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
		Parent = parent,
	})
end

function Kit.Padding(parent: Instance, px: number?)
	local p = UDim.new(0, px or Theme.Padding)
	return Kit.new("UIPadding", { PaddingTop = p, PaddingBottom = p, PaddingLeft = p, PaddingRight = p, Parent = parent })
end

function Kit.List(parent: Instance, padding: number?, horizontal: boolean?, align: Enum.HorizontalAlignment?)
	return Kit.new("UIListLayout", {
		Padding = UDim.new(0, padding or 8),
		FillDirection = horizontal and Enum.FillDirection.Horizontal or Enum.FillDirection.Vertical,
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = align or Enum.HorizontalAlignment.Left,
		VerticalAlignment = horizontal and Enum.VerticalAlignment.Center or Enum.VerticalAlignment.Top,
		Parent = parent,
	})
end

function Kit.Tween(inst: Instance, props: { [string]: any }, info: TweenInfo?)
	local t = TweenService:Create(inst, info or Theme.Tween.Normal, props)
	t:Play()
	return t
end

function Kit.Label(text: string, props: { [string]: any }?)
	local base = {
		Text = text,
		BackgroundTransparency = 1,
		TextColor3 = Theme.Colors.Text,
		Font = Theme.Font,
		TextSize = Theme.TextSize.Body,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = true,
		Size = UDim2.new(1, 0, 0, 22),
		AutomaticSize = Enum.AutomaticSize.Y,
		RichText = true,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	return Kit.new("TextLabel", base)
end

function Kit.Title(text: string, props: { [string]: any }?)
	local base = { Font = Theme.FontBold, TextSize = Theme.TextSize.Title }
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	return Kit.Label(text, base)
end

local BUTTON_STYLES = {
	primary = { bg = Theme.Colors.Accent, fg = Theme.Colors.Text },
	secondary = { bg = Theme.Colors.SurfaceAlt, fg = Theme.Colors.Text },
	danger = { bg = Theme.Colors.Danger, fg = Theme.Colors.Text },
	success = { bg = Theme.Colors.Success, fg = Theme.Colors.Text },
	vip = { bg = Theme.Colors.VIP, fg = Color3.fromRGB(30, 24, 8) },
	ghost = { bg = Theme.Colors.Surface, fg = Theme.Colors.TextDim },
}

function Kit.Ripple(button: GuiButton)
	local scale = Kit.new("UIScale", { Scale = 1, Parent = button })
	button.MouseButton1Down:Connect(function()
		Kit.Tween(scale, { Scale = 0.95 }, Theme.Tween.Fast)
	end)
	local function up()
		Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)
	end
	button.MouseButton1Up:Connect(up)
	button.MouseLeave:Connect(up)
end

function Kit.Button(text: string, style: string?, onClick: (() -> ())?, props: { [string]: any }?)
	local s = BUTTON_STYLES[style or "primary"] or BUTTON_STYLES.primary
	local base = {
		Text = text,
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Body,
		TextColor3 = s.fg,
		BackgroundColor3 = s.bg,
		AutoButtonColor = true,
		Size = UDim2.new(1, 0, 0, 44), -- 44px = comfortable mobile touch target
		TextWrapped = true,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local b = Kit.new("TextButton", base)
	Kit.Corner(b, Theme.CornerSmall)
	Kit.Ripple(b)
	if onClick then
		local busy = false
		b.Activated:Connect(function()
			if busy then
				return
			end
			busy = true
			task.spawn(function()
				local ok, err = pcall(onClick)
				if not ok then
					warn("[Kit.Button]", err)
				end
				busy = false
			end)
		end)
	end
	return b
end

function Kit.IconButton(icon: string, onClick: (() -> ())?, props: { [string]: any }?)
	local base = {
		Text = icon,
		Font = Theme.FontBold,
		TextSize = 22,
		TextColor3 = Theme.Colors.Text,
		BackgroundColor3 = Theme.Colors.SurfaceAlt,
		Size = UDim2.fromOffset(48, 48),
		AutoButtonColor = true,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local b = Kit.new("TextButton", base)
	Kit.Corner(b, UDim.new(1, 0))
	Kit.Ripple(b)
	if onClick then
		b.Activated:Connect(function()
			task.spawn(onClick)
		end)
	end
	return b
end

function Kit.TextBox(placeholder: string, props: { [string]: any }?)
	local base = {
		PlaceholderText = placeholder,
		Text = "",
		Font = Theme.Font,
		TextSize = Theme.TextSize.Body,
		TextColor3 = Theme.Colors.Text,
		PlaceholderColor3 = Theme.Colors.TextDim,
		BackgroundColor3 = Theme.Colors.SurfaceAlt,
		Size = UDim2.new(1, 0, 0, 42),
		ClearTextOnFocus = false,
		TextXAlignment = Enum.TextXAlignment.Left,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local box = Kit.new("TextBox", base)
	Kit.Corner(box, Theme.CornerSmall)
	Kit.Padding(box, 10)
	return box
end

function Kit.Card(props: { [string]: any }?)
	local base = {
		BackgroundColor3 = Theme.Colors.SurfaceAlt,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local f = Kit.new("Frame", base)
	Kit.Corner(f, Theme.CornerSmall)
	Kit.Padding(f, 10)
	return f
end

function Kit.Scroll(props: { [string]: any }?, padding: number?)
	local base = {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 4,
		ScrollBarImageColor3 = Theme.Colors.Stroke,
		BorderSizePixel = 0,
		ScrollingDirection = Enum.ScrollingDirection.Y,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local s = Kit.new("ScrollingFrame", base)
	Kit.List(s, padding or 8)
	Kit.new("UIPadding", { PaddingRight = UDim.new(0, 6), Parent = s })
	return s
end

function Kit.Grid(cellSize: UDim2, props: { [string]: any }?)
	local base = {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 4,
		BorderSizePixel = 0,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local s = Kit.new("ScrollingFrame", base)
	Kit.new("UIGridLayout", {
		CellSize = cellSize,
		CellPadding = UDim2.fromOffset(8, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = s,
	})
	return s
end

function Kit.Toggle(initial: boolean, onChange: (boolean) -> (), props: { [string]: any }?)
	local value = initial
	local base = {
		Size = UDim2.fromOffset(52, 28),
		BackgroundColor3 = value and Theme.Colors.Success or Theme.Colors.Stroke,
		Text = "",
		AutoButtonColor = false,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local track = Kit.new("TextButton", base)
	Kit.Corner(track, UDim.new(1, 0))
	local knob = Kit.new("Frame", {
		Size = UDim2.fromOffset(22, 22),
		Position = value and UDim2.new(1, -25, 0.5, -11) or UDim2.new(0, 3, 0.5, -11),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = track,
	})
	Kit.Corner(knob, UDim.new(1, 0))
	local api = {}
	function api.Set(v: boolean, silent: boolean?)
		value = v
		Kit.Tween(knob, { Position = v and UDim2.new(1, -25, 0.5, -11) or UDim2.new(0, 3, 0.5, -11) }, Theme.Tween.Fast)
		Kit.Tween(track, { BackgroundColor3 = v and Theme.Colors.Success or Theme.Colors.Stroke }, Theme.Tween.Fast)
		if not silent then
			task.spawn(onChange, v)
		end
	end
	function api.Get()
		return value
	end
	track.Activated:Connect(function()
		api.Set(not value)
	end)
	api.Instance = track
	return api
end

function Kit.Slider(initial: number, onChange: (number) -> (), props: { [string]: any }?)
	local value = math.clamp(initial, 0, 1)
	local base = { Size = UDim2.new(1, 0, 0, 28), BackgroundTransparency = 1 }
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local holder = Kit.new("Frame", base)
	local bar = Kit.new("Frame", {
		Size = UDim2.new(1, -20, 0, 6),
		Position = UDim2.new(0, 10, 0.5, -3),
		BackgroundColor3 = Theme.Colors.Stroke,
		Parent = holder,
	})
	Kit.Corner(bar, UDim.new(1, 0))
	local fill = Kit.new("Frame", { Size = UDim2.fromScale(value, 1), BackgroundColor3 = Theme.Colors.Accent, Parent = bar })
	Kit.Corner(fill, UDim.new(1, 0))
	local knob = Kit.new("TextButton", {
		Text = "",
		Size = UDim2.fromOffset(20, 20),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(value, 0, 0.5, 0),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = bar,
	})
	Kit.Corner(knob, UDim.new(1, 0))

	local dragging = false
	local function setFromX(x: number)
		local rel = math.clamp((x - bar.AbsolutePosition.X) / math.max(1, bar.AbsoluteSize.X), 0, 1)
		value = rel
		fill.Size = UDim2.fromScale(rel, 1)
		knob.Position = UDim2.new(rel, 0, 0.5, 0)
		onChange(rel)
	end
	knob.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			dragging = true
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			dragging = false
		end
	end)
	UserInputService.InputChanged:Connect(function(input)
		if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
			setFromX(input.Position.X)
		end
	end)
	-- gamepad: left/right while selected
	knob.SelectionGained:Connect(function() end)
	return holder
end

function Kit.IsMobile(): boolean
	return UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
end

function Kit.IsGamepad(): boolean
	return UserInputService.GamepadEnabled and GuiService:IsTenFootInterface()
		or UserInputService:GetLastInputType().Name:find("Gamepad") ~= nil
end

return Kit
