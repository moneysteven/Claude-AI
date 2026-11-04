-- AmbientController: smooth day/night and district ambience on the client.
--   * Lighting.ClockTime is predicted every frame from the server's Clock/ClockAt/ClockRate attributes
--     (the server only updates it at 1 Hz), so the sun glides instead of ticking
--   * gentle night look (local ambient tint) blended around dusk / dawn
--   * looping district ambience (Config/Audio.World ids; empty ids are skipped) cross-faded on District change
--   * VIP doors become passable for VIP members (VipDoors helper)
-- API: AmbientController:GetClock() -> number, AmbientController:IsNight() -> boolean

local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Ambient = require(Shared.Config.Ambient)
local Audio = require(Shared.Config.Audio)

local WorldClock = require(script.Parent:WaitForChild("WorldClock"))
local VipDoors = require(script.Parent:WaitForChild("VipDoors"))

local AmbientController = {
	Name = "AmbientController",
	Priority = 120,
}

local CFG = Ambient.Ambience
local player = Players.LocalPlayer
local sounds: { [string]: Sound } = {}
local currentKey: string? = nil
local nightCC: ColorCorrectionEffect

function AmbientController:GetClock(): number
	return WorldClock.Get()
end

function AmbientController:IsNight(): boolean
	return WorldClock.IsNight()
end

local function soundFor(key: string): Sound?
	if sounds[key] then
		return sounds[key]
	end
	local id = Audio.World[key]
	if type(id) ~= "string" or id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.Name = "Ambience_" .. key
	s.SoundId = id
	s.Looped = true
	s.Volume = 0
	s.Parent = SoundService
	sounds[key] = s
	return s
end

local function setAmbience()
	local district = player:GetAttribute("District")
	local key = (type(district) == "string" and CFG.ByDistrict[district]) or CFG.Default
	if key == currentKey then
		return
	end
	local info = TweenInfo.new(CFG.FadeSeconds, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
	if currentKey and sounds[currentKey] then
		local old = sounds[currentKey]
		local t = TweenService:Create(old, info, { Volume = 0 })
		t.Completed:Once(function()
			if old.Volume <= 0.001 then
				old:Stop()
			end
		end)
		t:Play()
	end
	currentKey = key
	local s = soundFor(key)
	if s then
		if not s.IsPlaying then
			s:Play()
		end
		TweenService:Create(s, info, { Volume = CFG.Volume }):Play()
	end
end

function AmbientController:Start()
	nightCC = Instance.new("ColorCorrectionEffect")
	nightCC.Name = "NightLook"
	nightCC.Parent = Lighting

	local last = 0
	RunService.RenderStepped:Connect(function()
		if type(Workspace:GetAttribute("Clock")) ~= "number" then
			return
		end
		local c = WorldClock.Get()
		Lighting.ClockTime = c
		local now = os.clock()
		if now - last > 0.25 then
			last = now
			local n = WorldClock.NightAmount(c)
			nightCC.TintColor = Color3.new(1, 1, 1):Lerp(Color3.fromRGB(196, 210, 255), n)
			nightCC.Saturation = -0.08 * n
		end
	end)

	setAmbience()
	player:GetAttributeChangedSignal("District"):Connect(setAmbience)
	VipDoors.Start()
end

return AmbientController
