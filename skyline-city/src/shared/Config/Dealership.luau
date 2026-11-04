-- DEALERSHIP CONFIG — prices come from Config/Cars; everything ELSE about buying cars lives here.
-- Change numbers here, no code changes needed. Server is authoritative: the client only reads this
-- file to draw the finance calculator, the server recomputes every number on purchase.

local Dealership = {
	---------------------------------------------------------------------------
	-- Interaction
	---------------------------------------------------------------------------
	UseDistance = 28, -- studs: max distance from a Dealership counter / display pad to buy or test drive
	PromptDistance = 12, -- ProximityPrompt activation distance on counters
	DisplayPromptDistance = 14, -- ProximityPrompt activation distance on display pads
	PromptHoldDuration = 0, -- seconds to hold E / ButtonX (0 = tap)

	-- Max cars a player may own (sanity cap; VehicleService may enforce its own garage limit too).
	MaxOwnedCars = 25,
	PremiumCarParkBonusCars = 25, -- extra garage slots with the PremiumCarPark pass

	-- Price category passed to EconomyService:GetPrice (lets events / passes register discounts)
	PriceCategory = "Car",

	---------------------------------------------------------------------------
	-- Showroom display pads (DealershipDisplay tag)
	---------------------------------------------------------------------------
	Displays = {
		RotateMinutes = 10, -- featured cars change every N real minutes
		HeightOffset = 0.2, -- studs above the pad's top surface
		PreferExpensive = 0.6, -- 0..1 chance a slot picks from the top-priced half (showrooms look better)
		ClientTurntable = true, -- clients spin display cars slowly (client-side only, no physics)
		TurntableDegreesPerSecond = 12,
		TurntableRadius = 160, -- only spin when the camera is this close (studs)
	},

	---------------------------------------------------------------------------
	-- Paint you can choose when ordering a car (the Tuning shop has the full catalog)
	---------------------------------------------------------------------------
	Colors = {
		{ Name = "Arctic White", Color = { 236, 238, 242 } },
		{ Name = "Midnight Black", Color = { 22, 23, 28 } },
		{ Name = "Gunmetal", Color = { 84, 88, 98 } },
		{ Name = "Silver Mist", Color = { 180, 184, 192 } },
		{ Name = "Skyline Blue", Color = { 46, 118, 230 } },
		{ Name = "Racing Red", Color = { 200, 30, 36 } },
		{ Name = "Sunset Orange", Color = { 242, 120, 30 } },
		{ Name = "Lime Rush", Color = { 132, 210, 40 } },
		{ Name = "Forest Green", Color = { 30, 92, 56 } },
		{ Name = "Royal Purple", Color = { 104, 52, 170 } },
		{ Name = "Canary Yellow", Color = { 250, 210, 40 } },
		{ Name = "Bubblegum", Color = { 245, 120, 180 } },
	},
	-- Factory finishes at purchase. Cost = flat extra dollars (scaled by EconomyService price modifiers).
	Finishes = {
		Gloss = { Name = "Gloss", Extra = 0 },
		Metallic = { Name = "Metallic", Extra = 1_500 },
		Matte = { Name = "Matte", Extra = 2_500 },
	},
	FinishOrder = { "Gloss", "Metallic", "Matte" },

	-- Custom plate at purchase (A-Z, 0-9, space; filtered). Empty = random "SKY 123" style plate.
	PlateMaxLength = 8,
	PlatePrefix = "SKY",

	---------------------------------------------------------------------------
	-- Trade-in
	---------------------------------------------------------------------------
	TradeIn = {
		Fraction = 0.75, -- trade-in credit = VehicleService:GetCarValue(car) * Fraction
		MinValue = 100, -- cars worth less than this can't be traded in
	},

	---------------------------------------------------------------------------
	-- Finance (car loans)
	---------------------------------------------------------------------------
	Finance = {
		Enabled = true,
		MinCarPrice = 8_000, -- cars cheaper than this are cash only
		DownPaymentPct = 0.20, -- 20% down (trade-in credit counts towards it)
		InterestPct = 0.12, -- flat interest added to the financed amount (12%)
		PaymentOptions = { 5, 10, 15 }, -- number of daily payments the buyer can choose
		DefaultPayments = 10,
		MaxFinancedCars = 2, -- at the same time
		VipBonusFinancedCars = 1,
		-- Credit limit = BaseCredit + NetWorth * NetWorthFactor (clamped to MaxCredit).
		-- Outstanding balances of other loans are subtracted from it.
		BaseCredit = 25_000,
		NetWorthFactor = 1.5,
		MaxCredit = 50_000_000,
		-- Payments are charged every in-game day (WorldService.DayChanged). Fallback timer if WorldService is missing:
		FallbackDayMinutes = 24,
		FirstPaymentGraceSeconds = 300, -- no payment is due within 5 real minutes of buying
		MissedLimit = 3, -- missed payments before the car is repossessed
		LateFeePct = 0.05, -- added to the balance each time a payment is missed (5% of one payment)
		SenderName = "Skyline Auto Finance", -- phone message sender
	},

	---------------------------------------------------------------------------
	-- Test drives
	---------------------------------------------------------------------------
	TestDrive = {
		Seconds = 90,
		CooldownSeconds = 60,
		AllowVipCars = true, -- everyone may test drive VIP cars (good upsell; buying still needs VIP)
		SpawnSearchRadius = 700, -- nearest TestDriveSpawn within this range of the dealership is used
		FallbackSpawnOffset = 24, -- studs in front of the counter when there is no TestDriveSpawn
		MaxDistanceFromStart = 3000, -- ends the drive early if the car goes further than this (studs)
		AntiExploitWhitelistSeconds = 6,
	},

	---------------------------------------------------------------------------
	-- Catalog stats
	---------------------------------------------------------------------------
	-- 0-60 mph estimate (seconds) when a car has no Stats.ZeroToSixty: Base + Factor * (Mass / Horsepower)
	ZeroToSixty = { Base = 1.2, Factor = 0.9, Min = 1.9, Max = 20 },
	-- Stat bar maxima (bars fill to 100% at these values)
	StatBars = { Horsepower = 1200, TopSpeed = 260, ZeroToSixty = 12, Seats = 8 },

	-- Sort options shown in the catalog
	SortOptions = {
		{ Id = "PriceAsc", Name = "Price ↑" },
		{ Id = "PriceDesc", Name = "Price ↓" },
		{ Id = "Speed", Name = "Top speed" },
		{ Id = "Power", Name = "Horsepower" },
		{ Id = "Name", Name = "Name" },
	},
}

-- Quote helper used by BOTH client (calculator) and server (real purchase) so they always agree.
--   price       = car price after modifiers + finish extra
--   tradeCredit = trade-in credit (already reduced by the traded car's outstanding loan)
--   payments    = number of daily payments
-- Returns { Total, TradeCredit, Down, Financed, TotalOwed, Payment, Payments, DueNow }
function Dealership.Quote(price: number, tradeCredit: number, payments: number?)
	local F = Dealership.Finance
	local n = payments or F.DefaultPayments
	local credit = math.max(0, math.floor(tradeCredit or 0))
	local total = math.max(0, math.floor(price))
	local downRequired = math.ceil(total * F.DownPaymentPct)
	local down = math.max(0, downRequired - credit)
	local financed = math.max(0, total - credit - down)
	local owed = math.ceil(financed * (1 + F.InterestPct))
	local payment = n > 0 and math.ceil(owed / n) or owed
	return {
		Total = total,
		TradeCredit = credit,
		Down = down,
		Financed = financed,
		TotalOwed = owed,
		Payment = payment,
		Payments = n,
		DueNow = down,
	}
end

-- 0-60 estimate in seconds from a car definition's Stats.
function Dealership.EstimateZeroToSixty(stats: { [string]: any }?): number
	local Z = Dealership.ZeroToSixty
	if type(stats) ~= "table" then
		return Z.Max
	end
	if type(stats.ZeroToSixty) == "number" and stats.ZeroToSixty > 0 then
		return stats.ZeroToSixty
	end
	local hp = type(stats.Horsepower) == "number" and stats.Horsepower or 150
	local mass = type(stats.Mass) == "number" and stats.Mass or 1400
	local t = Z.Base + Z.Factor * (mass / math.max(1, hp))
	return math.clamp(math.floor(t * 10 + 0.5) / 10, Z.Min, Z.Max)
end

return Dealership
