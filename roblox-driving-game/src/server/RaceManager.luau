--!strict
-- Tracks checkpoints and lap times for every player.
-- Cars must pass the checkpoints in order; crossing the finish line after
-- the last checkpoint completes a lap. Lap times are shown in the HUD and
-- the best one goes on the leaderboard.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("DrivingShared"):WaitForChild("Config"))

type PlayerState = {
	NextCheckpoint: number,
	LapStart: number?,
	RaceStart: number?,
	LapsCompleted: number,
	LastLap: number?,
	BestLap: number?,
}

type Remotes = {
	RaceUpdate: RemoteEvent,
	Notify: RemoteEvent,
}

local RaceManager = {}
RaceManager.__index = RaceManager

export type RaceManager = typeof(setmetatable(
	{} :: {
		_checkpoints: { BasePart },
		_remotes: Remotes,
		_states: { [Player]: PlayerState },
		_recordTime: number?,
		_recordHolder: string?,
	},
	RaceManager
))

local function roundTime(seconds: number): number
	return math.floor(seconds * 100 + 0.5) / 100
end

local function formatTime(seconds: number): string
	return string.format("%d:%05.2f", seconds // 60, seconds % 60)
end

local function newState(): PlayerState
	return {
		NextCheckpoint = 1,
		LapStart = nil,
		RaceStart = nil,
		LapsCompleted = 0,
		LastLap = nil,
		BestLap = nil,
	}
end

-- Returns the player driving the car that `part` belongs to, if any.
local function getDriver(part: BasePart): Player?
	local model = part.Parent
	if not model or not model:IsA("Model") then
		return nil
	end
	local ownerId = model:GetAttribute("OwnerUserId")
	if typeof(ownerId) ~= "number" then
		return nil
	end
	local owner = Players:GetPlayerByUserId(ownerId)
	local seat = model:FindFirstChild("DriverSeat")
	if not owner or not seat or not seat:IsA("VehicleSeat") then
		return nil
	end
	local occupant = seat.Occupant
	if occupant and occupant.Parent == owner.Character then
		return owner
	end
	return nil
end

function RaceManager.new(checkpoints: { BasePart }, remotes: Remotes): RaceManager
	local self = setmetatable({
		_checkpoints = checkpoints,
		_remotes = remotes,
		_states = {},
		_recordTime = nil,
		_recordHolder = nil,
	}, RaceManager)

	for index, checkpoint in checkpoints do
		checkpoint.Touched:Connect(function(hit)
			local driver = getDriver(hit)
			if driver then
				self:_onCheckpoint(driver, index)
			end
		end)
	end

	return self
end

function RaceManager.AddPlayer(self: RaceManager, player: Player)
	self._states[player] = newState()

	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	local best = Instance.new("NumberValue")
	best.Name = "Best Lap"
	best.Value = 0
	best.Parent = leaderstats
	local laps = Instance.new("IntValue")
	laps.Name = "Laps"
	laps.Value = 0
	laps.Parent = leaderstats
	leaderstats.Parent = player

	self:_sendUpdate(player)
end

function RaceManager.RemovePlayer(self: RaceManager, player: Player)
	self._states[player] = nil
end

-- Called when a player spawns a fresh car: their current lap no longer counts.
function RaceManager.ResetLap(self: RaceManager, player: Player)
	local state = self._states[player]
	if not state then
		return
	end
	state.NextCheckpoint = 1
	state.LapStart = nil
	state.RaceStart = nil
	self:_sendUpdate(player)
end

function RaceManager._onCheckpoint(self: RaceManager, player: Player, index: number)
	local state = self._states[player]
	if not state then
		return
	end
	local now = workspace:GetServerTimeNow()
	local count = #self._checkpoints

	if index == 1 then
		if state.LapStart == nil then
			-- First time over the line: the clock starts.
			state.LapStart = now
			state.RaceStart = now
			state.NextCheckpoint = 2
			self:_sendUpdate(player)
		elseif state.NextCheckpoint > count then
			self:_completeLap(player, state, now)
		end
		return
	end

	if index == state.NextCheckpoint then
		state.NextCheckpoint += 1
		self:_sendUpdate(player)
	end
end

function RaceManager._completeLap(self: RaceManager, player: Player, state: PlayerState, now: number)
	local lapTime = roundTime(now - (state.LapStart :: number))
	state.LastLap = lapTime
	state.LapsCompleted += 1
	state.LapStart = now
	state.NextCheckpoint = 2

	local leaderstats = player:FindFirstChild("leaderstats")
	local lapsValue = leaderstats and leaderstats:FindFirstChild("Laps")
	if lapsValue and lapsValue:IsA("IntValue") then
		lapsValue.Value = state.LapsCompleted
	end

	if state.BestLap == nil or lapTime < state.BestLap then
		state.BestLap = lapTime
		local bestValue = leaderstats and leaderstats:FindFirstChild("Best Lap")
		if bestValue and bestValue:IsA("NumberValue") then
			bestValue.Value = lapTime
		end
	end

	if self._recordTime == nil or lapTime < self._recordTime then
		self._recordTime = lapTime
		self._recordHolder = player.DisplayName
		self._remotes.Notify:FireAllClients(
			string.format("🏆 %s set a new track record: %s", player.DisplayName, formatTime(lapTime))
		)
	end

	local totalLaps = Config.Race.TotalLaps
	if state.LapsCompleted % totalLaps == 0 and state.RaceStart then
		local raceTime = now - state.RaceStart
		self._remotes.Notify:FireClient(
			player,
			string.format("🏁 Finished %d laps in %s!", totalLaps, formatTime(raceTime))
		)
		state.RaceStart = now
	end

	-- Everyone's HUD shows the record, so refresh all players.
	for other in self._states do
		self:_sendUpdate(other)
	end
end

function RaceManager._sendUpdate(self: RaceManager, player: Player)
	local state = self._states[player]
	if not state then
		return
	end
	local totalLaps = Config.Race.TotalLaps
	self._remotes.RaceUpdate:FireClient(player, {
		Lap = state.LapsCompleted % totalLaps + 1,
		TotalLaps = totalLaps,
		LapStart = state.LapStart,
		LastLap = state.LastLap,
		BestLap = state.BestLap,
		Checkpoint = math.max(state.NextCheckpoint - 2, 0),
		CheckpointCount = #self._checkpoints - 1,
		RecordTime = self._recordTime,
		RecordHolder = self._recordHolder,
	})
end

return RaceManager
