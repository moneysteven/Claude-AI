-- AMBIENT CONFIG — lighting, weather visuals, NPC traffic & pedestrians, streetlights and ambience.
-- Every number the world/ambient systems use lives here. Change values; no code changes needed.
-- (Time-of-day length, night hours and weather weights are in Config/World.)

return {
	-- Lighting post effects created by WorldService if missing
	Lighting = {
		Atmosphere = {
			Density = 0.3,
			Offset = 0.25,
			Color = Color3.fromRGB(199, 210, 225),
			Decay = Color3.fromRGB(106, 112, 125),
			Glare = 0.2,
			Haze = 1.2,
		},
		Bloom = { Intensity = 0.55, Size = 24, Threshold = 1.7 },
		ColorCorrection = { Brightness = 0.02, Contrast = 0.06, Saturation = 0.08, TintColor = Color3.fromRGB(255, 252, 246) },
		SunRays = { Intensity = 0.05, Spread = 0.6 },
		Clouds = { Cover = 0.4, Density = 0.4, Color = Color3.fromRGB(255, 255, 255) },
	},

	-- Server weather profiles (targets). The server eases Atmosphere + Clouds toward these at 1 Hz.
	Weather = {
		TransitionSeconds = 25,
		HeavyRainThreshold = 0.7, -- WeatherIntensity above this = heavy rain (thunder)
		Profiles = {
			Clear = { Density = 0.28, Haze = 1.1, Glare = 0.25, CloudCover = 0.38, CloudDensity = 0.35, Intensity = { 0, 0 } },
			Cloudy = { Density = 0.36, Haze = 2, Glare = 0, CloudCover = 0.78, CloudDensity = 0.65, Intensity = { 0, 0 } },
			Rain = { Density = 0.44, Haze = 2.6, Glare = 0, CloudCover = 0.92, CloudDensity = 0.85, Intensity = { 0.45, 1 } },
			Fog = { Density = 0.64, Haze = 3.2, Glare = 0, CloudCover = 0.6, CloudDensity = 0.5, Intensity = { 0, 0 } },
		},
	},

	-- Client rain / wet look / thunder
	Rain = {
		Rate = 1100, -- particles per second at full intensity
		LowGraphicsRate = 300,
		EmitterSize = Vector3.new(90, 1, 90),
		EmitterHeight = 40, -- studs above the camera
		Speed = { 110, 140 },
		IndoorCheckInterval = 0.5, -- seconds between "is there a roof above me" raycasts
		IndoorRayLength = 80,
		Splashes = { PerSecond = 30, LowGraphicsPerSecond = 8, Radius = 40, Pool = 40 },
		ThunderInterval = { 7, 22 }, -- seconds between flashes in heavy rain
		WetSaturation = -0.15,
		WetContrast = 0.06,
		WetExposure = -0.25,
		FogSaturation = -0.08,
		FadeSeconds = 4,
		Volume = 0.45,
	},

	-- Client NPC traffic (cosmetic, local only)
	Traffic = {
		MaxCars = 18,
		LowGraphicsMaxCars = 6,
		SpawnRadius = 300, -- spawn only on nodes within this distance of the camera focus
		MinSpawnDistance = 90, -- ...but not closer than this (no popping in front of you)
		DespawnRadius = 340,
		SpawnInterval = 0.5, -- seconds between spawn attempts
		ObstacleHz = 5, -- obstacle raycasts per second
		LookAhead = 20, -- studs checked in front of each car
		CarGap = 16, -- distance kept behind another NPC car
		Accel = 16,
		Brake = 45,
		StuckDespawnSeconds = 10,
		TurnRate = 7, -- higher = snappier heading changes
		Colors = {
			Color3.fromRGB(235, 235, 238),
			Color3.fromRGB(30, 32, 38),
			Color3.fromRGB(160, 164, 172),
			Color3.fromRGB(190, 40, 44),
			Color3.fromRGB(40, 80, 170),
			Color3.fromRGB(26, 110, 70),
			Color3.fromRGB(240, 196, 40),
			Color3.fromRGB(120, 70, 40),
			Color3.fromRGB(90, 140, 200),
		},
	},

	-- Client NPC pedestrians (cosmetic, local only)
	Pedestrians = {
		Max = 20,
		LowGraphicsMax = 6,
		SpawnRadius = 220,
		MinSpawnDistance = 50,
		DespawnRadius = 260,
		SpawnInterval = 0.6,
		WalkSpeed = { 5, 8 },
		AnimateDistance = 150, -- limbs only swing within this distance
		SwingAngle = 0.55, -- radians
		SkinColors = {
			Color3.fromRGB(255, 220, 190),
			Color3.fromRGB(234, 184, 146),
			Color3.fromRGB(198, 140, 100),
			Color3.fromRGB(141, 95, 63),
			Color3.fromRGB(92, 60, 40),
		},
		ShirtColors = {
			Color3.fromRGB(220, 60, 60),
			Color3.fromRGB(60, 120, 220),
			Color3.fromRGB(240, 240, 240),
			Color3.fromRGB(40, 40, 46),
			Color3.fromRGB(250, 190, 40),
			Color3.fromRGB(120, 200, 120),
			Color3.fromRGB(180, 100, 220),
			Color3.fromRGB(255, 140, 180),
		},
		PantsColors = {
			Color3.fromRGB(40, 50, 90),
			Color3.fromRGB(30, 30, 34),
			Color3.fromRGB(120, 100, 80),
			Color3.fromRGB(80, 84, 92),
			Color3.fromRGB(200, 190, 170),
		},
		HairColors = {
			Color3.fromRGB(30, 22, 18),
			Color3.fromRGB(90, 60, 30),
			Color3.fromRGB(220, 190, 120),
			Color3.fromRGB(160, 60, 30),
			Color3.fromRGB(200, 200, 200),
		},
	},

	-- Client streetlights
	Streetlights = {
		CheckInterval = 1, -- seconds
		ToggleStagger = 2.5, -- lights switch on over this many seconds (looks natural)
		LowGraphicsMaxLit = 24, -- LowGraphics: only the nearest N lights cast light
		LampOn = Color3.fromRGB(255, 214, 150),
		LampOff = Color3.fromRGB(200, 200, 196),
	},

	-- Server zone attributes (District, InSafeZone) and VIP area checks
	Zones = {
		UpdateHz = 2,
		VipEjectCooldown = 3,
	},

	-- Elevators (Elevator-tagged parts get a server ProximityPrompt)
	Elevators = {
		PromptDistance = 9,
		Cooldown = 2, -- seconds between rides per player
	},

	-- Client district ambience loops (ids in Config/Audio.World; empty ids are skipped)
	Ambience = {
		Volume = 0.3,
		FadeSeconds = 2.5,
		ByDistrict = {
			Beach = "BeachAmbience",
			Park = "Birds",
			Suburbs = "Birds",
		},
		Default = "CityAmbience",
	},
}
