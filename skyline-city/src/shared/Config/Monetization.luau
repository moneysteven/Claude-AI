-- MONETIZATION CONFIG — gamepasses, developer products and VIP perk numbers.
--
-- HOW TO SET UP (see docs/MONETIZATION.md for screenshots-level detail):
--   1. Publish the experience, then create the 4 passes in the Creator Dashboard
--      (Monetization -> Passes). Paste each Pass ID into the matching `Id = 0` below.
--   2. Create one Developer Product per entry in `Products` (Monetization -> Developer Products)
--      and paste each Product ID into its `Id = 0`.
--   3. (Optional) create a VIP badge and paste its id into `VipBadgeId`.
--   4. Set `TestMode = false` before you publish for real.
--
-- Ids left at 0 are "Not configured": the shop shows them greyed out. In Studio with TestMode = true
-- the shop also shows a "Simulate purchase (Studio)" button so you can test every perk without Robux.
-- Simulation is refused by the server outside Studio, whatever this flag says.
--
-- FAIRNESS: Robux buys perks, convenience and style — never cash packs or unbeatable stats.
-- Everything important in SKYLINE CITY can be earned with in-game cash.
--
-- `PriceRobux` is DISPLAY ONLY. The real price is whatever you set on the Creator Dashboard;
-- keep them in sync so players see the right number.

local Monetization = {}

-- true = Studio testing helpers (Simulate purchase). Has NO effect in live servers.
Monetization.TestMode = true

-- Optional Roblox badge awarded to VIP members (0 = no badge).
Monetization.VipBadgeId = 0

---------------------------------------------------------------------------
-- GAMEPASSES (one-time purchases, permanent)
-- Key is used in code (MonetizationService:HasPass(player, Key)) — never rename keys.
---------------------------------------------------------------------------
Monetization.Passes = {
	{
		Key = "VIP",
		Name = "VIP Membership",
		Icon = "👑",
		Description = "The ultimate SKYLINE CITY lifestyle: gold VIP tag, double paychecks, a daily cash bonus and the city's most exclusive spots.",
		PriceRobux = 200, -- display only
		Id = 0, -- <<< paste your VIP gamepass id here
		Color = Color3.fromRGB(255, 196, 40),
		Order = 1,
		Perks = {
			"👑 VIP name tag & gold chat colour",
			"💵 2x paychecks from every job",
			"🎁 Daily VIP cash bonus",
			"🍸 VIP lounge & club access",
			"🏎️ VIP-only cars & colours",
			"🅿️ Free premium parking spot",
			"⏱️ Priority job slots",
			"🛋️ 20% off all furniture",
			"🏗️ Extra build-mode budget space",
			"🏅 VIP badge",
		},
	},
	{
		Key = "ExclusiveApartments",
		Name = "Exclusive Apartments",
		Icon = "🌆",
		Description = "Unlock luxury Sky Apartments high above the city, with skyline views and your own private elevator.",
		PriceRobux = 100, -- display only
		Id = 0, -- <<< paste your Exclusive Apartments gamepass id here
		Color = Color3.fromRGB(120, 92, 255),
		Order = 2,
		Perks = {
			"🌆 Unlocks the Sky Apartment tier",
			"🛗 Private elevator to your floor",
			"🌃 Panoramic skyline views",
		},
	},
	{
		Key = "PremiumCarPark",
		Name = "Premium Car Park",
		Icon = "🏁",
		Description = "A private garage with extra car slots, a showroom display, instant car spawn anywhere and exclusive paints.",
		PriceRobux = 300, -- display only
		Id = 0, -- <<< paste your Premium Car Park gamepass id here
		Color = Color3.fromRGB(64, 156, 255),
		Order = 3,
		Perks = {
			"🏁 Private garage with more car slots",
			"✨ Showroom display for your best ride",
			"⚡ Instant car spawn anywhere",
			"🎨 Exclusive chrome & pearl paints",
		},
	},
	{
		Key = "ExtraHouse",
		Name = "Extra House / Extra Floor",
		Icon = "🏡",
		Description = "Own a second house at the same time and add an extra floor in build mode.",
		PriceRobux = 99, -- display only
		Id = 0, -- <<< paste your Extra House gamepass id here
		Color = Color3.fromRGB(52, 199, 120),
		Order = 4,
		Perks = {
			"🏡 Second house slot",
			"🧱 Extra floor in build mode",
		},
	},
}

---------------------------------------------------------------------------
-- DEVELOPER PRODUCTS (repeatable purchases)
--   Kind = "Clothing"  -> grants Config/Clothing item `ItemId` (permanent; buying again is refused)
--   Kind = "Cosmetic"  -> consumable cosmetic effect (`Effect` = "Fireworks" | "Party"); can be bought again
-- Tab decides which Shop tab it appears in: "Clothing" | "Cosmetics".
---------------------------------------------------------------------------
Monetization.Products = {
	-- Designer outfits
	{ Key = "outfit_midnight_suit", Kind = "Clothing", ItemId = "rx_midnight_suit", Tab = "Clothing", PriceRobux = 99, Id = 0 },
	{ Key = "outfit_neon_streetwear", Kind = "Clothing", ItemId = "rx_neon_streetwear", Tab = "Clothing", PriceRobux = 89, Id = 0 },
	{ Key = "outfit_royal_tracksuit", Kind = "Clothing", ItemId = "rx_royal_tracksuit", Tab = "Clothing", PriceRobux = 79, Id = 0 },
	-- Chains
	{ Key = "chain_gold_cuban", Kind = "Clothing", ItemId = "rx_gold_cuban", Tab = "Clothing", PriceRobux = 79, Id = 0 },
	{ Key = "chain_silver_rope", Kind = "Clothing", ItemId = "rx_silver_rope", Tab = "Clothing", PriceRobux = 59, Id = 0 },
	{ Key = "chain_diamond_pendant", Kind = "Clothing", ItemId = "rx_diamond_pendant", Tab = "Clothing", PriceRobux = 99, Id = 0 },
	-- Watches
	{ Key = "watch_gold_chrono", Kind = "Clothing", ItemId = "rx_gold_chrono", Tab = "Clothing", PriceRobux = 89, Id = 0 },
	{ Key = "watch_iced_out", Kind = "Clothing", ItemId = "rx_iced_watch", Tab = "Clothing", PriceRobux = 99, Id = 0 },
	-- Sunglasses
	{ Key = "shades_aviator_gold", Kind = "Clothing", ItemId = "rx_aviator_gold", Tab = "Clothing", PriceRobux = 49, Id = 0 },
	{ Key = "shades_neon_visor", Kind = "Clothing", ItemId = "rx_neon_visor", Tab = "Clothing", PriceRobux = 59, Id = 0 },
	-- Sneakers
	{ Key = "sneakers_skyhigh_gold", Kind = "Clothing", ItemId = "rx_skyhigh_gold", Tab = "Clothing", PriceRobux = 79, Id = 0 },
	{ Key = "sneakers_lava_runner", Kind = "Clothing", ItemId = "rx_lava_runner", Tab = "Clothing", PriceRobux = 69, Id = 0 },
	-- Hats
	{ Key = "hat_designer_bucket", Kind = "Clothing", ItemId = "rx_designer_bucket", Tab = "Clothing", PriceRobux = 49, Id = 0 },

	-- Cosmetic consumables (visual only — no money, no stats)
	{
		Key = "fireworks_show",
		Kind = "Cosmetic",
		Effect = "Fireworks",
		Tab = "Cosmetics",
		Name = "Fireworks Show",
		Icon = "🎆",
		Description = "Launch a 25-second fireworks show above you that the whole server can see.",
		PriceRobux = 49,
		Id = 0,
	},
	{
		Key = "party_pack",
		Kind = "Cosmetic",
		Effect = "Party",
		Tab = "Cosmetics",
		Name = "Party Pack",
		Icon = "🎉",
		Description = "Confetti blast, a glowing party aura and disco lights around you for 10 minutes.",
		PriceRobux = 29,
		Id = 0,
	},
}

---------------------------------------------------------------------------
-- VIP PERK NUMBERS
---------------------------------------------------------------------------
Monetization.VIP = {
	PayMultiplier = 2, -- applied to Economy:Pay reasons starting with PayReasonPrefix
	PayReasonPrefix = "Job:",
	FurnitureDiscount = 0.8, -- price multiplier for EconomyService:GetPrice(..., "Furniture")
	DiscountCategory = "Furniture",
	DailyCash = 2_500, -- daily VIP cash bonus (claim once per UTC day)
	AreaCheckInterval = 1, -- seconds between "non-VIP inside VIP area" sweeps (anti-exploit)
	AreaEjectMargin = 5, -- studs outside the VIPArea volume a non-VIP player is moved to
	AreaWarnText = "👑 That area is for VIP members only.",
}

---------------------------------------------------------------------------
-- ELEVATORS (Elevator-tagged parts: Attr ToCFrame, optional RequiresPass)
---------------------------------------------------------------------------
Monetization.Elevator = {
	PromptDistance = 10,
	HoldDuration = 0.25,
	Cooldown = 2, -- seconds between rides per player
	-- added to ToCFrame. ToCFrame is already a STANDING position (HumanoidRootPart height, ~3 studs above the
	-- floor), so only a small lift is needed to avoid clipping into the floor.
	ArriveOffset = Vector3.new(0, 0.5, 0),
}

---------------------------------------------------------------------------
-- RECEIPTS
---------------------------------------------------------------------------
Monetization.Receipts = {
	GlobalStoreName = "SkylineCity_Receipts_v1", -- second idempotency layer (keyed by PurchaseId)
	DataWaitSeconds = 20, -- wait this long for the player's data before telling Roblox to retry later
	Retries = 4,
}

---------------------------------------------------------------------------
-- COSMETIC EFFECT TUNING
---------------------------------------------------------------------------
Monetization.Effects = {
	Fireworks = { Duration = 25, Rockets = 22, Height = { 55, 90 }, Spread = 40 },
	Party = { AuraMinutes = 10, ConfettiBursts = 3 },
}

---------------------------------------------------------------------------
-- UI
---------------------------------------------------------------------------
Monetization.UI = {
	HudOrder = 40,
	ShopKey = Enum.KeyCode.F2, -- PC keybind to toggle the Shop
	CelebrationSeconds = 4,
}

---------------------------------------------------------------------------
-- Lookups (built once)
---------------------------------------------------------------------------
Monetization.PassByKey = {}
Monetization.PassById = {}
for _, pass in ipairs(Monetization.Passes) do
	Monetization.PassByKey[pass.Key] = pass
	if pass.Id ~= 0 then
		Monetization.PassById[pass.Id] = pass
	end
end

Monetization.ProductByKey = {}
Monetization.ProductById = {}
for _, product in ipairs(Monetization.Products) do
	Monetization.ProductByKey[product.Key] = product
	if product.Id ~= 0 then
		Monetization.ProductById[product.Id] = product
	end
end

return Monetization
