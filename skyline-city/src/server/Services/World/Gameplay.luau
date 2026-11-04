-- Gameplay (World helper): builds every TAGGED gameplay object with exactly the attributes in
-- Config/World.Tags, plus the shared prop templates (trees, palms, benches, streetlights, ATMs).
-- District builders call these so tags/attributes are consistent everywhere.
--
-- Orientation conventions
--   * "ground cf": position on the floor surface, LookVector = the side customers / players use.
--   * Plots & lots: local +Z faces the street (use Props.StreetFacing).
--   * CarSpawn / TestDriveSpawn: LookVector = the direction the car should face.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)

local Props = require(script.Parent.Props)

local Tags = World.Tags
local Gameplay = {}

local ROAD_Y = Layout.Heights.Road
local C = {
	Metal = Color3.fromRGB(70, 74, 82),
	Dark = Color3.fromRGB(34, 36, 42),
	White = Color3.fromRGB(236, 236, 236),
	Wood = Color3.fromRGB(140, 98, 62),
	Leaf = Color3.fromRGB(70, 140, 70),
	Leaf2 = Color3.fromRGB(96, 160, 72),
	Trunk = Color3.fromRGB(110, 78, 52),
}
Gameplay.Colors = C

---------------------------------------------------------------------------
-- Job stations & targets
---------------------------------------------------------------------------
local STATION_ICON = {
	Pizza = "🍕",
	Taxi = "🚕",
	Police = "🚓",
	Fire = "🚒",
	Paramedic = "🚑",
	Mechanic = "🔧",
	Cashier = "🛒",
	Chef = "🍳",
	CarSales = "🚗",
	RealEstate = "🏡",
	Construction = "🏗️",
}

-- Clock-in desk. cf = floor position, LookVector = toward the player standing at the desk.
function Gameplay.Station(parent: Instance, jobId: string, cf: CFrame, label: string, color: Color3?): BasePart
	local desk = Props.Part(parent, "JobStation_" .. jobId, Vector3.new(6, 3.4, 2.4), cf * CFrame.new(0, 1.7, 0), color or Color3.fromRGB(60, 120, 220))
	Props.Small(parent, "DeskTop", Vector3.new(6.4, 0.3, 2.8), cf * CFrame.new(0, 3.55, 0), C.White)
	Props.Small(parent, "Monitor", Vector3.new(1.8, 1.2, 0.2), cf * CFrame.new(1.4, 4.4, 0.6), C.Dark, Enum.Material.SmoothPlastic)
	Props.Tag(desk, Tags.JobStation, { JobId = jobId })
	Props.Billboard(desk, (STATION_ICON[jobId] or "💼") .. " " .. label .. " — Jobs", { Offset = Vector3.new(0, 5.5, 0), MaxDistance = 80 })
	return desk
end

local TARGET = {
	Delivery = { Size = Vector3.new(1.4, 3.6, 1.2), Color = Color3.fromRGB(40, 90, 170), Name = "Mailbox" },
	Pickup = { Size = Vector3.new(0.5, 8, 0.5), Color = Color3.fromRGB(250, 200, 40), Name = "TaxiPickup" },
	Dropoff = { Size = Vector3.new(0.5, 8, 0.5), Color = Color3.fromRGB(250, 200, 40), Name = "TaxiDropoff" },
	PatrolPoint = { Size = Vector3.new(1.4, 3, 1.4), Color = Color3.fromRGB(50, 90, 200), Name = "PatrolPoint" },
	FireSpot = { Size = Vector3.new(3, 5, 1.6), Color = Color3.fromRGB(120, 116, 108), Name = "ElectricalBox" },
	PatientSpot = { Size = Vector3.new(3, 0.2, 3), Color = Color3.fromRGB(230, 60, 60), Name = "EmergencySpot" },
	RepairSpot = { Size = Vector3.new(10, 0.1, 16), Color = Color3.fromRGB(70, 66, 60), Name = "RepairSpot" },
	Register = { Size = Vector3.new(6, 3.4, 2.6), Color = Color3.fromRGB(235, 235, 235), Name = "Register" },
	Stove = { Size = Vector3.new(4, 3.4, 3), Color = Color3.fromRGB(190, 190, 195), Name = "Stove", Material = Enum.Material.Metal },
	Showroom = { Size = Vector3.new(1.4, 4, 1.4), Color = Color3.fromRGB(220, 220, 230), Name = "InfoStand" },
	Showing = { Size = Vector3.new(0.4, 5, 0.4), Color = Color3.fromRGB(240, 240, 240), Name = "ForSaleSign" },
	ConstructionSite = { Size = Vector3.new(7, 3, 7), Color = Color3.fromRGB(170, 150, 110), Name = "MaterialPile", Material = Enum.Material.WoodPlanks },
	Dropoff_Paramedic = { Size = Vector3.new(12, 0.1, 18), Color = Color3.fromRGB(230, 230, 230), Name = "AmbulanceBay" },
}

-- JobTarget part. cf = floor position; LookVector = where an NPC / player should stand.
function Gameplay.Target(parent: Instance, jobId: string, kind: string, cf: CFrame, attrs: { [string]: any }?): BasePart
	local style = TARGET[kind .. "_" .. jobId] or TARGET[kind] or TARGET.PatrolPoint
	local size: Vector3 = style.Size
	local part = Props.Small(parent, style.Name, size, cf * CFrame.new(0, size.Y / 2, 0), style.Color, style.Material)
	if size.Y <= 0.2 then
		part.CanCollide = false
		part.Transparency = 0.35
	end
	if kind == "Pickup" or kind == "Dropoff" then
		if jobId == "Taxi" then
			local plate = Props.Small(parent, "TaxiSign", Vector3.new(2.4, 1.6, 0.15), cf * CFrame.new(0, 7.2, -0.3), Color3.fromRGB(250, 200, 40), Enum.Material.SmoothPlastic, { CanCollide = false })
			Props.Sign(plate, kind == "Pickup" and "🚕 TAXI" or "🚕 STOP", { TextColor = Color3.fromRGB(20, 20, 20), Stroke = false, PixelsPerStud = 40 })
		end
	elseif kind == "Showing" then
		local board = Props.Small(parent, "SaleBoard", Vector3.new(4, 2.4, 0.2), cf * CFrame.new(0, 3.8, -0.3), Color3.fromRGB(150, 40, 40), Enum.Material.SmoothPlastic, { CanCollide = false })
		Props.Sign(board, "FOR SALE", { PixelsPerStud = 30 })
	elseif kind == "Delivery" then
		Props.Small(parent, "MailboxTop", Vector3.new(1.6, 0.5, 1.4), cf * CFrame.new(0, 3.85, 0), Color3.fromRGB(30, 60, 130), nil, { CanCollide = false })
	elseif kind == "PatrolPoint" then
		Props.Small(parent, "Beacon", Vector3.new(1, 0.6, 1), cf * CFrame.new(0, 3.3, 0), Color3.fromRGB(60, 120, 255), Enum.Material.Neon, { CanCollide = false })
	elseif kind == "ConstructionSite" then
		Props.Small(parent, "Bricks", Vector3.new(4, 2, 3), cf * CFrame.new(1, 4, 0), Color3.fromRGB(170, 80, 60), Enum.Material.Brick, { CanCollide = false })
	end
	local a = { JobId = jobId, Kind = kind }
	if attrs then
		for k, v in pairs(attrs) do
			a[k] = v
		end
	end
	Props.Tag(part, Tags.JobTarget, a)
	return part
end

---------------------------------------------------------------------------
-- Vehicles
---------------------------------------------------------------------------
-- Parking-lane CFrame on a street. axis "Z" = north-south road at x = coord, "X" = east-west road at z = coord.
-- side +1 = east/south side of the road, -1 = west/north side. Faces the legal (right-hand) direction.
function Gameplay.ParkingCF(axis: string, coord: number, along: number, side: number, width: number?): CFrame
	local half = (width or Layout.Grid.RoadWidth) / 2
	local kind = Layout.RoadKinds.Street
	local off = half - kind.Shoulder / 2
	if axis == "Z" then
		local pos = Vector3.new(coord + side * off, ROAD_Y, along)
		return Props.Facing(pos, side > 0 and Vector3.new(0, 0, -1) or Vector3.new(0, 0, 1))
	end
	local pos = Vector3.new(along, ROAD_Y, coord + side * off)
	return Props.Facing(pos, side > 0 and Vector3.new(1, 0, 0) or Vector3.new(-1, 0, 0))
end

local function spawnPad(parent: Instance, name: string, cf: CFrame, tag: string, attrs: { [string]: any }?): BasePart
	local pad = Props.Small(parent, name, Vector3.new(8, 0.1, 18), cf * CFrame.new(0, 0.05, 0), C.White, Enum.Material.SmoothPlastic, {
		Transparency = 0.8,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
	})
	Props.Tag(pad, tag, attrs)
	return pad
end

function Gameplay.CarSpawn(parent: Instance, cf: CFrame): BasePart
	return spawnPad(parent, "CarSpawn", cf, Tags.CarSpawn)
end

function Gameplay.TestDriveSpawn(parent: Instance, cf: CFrame): BasePart
	return spawnPad(parent, "TestDriveSpawn", cf, Tags.TestDriveSpawn)
end

---------------------------------------------------------------------------
-- Homes & lots
---------------------------------------------------------------------------
-- Flat build plot. cf = ground centre (local +Z = street). sizeXZ = Vector2 footprint.
function Gameplay.Plot(parent: Instance, tag: string, plotId: string, tier: string, cf: CFrame, sizeXZ: Vector2, color: Color3?, material: Enum.Material?): BasePart
	local pad = Props.Part(parent, "Plot_" .. plotId, Vector3.new(sizeXZ.X, 0.4, sizeXZ.Y), cf * CFrame.new(0, 0.2, 0), color or Color3.fromRGB(104, 160, 86), material or Enum.Material.Grass)
	pad.CastShadow = false
	Props.Tag(pad, tag, {
		PlotId = plotId,
		Tier = tier,
		Size = Vector3.new(sizeXZ.X, 1, sizeXZ.Y),
	})
	return pad
end

function Gameplay.Lot(parent: Instance, lotId: string, cf: CFrame, size: Vector3, allowed: string): BasePart
	local pad = Props.Part(parent, "BusinessLot_" .. lotId, Vector3.new(size.X, 0.4, size.Z), cf * CFrame.new(0, 0.2, 0), Color3.fromRGB(96, 98, 106), Enum.Material.Concrete)
	pad.CastShadow = false
	Props.Tag(pad, Tags.BusinessLot, { LotId = lotId, Size = size, AllowedTypes = allowed })
	-- yellow kerb on the street edge
	Props.Small(parent, "LotKerb", Vector3.new(size.X, 0.1, 1), cf * CFrame.new(0, 0.45, size.Z / 2 - 0.5), Color3.fromRGB(255, 196, 40), Enum.Material.SmoothPlastic, { CanCollide = false })
	return pad
end

---------------------------------------------------------------------------
-- Money & shops
---------------------------------------------------------------------------
local function atmTemplate(): Model
	local m = Instance.new("Model")
	m.Name = "ATM"
	local body = Props.Part(m, "ATM", Vector3.new(3, 7, 2.2), CFrame.new(0, 3.5, 0), C.Metal, Enum.Material.Metal)
	Props.Small(m, "Screen", Vector3.new(2.2, 1.4, 0.1), CFrame.new(0, 4.8, -1.12), Color3.fromRGB(70, 170, 255), Enum.Material.Neon, { CanCollide = false })
	Props.Small(m, "Keypad", Vector3.new(1.6, 0.2, 0.8), CFrame.new(0, 3.4, -1.3) * CFrame.Angles(math.rad(-20), 0, 0), C.Dark, nil, { CanCollide = false })
	local header = Props.Small(m, "Header", Vector3.new(3, 1, 2.3), CFrame.new(0, 7.5, 0), Color3.fromRGB(40, 160, 90), Enum.Material.Neon, { CanCollide = false })
	Props.Sign(header, "$ ATM", { PixelsPerStud = 30, Stroke = false })
	m.PrimaryPart = body
	m.WorldPivot = CFrame.new()
	return m
end

-- cf = ground position, LookVector = toward the player using it.
function Gameplay.ATM(parent: Instance, cf: CFrame): BasePart
	local m = Props.Template("ATM", atmTemplate)
	Props.Place(m, cf, parent)
	local body = (m:FindFirstChild("ATM") or m.PrimaryPart or m:FindFirstChildWhichIsA("BasePart", true)) :: BasePart
	Props.Tag(body, Tags.ATM)
	return body
end

function Gameplay.BankCounter(parent: Instance, cf: CFrame): BasePart
	local counter = Props.Part(parent, "BankCounter", Vector3.new(14, 3.6, 2.6), cf * CFrame.new(0, 1.8, 0), Color3.fromRGB(150, 110, 70), Enum.Material.Wood)
	Props.Small(parent, "CounterGlass", Vector3.new(14, 3, 0.2), cf * CFrame.new(0, 5.1, 0.6), Color3.fromRGB(190, 220, 240), Enum.Material.Glass, { Transparency = 0.6, CanCollide = false })
	Props.Tag(counter, Tags.Bank)
	Props.Billboard(counter, "🏦 Bank Teller", { Offset = Vector3.new(0, 6, 0), MaxDistance = 60 })
	return counter
end

-- Generic tagged shop counter (ClothingStore / FurnitureStore / Dealership).
function Gameplay.Counter(parent: Instance, tag: string, cf: CFrame, label: string, color: Color3): BasePart
	local counter = Props.Part(parent, tag .. "Counter", Vector3.new(8, 3.6, 2.6), cf * CFrame.new(0, 1.8, 0), color, Enum.Material.SmoothPlastic)
	Props.Small(parent, "CounterTop", Vector3.new(8.4, 0.3, 3), cf * CFrame.new(0, 3.75, 0), C.White)
	Props.Tag(counter, tag)
	Props.Billboard(counter, label, { Offset = Vector3.new(0, 6, 0), MaxDistance = 80 })
	return counter
end

---------------------------------------------------------------------------
-- Seats, nature, lights
---------------------------------------------------------------------------
local function benchTemplate(): Model
	local m = Instance.new("Model")
	m.Name = "Bench"
	local seat = Instance.new("Seat")
	seat.Name = "Seat"
	seat.Anchored = true
	seat.Size = Vector3.new(6, 0.5, 2)
	seat.CFrame = CFrame.new(0, 1.6, 0)
	seat.Color = C.Wood
	seat.Material = Enum.Material.WoodPlanks
	seat.TopSurface = Enum.SurfaceType.Smooth
	seat.CastShadow = false
	seat.Parent = m
	Props.Small(m, "Back", Vector3.new(6, 1.8, 0.35), CFrame.new(0, 2.9, 0.85) * CFrame.Angles(math.rad(-10), 0, 0), C.Wood, Enum.Material.WoodPlanks)
	Props.Small(m, "LegL", Vector3.new(0.4, 1.4, 1.8), CFrame.new(-2.6, 0.7, 0), C.Dark, Enum.Material.Metal)
	Props.Small(m, "LegR", Vector3.new(0.4, 1.4, 1.8), CFrame.new(2.6, 0.7, 0), C.Dark, Enum.Material.Metal)
	m.PrimaryPart = seat
	m.WorldPivot = CFrame.new()
	return m
end

-- cf = ground position, LookVector = the direction the sitter faces.
function Gameplay.Bench(parent: Instance, cf: CFrame): Seat
	local m = Props.Template("Bench", benchTemplate)
	Props.Place(m, cf, parent)
	local seat = m:FindFirstChildWhichIsA("Seat", true) :: Seat
	if seat then
		Props.Tag(seat, Tags.Seat, { Pose = "Sit" })
	end
	return seat
end

-- Single chair (for food courts / clubs)
function Gameplay.Chair(parent: Instance, cf: CFrame, color: Color3?): Seat
	local seat = Instance.new("Seat")
	seat.Name = "Chair"
	seat.Anchored = true
	seat.Size = Vector3.new(2.4, 0.5, 2.4)
	seat.CFrame = cf * CFrame.new(0, 1.6, 0)
	seat.Color = color or Color3.fromRGB(200, 70, 60)
	seat.Material = Enum.Material.SmoothPlastic
	seat.CastShadow = false
	seat.Parent = parent
	Props.Small(parent, "ChairBack", Vector3.new(2.4, 2, 0.3), cf * CFrame.new(0, 2.85, 1.05), seat.Color)
	Props.Small(parent, "ChairLeg", Vector3.new(0.4, 1.4, 0.4), cf * CFrame.new(0, 0.7, 0), C.Dark, Enum.Material.Metal)
	Props.Tag(seat, Tags.Seat, { Pose = "Sit" })
	return seat
end

local function treeTemplate(variant: number): Model
	local m = Instance.new("Model")
	m.Name = "Tree"
	local h = variant == 1 and 9 or (variant == 2 and 12 or 7)
	local trunk = Props.Cyl(m, "Trunk", 0.8, h, CFrame.new(0, h / 2, 0), C.Trunk, Enum.Material.Wood)
	trunk.CastShadow = false
	local leafColor = variant == 2 and C.Leaf2 or C.Leaf
	local a = Props.Ball(m, "Leaves", variant == 2 and 12 or 10, CFrame.new(0, h + 2.5, 0), leafColor, Enum.Material.Grass)
	local b = Props.Ball(m, "Leaves2", 7, CFrame.new(1.6, h + 6, -0.8), leafColor, Enum.Material.Grass)
	a.CastShadow = false
	b.CastShadow = false
	if variant == 3 then
		local c = Props.Ball(m, "Leaves3", 6, CFrame.new(-2, h + 1, 1.5), C.Leaf2, Enum.Material.Grass)
		c.CastShadow = false
	end
	m.PrimaryPart = trunk
	m.WorldPivot = CFrame.new()
	return m
end

function Gameplay.Tree(parent: Instance, pos: Vector3, variant: number?, yaw: number?): Model
	local v = variant or ((math.floor(math.abs(pos.X * 7 + pos.Z * 13)) % 3) + 1)
	local m = Props.Template("Tree" .. v, function()
		return treeTemplate(v)
	end)
	return Props.Place(m, CFrame.new(pos) * CFrame.Angles(0, yaw or (pos.X * 0.37 + pos.Z * 0.11), 0), parent)
end

local function palmTemplate(): Model
	local m = Instance.new("Model")
	m.Name = "Palm"
	local lean = math.rad(6)
	local cf = CFrame.new()
	local first
	for i = 1, 4 do
		local seg = Props.Cyl(m, "Trunk" .. i, 0.7 - i * 0.06, 5.2, cf * CFrame.new(0, 2.6, 0), Color3.fromRGB(150, 116, 76), Enum.Material.Wood)
		seg.CastShadow = false
		first = first or seg
		cf = cf * CFrame.new(0, 5, 0) * CFrame.Angles(0, 0, lean)
	end
	local top = cf.Position
	for i = 0, 5 do
		local yawA = i * math.pi / 3
		local frond = Props.Small(m, "Frond", Vector3.new(1.6, 0.25, 8), CFrame.new(top) * CFrame.Angles(0, yawA, 0) * CFrame.Angles(math.rad(22), 0, 0) * CFrame.new(0, 0, -3.8), Color3.fromRGB(70, 150, 60), Enum.Material.Grass, { CanCollide = false })
		frond.Name = "Frond" .. i
	end
	Props.Ball(m, "Coconuts", 1.6, CFrame.new(top - Vector3.new(0, 0.8, 0)), Color3.fromRGB(110, 80, 40)).CastShadow = false
	m.PrimaryPart = first
	m.WorldPivot = CFrame.new()
	return m
end

function Gameplay.Palm(parent: Instance, pos: Vector3, yaw: number?): Model
	local m = Props.Template("Palm", palmTemplate)
	return Props.Place(m, CFrame.new(pos) * CFrame.Angles(0, yaw or (pos.X * 0.5 + pos.Z * 0.3), 0), parent)
end

local function lamp(m: Model, name: string, pos: Vector3, range: number)
	local head = Props.Small(m, name, Vector3.new(2.6, 0.6, 1.6), CFrame.new(pos), Color3.fromRGB(200, 200, 196), Enum.Material.SmoothPlastic, { CanCollide = false })
	local light = Instance.new("SpotLight")
	light.Face = Enum.NormalId.Bottom
	light.Angle = 120
	light.Range = range
	light.Brightness = 2.2
	light.Color = Color3.fromRGB(255, 214, 160)
	light.Shadows = false
	light.Enabled = false
	light.Parent = head
	return head
end

local function streetlightTemplate(double: boolean): Model
	local m = Instance.new("Model")
	m.Name = double and "StreetlightDouble" or "Streetlight"
	m.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	local base = Props.Small(m, "Base", Vector3.new(1.4, 1, 1.4), CFrame.new(0, 0.5, 0), C.Metal, Enum.Material.Metal)
	Props.Small(m, "Pole", Vector3.new(0.6, 18, 0.6), CFrame.new(0, 9.5, 0), C.Metal, Enum.Material.Metal)
	Props.Small(m, "Arm", Vector3.new(0.4, 0.4, 6.4), CFrame.new(0, 18.2, -3.2), C.Metal, Enum.Material.Metal)
	lamp(m, "Lamp", Vector3.new(0, 17.8, -6.4), 46)
	if double then
		Props.Small(m, "Arm2", Vector3.new(0.4, 0.4, 6.4), CFrame.new(0, 18.2, 3.2), C.Metal, Enum.Material.Metal)
		lamp(m, "Lamp2", Vector3.new(0, 17.8, 6.4), 46)
	end
	m.PrimaryPart = base
	m.WorldPivot = CFrame.new()
	return m
end

-- cf = ground position, LookVector = toward the road (the arm reaches out over it).
function Gameplay.Streetlight(parent: Instance, cf: CFrame, double: boolean?): Model
	local key = double and "StreetlightDouble" or "Streetlight"
	local m = Props.Template(key, function()
		return streetlightTemplate(double == true)
	end)
	Props.Place(m, cf, parent)
	Props.Tag(m, Tags.Streetlight)
	return m
end

-- Short park / plaza lamp post with a PointLight.
function Gameplay.ParkLamp(parent: Instance, pos: Vector3): Model
	local m = Instance.new("Model")
	m.Name = "ParkLamp"
	m.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	Props.Small(m, "Pole", Vector3.new(0.5, 10, 0.5), CFrame.new(pos + Vector3.new(0, 5, 0)), C.Dark, Enum.Material.Metal)
	local head = Props.Ball(m, "Lamp", 1.8, CFrame.new(pos + Vector3.new(0, 10.6, 0)), Color3.fromRGB(200, 200, 196), Enum.Material.SmoothPlastic, { CanCollide = false })
	head.CastShadow = false
	local light = Instance.new("PointLight")
	light.Range = 26
	light.Brightness = 1.6
	light.Color = Color3.fromRGB(255, 220, 170)
	light.Shadows = false
	light.Enabled = false
	light.Parent = head
	m.PrimaryPart = head
	m.Parent = parent
	Props.Tag(m, Tags.Streetlight)
	return m
end

---------------------------------------------------------------------------
-- Zones, spawns, elevators
---------------------------------------------------------------------------
function Gameplay.Zone(parent: Instance, tag: string, cf: CFrame, size: Vector3, attrs: { [string]: any }?): BasePart
	return Props.Volume(parent, tag, cf, size, tag, attrs)
end

function Gameplay.Spawn(parent: Instance, cf: CFrame): SpawnLocation
	local s = Instance.new("SpawnLocation")
	s.Name = "SpawnPoint"
	s.Anchored = true
	s.Size = Vector3.new(10, 0.6, 10)
	s.CFrame = cf * CFrame.new(0, 0.3, 0)
	s.Color = Color3.fromRGB(64, 156, 255)
	s.Material = Enum.Material.Neon
	s.Transparency = 0.2
	s.TopSurface = Enum.SurfaceType.Smooth
	s.Neutral = true
	s.Duration = 0
	s.AllowTeamChangeOnTouch = false
	s.CastShadow = false
	local decal = s:FindFirstChildOfClass("Decal")
	if decal then
		decal:Destroy()
	end
	s.Parent = parent
	Props.Tag(s, Tags.SpawnPoint)
	return s
end

-- Elevator call pad. toCF = arrival CFrame (standing position). pass = MonetizationService pass key or nil.
function Gameplay.Elevator(parent: Instance, cf: CFrame, label: string, toCF: CFrame, pass: string?): BasePart
	local panel = Props.Small(parent, "Elevator", Vector3.new(5, 7, 0.6), cf * CFrame.new(0, 3.5, 0), pass and Color3.fromRGB(200, 160, 40) or Color3.fromRGB(150, 156, 168), Enum.Material.Metal)
	Props.Small(parent, "ElevatorButton", Vector3.new(0.8, 0.8, 0.2), cf * CFrame.new(2, 3.6, -0.35), Color3.fromRGB(80, 200, 255), Enum.Material.Neon, { CanCollide = false })
	Props.Sign(panel, label, { PixelsPerStud = 26, Face = Enum.NormalId.Front, TextColor = pass and Color3.fromRGB(30, 22, 6) or Color3.new(1, 1, 1) })
	Props.Tag(panel, Tags.Elevator, { ToCFrame = toCF, Label = label, RequiresPass = pass })
	return panel
end

return Gameplay
