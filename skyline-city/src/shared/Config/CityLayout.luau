-- CITY LAYOUT — the single source of truth for the procedural city.
--
-- Read by:
--   * Server WorldBuilder  (roads, districts, building sites, plots, zones)
--   * Phone MapApp / GPS    (Bounds, Districts, POIs, Roads)
--   * Client traffic / pedestrians (road + sidewalk graph fallback via Shared/World/RoadGraph)
--
-- Contract fields (ARCHITECTURE §5 World):
--   Bounds    = { Min = Vector2, Max = Vector2 }                 X/Z world extents of the map
--   Districts = { { Name, Center = Vector3, Size = Vector2, Color = Color3 } }
--   POIs      = { { Id, Name, Icon, Position = Vector3, Category } }
--   Roads     = { { From = Vector3, To = Vector3, Width, Kind?, Name? } }   (axis-aligned)
-- Extra fields (world-only, ignored by the map): Grid, Highway, Coast, Heights, RoadKinds, Ramps, Sites, EventSpots.
--
-- Coordinates: +X = east, +Z = south (Roblox -Z is "north" on the phone map). The baseplate top is y = 0.
-- Moving a district / site here moves it in the world AND on the phone map. Keep roads axis-aligned.

local Layout = {}

---------------------------------------------------------------------------
-- Grid & road sizes
---------------------------------------------------------------------------
local GRID_MIN, GRID_MAX, STEP = -900, 900, 300 -- street grid lines every 300 studs
local STREET_W = 36 -- 1 lane each way (12) + parking lane (5.5) each side + centre line
local HIGHWAY_W = 56 -- 2 lanes each way + median barrier + shoulders
local COAST_W = 30
local HW = 1020 -- highway loop centre line (|x| or |z|)
local COAST_Z = 1085 -- coastal boulevard centre line

Layout.Grid = {
	Min = GRID_MIN,
	Max = GRID_MAX,
	Step = STEP,
	RoadWidth = STREET_W,
	Sidewalk = 10, -- sidewalk strip width along streets
	BlockInner = 244, -- usable block size between sidewalks (300 - 36 - 2*10)
}

Layout.Highway = { Offset = HW, Width = HIGHWAY_W }

Layout.Coast = {
	RoadZ = COAST_Z,
	BoardwalkZ = { 1110, 1130 },
	SandZ = { 1130, 1310 },
	SandX = { -720, 720 },
	WaterZ = { 1250, 1990 },
	WaterX = { -1350, 1350 },
	WaterLevel = 1.6, -- terrain water surface height
}

-- Surface heights (top faces)
Layout.Heights = {
	Road = 0.4, -- asphalt top
	Sidewalk = 0.9, -- kerb top
	Ground = 0.5, -- paved lots, plazas, building floors
}

-- Road kinds: lane geometry + NPC traffic speed (studs/s)
Layout.RoadKinds = {
	Street = { Lanes = 1, Median = 0.5, Shoulder = 5.5, Sidewalk = 10, Speed = { 26, 40 }, Lights = true },
	Coastal = { Lanes = 1, Median = 0.5, Shoulder = 3, Sidewalk = 10, Speed = { 24, 34 }, Lights = true },
	Highway = { Lanes = 2, Median = 2, Shoulder = 4, Sidewalk = 0, Speed = { 58, 82 }, Lights = true },
}

Layout.Bounds = { Min = Vector2.new(-1100, -1100), Max = Vector2.new(1100, 1340) }

---------------------------------------------------------------------------
-- Roads
---------------------------------------------------------------------------
local roads = {}
local function road(x1: number, z1: number, x2: number, z2: number, width: number, kind: string, name: string)
	table.insert(roads, {
		From = Vector3.new(x1, 0, z1),
		To = Vector3.new(x2, 0, z2),
		Width = width,
		Kind = kind,
		Name = name,
	})
end

-- Highway loop ("Skyline Loop")
road(-HW, -HW, HW, -HW, HIGHWAY_W, "Highway", "Skyline Loop N")
road(-HW, HW, HW, HW, HIGHWAY_W, "Highway", "Skyline Loop S")
road(-HW, -HW, -HW, HW, HIGHWAY_W, "Highway", "Skyline Loop W")
road(HW, -HW, HW, HW, HIGHWAY_W, "Highway", "Skyline Loop E")

-- North-south avenues (x = const)
road(-900, GRID_MIN, -900, GRID_MAX, STREET_W, "Street", "Foundry Ave")
road(-600, -HW, -600, COAST_Z, STREET_W, "Street", "Union Ave")
road(-300, GRID_MIN, -300, GRID_MAX, STREET_W, "Street", "Civic Ave")
road(0, -HW, 0, -300, STREET_W, "Street", "Central Ave N")
road(0, 300, 0, COAST_Z, STREET_W, "Street", "Central Ave S")
road(300, GRID_MIN, 300, GRID_MAX, STREET_W, "Street", "Market Ave")
road(600, -HW, 600, COAST_Z, STREET_W, "Street", "Motor Ave")
road(900, GRID_MIN, 900, GRID_MAX, STREET_W, "Street", "Bayview Ave")

-- East-west streets (z = const)
road(GRID_MIN, -900, GRID_MAX, -900, STREET_W, "Street", "Skyline Blvd")
road(-HW, -600, HW, -600, STREET_W, "Street", "Tower St")
road(GRID_MIN, -300, GRID_MAX, -300, STREET_W, "Street", "Plaza St N")
road(-HW, 0, -300, 0, STREET_W, "Street", "Harbor St W")
road(300, 0, HW, 0, STREET_W, "Street", "Harbor St E")
road(GRID_MIN, 300, GRID_MAX, 300, STREET_W, "Street", "Plaza St S")
road(-HW, 600, HW, 600, STREET_W, "Street", "Maple St")
road(GRID_MIN, 900, GRID_MAX, 900, STREET_W, "Street", "Seaside St")

-- Coastal boulevard
road(-600, COAST_Z, 600, COAST_Z, COAST_W, "Coastal", "Coral Blvd")

Layout.Roads = roads

-- Decorative on-ramps (merge lanes) next to every connector/highway junction. Not part of the traffic graph.
local ramps = {}
local function addRamps(jx: number, jz: number, tangent: Vector3, inward: Vector3)
	local j = Vector3.new(jx, 0, jz)
	for _, s in ipairs({ -1, 1 }) do
		table.insert(ramps, {
			From = j + tangent * (s * 30) + inward * 70,
			To = j + tangent * (s * 84) + inward * 25,
			Width = 12,
		})
	end
end
for _, x in ipairs({ -600, 0, 600 }) do
	addRamps(x, -HW, Vector3.xAxis, Vector3.zAxis)
	addRamps(x, HW, Vector3.xAxis, -Vector3.zAxis)
end
for _, z in ipairs({ -600, 0, 600 }) do
	addRamps(-HW, z, Vector3.zAxis, Vector3.xAxis)
	addRamps(HW, z, Vector3.zAxis, -Vector3.xAxis)
end
Layout.Ramps = ramps

---------------------------------------------------------------------------
-- Districts (rectangles; the world also creates DistrictZone volumes from these)
---------------------------------------------------------------------------
Layout.Districts = {
	{ Name = "Industrial", Center = Vector3.new(-645, 0, -645), Size = Vector2.new(690, 690), Color = Color3.fromRGB(150, 132, 108) },
	{ Name = "Downtown", Center = Vector3.new(0, 0, -645), Size = Vector2.new(600, 690), Color = Color3.fromRGB(96, 120, 170) },
	{ Name = "AutoStrip", Center = Vector3.new(645, 0, -645), Size = Vector2.new(690, 690), Color = Color3.fromRGB(200, 96, 80) },
	{ Name = "Civic", Center = Vector3.new(-645, 0, 0), Size = Vector2.new(690, 600), Color = Color3.fromRGB(110, 150, 200) },
	{ Name = "Park", Center = Vector3.new(0, 0, 0), Size = Vector2.new(600, 600), Color = Color3.fromRGB(90, 170, 90) },
	{ Name = "Mall", Center = Vector3.new(645, 0, 0), Size = Vector2.new(690, 600), Color = Color3.fromRGB(190, 120, 190) },
	{ Name = "Suburbs", Center = Vector3.new(-345, 0, 645), Size = Vector2.new(1290, 690), Color = Color3.fromRGB(160, 190, 120) },
	{ Name = "Beach", Center = Vector3.new(645, 0, 645), Size = Vector2.new(690, 690), Color = Color3.fromRGB(230, 205, 140) },
	{ Name = "Beach", Center = Vector3.new(0, 0, 1180), Size = Vector2.new(1980, 264), Color = Color3.fromRGB(236, 214, 150) },
	{ Name = "Highway", Center = Vector3.new(0, 0, -HW), Size = Vector2.new(2100, 60), Color = Color3.fromRGB(120, 120, 128) },
	{ Name = "Highway", Center = Vector3.new(0, 0, HW), Size = Vector2.new(2100, 60), Color = Color3.fromRGB(120, 120, 128) },
	{ Name = "Highway", Center = Vector3.new(-HW, 0, 0), Size = Vector2.new(60, 2100), Color = Color3.fromRGB(120, 120, 128) },
	{ Name = "Highway", Center = Vector3.new(HW, 0, 0), Size = Vector2.new(60, 2100), Color = Color3.fromRGB(120, 120, 128) },
}

---------------------------------------------------------------------------
-- Building sites (ground centre positions). Builders AND POIs read these.
---------------------------------------------------------------------------
local function v(x: number, z: number): Vector3
	return Vector3.new(x, 0, z)
end

Layout.Sites = {
	-- Park / spawn
	SpawnPlaza = v(0, 0),
	ParkStage = v(150, 160),
	Gazebo = v(-150, 150),
	Pond = v(-150, -150),
	Playground = v(150, -150),
	-- Civic
	Police = v(-750, -80),
	Fire = v(-450, -80),
	Hospital = v(-450, 140),
	CityHall = v(-750, 110),
	-- Industrial
	ConstructionYard = v(-750, -750),
	Warehouses = v(-470, -800),
	Containers = v(-750, -470),
	TaxiDepot = v(-470, -480),
	-- Downtown
	StudioTower = v(-200, -760),
	Spire = v(150, -760),
	ApartmentTower = v(-200, -470),
	Realty = v(-80, -400),
	Bank = v(-80, -520),
	Club = v(200, -400),
	VipParking = v(200, -520),
	-- AutoStrip
	Dealership = v(450, -770),
	TuningShop = v(680, -780),
	Mechanic = v(810, -780),
	GasNorth = v(420, -470),
	MeetLot = v(750, -490),
	-- Mall district
	Mall = v(450, -160),
	Diner = v(720, -180),
	Cinema = v(830, -160),
	MallParking = v(450, 200),
	Arcade = v(810, 200),
	-- Suburbs
	PizzaShop = v(100, 680),
	GasSouth = v(200, 790),
	-- Beach
	Hotel = v(450, 500),
	SurfShop = v(800, 410),
	Pier = v(300, 1250),
	BeachParty = v(-200, 1200),
	Bonfire = v(-480, 1200),
}

---------------------------------------------------------------------------
-- Points of interest (phone map + GPS). Category -> Config.Phone.Map.CategoryIcons
---------------------------------------------------------------------------
local S = Layout.Sites
Layout.POIs = {
	{ Id = "spawn", Name = "Skyline Plaza", Icon = "🏙️", Position = S.SpawnPlaza, Category = "Fun" },
	{ Id = "park", Name = "Central Park Stage", Icon = "🎤", Position = S.ParkStage, Category = "Fun" },
	{ Id = "gazebo", Name = "Park Gazebo (Voice Hangout)", Icon = "🎙️", Position = S.Gazebo, Category = "Fun" },
	{ Id = "police", Name = "Police HQ", Icon = "🚓", Position = S.Police, Category = "Job" },
	{ Id = "fire", Name = "Fire Station 1", Icon = "🚒", Position = S.Fire, Category = "Job" },
	{ Id = "hospital", Name = "Skyline General Hospital", Icon = "🏥", Position = S.Hospital, Category = "Job" },
	{ Id = "cityhall", Name = "City Hall", Icon = "🏛️", Position = S.CityHall, Category = "Civic" },
	{ Id = "construction", Name = "Ironworks Construction Yard", Icon = "🏗️", Position = S.ConstructionYard, Category = "Job" },
	{ Id = "taxi", Name = "Checker Cab Depot", Icon = "🚕", Position = S.TaxiDepot, Category = "Job" },
	{ Id = "studios", Name = "Skyline Residences (Studios)", Icon = "🛏️", Position = S.StudioTower, Category = "Home" },
	{ Id = "spire", Name = "The Spire (Penthouses & Sky Apartments)", Icon = "🌃", Position = S.Spire, Category = "Home" },
	{ Id = "apartments", Name = "Harbor Point Apartments", Icon = "🏢", Position = S.ApartmentTower, Category = "Home" },
	{ Id = "realty", Name = "Skyline Realty", Icon = "🏡", Position = S.Realty, Category = "Job" },
	{ Id = "bank", Name = "Skyline Savings & Trust", Icon = "🏦", Position = S.Bank, Category = "Bank" },
	{ Id = "club", Name = "Club Aurora (VIP)", Icon = "👑", Position = S.Club, Category = "Party" },
	{ Id = "dealership", Name = "Skyline Motors Dealership", Icon = "🚗", Position = S.Dealership, Category = "Car" },
	{ Id = "tuning", Name = "Neon Garage Tuning", Icon = "🎨", Position = S.TuningShop, Category = "Car" },
	{ Id = "mechanic", Name = "Wrench Bros Garage", Icon = "🔧", Position = S.Mechanic, Category = "Job" },
	{ Id = "gas_north", Name = "FuelUp Station (AutoStrip)", Icon = "⛽", Position = S.GasNorth, Category = "Fuel" },
	{ Id = "meet", Name = "AutoStrip Meet Lot", Icon = "🏁", Position = S.MeetLot, Category = "Car" },
	{ Id = "mall", Name = "Skyline Galleria Mall", Icon = "🛍️", Position = S.Mall, Category = "Shop" },
	{ Id = "diner", Name = "Skyline Diner", Icon = "🍳", Position = S.Diner, Category = "Food" },
	{ Id = "cinema", Name = "Starlight Cinema", Icon = "🎬", Position = S.Cinema, Category = "Fun" },
	{ Id = "pizza", Name = "Slice Society Pizza", Icon = "🍕", Position = S.PizzaShop, Category = "Job" },
	{ Id = "gas_south", Name = "FuelUp Station (Suburbs)", Icon = "⛽", Position = S.GasSouth, Category = "Fuel" },
	{ Id = "suburbs", Name = "Maple Heights", Icon = "🏠", Position = Vector3.new(-450, 0, 600), Category = "Home" },
	{ Id = "villas", Name = "Coral Bay Villas", Icon = "🏖️", Position = Vector3.new(600, 0, 750), Category = "Home" },
	{ Id = "hotel", Name = "Coral Bay Hotel", Icon = "🏨", Position = S.Hotel, Category = "Fun" },
	{ Id = "beach", Name = "Skyline Beach", Icon = "🏖️", Position = S.BeachParty, Category = "Fun" },
	{ Id = "pier", Name = "Sunset Pier", Icon = "🎣", Position = S.Pier, Category = "Fun" },
}

---------------------------------------------------------------------------
-- Event locations (EventService / EventController)
---------------------------------------------------------------------------
local meetSpots = {}
for row = 0, 1 do
	for col = 0, 4 do
		table.insert(meetSpots, {
			Position = S.MeetLot + Vector3.new(-72 + col * 36, 0.5, -26 + row * 52),
			Yaw = row == 0 and 0 or math.pi,
		})
	end
end

Layout.EventSpots = {
	CarMeet = { Center = S.MeetLot, Spots = meetSpots },
	BeachParty = { Center = S.BeachParty },
	Fireworks = {
		Vector3.new(0, 0, 210),
		Vector3.new(-180, 0, 230),
		Vector3.new(180, 0, 230),
		Vector3.new(-200, 0, 1300),
		Vector3.new(200, 0, 1320),
		Vector3.new(500, 0, 1300),
	},
}

return Layout
