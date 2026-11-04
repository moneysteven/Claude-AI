-- CARS CONFIG — every drivable vehicle. Pure map: Cars[modelId] = definition (no settings keys in here;
-- global vehicle settings live in Config/Vehicles, brands in Config/Brands, upgrades in Config/Tuning).
-- ALL names are original parodies — never use a real brand or real model name.
--
-- Cars[modelId] = {
--   Id, Brand (Config/Brands id), Name, Class, Price ($, 0 for job vehicles), VipOnly, Hidden (not sold),
--   Seats (incl. driver), Electric, Description,
--   Features = { Sunroof, Convertible, Doors (2 | 4; scooters 0), Siren },
--   Livery = { ... }?   -- job vehicles: { Primary, Secondary, Text, TextColor, Stripe, Checker, Lightbar, RoofSign }
--   Stats = {
--     Mass (kg), Horsepower, PeakTorque (Nm), IdleRPM, RedlineRPM,
--     TorqueCurve = {{rpm, frac}, ...}   rpm normalised 0..1 of idle→redline (or absolute rpm), frac of PeakTorque
--     Gears = {...} (forward ratios, descending), ReverseGear, FinalDrive,
--     TopSpeed (mph), Drivetrain ("FWD" | "RWD" | "AWD"), BrakeForce (0..1), SteerAngle (deg),
--     SuspensionStiffness / SuspensionDamping (relative, 1 = normal), RideHeight (studs, ground → underbody),
--     SuspensionTravel (studs), Grip (1 = road car), DriftGrip (rear grip fraction with handbrake),
--     FuelCapacity (litres; EVs: kWh), FuelEconomy (L/100 km; EVs: kWh/100 km),
--     WheelRadius, Wheelbase, TrackWidth (studs; 1 stud = 0.28 m),
--   },
--   Body = {           -- procedural greybox shape for Server/Services/Vehicles/CarBuilder (studs)
--     Length, Width,
--     Height           -- body height at the beltline (ground → bottom of the side windows)
--     Clearance        -- ground → underbody
--     CabinStart       -- 0..1 from the front bumper where the windshield base sits
--     CabinLength      -- 0..1 of Length from windshield base to the bottom of the rear glass
--     CabinHeight      -- greenhouse height above the beltline (roof = Height + CabinHeight)
--     CabinInset       -- how much narrower the greenhouse is than the body on each side
--     HoodSlope        -- how much lower the nose is than the beltline
--     WindshieldRake   -- 0..1 of the cabin length taken by the sloped windshield
--     RearRake         -- 0..1 of the cabin length taken by the sloped rear glass
--     RoofStyle        -- "Sedan" | "Fastback" | "Hatch" | "SUV" | "Van" | "Cab" | "Convertible" | "Scooter"
--     Rear             -- "Trunk" | "Hatch" | "Engine" | "Bed" | "Box" | "Ladder" | "Dump" | "Tow" | "TopBox"
--     RearHeight       -- (Box / Ladder / Dump) height of the rear body above the beltline
--     Spoiler          -- default spoiler: "None" | "Lip" | "Ducktail" | "Wing" | "GT"
--     Bumper           -- "Standard" | "Sport" | "Chrome" | "Heavy"
--     Headlights       -- "Round" | "Square" | "Slim"
--     WheelWidth, DefaultColor = {R,G,B},
--     Extras = { "Scoop", "RoofRack", "SpareWheel", "BullBar", "Exhausts", "Snorkel" }
--   },
-- }
--
-- Physical plausibility: top gear x FinalDrive at RedlineRPM reaches > TopSpeed with the given WheelRadius
-- (the client powertrain also re-checks this and calibrates drag so every car really reaches TopSpeed).

-- Torque curve shapes (normalised rpm 0 = idle .. 1 = redline, fraction of PeakTorque)
local CURVE_SMALL = { { 0, 0.6 }, { 0.25, 0.8 }, { 0.5, 0.95 }, { 0.7, 1.0 }, { 0.9, 0.9 }, { 1, 0.78 } }
local CURVE_TURBO = { { 0, 0.45 }, { 0.15, 0.9 }, { 0.25, 1.0 }, { 0.6, 1.0 }, { 0.85, 0.88 }, { 1, 0.74 } }
local CURVE_V8 = { { 0, 0.7 }, { 0.2, 0.86 }, { 0.45, 1.0 }, { 0.7, 0.97 }, { 0.9, 0.88 }, { 1, 0.8 } }
local CURVE_HIGHREV = { { 0, 0.5 }, { 0.3, 0.7 }, { 0.55, 0.88 }, { 0.8, 1.0 }, { 0.95, 0.97 }, { 1, 0.9 } }
local CURVE_DIESEL = { { 0, 0.6 }, { 0.12, 0.95 }, { 0.25, 1.0 }, { 0.55, 0.95 }, { 0.8, 0.78 }, { 1, 0.6 } }
local CURVE_CLASSIC = { { 0, 0.65 }, { 0.3, 0.9 }, { 0.5, 1.0 }, { 0.75, 0.92 }, { 1, 0.75 } }
local CURVE_SCOOTER = { { 0, 0.5 }, { 0.4, 0.85 }, { 0.7, 1.0 }, { 1, 0.82 } }
local CURVE_EV = { { 0, 1.0 }, { 0.4, 1.0 }, { 0.7, 0.75 }, { 1, 0.5 } } -- informational: EVs use constant-power maths

-- Gear sets (forward ratios)
local G3_SCOOTER = { 2.4, 1.55, 1.12 }
local G4_CLASSIC = { 2.9, 1.75, 1.25, 1.0 }
local G5 = { 3.45, 1.95, 1.32, 1.02, 0.81 }
local G6 = { 3.6, 2.1, 1.45, 1.1, 0.87, 0.72 }
local G6_SPORT = { 3.3, 2.15, 1.6, 1.25, 1.0, 0.82 }
local G7_DCT = { 3.15, 2.2, 1.65, 1.3, 1.05, 0.88, 0.75 }
local G8_AUTO = { 4.7, 3.13, 2.1, 1.67, 1.29, 1.0, 0.84, 0.67 }
local G_TRUCK = { 5.8, 3.6, 2.3, 1.6, 1.2, 1.0, 0.8 }
local G_EV = { 9.0 } -- EVs: single reduction gear (resized by the powertrain from TopSpeed)

return {
	---------------------------------------------------------------------------
	-- HATCH
	---------------------------------------------------------------------------
	toyomo_pebble = {
		Id = "toyomo_pebble", Brand = "toyomo", Name = "Pebble (Used)", Class = "Hatch",
		Price = 4_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "A 20-year-old city hatch with 300,000 happy miles and one working speaker. It will never die.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 980, Horsepower = 72, PeakTorque = 110, IdleRPM = 850, RedlineRPM = 6200,
			TorqueCurve = CURVE_SMALL, Gears = G5, ReverseGear = 3.4, FinalDrive = 4.1,
			TopSpeed = 98, Drivetrain = "FWD", BrakeForce = 0.72, SteerAngle = 36,
			SuspensionStiffness = 0.85, SuspensionDamping = 0.85, RideHeight = 0.6, SuspensionTravel = 1.0,
			Grip = 0.92, DriftGrip = 0.55, FuelCapacity = 40, FuelEconomy = 5.8,
			WheelRadius = 1.05, Wheelbase = 8.6, TrackWidth = 5.0,
		},
		Body = {
			Length = 13.2, Width = 5.9, Height = 3.2, Clearance = 0.6, CabinStart = 0.3, CabinLength = 0.66,
			CabinHeight = 2.0, CabinInset = 0.3, HoodSlope = 0.5, WindshieldRake = 0.3, RearRake = 0.12,
			RoofStyle = "Hatch", Rear = "Hatch", Spoiler = "None", Bumper = "Standard", Headlights = "Square",
			WheelWidth = 0.7, DefaultColor = { 196, 186, 160 }, Extras = {},
		},
	},

	fjord_sprout = {
		Id = "fjord_sprout", Brand = "fjord", Name = "Sprout", Class = "Hatch",
		Price = 11_500, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "The first-car favourite: cheap insurance, tiny turning circle and cupholders for days.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1080, Horsepower = 98, PeakTorque = 150, IdleRPM = 800, RedlineRPM = 6400,
			TorqueCurve = CURVE_SMALL, Gears = G5, ReverseGear = 3.4, FinalDrive = 3.95,
			TopSpeed = 112, Drivetrain = "FWD", BrakeForce = 0.78, SteerAngle = 36,
			SuspensionStiffness = 0.95, SuspensionDamping = 0.95, RideHeight = 0.6, SuspensionTravel = 1.0,
			Grip = 0.98, DriftGrip = 0.55, FuelCapacity = 42, FuelEconomy = 5.5,
			WheelRadius = 1.1, Wheelbase = 8.9, TrackWidth = 5.2,
		},
		Body = {
			Length = 13.8, Width = 6.1, Height = 3.3, Clearance = 0.6, CabinStart = 0.3, CabinLength = 0.66,
			CabinHeight = 1.95, CabinInset = 0.3, HoodSlope = 0.55, WindshieldRake = 0.32, RearRake = 0.14,
			RoofStyle = "Hatch", Rear = "Hatch", Spoiler = "Lip", Bumper = "Standard", Headlights = "Slim",
			WheelWidth = 0.72, DefaultColor = { 70, 160, 90 }, Extras = {},
		},
	},

	audex_urbano = {
		Id = "audex_urbano", Brand = "audex", Name = "Urbano RS", Class = "Hatch",
		Price = 34_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "A hot hatch with all-wheel drive and a five-cylinder warble that makes every tunnel a concert.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1380, Horsepower = 290, PeakTorque = 380, IdleRPM = 850, RedlineRPM = 6800,
			TorqueCurve = CURVE_TURBO, Gears = G7_DCT, ReverseGear = 3.2, FinalDrive = 3.9,
			TopSpeed = 155, Drivetrain = "AWD", BrakeForce = 0.9, SteerAngle = 34,
			SuspensionStiffness = 1.3, SuspensionDamping = 1.25, RideHeight = 0.5, SuspensionTravel = 0.85,
			Grip = 1.12, DriftGrip = 0.58, FuelCapacity = 50, FuelEconomy = 8.6,
			WheelRadius = 1.18, Wheelbase = 9.3, TrackWidth = 5.6,
		},
		Body = {
			Length = 14.6, Width = 6.4, Height = 3.2, Clearance = 0.5, CabinStart = 0.32, CabinLength = 0.64,
			CabinHeight = 1.85, CabinInset = 0.35, HoodSlope = 0.55, WindshieldRake = 0.34, RearRake = 0.16,
			RoofStyle = "Hatch", Rear = "Hatch", Spoiler = "Lip", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 0.85, DefaultColor = { 40, 44, 52 }, Extras = { "Exhausts" },
		},
	},

	---------------------------------------------------------------------------
	-- SEDAN
	---------------------------------------------------------------------------
	kaizen_tempo = {
		Id = "kaizen_tempo", Brand = "kaizen", Name = "Hikari", Class = "Sedan",
		Price = 19_500, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "A sensible saloon with a surprisingly eager engine. Commutes on weekdays, carves on Sundays.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1320, Horsepower = 158, PeakTorque = 190, IdleRPM = 800, RedlineRPM = 6800,
			TorqueCurve = CURVE_HIGHREV, Gears = G6, ReverseGear = 3.3, FinalDrive = 4.1,
			TopSpeed = 128, Drivetrain = "FWD", BrakeForce = 0.82, SteerAngle = 34,
			SuspensionStiffness = 1.0, SuspensionDamping = 1.0, RideHeight = 0.6, SuspensionTravel = 1.0,
			Grip = 1.0, DriftGrip = 0.55, FuelCapacity = 50, FuelEconomy = 6.8,
			WheelRadius = 1.15, Wheelbase = 9.8, TrackWidth = 5.4,
		},
		Body = {
			Length = 16.0, Width = 6.3, Height = 3.3, Clearance = 0.6, CabinStart = 0.33, CabinLength = 0.43,
			CabinHeight = 1.9, CabinInset = 0.35, HoodSlope = 0.45, WindshieldRake = 0.33, RearRake = 0.3,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "None", Bumper = "Standard", Headlights = "Slim",
			WheelWidth = 0.75, DefaultColor = { 190, 196, 204 }, Extras = {},
		},
	},

	toyomo_meridian = {
		Id = "toyomo_meridian", Brand = "toyomo", Name = "Medalis Hybrid", Class = "Sedan",
		Price = 27_500, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "Every rideshare driver's dream: comfy, frugal and quieter than a library.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1520, Horsepower = 205, PeakTorque = 240, IdleRPM = 750, RedlineRPM = 6200,
			TorqueCurve = CURVE_SMALL, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.2,
			TopSpeed = 130, Drivetrain = "FWD", BrakeForce = 0.84, SteerAngle = 33,
			SuspensionStiffness = 0.9, SuspensionDamping = 1.0, RideHeight = 0.6, SuspensionTravel = 1.05,
			Grip = 1.0, DriftGrip = 0.55, FuelCapacity = 55, FuelEconomy = 4.6,
			WheelRadius = 1.2, Wheelbase = 10.2, TrackWidth = 5.6,
		},
		Body = {
			Length = 17.0, Width = 6.6, Height = 3.4, Clearance = 0.6, CabinStart = 0.32, CabinLength = 0.45,
			CabinHeight = 1.95, CabinInset = 0.35, HoodSlope = 0.45, WindshieldRake = 0.34, RearRake = 0.32,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "None", Bumper = "Standard", Headlights = "Slim",
			WheelWidth = 0.78, DefaultColor = { 230, 230, 232 }, Extras = {},
		},
	},

	bvm_velos = {
		Id = "bvm_velos", Brand = "bvm", Name = "Velos 34s", Class = "Sedan",
		Price = 54_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "The benchmark sports saloon: rear-drive balance, turbo straight-six, indicator stalk optional.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1590, Horsepower = 382, PeakTorque = 500, IdleRPM = 750, RedlineRPM = 7000,
			TorqueCurve = CURVE_TURBO, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.15,
			TopSpeed = 155, Drivetrain = "RWD", BrakeForce = 0.92, SteerAngle = 33,
			SuspensionStiffness = 1.25, SuspensionDamping = 1.2, RideHeight = 0.55, SuspensionTravel = 0.9,
			Grip = 1.1, DriftGrip = 0.5, FuelCapacity = 59, FuelEconomy = 8.4,
			WheelRadius = 1.22, Wheelbase = 10.3, TrackWidth = 5.7,
		},
		Body = {
			Length = 16.8, Width = 6.6, Height = 3.25, Clearance = 0.55, CabinStart = 0.35, CabinLength = 0.42,
			CabinHeight = 1.85, CabinInset = 0.35, HoodSlope = 0.4, WindshieldRake = 0.36, RearRake = 0.34,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "Lip", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 0.85, DefaultColor = { 30, 70, 160 }, Extras = { "Exhausts" },
		},
	},

	---------------------------------------------------------------------------
	-- COUPE
	---------------------------------------------------------------------------
	kaizen_ronin = {
		Id = "kaizen_ronin", Brand = "kaizen", Name = "Ronin GT", Class = "Coupe",
		Price = 39_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "Lightweight rear-drive coupé with a rev-happy boxer engine. Built for sideways smiles.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1290, Horsepower = 228, PeakTorque = 250, IdleRPM = 800, RedlineRPM = 7500,
			TorqueCurve = CURVE_HIGHREV, Gears = G6_SPORT, ReverseGear = 3.4, FinalDrive = 4.1,
			TopSpeed = 140, Drivetrain = "RWD", BrakeForce = 0.88, SteerAngle = 37,
			SuspensionStiffness = 1.3, SuspensionDamping = 1.2, RideHeight = 0.45, SuspensionTravel = 0.8,
			Grip = 1.05, DriftGrip = 0.45, FuelCapacity = 50, FuelEconomy = 8.2,
			WheelRadius = 1.15, Wheelbase = 9.1, TrackWidth = 5.6,
		},
		Body = {
			Length = 15.2, Width = 6.4, Height = 3.0, Clearance = 0.45, CabinStart = 0.38, CabinLength = 0.4,
			CabinHeight = 1.65, CabinInset = 0.4, HoodSlope = 0.55, WindshieldRake = 0.4, RearRake = 0.42,
			RoofStyle = "Fastback", Rear = "Trunk", Spoiler = "Ducktail", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 0.85, DefaultColor = { 230, 230, 236 }, Extras = { "Exhausts" },
		},
	},

	bvm_kestrel = {
		Id = "bvm_kestrel", Brand = "bvm", Name = "Kestrel KS Coupé", Class = "Coupe",
		Price = 78_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "Twin-turbo six, carbon roof and a gearbox that shifts before you think about it.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1650, Horsepower = 503, PeakTorque = 650, IdleRPM = 800, RedlineRPM = 7200,
			TorqueCurve = CURVE_TURBO, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.15,
			TopSpeed = 180, Drivetrain = "RWD", BrakeForce = 0.95, SteerAngle = 34,
			SuspensionStiffness = 1.45, SuspensionDamping = 1.35, RideHeight = 0.45, SuspensionTravel = 0.75,
			Grip = 1.18, DriftGrip = 0.48, FuelCapacity = 59, FuelEconomy = 10.2,
			WheelRadius = 1.25, Wheelbase = 10.2, TrackWidth = 5.9,
		},
		Body = {
			Length = 16.6, Width = 6.8, Height = 3.0, Clearance = 0.45, CabinStart = 0.38, CabinLength = 0.4,
			CabinHeight = 1.65, CabinInset = 0.42, HoodSlope = 0.5, WindshieldRake = 0.4, RearRake = 0.4,
			RoofStyle = "Fastback", Rear = "Trunk", Spoiler = "Ducktail", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 0.95, DefaultColor = { 60, 140, 200 }, Extras = { "Exhausts" },
		},
	},

	---------------------------------------------------------------------------
	-- SUV
	---------------------------------------------------------------------------
	fjord_bisonte = {
		Id = "fjord_bisonte", Brand = "fjord", Name = "Bisonte", Class = "SUV",
		Price = 38_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "The family SUV: seven cupholders, one dog cage and enough boot space for the whole beach trip.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1980, Horsepower = 250, PeakTorque = 373, IdleRPM = 750, RedlineRPM = 6300,
			TorqueCurve = CURVE_TURBO, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.4,
			TopSpeed = 124, Drivetrain = "AWD", BrakeForce = 0.8, SteerAngle = 33,
			SuspensionStiffness = 0.9, SuspensionDamping = 1.0, RideHeight = 1.0, SuspensionTravel = 1.3,
			Grip = 0.98, DriftGrip = 0.6, FuelCapacity = 70, FuelEconomy = 9.8,
			WheelRadius = 1.35, Wheelbase = 10.3, TrackWidth = 5.9,
		},
		Body = {
			Length = 17.0, Width = 6.9, Height = 4.0, Clearance = 1.0, CabinStart = 0.28, CabinLength = 0.68,
			CabinHeight = 2.1, CabinInset = 0.35, HoodSlope = 0.45, WindshieldRake = 0.24, RearRake = 0.08,
			RoofStyle = "SUV", Rear = "Hatch", Spoiler = "Lip", Bumper = "Standard", Headlights = "Square",
			WheelWidth = 0.9, DefaultColor = { 120, 30, 36 }, Extras = { "RoofRack" },
		},
	},

	audex_terra = {
		Id = "audex_terra", Brand = "audex", Name = "Terra Grande", Class = "SUV",
		Price = 79_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "A techy, all-wheel-drive SUV with ambient lighting in forty colours and a turbo V6.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2150, Horsepower = 335, PeakTorque = 500, IdleRPM = 750, RedlineRPM = 6500,
			TorqueCurve = CURVE_TURBO, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.2,
			TopSpeed = 140, Drivetrain = "AWD", BrakeForce = 0.86, SteerAngle = 32,
			SuspensionStiffness = 1.05, SuspensionDamping = 1.1, RideHeight = 0.95, SuspensionTravel = 1.2,
			Grip = 1.04, DriftGrip = 0.6, FuelCapacity = 85, FuelEconomy = 10.6,
			WheelRadius = 1.4, Wheelbase = 10.7, TrackWidth = 6.0,
		},
		Body = {
			Length = 17.6, Width = 7.0, Height = 3.95, Clearance = 0.95, CabinStart = 0.3, CabinLength = 0.66,
			CabinHeight = 2.0, CabinInset = 0.4, HoodSlope = 0.45, WindshieldRake = 0.27, RearRake = 0.14,
			RoofStyle = "SUV", Rear = "Hatch", Spoiler = "Lip", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 0.95, DefaultColor = { 60, 64, 72 }, Extras = {},
		},
	},

	rangel_sovereign = {
		Id = "rangel_sovereign", Brand = "rangel", Name = "Highcastle LWB", Class = "SUV",
		Price = 145_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "Ascend to the moors in heated massage seats. Air suspension, V8, and a picnic hamper fridge.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2550, Horsepower = 523, PeakTorque = 750, IdleRPM = 700, RedlineRPM = 6200,
			TorqueCurve = CURVE_V8, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.3,
			TopSpeed = 155, Drivetrain = "AWD", BrakeForce = 0.88, SteerAngle = 32,
			SuspensionStiffness = 0.95, SuspensionDamping = 1.15, RideHeight = 1.05, SuspensionTravel = 1.4,
			Grip = 1.02, DriftGrip = 0.62, FuelCapacity = 90, FuelEconomy = 13.0,
			WheelRadius = 1.45, Wheelbase = 11.6, TrackWidth = 6.1,
		},
		Body = {
			Length = 18.6, Width = 7.1, Height = 4.2, Clearance = 1.05, CabinStart = 0.27, CabinLength = 0.69,
			CabinHeight = 2.2, CabinInset = 0.3, HoodSlope = 0.3, WindshieldRake = 0.22, RearRake = 0.07,
			RoofStyle = "SUV", Rear = "Hatch", Spoiler = "None", Bumper = "Chrome", Headlights = "Slim",
			WheelWidth = 0.95, DefaultColor = { 24, 50, 40 }, Extras = {},
		},
	},

	---------------------------------------------------------------------------
	-- PICKUP
	---------------------------------------------------------------------------
	fjord_hauler = {
		Id = "fjord_hauler", Brand = "fjord", Name = "Hauler 250", Class = "Pickup",
		Price = 44_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "America-sized pickup with a bed big enough for a sofa, a jet ski or your entire friend group.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2300, Horsepower = 325, PeakTorque = 542, IdleRPM = 700, RedlineRPM = 6000,
			TorqueCurve = CURVE_V8, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.55,
			TopSpeed = 112, Drivetrain = "RWD", BrakeForce = 0.78, SteerAngle = 31,
			SuspensionStiffness = 0.85, SuspensionDamping = 0.95, RideHeight = 1.15, SuspensionTravel = 1.5,
			Grip = 0.96, DriftGrip = 0.55, FuelCapacity = 98, FuelEconomy = 13.5,
			WheelRadius = 1.45, Wheelbase = 12.6, TrackWidth = 6.1,
		},
		Body = {
			Length = 19.8, Width = 7.1, Height = 4.3, Clearance = 1.15, CabinStart = 0.3, CabinLength = 0.3,
			CabinHeight = 2.15, CabinInset = 0.3, HoodSlope = 0.25, WindshieldRake = 0.3, RearRake = 0.03,
			RoofStyle = "Cab", Rear = "Bed", Spoiler = "None", Bumper = "Chrome", Headlights = "Square",
			WheelWidth = 0.95, DefaultColor = { 30, 40, 70 }, Extras = {},
		},
	},

	stallion_brute = {
		Id = "stallion_brute", Brand = "stallion", Name = "Brute HD Diesel", Class = "Pickup",
		Price = 62_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "Heavy-duty diesel truck that can tow a house. Rumbles politely at traffic lights. Sometimes.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2900, Horsepower = 400, PeakTorque = 1100, IdleRPM = 650, RedlineRPM = 4200,
			TorqueCurve = CURVE_DIESEL, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.42,
			TopSpeed = 105, Drivetrain = "AWD", BrakeForce = 0.78, SteerAngle = 30,
			SuspensionStiffness = 1.0, SuspensionDamping = 1.0, RideHeight = 1.35, SuspensionTravel = 1.6,
			Grip = 0.98, DriftGrip = 0.6, FuelCapacity = 120, FuelEconomy = 14.5,
			WheelRadius = 1.6, Wheelbase = 13.4, TrackWidth = 6.4,
		},
		Body = {
			Length = 21.0, Width = 7.4, Height = 4.7, Clearance = 1.35, CabinStart = 0.3, CabinLength = 0.3,
			CabinHeight = 2.2, CabinInset = 0.3, HoodSlope = 0.15, WindshieldRake = 0.26, RearRake = 0.03,
			RoofStyle = "Cab", Rear = "Bed", Spoiler = "None", Bumper = "Heavy", Headlights = "Square",
			WheelWidth = 1.05, DefaultColor = { 150, 20, 24 }, Extras = { "BullBar" },
		},
	},

	---------------------------------------------------------------------------
	-- VAN
	---------------------------------------------------------------------------
	toyomo_wanderer = {
		Id = "toyomo_wanderer", Brand = "toyomo", Name = "Roamly", Class = "Van",
		Price = 34_000, VipOnly = false, Hidden = false, Seats = 7, Electric = false,
		Description = "Sliding doors, three rows and a fold-flat everything. The school-run champion.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1990, Horsepower = 245, PeakTorque = 324, IdleRPM = 700, RedlineRPM = 6400,
			TorqueCurve = CURVE_SMALL, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.3,
			TopSpeed = 115, Drivetrain = "FWD", BrakeForce = 0.78, SteerAngle = 33,
			SuspensionStiffness = 0.85, SuspensionDamping = 0.95, RideHeight = 0.75, SuspensionTravel = 1.15,
			Grip = 0.95, DriftGrip = 0.6, FuelCapacity = 68, FuelEconomy = 9.0,
			WheelRadius = 1.28, Wheelbase = 10.9, TrackWidth = 6.0,
		},
		Body = {
			Length = 18.0, Width = 7.0, Height = 3.8, Clearance = 0.75, CabinStart = 0.22, CabinLength = 0.76,
			CabinHeight = 2.5, CabinInset = 0.3, HoodSlope = 0.6, WindshieldRake = 0.2, RearRake = 0.05,
			RoofStyle = "Van", Rear = "Hatch", Spoiler = "None", Bumper = "Standard", Headlights = "Slim",
			WheelWidth = 0.85, DefaultColor = { 140, 150, 160 }, Extras = {},
		},
	},

	fjord_workhorse = {
		Id = "fjord_workhorse", Brand = "fjord", Name = "Packmule Cargo", Class = "Van",
		Price = 41_000, VipOnly = false, Hidden = false, Seats = 3, Electric = false,
		Description = "The tradesperson's best mate: tall roof, huge load bay and a ladder rack.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 2250, Horsepower = 170, PeakTorque = 415, IdleRPM = 700, RedlineRPM = 4600,
			TorqueCurve = CURVE_DIESEL, Gears = G6, ReverseGear = 3.4, FinalDrive = 3.6,
			TopSpeed = 98, Drivetrain = "RWD", BrakeForce = 0.75, SteerAngle = 32,
			SuspensionStiffness = 1.0, SuspensionDamping = 1.0, RideHeight = 0.85, SuspensionTravel = 1.2,
			Grip = 0.92, DriftGrip = 0.6, FuelCapacity = 80, FuelEconomy = 9.5,
			WheelRadius = 1.3, Wheelbase = 12.4, TrackWidth = 6.1,
		},
		Body = {
			Length = 19.8, Width = 7.2, Height = 4.1, Clearance = 0.85, CabinStart = 0.18, CabinLength = 0.8,
			CabinHeight = 3.3, CabinInset = 0.2, HoodSlope = 0.7, WindshieldRake = 0.14, RearRake = 0.02,
			RoofStyle = "Van", Rear = "Hatch", Spoiler = "None", Bumper = "Heavy", Headlights = "Square",
			WheelWidth = 0.9, DefaultColor = { 236, 236, 236 }, Extras = { "RoofRack" },
		},
	},

	---------------------------------------------------------------------------
	-- SUPERCAR
	---------------------------------------------------------------------------
	porza_vento = {
		Id = "porza_vento", Brand = "porza", Name = "Ventisca Track", Class = "Supercar",
		Price = 245_000, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "A rear-engined track weapon that's somehow comfy enough for the school run. Somehow.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1450, Horsepower = 502, PeakTorque = 470, IdleRPM = 900, RedlineRPM = 9000,
			TorqueCurve = CURVE_HIGHREV, Gears = G7_DCT, ReverseGear = 3.2, FinalDrive = 3.9,
			TopSpeed = 197, Drivetrain = "RWD", BrakeForce = 1.0, SteerAngle = 33,
			SuspensionStiffness = 1.7, SuspensionDamping = 1.5, RideHeight = 0.4, SuspensionTravel = 0.6,
			Grip = 1.3, DriftGrip = 0.5, FuelCapacity = 64, FuelEconomy = 13.0,
			WheelRadius = 1.25, Wheelbase = 8.8, TrackWidth = 5.8,
		},
		Body = {
			Length = 16.0, Width = 6.8, Height = 2.8, Clearance = 0.4, CabinStart = 0.36, CabinLength = 0.38,
			CabinHeight = 1.5, CabinInset = 0.45, HoodSlope = 0.65, WindshieldRake = 0.42, RearRake = 0.46,
			RoofStyle = "Fastback", Rear = "Engine", Spoiler = "Wing", Bumper = "Sport", Headlights = "Round",
			WheelWidth = 1.0, DefaultColor = { 230, 230, 230 }, Extras = { "Exhausts" },
		},
	},

	mercato_ardente = {
		Id = "mercato_ardente", Brand = "mercato", Name = "Ardente Nero Corsa", Class = "Supercar",
		Price = 320_000, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "The gentleman's supercar with a hand-built biturbo V8 and a very ungentlemanly exhaust.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1560, Horsepower = 720, PeakTorque = 800, IdleRPM = 850, RedlineRPM = 7200,
			TorqueCurve = CURVE_TURBO, Gears = G7_DCT, ReverseGear = 3.2, FinalDrive = 3.45,
			TopSpeed = 202, Drivetrain = "RWD", BrakeForce = 1.0, SteerAngle = 32,
			SuspensionStiffness = 1.65, SuspensionDamping = 1.5, RideHeight = 0.4, SuspensionTravel = 0.6,
			Grip = 1.3, DriftGrip = 0.48, FuelCapacity = 70, FuelEconomy = 14.5,
			WheelRadius = 1.3, Wheelbase = 9.6, TrackWidth = 6.0,
		},
		Body = {
			Length = 16.6, Width = 7.0, Height = 2.85, Clearance = 0.4, CabinStart = 0.46, CabinLength = 0.32,
			CabinHeight = 1.45, CabinInset = 0.5, HoodSlope = 0.55, WindshieldRake = 0.45, RearRake = 0.5,
			RoofStyle = "Fastback", Rear = "Trunk", Spoiler = "GT", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 1.05, DefaultColor = { 20, 20, 24 }, Extras = { "Exhausts", "Scoop" },
		},
	},

	lambrino_furia = {
		Id = "lambrino_furia", Brand = "lambrino", Name = "Furia V10", Class = "Supercar",
		Price = 425_000, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "Wedge-shaped, ten-cylinder, all-wheel-drive fury. Every pedestrian films you.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1520, Horsepower = 631, PeakTorque = 600, IdleRPM = 900, RedlineRPM = 8700,
			TorqueCurve = CURVE_HIGHREV, Gears = G7_DCT, ReverseGear = 3.2, FinalDrive = 3.6,
			TopSpeed = 205, Drivetrain = "AWD", BrakeForce = 1.0, SteerAngle = 32,
			SuspensionStiffness = 1.7, SuspensionDamping = 1.55, RideHeight = 0.38, SuspensionTravel = 0.55,
			Grip = 1.34, DriftGrip = 0.5, FuelCapacity = 83, FuelEconomy = 15.5,
			WheelRadius = 1.3, Wheelbase = 9.4, TrackWidth = 6.1,
		},
		Body = {
			Length = 16.2, Width = 7.2, Height = 2.65, Clearance = 0.38, CabinStart = 0.34, CabinLength = 0.36,
			CabinHeight = 1.4, CabinInset = 0.55, HoodSlope = 0.85, WindshieldRake = 0.5, RearRake = 0.5,
			RoofStyle = "Fastback", Rear = "Engine", Spoiler = "Lip", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 1.1, DefaultColor = { 140, 200, 40 }, Extras = { "Exhausts" },
		},
	},

	---------------------------------------------------------------------------
	-- HYPERCAR
	---------------------------------------------------------------------------
	valkyr_aurora = {
		Id = "valkyr_aurora", Brand = "valkyr", Name = "Aurelion", Class = "Hypercar",
		Price = 1_850_000, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "Carbon tub, twin-turbo V8, active aero and a top speed that makes airliners nervous.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1420, Horsepower = 1280, PeakTorque = 1300, IdleRPM = 950, RedlineRPM = 8500,
			TorqueCurve = CURVE_TURBO, Gears = G7_DCT, ReverseGear = 3.1, FinalDrive = 3.0,
			TopSpeed = 235, Drivetrain = "RWD", BrakeForce = 1.0, SteerAngle = 30,
			SuspensionStiffness = 1.9, SuspensionDamping = 1.7, RideHeight = 0.35, SuspensionTravel = 0.5,
			Grip = 1.42, DriftGrip = 0.5, FuelCapacity = 72, FuelEconomy = 21.0,
			WheelRadius = 1.3, Wheelbase = 9.6, TrackWidth = 6.1,
		},
		Body = {
			Length = 16.4, Width = 7.2, Height = 2.6, Clearance = 0.35, CabinStart = 0.36, CabinLength = 0.36,
			CabinHeight = 1.4, CabinInset = 0.6, HoodSlope = 0.8, WindshieldRake = 0.5, RearRake = 0.5,
			RoofStyle = "Fastback", Rear = "Engine", Spoiler = "GT", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 1.15, DefaultColor = { 255, 255, 255 }, Extras = { "Exhausts", "Scoop" },
		},
	},

	lambrino_tempesta = {
		Id = "lambrino_tempesta", Brand = "lambrino", Name = "Tempesta Ibrida", Class = "Hypercar",
		Price = 2_400_000, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "A V12 hybrid with three electric motors and scissor doors. Thunder, then silence, then thunder.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1550, Horsepower = 1001, PeakTorque = 900, IdleRPM = 1000, RedlineRPM = 9500,
			TorqueCurve = CURVE_HIGHREV, Gears = G7_DCT, ReverseGear = 3.1, FinalDrive = 3.3,
			TopSpeed = 220, Drivetrain = "AWD", BrakeForce = 1.0, SteerAngle = 30,
			SuspensionStiffness = 1.85, SuspensionDamping = 1.65, RideHeight = 0.35, SuspensionTravel = 0.5,
			Grip = 1.4, DriftGrip = 0.5, FuelCapacity = 85, FuelEconomy = 18.0,
			WheelRadius = 1.32, Wheelbase = 9.8, TrackWidth = 6.2,
		},
		Body = {
			Length = 17.0, Width = 7.3, Height = 2.6, Clearance = 0.35, CabinStart = 0.33, CabinLength = 0.38,
			CabinHeight = 1.35, CabinInset = 0.6, HoodSlope = 0.85, WindshieldRake = 0.52, RearRake = 0.48,
			RoofStyle = "Fastback", Rear = "Engine", Spoiler = "Wing", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 1.15, DefaultColor = { 255, 120, 20 }, Extras = { "Exhausts", "Scoop" },
		},
	},

	valkyr_ragnarok = {
		Id = "valkyr_ragnarok", Brand = "valkyr", Name = "Ragnarök R", Class = "Hypercar",
		Price = 3_000_000, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "The fastest thing in Skyline City that isn't a rumour. 1,600 hp. Bring your own courage.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1380, Horsepower = 1600, PeakTorque = 1500, IdleRPM = 1000, RedlineRPM = 8800,
			TorqueCurve = CURVE_TURBO, Gears = G7_DCT, ReverseGear = 3.1, FinalDrive = 2.9,
			TopSpeed = 245, Drivetrain = "AWD", BrakeForce = 1.0, SteerAngle = 29,
			SuspensionStiffness = 2.0, SuspensionDamping = 1.8, RideHeight = 0.32, SuspensionTravel = 0.45,
			Grip = 1.45, DriftGrip = 0.5, FuelCapacity = 80, FuelEconomy = 24.0,
			WheelRadius = 1.32, Wheelbase = 9.7, TrackWidth = 6.2,
		},
		Body = {
			Length = 16.8, Width = 7.4, Height = 2.55, Clearance = 0.32, CabinStart = 0.35, CabinLength = 0.37,
			CabinHeight = 1.35, CabinInset = 0.65, HoodSlope = 0.85, WindshieldRake = 0.52, RearRake = 0.5,
			RoofStyle = "Fastback", Rear = "Engine", Spoiler = "GT", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 1.2, DefaultColor = { 20, 24, 40 }, Extras = { "Exhausts", "Scoop" },
		},
	},

	---------------------------------------------------------------------------
	-- EV
	---------------------------------------------------------------------------
	nordvik_polar = {
		Id = "nordvik_polar", Brand = "nordvik", Name = "Polar 2", Class = "EV",
		Price = 31_000, VipOnly = false, Hidden = false, Seats = 5, Electric = true,
		Description = "A calm, minimalist electric hatch with a heat pump, a wool interior and a 400 km range.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1700, Horsepower = 228, PeakTorque = 330, IdleRPM = 500, RedlineRPM = 13000,
			TorqueCurve = CURVE_EV, Gears = G_EV, ReverseGear = 9.0, FinalDrive = 1.0,
			TopSpeed = 112, Drivetrain = "FWD", BrakeForce = 0.84, SteerAngle = 35,
			SuspensionStiffness = 1.0, SuspensionDamping = 1.0, RideHeight = 0.6, SuspensionTravel = 1.0,
			Grip = 1.0, DriftGrip = 0.58, FuelCapacity = 64, FuelEconomy = 16.0,
			WheelRadius = 1.2, Wheelbase = 9.7, TrackWidth = 5.6,
		},
		Body = {
			Length = 14.8, Width = 6.4, Height = 3.4, Clearance = 0.6, CabinStart = 0.28, CabinLength = 0.68,
			CabinHeight = 1.95, CabinInset = 0.3, HoodSlope = 0.6, WindshieldRake = 0.34, RearRake = 0.16,
			RoofStyle = "Hatch", Rear = "Hatch", Spoiler = "None", Bumper = "Standard", Headlights = "Slim",
			WheelWidth = 0.78, DefaultColor = { 200, 220, 230 }, Extras = {},
		},
	},

	teslo_arc = {
		Id = "teslo_arc", Brand = "teslo", Name = "Arc Extended Range", Class = "EV",
		Price = 49_000, VipOnly = false, Hidden = false, Seats = 5, Electric = true,
		Description = "The electric saloon that made everyone's uncle an EV evangelist. Glass roof, one giant screen.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 1830, Horsepower = 394, PeakTorque = 510, IdleRPM = 500, RedlineRPM = 15000,
			TorqueCurve = CURVE_EV, Gears = G_EV, ReverseGear = 9.0, FinalDrive = 1.0,
			TopSpeed = 145, Drivetrain = "AWD", BrakeForce = 0.9, SteerAngle = 34,
			SuspensionStiffness = 1.15, SuspensionDamping = 1.1, RideHeight = 0.55, SuspensionTravel = 0.95,
			Grip = 1.08, DriftGrip = 0.55, FuelCapacity = 82, FuelEconomy = 15.0,
			WheelRadius = 1.22, Wheelbase = 10.4, TrackWidth = 5.7,
		},
		Body = {
			Length = 16.8, Width = 6.6, Height = 3.2, Clearance = 0.55, CabinStart = 0.32, CabinLength = 0.48,
			CabinHeight = 1.95, CabinInset = 0.4, HoodSlope = 0.75, WindshieldRake = 0.4, RearRake = 0.42,
			RoofStyle = "Fastback", Rear = "Trunk", Spoiler = "Lip", Bumper = "Standard", Headlights = "Slim",
			WheelWidth = 0.85, DefaultColor = { 200, 30, 40 }, Extras = {},
		},
	},

	teslo_prism = {
		Id = "teslo_prism", Brand = "teslo", Name = "Prism Dual Motor", Class = "EV",
		Price = 82_000, VipOnly = false, Hidden = false, Seats = 5, Electric = true,
		Description = "An electric SUV with falcon-ish doors, a frunk and launch mode for the school car park.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2300, Horsepower = 534, PeakTorque = 750, IdleRPM = 500, RedlineRPM = 15000,
			TorqueCurve = CURVE_EV, Gears = G_EV, ReverseGear = 9.0, FinalDrive = 1.0,
			TopSpeed = 149, Drivetrain = "AWD", BrakeForce = 0.9, SteerAngle = 33,
			SuspensionStiffness = 1.05, SuspensionDamping = 1.1, RideHeight = 0.8, SuspensionTravel = 1.15,
			Grip = 1.06, DriftGrip = 0.58, FuelCapacity = 100, FuelEconomy = 19.0,
			WheelRadius = 1.35, Wheelbase = 10.6, TrackWidth = 6.0,
		},
		Body = {
			Length = 17.6, Width = 7.1, Height = 3.7, Clearance = 0.8, CabinStart = 0.3, CabinLength = 0.62,
			CabinHeight = 2.1, CabinInset = 0.4, HoodSlope = 0.75, WindshieldRake = 0.34, RearRake = 0.26,
			RoofStyle = "SUV", Rear = "Hatch", Spoiler = "Lip", Bumper = "Standard", Headlights = "Slim",
			WheelWidth = 0.95, DefaultColor = { 245, 245, 245 }, Extras = {},
		},
	},

	teslo_zenith = {
		Id = "teslo_zenith", Brand = "teslo", Name = "Zenith Apex", Class = "EV",
		Price = 138_000, VipOnly = false, Hidden = false, Seats = 5, Electric = true,
		Description = "A tri-motor family saloon that out-launches hypercars. The kids love it. Insurers less so.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2160, Horsepower = 1020, PeakTorque = 1420, IdleRPM = 500, RedlineRPM = 16000,
			TorqueCurve = CURVE_EV, Gears = G_EV, ReverseGear = 9.0, FinalDrive = 1.0,
			TopSpeed = 200, Drivetrain = "AWD", BrakeForce = 0.98, SteerAngle = 33,
			SuspensionStiffness = 1.3, SuspensionDamping = 1.3, RideHeight = 0.5, SuspensionTravel = 0.85,
			Grip = 1.2, DriftGrip = 0.55, FuelCapacity = 100, FuelEconomy = 18.0,
			WheelRadius = 1.28, Wheelbase = 10.8, TrackWidth = 5.9,
		},
		Body = {
			Length = 17.6, Width = 6.9, Height = 3.15, Clearance = 0.5, CabinStart = 0.33, CabinLength = 0.5,
			CabinHeight = 1.85, CabinInset = 0.42, HoodSlope = 0.8, WindshieldRake = 0.42, RearRake = 0.45,
			RoofStyle = "Fastback", Rear = "Trunk", Spoiler = "Lip", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 0.95, DefaultColor = { 30, 34, 44 }, Extras = {},
		},
	},

	---------------------------------------------------------------------------
	-- CLASSIC
	---------------------------------------------------------------------------
	bvm_alpenwagen = {
		Id = "bvm_alpenwagen", Brand = "bvm", Name = "Alpenwagen '72", Class = "Classic",
		Price = 48_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "The little boxy saloon that started the sports-saloon craze. Chrome bumpers, zero cupholders.",
		Features = { Sunroof = true, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1050, Horsepower = 130, PeakTorque = 180, IdleRPM = 850, RedlineRPM = 6400,
			TorqueCurve = CURVE_CLASSIC, Gears = G4_CLASSIC, ReverseGear = 3.6, FinalDrive = 3.45,
			TopSpeed = 116, Drivetrain = "RWD", BrakeForce = 0.68, SteerAngle = 36,
			SuspensionStiffness = 0.85, SuspensionDamping = 0.8, RideHeight = 0.65, SuspensionTravel = 1.05,
			Grip = 0.9, DriftGrip = 0.45, FuelCapacity = 46, FuelEconomy = 9.5,
			WheelRadius = 1.08, Wheelbase = 9.0, TrackWidth = 5.0,
		},
		Body = {
			Length = 15.2, Width = 5.9, Height = 3.3, Clearance = 0.65, CabinStart = 0.36, CabinLength = 0.4,
			CabinHeight = 1.95, CabinInset = 0.25, HoodSlope = 0.15, WindshieldRake = 0.22, RearRake = 0.22,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "None", Bumper = "Chrome", Headlights = "Round",
			WheelWidth = 0.65, DefaultColor = { 230, 120, 30 }, Extras = {},
		},
	},

	stallion_thunderbolt = {
		Id = "stallion_thunderbolt", Brand = "stallion", Name = "Thunderclap '67", Class = "Classic",
		Price = 72_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "Long hood, short deck, big-block V8. The car on every bedroom poster in 1967.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1480, Horsepower = 320, PeakTorque = 560, IdleRPM = 700, RedlineRPM = 5800,
			TorqueCurve = CURVE_CLASSIC, Gears = G4_CLASSIC, ReverseGear = 3.2, FinalDrive = 3.0,
			TopSpeed = 130, Drivetrain = "RWD", BrakeForce = 0.65, SteerAngle = 34,
			SuspensionStiffness = 0.8, SuspensionDamping = 0.8, RideHeight = 0.6, SuspensionTravel = 1.1,
			Grip = 0.9, DriftGrip = 0.42, FuelCapacity = 64, FuelEconomy = 17.0,
			WheelRadius = 1.15, Wheelbase = 10.2, TrackWidth = 5.6,
		},
		Body = {
			Length = 16.8, Width = 6.4, Height = 3.2, Clearance = 0.6, CabinStart = 0.44, CabinLength = 0.34,
			CabinHeight = 1.6, CabinInset = 0.35, HoodSlope = 0.25, WindshieldRake = 0.34, RearRake = 0.5,
			RoofStyle = "Fastback", Rear = "Trunk", Spoiler = "Ducktail", Bumper = "Chrome", Headlights = "Round",
			WheelWidth = 0.8, DefaultColor = { 30, 100, 60 }, Extras = { "Exhausts" },
		},
	},

	mercato_corona = {
		Id = "mercato_corona", Brand = "mercato", Name = "Coronella Gran Turismo '58", Class = "Classic",
		Price = 560_000, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "A concours-winning grand tourer from the golden age. Polished, priceless and surprisingly quick.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1300, Horsepower = 240, PeakTorque = 300, IdleRPM = 800, RedlineRPM = 6200,
			TorqueCurve = CURVE_CLASSIC, Gears = G4_CLASSIC, ReverseGear = 3.4, FinalDrive = 3.0,
			TopSpeed = 140, Drivetrain = "RWD", BrakeForce = 0.66, SteerAngle = 33,
			SuspensionStiffness = 0.9, SuspensionDamping = 0.85, RideHeight = 0.55, SuspensionTravel = 1.0,
			Grip = 0.92, DriftGrip = 0.45, FuelCapacity = 75, FuelEconomy = 15.0,
			WheelRadius = 1.15, Wheelbase = 8.6, TrackWidth = 5.2,
		},
		Body = {
			Length = 16.0, Width = 6.3, Height = 3.0, Clearance = 0.55, CabinStart = 0.46, CabinLength = 0.3,
			CabinHeight = 1.6, CabinInset = 0.45, HoodSlope = 0.5, WindshieldRake = 0.4, RearRake = 0.5,
			RoofStyle = "Fastback", Rear = "Trunk", Spoiler = "None", Bumper = "Chrome", Headlights = "Round",
			WheelWidth = 0.75, DefaultColor = { 200, 204, 210 }, Extras = {},
		},
	},

	---------------------------------------------------------------------------
	-- MUSCLE
	---------------------------------------------------------------------------
	stallion_outlaw = {
		Id = "stallion_outlaw", Brand = "stallion", Name = "Outlaw SS", Class = "Muscle",
		Price = 58_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "Modern muscle: 5.7-litre V8, live-wire throttle and a burnout button you'll press too often.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1750, Horsepower = 470, PeakTorque = 570, IdleRPM = 700, RedlineRPM = 7000,
			TorqueCurve = CURVE_V8, Gears = G6, ReverseGear = 3.3, FinalDrive = 3.55,
			TopSpeed = 165, Drivetrain = "RWD", BrakeForce = 0.88, SteerAngle = 33,
			SuspensionStiffness = 1.2, SuspensionDamping = 1.15, RideHeight = 0.5, SuspensionTravel = 0.85,
			Grip = 1.08, DriftGrip = 0.42, FuelCapacity = 61, FuelEconomy = 14.0,
			WheelRadius = 1.28, Wheelbase = 10.0, TrackWidth = 5.9,
		},
		Body = {
			Length = 17.0, Width = 6.8, Height = 3.25, Clearance = 0.5, CabinStart = 0.42, CabinLength = 0.36,
			CabinHeight = 1.6, CabinInset = 0.42, HoodSlope = 0.35, WindshieldRake = 0.38, RearRake = 0.45,
			RoofStyle = "Fastback", Rear = "Trunk", Spoiler = "Ducktail", Bumper = "Sport", Headlights = "Square",
			WheelWidth = 0.95, DefaultColor = { 255, 190, 30 }, Extras = { "Scoop", "Exhausts" },
		},
	},

	stallion_inferno = {
		Id = "stallion_inferno", Brand = "stallion", Name = "Inferno 717", Class = "Muscle",
		Price = 92_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "Supercharged, 717 horsepower and a whine you can hear three districts away.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2000, Horsepower = 717, PeakTorque = 880, IdleRPM = 750, RedlineRPM = 6400,
			TorqueCurve = CURVE_V8, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 2.62,
			TopSpeed = 196, Drivetrain = "RWD", BrakeForce = 0.92, SteerAngle = 32,
			SuspensionStiffness = 1.3, SuspensionDamping = 1.25, RideHeight = 0.5, SuspensionTravel = 0.85,
			Grip = 1.12, DriftGrip = 0.42, FuelCapacity = 70, FuelEconomy = 17.5,
			WheelRadius = 1.32, Wheelbase = 11.2, TrackWidth = 6.0,
		},
		Body = {
			Length = 18.2, Width = 6.9, Height = 3.35, Clearance = 0.5, CabinStart = 0.4, CabinLength = 0.4,
			CabinHeight = 1.7, CabinInset = 0.4, HoodSlope = 0.3, WindshieldRake = 0.34, RearRake = 0.34,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "Lip", Bumper = "Sport", Headlights = "Square",
			WheelWidth = 1.0, DefaultColor = { 110, 20, 160 }, Extras = { "Scoop", "Exhausts" },
		},
	},

	---------------------------------------------------------------------------
	-- CONVERTIBLE
	---------------------------------------------------------------------------
	kaizen_breeze = {
		Id = "kaizen_breeze", Brand = "kaizen", Name = "Kazeyo Roadster", Class = "Convertible",
		Price = 33_000, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "A tiny, perfectly balanced two-seat roadster. Roof down, coast road, sunset. That's the whole point.",
		Features = { Sunroof = false, Convertible = true, Doors = 2, Siren = false },
		Stats = {
			Mass = 1060, Horsepower = 181, PeakTorque = 205, IdleRPM = 800, RedlineRPM = 7500,
			TorqueCurve = CURVE_HIGHREV, Gears = G6_SPORT, ReverseGear = 3.4, FinalDrive = 3.9,
			TopSpeed = 135, Drivetrain = "RWD", BrakeForce = 0.86, SteerAngle = 37,
			SuspensionStiffness = 1.15, SuspensionDamping = 1.1, RideHeight = 0.45, SuspensionTravel = 0.85,
			Grip = 1.05, DriftGrip = 0.45, FuelCapacity = 45, FuelEconomy = 7.0,
			WheelRadius = 1.1, Wheelbase = 8.4, TrackWidth = 5.3,
		},
		Body = {
			Length = 14.0, Width = 6.1, Height = 3.0, Clearance = 0.45, CabinStart = 0.42, CabinLength = 0.3,
			CabinHeight = 1.65, CabinInset = 0.35, HoodSlope = 0.6, WindshieldRake = 0.3, RearRake = 0.25,
			RoofStyle = "Convertible", Rear = "Trunk", Spoiler = "None", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 0.8, DefaultColor = { 200, 20, 30 }, Extras = {},
		},
	},

	bvm_kestrel_cabrio = {
		Id = "bvm_kestrel_cabrio", Brand = "bvm", Name = "Kestrel Cabrio", Class = "Convertible",
		Price = 72_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "Four seats, a folding soft top and a straight-six soundtrack that's best enjoyed with the roof down.",
		Features = { Sunroof = false, Convertible = true, Doors = 2, Siren = false },
		Stats = {
			Mass = 1780, Horsepower = 382, PeakTorque = 500, IdleRPM = 750, RedlineRPM = 7000,
			TorqueCurve = CURVE_TURBO, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.15,
			TopSpeed = 155, Drivetrain = "RWD", BrakeForce = 0.9, SteerAngle = 33,
			SuspensionStiffness = 1.15, SuspensionDamping = 1.15, RideHeight = 0.5, SuspensionTravel = 0.9,
			Grip = 1.08, DriftGrip = 0.5, FuelCapacity = 59, FuelEconomy = 9.0,
			WheelRadius = 1.22, Wheelbase = 10.2, TrackWidth = 5.8,
		},
		Body = {
			Length = 16.4, Width = 6.6, Height = 3.1, Clearance = 0.5, CabinStart = 0.4, CabinLength = 0.38,
			CabinHeight = 1.7, CabinInset = 0.4, HoodSlope = 0.45, WindshieldRake = 0.3, RearRake = 0.3,
			RoofStyle = "Convertible", Rear = "Trunk", Spoiler = "Lip", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 0.88, DefaultColor = { 230, 230, 236 }, Extras = {},
		},
	},

	---------------------------------------------------------------------------
	-- LUXURY
	---------------------------------------------------------------------------
	mercato_aria = {
		Id = "mercato_aria", Brand = "mercato", Name = "Aria Maestoso", Class = "Luxury",
		Price = 152_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "The chauffeur's choice: reclining rear seats, champagne cooler and a cabin quieter than space.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2150, Horsepower = 496, PeakTorque = 700, IdleRPM = 650, RedlineRPM = 6300,
			TorqueCurve = CURVE_TURBO, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 2.8,
			TopSpeed = 155, Drivetrain = "AWD", BrakeForce = 0.9, SteerAngle = 32,
			SuspensionStiffness = 0.85, SuspensionDamping = 1.2, RideHeight = 0.6, SuspensionTravel = 1.15,
			Grip = 1.05, DriftGrip = 0.6, FuelCapacity = 76, FuelEconomy = 10.5,
			WheelRadius = 1.3, Wheelbase = 11.8, TrackWidth = 6.0,
		},
		Body = {
			Length = 18.6, Width = 6.9, Height = 3.5, Clearance = 0.6, CabinStart = 0.33, CabinLength = 0.45,
			CabinHeight = 2.0, CabinInset = 0.35, HoodSlope = 0.3, WindshieldRake = 0.32, RearRake = 0.3,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "None", Bumper = "Chrome", Headlights = "Slim",
			WheelWidth = 0.9, DefaultColor = { 16, 16, 20 }, Extras = {},
		},
	},

	audex_imperium = {
		Id = "audex_imperium", Brand = "audex", Name = "Imperium W12", Class = "Luxury",
		Price = 228_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "Twelve cylinders, four massage thrones and a glovebox that's bigger than some flats.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2350, Horsepower = 626, PeakTorque = 900, IdleRPM = 650, RedlineRPM = 6200,
			TorqueCurve = CURVE_TURBO, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 2.65,
			TopSpeed = 186, Drivetrain = "AWD", BrakeForce = 0.92, SteerAngle = 32,
			SuspensionStiffness = 0.95, SuspensionDamping = 1.25, RideHeight = 0.6, SuspensionTravel = 1.1,
			Grip = 1.1, DriftGrip = 0.6, FuelCapacity = 90, FuelEconomy = 13.5,
			WheelRadius = 1.35, Wheelbase = 12.2, TrackWidth = 6.1,
		},
		Body = {
			Length = 19.2, Width = 7.0, Height = 3.5, Clearance = 0.6, CabinStart = 0.32, CabinLength = 0.46,
			CabinHeight = 2.0, CabinInset = 0.38, HoodSlope = 0.35, WindshieldRake = 0.34, RearRake = 0.32,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "None", Bumper = "Chrome", Headlights = "Slim",
			WheelWidth = 0.95, DefaultColor = { 90, 94, 104 }, Extras = { "Exhausts" },
		},
	},

	---------------------------------------------------------------------------
	-- SCOOTER / MOPED
	---------------------------------------------------------------------------
	zippa_buzz = {
		Id = "zippa_buzz", Brand = "zippa", Name = "Buzz 50", Class = "Scooter",
		Price = 3_200, VipOnly = false, Hidden = false, Seats = 1, Electric = false,
		Description = "A 50cc moped that parks anywhere and sips fuel. Top speed: fun.",
		Features = { Sunroof = false, Convertible = false, Doors = 0, Siren = false },
		Stats = {
			Mass = 95, Horsepower = 5, PeakTorque = 5, IdleRPM = 1600, RedlineRPM = 8500,
			TorqueCurve = CURVE_SCOOTER, Gears = G3_SCOOTER, ReverseGear = 2.4, FinalDrive = 8.5,
			TopSpeed = 36, Drivetrain = "RWD", BrakeForce = 0.7, SteerAngle = 34,
			SuspensionStiffness = 1.0, SuspensionDamping = 1.0, RideHeight = 0.5, SuspensionTravel = 0.6,
			Grip = 0.95, DriftGrip = 0.7, FuelCapacity = 6, FuelEconomy = 2.2,
			WheelRadius = 0.75, Wheelbase = 4.6, TrackWidth = 1.2,
		},
		Body = {
			Length = 6.2, Width = 2.3, Height = 2.6, Clearance = 0.5, CabinStart = 0.2, CabinLength = 0.6,
			CabinHeight = 0, CabinInset = 0, HoodSlope = 0, WindshieldRake = 0, RearRake = 0,
			RoofStyle = "Scooter", Rear = "None", Spoiler = "None", Bumper = "Standard", Headlights = "Round",
			WheelWidth = 0.45, DefaultColor = { 120, 210, 190 }, Extras = {},
		},
	},

	zippa_corsa = {
		Id = "zippa_corsa", Brand = "zippa", Name = "Corsetta 125", Class = "Scooter",
		Price = 6_800, VipOnly = false, Hidden = false, Seats = 2, Electric = false,
		Description = "A stylish 125cc scooter with room for a passenger and a helmet under the seat.",
		Features = { Sunroof = false, Convertible = false, Doors = 0, Siren = false },
		Stats = {
			Mass = 120, Horsepower = 12, PeakTorque = 11, IdleRPM = 1500, RedlineRPM = 9000,
			TorqueCurve = CURVE_SCOOTER, Gears = G3_SCOOTER, ReverseGear = 2.4, FinalDrive = 6.6,
			TopSpeed = 58, Drivetrain = "RWD", BrakeForce = 0.75, SteerAngle = 34,
			SuspensionStiffness = 1.0, SuspensionDamping = 1.0, RideHeight = 0.5, SuspensionTravel = 0.6,
			Grip = 1.0, DriftGrip = 0.7, FuelCapacity = 8, FuelEconomy = 2.6,
			WheelRadius = 0.8, Wheelbase = 4.9, TrackWidth = 1.2,
		},
		Body = {
			Length = 6.6, Width = 2.4, Height = 2.7, Clearance = 0.5, CabinStart = 0.2, CabinLength = 0.6,
			CabinHeight = 0, CabinInset = 0, HoodSlope = 0, WindshieldRake = 0, RearRake = 0,
			RoofStyle = "Scooter", Rear = "None", Spoiler = "None", Bumper = "Standard", Headlights = "Round",
			WheelWidth = 0.5, DefaultColor = { 230, 230, 220 }, Extras = {},
		},
	},

	---------------------------------------------------------------------------
	-- OFFROAD
	---------------------------------------------------------------------------
	fjord_mudhound = {
		Id = "fjord_mudhound", Brand = "fjord", Name = "Mudhound Trail", Class = "Offroad",
		Price = 46_000, VipOnly = false, Hidden = false, Seats = 4, Electric = false,
		Description = "Removable doors, locking diffs and a snorkel. Puddles fear it.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2050, Horsepower = 285, PeakTorque = 353, IdleRPM = 700, RedlineRPM = 6400,
			TorqueCurve = CURVE_SMALL, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 4.1,
			TopSpeed = 105, Drivetrain = "AWD", BrakeForce = 0.78, SteerAngle = 34,
			SuspensionStiffness = 0.75, SuspensionDamping = 0.9, RideHeight = 1.3, SuspensionTravel = 1.9,
			Grip = 1.0, DriftGrip = 0.62, FuelCapacity = 81, FuelEconomy = 12.5,
			WheelRadius = 1.6, Wheelbase = 10.6, TrackWidth = 6.1,
		},
		Body = {
			Length = 16.0, Width = 7.0, Height = 4.4, Clearance = 1.3, CabinStart = 0.3, CabinLength = 0.62,
			CabinHeight = 2.2, CabinInset = 0.25, HoodSlope = 0.1, WindshieldRake = 0.1, RearRake = 0.03,
			RoofStyle = "SUV", Rear = "Hatch", Spoiler = "None", Bumper = "Heavy", Headlights = "Round",
			WheelWidth = 1.05, DefaultColor = { 120, 130, 70 }, Extras = { "SpareWheel", "Snorkel", "BullBar" },
		},
	},

	rangel_bushman = {
		Id = "rangel_bushman", Brand = "rangel", Name = "Bushman 112", Class = "Offroad",
		Price = 69_000, VipOnly = false, Hidden = false, Seats = 5, Electric = false,
		Description = "A boxy expedition legend reborn: roof tent ready, air suspension, wades a metre of river.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2300, Horsepower = 395, PeakTorque = 550, IdleRPM = 700, RedlineRPM = 6200,
			TorqueCurve = CURVE_TURBO, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.7,
			TopSpeed = 119, Drivetrain = "AWD", BrakeForce = 0.82, SteerAngle = 33,
			SuspensionStiffness = 0.85, SuspensionDamping = 1.0, RideHeight = 1.25, SuspensionTravel = 1.8,
			Grip = 1.02, DriftGrip = 0.62, FuelCapacity = 90, FuelEconomy = 12.0,
			WheelRadius = 1.55, Wheelbase = 10.8, TrackWidth = 6.2,
		},
		Body = {
			Length = 17.0, Width = 7.2, Height = 4.4, Clearance = 1.25, CabinStart = 0.3, CabinLength = 0.62,
			CabinHeight = 2.3, CabinInset = 0.2, HoodSlope = 0.1, WindshieldRake = 0.12, RearRake = 0.02,
			RoofStyle = "SUV", Rear = "Hatch", Spoiler = "None", Bumper = "Heavy", Headlights = "Round",
			WheelWidth = 1.05, DefaultColor = { 200, 196, 180 }, Extras = { "SpareWheel", "RoofRack" },
		},
	},

	---------------------------------------------------------------------------
	-- VIP ONLY (bought with in-game cash, but require the VIP pass)
	---------------------------------------------------------------------------
	porza_vento_nera = {
		Id = "porza_vento_nera", Brand = "porza", Name = "Ventisca Nera VIP", Class = "Supercar",
		Price = 360_000, VipOnly = true, Hidden = false, Seats = 2, Electric = false,
		Description = "VIP-only blacked-out Ventisca with gold accents. Same legendary handling, extra attitude.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1430, Horsepower = 540, PeakTorque = 500, IdleRPM = 900, RedlineRPM = 9000,
			TorqueCurve = CURVE_HIGHREV, Gears = G7_DCT, ReverseGear = 3.2, FinalDrive = 3.85,
			TopSpeed = 200, Drivetrain = "RWD", BrakeForce = 1.0, SteerAngle = 33,
			SuspensionStiffness = 1.7, SuspensionDamping = 1.5, RideHeight = 0.4, SuspensionTravel = 0.6,
			Grip = 1.32, DriftGrip = 0.5, FuelCapacity = 64, FuelEconomy = 13.0,
			WheelRadius = 1.25, Wheelbase = 8.8, TrackWidth = 5.8,
		},
		Body = {
			Length = 16.0, Width = 6.8, Height = 2.8, Clearance = 0.4, CabinStart = 0.36, CabinLength = 0.38,
			CabinHeight = 1.5, CabinInset = 0.45, HoodSlope = 0.65, WindshieldRake = 0.42, RearRake = 0.46,
			RoofStyle = "Fastback", Rear = "Engine", Spoiler = "GT", Bumper = "Sport", Headlights = "Round",
			WheelWidth = 1.0, DefaultColor = { 12, 12, 14 }, Extras = { "Exhausts" },
		},
	},

	nordvik_royale = {
		Id = "nordvik_royale", Brand = "nordvik", Name = "Regalis Lounge VIP", Class = "Luxury",
		Price = 185_000, VipOnly = true, Hidden = false, Seats = 4, Electric = true,
		Description = "VIP-only electric limousine with a starlit headliner, a sauna-wood console and total silence.",
		Features = { Sunroof = true, Convertible = false, Doors = 4, Siren = false },
		Stats = {
			Mass = 2500, Horsepower = 660, PeakTorque = 900, IdleRPM = 500, RedlineRPM = 14000,
			TorqueCurve = CURVE_EV, Gears = G_EV, ReverseGear = 9.0, FinalDrive = 1.0,
			TopSpeed = 155, Drivetrain = "AWD", BrakeForce = 0.92, SteerAngle = 32,
			SuspensionStiffness = 0.85, SuspensionDamping = 1.25, RideHeight = 0.6, SuspensionTravel = 1.15,
			Grip = 1.06, DriftGrip = 0.6, FuelCapacity = 110, FuelEconomy = 20.0,
			WheelRadius = 1.35, Wheelbase = 12.4, TrackWidth = 6.1,
		},
		Body = {
			Length = 19.6, Width = 7.0, Height = 3.5, Clearance = 0.6, CabinStart = 0.32, CabinLength = 0.48,
			CabinHeight = 2.05, CabinInset = 0.35, HoodSlope = 0.4, WindshieldRake = 0.34, RearRake = 0.34,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "None", Bumper = "Chrome", Headlights = "Slim",
			WheelWidth = 0.95, DefaultColor = { 240, 236, 226 }, Extras = {},
		},
	},

	valkyr_halo = {
		Id = "valkyr_halo", Brand = "valkyr", Name = "Halo VIP Edition", Class = "Hypercar",
		Price = 1_250_000, VipOnly = true, Hidden = false, Seats = 2, Electric = false,
		Description = "VIP-only hypercar in liquid-gold paint with a glowing halo light bar. Not subtle. Not trying.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Stats = {
			Mass = 1450, Horsepower = 1150, PeakTorque = 1200, IdleRPM = 950, RedlineRPM = 8500,
			TorqueCurve = CURVE_TURBO, Gears = G7_DCT, ReverseGear = 3.1, FinalDrive = 3.0,
			TopSpeed = 228, Drivetrain = "AWD", BrakeForce = 1.0, SteerAngle = 30,
			SuspensionStiffness = 1.85, SuspensionDamping = 1.65, RideHeight = 0.35, SuspensionTravel = 0.5,
			Grip = 1.4, DriftGrip = 0.5, FuelCapacity = 75, FuelEconomy = 20.0,
			WheelRadius = 1.3, Wheelbase = 9.6, TrackWidth = 6.1,
		},
		Body = {
			Length = 16.4, Width = 7.2, Height = 2.6, Clearance = 0.35, CabinStart = 0.36, CabinLength = 0.36,
			CabinHeight = 1.4, CabinInset = 0.6, HoodSlope = 0.8, WindshieldRake = 0.5, RearRake = 0.5,
			RoofStyle = "Fastback", Rear = "Engine", Spoiler = "Wing", Bumper = "Sport", Headlights = "Slim",
			WheelWidth = 1.15, DefaultColor = { 220, 180, 60 }, Extras = { "Exhausts", "Scoop" },
		},
	},

	---------------------------------------------------------------------------
	-- JOB VEHICLES (Hidden, free, spawned by JobService through VehicleService:SpawnJobVehicle)
	---------------------------------------------------------------------------
	job_pizza_scooter = {
		Id = "job_pizza_scooter", Brand = "zippa", Name = "Pizza Delivery Scooter", Class = "Scooter",
		Price = 0, VipOnly = false, Hidden = true, Seats = 1, Electric = false,
		Description = "Hot pizza, cold wind. Comes with a branded top box.",
		Features = { Sunroof = false, Convertible = false, Doors = 0, Siren = false },
		Livery = {
			Primary = { 220, 40, 40 }, Secondary = { 255, 255, 255 }, Text = "PIZZA", TextColor = { 255, 255, 255 },
			Stripe = false, Checker = false, Lightbar = nil, RoofSign = "PIZZA",
		},
		Stats = {
			Mass = 115, Horsepower = 11, PeakTorque = 10, IdleRPM = 1500, RedlineRPM = 9000,
			TorqueCurve = CURVE_SCOOTER, Gears = G3_SCOOTER, ReverseGear = 2.4, FinalDrive = 6.8,
			TopSpeed = 55, Drivetrain = "RWD", BrakeForce = 0.75, SteerAngle = 34,
			SuspensionStiffness = 1.0, SuspensionDamping = 1.0, RideHeight = 0.5, SuspensionTravel = 0.6,
			Grip = 1.0, DriftGrip = 0.7, FuelCapacity = 8, FuelEconomy = 2.5,
			WheelRadius = 0.8, Wheelbase = 4.9, TrackWidth = 1.2,
		},
		Body = {
			Length = 6.6, Width = 2.4, Height = 2.7, Clearance = 0.5, CabinStart = 0.2, CabinLength = 0.6,
			CabinHeight = 0, CabinInset = 0, HoodSlope = 0, WindshieldRake = 0, RearRake = 0,
			RoofStyle = "Scooter", Rear = "TopBox", Spoiler = "None", Bumper = "Standard", Headlights = "Round",
			WheelWidth = 0.5, DefaultColor = { 220, 40, 40 }, Extras = {},
		},
	},

	job_taxi = {
		Id = "job_taxi", Brand = "toyomo", Name = "City Cab", Class = "Sedan",
		Price = 0, VipOnly = false, Hidden = true, Seats = 5, Electric = false,
		Description = "The yellow cab every Skyline City local recognises. Meter not included (the job UI has one).",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = false },
		Livery = {
			Primary = { 255, 200, 30 }, Secondary = { 20, 20, 20 }, Text = "SKYLINE TAXI", TextColor = { 20, 20, 20 },
			Stripe = false, Checker = true, Lightbar = nil, RoofSign = "TAXI",
		},
		Stats = {
			Mass = 1520, Horsepower = 205, PeakTorque = 240, IdleRPM = 750, RedlineRPM = 6200,
			TorqueCurve = CURVE_SMALL, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.2,
			TopSpeed = 125, Drivetrain = "FWD", BrakeForce = 0.85, SteerAngle = 34,
			SuspensionStiffness = 0.95, SuspensionDamping = 1.0, RideHeight = 0.6, SuspensionTravel = 1.05,
			Grip = 1.0, DriftGrip = 0.55, FuelCapacity = 60, FuelEconomy = 5.5,
			WheelRadius = 1.2, Wheelbase = 10.2, TrackWidth = 5.6,
		},
		Body = {
			Length = 17.0, Width = 6.6, Height = 3.4, Clearance = 0.6, CabinStart = 0.32, CabinLength = 0.45,
			CabinHeight = 1.95, CabinInset = 0.35, HoodSlope = 0.45, WindshieldRake = 0.34, RearRake = 0.32,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "None", Bumper = "Standard", Headlights = "Slim",
			WheelWidth = 0.78, DefaultColor = { 255, 200, 30 }, Extras = {},
		},
	},

	job_police_cruiser = {
		Id = "job_police_cruiser", Brand = "fleetworks", Name = "Pursuit Cruiser", Class = "Sedan",
		Price = 0, VipOnly = false, Hidden = true, Seats = 4, Electric = false,
		Description = "Pursuit-rated V8 saloon with a push bar, light bar and a very loud siren.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = true },
		Livery = {
			Primary = { 245, 245, 245 }, Secondary = { 20, 30, 60 }, Text = "POLICE", TextColor = { 20, 30, 60 },
			Stripe = true, Checker = false, Lightbar = "RedBlue", RoofSign = nil,
		},
		Stats = {
			Mass = 1900, Horsepower = 400, PeakTorque = 520, IdleRPM = 700, RedlineRPM = 6400,
			TorqueCurve = CURVE_V8, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.07,
			TopSpeed = 150, Drivetrain = "AWD", BrakeForce = 0.95, SteerAngle = 34,
			SuspensionStiffness = 1.2, SuspensionDamping = 1.2, RideHeight = 0.6, SuspensionTravel = 1.0,
			Grip = 1.1, DriftGrip = 0.5, FuelCapacity = 72, FuelEconomy = 13.0,
			WheelRadius = 1.25, Wheelbase = 10.8, TrackWidth = 5.9,
		},
		Body = {
			Length = 17.6, Width = 6.8, Height = 3.4, Clearance = 0.6, CabinStart = 0.34, CabinLength = 0.44,
			CabinHeight = 1.9, CabinInset = 0.38, HoodSlope = 0.35, WindshieldRake = 0.34, RearRake = 0.3,
			RoofStyle = "Sedan", Rear = "Trunk", Spoiler = "None", Bumper = "Heavy", Headlights = "Slim",
			WheelWidth = 0.88, DefaultColor = { 245, 245, 245 }, Extras = { "BullBar" },
		},
	},

	job_fire_truck = {
		Id = "job_fire_truck", Brand = "fleetworks", Name = "Fire Engine Ladder 7", Class = "Van",
		Price = 0, VipOnly = false, Hidden = true, Seats = 4, Electric = false,
		Description = "Thirty-ton ladder engine with a pump, hoses and the city's loudest air horn.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = true },
		Livery = {
			Primary = { 200, 24, 24 }, Secondary = { 240, 240, 240 }, Text = "FIRE RESCUE", TextColor = { 255, 255, 255 },
			Stripe = true, Checker = false, Lightbar = "Red", RoofSign = nil,
		},
		Stats = {
			Mass = 14000, Horsepower = 500, PeakTorque = 2300, IdleRPM = 600, RedlineRPM = 2600,
			TorqueCurve = CURVE_DIESEL, Gears = G_TRUCK, ReverseGear = 5.5, FinalDrive = 4.1,
			TopSpeed = 72, Drivetrain = "RWD", BrakeForce = 0.7, SteerAngle = 38,
			SuspensionStiffness = 1.3, SuspensionDamping = 1.2, RideHeight = 1.4, SuspensionTravel = 1.2,
			Grip = 0.95, DriftGrip = 0.7, FuelCapacity = 300, FuelEconomy = 45.0,
			WheelRadius = 1.95, Wheelbase = 18.0, TrackWidth = 7.0,
		},
		Body = {
			Length = 32.0, Width = 8.6, Height = 5.8, Clearance = 1.4, CabinStart = 0.06, CabinLength = 0.22,
			CabinHeight = 3.0, CabinInset = 0.15, HoodSlope = 0.0, WindshieldRake = 0.08, RearRake = 0.0,
			RoofStyle = "Cab", Rear = "Ladder", RearHeight = 2.2, Spoiler = "None", Bumper = "Heavy", Headlights = "Square",
			WheelWidth = 1.2, DefaultColor = { 200, 24, 24 }, Extras = {},
		},
	},

	job_ambulance = {
		Id = "job_ambulance", Brand = "fleetworks", Name = "Rescue Ambulance", Class = "Van",
		Price = 0, VipOnly = false, Hidden = true, Seats = 4, Electric = false,
		Description = "A box-body ambulance with a stretcher bay, defibrillator and a siren that clears any junction.",
		Features = { Sunroof = false, Convertible = false, Doors = 4, Siren = true },
		Livery = {
			Primary = { 250, 250, 250 }, Secondary = { 220, 40, 40 }, Text = "AMBULANCE", TextColor = { 220, 40, 40 },
			Stripe = true, Checker = true, Lightbar = "Red", RoofSign = nil,
		},
		Stats = {
			Mass = 4200, Horsepower = 300, PeakTorque = 750, IdleRPM = 650, RedlineRPM = 4500,
			TorqueCurve = CURVE_DIESEL, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 3.9,
			TopSpeed = 92, Drivetrain = "RWD", BrakeForce = 0.78, SteerAngle = 34,
			SuspensionStiffness = 1.15, SuspensionDamping = 1.1, RideHeight = 1.0, SuspensionTravel = 1.2,
			Grip = 0.95, DriftGrip = 0.65, FuelCapacity = 140, FuelEconomy = 18.0,
			WheelRadius = 1.45, Wheelbase = 13.8, TrackWidth = 6.4,
		},
		Body = {
			Length = 22.0, Width = 7.6, Height = 4.3, Clearance = 1.0, CabinStart = 0.1, CabinLength = 0.26,
			CabinHeight = 2.5, CabinInset = 0.2, HoodSlope = 0.5, WindshieldRake = 0.2, RearRake = 0.0,
			RoofStyle = "Cab", Rear = "Box", RearHeight = 3.4, Spoiler = "None", Bumper = "Heavy", Headlights = "Square",
			WheelWidth = 1.0, DefaultColor = { 250, 250, 250 }, Extras = {},
		},
	},

	job_tow_truck = {
		Id = "job_tow_truck", Brand = "fleetworks", Name = "Wrecker Tow Truck", Class = "Pickup",
		Price = 0, VipOnly = false, Hidden = true, Seats = 2, Electric = false,
		Description = "Heavy-duty wrecker with an under-lift and amber beacons. Every broken-down car's best friend.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = true },
		Livery = {
			Primary = { 255, 160, 20 }, Secondary = { 30, 30, 30 }, Text = "CITY TOWING", TextColor = { 30, 30, 30 },
			Stripe = true, Checker = false, Lightbar = "Amber", RoofSign = nil,
		},
		Stats = {
			Mass = 4800, Horsepower = 350, PeakTorque = 1050, IdleRPM = 650, RedlineRPM = 4200,
			TorqueCurve = CURVE_DIESEL, Gears = G8_AUTO, ReverseGear = 3.3, FinalDrive = 4.1,
			TopSpeed = 88, Drivetrain = "RWD", BrakeForce = 0.78, SteerAngle = 34,
			SuspensionStiffness = 1.2, SuspensionDamping = 1.15, RideHeight = 1.2, SuspensionTravel = 1.3,
			Grip = 0.95, DriftGrip = 0.65, FuelCapacity = 150, FuelEconomy = 20.0,
			WheelRadius = 1.6, Wheelbase = 14.0, TrackWidth = 6.5,
		},
		Body = {
			Length = 22.0, Width = 7.4, Height = 4.6, Clearance = 1.2, CabinStart = 0.22, CabinLength = 0.26,
			CabinHeight = 2.4, CabinInset = 0.25, HoodSlope = 0.2, WindshieldRake = 0.22, RearRake = 0.0,
			RoofStyle = "Cab", Rear = "Tow", Spoiler = "None", Bumper = "Heavy", Headlights = "Square",
			WheelWidth = 1.05, DefaultColor = { 255, 160, 20 }, Extras = {},
		},
	},

	job_construction_truck = {
		Id = "job_construction_truck", Brand = "fleetworks", Name = "Tipper Dump Truck", Class = "Pickup",
		Price = 0, VipOnly = false, Hidden = true, Seats = 2, Electric = false,
		Description = "Six-wheel tipper for hauling gravel to the city's never-ending building sites.",
		Features = { Sunroof = false, Convertible = false, Doors = 2, Siren = false },
		Livery = {
			Primary = { 240, 190, 30 }, Secondary = { 40, 40, 40 }, Text = "SKYLINE BUILD CO.", TextColor = { 30, 30, 30 },
			Stripe = true, Checker = false, Lightbar = "Amber", RoofSign = nil,
		},
		Stats = {
			Mass = 11000, Horsepower = 420, PeakTorque = 2000, IdleRPM = 600, RedlineRPM = 2600,
			TorqueCurve = CURVE_DIESEL, Gears = G_TRUCK, ReverseGear = 5.5, FinalDrive = 4.3,
			TopSpeed = 68, Drivetrain = "RWD", BrakeForce = 0.7, SteerAngle = 36,
			SuspensionStiffness = 1.35, SuspensionDamping = 1.25, RideHeight = 1.5, SuspensionTravel = 1.3,
			Grip = 0.95, DriftGrip = 0.7, FuelCapacity = 300, FuelEconomy = 40.0,
			WheelRadius = 1.9, Wheelbase = 15.0, TrackWidth = 7.0,
		},
		Body = {
			Length = 25.0, Width = 8.2, Height = 5.2, Clearance = 1.5, CabinStart = 0.06, CabinLength = 0.26,
			CabinHeight = 3.0, CabinInset = 0.15, HoodSlope = 0.0, WindshieldRake = 0.08, RearRake = 0.0,
			RoofStyle = "Cab", Rear = "Dump", RearHeight = 2.6, Spoiler = "None", Bumper = "Heavy", Headlights = "Square",
			WheelWidth = 1.2, DefaultColor = { 240, 190, 30 }, Extras = {},
		},
	},
}
