-- DriveAudio: driver-local sounds the server can't know about.
--   * Tyre skid loop (volume follows chassis.Skid) — always.
--   * Engine loop / EV whine with pitch from rpm — ONLY when CarVisualsController is not installed
--     (that controller plays engine audio for everyone from the replicated RPM attribute).
-- Sound ids come from Config/Audio.Vehicle; empty ids are skipped (no errors with no assets).
--
--   local a = DriveAudio.new(model, chassis, electric, playEngine)
--   a:Update(dt)  a:Destroy()

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Audio = require(Shared.Config.Audio)

local DriveAudio = {}
DriveAudio.__index = DriveAudio

local function makeSound(id: string?, parent: Instance, looped: boolean): Sound?
	if type(id) ~= "string" or id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Looped = looped
	s.Volume = 0
	s.RollOffMaxDistance = 150
	local group = SoundService:FindFirstChild("SFX")
	if group and group:IsA("SoundGroup") then
		s.SoundGroup = group
	end
	s.Parent = parent
	return s
end

function DriveAudio.new(model: Model, chassis: any, electric: boolean, playEngine: boolean)
	local self = setmetatable({}, DriveAudio)
	self.Chassis = chassis
	self.Electric = electric
	self.Sounds = {}
	local root = chassis.Root
	local V = Audio.Vehicle or {}
	self.Skid = makeSound(V.Skid, root, true)
	if playEngine then
		self.Engine = makeSound(electric and V.ElectricWhine or V.EngineLoop, root, true)
	end
	for _, s in ipairs({ self.Skid, self.Engine }) do
		if s then
			table.insert(self.Sounds, s)
			s:Play()
		end
	end
	return self
end

function DriveAudio:Update(dt: number, engineOn: boolean)
	local c = self.Chassis
	if self.Skid then
		local target = c.Grounded > 0 and c.Skid * 0.7 or 0
		self.Skid.Volume += (target - self.Skid.Volume) * math.min(1, dt * 10)
		self.Skid.PlaybackSpeed = 0.9 + c.Skid * 0.2
	end
	if self.Engine then
		local pt = c.Powertrain
		local frac = math.clamp(c.Rpm / math.max(1, pt.Redline), 0, 1.1)
		local vol
		if self.Electric then
			vol = engineOn and (0.05 + frac * 0.45) or 0
			self.Engine.PlaybackSpeed = 0.6 + frac * 1.2
		else
			vol = engineOn and (0.25 + c.Throttle * 0.35) or 0
			self.Engine.PlaybackSpeed = 0.6 + frac * 1.3
		end
		self.Engine.Volume += (vol - self.Engine.Volume) * math.min(1, dt * 8)
	end
end

function DriveAudio:Destroy()
	for _, s in ipairs(self.Sounds) do
		s:Destroy()
	end
	table.clear(self.Sounds)
end

return DriveAudio
