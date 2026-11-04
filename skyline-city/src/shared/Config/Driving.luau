-- DRIVING CONFIG — every tunable number of the client raycast chassis, driver input, camera,
-- dashboard and mirrors. Change numbers here; no code changes needed.
--
-- Per-car numbers (power, gears, grip, suspension...) live in Config/Cars (Stats table).
-- Upgrade multipliers live in Config/Tuning. This file only holds the GLOBAL feel of driving.
--
-- Unit notes:
--   * Physics is simulated in real-world SI units (metres, kg, Newtons) and converted to Roblox studs with
--     Shared/Vehicle/Units (1 stud = 0.28 m, the Roblox avatar scale).
--   * "studs/s" values are Roblox velocities, "mph" values are what the speedometer shows.

return {
	---------------------------------------------------------------------------
	-- Chassis / tyres / suspension
	---------------------------------------------------------------------------
	Physics = {
		MaxDt = 1 / 15, -- physics step is clamped to this (prevents explosions on big frame hitches)
		-- Roblox gravity (196.2 studs/s^2) is ~5.6 g at the 0.28 m/stud car scale, which would make every hill
		-- a wall for realistic engines/brakes. While driving, the car gets an upward compensation force so it
		-- "feels" this many real g (1 = physically correct at car scale; a bit more = weightier, snappier landings).
		VehicleGravityG = 1.6,
		GripScale = 1.25, -- global tyre grip multiplier (1 = real-world 1g per friction 1.0); >1 = more arcade
		RollCenterLift = 0.55, -- 0..1: tyre forces act this far up toward the centre of mass (less body roll / no flips)

		Sag = 0.5, -- fraction of suspension travel used when the car sits still
		BaseDampingRatio = 0.42, -- suspension damping ratio at SuspensionDamping = 1 (0.3 floaty .. 0.7 tight)
		BumpStopMultiplier = 7, -- spring multiplier when the suspension bottoms out
		AntiRoll = 0.55, -- anti-roll bar strength relative to spring stiffness
		DefaultTravel = 1.2, -- studs, when the car has no SuspensionTravel
		DefaultRestDrop = 0.8, -- studs from suspension top to wheel centre when the rig gives no hint

		PacejkaB = 10, -- lateral slip curve stiffness (peak grip at ~8 deg slip angle)
		PacejkaC = 1.45, -- lateral slip curve shape (falloff past the peak; drift sliding keeps ~80 % grip)
		LowSpeedSlipRef = 4, -- studs/s; slip angles below this speed are softened (no jitter when parked)
		LateralStopFactor = 0.9, -- how much of the sideways velocity a tyre may cancel in one step
		LongGripShare = 1.0, -- longitudinal grip relative to lateral grip
		AbsLimit = 0.93, -- ABS: braking never uses more than this fraction of the tyre's grip (no lock-ups)
		HandbrakeLockGrip = 0.8, -- fraction of grip a locked rear tyre uses to slow the car
		DriftRecoverTime = 0.5, -- seconds for rear grip to come back after releasing the handbrake

		MaxBrakeDecel = 9.0, -- m/s^2 of braking at Stats.BrakeForce = 1 (~0.92 g → 100-0 km/h in ~43 m)
		BrakeFrontBias = 0.62, -- share of braking on the front axle
		HoldSpeed = 1.5, -- studs/s: below this with no throttle the car holds still (parking hold)

		RollingResistance = 0.014, -- tyre rolling resistance coefficient
		DefaultAeroCoef = 0.38, -- N/(m/s)^2 fallback when TopSpeed can't be calibrated
		EngineBrakeDecel = 0.9, -- m/s^2 engine braking off-throttle (scaled by gear)
		RegenDecel = 1.8, -- m/s^2 EV regenerative braking off-throttle
		DrivetrainEfficiency = 0.86, -- fraction of engine torque that reaches the tyres
		ReverseMaxMph = 22, -- reverse speed cap
		TopSpeedSoftLimit = 1.02, -- throttle is cut above TopSpeed x this
		AwdFrontShare = 0.4, -- AWD torque split to the front axle

		WheelspinVisualGain = 45, -- studs/s of extra wheel surface speed shown per unit of wheelspin
		SingleWheelOutrigger = 1.0, -- studs: half-width of the virtual stabiliser contacts for scooters / bikes

		-- Ground material grip multipliers (anything not listed = 1)
		SurfaceGrip = {
			Grass = 0.78,
			LeafyGrass = 0.78,
			Sand = 0.62,
			Mud = 0.6,
			Ground = 0.85,
			Snow = 0.5,
			Ice = 0.25,
			Glacier = 0.3,
			Pebble = 0.85,
			Water = 0.4,
		},

		-- Downforce (fraction of car weight added at TopSpeed). Stats.Downforce overrides the class value.
		DownforceByClass = {
			Supercar = 0.55,
			Hypercar = 0.75,
			Sports = 0.25,
			Sport = 0.25,
		},

		AutoFlipDelay = 2.5, -- seconds upside-down & slow before the car is put back on its wheels
		AutoFlipLift = 3, -- studs the car is lifted when flipped back
		UpsideDownDot = 0.25, -- car up · world up below this counts as "on its side / roof"
		MassRefresh = 0.5, -- seconds between AssemblyMass reads (passengers change it)
	},

	---------------------------------------------------------------------------
	-- Engine & gearbox
	---------------------------------------------------------------------------
	Engine = {
		ShiftTime = 0.22, -- seconds of torque cut per gear change (divided by Transmission upgrade)
		ShiftCooldown = 0.5, -- auto gearbox waits this long between shifts
		LimiterCut = 0.07, -- seconds of fuel cut when hitting the rev limiter
		RevUpRate = 9000, -- rpm/s free-revving (neutral / clutch slip)
		RevDownRate = 4500, -- rpm/s when lifting off in neutral
		LaunchRpmFraction = 0.38, -- clutch slips until this fraction of the rev range at full throttle
		EVMaxRpm = 12000, -- EV motor max rpm (if the car's RedlineRPM is lower than 6000)
		AutoUpshift = { Min = 0.42, Max = 0.92 }, -- shift-up point (fraction of redline) at 0% .. 100% throttle
		AutoDownshift = { Min = 0.22, Max = 0.45 }, -- shift-down point at 0% .. 100% throttle
		KickdownThrottle = 0.92, -- throttle above this triggers kickdown
		KickdownMaxRpm = 0.78, -- only kick down if the lower gear lands below this fraction of redline
		ReverseEngageDelay = 0.25, -- seconds holding brake at a stop before auto selects reverse
		TurboSpool = 0.6, -- seconds for turbo boost to build (turbo upgrades only)
		AutoStartOnThrottle = true, -- pressing throttle with the engine off starts it (friendly for new players)
		StartCooldown = 3, -- seconds between automatic start attempts
		IdleSputterFuel = 0.015, -- below this fuel (0..1) the engine starts to sputter
	},

	---------------------------------------------------------------------------
	-- Steering
	---------------------------------------------------------------------------
	Steering = {
		DefaultAngle = 32, -- degrees, when the car has no SteerAngle
		SpeedForMinAngle = 75, -- mph at which steering reaches its minimum angle
		MinAngleFraction = 0.28, -- fraction of full lock left at high speed
		Rate = 3.0, -- full-locks per second when turning in (keyboard smoothing)
		ReturnRate = 4.5, -- full-locks per second when centring
		AnalogRate = 9, -- faster response for analogue sticks
	},

	---------------------------------------------------------------------------
	-- Damage / fuel effects
	---------------------------------------------------------------------------
	Damage = {
		LowHealth = 30, -- Health below this: power reduced
		LowHealthPower = 0.6, -- power multiplier when damaged (-40 %)
		NoStartHealth = 10, -- Health below this: the engine won't start / dies
	},

	---------------------------------------------------------------------------
	-- Crashes
	---------------------------------------------------------------------------
	Crash = {
		ShakeImpactMph = 12, -- unexplained velocity change (mph) that starts camera shake
		ShakeFullMph = 45, -- impact that gives full-strength shake
		EjectImpactMph = 42, -- impact that throws an unbelted driver out (fun, not punishing)
		EjectCooldown = 10, -- seconds
		StumbleTime = 1.4, -- seconds on the floor after being thrown out
	},

	Telemetry = {
		Rate = 5, -- Hz VehicleTelemetry (unreliable) — the server never trusts it for money
	},

	Cruise = {
		MinMph = 8, -- can't engage cruise below this
		Gain = 0.08, -- throttle per studs/s of speed error
		BaseThrottle = 0.25,
	},

	---------------------------------------------------------------------------
	-- Camera
	---------------------------------------------------------------------------
	Camera = {
		BaseFov = 70,
		SpeedFov = 16, -- extra FOV at top speed
		HoodFov = 78,
		InteriorFov = 75,
		Pitch = -12, -- degrees, chase camera downward tilt
		DistanceMultiplier = 1.15, -- chase distance relative to car length
		DistanceExtra = 7, -- studs added to the chase distance
		HeightMultiplier = 0.9, -- chase height relative to car height
		HeightExtra = 2.5,
		SpeedPullback = 4, -- studs further back at top speed
		YawSharpness = 6, -- how quickly the chase camera swings behind the car
		FollowSharpness = 22, -- how tightly the camera follows the car position
		DriftLook = 0.35, -- 0..1 camera follows velocity instead of heading while sliding
		OrbitReturnDelay = 1.4, -- seconds after mouse/stick orbit before the camera recentres
		OrbitReturnSpeed = 3,
		MouseSensitivity = 0.25, -- degrees per pixel
		StickSensitivity = 160, -- degrees per second at full stick
		TouchSensitivity = 0.35,
		ZoomMin = 0.6,
		ZoomMax = 2.2,
		ShakeDecay = 3.5, -- per second
		HighSpeedRumble = 0.06, -- small constant shake near top speed (if CameraShake is on)
	},

	---------------------------------------------------------------------------
	-- Rear-view mirror (ViewportFrame with low-detail proxies)
	---------------------------------------------------------------------------
	Mirror = {
		Enabled = true, -- default visibility (players toggle with B / the car menu)
		Range = 120, -- studs: proxies shown for vehicles / characters inside this range
		UpdateRate = 15, -- Hz proxy refresh
		ScanInterval = 1, -- seconds between scans for nearby vehicles
		MaxProxies = 24,
		Fov = 42,
		Size = Vector2.new(300, 82), -- px
	},

	---------------------------------------------------------------------------
	-- Dashboard
	---------------------------------------------------------------------------
	Dashboard = {
		NeedleSharpness = 12, -- needle smoothing
		GaugeSweep = 270, -- degrees of needle travel
		SpeedoMaxMph = 160, -- speedometer scale (auto-extends for fast cars)
		HintSeconds = 10, -- PC keybind hint strip duration
		BlinkPeriod = 0.8, -- indicator blink period (seconds)
		LowFuel = 0.15,
	},

	Odometer = {
		SourceUnit = "studs", -- unit of Vehicles[uid].Mileage ("studs" | "miles" | "km")
	},

	---------------------------------------------------------------------------
	-- Default car stats (used for any field missing from Config/Cars)
	---------------------------------------------------------------------------
	DefaultStats = {
		Mass = 1400,
		Horsepower = 160,
		PeakTorque = 220,
		IdleRPM = 800,
		RedlineRPM = 6500,
		TorqueCurve = nil, -- nil = generic curve
		Gears = { 3.6, 2.2, 1.5, 1.1, 0.9, 0.75 },
		ReverseGear = 3.4,
		FinalDrive = 3.7,
		TopSpeed = 120,
		Drivetrain = "FWD",
		BrakeForce = 0.85,
		SteerAngle = 32,
		SuspensionStiffness = 1,
		SuspensionDamping = 1,
		RideHeight = 2,
		SuspensionTravel = 1.2,
		Grip = 1,
		DriftGrip = 0.55,
		FuelCapacity = 50,
		FuelEconomy = 8,
		WheelRadius = 1.2,
		Wheelbase = 9,
		TrackWidth = 5,
	},

	-- Used only when Config/Tuning is missing: multipliers per upgrade level (index = level 0..3).
	FallbackUpgrades = {
		Engine = { [0] = { Power = 1 }, [1] = { Power = 1.08 }, [2] = { Power = 1.16 }, [3] = { Power = 1.25 } },
		Turbo = { [0] = { Power = 1 }, [1] = { Power = 1.07 }, [2] = { Power = 1.14 }, [3] = { Power = 1.22 } },
		Brakes = { [0] = { Brake = 1 }, [1] = { Brake = 1.12 }, [2] = { Brake = 1.24 }, [3] = { Brake = 1.36 } },
		Suspension = {
			[0] = { Grip = 1, Stiffness = 1 },
			[1] = { Grip = 1.05, Stiffness = 1.1 },
			[2] = { Grip = 1.1, Stiffness = 1.2 },
			[3] = { Grip = 1.15, Stiffness = 1.3 },
		},
		Transmission = {
			[0] = { ShiftSpeed = 1 },
			[1] = { ShiftSpeed = 1.25, TopSpeed = 1.02 },
			[2] = { ShiftSpeed = 1.5, TopSpeed = 1.04 },
			[3] = { ShiftSpeed = 2, TopSpeed = 1.06 },
		},
	},

	---------------------------------------------------------------------------
	-- Key bindings while driving (PC keyboard + gamepad). Mobile uses on-screen buttons.
	-- Each entry = list of Enum.KeyCode values.
	---------------------------------------------------------------------------
	Keys = {
		Throttle = { Enum.KeyCode.W, Enum.KeyCode.Up },
		Brake = { Enum.KeyCode.S, Enum.KeyCode.Down },
		SteerLeft = { Enum.KeyCode.A, Enum.KeyCode.Left },
		SteerRight = { Enum.KeyCode.D, Enum.KeyCode.Right },
		Handbrake = { Enum.KeyCode.Space, Enum.KeyCode.ButtonX },
		ShiftUp = { Enum.KeyCode.E, Enum.KeyCode.DPadUp },
		ShiftDown = { Enum.KeyCode.Q, Enum.KeyCode.DPadDown },
		ManualToggle = { Enum.KeyCode.M, Enum.KeyCode.ButtonL3 },
		Cruise = { Enum.KeyCode.C, Enum.KeyCode.ButtonL1 },
		Lights = { Enum.KeyCode.L }, -- gamepad: car menu (ButtonY is the phone, Config/Phone.GamepadButton)
		Horn = { Enum.KeyCode.H, Enum.KeyCode.ButtonA },
		IndicatorLeft = { Enum.KeyCode.Z, Enum.KeyCode.DPadLeft },
		IndicatorRight = { Enum.KeyCode.X, Enum.KeyCode.DPadRight },
		Hazard = { Enum.KeyCode.V },
		InteriorLight = { Enum.KeyCode.I },
		Engine = { Enum.KeyCode.K },
		Seatbelt = { Enum.KeyCode.G },
		Radio = { Enum.KeyCode.R },
		Roof = { Enum.KeyCode.U },
		WindowFL = { Enum.KeyCode.One },
		WindowFR = { Enum.KeyCode.Two },
		WindowRL = { Enum.KeyCode.Three },
		WindowRR = { Enum.KeyCode.Four },
		AllWindows = { Enum.KeyCode.Five },
		Exit = { Enum.KeyCode.F, Enum.KeyCode.ButtonB },
		CarMenu = { Enum.KeyCode.O, Enum.KeyCode.ButtonSelect },
		Siren = { Enum.KeyCode.N },
		CameraCycle = { Enum.KeyCode.Y, Enum.KeyCode.ButtonR1 },
		LookBehind = { Enum.KeyCode.LeftAlt, Enum.KeyCode.ButtonR3 },
		Mirror = { Enum.KeyCode.B },
		Lock = { Enum.KeyCode.J },
	},

	GamepadDeadzone = 0.14,
	ActionPriority = 3100, -- ContextActionService priority (above the default character controls, 2000, and High, 3000)
}
