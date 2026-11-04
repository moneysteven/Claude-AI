-- BUSINESSES CONFIG — every tunable number for player-owned businesses lives here.
-- Change values freely; no code changes needed.
--
-- HOW A BUSINESS EARNS (server, every General.TickSeconds while the OWNER is online and the business is OPEN)
--   customers/min = BaseCustomersPerMinute
--                   * (1 + upgrade Customers bonus)            -- Upgrades below
--                   * (1 + staff Customers bonus)              -- NPC staff + online player employees
--                   * (1 + decor bonus)                        -- placed decoration items (Decor below)
--                   * (1 + Levels.CustomersPerLevel * (Level - 1))
--                   * time-of-day factor (Traffic)  * weather factor  * event factor
--                   * price factor  = clamp(priceRatio ^ -(Elasticity / (1 + Tolerance)), PriceFactorMin, PriceFactorMax)
--                     (priceRatio = average of your price / default price over all products)
--   each customer buys one product (weighted by Weight), paying YOUR price and consuming Stock units.
--   + BaseIncomePerMinute (walk-in / background sales; needs no stock)
--   - NPC staff wages (WagePerHour per IN-GAME hour; one in-game hour = World.Time.DayLengthMinutes * 60 / 24 seconds)
--   Revenue goes into the business Vault (capped -> owners must come and collect) and is capped per real hour
--   (General.MaxPassivePerHour per business, General.MaxPassivePerHourTotal per owner) so businesses stay fair vs. jobs.
--   NOTHING is earned while the owner is offline.
--
-- Cost of goods = product Stock units * the type's StockUnitCost (paid up-front when buying stock).
-- Positions in Starter are relative to the shop building (see Shell): Anchor "Front" = Z studs inside the front
-- wall, "Back" = Z studs in front of the back wall, "Yard" = Z studs outside the front wall. X = studs from the
-- building's centre line. Step is the yaw in 15° steps: 0 = item faces the back wall, 12 = faces the street/entrance.
--
-- Real models: put a building shell in ServerStorage.Assets.Buildings named "Business_<TypeId>" (pivot = bottom
-- centre, entrance facing +Z) and it replaces the procedural walls/floor/roof starter layout.

local Businesses = {}

---------------------------------------------------------------------------
-- General
---------------------------------------------------------------------------
Businesses.General = {
	MaxPerPlayer = 2, -- businesses one player may own (no Robux bonus — keeps it fair)
	TickSeconds = 10, -- passive income tick (server, batched over all open businesses)
	MaxPassivePerHour = 22_000, -- max NPC-sales + player-work revenue one business may earn per real hour
	MaxPassivePerHourTotal = 36_000, -- same, per owner per real hour (all businesses together; survives rejoins)
	HistoryLength = 12, -- revenue bars shown in the dashboard (one per tick)
	MaxCustomersPerTick = 40, -- safety cap on simulated customers per tick
	PriceMinFactor = 0.5, -- players may price products between 0.5x ...
	PriceMaxFactor = 3.0, -- ... and 3x the default price
	PriceFactorMin = 0.12, -- demand never drops below this fraction ...
	PriceFactorMax = 1.6, -- ... nor rises above this (very cheap prices)
	UpgradeValueFraction = 0.5, -- each upgrade adds this fraction of its price to the business Value (net worth)
	StockRefundFraction = 0.5, -- selling the business refunds unsold stock at this fraction of its cost
	NameMinLength = 3,
	NameMaxLength = 32,
	CollectRequiresNearby = false, -- true = owners must stand at their lot to collect the vault
	NearLotDistance = 40, -- extra studs around the lot that count as "at your business"
	BuildModeDistance = 80, -- how close to the lot you must be to start decorating
	ShopDistance = 14, -- customers must be this close to a register to buy
	PromptDistance = 10, -- ProximityPrompt range on registers / signs
	OutOfStockWarnEvery = 120, -- seconds between "out of stock" / "vault full" reminders
	StatsDayOffsetHours = 0, -- "today" = UTC day shifted by this many hours
}

-- Lots. BusinessLot-tagged parts (Attr LotId, Size: Vector3, AllowedTypes "*" or "Restaurant,Nightclub") come from
-- the world builder. If none exist after WaitForWorld seconds, FallbackCount lots are generated in an empty area.
Businesses.Lots = {
	WaitForWorld = 10,
	FallbackCount = 7,
	FallbackOrigin = Vector3.new(560, 0, -560), -- first fallback lot centre (moved along +X if the area is busy)
	FallbackSize = Vector3.new(64, 40, 64), -- X width, Y build height (ignored), Z depth
	FallbackSpacing = 80,
	FallbackColor = Color3.fromRGB(92, 94, 102),
	EntranceSide = 1, -- +1 = the street / entrance is on the lot's +Z edge (same as house plots), -1 = -Z edge
}

-- Procedural shop building used by the free starter layout (when no real model exists).
Businesses.Shell = {
	Width = 48, -- max building width (multiple of 16), shrinks to fit small lots
	Depth = 32, -- max building depth (multiple of 16)
	WallItem = "wall_8",
	WindowItem = "wall_glass_8",
	DoorItem = "wall_door_wide_8", -- open doorway so customers can walk in
	FloorItem = "floor_16",
	RoofItem = "roof_flat_16",
	Roof = true,
}

-- Business levels come from LIFETIME revenue.
Businesses.Levels = {
	CustomersPerLevel = 0.05, -- +5% customers per level above 1
	List = {
		{ Lifetime = 0, VaultCap = 15_000, MaxStaff = 2, MaxItems = 220 },
		{ Lifetime = 25_000, VaultCap = 25_000, MaxStaff = 3, MaxItems = 260 },
		{ Lifetime = 100_000, VaultCap = 40_000, MaxStaff = 4, MaxItems = 300 },
		{ Lifetime = 300_000, VaultCap = 65_000, MaxStaff = 6, MaxItems = 360 },
		{ Lifetime = 1_000_000, VaultCap = 100_000, MaxStaff = 8, MaxItems = 420 },
	},
}

-- Decor: every placed item whose Function is in Functions (and is not Structure) adds PerItem customers, up to Max.
Businesses.Decor = {
	Functions = { Decoration = true, Plant = true, Light = true, TV = true, Seat = true, Table = true },
	PerItem = 0.01,
	Max = 0.4,
}

-- Weather / events
Businesses.WeatherFactor = { Clear = 1, Cloudy = 1, Rain = 0.85, Fog = 0.92 }
Businesses.EventFactor = 1.25 -- any active city event brings more customers
-- Per-event override (ids from Config/Events). Events not listed use EventFactor.
Businesses.EventFactorById = {
	DoublePay = 1.15, -- people are busy working
	CarMeet = 1.25,
	BeachParty = 1.35,
	Fireworks = 1.35,
	SaleWeekend = 1.5, -- shopping spree
}

---------------------------------------------------------------------------
-- NPC staff roles (also the roles player employees can be hired for)
--   HireCost      one-off $ to hire an NPC
--   WagePerHour   $ per IN-GAME hour while the business is open (paid from the vault, then the owner's wallet)
--   Customers     customers/min bonus per NPC (0.2 = +20%) — player employees count 1.5x while online
--   Tolerance     price tolerance per NPC (customers accept higher prices)
--   VaultCap      vault size bonus per NPC (fraction)
--   MaxPerBusiness  NPCs of this role per business
--   Stations      built item Functions a PLAYER employee must stand at to do a task
--   TaskRevenue   $ the business earns (into the vault) per player-employee task
--   TaskCooldown  seconds between tasks (server enforced)
--   Wage          allowed $ per task the owner may offer a player (Min..Max), Default pre-filled in the UI
---------------------------------------------------------------------------
Businesses.Roles = {
	Cook = {
		Name = "Cook", Icon = "👨‍🍳", HireCost = 2_500, WagePerHour = 14, Customers = 0.22, Tolerance = 0, VaultCap = 0,
		MaxPerBusiness = 3, Stations = { "Stove" }, TaskName = "Cook an order", TaskIcon = "🍳",
		TaskRevenue = 55, TaskCooldown = 10, Wage = { Min = 10, Max = 250, Default = 40 },
	},
	Cashier = {
		Name = "Cashier", Icon = "🧑‍💼", HireCost = 2_000, WagePerHour = 12, Customers = 0.18, Tolerance = 0.02, VaultCap = 0,
		MaxPerBusiness = 3, Stations = { "Register", "Bar" }, TaskName = "Serve a customer", TaskIcon = "💵",
		TaskRevenue = 45, TaskCooldown = 8, Wage = { Min = 10, Max = 200, Default = 35 },
	},
	Cleaner = {
		Name = "Cleaner", Icon = "🧹", HireCost = 1_200, WagePerHour = 8, Customers = 0.08, Tolerance = 0.05, VaultCap = 0,
		MaxPerBusiness = 2,
		Stations = { "Table", "Seat", "Register", "DisplayRack", "ClothingRack", "Bar", "Desk", "CarDisplay" },
		TaskName = "Clean up", TaskIcon = "🧽", TaskRevenue = 30, TaskCooldown = 8, Wage = { Min = 8, Max = 150, Default = 25 },
	},
	DJ = {
		Name = "DJ", Icon = "🎧", HireCost = 4_000, WagePerHour = 20, Customers = 0.35, Tolerance = 0.04, VaultCap = 0,
		MaxPerBusiness = 2, Stations = { "DJBooth" }, TaskName = "Spin a track", TaskIcon = "💿",
		TaskRevenue = 70, TaskCooldown = 12, Wage = { Min = 15, Max = 300, Default = 55 },
	},
	Salesperson = {
		Name = "Salesperson", Icon = "🤝", HireCost = 3_000, WagePerHour = 16, Customers = 0.25, Tolerance = 0.03, VaultCap = 0,
		MaxPerBusiness = 3, Stations = { "ClothingRack", "DisplayRack", "CarDisplay", "Desk", "Computer" },
		TaskName = "Help a customer", TaskIcon = "🗣️", TaskRevenue = 60, TaskCooldown = 10, Wage = { Min = 12, Max = 300, Default = 45 },
	},
	Security = {
		Name = "Security", Icon = "🛡️", HireCost = 2_500, WagePerHour = 14, Customers = 0.06, Tolerance = 0.02, VaultCap = 0.1,
		MaxPerBusiness = 2, Stations = { "Register", "Door", "Bar", "Desk" }, TaskName = "Patrol the floor", TaskIcon = "🔦",
		TaskRevenue = 35, TaskCooldown = 10, Wage = { Min = 10, Max = 180, Default = 30 },
	},
}
Businesses.RoleOrder = { "Cook", "Cashier", "Salesperson", "DJ", "Cleaner", "Security" }

-- Player employees
Businesses.PlayerWork = {
	MaxEmployees = 4, -- player employees per business
	TaskDistance = 10, -- studs from a matching station
	OfferExpireSeconds = 60,
	MaxTasksPerHour = 240, -- per employee (anti-farm)
	EmployeeCustomersFactor = 1.5, -- an online player employee boosts customers like 1.5 NPCs of the role
	OfferCooldown = 10, -- seconds between job offers from one owner
}

---------------------------------------------------------------------------
-- Upgrades. Effects are PER LEVEL and add up:
--   Customers (+fraction customers/min) · MaxStock (+fraction max stock) · Tolerance (price tolerance)
--   VaultCap (+fraction vault size) · Floors (+build floors) · MaxItems (+build item slots)
-- Types = nil -> every business type, otherwise a set of type ids. Price is multiplied by the type's UpgradeScale.
---------------------------------------------------------------------------
Businesses.Upgrades = {
	BiggerKitchen = {
		Name = "Bigger Kitchen", Icon = "🍳", Order = 1, Types = { Restaurant = true },
		Prices = { 8_000, 18_000, 36_000, 70_000 }, Effects = { Customers = 0.15, MaxStock = 0.15 },
		Desc = "+15% customers & +15% storage per level",
	},
	SoundSystem = {
		Name = "Sound System", Icon = "🔊", Order = 1, Types = { Nightclub = true },
		Prices = { 10_000, 24_000, 50_000, 90_000 }, Effects = { Customers = 0.18 },
		Desc = "+18% party-goers per level",
	},
	Showroom = {
		Name = "Showroom Lights", Icon = "💡", Order = 1, Types = { CarDealership = true },
		Prices = { 10_000, 24_000, 50_000, 90_000 }, Effects = { Customers = 0.18 },
		Desc = "+18% buyers per level",
	},
	FastPumps = {
		Name = "Fast Pumps", Icon = "⛽", Order = 1, Types = { GasStation = true },
		Prices = { 6_000, 14_000, 30_000, 60_000 }, Effects = { Customers = 0.18 },
		Desc = "+18% drivers per level",
	},
	DesignerLine = {
		Name = "Designer Line", Icon = "✨", Order = 1, Types = { ClothingStore = true },
		Prices = { 8_000, 18_000, 36_000, 70_000 }, Effects = { Customers = 0.1, Tolerance = 0.12 },
		Desc = "+10% shoppers & customers accept higher prices",
	},
	Network = {
		Name = "Business Network", Icon = "🌐", Order = 1, Types = { RealEstateOffice = true, Office = true },
		Prices = { 9_000, 20_000, 42_000, 80_000 }, Effects = { Customers = 0.18 },
		Desc = "+18% clients per level",
	},
	MoreStock = {
		Name = "Storage Room", Icon = "📦", Order = 2,
		Prices = { 5_000, 12_000, 25_000, 50_000 }, Effects = { MaxStock = 0.5 },
		Desc = "+50% max stock per level",
	},
	Marketing = {
		Name = "Marketing", Icon = "📣", Order = 3,
		Prices = { 6_000, 14_000, 30_000, 60_000, 110_000 }, Effects = { Customers = 0.12, Tolerance = 0.06 },
		Desc = "+12% customers per level, slightly higher price tolerance",
	},
	Decor = {
		Name = "Interior Design", Icon = "🖼️", Order = 4,
		Prices = { 4_000, 10_000, 22_000, 45_000 }, Effects = { Customers = 0.05, Tolerance = 0.1 },
		Desc = "Customers accept higher prices (+5% customers)",
	},
	Security = {
		Name = "Security System", Icon = "🛡️", Order = 5,
		Prices = { 7_000, 16_000, 34_000 }, Effects = { VaultCap = 0.25 },
		Desc = "+25% vault size per level",
	},
	ExtraFloor = {
		Name = "Extra Floor", Icon = "🏗️", Order = 6,
		Prices = { 25_000, 60_000 }, Effects = { Floors = 1, MaxItems = 80, Customers = 0.08 },
		Desc = "+1 build floor, +80 item slots, +8% customers",
	},
}

---------------------------------------------------------------------------
-- Traffic helpers (time-of-day curves). Hours are 0-24 in-game clock; ranges may wrap midnight (From > To).
---------------------------------------------------------------------------
local function traffic(base: number, night: number, nightFrom: number, nightTo: number, peaks)
	return { Base = base, Night = night, NightFrom = nightFrom, NightTo = nightTo, Peaks = peaks or {} }
end

---------------------------------------------------------------------------
-- Business types
--   LotPrice            $ to buy the lot / building (also the starting Value)
--   BaseIncomePerMinute background $ per minute while open (no stock needed)
--   BaseCustomersPerMinute / MaxCustomersPerMinute
--   Elasticity          how strongly customers react to price (higher = more sensitive)
--   StockUnitCost       $ per stock unit · BaseMaxStock · StartStock (free stock on purchase)
--   VaultScale          multiplies the level VaultCap · UpgradeScale multiplies upgrade prices
--   Required            built station Functions needed to OPEN: { Function = count }
--   StaffRoles          NPC roles this business can hire
--   ShopFunctions       built items where customers (players) can buy products
--   CustomerPath        Functions cosmetic NPC customers walk to (in order, first found of each)
--   MinLotSize          Vector2 (X, Z) smallest lot this type fits on
--   Products            { Id, Name, Icon, Price (default), Stock (units used), Weight (NPC pick weight),
--                         NpcOnly (players can't buy it), Kind = "Food"|"Drink"|"Clothing"|"Item"|"Service",
--                         Heal (Food/Drink: health restored), Inventory (Inventory item id given to player buyers) }
---------------------------------------------------------------------------
Businesses.Types = {
	Restaurant = {
		Name = "Restaurant", Icon = "🍔", Color = Color3.fromRGB(255, 140, 60), Order = 1,
		Blurb = "Cook burgers, pizza and pasta. Busy at lunch and dinner.",
		LotPrice = 60_000, BaseIncomePerMinute = 15,
		BaseCustomersPerMinute = 4, MaxCustomersPerMinute = 22, Elasticity = 1.6,
		StockUnitCost = 1, BaseMaxStock = 600, StartStock = 200,
		VaultScale = 1, UpgradeScale = 1,
		Required = { Stove = 1, Register = 1 },
		StaffRoles = { "Cook", "Cashier", "Cleaner", "Security" },
		ShopFunctions = { "Register" },
		CustomerPath = { "Register", "Table" },
		MinLotSize = Vector2.new(40, 40),
		Traffic = traffic(0.7, 0.2, 23, 6, {
			{ From = 11.5, To = 14, Mult = 1.6 },
			{ From = 18, To = 21, Mult = 1.8 },
		}),
		Products = {
			{ Id = "Burger", Name = "Burger", Icon = "🍔", Price = 18, Stock = 6, Weight = 4, Kind = "Food", Heal = 15, Inventory = "food_burger" },
			{ Id = "Pizza", Name = "Pizza Slice", Icon = "🍕", Price = 22, Stock = 8, Weight = 3, Kind = "Food", Heal = 18, Inventory = "food_pizza" },
			{ Id = "Pasta", Name = "Pasta", Icon = "🍝", Price = 20, Stock = 7, Weight = 2, Kind = "Food", Heal = 18, Inventory = "food_pasta" },
			{ Id = "Soda", Name = "Soda", Icon = "🥤", Price = 5, Stock = 1, Weight = 4, Kind = "Drink", Heal = 5, Inventory = "drink_soda" },
		},
		Starter = {
			{ Id = "biz_register", X = 0, Z = 7, Anchor = "Front", Step = 12 },
			{ Id = "biz_stove", X = -12, Z = 2, Anchor = "Back", Step = 12 },
			{ Id = "biz_dining_table", X = 14, Z = 9, Anchor = "Front", Step = 0 },
		},
	},

	ClothingStore = {
		Name = "Clothing Store", Icon = "👕", Color = Color3.fromRGB(240, 90, 160), Order = 2,
		Blurb = "Sell tees, hoodies and sneakers. Busy in the afternoon.",
		LotPrice = 85_000, BaseIncomePerMinute = 15,
		BaseCustomersPerMinute = 2.6, MaxCustomersPerMinute = 14, Elasticity = 1.4,
		StockUnitCost = 1, BaseMaxStock = 900, StartStock = 250,
		VaultScale = 1.2, UpgradeScale = 1.2,
		Required = { Register = 1, ClothingRack = 1 },
		StaffRoles = { "Cashier", "Salesperson", "Cleaner", "Security" },
		ShopFunctions = { "Register" },
		CustomerPath = { "ClothingRack", "DisplayRack", "Register" },
		MinLotSize = Vector2.new(40, 40),
		Traffic = traffic(0.8, 0.15, 22, 8, {
			{ From = 12, To = 17, Mult = 1.5 },
			{ From = 18, To = 20, Mult = 1.2 },
		}),
		Products = {
			{ Id = "TShirt", Name = "Graphic Tee", Icon = "👕", Price = 35, Stock = 12, Weight = 4, Kind = "Clothing", Inventory = "biz_tshirt" },
			{ Id = "Hoodie", Name = "Hoodie", Icon = "🧥", Price = 60, Stock = 20, Weight = 3, Kind = "Clothing", Inventory = "biz_hoodie" },
			{ Id = "Sneakers", Name = "Sneakers", Icon = "👟", Price = 90, Stock = 32, Weight = 2, Kind = "Clothing", Inventory = "biz_sneakers" },
			{ Id = "Cap", Name = "Cap", Icon = "🧢", Price = 25, Stock = 8, Weight = 3, Kind = "Clothing", Inventory = "biz_cap" },
		},
		Starter = {
			{ Id = "biz_checkout", X = 0, Z = 7, Anchor = "Front", Step = 12 },
			{ Id = "biz_clothing_rack", X = -12, Z = 2, Anchor = "Back", Step = 12 },
			{ Id = "biz_clothing_rack", X = 12, Z = 2, Anchor = "Back", Step = 12 },
		},
	},

	CarDealership = {
		Name = "Car Dealership", Icon = "🚘", Color = Color3.fromRGB(80, 170, 255), Order = 3,
		Blurb = "Earn commission on every car sold to city buyers.",
		LotPrice = 400_000, BaseIncomePerMinute = 40,
		BaseCustomersPerMinute = 0.35, MaxCustomersPerMinute = 2.5, Elasticity = 1.2,
		StockUnitCost = 50, BaseMaxStock = 120, StartStock = 30,
		VaultScale = 3, UpgradeScale = 4,
		Required = { CarDisplay = 1, Desk = 1 },
		StaffRoles = { "Salesperson", "Cashier", "Cleaner", "Security" },
		ShopFunctions = { "Register", "Desk" },
		CustomerPath = { "CarDisplay", "Desk" },
		MinLotSize = Vector2.new(56, 56),
		Traffic = traffic(0.9, 0.1, 21, 8, {
			{ From = 10, To = 13, Mult = 1.3 },
			{ From = 15, To = 19, Mult = 1.5 },
		}),
		Products = {
			-- NPC car sales: price = your commission, Stock = paperwork/prep units
			{ Id = "CompactSale", Name = "Compact Sale Commission", Icon = "🚗", Price = 900, Stock = 6, Weight = 4, NpcOnly = true, Kind = "Service" },
			{ Id = "LuxurySale", Name = "Luxury Sale Commission", Icon = "🏎️", Price = 2_400, Stock = 18, Weight = 1, NpcOnly = true, Kind = "Service" },
			{ Id = "Detailing", Name = "Detailing Package", Icon = "🧽", Price = 150, Stock = 0, Weight = 2, Kind = "Service" },
			{ Id = "AirFreshener", Name = "Air Freshener", Icon = "🌲", Price = 12, Stock = 0, Weight = 2, Kind = "Item", Inventory = "biz_air_freshener" },
		},
		Starter = {
			{ Id = "biz_desk", X = 0, Z = 8, Anchor = "Front", Step = 12 },
			{ Id = "biz_computer", X = 0, Z = 8.4, Anchor = "Front", Step = 12, Y = 3 },
			{ Id = "biz_car_display", X = 14, Z = 11, Anchor = "Yard", Step = 6 },
		},
	},

	RealEstateOffice = {
		Name = "Real Estate Office", Icon = "🏢", Color = Color3.fromRGB(120, 210, 140), Order = 4,
		Blurb = "Earn listing commissions from city home sales.",
		LotPrice = 150_000, BaseIncomePerMinute = 25,
		BaseCustomersPerMinute = 0.5, MaxCustomersPerMinute = 3.5, Elasticity = 1.3,
		StockUnitCost = 20, BaseMaxStock = 150, StartStock = 40,
		VaultScale = 2, UpgradeScale = 2,
		Required = { Desk = 1, Computer = 1 },
		StaffRoles = { "Salesperson", "Cashier", "Cleaner", "Security" },
		ShopFunctions = { "Desk", "Register" },
		CustomerPath = { "Desk" },
		MinLotSize = Vector2.new(40, 40),
		Traffic = traffic(0.8, 0.1, 20, 8, {
			{ From = 9, To = 12, Mult = 1.3 },
			{ From = 13, To = 18, Mult = 1.4 },
		}),
		Products = {
			-- Stock = "leads" bought from the listings board
			{ Id = "ListingCommission", Name = "Listing Commission", Icon = "🏡", Price = 650, Stock = 8, Weight = 2, NpcOnly = true, Kind = "Service" },
			{ Id = "RentalCommission", Name = "Rental Commission", Icon = "🔑", Price = 280, Stock = 3, Weight = 3, NpcOnly = true, Kind = "Service" },
			{ Id = "Valuation", Name = "Home Valuation", Icon = "📋", Price = 60, Stock = 0, Weight = 1, Kind = "Service" },
			{ Id = "CityGuide", Name = "Neighborhood Guide", Icon = "🗺️", Price = 10, Stock = 0, Weight = 1, Kind = "Item", Inventory = "biz_city_guide" },
		},
		Starter = {
			{ Id = "biz_desk", X = 0, Z = 8, Anchor = "Front", Step = 12 },
			{ Id = "biz_computer", X = 0, Z = 8.4, Anchor = "Front", Step = 12, Y = 3 },
		},
	},

	GasStation = {
		Name = "Gas Station", Icon = "⛽", Color = Color3.fromRGB(255, 90, 80), Order = 5,
		Blurb = "Fuel margins and snacks. Steady customers all day.",
		LotPrice = 50_000, BaseIncomePerMinute = 12,
		BaseCustomersPerMinute = 5, MaxCustomersPerMinute = 24, Elasticity = 1.8,
		StockUnitCost = 1, BaseMaxStock = 800, StartStock = 300,
		VaultScale = 1, UpgradeScale = 0.9,
		Required = { Register = 1, DisplayRack = 1 },
		StaffRoles = { "Cashier", "Cleaner", "Security" },
		ShopFunctions = { "Register" },
		CustomerPath = { "DisplayRack", "Register" },
		MinLotSize = Vector2.new(40, 40),
		Traffic = traffic(1, 0.35, 0, 5, {
			{ From = 7, To = 9.5, Mult = 1.5 },
			{ From = 16.5, To = 19, Mult = 1.5 },
		}),
		Products = {
			-- Fuel margin: price = what the driver pays you on top, Stock = fuel units you bought
			{ Id = "Fuel", Name = "Fuel Fill-up (margin)", Icon = "⛽", Price = 30, Stock = 22, Weight = 5, NpcOnly = true, Kind = "Service" },
			{ Id = "Snack", Name = "Snack Bar", Icon = "🍫", Price = 6, Stock = 2, Weight = 3, Kind = "Food", Heal = 6, Inventory = "food_snack" },
			{ Id = "EnergyDrink", Name = "Energy Drink", Icon = "🥫", Price = 5, Stock = 2, Weight = 2, Kind = "Drink", Heal = 4, Inventory = "drink_energy" },
			{ Id = "Coffee", Name = "Coffee", Icon = "☕", Price = 4, Stock = 1, Weight = 2, Kind = "Drink", Heal = 4, Inventory = "drink_coffee" },
		},
		Starter = {
			{ Id = "biz_fuel_register", X = 0, Z = 7, Anchor = "Front", Step = 12 },
			{ Id = "biz_snack_shelf", X = -12, Z = 2, Anchor = "Back", Step = 12 },
		},
	},

	Nightclub = {
		Name = "Nightclub", Icon = "🎧", Color = Color3.fromRGB(190, 90, 255), Order = 6,
		Blurb = "Entry fees and mocktails. Packed at night, quiet by day.",
		LotPrice = 180_000, BaseIncomePerMinute = 20,
		BaseCustomersPerMinute = 2.2, MaxCustomersPerMinute = 20, Elasticity = 1.5,
		StockUnitCost = 1, BaseMaxStock = 700, StartStock = 250,
		VaultScale = 1.6, UpgradeScale = 2,
		Required = { DJBooth = 1, Bar = 1 },
		StaffRoles = { "DJ", "Cashier", "Security", "Cleaner" },
		ShopFunctions = { "Bar", "Register" },
		CustomerPath = { "Bar", "DJBooth" },
		MinLotSize = Vector2.new(40, 40),
		Traffic = traffic(0.35, 2.2, 20, 3, {
			{ From = 22, To = 2, Mult = 3 },
		}),
		Products = {
			{ Id = "Entry", Name = "Entry Fee", Icon = "🎟️", Price = 20, Stock = 0, Weight = 4, Kind = "Item", Inventory = "biz_club_wristband" },
			{ Id = "Mocktail", Name = "Mocktail", Icon = "🍹", Price = 12, Stock = 3, Weight = 3, Kind = "Drink", Heal = 6, Inventory = "drink_mocktail" },
			{ Id = "Lemonade", Name = "Sparkling Lemonade", Icon = "🍋", Price = 9, Stock = 2, Weight = 2, Kind = "Drink", Heal = 5, Inventory = "drink_lemonade" },
			{ Id = "GlowStick", Name = "Glow Stick", Icon = "🪄", Price = 6, Stock = 1, Weight = 2, Kind = "Item", Inventory = "biz_glow_stick" },
		},
		Starter = {
			{ Id = "biz_bar", X = 10, Z = 2, Anchor = "Back", Step = 12 },
			{ Id = "biz_dj_booth", X = -12, Z = 2, Anchor = "Back", Step = 12 },
			{ Id = "biz_dance_tile", X = -6, Z = 12, Anchor = "Front", Step = 0 },
			{ Id = "biz_dance_tile", X = -2, Z = 12, Anchor = "Front", Step = 0 },
			{ Id = "biz_dance_tile", X = -6, Z = 16, Anchor = "Front", Step = 0 },
			{ Id = "biz_dance_tile", X = -2, Z = 16, Anchor = "Front", Step = 0 },
		},
	},

	Office = {
		Name = "Office", Icon = "💼", Color = Color3.fromRGB(120, 140, 255), Order = 7,
		Blurb = "Win business contracts during office hours.",
		LotPrice = 120_000, BaseIncomePerMinute = 25,
		BaseCustomersPerMinute = 0.6, MaxCustomersPerMinute = 4, Elasticity = 1.3,
		StockUnitCost = 20, BaseMaxStock = 150, StartStock = 40,
		VaultScale = 1.6, UpgradeScale = 1.6,
		Required = { Desk = 1, Computer = 1 },
		StaffRoles = { "Salesperson", "Cashier", "Cleaner", "Security" },
		ShopFunctions = { "Desk", "Register" },
		CustomerPath = { "Desk" },
		MinLotSize = Vector2.new(40, 40),
		Traffic = traffic(0.6, 0.05, 19, 8, {
			{ From = 9, To = 17, Mult = 1.5 },
		}),
		Products = {
			-- Stock = office supplies
			{ Id = "SmallContract", Name = "Small Contract", Icon = "📄", Price = 300, Stock = 5, Weight = 4, NpcOnly = true, Kind = "Service" },
			{ Id = "BigContract", Name = "Big Contract", Icon = "📑", Price = 900, Stock = 15, Weight = 1, NpcOnly = true, Kind = "Service" },
			{ Id = "Printing", Name = "Printing", Icon = "🖨️", Price = 10, Stock = 0, Weight = 1, Kind = "Service" },
			{ Id = "Coffee", Name = "Office Coffee", Icon = "☕", Price = 4, Stock = 0, Weight = 1, Kind = "Drink", Heal = 4, Inventory = "drink_coffee" },
		},
		Starter = {
			{ Id = "biz_desk", X = 0, Z = 8, Anchor = "Front", Step = 12 },
			{ Id = "biz_computer", X = 0, Z = 8.4, Anchor = "Front", Step = 12, Y = 3 },
		},
	},
}

Businesses.TypeOrder = { "Restaurant", "ClothingStore", "GasStation", "Nightclub", "Office", "RealEstateOffice", "CarDealership" }

-- Friendly names for station Functions shown in the UI.
Businesses.FunctionNames = {
	Stove = "🔥 Stove",
	Register = "💵 Register",
	DisplayRack = "🛍️ Display Shelf",
	ClothingRack = "👕 Clothing Rack",
	DJBooth = "🎧 DJ Booth",
	Bar = "🍹 Bar",
	Desk = "🗄️ Desk",
	Computer = "🖥️ Computer",
	CarDisplay = "🚘 Car Display",
	Table = "🍽️ Table",
	Seat = "🪑 Seat",
	Door = "🚪 Door",
}

---------------------------------------------------------------------------
-- Helper functions (shared by server and client — no need to edit)
---------------------------------------------------------------------------
-- index products by id per type
for _, t in pairs(Businesses.Types) do
	t.ProductById = {}
	for i, p in ipairs(t.Products) do
		p.Order = i
		t.ProductById[p.Id] = p
	end
	t.StaffRoleSet = {}
	for _, r in ipairs(t.StaffRoles) do
		t.StaffRoleSet[r] = true
	end
end

function Businesses.GetType(typeId: any)
	if type(typeId) ~= "string" then
		return nil
	end
	return Businesses.Types[typeId]
end

-- Upgrades that apply to a type, sorted for display.
function Businesses.UpgradesFor(typeId: string): { { Id: string, Def: any } }
	local out = {}
	for id, def in pairs(Businesses.Upgrades) do
		if def.Types == nil or def.Types[typeId] then
			table.insert(out, { Id = id, Def = def })
		end
	end
	table.sort(out, function(a, b)
		if a.Def.Order == b.Def.Order then
			return a.Id < b.Id
		end
		return a.Def.Order < b.Def.Order
	end)
	return out
end

function Businesses.UpgradeAllowed(typeId: string, upgradeId: string): boolean
	local def = Businesses.Upgrades[upgradeId]
	return def ~= nil and (def.Types == nil or def.Types[typeId] == true)
end

-- Price of buying `nextLevel` of an upgrade (nil if past max).
function Businesses.UpgradePrice(typeId: string, upgradeId: string, nextLevel: number): number?
	local def = Businesses.Upgrades[upgradeId]
	local t = Businesses.Types[typeId]
	if not def or not t then
		return nil
	end
	local base = def.Prices[nextLevel]
	if not base then
		return nil
	end
	return math.floor(base * (t.UpgradeScale or 1) + 0.5)
end

-- Level index (1..n) for a lifetime revenue.
function Businesses.LevelFor(lifetime: number): number
	local lvl = 1
	for i, l in ipairs(Businesses.Levels.List) do
		if (lifetime or 0) >= l.Lifetime then
			lvl = i
		end
	end
	return lvl
end

function Businesses.LevelInfo(level: number)
	local list = Businesses.Levels.List
	return list[math.clamp(level or 1, 1, #list)]
end

-- Allowed price range for a product.
function Businesses.PriceBounds(typeId: string, productId: string): (number?, number?)
	local t = Businesses.Types[typeId]
	local p = t and t.ProductById[productId]
	if not p then
		return nil, nil
	end
	local g = Businesses.General
	return math.max(1, math.ceil(p.Price * g.PriceMinFactor)), math.max(1, math.floor(p.Price * g.PriceMaxFactor))
end

-- Is the in-game hour inside [from, to) (wrapping midnight when from > to)?
function Businesses.InHours(clock: number, from: number, to: number): boolean
	if from <= to then
		return clock >= from and clock < to
	end
	return clock >= from or clock < to
end

-- Time-of-day traffic multiplier for a type.
function Businesses.TrafficAt(typeId: string, clock: number): number
	local t = Businesses.Types[typeId]
	local tr = t and t.Traffic
	if not tr then
		return 1
	end
	for _, p in ipairs(tr.Peaks) do
		if Businesses.InHours(clock, p.From, p.To) then
			return p.Mult
		end
	end
	if tr.NightFrom and tr.NightTo and Businesses.InHours(clock, tr.NightFrom, tr.NightTo) then
		return tr.Night
	end
	return tr.Base
end

return Businesses
