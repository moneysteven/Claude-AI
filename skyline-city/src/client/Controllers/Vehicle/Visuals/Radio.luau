-- Radio: in-car radio for the LOCAL player while they sit in a car (driver or passenger) (client).
--
--   Radio.SetStation(stationId | "" , carModel?)   called every frame-ish by CarVisualsController; cheap when unchanged
--   Radio.Stop()
--   Radio.Current() -> stationId
--
-- Stations / track ids come from Config/Audio.Radio. The track that is playing is chosen from the server-synced
-- clock (workspace:GetServerTimeNow) so everyone in the same car hears roughly the same song. Plays through the
-- "Radio" SoundGroup (its volume is the RadioVolume setting). Stations with no tracks stay silent.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Audio = require(Shared.Config.Audio)

local Radio = {}

local SLOT_SECONDS = 150 -- assumed track length for the shared rotation

local current = ""
local sound: Sound? = nil
local endedConn: RBXScriptConnection? = nil
local trackIndex = 0

local function station(id: string)
	for _, st in ipairs(Audio.Radio or {}) do
		if st.Id == id then
			return st
		end
	end
	return nil
end

local function radioGroup(): SoundGroup?
	local g = SoundService:FindFirstChild("Radio")
	if g and g:IsA("SoundGroup") then
		return g
	end
	return nil
end

local function cleanup()
	if endedConn then
		endedConn:Disconnect()
		endedConn = nil
	end
	if sound then
		sound:Destroy()
		sound = nil
	end
end

local function playTrack(st, index: number)
	cleanup()
	local tracks = st.Tracks or {}
	if #tracks == 0 then
		return
	end
	trackIndex = ((index - 1) % #tracks) + 1
	local id = tracks[trackIndex]
	if type(id) ~= "string" or id == "" then
		return
	end
	local s = Instance.new("Sound")
	s.Name = "CarRadio"
	s.SoundId = id
	s.Volume = 0.8
	s.Looped = false
	s.SoundGroup = radioGroup()
	s.Parent = SoundService
	sound = s
	endedConn = s.Ended:Connect(function()
		if current == st.Id then
			playTrack(st, trackIndex + 1)
		end
	end)
	s:Play()
	-- join the shared rotation part-way through the song
	local offset = Workspace:GetServerTimeNow() % SLOT_SECONDS
	task.delay(0.3, function()
		if sound == s and s.TimeLength > 0 then
			s.TimePosition = offset % s.TimeLength
		end
	end)
end

function Radio.SetStation(id: string)
	if id == current then
		return
	end
	current = id
	local st = id ~= "" and station(id) or nil
	if not st then
		cleanup()
		return
	end
	local tracks = st.Tracks or {}
	local slot = math.floor(Workspace:GetServerTimeNow() / SLOT_SECONDS)
	playTrack(st, (#tracks > 0) and ((slot % #tracks) + 1) or 1)
end

function Radio.Stop()
	current = ""
	cleanup()
end

function Radio.Current(): string
	return current
end

return Radio
