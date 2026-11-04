-- TUNING SHOP CONFIG — every price, option and performance multiplier for car customisation.
-- Change numbers here, no code changes needed.
--
-- Prices below are BASE prices for a cheap car. The server multiplies them by the car's price tier
-- (see PriceTiers) so tuning a supercar costs more than tuning a hatchback.
--
-- PERFORMANCE: Tuning.Upgrades[category][level] (level 0 = stock, 1..3 = bought upgrades). The driving
-- code reads these field names exactly: Price, Power, Torque, TopSpeed, Brake, Grip, Stiffness, ShiftTime.
--   Power / Torque / TopSpeed / Brake / Grip / Stiffness : multipliers (1 = stock, 1.1 = +10%)
--   ShiftTime : multiplier on gear-change time (0.7 = shifts take 70% as long)
-- Levels must be bought in order (Engine 1 before Engine 2). Buying several at once charges every level.

local function stock()
	return { Price = 0, Power = 1, Torque = 1, TopSpeed = 1, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 1 }
end

local Tuning = {
	ShopDistance = 40, -- studs: max distance from the player to their car while standing (not driving)
	ZoneMargin = 4, -- studs of slack around a TuningShop zone's bounds
	ZoneHeight = 30, -- zones are treated as at least this tall (flat floor parts work too)
	PromptDistanceExtra = 6, -- prompt reaches this far beyond the zone's half size
	AutoOpenCooldown = 20, -- seconds before the panel auto-opens again after you drive back in

	PriceCategory = "Tuning", -- EconomyService:GetPrice category

	-- Price multiplier by the car's dealership price (first matching row wins)
	PriceTiers = {
		{ MaxCarPrice = 25_000, Mult = 1 },
		{ MaxCarPrice = 75_000, Mult = 1.5 },
		{ MaxCarPrice = 200_000, Mult = 2.25 },
		{ MaxCarPrice = 750_000, Mult = 3.5 },
		{ MaxCarPrice = math.huge, Mult = 5 },
	},

	-- How much of what you spend becomes car Value (net worth)
	ValueFraction = {
		Performance = 0.5, -- 50% of upgrade spend
		Cosmetic = 0.25, -- 25% of paint/rims/kits spend
	},

	---------------------------------------------------------------------------
	-- Performance upgrades
	---------------------------------------------------------------------------
	Upgrades = {
		Engine = {
			[0] = stock(),
			[1] = { Price = 4_000, Power = 1.08, Torque = 1.08, TopSpeed = 1.02, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 1 },
			[2] = { Price = 9_000, Power = 1.16, Torque = 1.15, TopSpeed = 1.04, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 1 },
			[3] = { Price = 18_000, Power = 1.26, Torque = 1.24, TopSpeed = 1.06, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 1 },
		},
		Turbo = {
			[0] = stock(),
			[1] = { Price = 5_000, Power = 1.07, Torque = 1.12, TopSpeed = 1.01, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 1 },
			[2] = { Price = 11_000, Power = 1.14, Torque = 1.22, TopSpeed = 1.03, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 1 },
			[3] = { Price = 22_000, Power = 1.22, Torque = 1.32, TopSpeed = 1.05, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 1 },
		},
		Brakes = {
			[0] = stock(),
			[1] = { Price = 2_500, Power = 1, Torque = 1, TopSpeed = 1, Brake = 1.12, Grip = 1.01, Stiffness = 1, ShiftTime = 1 },
			[2] = { Price = 6_000, Power = 1, Torque = 1, TopSpeed = 1, Brake = 1.24, Grip = 1.02, Stiffness = 1, ShiftTime = 1 },
			[3] = { Price = 12_000, Power = 1, Torque = 1, TopSpeed = 1, Brake = 1.38, Grip = 1.03, Stiffness = 1, ShiftTime = 1 },
		},
		Suspension = {
			[0] = stock(),
			[1] = { Price = 3_000, Power = 1, Torque = 1, TopSpeed = 1, Brake = 1, Grip = 1.05, Stiffness = 1.1, ShiftTime = 1 },
			[2] = { Price = 7_000, Power = 1, Torque = 1, TopSpeed = 1, Brake = 1, Grip = 1.1, Stiffness = 1.2, ShiftTime = 1 },
			[3] = { Price = 14_000, Power = 1, Torque = 1, TopSpeed = 1, Brake = 1, Grip = 1.16, Stiffness = 1.32, ShiftTime = 1 },
		},
		Transmission = {
			[0] = stock(),
			[1] = { Price = 3_500, Power = 1, Torque = 1, TopSpeed = 1.02, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 0.8 },
			[2] = { Price = 8_000, Power = 1, Torque = 1, TopSpeed = 1.04, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 0.65 },
			[3] = { Price = 16_000, Power = 1, Torque = 1, TopSpeed = 1.06, Brake = 1, Grip = 1, Stiffness = 1, ShiftTime = 0.5 },
		},
	},
	UpgradeOrder = { "Engine", "Turbo", "Brakes", "Suspension", "Transmission" },
	UpgradeInfo = {
		Engine = { Name = "Engine", Icon = "⚙️", Blurb = "More horsepower and torque." },
		Turbo = { Name = "Turbo", Icon = "🌀", Blurb = "Boost for big mid-range torque." },
		Brakes = { Name = "Brakes", Icon = "🛑", Blurb = "Stop shorter, brake later." },
		Suspension = { Name = "Suspension", Icon = "🔩", Blurb = "Grip and sharper handling." },
		Transmission = { Name = "Transmission", Icon = "🕹️", Blurb = "Faster gear changes." },
	},
	MaxUpgradeLevel = 3,

	---------------------------------------------------------------------------
	-- Paint
	---------------------------------------------------------------------------
	PaintPrice = 1_500, -- base price for a respray (any colour)
	-- Finish: Material / Reflectance are what the preview (and VehicleService) use to render it.
	Finishes = {
		Gloss = { Name = "Gloss", Price = 0, Material = "SmoothPlastic", Reflectance = 0.08 },
		Matte = { Name = "Matte", Price = 1_200, Material = "Plastic", Reflectance = 0 },
		Metallic = { Name = "Metallic", Price = 1_800, Material = "SmoothPlastic", Reflectance = 0.22 },
		Pearlescent = { Name = "Pearlescent", Price = 3_500, Material = "Glass", Reflectance = 0.3 },
		Chrome = { Name = "Chrome", Price = 6_000, Material = "Foil", Reflectance = 0.55 },
	},
	FinishOrder = { "Gloss", "Matte", "Metallic", "Pearlescent", "Chrome" },

	-- Preset swatches (any custom colour is also allowed via the colour picker)
	Colors = {
		{ Name = "Arctic White", Color = { 236, 238, 242 } },
		{ Name = "Midnight Black", Color = { 22, 23, 28 } },
		{ Name = "Gunmetal", Color = { 84, 88, 98 } },
		{ Name = "Silver Mist", Color = { 180, 184, 192 } },
		{ Name = "Skyline Blue", Color = { 46, 118, 230 } },
		{ Name = "Deep Navy", Color = { 20, 36, 82 } },
		{ Name = "Racing Red", Color = { 200, 30, 36 } },
		{ Name = "Wine", Color = { 110, 20, 40 } },
		{ Name = "Sunset Orange", Color = { 242, 120, 30 } },
		{ Name = "Canary Yellow", Color = { 250, 210, 40 } },
		{ Name = "Lime Rush", Color = { 132, 210, 40 } },
		{ Name = "Forest Green", Color = { 30, 92, 56 } },
		{ Name = "Teal Wave", Color = { 20, 160, 160 } },
		{ Name = "Royal Purple", Color = { 104, 52, 170 } },
		{ Name = "Bubblegum", Color = { 245, 120, 180 } },
		{ Name = "Sand", Color = { 210, 190, 150 } },
	},

	-- Named exclusive paints (colour + finish locked together). Pass = MonetizationService key.
	-- These are cosmetic only.
	ExclusivePaints = {
		{ Id = "ChromeGold", Name = "Chrome Gold", Color = { 232, 186, 64 }, Finish = "Chrome", Pass = "PremiumCarPark", Price = 15_000 },
		{ Id = "GalaxyPearl", Name = "Galaxy Pearlescent", Color = { 70, 40, 150 }, Finish = "Pearlescent", Pass = "PremiumCarPark", Price = 15_000 },
		{ Id = "RoseChrome", Name = "Rose Chrome", Color = { 230, 140, 150 }, Finish = "Chrome", Pass = "PremiumCarPark", Price = 15_000 },
		{ Id = "IcePearl", Name = "Ice Pearl", Color = { 200, 236, 255 }, Finish = "Pearlescent", Pass = "PremiumCarPark", Price = 12_000 },
		{ Id = "VipGold", Name = "VIP Gold Flake", Color = { 255, 196, 40 }, Finish = "Metallic", Pass = "VIP", Price = 8_000 },
		{ Id = "VipOnyx", Name = "VIP Onyx", Color = { 12, 12, 16 }, Finish = "Pearlescent", Pass = "VIP", Price = 8_000 },
		{ Id = "VipNeon", Name = "VIP Neon Mint", Color = { 60, 255, 190 }, Finish = "Metallic", Pass = "VIP", Price = 8_000 },
	},

	---------------------------------------------------------------------------
	-- Wheels
	---------------------------------------------------------------------------
	Rims = {
		{ Id = "Stock", Name = "Stock", Price = 0, Spokes = 5 },
		{ Id = "Spoke5", Name = "Classic 5-Spoke", Price = 1_200, Spokes = 5 },
		{ Id = "Mesh", Name = "Mesh", Price = 1_800, Spokes = 12 },
		{ Id = "Split", Name = "Split Spoke", Price = 2_000, Spokes = 10 },
		{ Id = "Turbine", Name = "Turbine", Price = 2_400, Spokes = 16 },
		{ Id = "DeepDish", Name = "Deep Dish", Price = 2_800, Spokes = 6 },
		{ Id = "Steelie", Name = "Steelie", Price = 600, Spokes = 0 },
		{ Id = "Beadlock", Name = "Offroad Beadlock", Price = 2_600, Spokes = 8 },
		{ Id = "Monoblock", Name = "Monoblock", Price = 3_200, Spokes = 7 },
		{ Id = "Wire", Name = "Wire", Price = 3_000, Spokes = 24 },
		{ Id = "Star", Name = "Star", Price = 2_200, Spokes = 5 },
		{ Id = "Blade", Name = "Blade", Price = 3_600, Spokes = 9 },
		{ Id = "Aero", Name = "Aero Disc", Price = 2_900, Spokes = 0 },
	},
	RimColorPrice = 800,
	DefaultRimColor = { 190, 194, 200 },

	---------------------------------------------------------------------------
	-- Window tint (0 = clear .. 0.9 = limo)
	---------------------------------------------------------------------------
	Tint = {
		{ Level = 0, Name = "Clear", Price = 0 },
		{ Level = 0.2, Name = "Light 20%", Price = 400 },
		{ Level = 0.35, Name = "Medium 35%", Price = 600 },
		{ Level = 0.5, Name = "Dark 50%", Price = 800 },
		{ Level = 0.7, Name = "Darker 70%", Price = 1_000 },
		{ Level = 0.9, Name = "Limo 90%", Price = 1_400 },
	},

	---------------------------------------------------------------------------
	-- Body kits. Classes = allowed car classes ("*" = any); Exclude = classes it never fits.
	-- Class names are matched case-insensitively against Config/Cars Class.
	---------------------------------------------------------------------------
	BodyKits = {
		{ Id = "Stock", Name = "Stock", Price = 0, Classes = "*" },
		{
			Id = "Street",
			Name = "Street",
			Price = 4_000,
			Classes = "*",
			Exclude = { "Truck", "Bus", "Van", "Scooter" },
		},
		{
			Id = "Track",
			Name = "Track",
			Price = 7_500,
			Classes = "*",
			Exclude = { "Truck", "SUV", "Bus", "Van", "Offroad", "Pickup", "Scooter" },
		},
		{
			Id = "Widebody",
			Name = "Widebody",
			Price = 12_000,
			Classes = {
				"Sports", "Supercar", "Hypercar", "Muscle", "Coupe", "Convertible", "Tuner",
				"Sedan", "Compact", "Hatch", "Hatchback", "Classic", "Luxury", "EV",
			},
		},
		{
			Id = "Offroad",
			Name = "Offroad",
			Price = 6_500,
			Classes = { "SUV", "Truck", "Offroad", "Pickup", "Van", "Utility", "Crossover" },
		},
	},

	---------------------------------------------------------------------------
	-- Spoilers
	---------------------------------------------------------------------------
	Spoilers = {
		{ Id = "None", Name = "None", Price = 0 },
		{ Id = "Lip", Name = "Lip", Price = 900 },
		{ Id = "Ducktail", Name = "Ducktail", Price = 1_600 },
		{ Id = "GT", Name = "GT Wing", Price = 3_800 },
		{ Id = "SwanNeck", Name = "Swan Neck", Price = 5_200 },
	},

	---------------------------------------------------------------------------
	-- Lights & plate
	---------------------------------------------------------------------------
	UnderglowPrice = 2_500, -- set or change the underglow colour (removing it is free)
	UnderglowColors = {
		{ Name = "Ice", Color = { 120, 220, 255 } },
		{ Name = "Neon Pink", Color = { 255, 60, 200 } },
		{ Name = "Toxic", Color = { 90, 255, 90 } },
		{ Name = "Violet", Color = { 150, 80, 255 } },
		{ Name = "Ruby", Color = { 255, 40, 60 } },
		{ Name = "Amber", Color = { 255, 170, 30 } },
	},

	PlatePrice = 1_000, -- custom plate text (A-Z, 0-9, space; filtered)
	PlateMaxLength = 8,
}

-- Price multiplier for a car that costs `carPrice` at the dealership.
function Tuning.TierMult(carPrice: number?): number
	local p = type(carPrice) == "number" and carPrice or 0
	for _, row in ipairs(Tuning.PriceTiers) do
		if p <= row.MaxCarPrice then
			return row.Mult
		end
	end
	return 1
end

-- Can body kit `kit` (row from BodyKits) be fitted to a car of `class`?
function Tuning.KitFits(kit: { [string]: any }, class: string?): boolean
	local c = string.lower(tostring(class or ""))
	if type(kit.Exclude) == "table" then
		for _, ex in ipairs(kit.Exclude) do
			if string.lower(ex) == c then
				return false
			end
		end
	end
	if kit.Classes == "*" then
		return true
	end
	if type(kit.Classes) == "table" then
		for _, ok in ipairs(kit.Classes) do
			if string.lower(ok) == c then
				return true
			end
		end
	end
	return false
end

-- Lookup helpers (by Id)
local function index(list: { any }, key: string)
	local out = {}
	for _, row in ipairs(list) do
		out[row[key]] = row
	end
	return out
end

Tuning.RimsById = index(Tuning.Rims, "Id")
Tuning.BodyKitsById = index(Tuning.BodyKits, "Id")
Tuning.SpoilersById = index(Tuning.Spoilers, "Id")
Tuning.ExclusiveById = index(Tuning.ExclusivePaints, "Id")

function Tuning.TintRow(level: number?): { [string]: any }?
	if type(level) ~= "number" then
		return nil
	end
	for _, row in ipairs(Tuning.Tint) do
		if math.abs(row.Level - level) < 0.001 then
			return row
		end
	end
	return nil
end

return Tuning
