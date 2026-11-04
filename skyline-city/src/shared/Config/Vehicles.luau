-- VEHICLES CONFIG — global vehicle settings (garage, spawning, fuel, damage, repairs, resale, visuals).
-- Per-car numbers live in Config/Cars, brands in Config/Brands. Change numbers here; no code changes needed.
--
-- Units: distances in studs (1 stud = 0.28 m, see Shared/Vehicle/Units), speeds in mph unless noted,
-- money in dollars, time in seconds.

return {
	-- CollectionService tag on every spawned car (owned, job, test drive) and the Workspace folder they live in.
	Tag = "SkylineVehicle",
	FolderName = "Vehicles",
	DisplayFolderName = "VehicleDisplays", -- BuildDisplay() showroom copies

	---------------------------------------------------------------------------
	-- Garage
	---------------------------------------------------------------------------
	Garage = {
		BaseSlots = 6, -- cars every player can own
		PremiumCarParkSlots = 12, -- extra slots with the PremiumCarPark gamepass
		VipSlots = 2, -- extra slots with VIP
		LockOnSpawn = false, -- new spawns start unlocked (the saved per-car Locked state wins once set)
		AllowOthersToDriveUnlocked = true, -- an UNLOCKED car can be driven by anyone (RP friendly); locked = owner / keyholders
		GroupMembersHaveKeys = true, -- players with the same GroupName attribute (family / friend group) can use your car
		MaxKeyholders = 8,
	},

	---------------------------------------------------------------------------
	-- Spawning / calling your car
	---------------------------------------------------------------------------
	Spawn = {
		Cooldown = 3, -- seconds between spawn requests
		CarSpawnSearchRadius = 350, -- nearest free CarSpawn-tagged spot within this distance of the player
		RoadSearchRadius = 220, -- otherwise a RoadNode-tagged spot within this distance
		BesidePlayerDistance = 9, -- otherwise right next to the player (always used with PremiumCarPark)
		ClearancePadding = 0.6, -- studs of free space required around the car's footprint
		GroundProbe = 40, -- studs of raycast to find the ground under a spawn point
		DespawnWhenOwnerLeaves = true,
	},

	Call = {
		Delay = 4, -- seconds before a called car appears (it "drives over")
		Cooldown = 30, -- seconds between calls (free of charge)
		MinDistance = 25, -- don't bother calling a car that's already this close
	},

	---------------------------------------------------------------------------
	-- Pass parking perks (Vehicles/Showcase helper)
	---------------------------------------------------------------------------
	-- VIP: every VIP online gets a reserved bay in the gated VIP Car Park (Downtown). "🅿️ VIP spot" in the
	-- Garage delivers the car there for free, with no call cooldown.
	VipParking = {
		BayTag = "VipParkingBay", -- CollectionService tag on the bay marker parts (attribute Bay = index)
		Cooldown = 10, -- seconds between VIP-spot deliveries
	},
	-- Premium Car Park: owners pick one car to show off; while they are online an anchored copy of it
	-- stands on a showroom pad at the AutoStrip Meet Lot with their name above it.
	Showcase = {
		PadTag = "PremiumShowcasePad", -- CollectionService tag on the pad parts (attribute Pad = index)
		HeightOffset = 0.05, -- studs above the pad top
		LabelMaxDistance = 140, -- name plate visibility
		Cooldown = 5, -- seconds between showcase changes
	},

	---------------------------------------------------------------------------
	-- Physics / mass
	---------------------------------------------------------------------------
	-- Mass scale: Roblox density 1 = water. At 1 stud = 0.28 m one cubic stud of water is 0.021952 m^3,
	-- so ONE Roblox mass unit ≈ 21.952 kg. The invisible Chassis box gets a density so that its mass equals
	-- Stats.Mass / KgPerMassUnit; every other part is Massless. (The client chassis also normalises forces by
	-- AssemblyMass, so the handling stays right even with passengers.)
	Physics = {
		KgPerMassUnit = 21.952,
		Friction = 0.3, -- chassis box friction (wheels are raycast; the box only touches on crashes)
		Elasticity = 0.05,
		CollisionGroup = "Vehicles",
		CharacterGroup = "Characters",
		SafeCharacterGroup = "SafeCharacters", -- characters inside safe zones: cars pass through them
		ParkSettleSeconds = 2, -- driverless car slower than SettleSpeed this long → snapped to ride height & anchored
		SettleSpeed = 2.5, -- studs/s
		SleepAfterIdle = 10, -- seconds a driverless car may sit unanchored at all before it is forced to sleep
	},

	---------------------------------------------------------------------------
	-- Server watchdog (4 Hz, batched over all active cars)
	---------------------------------------------------------------------------
	Watchdog = {
		Rate = 4, -- Hz (keep <= 5)
		SpeedTolerance = 1.25, -- allowed = TopSpeed x UpgradeSpeedCap x SpeedTolerance
		UpgradeSpeedCap = 1.25, -- the most performance upgrades can raise top speed
		ViolationsToFlag = 2, -- consecutive over-speed samples before flagging + resetting
		TeleportStuds = 160, -- a single-sample jump bigger than this (beyond the speed allowance) is a teleport
		ResetOwnershipDelay = 1.5, -- seconds the server keeps physics ownership after a reset
		SaveEvery = 10, -- seconds between writing Fuel / Mileage / Health into the save
		MaxCountedSpeed = 600, -- studs/s cap when counting distance (bad samples never add huge mileage)
	},

	---------------------------------------------------------------------------
	-- Fuel & charging (pumps are FuelPump-tagged parts; EVs charge at the same pumps)
	-- EVs: Stats.FuelCapacity is the battery size in kWh and Stats.FuelEconomy is kWh / 100 km.
	---------------------------------------------------------------------------
	Fuel = {
		UseMultiplier = 8, -- gameplay speed-up of real consumption (a 50 L tank lasts ~75 km of driving)
		IdleLitresPerHour = 1.2, -- engine running while parked (x UseMultiplier); EVs use nothing idling
		PricePerLitre = 3, -- $ per litre of petrol
		PricePerKWh = 1, -- $ per kWh for EVs (cheaper...)
		PumpLitresPerSecond = 8, -- fill speed
		ChargeKWhPerSecond = 3, -- (...but slower)
		PumpDistance = 15, -- car must be within this many studs of the pump
		PlayerDistance = 20, -- player must be within this many studs of the pump
		LowFuelWarning = 0.12, -- notify the driver once when fuel drops below this
		PromptHoldDuration = 0,
	},

	---------------------------------------------------------------------------
	-- Damage (server-observed sudden speed loss = collision)
	---------------------------------------------------------------------------
	Damage = {
		MinImpactMph = 14, -- speed lost within one watchdog sample that counts as a crash (brakes lose ~5)
		DamagePerMph = 1.3, -- health lost per mph above MinImpactMph
		MaxPerHit = 45,
		HitCooldown = 0.6,
		SmokeBelow = 40, -- light smoke from the bonnet below this health
		HeavySmokeBelow = 15, -- thick black smoke below this
		NoStartHealth = 10, -- engine refuses to start below this (matches Config/Driving.Damage.NoStartHealth)
		EngineDeadAt = 0, -- health at/below which the engine dies until repaired
		-- friendly seatbelt reminder: occupants without a seatbelt get a harmless "ouch" after a crash at least
		-- this hard (no humanoid damage — Skyline City keeps crashes friendly)
		SeatbeltHintImpactMph = 30,
		SeatbeltHintCooldown = 45, -- seconds between reminders per player
	},

	---------------------------------------------------------------------------
	-- Self-service repairs at MechanicBay-tagged zones (and VehicleService:Repair for the mechanic job)
	---------------------------------------------------------------------------
	Repair = {
		BayPadding = 6, -- studs the car may stick out of the bay volume
		PlayerDistance = 30, -- player must be within this of the bay
		MinCost = 60, -- cheapest repair
		CostPerPoint = 9, -- $ per missing health point...
		ValueFactorPerPoint = 0.00035, -- ...plus this fraction of the car's value per missing point
		MaxCostFraction = 0.2, -- a full repair never costs more than this fraction of the car's value (min MinCost)
		PromptHoldDuration = 0,
	},

	---------------------------------------------------------------------------
	-- Value / resale (sell back to the game = Economy.ResaleFraction of current value, minus finance)
	---------------------------------------------------------------------------
	Value = {
		DepreciationPerMile = 0.0012, -- value lost per mile driven...
		MinCondition = 0.55, -- ...never below this fraction from mileage alone
		DamageWeight = 0.25, -- a wrecked (0 health) car is worth this much less
	},

	---------------------------------------------------------------------------
	-- Roleplay anti-griefing
	---------------------------------------------------------------------------
	Ram = {
		MinSpeedMph = 22, -- hitting a pedestrian faster than this (outside a safe zone) makes the driver Wanted
		WantedSeconds = 60,
		Cooldown = 4,
	},
	SafeZone = {
		CheckInterval = 0.5, -- seconds between safe-zone collision-group updates for characters
	},

	---------------------------------------------------------------------------
	-- Interaction
	---------------------------------------------------------------------------
	Interaction = {
		OwnerOutsideRange = 20, -- owner can lock / open doors, hood, trunk from this close
		EntryPromptDistance = 8, -- "Drive" / "Ride" proximity prompts
		MaxDoorSpeedMph = 12, -- doors / hood / trunk only open below this speed
		MaxRoofSpeedMph = 30, -- convertible roof only moves below this speed
		ExitSpeedMph = 45, -- exiting faster than this is still allowed (we just stop you safely)
	},

	UI = {
		GarageKey = Enum.KeyCode.N, -- PC hotkey that opens the Garage panel (on foot)
		HudOrder = 25, -- position of the "Garage" button in the HUD side bar
		FuelQuickAmounts = { 10, 25 }, -- quick-pick litres / kWh buttons in the pump panel ("Fill" is always there)
	},

	TestDrive = {
		WarnBefore = 10, -- seconds before the end
		ExitGrace = 12, -- leaving the car this long ends the test drive
		Plate = "TEST",
	},

	JobVehicle = {
		IdleDespawn = 300, -- job vehicle left empty this long after clocking out is removed
	},

	---------------------------------------------------------------------------
	-- Client visuals (CarVisualsController)
	---------------------------------------------------------------------------
	Visuals = {
		Range = 250, -- only animate cars this close to the camera
		LowGraphicsRange = 110,
		BlinkHz = 1.5, -- indicators / hazards
		SirenHz = 3, -- siren light alternation
		DoorAngle = 68, -- degrees (default if the rig has no OpenAngle attribute)
		HoodAngle = 50,
		TrunkAngle = 62,
		RoofFoldAngle = 172,
		SunroofSlide = 0.8, -- fraction of the sunroof length it slides back
		DoorSpeed = 3.2, -- 1/s smoothing for doors / hood / trunk
		WindowSpeed = 1.1, -- full window travel per second
		RoofSpeed = 0.45, -- full roof fold per second
		EngineSoundRange = 140,
		HornRange = 220,
		WheelSpinRange = 160,
		Headlights = {
			Low = { Brightness = 3, Range = 45, Angle = 70 },
			High = { Brightness = 6, Range = 95, Angle = 50 },
		},
		TaillightIdle = 0.35, -- taillight glow with headlights on (0..1)
	},
}
