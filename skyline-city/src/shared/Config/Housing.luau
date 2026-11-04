-- HOUSING CONFIG — homes, rent, plots, build-mode limits and the player real-estate market.
-- Change numbers here; no code changes needed.
--
-- Tier fields
--   Id / Name / Icon / Description
--   Kind          "Rent" | "Buy" | "Both"      how players can get this home from the game
--   Catalog       "House" | "Apartment"        which furniture catalog build mode uses
--                                              (Apartment = furniture & paint only, no structural walls)
--   WeeklyRent    charged once per in-game week while renting (0 = cannot rent)
--   BuyPrice      price to buy from the game (0 = cannot buy). Also the starting Value of the house.
--   PlotSize      Vector2 (X width, Y depth) in studs — the build area. Plots smaller than this are never used.
--   MaxFloors     floors a player may unlock (AddFloor); the ExtraHouse pass adds Floors.ExtraHousePassBonus
--   BaseMaxItems  item limit in build mode (VIP adds Build.VipExtraItems, extra floors add Build.ExtraItemsPerFloor)
--   District      where the world builder puts plots of this tier (informational / fallback label)
--   RequiresPass  monetization pass key needed to rent or buy (nil = everyone)
--   StarterFootprint  Vector2 (houses only): size of the free starter house shell (multiples of 8)
--   Shell         colours for the procedural shell (walls / floor / glass)

local Housing = {}

Housing.TierOrder = { "Studio", "Apartment", "Townhouse", "Suburban", "BeachVilla", "Penthouse", "Mansion", "SkyApartment" }

Housing.Tiers = {
	Studio = {
		Id = "Studio",
		Name = "Downtown Studio",
		Icon = "🛏️",
		Description = "A cosy starter studio. Cheap rent and you can never be evicted from it.",
		Kind = "Rent",
		Catalog = "Apartment",
		WeeklyRent = 150,
		BuyPrice = 0,
		PlotSize = Vector2.new(28, 24),
		MaxFloors = 1,
		BaseMaxItems = 120,
		District = "Downtown",
		Shell = {
			Wall = Color3.fromRGB(232, 226, 214),
			Floor = Color3.fromRGB(168, 128, 92),
			FloorMaterial = Enum.Material.WoodPlanks,
			Glass = 0.35,
		},
	},
	Apartment = {
		Id = "Apartment",
		Name = "City Apartment",
		Icon = "🏢",
		Description = "Two-room apartment close to work, shops and the bank.",
		Kind = "Both",
		Catalog = "Apartment",
		WeeklyRent = 900,
		BuyPrice = 85_000,
		PlotSize = Vector2.new(36, 30),
		MaxFloors = 1,
		BaseMaxItems = 220,
		District = "Downtown",
		Shell = {
			Wall = Color3.fromRGB(238, 238, 238),
			Floor = Color3.fromRGB(140, 104, 74),
			FloorMaterial = Enum.Material.WoodPlanks,
			Glass = 0.45,
		},
	},
	Townhouse = {
		Id = "Townhouse",
		Name = "Townhouse",
		Icon = "🏘️",
		Description = "Narrow and tall with a small yard. Room to build up to three floors.",
		Kind = "Both",
		Catalog = "House",
		WeeklyRent = 2_200,
		BuyPrice = 180_000,
		PlotSize = Vector2.new(40, 56),
		MaxFloors = 3,
		BaseMaxItems = 400,
		District = "Suburbs",
		StarterFootprint = Vector2.new(24, 32),
		Shell = { Wall = Color3.fromRGB(196, 120, 96), Floor = Color3.fromRGB(150, 112, 80), Glass = 0.4 },
	},
	Suburban = {
		Id = "Suburban",
		Name = "Suburban House",
		Icon = "🏡",
		Description = "Classic family home with a front lawn and a big back yard.",
		Kind = "Buy",
		Catalog = "House",
		WeeklyRent = 0,
		BuyPrice = 350_000,
		PlotSize = Vector2.new(64, 72),
		MaxFloors = 2,
		BaseMaxItems = 650,
		District = "Suburbs",
		StarterFootprint = Vector2.new(40, 32),
		Shell = { Wall = Color3.fromRGB(226, 220, 200), Floor = Color3.fromRGB(150, 112, 80), Glass = 0.4 },
	},
	BeachVilla = {
		Id = "BeachVilla",
		Name = "Beach Villa",
		Icon = "🏖️",
		Description = "Sea breeze, sand and a terrace made for parties.",
		Kind = "Buy",
		Catalog = "House",
		WeeklyRent = 0,
		BuyPrice = 900_000,
		PlotSize = Vector2.new(80, 80),
		MaxFloors = 2,
		BaseMaxItems = 900,
		District = "Beach",
		StarterFootprint = Vector2.new(48, 40),
		Shell = { Wall = Color3.fromRGB(246, 244, 236), Floor = Color3.fromRGB(214, 196, 160), Glass = 0.55 },
	},
	Penthouse = {
		Id = "Penthouse",
		Name = "Penthouse",
		Icon = "🌆",
		Description = "Top-floor duplex with floor-to-ceiling windows.",
		Kind = "Both",
		Catalog = "Apartment",
		WeeklyRent = 12_000,
		BuyPrice = 2_500_000,
		PlotSize = Vector2.new(60, 52),
		MaxFloors = 2,
		BaseMaxItems = 800,
		District = "Downtown",
		Shell = {
			Wall = Color3.fromRGB(60, 62, 70),
			Floor = Color3.fromRGB(220, 220, 224),
			FloorMaterial = Enum.Material.Marble,
			Glass = 0.8,
		},
	},
	Mansion = {
		Id = "Mansion",
		Name = "Hillside Mansion",
		Icon = "🏰",
		Description = "A gated estate with space for pools, garages and three floors of luxury.",
		Kind = "Buy",
		Catalog = "House",
		WeeklyRent = 0,
		BuyPrice = 6_000_000,
		PlotSize = Vector2.new(112, 112),
		MaxFloors = 3,
		BaseMaxItems = 1400,
		District = "Suburbs",
		StarterFootprint = Vector2.new(64, 48),
		Shell = { Wall = Color3.fromRGB(240, 236, 228), Floor = Color3.fromRGB(230, 230, 232), Glass = 0.5 },
	},
	SkyApartment = {
		Id = "SkyApartment",
		Name = "Sky Apartment",
		Icon = "🌃",
		Description = "Exclusive luxury apartment above the clouds: panoramic city views and a private elevator.",
		Kind = "Both",
		Catalog = "Apartment",
		WeeklyRent = 25_000,
		BuyPrice = 8_000_000,
		PlotSize = Vector2.new(68, 60),
		MaxFloors = 2,
		BaseMaxItems = 1200,
		District = "Downtown",
		RequiresPass = "ExclusiveApartments",
		Shell = {
			Wall = Color3.fromRGB(28, 30, 38),
			Floor = Color3.fromRGB(236, 236, 240),
			FloorMaterial = Enum.Material.Marble,
			Glass = 1, -- full glass back wall
		},
		PrivateElevator = true,
	},
}

-- Rent (per in-game week; WorldService.WeekChanged, or the fallback timer below)
Housing.Rent = {
	StartingTier = "Studio", -- new players rent this (DataTemplate.Housing.Rented)
	FallbackWeekMinutes = 24 * 7, -- real minutes per rent cycle if WorldService has no WeekChanged
	MinSessionMinutes = 5, -- players who joined less than this long ago skip this week's charge
	MissedBeforeEviction = 2, -- missed payments in a row before eviction to the never-evict tier
	NeverEvictTier = "Studio", -- this tier never evicts; missed rent accrues as debt that blocks buying
	ChargeFirstWeekOnRent = true, -- RentTier charges the first week immediately
	SenderName = "Skyline Realty", -- phone system-message sender
}

-- House slots: Base + Housing.ExtraSlots (data) + ExtraHousePassSlots if the player owns the ExtraHouse pass
Housing.Slots = {
	Base = 1,
	ExtraHousePassSlots = 1,
	MaxTotal = 10,
}

-- Buying (houses and player listings)
Housing.Purchase = {
	AllowBank = true, -- true: wallet first then bank (EconomyService:Charge). false: wallet only (TrySpend)
	PriceCategory = "House", -- EconomyService:GetPrice category for game-sold homes
}

-- Extra floors bought with Housing "AddFloor"
Housing.Floors = {
	PriceFraction = 0.15, -- cost of one extra floor = BuyPrice * this (added to the house Value)
	MinPrice = 15_000,
	ExtraHousePassBonus = 1, -- ExtraHouse pass: MaxFloors + 1
}

-- Build mode
Housing.Build = {
	FloorHeight = 12, -- studs per floor (structure walls are this tall)
	RoofAllowance = 10, -- items may stick this far above the top floor (roofs, antennas, trees)
	MaxOpsPerBatch = 200, -- most operations accepted in one PlaceBatch
	SellBackFraction = 0.7, -- Remove refunds this fraction of what was paid (starter shell items refund 0)
	VipExtraItems = 150, -- VIP owners get this many extra item slots
	ExtraItemsPerFloor = 0.25, -- each floor beyond the first adds BaseMaxItems * this
	HardItemCap = 2500, -- absolute maximum items in any context (DataStore size safety)
	SessionMaxDistance = 90, -- studs from the build area a player may be to start / continue building
	GridSizes = { 0.5, 1, 2, 4 },
	DefaultGrid = 1,
	RotateStep = 90, -- degrees per R/T press with free placement off
	FreeRotateStep = 15, -- degrees per press with free placement on (server allows 15° steps)
	VipDisplayDiscount = 0.8, -- client-only price preview for VIPs (the server price is authoritative)
	WallSegments = { 16, 8, 4 }, -- wall tool splits runs into these lengths (longest first)
	WallItems = { [16] = "wall_16", [8] = "wall_8", [4] = "wall_4" },
	CameraMaxDistance = 220,
	CameraMinDistance = 12,
	QuoteDebounce = 0.35, -- seconds between budget re-quotes while editing
}

-- Doors (server-side ProximityPrompts)
Housing.Doors = {
	PromptDistance = 8,
	AutoCloseSeconds = 6,
	OpenSeconds = 0.35,
	SwingAngle = 95,
}

-- Locked homes: players without a key found inside the plot are moved out (checked at this rate)
Housing.Boundary = {
	CheckInterval = 1, -- seconds
	EjectOffset = 8, -- studs in front of the plot
	ExtraHeight = 14, -- volume height above the top floor that still counts as "inside"
}

-- Roommates (keys) and builders
Housing.Keys = {
	MaxRoommates = 8,
	MaxBuilders = 8,
}

-- Visiting other players' homes
Housing.Visit = {
	Cooldown = 6, -- seconds between visits / go-home teleports
}

-- Names
Housing.Names = {
	MaxLength = 30,
	Default = "%s's %s", -- (player name, tier name)
}

-- Spawning
Housing.Spawn = {
	AtHomeOnJoin = true, -- first character spawn goes to your home
	AtHomeOnRespawn = false, -- later respawns use the normal city spawn
}

-- Fallback procedural plots (used when the world has no free HousePlot / ApartmentUnit of a tier).
-- Created far from the city, in rows.
Housing.Fallback = {
	HouseRowOrigin = Vector3.new(-1750, 0, 1500),
	ApartmentRowOrigin = Vector3.new(-1750, 0, 1720),
	SkyRowOrigin = Vector3.new(-1750, 0, 1940),
	SkyHeight = 260, -- Sky Apartments float this high (city views!)
	ApartmentHeight = 0,
	Gap = 28, -- studs between plots
	MaxPerRow = 20, -- start a new row after this many plots
	RowSpacing = 140, -- houses: next row towards the city; apartments: next row away from it
	GroundY = 0.1, -- top of a fallback plot pad
}

-- Player real-estate market (RealEstateService)
Housing.RealEstate = {
	AgencyFee = 0.05, -- taken from the seller on a sale
	RentAgencyFee = 0.05, -- taken from the landlord on each rent payment
	MinPriceFactor = 0.5, -- listing price must be within [Min, Max] x reference price
	MaxPriceFactor = 3,
	RentPerValuePerWeek = 0.01, -- reference weekly rent for a player listing = Value * this
	MinReferenceRent = 100,
	MaxListingsPerPlayer = 3,
}

return Housing
