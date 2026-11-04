-- CarLights: every lamp of one car, driven from the car's attributes (client).
--
--   local l = CarLights.new(model)
--   l:Update(now, state)    state = { Headlights, Brake, Reverse, Indicator, Siren, Interior, Underglow (Color3?),
--                                     Engine, LowGraphics }
--   l:Destroy()
--
-- Lamp parts (Lights/*) carry OnColor / OffColor / LampKind attributes from the server builder; asset models
-- without them still work (defaults by name). Changes are applied only when a lamp's state flips, so the
-- per-frame cost is a few comparisons.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local VehiclesConfig = require(Shared.Config.Vehicles)

local V = VehiclesConfig.Visuals

local CarLights = {}
CarLights.__index = CarLights

local DEFAULT_ON = {
	Head = Color3.fromRGB(255, 250, 230),
	Tail = Color3.fromRGB(255, 30, 30),
	Brake = Color3.fromRGB(255, 20, 20),
	Indicator = Color3.fromRGB(255, 170, 30),
	Reverse = Color3.fromRGB(255, 255, 255),
	Siren = Color3.fromRGB(255, 40, 40),
}

local function kindOf(part: BasePart): string?
	local k = part:GetAttribute("LampKind")
	if type(k) == "string" then
		return k
	end
	local n = part.Name
	if n:find("^Headlight") then
		return "Head"
	elseif n:find("^Taillight") then
		return "Tail"
	elseif n:find("^Brake") then
		return "Brake"
	elseif n:find("^Indicator") then
		return "Indicator"
	elseif n:find("^Reverse") then
		return "Reverse"
	elseif n:find("^Siren") then
		return "Siren"
	end
	return nil
end

local function makeLamp(part: BasePart, kind: string)
	local light = part:FindFirstChildWhichIsA("Light")
	return {
		Part = part,
		Kind = kind,
		Light = light,
		On = (part:GetAttribute("OnColor") :: Color3?) or DEFAULT_ON[kind] or part.Color,
		Off = (part:GetAttribute("OffColor") :: Color3?) or part.Color,
		OffMaterial = part.Material,
		BaseBrightness = light and light.Brightness or 1,
		Level = -1, -- current applied level (0 off .. 1 full); -1 = unknown
		Group = part:GetAttribute("SirenGroup"),
		Corner = part.Name:match("_(%u%u)$") or part.Name:match("_(%u)$"),
	}
end

function CarLights.new(model: Model)
	local self = setmetatable({}, CarLights)
	self.Model = model
	self.Lamps = {} :: { any }
	self.ByKind = { Head = {}, Tail = {}, Brake = {}, Indicator = {}, Reverse = {}, Siren = {} }
	local folder = model:FindFirstChild("Lights")
	if folder then
		for _, d in ipairs(folder:GetDescendants()) do
			if d:IsA("BasePart") then
				local kind = kindOf(d)
				if kind and self.ByKind[kind] then
					local lamp = makeLamp(d, kind)
					table.insert(self.Lamps, lamp)
					table.insert(self.ByKind[kind], lamp)
				end
			end
		end
		local interior = folder:FindFirstChild("Interior")
		self.Interior = interior and interior:FindFirstChildWhichIsA("Light") or nil
		local under = folder:FindFirstChild("Underglow")
		self.Underglow = under and under:FindFirstChildWhichIsA("Light") or nil
	end
	self.InteriorOn = nil
	self.UnderglowKey = nil
	self.HeadLevel = -1
	return self
end

-- level: 0 = off, 0..1 = dim glow, 1 = full
local function setLamp(lamp, level: number, lowGraphics: boolean, spot: { [string]: number }?)
	if lamp.Level == level and not spot then
		return
	end
	lamp.Level = level
	local part: BasePart = lamp.Part
	if not part.Parent then
		return
	end
	if level <= 0 then
		part.Material = lamp.OffMaterial
		part.Color = lamp.Off
	else
		part.Material = Enum.Material.Neon
		part.Color = lamp.Off:Lerp(lamp.On, math.clamp(level, 0, 1))
	end
	local light = lamp.Light
	if light then
		local enable = level > 0 and not (lowGraphics and (lamp.Kind == "Siren" or lamp.Kind == "Indicator"))
		light.Enabled = enable
		if enable then
			if spot and light:IsA("SpotLight") then
				light.Brightness = spot.Brightness
				light.Range = spot.Range
				light.Angle = spot.Angle
			else
				light.Brightness = lamp.BaseBrightness * math.clamp(level, 0.2, 1)
			end
		end
	end
end

function CarLights:Update(now: number, s: { [string]: any })
	local low = s.LowGraphics == true
	-- headlights
	local head = s.Headlights or 0
	if head ~= self.HeadLevel or self.HeadLow ~= low then
		self.HeadLevel = head
		self.HeadLow = low
		local spot = head == 2 and V.Headlights.High or V.Headlights.Low
		for _, lamp in ipairs(self.ByKind.Head) do
			lamp.Level = -1
			setLamp(lamp, head > 0 and 1 or 0, low, head > 0 and spot or nil)
			if lamp.Light then
				lamp.Light.Enabled = head > 0 and not (low and head == 1 and lamp.Part.Name ~= "Headlight_L")
			end
		end
	end
	-- tail + brake
	local brake = s.Brake == true
	local tailLevel = brake and 1 or (head > 0 and V.TaillightIdle or 0)
	for _, lamp in ipairs(self.ByKind.Tail) do
		setLamp(lamp, tailLevel, low)
	end
	for _, lamp in ipairs(self.ByKind.Brake) do
		setLamp(lamp, brake and 1 or 0, low)
	end
	for _, lamp in ipairs(self.ByKind.Reverse) do
		setLamp(lamp, s.Reverse == true and 1 or 0, low)
	end
	-- indicators / hazards (1.5 Hz, in phase for every car on this client)
	local ind = s.Indicator or ""
	local phaseOn = ((now * V.BlinkHz) % 1) < 0.5
	self.BlinkPhase = phaseOn
	for _, lamp in ipairs(self.ByKind.Indicator) do
		local corner = lamp.Corner or ""
		local isLeft = corner:sub(-1) == "L"
		local active = ind == "Hazard" or (ind == "Left" and isLeft) or (ind == "Right" and not isLeft and corner ~= "")
		setLamp(lamp, (active and phaseOn) and 1 or 0, low)
	end
	-- siren bar: groups A / B alternate
	local siren = s.Siren == true
	local sirenPhase = ((now * V.SirenHz) % 1) < 0.5
	for _, lamp in ipairs(self.ByKind.Siren) do
		local on = siren and ((lamp.Group == "B") ~= sirenPhase)
		setLamp(lamp, on and 1 or 0, low)
	end
	-- interior
	local interiorOn = s.Interior == true
	if self.Interior and self.InteriorOn ~= interiorOn then
		self.InteriorOn = interiorOn
		self.Interior.Enabled = interiorOn
	end
	-- underglow
	local glow = s.Underglow
	local glowOn = typeof(glow) == "Color3" and (s.Engine == true or head > 0) and not low
	local key = glowOn and tostring(glow) or "off"
	if self.Underglow and self.UnderglowKey ~= key then
		self.UnderglowKey = key
		self.Underglow.Enabled = glowOn
		if glowOn then
			self.Underglow.Color = glow
		end
	end
end

-- Return every lamp to its off look (car left the animation range).
function CarLights:Reset()
	for _, lamp in ipairs(self.Lamps) do
		setLamp(lamp, 0, true)
	end
	self.HeadLevel = -1
	if self.Interior then
		self.Interior.Enabled = false
	end
	self.InteriorOn = nil
	if self.Underglow then
		self.Underglow.Enabled = false
	end
	self.UnderglowKey = nil
end

function CarLights:Destroy()
	table.clear(self.Lamps)
end

return CarLights
