-- AUDIO CONFIG — paste your own sound asset IDs here ("rbxassetid://123456").
-- Empty strings are safe: code skips sounds with no id. See docs/ASSETS.md for Creator Store search terms.
-- Only use audio you have the rights to (your own uploads or Creator Store audio marked free to use).

return {
	UI = {
		Click = "",
		Notify = "",
		Money = "",
		Error = "",
		PhoneOpen = "",
		MessageReceived = "",
		LevelUp = "",
		Purchase = "",
	},

	Vehicle = {
		EngineIdle = "",
		EngineLoop = "", -- looped; pitch follows RPM
		EngineStart = "",
		Horn = "",
		Indicator = "", -- tick-tock
		DoorOpen = "",
		DoorClose = "",
		WindowMotor = "",
		Skid = "",
		Crash = "",
		LockBeep = "",
		Turbo = "",
		ElectricWhine = "", -- EVs
		Siren = "", -- police / fire / ambulance
	},

	World = {
		Rain = "",
		Thunder = "",
		CityAmbience = "",
		BeachAmbience = "",
		Birds = "",
	},

	Jobs = {
		TaskComplete = "",
		ClockIn = "",
		Cooking = "",
		CashRegister = "",
		Hammer = "",
	},

	-- In-car radio + club music. Each station is a playlist of track ids.
	Radio = {
		{ Id = "skyline_fm", Name = "Skyline FM", Genre = "Pop", Tracks = {} },
		{ Id = "beat_city", Name = "Beat City", Genre = "Hip-Hop", Tracks = {} },
		{ Id = "neon_drive", Name = "Neon Drive", Genre = "Synthwave", Tracks = {} },
		{ Id = "chill_wave", Name = "Chill Wave", Genre = "Lo-fi", Tracks = {} },
		{ Id = "rock_101", Name = "Rock 101", Genre = "Rock", Tracks = {} },
	},

	Club = { Tracks = {} },
}
