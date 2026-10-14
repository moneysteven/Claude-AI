--!strict
-- Entry point for the driving game on the server:
-- builds the track, handles car spawn requests and wires up lap timing.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("DrivingShared"):WaitForChild("Config"))
local TrackBuilder = require(script.Parent:WaitForChild("TrackBuilder"))
local CarFactory = require(script.Parent:WaitForChild("CarFactory"))
local RaceManager = require(script.Parent:WaitForChild("RaceManager"))

local CAR_COLORS = {
	Color3.fromRGB(230, 57, 70),
	Color3.fromRGB(29, 120, 230),
	Color3.fromRGB(255, 190, 11),
	Color3.fromRGB(46, 196, 110),
	Color3.fromRGB(155, 89, 230),
	Color3.fromRGB(255, 120, 30),
	Color3.fromRGB(20, 200, 210),
	Color3.fromRGB(240, 240, 240),
}

-- Remotes ------------------------------------------------------------------

local remotesFolder = Instance.new("Folder")
remotesFolder.Name = "DrivingRemotes"

local function makeRemote(name: string): RemoteEvent
	local remote = Instance.new("RemoteEvent")
	remote.Name = name
	remote.Parent = remotesFolder
	return remote
end

local spawnCarRemote = makeRemote("SpawnCar")
local raceUpdateRemote = makeRemote("RaceUpdate")
local notifyRemote = makeRemote("Notify")
remotesFolder.Parent = ReplicatedStorage

-- World --------------------------------------------------------------------

local track = TrackBuilder.Build()
local race = RaceManager.new(track.Checkpoints, {
	RaceUpdate = raceUpdateRemote,
	Notify = notifyRemote,
})

local carsFolder = Instance.new("Folder")
carsFolder.Name = "Cars"
carsFolder.Parent = workspace

local carsByPlayer: { [Player]: Model } = {}
local lastSpawn: { [Player]: number } = {}

-- Car spawning -------------------------------------------------------------

local function findFreeSlot(): CFrame
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = { carsFolder }

	for _, slot in track.SpawnSlots do
		if #workspace:GetPartBoundsInBox(slot, Vector3.new(10, 8, 15), params) == 0 then
			return slot
		end
	end
	-- Grid is full: drop the car in from above the first slot.
	return track.SpawnSlots[1] + Vector3.new(0, 15, 0)
end

local function setOwner(car: Model, player: Player)
	for _, part in car:GetDescendants() do
		if part:IsA("BasePart") and not part.Anchored then
			pcall(part.SetNetworkOwner, part, player)
		end
	end
end

local function destroyCar(player: Player)
	local car = carsByPlayer[player]
	if car then
		car:Destroy()
		carsByPlayer[player] = nil
	end
end

local function spawnCar(player: Player)
	local now = os.clock()
	if lastSpawn[player] and now - lastSpawn[player] < Config.Spawn.Cooldown then
		return
	end
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return
	end
	lastSpawn[player] = now

	-- Get out of the old car before it disappears.
	humanoid.Sit = false
	destroyCar(player)

	local color = CAR_COLORS[math.random(#CAR_COLORS)]
	local car = CarFactory.Build(player, findFreeSlot(), color)
	car.Parent = carsFolder
	carsByPlayer[player] = car
	setOwner(car, player)

	local seat = car:FindFirstChild("DriverSeat") :: VehicleSeat
	seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		local occupant = seat.Occupant
		if not occupant then
			return
		end
		if occupant.Parent ~= player.Character then
			-- Only the owner may drive; kick anyone else out.
			task.defer(function()
				local seatWeld = seat:FindFirstChild("SeatWeld")
				if seatWeld then
					seatWeld:Destroy()
				end
				occupant.Sit = false
			end)
			return
		end
		setOwner(car, player)
	end)

	race:ResetLap(player)
	seat:Sit(humanoid)
end

spawnCarRemote.OnServerEvent:Connect(spawnCar)

-- Players ------------------------------------------------------------------

-- Shift is the handbrake, so turn off shift-lock (which also uses Shift).
game:GetService("StarterPlayer").EnableMouseLockOption = false

local function onPlayerAdded(player: Player)
	player.DevEnableMouseLock = false
	race:AddPlayer(player)
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in Players:GetPlayers() do
	onPlayerAdded(player)
end

Players.PlayerRemoving:Connect(function(player)
	destroyCar(player)
	race:RemovePlayer(player)
	lastSpawn[player] = nil
end)
