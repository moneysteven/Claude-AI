-- JOBS CONFIG — every tunable number for the 11 city jobs lives here.
-- Change values freely; no code changes needed.
--
-- Pay formula (server, per completed task):
--   base   = (BasePay + task bonus) * (1 + PayPerLevel * (Level - 1)) * taskMultiplier
--   paid   = EconomyService:Pay(player, base, "Job:<JobId>")   -- VIP 2x / events applied by Economy modifiers
-- XP per task = XP * taskMultiplier (rounded). Level N -> N+1 needs Leveling.XPFor(N).
--
-- Colors are Color3. Distances are studs. Times are seconds.

local Jobs = {}

-- Display order in the phone Jobs app.
Jobs.Order = {
	"Pizza",
	"Taxi",
	"Police",
	"Fire",
	"Paramedic",
	"Mechanic",
	"Cashier",
	"Chef",
	"CarSales",
	"RealEstate",
	"Construction",
}

Jobs.Leveling = {
	MaxLevel = 10,
	BaseXP = 100, -- XP needed to go from level 1 to 2
	Growth = 1.35, -- each level needs this many times more XP than the previous one
}

-- XP needed to go from `level` to `level + 1`.
function Jobs.XPFor(level: number): number
	return math.floor(Jobs.Leveling.BaseXP * Jobs.Leveling.Growth ^ (level - 1) + 0.5)
end

Jobs.General = {
	TickRate = 4, -- server job loop rate in Hz (must stay <= 5)
	StationUseDistance = 16, -- how close you must be to a JobStation to clock in
	PromptDistance = 10, -- ProximityPrompt range on stations
	DefaultInteractRadius = 12, -- task interaction radius when a job doesn't override it
	MaxTravelSpeed = 165, -- studs/second; arriving faster than this between two points is rejected + flagged
	VipExtraSlots = 2, -- VIP can work even when a job is full, up to Slots + this
	QueueReserveSeconds = 30, -- when a slot opens, the first player in line has this long to clock in
	AfkClockOutSeconds = 300, -- clocked-in players who are AFK this long are clocked out
	FirstTaskDelay = 2, -- seconds after clock-in before the first task appears
	MaxTaskMultiplier = 2.5, -- hard cap on tips/bonuses multiplier for one task
	MaxTasksPerHour = 90, -- per player per job (anti-farm hard cap)
	FallbackTargetCount = 6, -- generated targets per job+kind if the map has none
	FallbackStationOrigin = Vector3.new(-160, 0, 220), -- where generated stations go if the map has none
	FallbackStationSpacing = 34,
	FallbackStationWait = 12, -- seconds to wait for the world to create stations before generating our own
	VehicleSpawnSearch = 160, -- look for a CarSpawn this close to the station for the job vehicle
	ShiftSummaryOnClockOut = true,
}

-- Fallback target placement (min/max distance from the job station) per target Kind.
Jobs.FallbackRadius = {
	Delivery = { 90, 420 },
	Pickup = { 60, 320 },
	Dropoff = { 150, 600 },
	PatrolPoint = { 60, 380 },
	FireSpot = { 110, 460 },
	PatientSpot = { 110, 460 },
	RepairSpot = { 12, 30 },
	Register = { 5, 10 },
	Stove = { 5, 10 },
	Showroom = { 10, 26 },
	Showing = { 140, 520 },
	ConstructionSite = { 70, 260 },
	HospitalDropoff = { 10, 18 },
}

-- Client keybinds (Enum.KeyCode names).
Jobs.Keybinds = {
	Action = "G", -- do the current task action (hold for hose)
	ActionGamepad = "ButtonY",
	Tracker = "J", -- collapse / expand the job tracker
	TrackerGamepad = "ButtonL1",
}

-- Shared titles for levels 1..10 (jobs can override with their own Titles list).
Jobs.DefaultTitles = {
	"Trainee",
	"Junior",
	"Associate",
	"Experienced",
	"Senior",
	"Specialist",
	"Expert",
	"Veteran",
	"Supervisor",
	"Manager",
}

---------------------------------------------------------------------------
-- Per-job definitions
--   Name, Icon, Description          shown in UI
--   StationJobId                     JobId attribute on the JobStation part(s)
--   BasePay                          $ per task at level 1
--   PayPerLevel                      raise per level (0.08 = +8% per level above 1)
--   XP                               XP per task
--   Slots                            max concurrent workers per server
--   UniformColor / UniformAccent     simple vest + cap uniform colors
--   ShirtTemplate / PantsTemplate    optional "rbxassetid://..." clothing (empty = vest only)
--   Vehicle                          job vehicle model id (or nil)
--   TaskTimeout                      seconds before an unfinished task fails
--   Cooldown                         seconds between finishing a task and the next one (anti-farm)
--   MinTaskSeconds                   tasks finished faster than this pay nothing (anti-farm)
--   InteractRadius                   how close you must be to targets
---------------------------------------------------------------------------
Jobs.Jobs = {
	Pizza = {
		Name = "Pizza Delivery",
		Icon = "🍕",
		Description = "Grab hot pizzas at Slice Palace and race them across the city. Faster deliveries earn bigger tips!",
		StationJobId = "Pizza",
		BasePay = 140,
		PayPerLevel = 0.08,
		XP = 22,
		Slots = 8,
		UniformColor = Color3.fromRGB(215, 45, 40),
		UniformAccent = Color3.fromRGB(255, 255, 255),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = "job_pizza_scooter",
		TaskTimeout = 180,
		Cooldown = 4,
		MinTaskSeconds = 10,
		InteractRadius = 14,
		Titles = { "Trainee", "Rookie Rider", "Delivery Driver", "Speedy Courier", "Senior Courier", "Route Expert", "Crust Captain", "Delivery Pro", "Shift Lead", "Manager" },
		-- job specific
		DeliveryDistance = { 90, 650 }, -- chosen house distance from the shop
		SecondsPerStud = 0.16, -- time limit = 25 + distance * this
		TipMax = 0.8, -- up to +80% of base pay as tip for very fast deliveries
		LatePayMultiplier = 0.7, -- delivered after the "hot" window (no tip) but before timeout
	},

	Taxi = {
		Name = "Taxi Driver",
		Icon = "🚕",
		Description = "Pick up passengers and drive them to their destination. Smooth, quick rides earn 5-star ratings and better fares.",
		StationJobId = "Taxi",
		BasePay = 60, -- flag fare; distance fare is added on top
		PayPerLevel = 0.08,
		XP = 24,
		Slots = 8,
		UniformColor = Color3.fromRGB(255, 205, 40),
		UniformAccent = Color3.fromRGB(30, 30, 30),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = "job_taxi",
		TaskTimeout = 240,
		Cooldown = 4,
		MinTaskSeconds = 12,
		InteractRadius = 18,
		Titles = { "Trainee", "Night Rider", "Cabbie", "City Driver", "Senior Driver", "Shortcut Pro", "Five-Star Driver", "Road Veteran", "Dispatcher", "Fleet Manager" },
		PickupDistance = { 40, 380 }, -- pickup distance from the driver
		TripDistance = { 160, 900 },
		FarePerStud = 0.32, -- $ of base fare per stud of trip distance
		SecondsPerStud = 0.14,
		RequireVehicle = true,
		-- rating: start at 5 stars, -1 per CrashHealthPerStar vehicle health lost, -1 if slower than the time limit's half
		CrashHealthPerStar = 8,
		StarPayBonus = 0.12, -- each star above 3 adds this multiplier
	},

	Police = {
		Name = "Police Officer",
		Icon = "🚓",
		Description = "Patrol the city, respond to calls, write tickets and arrest wanted suspects. Keep Skyline City safe!",
		StationJobId = "Police",
		BasePay = 170,
		PayPerLevel = 0.08,
		XP = 26,
		Slots = 6,
		UniformColor = Color3.fromRGB(30, 50, 110),
		UniformAccent = Color3.fromRGB(230, 190, 60),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = "job_police_cruiser",
		TaskTimeout = 210,
		Cooldown = 5,
		MinTaskSeconds = 12,
		InteractRadius = 14,
		Titles = { "Cadet", "Patrol Officer", "Officer", "Senior Officer", "Corporal", "Sergeant", "Detective", "Lieutenant", "Captain", "Chief" },
		TaskWeights = { Patrol = 45, Call = 35, Ticket = 20 },
		PatrolCheckpoints = 3,
		CheckpointDistance = { 60, 360 },
		CuffSequenceLength = 5, -- arrow presses in the cuff QTE
		CuffWindow = 9, -- seconds to finish the QTE once started
		CuffMinSeconds = 1.6,
		CallPayMultiplier = 1.25,
		TicketPayMultiplier = 0.8,
		-- Player arrests (roleplay): only players with the "Wanted" attribute, never in safe zones.
		PlayerCuffDistance = 10,
		PlayerCuffSeconds = 20, -- cuffs ALWAYS release after this (anti-grief)
		PlayerCuffCooldown = 60, -- same officer can't cuff the same player again for this long
		PlayerArrestPayMultiplier = 1.5,
		PlayerArrestPayCooldown = 900, -- an officer is paid for arresting the SAME player at most once per this many seconds (anti alt-farm)
		PlayerArrestPaidPerHour = 6, -- max paid player arrests per officer per hour (extra arrests still cuff, no bonus)
		TicketChoices = 3, -- options shown when writing a ticket
		Violations = {
			{ Id = "Parking", Name = "Illegal Parking", Clue = "The car is parked right in front of a fire hydrant." },
			{ Id = "Speeding", Name = "Speeding", Clue = "Radar clocked this car at 85 in a 35 zone." },
			{ Id = "Registration", Name = "Expired Registration", Clue = "The registration sticker expired two years ago." },
			{ Id = "Equipment", Name = "Broken Equipment", Clue = "A headlight is smashed and it was driven at night." },
			{ Id = "RedLight", Name = "Running a Red Light", Clue = "A traffic camera caught it blowing through a red light." },
			{ Id = "NoSeatbelt", Name = "No Seatbelt", Clue = "The driver was seen with no seatbelt on the highway." },
		},
	},

	Fire = {
		Name = "Firefighter",
		Icon = "🚒",
		Description = "Race to fires around the city and put them out with your hose. Bigger fires, bigger rewards.",
		StationJobId = "Fire",
		BasePay = 190,
		PayPerLevel = 0.08,
		XP = 28,
		Slots = 6,
		UniformColor = Color3.fromRGB(170, 40, 30),
		UniformAccent = Color3.fromRGB(240, 220, 60),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = "job_fire_truck",
		TaskTimeout = 240,
		Cooldown = 6,
		MinTaskSeconds = 15,
		InteractRadius = 30,
		Titles = { "Probie", "Firefighter", "Hose Handler", "Engine Crew", "Senior Firefighter", "Driver Engineer", "Rescue Specialist", "Lieutenant", "Captain", "Fire Chief" },
		FireCount = { 2, 4 }, -- fires per call
		FireHP = 100,
		HoseDps = 22, -- HP removed per second while hosing in range
		HoseDpsPerLevel = 0.05, -- +5% hose power per level
		HoseRange = 32,
		HoseFacingDot = 0.25, -- character must roughly face the fire (dot product)
		FireRegenPerSecond = 2, -- fires slowly regrow while nobody hoses them
		FireSpread = 9, -- fires are scattered this far around the FireSpot
		PayPerFire = 0.25, -- +25% pay per fire beyond the first
	},

	Paramedic = {
		Name = "Paramedic",
		Icon = "🚑",
		Description = "Respond to emergencies, perform CPR in rhythm and rush patients to Skyline General for a bonus.",
		StationJobId = "Paramedic",
		BasePay = 180,
		PayPerLevel = 0.08,
		XP = 26,
		Slots = 6,
		UniformColor = Color3.fromRGB(240, 240, 245),
		UniformAccent = Color3.fromRGB(40, 170, 90),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = "job_ambulance",
		TaskTimeout = 240,
		Cooldown = 5,
		MinTaskSeconds = 15,
		InteractRadius = 14,
		Titles = { "Trainee", "EMT", "EMT-Advanced", "Paramedic", "Senior Paramedic", "Field Medic", "Critical Care", "Flight Medic", "Supervisor", "Chief Medic" },
		CprCompressions = 15, -- taps needed
		CprMinSeconds = 6, -- server minimum time for the CPR minigame
		CprMaxSeconds = 40,
		TransportBonus = 0.6, -- +60% if you bring the patient to the hospital
		TransportSecondsPerStud = 0.15,
		NoTransportMultiplier = 0.55, -- treated on scene but transport timed out
	},

	Mechanic = {
		Name = "Mechanic",
		Icon = "🔧",
		Description = "Diagnose broken cars and fix them fast. You can also repair other players' damaged cars in the Mechanic Bay.",
		StationJobId = "Mechanic",
		BasePay = 150,
		PayPerLevel = 0.08,
		XP = 22,
		Slots = 6,
		UniformColor = Color3.fromRGB(60, 80, 100),
		UniformAccent = Color3.fromRGB(255, 140, 30),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = "job_tow_truck",
		TaskTimeout = 150,
		Cooldown = 4,
		MinTaskSeconds = 10,
		InteractRadius = 12,
		Titles = { "Apprentice", "Lube Tech", "Tire Tech", "Mechanic", "Senior Mechanic", "Diagnostician", "Master Tech", "Engine Builder", "Shop Foreman", "Garage Manager" },
		FaultCount = { 2, 3 },
		PartChoices = 8, -- part buttons shown in the minigame
		MinigameMinSeconds = 4,
		WrongPartPenalty = 0.2, -- -20% per wrong part picked
		-- Real player cars
		BayDistance = 45, -- mechanic must be this close to a MechanicBay
		CarDistance = 24, -- and this close to the damaged car
		RepairFeePerHealth = 14, -- owner pays $ per missing health point
		MinRepairFee = 100,
		-- Mechanic earns fee * this as a RAW commission (no VIP/event pay multipliers), so it is always less
		-- than what the owner paid and alt accounts can never multiply money through repairs.
		PlayerRepairPayShare = 0.8,
		OfferExpireSeconds = 30,
		PairCooldown = 240, -- same mechanic + owner pair can't repeat for this long
		DeclineCooldown = 60, -- after an owner declines / ignores an offer, that mechanic can't re-offer them for this long
		Faults = {
			{ Id = "Battery", Name = "Battery", Icon = "🔋", Symptom = "Engine won't crank, dash lights flicker" },
			{ Id = "Tire", Name = "Tire", Icon = "🛞", Symptom = "Car pulls to one side, thumping noise" },
			{ Id = "Brakes", Name = "Brake Pads", Icon = "🛑", Symptom = "Loud squeal when stopping" },
			{ Id = "Oil", Name = "Engine Oil", Icon = "🛢️", Symptom = "Oil warning light, engine ticking" },
			{ Id = "Spark", Name = "Spark Plugs", Icon = "⚡", Symptom = "Engine misfires and shakes at idle" },
			{ Id = "Radiator", Name = "Radiator", Icon = "🌡️", Symptom = "Temperature gauge in the red, steam" },
			{ Id = "Belt", Name = "Drive Belt", Icon = "➰", Symptom = "High-pitched whine from the engine" },
			{ Id = "Headlight", Name = "Headlight Bulb", Icon = "💡", Symptom = "One headlight is out" },
			{ Id = "Exhaust", Name = "Exhaust", Icon = "💨", Symptom = "Loud rumble and black smoke" },
			{ Id = "Alternator", Name = "Alternator", Icon = "🔌", Symptom = "Battery dies while driving" },
		},
	},

	Cashier = {
		Name = "Cashier",
		Icon = "🛒",
		Description = "Run the register at the supermarket. Scan items, take payment and count the correct change.",
		StationJobId = "Cashier",
		BasePay = 95,
		PayPerLevel = 0.08,
		XP = 16,
		Slots = 6,
		UniformColor = Color3.fromRGB(40, 140, 80),
		UniformAccent = Color3.fromRGB(255, 255, 255),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = nil,
		TaskTimeout = 90,
		Cooldown = 3,
		MinTaskSeconds = 4,
		InteractRadius = 10,
		Titles = { "Trainee", "Bagger", "Cashier", "Fast Scanner", "Senior Cashier", "Lane Lead", "Customer Hero", "Floor Lead", "Assistant Manager", "Store Manager" },
		ItemCount = { 3, 6 },
		MinSecondsPerItem = 0.5,
		WrongChangePenalty = 0.35, -- -35% per wrong attempt
		MaxAttempts = 3,
		Bills = { 500, 1000, 2000, 5000, 10000 }, -- cents customers pay with (smallest that covers the total is preferred)
		Items = {
			{ Name = "Milk", Icon = "🥛", Price = 349 },
			{ Name = "Bread", Icon = "🍞", Price = 279 },
			{ Name = "Eggs", Icon = "🥚", Price = 419 },
			{ Name = "Apples", Icon = "🍎", Price = 325 },
			{ Name = "Cheese", Icon = "🧀", Price = 599 },
			{ Name = "Cereal", Icon = "🥣", Price = 449 },
			{ Name = "Coffee", Icon = "☕", Price = 899 },
			{ Name = "Bananas", Icon = "🍌", Price = 189 },
			{ Name = "Juice", Icon = "🧃", Price = 299 },
			{ Name = "Chips", Icon = "🥔", Price = 249 },
			{ Name = "Soda", Icon = "🥤", Price = 175 },
			{ Name = "Chicken", Icon = "🍗", Price = 1099 },
			{ Name = "Pasta", Icon = "🍝", Price = 199 },
			{ Name = "Carrots", Icon = "🥕", Price = 149 },
			{ Name = "Ice Cream", Icon = "🍨", Price = 549 },
		},
	},

	Chef = {
		Name = "Chef",
		Icon = "👨‍🍳",
		Description = "Cook orders at the restaurant stove. Follow the recipe card and nail the timing for a perfect dish.",
		StationJobId = "Chef",
		BasePay = 120,
		PayPerLevel = 0.08,
		XP = 18,
		Slots = 6,
		UniformColor = Color3.fromRGB(245, 245, 245),
		UniformAccent = Color3.fromRGB(30, 30, 30),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = nil,
		TaskTimeout = 100,
		Cooldown = 3,
		MinTaskSeconds = 6,
		InteractRadius = 10,
		Titles = { "Dishwasher", "Prep Cook", "Line Cook", "Grill Cook", "Sous Chef", "Saucier", "Chef de Partie", "Head Chef", "Executive Chef", "Master Chef" },
		MinSecondsPerStep = 1.0,
		QualityBonus = 0.4, -- perfect timing adds up to +40%
		WrongStepPenalty = 0.3,
		Steps = {
			Chop = { Name = "Chop", Icon = "🔪" },
			Boil = { Name = "Boil", Icon = "🫕" },
			Fry = { Name = "Fry", Icon = "🍳" },
			Grill = { Name = "Grill", Icon = "🔥" },
			Season = { Name = "Season", Icon = "🧂" },
			Mix = { Name = "Mix", Icon = "🥄" },
			Bake = { Name = "Bake", Icon = "🧁" },
			Plate = { Name = "Plate", Icon = "🍽️" },
		},
		Recipes = {
			{ Name = "Skyline Burger", Icon = "🍔", Steps = { "Chop", "Grill", "Season", "Plate" } },
			{ Name = "Pasta Primavera", Icon = "🍝", Steps = { "Chop", "Boil", "Mix", "Plate" } },
			{ Name = "Pancake Stack", Icon = "🥞", Steps = { "Mix", "Fry", "Plate" } },
			{ Name = "Garden Salad", Icon = "🥗", Steps = { "Chop", "Season", "Mix", "Plate" } },
			{ Name = "Grilled Steak", Icon = "🥩", Steps = { "Season", "Grill", "Chop", "Plate" } },
			{ Name = "Veggie Stir Fry", Icon = "🥘", Steps = { "Chop", "Fry", "Season", "Plate" } },
			{ Name = "Blueberry Muffins", Icon = "🧁", Steps = { "Mix", "Bake", "Plate" } },
			{ Name = "Tomato Soup", Icon = "🍲", Steps = { "Chop", "Boil", "Season", "Mix", "Plate" } },
		},
	},

	CarSales = {
		Name = "Car Salesperson",
		Icon = "🚗",
		Description = "Greet customers at the dealership, read what they want and pitch the right car. Earn commission on every sale.",
		StationJobId = "CarSales",
		BasePay = 80,
		PayPerLevel = 0.08,
		XP = 24,
		Slots = 5,
		UniformColor = Color3.fromRGB(35, 35, 45),
		UniformAccent = Color3.fromRGB(200, 40, 60),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = nil,
		TaskTimeout = 120,
		Cooldown = 8,
		MinTaskSeconds = 15,
		InteractRadius = 12,
		Titles = { "Trainee", "Lot Attendant", "Sales Associate", "Closer", "Senior Associate", "Deal Maker", "Top Seller", "Finance Pro", "Sales Manager", "General Manager" },
		Rounds = 3,
		NeedCorrect = 2, -- correct pitches needed to close the sale
		-- Commission on the (parody) car price, added to the task's base pay. Kept small so a quick
		-- stationary job doesn't out-earn the driving jobs (~$190/sale at level 1 on average).
		Commission = 0.0015,
		MaxCommission = 220,
		MinSecondsPerRound = 1.2,
		-- Parody cars only.
		Cars = {
			{ Name = "Velo Sprint", Price = 18000, Tag = "Eco" },
			{ Name = "Brisa Hatch", Price = 22000, Tag = "Eco" },
			{ Name = "Montana Trail", Price = 38000, Tag = "Family" },
			{ Name = "Orbis Van", Price = 34000, Tag = "Family" },
			{ Name = "Stratos GT", Price = 85000, Tag = "Speed" },
			{ Name = "Raptora V8", Price = 120000, Tag = "Speed" },
			{ Name = "Regalia S", Price = 95000, Tag = "Luxury" },
			{ Name = "Aurelia Grand", Price = 160000, Tag = "Luxury" },
		},
		Preferences = {
			Eco = {
				Want = "I want something cheap to run that sips fuel.",
				Good = { "It gets amazing mileage around the city.", "Low running costs and tiny insurance.", "Easy to park and super reliable." },
				Bad = { "It does 0-60 in under four seconds!", "Seats seven with a massive trunk.", "Hand-stitched leather everywhere." },
			},
			Family = {
				Want = "I've got three kids and a dog. Space matters.",
				Good = { "Seats seven with a massive trunk.", "Top safety ratings in its class.", "Sliding doors and tons of cupholders." },
				Bad = { "It does 0-60 in under four seconds!", "Two seats only — pure sports car.", "It's tiny, perfect for one person." },
			},
			Speed = {
				Want = "I want to feel the speed. Something fast!",
				Good = { "It does 0-60 in under four seconds!", "Track-tuned suspension and a big turbo.", "Launch control and a roaring exhaust." },
				Bad = { "It gets amazing mileage around the city.", "Seats seven with a massive trunk.", "Very quiet, very comfortable, very slow." },
			},
			Luxury = {
				Want = "Only the finest. Comfort and prestige.",
				Good = { "Hand-stitched leather everywhere.", "Massage seats and a premium sound system.", "Whisper-quiet cabin, chauffeur-grade ride." },
				Bad = { "Low running costs and tiny insurance.", "Rubber floor mats, easy to hose out.", "It's the cheapest one on the lot." },
			},
		},
	},

	RealEstate = {
		Name = "Real Estate Agent",
		Icon = "🏡",
		Description = "Meet clients at the office, learn what home they want and drive them to a matching showing. Earn commission!",
		StationJobId = "RealEstate",
		BasePay = 110,
		PayPerLevel = 0.08,
		XP = 26,
		Slots = 5,
		UniformColor = Color3.fromRGB(70, 40, 100),
		UniformAccent = Color3.fromRGB(240, 200, 90),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = nil,
		TaskTimeout = 240,
		Cooldown = 5,
		MinTaskSeconds = 15,
		InteractRadius = 16,
		Titles = { "Trainee", "Assistant", "Junior Agent", "Agent", "Senior Agent", "Listing Pro", "Top Producer", "Luxury Specialist", "Broker", "Managing Broker" },
		-- Commission on the home price (capped so mansions don't break the job economy).
		Commission = 0.0005,
		MaxCommission = 400,
		WrongShowingPenalty = 0.3,
		MaxWrongShowings = 2,
		ListingsShown = 4, -- how many showing spots the agent can choose from
		-- Showing spots use attribute Tier if present; otherwise tiers are assigned round-robin from this list.
		Tiers = {
			{ Id = "Studio", Name = "Studio", Icon = "🛏️", Price = 45000, Want = "Something small and affordable downtown." },
			{ Id = "Apartment", Name = "Apartment", Icon = "🏢", Price = 90000, Want = "A comfy apartment, nothing fancy." },
			{ Id = "Townhouse", Name = "Townhouse", Icon = "🏘️", Price = 160000, Want = "A townhouse with a little yard." },
			{ Id = "Suburban", Name = "Suburban Home", Icon = "🏡", Price = 260000, Want = "A family home in the suburbs." },
			{ Id = "BeachVilla", Name = "Beach Villa", Icon = "🏖️", Price = 600000, Want = "Ocean views. I want to hear the waves." },
			{ Id = "Penthouse", Name = "Penthouse", Icon = "🌆", Price = 900000, Want = "Top floor, skyline views, prestige." },
			{ Id = "Mansion", Name = "Mansion", Icon = "🏰", Price = 1500000, Want = "Only a mansion will do. Pool, gates, everything." },
		},
	},

	Construction = {
		Name = "Construction Worker",
		Icon = "🏗️",
		Description = "Haul materials and hammer them into place. Work together with other builders to finish sites for a big bonus.",
		StationJobId = "Construction",
		BasePay = 130,
		PayPerLevel = 0.08,
		XP = 20,
		Slots = 10,
		UniformColor = Color3.fromRGB(255, 140, 20),
		UniformAccent = Color3.fromRGB(230, 230, 230),
		ShirtTemplate = "",
		PantsTemplate = "",
		Vehicle = "job_construction_truck",
		TaskTimeout = 150,
		Cooldown = 3,
		MinTaskSeconds = 8,
		InteractRadius = 14,
		Titles = { "Laborer", "Helper", "Hammer Hand", "Carpenter", "Framer", "Senior Carpenter", "Crew Lead", "Site Supervisor", "Project Lead", "Site Manager" },
		HitsPerMaterial = 4, -- hammer hits per delivered material
		HammerInterval = 0.4, -- server minimum seconds between hits
		ProgressPerHit = 1.25, -- % site progress per hit (good hits); bad hits give half
		QualityBonus = 0.3,
		SiteCompleteBonus = 2.0, -- each contributor gets BasePay * this * share-of-work when a site reaches 100%
		SiteMaxHeight = 24, -- visual height of the finished frame
		PileOffset = 18, -- materials pile distance from the site
	},
}

return Jobs
