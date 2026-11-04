-- EVENTS CONFIG — rotating server-wide city events (EventService).
--
-- Every IntervalMinutes (random range) a new event starts, chosen by Weight from List.
-- Event fields:
--   Id / Name / Icon / Description
--   DurationMinutes  real minutes the event lasts
--   Weight           chance weight when picking the next event
--   NightOnly        only start while it is night in-game (Fireworks)
--   PayMultiplier    multiplies paychecks whose reason starts with PayReasonPrefix (Double Pay)
--   Discount         fraction off prices in PriceCategory (Sale Weekend: 0.10 = 10% off furniture)
--   Zone             PartyZone attribute "Zone" activated during the event (Beach Party)
--   Spot             key into CityLayout.EventSpots (map marker + client effects)
--   FeedText         phone feed post when the event starts ({name} is replaced)

return {
	IntervalMinutes = { 20, 30 }, -- time from one event start to the next
	FirstEventDelayMinutes = { 5, 9 }, -- first event after server start
	AvoidRepeat = true, -- never run the same event twice in a row

	-- Double Pay safety: the event modifier never pushes the total pay multiplier above this,
	-- assuming VIP's own modifier (registered by MonetizationService) is AssumedVipMultiplier.
	MaxTotalPayMultiplier = 4,
	AssumedVipMultiplier = 2,

	List = {
		{
			Id = "DoublePay",
			Name = "Double Pay Hour",
			Icon = "💸",
			Description = "Every job paycheck is doubled. Clock in and get paid!",
			DurationMinutes = 8,
			Weight = 30,
			PayMultiplier = 2,
			PayReasonPrefix = "Job:",
			FeedText = "💸 DOUBLE PAY HOUR has started! Every job pays 2x — clock in now.",
		},
		{
			Id = "CarMeet",
			Name = "Car Meet",
			Icon = "🏁",
			Description = "Show off your ride at the AutoStrip Meet Lot.",
			DurationMinutes = 10,
			Weight = 20,
			Spot = "CarMeet",
			FeedText = "🏁 Car meet at the AutoStrip Meet Lot! Bring your cleanest build.",
		},
		{
			Id = "BeachParty",
			Name = "Beach Party",
			Icon = "🏖️",
			Description = "Music, confetti and good vibes at Skyline Beach.",
			DurationMinutes = 10,
			Weight = 20,
			Zone = "Beach",
			Spot = "BeachParty",
			FeedText = "🏖️ BEACH PARTY at Skyline Beach! DJ is live — come dance.",
		},
		{
			Id = "Fireworks",
			Name = "Fireworks Night",
			Icon = "🎆",
			Description = "Look up! Fireworks over Central Park and the beach.",
			DurationMinutes = 6,
			Weight = 15,
			NightOnly = true,
			Spot = "Fireworks",
			FeedText = "🎆 Fireworks Night! Best views from Central Park and Skyline Beach.",
		},
		{
			Id = "SaleWeekend",
			Name = "Sale Weekend",
			Icon = "🛋️",
			Description = "10% off all furniture while the sale lasts.",
			DurationMinutes = 12,
			Weight = 15,
			Discount = 0.10,
			PriceCategory = "Furniture",
			FeedText = "🛋️ SALE WEEKEND: 10% off all furniture. Time to redecorate!",
		},
	},

	-- Client UI
	UI = {
		Key = Enum.KeyCode.F4, -- PC keybind: open the City Events panel
		GamepadKey = Enum.KeyCode.DPadRight, -- gamepad: toggle the panel while an event is running (D-pad up is the player-interact prompt)
		PanelSize = Vector2.new(520, 540),
	},

	-- Client effects
	Banner = { Seconds = 8 }, -- event start banner stays this long
	Fireworks = {
		LaunchInterval = { 0.35, 1.2 }, -- seconds between rockets
		MaxRockets = 6, -- simultaneous rockets
		LowGraphicsMaxRockets = 2,
		RiseSpeed = { 90, 120 },
		BurstHeight = { 110, 170 },
		ViewDistance = 1400, -- fireworks only run if you are this close to a launch site
		Colors = {
			Color3.fromRGB(255, 80, 80),
			Color3.fromRGB(80, 200, 255),
			Color3.fromRGB(255, 220, 60),
			Color3.fromRGB(140, 255, 120),
			Color3.fromRGB(220, 120, 255),
			Color3.fromRGB(255, 255, 255),
		},
	},
	Confetti = {
		Rate = 35,
		LowGraphicsRate = 10,
		Colors = {
			Color3.fromRGB(255, 90, 120),
			Color3.fromRGB(90, 200, 255),
			Color3.fromRGB(255, 220, 70),
			Color3.fromRGB(120, 240, 140),
		},
	},
	PartyMusicVolume = 0.5,
	CarMeetViewDistance = 450, -- cosmetic meet cars spawn when you are this close
}
