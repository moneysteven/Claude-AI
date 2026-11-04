-- The shape of every player's saved data.
-- RULES (keep DataStore-safe):
--   * Dictionary keys are ALWAYS strings (never numbers) and never contain "."
--   * Arrays are pure arrays (1..n with no gaps)
--   * Only numbers, strings, booleans and tables. Colors are stored as {R,G,B} 0-255.
--   * Every owned asset carries `Value` (what it is worth) so WealthService can compute net worth.
-- New keys added here are automatically filled into old saves (Table.Reconcile).

local Economy = require(script.Parent.Config.Economy)

return {
	Version = 1,

	Cash = Economy.StartingCash,
	Bank = Economy.StartingBank,
	Savings = 0,
	SavingsInterestCarry = 0, -- fractional seconds of playtime not yet paid interest

	Stats = {
		TotalEarned = 0,
		TotalSpent = 0,
		PlaytimeSeconds = 0,
		Joins = 0,
		FirstJoin = 0,
		Mileage = 0, -- studs driven across all cars
		TasksCompleted = 0,
	},

	-- Jobs[jobId] = { Level = 1, XP = 0, Tasks = 0 }
	Jobs = {},

	Housing = {
		-- Rented = { TierId = "Studio", Since = 0, MissedPayments = 0 } or false
		Rented = { TierId = "Studio", Since = 0, MissedPayments = 0 },
		-- Owned[houseId] = { TierId, Value, Name, Build = { Version=1, Items = {...} }, Locked = false,
		--                   Roommates = { [userIdString] = true }, Builders = { [userIdString] = true },
		--                   Floors = 1, Listing = false | { Mode="Sale"|"Rent", Price } }
		Owned = {},
		ActiveHouseId = "", -- "" means use the rented home
		ExtraSlots = 0, -- extra house slots (from gamepass)
		NextHouseNumber = 1,
	},

	-- Vehicles[carUid] = { ModelId, Value, Paint = { Color = {R,G,B}, Finish = "Gloss"|"Matte"|"Metallic"|"Chrome" },
	--   Rims = "Stock", RimColor = {R,G,B}, Tint = 0, BodyKit = "Stock", Spoiler = "None",
	--   Underglow = false | {R,G,B}, Plate = "SKY 001",
	--   Upgrades = { Engine = 0, Turbo = 0, Brakes = 0, Suspension = 0, Transmission = 0 },
	--   Fuel = 1 (0..1), Mileage = 0, Health = 100, PurchasedAt = os.time(),
	--   Finance = false | { Remaining = n, Payment = n, PaymentsLeft = n } }
	Vehicles = {},
	NextVehicleNumber = 1,
	FavoriteVehicle = "",

	-- Businesses[bizId] = { TypeId, LotId, Name, Value, Level = 1, Upgrades = { [upgradeId] = level },
	--   Prices = { [productId] = price }, Staff = { npc = n }, Stock = n, Vault = 0,
	--   Build = { Version=1, Items = {...} }, Open = false }
	Businesses = {},
	NextBusinessNumber = 1,

	Inventory = {}, -- [itemId] = count

	Clothing = {
		Owned = {}, -- [itemId] = true
		Equipped = {}, -- [slot] = itemId
	},

	Gamepasses = {}, -- [passKey] = true (cache; MarketplaceService is checked too)
	Purchases = {}, -- array of processed PurchaseIds (most recent last). Server only, not replicated.

	Settings = {
		MusicVolume = 0.5,
		SfxVolume = 0.8,
		RadioVolume = 0.6,
		ShowNameTags = true,
		LowGraphics = false,
		CameraShake = true,
		Units = "MPH", -- "MPH" | "KMH"
		ManualTransmission = false,
		HideVipChatTag = false,
	},

	Social = {
		Bio = "",
		RPName = "",
		Blocked = {}, -- [userIdString] = true
		Contacts = {}, -- [userIdString] = nickname
		GroupId = "", -- family / friend group
		GroupName = "", -- name of that group (so it can be re-formed in a new server)
	},

	Daily = {
		LastClaimDay = 0, -- os.time() // 86400 of last claim
		Streak = 0,
		LastVipClaimDay = 0,
		SendDay = 0, -- UTC day (os.time() // 86400) of SentToday below
		SentToday = 0, -- bank money sent to other players on SendDay (daily send limit)
	},

	Wealth = {
		HighestTier = 1,
		Claimed = {}, -- [tierIdString] = true
	},

	Tutorial = {
		Done = false,
		Step = 1,
	},
}
