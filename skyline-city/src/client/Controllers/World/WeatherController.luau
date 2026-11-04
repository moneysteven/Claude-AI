-- WeatherController: local weather visuals driven by Workspace attributes "Weather" / "WeatherIntensity"
-- (set by WorldService; Atmosphere + Clouds are eased by the server).
--   * rain streak particles on an emitter that follows the camera (one reusable emitter part)
--   * pooled ground splash rings around the camera
--   * roof check: no rain while you are indoors / under cover
--   * wet look (local ColorCorrection + exposure), fog tint, smooth fades between states
--   * thunder flashes (+ optional sound) in heavy rain
--   * rain loop sound if Config/Audio.World.Rain is set

local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Ambient = require(Shared.Config.Ambient)
local Audio = require(Shared.Config.Audio)
local Pool = require(Shared.Util.Pool)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))

local WeatherController = {
	Name = "WeatherController",
	Priority = 140,
}

local CFG = Ambient.Rain
local player = Players.LocalPlayer
local rng = Random.new()

local fxFolder: Folder
local emitterPart: Part
local emitter: ParticleEmitter
local cc: ColorCorrectionEffect
local splashPool
local rainSound: Sound? = nil
local thunderSound: Sound? = nil

local weather = "Clear"
local intensity = 0
local rainAmount = 0 -- smoothed 0..1
local indoors = false
local lowGraphics = false
local baseExposure = 0

local function makeSound(id: string, looped: boolean, volume: number): Sound?
	if type(id) ~= "string" or id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Looped = looped
	s.Volume = volume
	s.Parent = SoundService
	return s
end

local function buildEmitter()
	emitterPart = Instance.new("Part")
	emitterPart.Name = "RainEmitter"
	emitterPart.Anchored = true
	emitterPart.CanCollide = false
	emitterPart.CanQuery = false
	emitterPart.CanTouch = false
	emitterPart.CastShadow = false
	emitterPart.Transparency = 1
	emitterPart.Size = CFG.EmitterSize
	emitterPart.Parent = fxFolder

	emitter = Instance.new("ParticleEmitter")
	emitter.Name = "Rain"
	emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	emitter.Color = ColorSequence.new(Color3.fromRGB(190, 210, 230))
	emitter.LightEmission = 0.2
	emitter.LightInfluence = 0.8
	emitter.Transparency = NumberSequence.new(0.35)
	emitter.Size = NumberSequence.new(0.12)
	emitter.Squash = NumberSequence.new(2.4)
	emitter.Orientation = Enum.ParticleOrientation.VelocityParallel
	emitter.EmissionDirection = Enum.NormalId.Bottom
	emitter.Shape = Enum.ParticleEmitterShape.Box
	emitter.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
	emitter.Lifetime = NumberRange.new(0.5, 0.7)
	emitter.Speed = NumberRange.new(CFG.Speed[1], CFG.Speed[2])
	emitter.Acceleration = Vector3.new(4, 0, 2)
	emitter.Rate = 0
	emitter.Enabled = true
	emitter.Parent = emitterPart
end

local function newSplash(): Instance
	local p = Instance.new("Part")
	p.Name = "Splash"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Shape = Enum.PartType.Cylinder
	p.Material = Enum.Material.SmoothPlastic
	p.Color = Color3.fromRGB(210, 225, 240)
	p.Size = Vector3.new(0.05, 0.6, 0.6)
	p.Transparency = 0.4
	return p
end

local splashParams = RaycastParams.new()
splashParams.FilterType = Enum.RaycastFilterType.Exclude
splashParams.RespectCanCollide = true
splashParams.IgnoreWater = false

local function splash(around: Vector3)
	local r = CFG.Splashes.Radius
	local origin = around + Vector3.new(rng:NextNumber(-r, r), 30, rng:NextNumber(-r, r))
	local filter = { fxFolder }
	if player.Character then
		table.insert(filter, player.Character)
	end
	splashParams.FilterDescendantsInstances = filter
	local hit = Workspace:Raycast(origin, Vector3.new(0, -80, 0), splashParams)
	if not hit then
		return
	end
	local p = splashPool:Get() :: Part
	p.Size = Vector3.new(0.05, 0.4, 0.4)
	p.Transparency = 0.35
	p.CFrame = CFrame.new(hit.Position + Vector3.new(0, 0.03, 0)) * CFrame.Angles(0, 0, math.pi / 2)
	p.Parent = fxFolder
	local tw = TweenService:Create(p, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Size = Vector3.new(0.05, 2.2, 2.2), Transparency = 1 })
	tw.Completed:Once(function()
		splashPool:Release(p)
	end)
	tw:Play()
end

local function flash()
	if not cc then
		return
	end
	local t1 = TweenService:Create(cc, TweenInfo.new(0.06), { Brightness = 0.45 })
	t1.Completed:Once(function()
		TweenService:Create(cc, TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Brightness = 0 }):Play()
	end)
	t1:Play()
	if thunderSound then
		task.delay(rng:NextNumber(0.4, 1.6), function()
			if thunderSound then
				thunderSound.PlaybackSpeed = rng:NextNumber(0.85, 1.1)
				thunderSound:Play()
			end
		end)
	end
end

local function applyLook()
	-- wet look / fog tint target values (tweened)
	local targetSat, targetContrast, targetExposure, targetTint = 0, 0, 0, Color3.new(1, 1, 1)
	if weather == "Rain" then
		targetSat = CFG.WetSaturation
		targetContrast = CFG.WetContrast
		targetExposure = CFG.WetExposure
		targetTint = Color3.fromRGB(226, 234, 245)
	elseif weather == "Fog" then
		targetSat = CFG.FogSaturation
		targetTint = Color3.fromRGB(236, 238, 240)
	elseif weather == "Cloudy" then
		targetSat = -0.05
		targetExposure = -0.1
	end
	local info = TweenInfo.new(CFG.FadeSeconds, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
	TweenService:Create(cc, info, { Saturation = targetSat, Contrast = targetContrast, TintColor = targetTint }):Play()
	TweenService:Create(Lighting, info, { ExposureCompensation = baseExposure + targetExposure }):Play()
end

local function readWeather()
	local w = Workspace:GetAttribute("Weather")
	weather = type(w) == "string" and w or "Clear"
	local i = Workspace:GetAttribute("WeatherIntensity")
	intensity = type(i) == "number" and i or 0
	applyLook()
end

local function checkIndoors()
	local cam = Workspace.CurrentCamera
	if not cam then
		return
	end
	local filter = { fxFolder }
	if player.Character then
		table.insert(filter, player.Character)
	end
	local traffic = Workspace:FindFirstChild("NPCTraffic")
	if traffic then
		table.insert(filter, traffic)
	end
	splashParams.FilterDescendantsInstances = filter
	local hit = Workspace:Raycast(cam.CFrame.Position + Vector3.new(0, 1, 0), Vector3.new(0, CFG.IndoorRayLength, 0), splashParams)
	indoors = hit ~= nil
end

function WeatherController:Start()
	fxFolder = Workspace:FindFirstChild("WorldFx") :: Folder
	if not fxFolder then
		fxFolder = Instance.new("Folder")
		fxFolder.Name = "WorldFx"
		fxFolder.Parent = Workspace
	end
	buildEmitter()
	splashPool = Pool.new(newSplash, 10, CFG.Splashes.Pool)
	cc = Instance.new("ColorCorrectionEffect")
	cc.Name = "WeatherLook"
	cc.Parent = Lighting
	baseExposure = Lighting.ExposureCompensation
	rainSound = makeSound(Audio.World.Rain, true, 0)
	thunderSound = makeSound(Audio.World.Thunder, false, 0.7)
	if rainSound then
		rainSound:Play()
	end

	lowGraphics = ClientData.Get("Settings.LowGraphics") == true
	ClientData.OnChanged("Settings.LowGraphics", function(v)
		lowGraphics = v == true
	end)

	readWeather()
	Workspace:GetAttributeChangedSignal("Weather"):Connect(readWeather)
	Workspace:GetAttributeChangedSignal("WeatherIntensity"):Connect(readWeather)

	local splashAcc = 0
	RunService.RenderStepped:Connect(function(dt)
		local cam = Workspace.CurrentCamera
		if not cam then
			return
		end
		local want = (weather == "Rain" and not indoors) and math.max(0.3, intensity) or 0
		local k = 1 - math.exp(-dt / math.max(0.1, CFG.FadeSeconds / 3))
		rainAmount += (want - rainAmount) * k
		local rate = (lowGraphics and CFG.LowGraphicsRate or CFG.Rate) * rainAmount
		emitter.Rate = rate
		if rainAmount > 0.01 then
			emitterPart.CFrame = CFrame.new(cam.CFrame.Position + Vector3.new(0, CFG.EmitterHeight, 0) + cam.CFrame.LookVector * 20)
			local perSecond = (lowGraphics and CFG.Splashes.LowGraphicsPerSecond or CFG.Splashes.PerSecond) * rainAmount
			splashAcc += dt * perSecond
			while splashAcc >= 1 do
				splashAcc -= 1
				splash(cam.CFrame.Position)
			end
		else
			splashAcc = 0
		end
		if rainSound then
			rainSound.Volume = CFG.Volume * rainAmount * (indoors and 0.4 or 1)
		end
	end)

	task.spawn(function()
		while true do
			task.wait(CFG.IndoorCheckInterval)
			pcall(checkIndoors)
		end
	end)
	task.spawn(function()
		while true do
			task.wait(rng:NextNumber(CFG.ThunderInterval[1], CFG.ThunderInterval[2]))
			if weather == "Rain" and intensity >= Ambient.Weather.HeavyRainThreshold then
				flash()
			end
		end
	end)
end

return WeatherController
