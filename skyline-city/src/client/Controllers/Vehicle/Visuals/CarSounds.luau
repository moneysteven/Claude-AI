-- CarSounds: 3D sounds of one car, played locally on every client (client).
--
--   local s = CarSounds.new(model)
--   s:Update(dt, state)   state = { Engine, Rpm, Idle, Redline, Electric, Horn, Siren, Throttle, Near }
--   s:OneShot(key)        "EngineStart" | "DoorOpen" | "DoorClose" | "LockBeep" | "Indicator" | "WindowMotor" | "Crash"
--   s:Destroy()
--
-- Sound ids come from Config/Audio.Vehicle; empty ids are skipped (no errors with no assets).
-- Sounds are parented to the chassis "SoundEmitter" attachment and use the "SFX" SoundGroup when present.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Audio = require(Shared.Config.Audio)
local VehiclesConfig = require(Shared.Config.Vehicles)

local V = VehiclesConfig.Visuals
local A = Audio.Vehicle or {}

local CarSounds = {}
CarSounds.__index = CarSounds

local function group(): SoundGroup?
	local g = SoundService:FindFirstChild("SFX")
	if g and g:IsA("SoundGroup") then
		return g
	end
	return nil
end

function CarSounds.new(model: Model)
	local self = setmetatable({}, CarSounds)
	self.Model = model
	local root = model.PrimaryPart or model:FindFirstChild("Chassis")
	self.Parent = (root and (root:FindFirstChild("SoundEmitter") or root)) or model
	self.Sounds = {}
	self.Loops = {}
	return self
end

function CarSounds:_make(key: string, id: string?, looped: boolean, range: number): Sound?
	if type(id) ~= "string" or id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.Name = "Car" .. key
	s.SoundId = id
	s.Looped = looped
	s.Volume = 0
	s.RollOffMode = Enum.RollOffMode.InverseTapered
	s.RollOffMinDistance = 8
	s.RollOffMaxDistance = range
	s.SoundGroup = group()
	s.Parent = self.Parent
	table.insert(self.Sounds, s)
	return s
end

function CarSounds:_loop(key: string, id: string?, range: number): Sound?
	local existing = self.Loops[key]
	if existing ~= nil then
		return existing or nil
	end
	local s = self:_make(key, id, true, range)
	self.Loops[key] = s or false
	return s
end

local function fade(s: Sound, target: number, dt: number, rate: number)
	s.Volume += (target - s.Volume) * math.min(1, dt * rate)
	if target > 0.01 and not s.IsPlaying then
		s:Play()
	elseif target <= 0.01 and s.Volume < 0.01 and s.IsPlaying then
		s:Stop()
	end
end

function CarSounds:Update(dt: number, st: { [string]: any })
	-- engine / EV whine
	local engine = self:_loop(st.Electric and "Whine" or "Engine", st.Electric and A.ElectricWhine or A.EngineLoop, V.EngineSoundRange)
	if engine then
		local idle = st.Idle or 800
		local redline = math.max(idle + 500, st.Redline or 6500)
		local frac = math.clamp(((st.Rpm or idle) - idle) / (redline - idle), 0, 1.1)
		local on = st.Engine == true and st.Near ~= false
		local vol = 0
		if on then
			if st.Electric then
				vol = 0.05 + frac * 0.4
				engine.PlaybackSpeed = 0.6 + frac * 1.1
			else
				vol = 0.3 + frac * 0.35 + (st.Throttle or 0) * 0.1
				engine.PlaybackSpeed = 0.75 + frac * 1.25
			end
		end
		fade(engine, vol, dt, 8)
	end
	local horn = self:_loop("Horn", A.Horn, V.HornRange)
	if horn then
		fade(horn, st.Horn == true and 0.9 or 0, dt, 30)
	end
	local siren = self:_loop("Siren", A.Siren, V.HornRange * 1.5)
	if siren then
		fade(siren, st.Siren == true and 0.8 or 0, dt, 10)
	end
end

function CarSounds:OneShot(key: string)
	local id = A[key]
	if type(id) ~= "string" or id == "" then
		return
	end
	local s = self:_make(key, id, false, key == "LockBeep" and 50 or 70)
	if not s then
		return
	end
	s.Volume = key == "Indicator" and 0.35 or 0.7
	s:Play()
	s.Ended:Once(function()
		local i = table.find(self.Sounds, s)
		if i then
			table.remove(self.Sounds, i)
		end
		s:Destroy()
	end)
end

function CarSounds:Silence()
	for _, s in pairs(self.Loops) do
		if s then
			s.Volume = 0
			s:Stop()
		end
	end
end

function CarSounds:Destroy()
	for _, s in ipairs(self.Sounds) do
		s:Destroy()
	end
	table.clear(self.Sounds)
	table.clear(self.Loops)
end

return CarSounds
