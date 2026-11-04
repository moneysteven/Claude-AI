-- Widgets: small UI pieces shared by the Garage, FuelPump and Repair panels (client).
--
--   Widgets.Badge(brandId, size, props?) -> Frame          procedural brand badge (Shared/Vehicle/Looks)
--   Widgets.Bar(label, value 0..1, color, props?) -> (Frame, setFn(value, text?))
--   Widgets.Chip(text, color, props?) -> TextLabel
--   Widgets.Row(height, props?) -> Frame with a horizontal list layout
--   Widgets.ButtonGrid(props?) -> Frame (UIGridLayout of 44 px buttons that wraps on phones)
--   Widgets.Distance(studs) -> "12.3 mi" (player's unit setting)
--   Widgets.HealthColor(h) / Widgets.FuelColor(f) -> Color3

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Looks = require(Shared.Vehicle.Looks)
local Units = require(Shared.Vehicle.Units)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local Widgets = {}

function Widgets.Badge(brandId: string?, size: number, props: { [string]: any }?)
	local base = {
		Size = UDim2.fromOffset(size, size),
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local holder = Kit.new("Frame", base)
	Kit.Corner(holder, UDim.new(0, 10))
	local inner = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.82, 0.82),
		BackgroundTransparency = 1,
		Parent = holder,
	})
	Looks.BuildBadge(inner, brandId, (holder.ZIndex or 1) + 1)
	return holder
end

function Widgets.Bar(label: string, value: number, color: Color3, props: { [string]: any }?)
	local base = { Size = UDim2.new(1, 0, 0, 30), BackgroundTransparency = 1 }
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local frame = Kit.new("Frame", base)
	local text = Kit.Label(label, {
		Size = UDim2.new(1, 0, 0, 14),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		Parent = frame,
	})
	local track = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 18),
		Size = UDim2.new(1, 0, 0, 8),
		BackgroundColor3 = Theme.Colors.Stroke,
		Parent = frame,
	})
	Kit.Corner(track, UDim.new(1, 0))
	local fill = Kit.new("Frame", {
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = color,
		Parent = track,
	})
	Kit.Corner(fill, UDim.new(1, 0))
	local function set(v: number, newText: string?, newColor: Color3?)
		Kit.Tween(fill, { Size = UDim2.fromScale(math.clamp(v, 0, 1), 1) }, Theme.Tween.Normal)
		if newText then
			text.Text = newText
		end
		if newColor then
			fill.BackgroundColor3 = newColor
		end
	end
	set(value)
	return frame, set
end

function Widgets.Chip(text: string, color: Color3, props: { [string]: any }?)
	local base = {
		Text = text,
		Size = UDim2.fromOffset(0, 22),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = color,
		BackgroundTransparency = 0.15,
		TextColor3 = Theme.Colors.Text,
		Font = Theme.FontBold,
		TextSize = 12,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local chip = Kit.new("TextLabel", base)
	Kit.Corner(chip, UDim.new(1, 0))
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8), Parent = chip })
	return chip
end

function Widgets.Row(height: number, props: { [string]: any }?)
	local base = { Size = UDim2.new(1, 0, 0, height), BackgroundTransparency = 1 }
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local row = Kit.new("Frame", base)
	Kit.List(row, 6, true)
	return row
end

function Widgets.ButtonGrid(props: { [string]: any }?)
	local base = { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1 }
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local grid = Kit.new("Frame", base)
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.333, -6, 0, 44),
		CellPadding = UDim2.fromOffset(6, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = grid,
	})
	return grid
end

function Widgets.Unit(): string
	local u = ClientData.Get("Settings.Units")
	return u == "KMH" and "KMH" or "MPH"
end

function Widgets.Distance(studs: number): string
	local unit = Widgets.Unit()
	local d = Units.Distance(studs or 0, "studs", unit)
	return ("%s %s"):format(d >= 100 and tostring(math.floor(d + 0.5)) or string.format("%.1f", d), Units.DistanceLabel(unit))
end

function Widgets.Speed(mph: number): string
	local unit = Widgets.Unit()
	if unit == "KMH" then
		return ("%d km/h"):format(math.floor(mph * 1.609344 + 0.5))
	end
	return ("%d mph"):format(math.floor(mph + 0.5))
end

function Widgets.HealthColor(h: number): Color3
	if h >= 70 then
		return Theme.Colors.Success
	elseif h >= 35 then
		return Theme.Colors.Warning
	end
	return Theme.Colors.Danger
end

function Widgets.FuelColor(f: number): Color3
	if f >= 0.35 then
		return Theme.Colors.Accent
	elseif f >= 0.15 then
		return Theme.Colors.Warning
	end
	return Theme.Colors.Danger
end

return Widgets
