-- CLOTHING CONFIG — the wardrobe catalog (cash items + Robux exclusives).
--
-- Each item:
--   Id          unique string id (letters, digits, underscore). Saved in data — never rename after launch.
--   Name, Icon  display
--   Slot        "Shirt" | "Pants" | "Hat" | "Glasses" | "Neck" | "Wrist" | "Shoes" | "Outfit"
--               (an Outfit covers Shirt + Pants; equipping one removes the other)
--   Style       how the procedural greybox version is built (see list per slot below)
--   Price       cash price at a ClothingStore (0 + Starter = true -> everyone owns it)
--   ProductKey  Robux exclusive: key in Config/Monetization.Products (no cash price)
--   Colors      { Primary = {R,G,B}, Secondary = {R,G,B}?, Accent = {R,G,B}? } (0-255)
--   Material    Enum.Material name for the main parts (default "SmoothPlastic"; accessories e.g. "Metal", "Foil", "Neon")
--   AssetId     0 = procedural. Otherwise a Roblox catalog accessory id (loaded with InsertService; only works for
--               assets your account/group owns or Roblox-created ones). A model named <Id> in
--               ServerStorage.Assets.Clothing always wins over both.
--   ShirtTemplate / PantsTemplate   0 = procedural tint. Otherwise an uploaded CLOTHING TEMPLATE image id
--               (rbxassetid) used for a real Shirt / Pants instance (Shirt, Pants and Outfit slots).
--
-- Styles:
--   Shirt  Tee, Hoodie, Polo, Tank          Pants  Jeans, Shorts, Joggers, Chinos
--   Hat    Cap, Beanie, Bucket, Fedora      Glasses Shades, Aviator, Visor
--   Neck   Chain, Rope, Pendant             Wrist  Watch, Bracelet
--   Shoes  Sneakers, HighTops, Boots        Outfit Suit, Tracksuit, Streetwear

local Clothing = {}

Clothing.Slots = { "Outfit", "Shirt", "Pants", "Hat", "Glasses", "Neck", "Wrist", "Shoes" }

Clothing.SlotInfo = {
	Outfit = { Name = "Outfits", Icon = "🕴️" },
	Shirt = { Name = "Tops", Icon = "👕" },
	Pants = { Name = "Bottoms", Icon = "👖" },
	Hat = { Name = "Hats", Icon = "🧢" },
	Glasses = { Name = "Eyewear", Icon = "🕶️" },
	Neck = { Name = "Chains", Icon = "📿" },
	Wrist = { Name = "Watches", Icon = "⌚" },
	Shoes = { Name = "Shoes", Icon = "👟" },
}

-- Store rules
Clothing.StoreDistance = 18 -- studs from a ClothingStore-tagged part to buy with cash
Clothing.PromptDistance = 10
Clothing.PriceCategory = "Clothing" -- EconomyService:GetPrice category (lets events/discounts apply)
Clothing.AppearanceWait = 6 -- seconds to wait for the Roblox avatar to load before dressing a new character
Clothing.EquipCooldown = 0.4 -- seconds between equip changes per player

local function rgb(r: number, g: number, b: number)
	return { r, g, b }
end

Clothing.Items = {
	---------------------------------------------------------------------------
	-- STARTER (free, everyone owns them)
	---------------------------------------------------------------------------
	{ Id = "starter_tee", Name = "Plain White Tee", Icon = "👕", Slot = "Shirt", Style = "Tee", Price = 0, Starter = true,
		Colors = { Primary = rgb(236, 236, 236) } },
	{ Id = "starter_jeans", Name = "Classic Blue Jeans", Icon = "👖", Slot = "Pants", Style = "Jeans", Price = 0, Starter = true,
		Colors = { Primary = rgb(52, 82, 140), Secondary = rgb(40, 62, 110) } },
	{ Id = "starter_sneakers", Name = "Canvas Sneakers", Icon = "👟", Slot = "Shoes", Style = "Sneakers", Price = 0, Starter = true,
		Colors = { Primary = rgb(240, 240, 240), Secondary = rgb(250, 250, 250) } },

	---------------------------------------------------------------------------
	-- CASH: tops
	---------------------------------------------------------------------------
	{ Id = "tee_black", Name = "Midnight Tee", Icon = "👕", Slot = "Shirt", Style = "Tee", Price = 150,
		Colors = { Primary = rgb(28, 28, 32), Secondary = rgb(200, 200, 210) } },
	{ Id = "tee_skyline", Name = "Skyline Logo Tee", Icon = "👕", Slot = "Shirt", Style = "Tee", Price = 300,
		Colors = { Primary = rgb(64, 156, 255), Secondary = rgb(255, 255, 255) } },
	{ Id = "tee_sunset", Name = "Sunset Stripe Tee", Icon = "👕", Slot = "Shirt", Style = "Tee", Price = 350,
		Colors = { Primary = rgb(255, 140, 60), Secondary = rgb(255, 210, 90) } },
	{ Id = "tank_gym", Name = "Gym Tank", Icon = "🎽", Slot = "Shirt", Style = "Tank", Price = 200,
		Colors = { Primary = rgb(210, 40, 50) } },
	{ Id = "polo_navy", Name = "Country Club Polo", Icon = "👔", Slot = "Shirt", Style = "Polo", Price = 650,
		Colors = { Primary = rgb(28, 40, 80), Secondary = rgb(240, 240, 240) } },
	{ Id = "hoodie_grey", Name = "Heather Hoodie", Icon = "🧥", Slot = "Shirt", Style = "Hoodie", Price = 600,
		Colors = { Primary = rgb(140, 140, 148), Secondary = rgb(110, 110, 118) } },
	{ Id = "hoodie_mint", Name = "Mint Cloud Hoodie", Icon = "🧥", Slot = "Shirt", Style = "Hoodie", Price = 900,
		Colors = { Primary = rgb(150, 230, 200), Secondary = rgb(255, 255, 255) } },
	{ Id = "hoodie_flame", Name = "Flame Hoodie", Icon = "🧥", Slot = "Shirt", Style = "Hoodie", Price = 1_200,
		Colors = { Primary = rgb(30, 30, 34), Secondary = rgb(255, 110, 40) } },

	---------------------------------------------------------------------------
	-- CASH: bottoms
	---------------------------------------------------------------------------
	{ Id = "jeans_black", Name = "Black Skinny Jeans", Icon = "👖", Slot = "Pants", Style = "Jeans", Price = 400,
		Colors = { Primary = rgb(30, 30, 36), Secondary = rgb(50, 50, 58) } },
	{ Id = "jeans_ripped", Name = "Ripped Light Jeans", Icon = "👖", Slot = "Pants", Style = "Jeans", Price = 700,
		Colors = { Primary = rgb(130, 160, 205), Secondary = rgb(235, 235, 235) } },
	{ Id = "shorts_beach", Name = "Beach Shorts", Icon = "🩳", Slot = "Pants", Style = "Shorts", Price = 250,
		Colors = { Primary = rgb(40, 190, 200), Secondary = rgb(255, 230, 120) } },
	{ Id = "joggers_grey", Name = "Comfy Joggers", Icon = "👖", Slot = "Pants", Style = "Joggers", Price = 450,
		Colors = { Primary = rgb(120, 120, 128), Secondary = rgb(230, 230, 230) } },
	{ Id = "chinos_khaki", Name = "Khaki Chinos", Icon = "👖", Slot = "Pants", Style = "Chinos", Price = 550,
		Colors = { Primary = rgb(196, 170, 120) } },

	---------------------------------------------------------------------------
	-- CASH: shoes
	---------------------------------------------------------------------------
	{ Id = "sneakers_runner", Name = "Street Runners", Icon = "👟", Slot = "Shoes", Style = "Sneakers", Price = 800,
		Colors = { Primary = rgb(30, 30, 34), Secondary = rgb(255, 255, 255), Accent = rgb(255, 80, 80) } },
	{ Id = "hightops_red", Name = "Court High-Tops", Icon = "👟", Slot = "Shoes", Style = "HighTops", Price = 1_500,
		Colors = { Primary = rgb(200, 30, 40), Secondary = rgb(245, 245, 245), Accent = rgb(20, 20, 20) } },
	{ Id = "boots_work", Name = "Work Boots", Icon = "🥾", Slot = "Shoes", Style = "Boots", Price = 1_100,
		Colors = { Primary = rgb(140, 92, 50), Secondary = rgb(50, 36, 24) } },
	{ Id = "sneakers_cloud", Name = "Cloud Walkers", Icon = "👟", Slot = "Shoes", Style = "Sneakers", Price = 3_500,
		Colors = { Primary = rgb(250, 250, 255), Secondary = rgb(180, 210, 255), Accent = rgb(120, 92, 255) } },

	---------------------------------------------------------------------------
	-- CASH: hats & glasses
	---------------------------------------------------------------------------
	{ Id = "cap_blue", Name = "Skyline Cap", Icon = "🧢", Slot = "Hat", Style = "Cap", Price = 200,
		Colors = { Primary = rgb(64, 156, 255), Secondary = rgb(255, 255, 255) } },
	{ Id = "cap_black", Name = "Blackout Cap", Icon = "🧢", Slot = "Hat", Style = "Cap", Price = 250,
		Colors = { Primary = rgb(24, 24, 28), Secondary = rgb(24, 24, 28) } },
	{ Id = "beanie_red", Name = "Cozy Beanie", Icon = "🧶", Slot = "Hat", Style = "Beanie", Price = 300,
		Colors = { Primary = rgb(190, 40, 50), Secondary = rgb(240, 240, 240) } },
	{ Id = "fedora_grey", Name = "City Fedora", Icon = "🎩", Slot = "Hat", Style = "Fedora", Price = 1_800,
		Colors = { Primary = rgb(80, 80, 90), Secondary = rgb(20, 20, 24) } },
	{ Id = "shades_black", Name = "Classic Shades", Icon = "🕶️", Slot = "Glasses", Style = "Shades", Price = 1_200,
		Colors = { Primary = rgb(20, 20, 24), Secondary = rgb(10, 10, 14) } },

	---------------------------------------------------------------------------
	-- CASH: jewellery (cash players get bling too)
	---------------------------------------------------------------------------
	{ Id = "chain_silver_basic", Name = "Silver Chain", Icon = "📿", Slot = "Neck", Style = "Chain", Price = 5_000,
		Material = "Metal", Colors = { Primary = rgb(200, 204, 212) } },
	{ Id = "watch_steel", Name = "Steel Watch", Icon = "⌚", Slot = "Wrist", Style = "Watch", Price = 8_000,
		Material = "Metal", Colors = { Primary = rgb(170, 175, 185), Secondary = rgb(20, 30, 50) } },
	{ Id = "bracelet_leather", Name = "Leather Bracelet", Icon = "🧵", Slot = "Wrist", Style = "Bracelet", Price = 900,
		Colors = { Primary = rgb(110, 70, 40) } },

	---------------------------------------------------------------------------
	-- ROBUX EXCLUSIVES (granted by developer products in Config/Monetization)
	---------------------------------------------------------------------------
	{ Id = "rx_midnight_suit", Name = "Midnight Designer Suit", Icon = "🕴️", Slot = "Outfit", Style = "Suit",
		ProductKey = "outfit_midnight_suit", Rarity = "Designer",
		Colors = { Primary = rgb(18, 20, 32), Secondary = rgb(240, 240, 245), Accent = rgb(200, 30, 60) } },
	{ Id = "rx_neon_streetwear", Name = "Neon Streetwear Set", Icon = "🧑‍🎤", Slot = "Outfit", Style = "Streetwear",
		ProductKey = "outfit_neon_streetwear", Rarity = "Designer",
		Colors = { Primary = rgb(20, 20, 26), Secondary = rgb(60, 255, 190), Accent = rgb(255, 60, 200) } },
	{ Id = "rx_royal_tracksuit", Name = "Royal Velvet Tracksuit", Icon = "🥇", Slot = "Outfit", Style = "Tracksuit",
		ProductKey = "outfit_royal_tracksuit", Rarity = "Designer",
		Colors = { Primary = rgb(70, 30, 130), Secondary = rgb(255, 196, 40) } },
	{ Id = "rx_gold_cuban", Name = "Gold Cuban Chain", Icon = "📿", Slot = "Neck", Style = "Chain",
		ProductKey = "chain_gold_cuban", Rarity = "Luxury", Material = "Foil",
		Colors = { Primary = rgb(255, 196, 40) } },
	{ Id = "rx_silver_rope", Name = "Iced Silver Rope", Icon = "📿", Slot = "Neck", Style = "Rope",
		ProductKey = "chain_silver_rope", Rarity = "Luxury", Material = "Metal",
		Colors = { Primary = rgb(225, 230, 240), Accent = rgb(180, 230, 255) } },
	{ Id = "rx_diamond_pendant", Name = "Diamond Skyline Pendant", Icon = "💎", Slot = "Neck", Style = "Pendant",
		ProductKey = "chain_diamond_pendant", Rarity = "Legendary", Material = "Foil",
		Colors = { Primary = rgb(255, 210, 80), Accent = rgb(170, 230, 255) } },
	{ Id = "rx_gold_chrono", Name = "Gold Chronograph", Icon = "⌚", Slot = "Wrist", Style = "Watch",
		ProductKey = "watch_gold_chrono", Rarity = "Luxury", Material = "Foil",
		Colors = { Primary = rgb(255, 196, 40), Secondary = rgb(20, 20, 24) } },
	{ Id = "rx_iced_watch", Name = "Iced-Out Watch", Icon = "💎", Slot = "Wrist", Style = "Watch",
		ProductKey = "watch_iced_out", Rarity = "Legendary", Material = "Metal",
		Colors = { Primary = rgb(230, 236, 245), Secondary = rgb(150, 220, 255), Accent = rgb(170, 230, 255) } },
	{ Id = "rx_aviator_gold", Name = "Gold Aviators", Icon = "🕶️", Slot = "Glasses", Style = "Aviator",
		ProductKey = "shades_aviator_gold", Rarity = "Luxury",
		Colors = { Primary = rgb(255, 196, 40), Secondary = rgb(90, 60, 30) } },
	{ Id = "rx_neon_visor", Name = "Neon Visor", Icon = "🥽", Slot = "Glasses", Style = "Visor",
		ProductKey = "shades_neon_visor", Rarity = "Designer", Material = "Neon",
		Colors = { Primary = rgb(30, 30, 36), Secondary = rgb(60, 255, 190) } },
	{ Id = "rx_skyhigh_gold", Name = "SkyHigh Gold Sneakers", Icon = "👟", Slot = "Shoes", Style = "HighTops",
		ProductKey = "sneakers_skyhigh_gold", Rarity = "Limited",
		Colors = { Primary = rgb(255, 196, 40), Secondary = rgb(255, 255, 255), Accent = rgb(20, 20, 24) } },
	{ Id = "rx_lava_runner", Name = "Lava Runners", Icon = "🔥", Slot = "Shoes", Style = "Sneakers",
		ProductKey = "sneakers_lava_runner", Rarity = "Limited",
		Colors = { Primary = rgb(30, 20, 20), Secondary = rgb(255, 90, 20), Accent = rgb(255, 200, 40) } },
	{ Id = "rx_designer_bucket", Name = "Monogram Bucket Hat", Icon = "👒", Slot = "Hat", Style = "Bucket",
		ProductKey = "hat_designer_bucket", Rarity = "Designer",
		Colors = { Primary = rgb(150, 110, 70), Secondary = rgb(255, 210, 120) } },
}

-- Rarity label colours (UI)
Clothing.RarityColors = {
	Designer = Color3.fromRGB(120, 92, 255),
	Luxury = Color3.fromRGB(255, 196, 40),
	Legendary = Color3.fromRGB(255, 90, 140),
	Limited = Color3.fromRGB(255, 120, 40),
}

-- UI
Clothing.UI = {
	HudOrder = 45,
	WardrobeKey = Enum.KeyCode.F3, -- PC keybind to toggle the Wardrobe
}

---------------------------------------------------------------------------
-- Lookups
---------------------------------------------------------------------------
Clothing.ById = {}
Clothing.SlotSet = {}
for i, slot in ipairs(Clothing.Slots) do
	Clothing.SlotSet[slot] = i
end
for i, item in ipairs(Clothing.Items) do
	item.Order = i
	Clothing.ById[item.Id] = item
	assert(Clothing.SlotSet[item.Slot], "Config.Clothing: bad slot on " .. item.Id)
end

return Clothing
