-- Weather (World helper): server weather state machine (Clear / Cloudy / Rain / Fog).
-- Picks the next weather by Config/World.Weather.Weights every ChangeEveryMinutes (random range) and eases
-- Lighting.Atmosphere + Terrain.Clouds toward the profile in Config/Ambient.Weather at 1 Hz (no per-frame work).
-- Clients read Workspace attributes "Weather" and "WeatherIntensity" for rain, wet look and thunder.
--
--   Weather.Init(atmosphere, clouds)
--   Weather.Step(now)            call at 1 Hz
--   Weather.Get() -> string, intensity
--   Weather.Set(name, intensity?) force a weather (admin / testing)
--   Weather.Changed : Signal(name, intensity)

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Ambient = require(Shared.Config.Ambient)
local Signal = require(Shared.Util.Signal)

local Weather = {}
Weather.Changed = Signal.new()

local PROFILES = Ambient.Weather.Profiles
local rng = Random.new()

local atmosphere: Atmosphere? = nil
local clouds: Clouds? = nil
local current = "Clear"
local intensity = 0
local nextChange = 0
local transition = { T0 = 0, From = nil :: any, To = nil :: any }

local function snapshot()
	return {
		Density = atmosphere and atmosphere.Density or 0.3,
		Haze = atmosphere and atmosphere.Haze or 1,
		Glare = atmosphere and atmosphere.Glare or 0,
		CloudCover = clouds and clouds.Cover or 0.4,
		CloudDensity = clouds and clouds.Density or 0.4,
	}
end

local function schedule(now: number)
	local range = World.Weather.ChangeEveryMinutes
	nextChange = now + rng:NextNumber(range[1], range[2]) * 60
end

local function pick(): string
	local total = 0
	for _, w in pairs(World.Weather.Weights) do
		total += w
	end
	local roll = rng:NextNumber(0, total)
	for name, w in pairs(World.Weather.Weights) do
		roll -= w
		if roll <= 0 then
			return name
		end
	end
	return "Clear"
end

function Weather.Set(name: string, forcedIntensity: number?)
	local profile = PROFILES[name]
	if not profile then
		return
	end
	current = name
	local r = profile.Intensity or { 0, 0 }
	intensity = forcedIntensity or (r[1] + (r[2] - r[1]) * rng:NextNumber())
	transition.T0 = os.clock()
	transition.From = snapshot()
	transition.To = profile
	Workspace:SetAttribute("Weather", current)
	Workspace:SetAttribute("WeatherIntensity", math.floor(intensity * 100 + 0.5) / 100)
	Weather.Changed:Fire(current, intensity)
end

function Weather.Init(atm: Atmosphere?, cl: Clouds?)
	atmosphere = atm
	clouds = cl
	schedule(os.clock())
	Weather.Set("Clear", 0)
end

local function lerp(a: number, b: number, t: number): number
	return a + (b - a) * t
end

function Weather.Step(now: number)
	if now >= nextChange then
		schedule(now)
		local nextWeather = pick()
		if nextWeather ~= current or nextWeather == "Rain" then
			Weather.Set(nextWeather)
		end
	end
	local from, to = transition.From, transition.To
	if from and to then
		local t = math.clamp((now - transition.T0) / Ambient.Weather.TransitionSeconds, 0, 1)
		-- smoothstep
		t = t * t * (3 - 2 * t)
		if atmosphere then
			atmosphere.Density = lerp(from.Density, to.Density, t)
			atmosphere.Haze = lerp(from.Haze, to.Haze, t)
			atmosphere.Glare = lerp(from.Glare, to.Glare, t)
		end
		if clouds then
			clouds.Cover = lerp(from.CloudCover, to.CloudCover, t)
			clouds.Density = lerp(from.CloudDensity, to.CloudDensity, t)
		end
		if t >= 1 then
			transition.From = nil
		end
	end
end

function Weather.Get(): (string, number)
	return current, intensity
end

return Weather
