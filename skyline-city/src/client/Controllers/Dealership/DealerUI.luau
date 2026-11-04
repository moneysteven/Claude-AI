-- DealerUI: small widgets shared by the Dealership and Tuning panels (chips, stat bars, swatches, sections).

local Client = script:FindFirstAncestor("Client") :: Instance
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local DealerUI = {}

function DealerUI.Color(t: any): Color3
	if typeof(t) == "Color3" then
		return t
	end
	if type(t) == "table" and type(t[1]) == "number" then
		return Color3.fromRGB(t[1], t[2] or 0, t[3] or 0)
	end
	return Color3.fromRGB(200, 200, 205)
end

function DealerUI.ToTable(c: Color3): { number }
	return { math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5) }
end

function DealerUI.Section(text: string, order: number, parent: Instance)
	return Kit.Label(text, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Body,
		TextColor3 = Theme.Colors.TextDim,
		LayoutOrder = order,
		Parent = parent,
	})
end

-- Horizontal scrolling row of selectable chips.
--   items = { { Id, Text } }, onPick(id)
--   returns api { Frame, Set(id), Get() }
function DealerUI.ChipRow(items: { { [string]: any } }, selected: any, onPick: (any) -> (), props: { [string]: any }?)
	local base = {
		Size = UDim2.new(1, 0, 0, 48),
		BackgroundTransparency = 1,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.X,
		ScrollingDirection = Enum.ScrollingDirection.X,
		ScrollBarThickness = 3,
		ScrollBarImageColor3 = Theme.Colors.Stroke,
		BorderSizePixel = 0,
		ElasticBehavior = Enum.ElasticBehavior.WhenScrollable,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local frame = Kit.new("ScrollingFrame", base)
	Kit.List(frame, 6, true)
	local buttons = {}
	local current = selected
	local function paint()
		for id, b in pairs(buttons) do
			local on = id == current
			Kit.Tween(b, {
				BackgroundColor3 = on and Theme.Colors.Accent or Theme.Colors.SurfaceAlt,
				TextColor3 = on and Theme.Colors.Text or Theme.Colors.TextDim,
			}, Theme.Tween.Fast)
		end
	end
	for i, item in ipairs(items) do
		local b = Kit.new("TextButton", {
			Text = tostring(item.Text),
			Font = Theme.FontBold,
			TextSize = Theme.TextSize.Small + 1,
			TextColor3 = Theme.Colors.TextDim,
			BackgroundColor3 = Theme.Colors.SurfaceAlt,
			AutomaticSize = Enum.AutomaticSize.X,
			Size = UDim2.fromOffset(44, 44), -- 44px touch target (grows wider with its text)
			LayoutOrder = i,
			AutoButtonColor = true,
			Parent = frame,
		})
		Kit.Corner(b, UDim.new(1, 0))
		Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14), Parent = b })
		Kit.Ripple(b)
		buttons[item.Id] = b
		b.Activated:Connect(function()
			current = item.Id
			paint()
			task.spawn(onPick, item.Id)
		end)
	end
	paint()
	local api = { Frame = frame }
	function api.Set(id: any, silent: boolean?)
		current = id
		paint()
		if not silent then
			task.spawn(onPick, id)
		end
	end
	function api.Get()
		return current
	end
	function api.Ids()
		local out = {}
		for _, item in ipairs(items) do
			table.insert(out, item.Id)
		end
		return out
	end
	-- cycle selection (gamepad L1/R1)
	function api.Step(dir: number)
		local ids = api.Ids()
		if #ids == 0 then
			return
		end
		local idx = table.find(ids, current) or 1
		idx = ((idx - 1 + dir) % #ids) + 1
		api.Set(ids[idx])
		local b = buttons[ids[idx]]
		if b then
			local x = b.AbsolutePosition.X - frame.AbsolutePosition.X + frame.CanvasPosition.X
			frame.CanvasPosition = Vector2.new(math.max(0, x - 40), 0)
		end
	end
	return api
end

-- Labelled stat bar: "Horsepower ███████░░ 420 hp"
function DealerUI.StatBar(label: string, value: number, max: number, valueText: string, order: number, parent: Instance, invert: boolean?)
	local holder = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 30),
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.Label(label, {
		Size = UDim2.new(0.34, 0, 1, 0),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = holder,
	})
	local track = Kit.new("Frame", {
		Position = UDim2.new(0.34, 0, 0.5, -4),
		Size = UDim2.new(0.42, 0, 0, 8),
		BackgroundColor3 = Theme.Colors.Background,
		Parent = holder,
	})
	Kit.Corner(track, UDim.new(1, 0))
	local frac = math.clamp(value / math.max(0.001, max), 0.03, 1)
	if invert then
		frac = math.clamp(1 - value / math.max(0.001, max), 0.03, 1)
	end
	local fill = Kit.new("Frame", {
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = Theme.Colors.Accent,
		Parent = track,
	})
	Kit.Corner(fill, UDim.new(1, 0))
	Kit.new("UIGradient", {
		Color = ColorSequence.new(Theme.Colors.Accent, Theme.Colors.AccentAlt),
		Parent = fill,
	})
	Kit.Tween(fill, { Size = UDim2.fromScale(frac, 1) }, TweenInfo.new(0.5, Enum.EasingStyle.Quint, Enum.EasingDirection.Out))
	Kit.Label(valueText, {
		Position = UDim2.new(0.78, 0, 0, 0),
		Size = UDim2.new(0.22, 0, 1, 0),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small,
		Font = Theme.FontBold,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = holder,
	})
	return holder
end

-- Row of colour swatches (wraps). swatches = { { Name, Color = {R,G,B} } }
function DealerUI.Swatches(swatches: { any }, onPick: (Color3, any) -> (), order: number, parent: Instance)
	local holder = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.fromOffset(44, 44),
		CellPadding = UDim2.fromOffset(6, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = holder,
	})
	for i, s in ipairs(swatches) do
		local c = DealerUI.Color(s.Color)
		local b = Kit.new("TextButton", {
			Text = s.Badge or "",
			TextSize = 16,
			Font = Theme.FontBold,
			TextColor3 = Theme.Colors.Text,
			BackgroundColor3 = c,
			LayoutOrder = i,
			AutoButtonColor = true,
			Parent = holder,
		})
		Kit.Corner(b, UDim.new(1, 0))
		Kit.Stroke(b, Color3.new(1, 1, 1), 2, 0.6)
		Kit.Ripple(b)
		b.Activated:Connect(function()
			task.spawn(onPick, c, s)
		end)
	end
	return holder
end

-- Two-line key/value row
function DealerUI.KeyValue(key: string, value: string, order: number, parent: Instance, valueColor: Color3?)
	local row = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 24),
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.Label(key, {
		Size = UDim2.new(0.55, 0, 1, 0),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small + 1,
		TextColor3 = Theme.Colors.TextDim,
		Parent = row,
	})
	local v = Kit.Label(value, {
		Position = UDim2.fromScale(0.55, 0),
		Size = UDim2.new(0.45, 0, 1, 0),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small + 1,
		Font = Theme.FontBold,
		TextColor3 = valueColor or Theme.Colors.Text,
		TextXAlignment = Enum.TextXAlignment.Right,
		Parent = row,
	})
	return row, v
end

return DealerUI
