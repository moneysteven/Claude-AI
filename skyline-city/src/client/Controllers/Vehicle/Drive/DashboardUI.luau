-- DashboardUI: the bottom-centre instrument cluster shown while driving.
--   [ tachometer w/ redline ]  [ gear · digital speed · warning lights · fuel · odo · radio ]  [ speedometer ]
-- Analogue needles are smoothed every frame. Built from Frames only (no image assets).
--
--   local dash = DashboardUI.new(parentGui, { TopSpeed (studs/s), Redline, Electric, Unit, ShowHints })
--   dash:Update(dt, telemetry, info)   -- telemetry from DriveController:GetTelemetry(); info = {
--        Indicator, Headlights, Seatbelt, Health, Fuel, Odometer (string), Radio (string), EngineOn }
--   dash:Destroy()

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Driving = require(Shared.Config.Driving)
local Units = require(Shared.Vehicle.Units)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local D = Driving.Dashboard

local DashboardUI = {}
DashboardUI.__index = DashboardUI

local COLORS = Theme.Colors
local GAUGE = 150

local function makeGauge(parent: Instance, position: UDim2, maxValue: number, majorStep: number, minorPerMajor: number, redFrom: number?, labelDiv: number, caption: string)
	local sweep = D.GaugeSweep
	local g = Kit.new("Frame", {
		Size = UDim2.fromOffset(GAUGE, GAUGE),
		Position = position,
		BackgroundColor3 = COLORS.Background,
		BackgroundTransparency = 0.12,
		Parent = parent,
	})
	Kit.Corner(g, UDim.new(1, 0))
	Kit.Stroke(g, COLORS.Stroke, 2, 0.1)

	local majors = math.max(1, math.floor(maxValue / majorStep + 0.5))
	local steps = majors * minorPerMajor
	for i = 0, steps do
		local value = maxValue * i / steps
		local angle = -sweep / 2 + sweep * i / steps
		local isMajor = i % minorPerMajor == 0
		local red = redFrom ~= nil and value >= redFrom - 1e-6
		local holder = Kit.new("Frame", {
			Size = UDim2.fromScale(1, 1),
			BackgroundTransparency = 1,
			Rotation = angle,
			Parent = g,
		})
		Kit.new("Frame", {
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, 5),
			Size = UDim2.fromOffset(isMajor and 3 or 2, isMajor and 11 or 6),
			BorderSizePixel = 0,
			BackgroundColor3 = red and COLORS.Danger or (isMajor and COLORS.Text or COLORS.TextDim),
			Parent = holder,
		})
		if isMajor then
			local rad = math.rad(angle)
			Kit.new("TextLabel", {
				AnchorPoint = Vector2.new(0.5, 0.5),
				Position = UDim2.fromScale(0.5 + 0.33 * math.sin(rad), 0.5 - 0.33 * math.cos(rad)),
				Size = UDim2.fromOffset(28, 14),
				BackgroundTransparency = 1,
				Text = tostring(math.floor(value / labelDiv + 0.5)),
				TextSize = 12,
				Font = Theme.FontBold,
				TextColor3 = red and COLORS.Danger or COLORS.Text,
				Parent = g,
			})
		end
	end

	local needleHolder = Kit.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Rotation = -sweep / 2,
		ZIndex = 3,
		Parent = g,
	})
	local needle = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0, 3, 0.42, 0),
		BorderSizePixel = 0,
		BackgroundColor3 = COLORS.Danger,
		ZIndex = 3,
		Parent = needleHolder,
	})
	Kit.Corner(needle, UDim.new(1, 0))
	local cap = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(14, 14),
		BackgroundColor3 = COLORS.SurfaceAlt,
		ZIndex = 4,
		Parent = g,
	})
	Kit.Corner(cap, UDim.new(1, 0))
	local captionLabel = Kit.new("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -14),
		Size = UDim2.fromOffset(80, 14),
		BackgroundTransparency = 1,
		Text = caption,
		TextSize = 11,
		Font = Theme.Font,
		TextColor3 = COLORS.TextDim,
		Parent = g,
	})

	local api = { Frame = g, Value = 0, Caption = captionLabel }
	function api.Set(dt: number, value: number)
		local v = math.clamp(value, 0, maxValue * 1.04)
		api.Value += (v - api.Value) * math.min(1, dt * D.NeedleSharpness)
		needleHolder.Rotation = -sweep / 2 + sweep * (api.Value / maxValue)
	end
	return api
end

local function light(parent: Instance, text: string, order: number, width: number?)
	return Kit.new("TextLabel", {
		Text = text,
		LayoutOrder = order,
		Size = UDim2.fromOffset(width or 22, 20),
		BackgroundTransparency = 1,
		TextSize = 15,
		Font = Theme.FontBold,
		TextColor3 = COLORS.TextDim,
		TextTransparency = 0.8,
		Parent = parent,
	})
end

local function setLight(label: TextLabel, on: boolean, color: Color3?)
	label.TextTransparency = on and 0 or 0.82
	label.TextColor3 = on and (color or COLORS.Text) or COLORS.TextDim
end

function DashboardUI.new(parent: Instance, opts: { [string]: any })
	local self = setmetatable({}, DashboardUI)
	self.Unit = opts.Unit or "MPH"
	local unit = self.Unit

	local holder = Kit.new("Frame", {
		Name = "Dashboard",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, 40),
		Size = UDim2.fromOffset(GAUGE * 2 + 170, GAUGE + 10),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	self.Frame = holder
	Kit.Tween(holder, { Position = UDim2.new(0.5, 0, 1, -10) }, Theme.Tween.Spring)

	-- tachometer
	local redline = opts.Redline or 6500
	local tachMax = math.ceil((redline + 500) / 1000) * 1000
	if opts.Electric then
		-- EVs show a power meter instead (0..100 %)
		self.Tach = makeGauge(holder, UDim2.fromOffset(0, 5), 100, 20, 2, nil, 1, "POWER %")
	else
		self.Tach = makeGauge(holder, UDim2.fromOffset(0, 5), tachMax, 1000, 2, redline, 1000, "RPM x1000")
	end
	self.Electric = opts.Electric == true

	-- speedometer (display unit)
	local topDisplay = Units.SpeedIn(opts.TopSpeed or Units.MphToStuds(120), unit) * 1.1
	local baseMax = D.SpeedoMaxMph * (unit == "KMH" and 1.609 or 1)
	local step = (topDisplay > 200) and 40 or 20
	local speedMax = math.max(math.ceil(baseMax / step) * step, math.ceil(topDisplay / step) * step)
	self.Speedo = makeGauge(holder, UDim2.new(1, -GAUGE, 0, 5), speedMax, step, 2, nil, 1, Units.SpeedLabel(unit))

	-- centre panel
	local centre = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, 0),
		Size = UDim2.fromOffset(160, GAUGE - 6),
		BackgroundColor3 = COLORS.Background,
		BackgroundTransparency = 0.12,
		Parent = holder,
	})
	Kit.Corner(centre, Theme.CornerSmall)
	Kit.Stroke(centre, COLORS.Stroke, 1, 0.2)

	self.Gear = Kit.new("TextLabel", {
		Position = UDim2.fromOffset(8, 4),
		Size = UDim2.fromOffset(52, 40),
		BackgroundTransparency = 1,
		Text = "P",
		TextSize = 34,
		Font = Theme.FontBold,
		TextColor3 = COLORS.Accent,
		Parent = centre,
	})
	self.Mode = Kit.new("TextLabel", {
		Position = UDim2.fromOffset(8, 40),
		Size = UDim2.fromOffset(52, 12),
		BackgroundTransparency = 1,
		Text = "AUTO",
		TextSize = 10,
		Font = Theme.Font,
		TextColor3 = COLORS.TextDim,
		Parent = centre,
	})
	self.Speed = Kit.new("TextLabel", {
		Position = UDim2.new(0, 60, 0, 2),
		Size = UDim2.new(1, -66, 0, 36),
		BackgroundTransparency = 1,
		Text = "0",
		TextSize = 32,
		Font = Theme.FontBold,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = COLORS.Text,
		Parent = centre,
	})
	Kit.new("TextLabel", {
		Position = UDim2.new(0, 60, 0, 36),
		Size = UDim2.new(1, -66, 0, 12),
		BackgroundTransparency = 1,
		Text = Units.SpeedLabel(unit),
		TextSize = 11,
		Font = Theme.Font,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = COLORS.TextDim,
		Parent = centre,
	})

	-- warning lights
	local row1 = Kit.new("Frame", {
		Position = UDim2.fromOffset(6, 54),
		Size = UDim2.new(1, -12, 0, 20),
		BackgroundTransparency = 1,
		Parent = centre,
	})
	Kit.List(row1, 2, true, Enum.HorizontalAlignment.Center)
	self.L = {
		Left = light(row1, "◀", 1),
		Low = light(row1, "💡", 2),
		High = light(row1, "🔆", 3),
		Belt = light(row1, "BELT", 4, 34),
		Right = light(row1, "▶", 5),
	}
	local row2 = Kit.new("Frame", {
		Position = UDim2.fromOffset(6, 74),
		Size = UDim2.new(1, -12, 0, 20),
		BackgroundTransparency = 1,
		Parent = centre,
	})
	Kit.List(row2, 2, true, Enum.HorizontalAlignment.Center)
	self.L.Engine = light(row2, "⚙", 1)
	self.L.Damage = light(row2, "🔧", 2)
	self.L.Park = light(row2, "(P)", 3, 26)
	self.L.Cruise = light(row2, "🎯", 4)
	self.L.Fuel = light(row2, "⛽", 5)

	-- fuel bar
	local fuelBack = Kit.new("Frame", {
		Position = UDim2.fromOffset(10, 98),
		Size = UDim2.new(1, -20, 0, 6),
		BackgroundColor3 = COLORS.SurfaceAlt,
		BorderSizePixel = 0,
		Parent = centre,
	})
	Kit.Corner(fuelBack, UDim.new(1, 0))
	self.FuelFill = Kit.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = COLORS.Success,
		BorderSizePixel = 0,
		Parent = fuelBack,
	})
	Kit.Corner(self.FuelFill, UDim.new(1, 0))
	self.FuelLabel = Kit.new("TextLabel", {
		Text = opts.Electric and "🔋" or "E   ⛽   F",
		Position = UDim2.fromOffset(10, 104),
		Size = UDim2.new(1, -20, 0, 10),
		BackgroundTransparency = 1,
		TextSize = 9,
		Font = Theme.Font,
		TextColor3 = COLORS.TextDim,
		Parent = centre,
	})

	self.Odo = Kit.new("TextLabel", {
		Position = UDim2.fromOffset(6, 114),
		Size = UDim2.new(1, -12, 0, 12),
		BackgroundTransparency = 1,
		Text = "",
		TextSize = 11,
		Font = Theme.FontMono,
		TextColor3 = COLORS.TextDim,
		Parent = centre,
	})
	self.Radio = Kit.new("TextLabel", {
		Position = UDim2.fromOffset(6, 126),
		Size = UDim2.new(1, -12, 0, 13),
		BackgroundTransparency = 1,
		Text = "📻 Off",
		TextSize = 11,
		Font = Theme.Font,
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextColor3 = COLORS.Text,
		Parent = centre,
	})

	-- PC keybind hints
	if opts.ShowHints then
		local hint = Kit.new("TextLabel", {
			AnchorPoint = Vector2.new(0.5, 1),
			Position = UDim2.new(0.5, 0, 0, -6),
			Size = UDim2.fromOffset(620, 22),
			BackgroundColor3 = COLORS.Background,
			BackgroundTransparency = 0.25,
			Text = "W/S drive · A/D steer · Space handbrake · K engine · L lights · Z/X indicators · G belt · O car menu · Y camera · F exit",
			TextSize = 12,
			Font = Theme.Font,
			TextColor3 = COLORS.Text,
			Parent = holder,
		})
		Kit.Corner(hint, Theme.CornerSmall)
		task.delay(D.HintSeconds, function()
			if hint.Parent then
				Kit.Tween(hint, { TextTransparency = 1, BackgroundTransparency = 1 }, Theme.Tween.Normal)
				task.wait(0.3)
				hint:Destroy()
			end
		end)
	end
	return self
end

function DashboardUI:Update(dt: number, t: { [string]: any }, info: { [string]: any })
	local unit = self.Unit
	local speedAbs = math.abs(t.ForwardSpeed or 0)
	local display = Units.SpeedIn(speedAbs, unit)
	self.Speedo.Set(dt, display)
	self.Speed.Text = tostring(math.floor(display + 0.5))
	if self.Electric then
		self.Tach.Set(dt, (t.Throttle or 0) * 100 * (t.EngineOn and 1 or 0))
	else
		self.Tach.Set(dt, t.Rpm or 0)
	end

	self.Gear.Text = t.GearLabel or "D"
	self.Gear.TextColor3 = (t.Gear == -1) and COLORS.Warning or COLORS.Accent
	self.Mode.Text = t.Electric and "EV" or (t.Manual and "MANUAL" or "AUTO")

	local blinkOn = (os.clock() % D.BlinkPeriod) < D.BlinkPeriod / 2
	local ind = info.Indicator or ""
	setLight(self.L.Left, blinkOn and (ind == "Left" or ind == "Hazard"), COLORS.Success)
	setLight(self.L.Right, blinkOn and (ind == "Right" or ind == "Hazard"), COLORS.Success)
	local hl = info.Headlights or 0
	setLight(self.L.Low, hl >= 1, COLORS.Success)
	setLight(self.L.High, hl >= 2, COLORS.Accent)
	local belted = info.Seatbelt == true
	setLight(self.L.Belt, not belted and (blinkOn or speedAbs < 2), COLORS.Danger)
	local health = info.Health or 100
	setLight(self.L.Engine, not t.EngineOn, COLORS.Warning)
	setLight(self.L.Damage, health < Driving.Damage.LowHealth, health < Driving.Damage.NoStartHealth and COLORS.Danger or COLORS.Warning)
	setLight(self.L.Park, t.Handbrake == true, COLORS.Danger)
	setLight(self.L.Cruise, t.Cruise == true, COLORS.Success)
	local fuel = math.clamp(info.Fuel or 1, 0, 1)
	setLight(self.L.Fuel, fuel < D.LowFuel, fuel <= 0.02 and COLORS.Danger or COLORS.Warning)

	self.FuelFill.Size = UDim2.fromScale(fuel, 1)
	self.FuelFill.BackgroundColor3 = fuel < D.LowFuel and COLORS.Danger or (fuel < 0.35 and COLORS.Warning or COLORS.Success)

	if t.Cruise and t.CruiseSpeed then
		self.Odo.Text = ("CRUISE %d %s"):format(math.floor(Units.SpeedIn(t.CruiseSpeed, unit) + 0.5), Units.SpeedLabel(unit))
	else
		self.Odo.Text = info.Odometer or ""
	end
	self.Radio.Text = "📻 " .. (info.Radio or "Off")
end

function DashboardUI:Destroy()
	if self.Frame then
		self.Frame:Destroy()
		self.Frame = nil
	end
end

return DashboardUI
