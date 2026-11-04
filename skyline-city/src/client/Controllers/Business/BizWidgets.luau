-- BizWidgets (client helper): small Kit-based building blocks shared by the business panels.
--
--   W.Section(parent, title, order) -> Frame (card with a vertical list; add children with LayoutOrder)
--   W.Row(parent, order, height?) -> Frame (horizontal list)
--   W.Flow(parent, order) -> Frame (horizontal list that wraps on narrow screens)
--   W.Text(parent, text, order, props?) -> TextLabel
--   W.Button(parent, text, style, onClick, width?, order?) -> TextButton (44px tall touch target)
--   W.Progress(parent, fraction, color, order, height?) -> { Frame, Set(fraction) }
--   W.Bars(parent, values, order, height?) -> Frame   revenue "graph-lite"
--   W.Chip(parent, title, value, color?, order) -> Frame   stat tile (2 per row on phones, 4 on PC)
--   W.Spacer(parent, order, height)
--   W.Clear(container)   destroys GuiObjects but keeps layouts/padding

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Format = require(Shared.Util.Format)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local W = {}

function W.Clear(container: Instance)
	for _, c in ipairs(container:GetChildren()) do
		if c:IsA("GuiObject") then
			c:Destroy()
		end
	end
end

function W.Section(parent: Instance, title: string?, order: number)
	local card = Kit.Card({ LayoutOrder = order, Parent = parent })
	Kit.List(card, 8)
	if title then
		Kit.Label(title, {
			Font = Theme.FontBold,
			TextSize = Theme.TextSize.Heading,
			LayoutOrder = 0,
			Parent = card,
		})
	end
	return card
end

function W.Row(parent: Instance, order: number, height: number?)
	local row = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, height or 44),
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.List(row, 8, true)
	return row
end

-- Like Row, but buttons wrap onto extra lines on narrow (phone) screens.
function W.Flow(parent: Instance, order: number)
	local row = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
	local layout = Kit.List(row, 8, true)
	layout.Wraps = true
	layout.VerticalAlignment = Enum.VerticalAlignment.Top
	return row
end

function W.Text(parent: Instance, text: string, order: number, props: { [string]: any }?)
	local base = { LayoutOrder = order, Parent = parent, TextSize = Theme.TextSize.Body }
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	return Kit.Label(text, base)
end

function W.Button(parent: Instance, text: string, style: string?, onClick: () -> (), width: number?, order: number?)
	return Kit.Button(text, style, onClick, {
		Size = width and UDim2.new(0, width, 0, 44) or UDim2.new(1, 0, 0, 44),
		LayoutOrder = order or 0,
		TextSize = Theme.TextSize.Small + 1,
		Parent = parent,
	})
end

function W.Progress(parent: Instance, fraction: number, color: Color3?, order: number, height: number?)
	local bar = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, height or 12),
		BackgroundColor3 = Theme.Colors.Background,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.Corner(bar, UDim.new(1, 0))
	local fill = Kit.new("Frame", {
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = color or Theme.Colors.Accent,
		Parent = bar,
	})
	Kit.Corner(fill, UDim.new(1, 0))
	local api = { Frame = bar }
	function api.Set(f: number)
		Kit.Tween(fill, { Size = UDim2.fromScale(math.clamp(f, 0, 1), 1) }, Theme.Tween.Normal)
	end
	api.Set(fraction)
	return api
end

function W.Bars(parent: Instance, values: { number }, order: number, height: number?)
	local h = height or 90
	local holder = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, h + 18),
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
	local area = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, h),
		BackgroundColor3 = Theme.Colors.Background,
		BackgroundTransparency = 0.3,
		Parent = holder,
	})
	Kit.Corner(area, Theme.CornerSmall)
	local n = math.max(1, #values)
	local maxV = 1
	for _, v in ipairs(values) do
		maxV = math.max(maxV, v)
	end
	local slots = math.max(n, 12)
	for i = 1, slots do
		local v = values[i - (slots - n)] or 0
		local frac = v / maxV
		local bar = Kit.new("Frame", {
			AnchorPoint = Vector2.new(0, 1),
			Position = UDim2.new((i - 1) / slots, 3, 1, -4),
			Size = UDim2.new(1 / slots, -6, 0, 0),
			BackgroundColor3 = i == slots and Theme.Colors.Money or Theme.Colors.Accent,
			BackgroundTransparency = v > 0 and 0 or 0.7,
			Parent = area,
		})
		Kit.Corner(bar, UDim.new(0, 4))
		Kit.Tween(bar, { Size = UDim2.new(1 / slots, -6, math.max(0.03, frac) * 0.92, 0) }, Theme.Tween.Normal)
	end
	Kit.Label(("Last %d ticks · peak %s"):format(slots, Format.MoneyShort(maxV)), {
		Position = UDim2.new(0, 0, 0, h + 2),
		Size = UDim2.new(1, 0, 0, 16),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		Parent = holder,
	})
	return holder
end

function W.Chip(parent: Instance, title: string, value: string, color: Color3?, order: number)
	local chip = Kit.new("Frame", {
		BackgroundColor3 = Theme.Colors.Surface,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.Corner(chip, Theme.CornerSmall)
	Kit.Padding(chip, 8)
	Kit.Label(title, {
		Size = UDim2.new(1, 0, 0, 16),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = chip,
	})
	Kit.Label(value, {
		Position = UDim2.fromOffset(0, 18),
		Size = UDim2.new(1, 0, 0, 26),
		AutomaticSize = Enum.AutomaticSize.None,
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		TextColor3 = color or Theme.Colors.Text,
		TextScaled = true,
		Parent = chip,
	})
	return chip
end

-- A responsive grid of chips (2 columns on narrow screens, 4 on wide).
function W.ChipGrid(parent: Instance, order: number)
	local grid = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
	local layout = Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.25, -6, 0, 62),
		CellPadding = UDim2.fromOffset(8, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = grid,
	})
	local function fit()
		local wide = grid.AbsoluteSize.X >= 480
		layout.CellSize = wide and UDim2.new(0.25, -6, 0, 62) or UDim2.new(0.5, -4, 0, 62)
	end
	grid:GetPropertyChangedSignal("AbsoluteSize"):Connect(fit)
	task.defer(fit)
	return grid
end

function W.Spacer(parent: Instance, order: number, height: number)
	return Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, height),
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
end

function W.Money(n: number): string
	return Format.Money(n)
end

return W
