--!strict
-- Builds the race track out of parts when the server starts:
-- a grass field, an oval circuit with curbs, a start/finish gantry,
-- invisible checkpoints and a couple of jump ramps in the infield.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

local Config = require(ReplicatedStorage:WaitForChild("DrivingShared"):WaitForChild("Config"))

local TrackBuilder = {}

export type Track = {
	Checkpoints: { BasePart }, -- index 1 is the start/finish line
	SpawnSlots: { CFrame },
}

local ROAD_COLOR = Color3.fromRGB(45, 45, 50)
local CURB_RED = Color3.fromRGB(200, 40, 40)
local CURB_WHITE = Color3.fromRGB(240, 240, 240)

local function makePart(props: { [string]: any }, parent: Instance): Part
	local part = Instance.new("Part")
	part.Anchored = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in props do
		(part :: any)[key] = value
	end
	part.Parent = parent
	return part
end

-- Places a curb strip of the given length along `cf` (which faces along the road).
local function makeCurb(cf: CFrame, length: number, index: number, parent: Instance)
	makePart({
		Name = "Curb",
		Size = Vector3.new(3, 1.3, length),
		CFrame = cf,
		Color = if index % 2 == 0 then CURB_RED else CURB_WHITE,
		Material = Enum.Material.SmoothPlastic,
	}, parent)
end

local function buildStraight(x: number, parent: Instance)
	local track = Config.Track
	local length = track.StraightLength
	local halfWidth = track.RoadWidth / 2

	makePart({
		Name = "Straight",
		Size = Vector3.new(track.RoadWidth, 1, length + 2),
		CFrame = CFrame.new(x, -0.4, 0),
		Color = ROAD_COLOR,
		Material = Enum.Material.Asphalt,
	}, parent)

	-- Dashed center line
	local dashCount = math.floor(length / 24)
	for i = 0, dashCount - 1 do
		local z = -length / 2 + 12 + i * 24
		makePart({
			Name = "Dash",
			Size = Vector3.new(1, 0.05, 10),
			CFrame = CFrame.new(x, 0.125, z),
			Color = CURB_WHITE,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
			CanQuery = false,
		}, parent)
	end

	-- Curbs on both edges
	local curbLength = 12
	local curbCount = math.floor(length / curbLength)
	for i = 0, curbCount - 1 do
		local z = -length / 2 + curbLength / 2 + i * curbLength
		for _, side in { -1, 1 } do
			makeCurb(CFrame.new(x + side * (halfWidth + 1.5), -0.35, z), curbLength, i, parent)
		end
	end
end

-- Builds a semicircle joining the two straights.
-- `direction` is 1 for the far (+Z) end and -1 for the near (-Z) end.
local function buildTurn(direction: number, parent: Instance)
	local track = Config.Track
	local radius = track.TurnRadius
	local halfWidth = track.RoadWidth / 2
	local segments = track.ArcSegments
	local centerZ = direction * track.StraightLength / 2
	local halfStep = math.pi / (2 * segments)

	for i = 0, segments - 1 do
		local angle = (i + 0.5) * math.pi / segments
		local function pointAt(r: number): Vector3
			return Vector3.new(r * math.cos(angle), 0, centerZ + direction * r * math.sin(angle))
		end
		local tangent = Vector3.new(-math.sin(angle), 0, direction * math.cos(angle))

		-- Size each piece by the outer edge's chord so there are no gaps.
		local outerRadius = radius + halfWidth
		local roadLength = 2 * outerRadius * math.sin(halfStep) + 0.5
		local center = pointAt(radius) + Vector3.new(0, -0.4, 0)
		makePart({
			Name = "Turn",
			Size = Vector3.new(track.RoadWidth, 1, roadLength),
			CFrame = CFrame.lookAt(center, center + tangent),
			Color = ROAD_COLOR,
			Material = Enum.Material.Asphalt,
		}, parent)

		for _, curbRadius in { radius - halfWidth - 1.5, radius + halfWidth + 1.5 } do
			local curbLength = 2 * (curbRadius + 1.5) * math.sin(halfStep) + 0.2
			local curbCenter = pointAt(curbRadius) + Vector3.new(0, -0.35, 0)
			makeCurb(CFrame.lookAt(curbCenter, curbCenter + tangent), curbLength, i, parent)
		end
	end
end

local function buildFinishLine(parent: Instance)
	local track = Config.Track
	local x = track.TurnRadius
	local width = track.RoadWidth
	local tilesAcross = 9
	local tileSize = width / tilesAcross

	-- Checkered stripe
	for row = 0, 1 do
		for col = 0, tilesAcross - 1 do
			makePart({
				Name = "Checker",
				Size = Vector3.new(tileSize, 0.05, tileSize / 2),
				CFrame = CFrame.new(x - width / 2 + tileSize * (col + 0.5), 0.125, (row - 0.5) * tileSize / 2),
				Color = if (row + col) % 2 == 0 then Color3.new(0, 0, 0) else Color3.new(1, 1, 1),
				Material = Enum.Material.SmoothPlastic,
				CanCollide = false,
				CanQuery = false,
			}, parent)
		end
	end

	-- Gantry over the line
	local pillarOffset = width / 2 + 6
	for _, side in { -1, 1 } do
		makePart({
			Name = "GantryPillar",
			Size = Vector3.new(3, 26, 3),
			CFrame = CFrame.new(x + side * pillarOffset, 13, 0),
			Color = Color3.fromRGB(60, 60, 70),
			Material = Enum.Material.Metal,
		}, parent)
	end
	local banner = makePart({
		Name = "GantryBanner",
		Size = Vector3.new(pillarOffset * 2 + 3, 5, 2),
		CFrame = CFrame.new(x, 26, 0),
		Color = Color3.fromRGB(230, 60, 40),
		Material = Enum.Material.SmoothPlastic,
	}, parent)

	for _, face in { Enum.NormalId.Front, Enum.NormalId.Back } do
		local gui = Instance.new("SurfaceGui")
		gui.Face = face
		gui.PixelsPerStud = 20
		gui.Parent = banner
		local label = Instance.new("TextLabel")
		label.Size = UDim2.fromScale(1, 1)
		label.BackgroundTransparency = 1
		label.Text = "START / FINISH"
		label.TextScaled = true
		label.Font = Enum.Font.GothamBlack
		label.TextColor3 = Color3.new(1, 1, 1)
		label.Parent = gui
	end
end

local function makeCheckpoint(name: string, position: Vector3, acrossX: boolean, parent: Instance): BasePart
	local span = Config.Track.RoadWidth + 16
	return makePart({
		Name = name,
		Size = if acrossX then Vector3.new(span, 30, 6) else Vector3.new(6, 30, span),
		CFrame = CFrame.new(position),
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
		CanTouch = true,
	}, parent)
end

local function buildRamps(parent: Instance)
	-- WedgeParts slope up toward their back (+Z) face, so cars driving +Z get launched.
	local ramps = {
		CFrame.new(-50, 6, -60),
		CFrame.new(50, 6, 60) * CFrame.Angles(0, math.pi, 0),
	}
	for _, cf in ramps do
		local ramp = Instance.new("WedgePart")
		ramp.Name = "JumpRamp"
		ramp.Anchored = true
		ramp.Size = Vector3.new(24, 12, 36)
		ramp.CFrame = cf
		ramp.Color = Color3.fromRGB(255, 170, 0)
		ramp.Material = Enum.Material.DiamondPlate
		ramp.Parent = parent
	end
end

function TrackBuilder.Build(): Track
	local track = Config.Track
	local existing = workspace:FindFirstChild("DrivingWorld")
	if existing then
		existing:Destroy()
	end

	-- The default Baseplate template's floor would z-fight with our grass.
	local baseplate = workspace:FindFirstChild("Baseplate")
	if baseplate then
		baseplate:Destroy()
	end

	local world = Instance.new("Folder")
	world.Name = "DrivingWorld"
	world.Parent = workspace

	local fieldSize = (track.TurnRadius + track.RoadWidth) * 2 + track.StraightLength + 600
	makePart({
		Name = "Grass",
		Size = Vector3.new(fieldSize, 2, fieldSize),
		CFrame = CFrame.new(0, -1, 0),
		Color = Color3.fromRGB(80, 150, 70),
		Material = Enum.Material.Grass,
	}, world)

	local roadFolder = Instance.new("Folder")
	roadFolder.Name = "Road"
	roadFolder.Parent = world

	buildStraight(track.TurnRadius, roadFolder)
	buildStraight(-track.TurnRadius, roadFolder)
	buildTurn(1, roadFolder)
	buildTurn(-1, roadFolder)
	buildFinishLine(world)
	buildRamps(world)

	-- Checkpoints in driving order. Cars start on the +X straight heading -Z.
	local checkpointFolder = Instance.new("Folder")
	checkpointFolder.Name = "Checkpoints"
	checkpointFolder.Parent = world

	local r = track.TurnRadius
	local endZ = track.StraightLength / 2 + r
	local checkpoints = {
		makeCheckpoint("Finish", Vector3.new(r, 15, 0), true, checkpointFolder),
		makeCheckpoint("Checkpoint1", Vector3.new(0, 15, -endZ), false, checkpointFolder),
		makeCheckpoint("Checkpoint2", Vector3.new(-r, 15, 0), true, checkpointFolder),
		makeCheckpoint("Checkpoint3", Vector3.new(0, 15, endZ), false, checkpointFolder),
	}

	-- Car spawn grid just behind the finish line, two cars per row.
	local spawnSlots = {}
	for row = 0, 5 do
		for _, side in { -1, 1 } do
			table.insert(spawnSlots, CFrame.new(r + side * 12, 4, 40 + row * 18))
		end
	end

	-- Player spawn on the grass next to the grid.
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "DrivingSpawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.CFrame = CFrame.new(r + track.RoadWidth / 2 + 24, 0.5, 60)
	spawn.Duration = 0
	spawn.Parent = world

	Lighting.ClockTime = 14.5
	Lighting.Brightness = 2.5

	return {
		Checkpoints = checkpoints,
		SpawnSlots = spawnSlots,
	}
end

return TrackBuilder
