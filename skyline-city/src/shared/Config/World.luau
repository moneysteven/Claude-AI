-- WORLD CONFIG — time, weather and the CollectionService tag contract.
--
-- Every interactive thing in the city is found by TAG, not by name or path.
-- The procedural greybox city (WorldBuilder) creates tagged parts automatically;
-- when you replace the greybox with real models, just put the same tags and
-- attributes on your parts and everything keeps working.

return {
	Time = {
		DayLengthMinutes = 24, -- one in-game day = 24 real minutes
		DaysPerWeek = 7, -- rent is charged once per in-game week
		StartClockTime = 8, -- clock time when a server starts
		NightStart = 18.5, -- streetlights on
		NightEnd = 6.25, -- streetlights off
	},

	Weather = {
		ChangeEveryMinutes = { 6, 14 }, -- random range
		Weights = { Clear = 55, Cloudy = 20, Rain = 15, Fog = 10 },
	},

	-- Tag name -> description of required attributes
	Tags = {
		ATM = "ATM", -- BasePart. Bank machine.
		Bank = "Bank", -- BasePart. Bank teller counter (same as ATM + savings).
		JobStation = "JobStation", -- BasePart. Attr JobId: string. Clock in/out here.
		JobTarget = "JobTarget", -- BasePart. Attr JobId: string, Kind: string. Delivery points, fires, patients, etc.
		HousePlot = "HousePlot", -- BasePart (flat, top = ground). Attr PlotId: string, Tier: string, Size: Vector3
		ApartmentUnit = "ApartmentUnit", -- BasePart. Attr PlotId, Tier ("Studio"|"Apartment"|"Penthouse"|"SkyApartment")
		BusinessLot = "BusinessLot", -- BasePart. Attr LotId: string, Size: Vector3, AllowedTypes: string (comma list or "*")
		FuelPump = "FuelPump", -- BasePart.
		Dealership = "Dealership", -- BasePart. Counter where the dealership UI opens.
		DealershipDisplay = "DealershipDisplay", -- BasePart. Attr Slot: number. Display pads for cars.
		TestDriveSpawn = "TestDriveSpawn", -- BasePart. Spawn CFrame for test drives.
		TuningShop = "TuningShop", -- BasePart. Car must be parked inside its bounds.
		MechanicBay = "MechanicBay", -- BasePart. Repair zone.
		CarSpawn = "CarSpawn", -- BasePart. Public car spawn spots.
		ClothingStore = "ClothingStore", -- BasePart. Opens clothing shop.
		FurnitureStore = "FurnitureStore", -- BasePart. Optional showroom.
		SafeZone = "SafeZone", -- BasePart (invisible volume). No car-ramming inside.
		VIPArea = "VIPArea", -- BasePart (invisible volume). VIP-only.
		VIPDoor = "VIPDoor", -- BasePart. Only VIP pass holders can pass.
		SpawnPoint = "SpawnPoint", -- SpawnLocation.
		Streetlight = "Streetlight", -- Model or BasePart containing a Light; toggled at night.
		Seat = "RPSeat", -- Seat with Attr Pose: "Sit"|"Sleep"
		Leaderboard = "Leaderboard", -- BasePart with a front face for a SurfaceGui.
		DistrictZone = "DistrictZone", -- BasePart volume. Attr District: string
		RoadNode = "RoadNode", -- BasePart. Attr NodeId, Links ("id,id,id"). NPC traffic graph.
		WalkNode = "WalkNode", -- BasePart. Attr NodeId, Links. NPC pedestrian graph.
		PartyZone = "PartyZone", -- BasePart volume used by events.
		VoiceZone = "VoiceZone", -- BasePart volume, voice-chat friendly hangout.
		Elevator = "Elevator", -- BasePart. Attr ToCFrame (CFrame), RequiresPass: string?
	},

	Districts = {
		"Downtown",
		"Beach",
		"Suburbs",
		"Industrial",
		"AutoStrip",
		"Mall",
		"Civic", -- police / fire / hospital
		"Park",
		"Highway",
	},
}
