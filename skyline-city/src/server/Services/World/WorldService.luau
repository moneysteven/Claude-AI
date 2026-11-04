-- WorldService: the procedural city, day/night clock, weather, zones and teleports.
--
-- API (ARCHITECTURE §5 World):
--   World:GetClock() -> number (0-24)          World:GetDay() -> number      World:GetWeek() -> number
--   World:IsNight() -> boolean                  World:GetWeather() -> "Clear"|"Cloudy"|"Rain"|"Fog"
--   World.HourChanged(hour) / World.DayChanged(day) / World.WeekChanged(week)   (Signals)
--   World:GetDistrictAt(pos) -> string?         World:IsInSafeZone(pos) -> boolean
--   World:Teleport(player, cframe) -> boolean   (anti-exploit whitelisted)
--   World:GetSpawnCFrame() -> CFrame
-- Extras: World:GetWeatherIntensity() -> 0..1, World:SetWeather(name) (admin/testing), World:IsCityReady().
--
-- Replicated state:
--   Lighting.ClockTime (1 Hz, clients smooth it), Workspace attributes Clock, ClockAt, ClockRate, Day, Week,
--   Night, Weather, WeatherIntensity, CityReady, CityDecorReady.
--   Player attributes District (string, "" outside districts) and InSafeZone (bool) at 2 Hz.
-- Remote "World": GetState -> { Clock, ClockAt, ClockRate, Day, Week, Night, Weather, WeatherIntensity }

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local WorldConfig = require(Shared.Config.World)
local Ambient = require(Shared.Config.Ambient)
local Guard = require(ServerScriptService.Server.Lib.Guard)
local Registry = require(ServerScriptService.Server.Registry)

local WorldBuilder = require(script.Parent.WorldBuilder)
local Zones = require(script.Parent.Zones)
local Weather = require(script.Parent.Weather)
local Access = require(script.Parent.Access)

local WorldService = {
	Name = "WorldService",
	Priority = 3, -- build the city before other services Init (they look for tagged parts)
}

WorldService.HourChanged = Signal.new()
WorldService.DayChanged = Signal.new()
WorldService.WeekChanged = Signal.new()

local TIME = WorldConfig.Time
local Tags = WorldConfig.Tags
local CLOCK_RATE = 24 / (TIME.DayLengthMinutes * 60) -- in-game hours per real second

local clock = TIME.StartClockTime
local day = 1
local week = 1
local lastHour = math.floor(clock)
local rng = Random.new()

---------------------------------------------------------------------------
-- Lighting
---------------------------------------------------------------------------
local function ensure(parent: Instance, className: string, name: string?): Instance
	local existing = parent:FindFirstChildOfClass(className)
	if existing then
		return existing
	end
	local inst = Instance.new(className)
	if name then
		inst.Name = name
	end
	inst.Parent = parent
	return inst
end

local function setupLighting(): (Atmosphere, Clouds?)
	local L = Ambient.Lighting
	local atm = ensure(Lighting, "Atmosphere") :: Atmosphere
	atm.Density = L.Atmosphere.Density
	atm.Offset = L.Atmosphere.Offset
	atm.Color = L.Atmosphere.Color
	atm.Decay = L.Atmosphere.Decay
	atm.Glare = L.Atmosphere.Glare
	atm.Haze = L.Atmosphere.Haze
	ensure(Lighting, "Sky")
	local bloom = ensure(Lighting, "BloomEffect") :: BloomEffect
	bloom.Intensity = L.Bloom.Intensity
	bloom.Size = L.Bloom.Size
	bloom.Threshold = L.Bloom.Threshold
	local cc = ensure(Lighting, "ColorCorrectionEffect") :: ColorCorrectionEffect
	cc.Brightness = L.ColorCorrection.Brightness
	cc.Contrast = L.ColorCorrection.Contrast
	cc.Saturation = L.ColorCorrection.Saturation
	cc.TintColor = L.ColorCorrection.TintColor
	local rays = ensure(Lighting, "SunRaysEffect") :: SunRaysEffect
	rays.Intensity = L.SunRays.Intensity
	rays.Spread = L.SunRays.Spread
	local clouds: Clouds? = nil
	local ok = pcall(function()
		local c = ensure(Workspace.Terrain, "Clouds") :: Clouds
		c.Cover = L.Clouds.Cover
		c.Density = L.Clouds.Density
		c.Color = L.Clouds.Color
		clouds = c
	end)
	if not ok then
		clouds = nil
	end
	return atm, clouds
end

-- Optional real NPC models: ServerStorage.Assets.NPCs children named "TrafficCar*" / "Pedestrian*" are copied
-- (scripts stripped) to ReplicatedStorage.WorldNPCAssets so the client traffic/pedestrian pools can use them.
local function replicateNpcAssets()
	local ServerStorage = game:GetService("ServerStorage")
	local assets = ServerStorage:FindFirstChild("Assets")
	local npcs = assets and assets:FindFirstChild("NPCs")
	if not npcs then
		return
	end
	local out: Folder? = nil
	for _, child in ipairs(npcs:GetChildren()) do
		if child:IsA("Model") and (child.Name:sub(1, 10) == "TrafficCar" or child.Name:sub(1, 10) == "Pedestrian") then
			if not out then
				local f = Instance.new("Folder")
				f.Name = "WorldNPCAssets"
				out = f
			end
			local copy = child:Clone()
			for _, d in ipairs(copy:GetDescendants()) do
				if d:IsA("BaseScript") or d:IsA("ModuleScript") then
					d:Destroy()
				end
			end
			copy.Parent = out
		end
	end
	if out then
		out.Parent = ReplicatedStorage
	end
end

---------------------------------------------------------------------------
-- Clock
---------------------------------------------------------------------------
local function isNight(c: number): boolean
	return c >= TIME.NightStart or c < TIME.NightEnd
end

local function publishClock()
	Lighting.ClockTime = clock
	Workspace:SetAttribute("Clock", clock)
	Workspace:SetAttribute("ClockAt", Workspace:GetServerTimeNow())
	Workspace:SetAttribute("ClockRate", CLOCK_RATE)
	Workspace:SetAttribute("Night", isNight(clock))
end

local function advance(dt: number)
	clock += dt * CLOCK_RATE
	if clock >= 24 then
		clock -= 24
		day += 1
		Workspace:SetAttribute("Day", day)
		WorldService.DayChanged:Fire(day)
		if (day - 1) % TIME.DaysPerWeek == 0 then
			week += 1
			Workspace:SetAttribute("Week", week)
			WorldService.WeekChanged:Fire(week)
		end
	end
	local hour = math.floor(clock)
	if hour ~= lastHour then
		lastHour = hour
		WorldService.HourChanged:Fire(hour)
	end
	publishClock()
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function WorldService:GetClock(): number
	return clock
end

function WorldService:GetDay(): number
	return day
end

function WorldService:GetWeek(): number
	return week
end

function WorldService:IsNight(): boolean
	return isNight(clock)
end

function WorldService:GetWeather(): string
	local w = Weather.Get()
	return w
end

function WorldService:GetWeatherIntensity(): number
	local _, i = Weather.Get()
	return i
end

function WorldService:SetWeather(name: string)
	Weather.Set(name)
end

function WorldService:IsCityReady(): boolean
	return Workspace:GetAttribute("CityReady") == true
end

function WorldService:GetDistrictAt(pos: Vector3): string?
	if typeof(pos) ~= "Vector3" then
		return nil
	end
	return Zones.DistrictAt(pos)
end

function WorldService:IsInSafeZone(pos: Vector3): boolean
	if typeof(pos) ~= "Vector3" then
		return false
	end
	return Zones.Find(Tags.SafeZone, pos) ~= nil
end

function WorldService:Teleport(player: Player, cframe: CFrame): boolean
	if typeof(player) ~= "Instance" or not player:IsA("Player") or not Guard.CFrame(cframe) then
		return false
	end
	local char = player.Character
	if not char or not char.Parent then
		return false
	end
	local anti = Registry.Find("AntiExploitService")
	if anti and anti.Whitelist then
		pcall(anti.Whitelist, anti, player, 3)
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	if hum and hum.SeatPart then
		local weld = hum.SeatPart:FindFirstChild("SeatWeld")
		if weld then
			weld:Destroy()
		end
		hum.Sit = false
	end
	char:PivotTo(cframe)
	local root = char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		root.AssemblyLinearVelocity = Vector3.zero
	end
	return true
end

function WorldService:GetSpawnCFrame(): CFrame
	local spawns = {}
	for _, inst in ipairs(CollectionService:GetTagged(Tags.SpawnPoint)) do
		if inst:IsA("BasePart") and inst:IsDescendantOf(Workspace) then
			table.insert(spawns, inst)
		end
	end
	if #spawns == 0 then
		return CFrame.new(0, 5, 0)
	end
	local s: BasePart = spawns[rng:NextInteger(1, #spawns)]
	local look = s.CFrame.LookVector
	local pos = s.Position + Vector3.new(0, s.Size.Y / 2 + 3, 0)
	return CFrame.lookAt(pos, pos + Vector3.new(look.X, 0, look.Z))
end

local function state()
	local w, i = Weather.Get()
	return {
		ok = true,
		Clock = clock,
		ClockAt = Workspace:GetServerTimeNow(),
		ClockRate = CLOCK_RATE,
		Day = day,
		Week = week,
		Night = isNight(clock),
		Weather = w,
		WeatherIntensity = i,
		NightStart = TIME.NightStart,
		NightEnd = TIME.NightEnd,
	}
end

---------------------------------------------------------------------------
-- Zone attributes (2 Hz, batched over all players)
---------------------------------------------------------------------------
local function zoneTick()
	for _, player in ipairs(Players:GetPlayers()) do
		local char = player.Character
		local root = char and char:FindFirstChild("HumanoidRootPart")
		if root and root:IsA("BasePart") then
			local pos = root.Position
			local district = Zones.DistrictAt(pos) or ""
			if player:GetAttribute("District") ~= district then
				player:SetAttribute("District", district)
			end
			local safe = Zones.Find(Tags.SafeZone, pos) ~= nil
			if player:GetAttribute("InSafeZone") ~= safe then
				player:SetAttribute("InSafeZone", safe)
			end
			Access.CheckVip(player, pos)
		end
	end
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function WorldService:Init()
	Net.Declare("WorldEvent")
	local atm, clouds = setupLighting()
	if not Workspace:FindFirstChild("City") then
		local ok, err = pcall(WorldBuilder.Build)
		if not ok then
			warn("[WorldService] city build failed: " .. tostring(err))
		end
	else
		Workspace:SetAttribute("CityReady", true)
		Workspace:SetAttribute("CityDecorReady", true)
	end
	pcall(replicateNpcAssets)
	Zones.Init()
	Weather.Init(atm, clouds)
	Access.Init(self)
	Workspace:SetAttribute("Day", day)
	Workspace:SetAttribute("Week", week)
	publishClock()

	Net.HandleActions("World", {
		GetState = function(_player: Player)
			return state()
		end,
	}, { rate = 2, burst = 6 })

	Players.PlayerAdded:Connect(function(player)
		player:SetAttribute("District", "")
		player:SetAttribute("InSafeZone", false)
	end)
	for _, player in ipairs(Players:GetPlayers()) do
		player:SetAttribute("District", player:GetAttribute("District") or "")
		player:SetAttribute("InSafeZone", player:GetAttribute("InSafeZone") == true)
	end
	Players.PlayerRemoving:Connect(function(player)
		Access.Forget(player)
	end)
end

function WorldService:Start()
	-- clock + weather at 1 Hz
	task.spawn(function()
		local last = os.clock()
		while true do
			task.wait(1)
			local now = os.clock()
			local dt = math.min(now - last, 5)
			last = now
			local ok, err = pcall(function()
				advance(dt)
				Weather.Step(now)
			end)
			if not ok then
				warn("[WorldService] clock tick error: " .. tostring(err))
			end
		end
	end)
	-- zone attributes at Config.Ambient.Zones.UpdateHz
	task.spawn(function()
		local interval = 1 / math.max(0.5, Ambient.Zones.UpdateHz)
		while true do
			task.wait(interval)
			local ok, err = pcall(zoneTick)
			if not ok then
				warn("[WorldService] zone tick error: " .. tostring(err))
			end
		end
	end)
end

return WorldService
