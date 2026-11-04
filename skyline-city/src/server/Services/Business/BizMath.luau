-- BizMath (server helper): pure business formulas (no side effects). See Config/Businesses for the model.
--
--   BizMath.UpgradeEffects(rec) -> { Customers, MaxStock, Tolerance, VaultCap, Floors, MaxItems }
--   BizMath.StaffEffects(rec, onlineEmployees) -> { Customers, Tolerance, VaultCap, WagePerHour, Count }
--   BizMath.MaxStock(rec) / VaultCap(rec, staffFx?) / MaxStaff(rec) / Floors(rec) / MaxItems(rec) / StaffCount(rec)
--   BizMath.PriceRatio(rec) / PriceFactor(rec, tolerance)
--   BizMath.CustomersPerMinute(rec, env) -> number
--        env = { Clock, Weather, Event, DecorCount, OnlineEmployees = { role = count } }
--   BizMath.PickProduct(t, rng) -> product
--   BizMath.PriceOf(rec, product) -> number
--   BizMath.GameHourSeconds() -> number

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config.Businesses)
local World = require(Shared.Config.World)

local BizMath = {}

local function num(v: any, default: number?): number
	if type(v) == "number" and v == v then
		return v
	end
	return default or 0
end

function BizMath.GameHourSeconds(): number
	return math.max(1, (World.Time.DayLengthMinutes or 24) * 60 / 24)
end

function BizMath.UpgradeEffects(rec)
	local fx = { Customers = 0, MaxStock = 0, Tolerance = 0, VaultCap = 0, Floors = 0, MaxItems = 0 }
	local ups = type(rec.Upgrades) == "table" and rec.Upgrades or {}
	for id, level in pairs(ups) do
		local def = Config.Upgrades[id]
		local lvl = math.clamp(math.floor(num(level)), 0, def and #def.Prices or 0)
		if def and lvl > 0 and Config.UpgradeAllowed(rec.TypeId, id) then
			for k, v in pairs(def.Effects) do
				fx[k] = (fx[k] or 0) + v * lvl
			end
		end
	end
	return fx
end

function BizMath.StaffCount(rec): number
	local n = 0
	if type(rec.Staff) == "table" then
		for _, c in pairs(rec.Staff) do
			n += math.max(0, math.floor(num(c)))
		end
	end
	return n
end

function BizMath.StaffEffects(rec, onlineEmployees: { [string]: number }?)
	local fx = { Customers = 0, Tolerance = 0, VaultCap = 0, WagePerHour = 0, Count = 0 }
	local t = Config.Types[rec.TypeId]
	if type(rec.Staff) == "table" and t then
		for role, count in pairs(rec.Staff) do
			local def = Config.Roles[role]
			local c = math.max(0, math.floor(num(count)))
			if def and c > 0 and t.StaffRoleSet[role] then
				fx.Customers += def.Customers * c
				fx.Tolerance += def.Tolerance * c
				fx.VaultCap += def.VaultCap * c
				fx.WagePerHour += def.WagePerHour * c
				fx.Count += c
			end
		end
	end
	if onlineEmployees then
		local f = Config.PlayerWork.EmployeeCustomersFactor
		for role, count in pairs(onlineEmployees) do
			local def = Config.Roles[role]
			if def then
				fx.Customers += def.Customers * f * count
				fx.Tolerance += def.Tolerance * count
			end
		end
	end
	return fx
end

function BizMath.Level(rec): number
	return math.clamp(math.floor(num(rec.Level, 1)), 1, #Config.Levels.List)
end

function BizMath.MaxStock(rec): number
	local t = Config.Types[rec.TypeId]
	if not t then
		return 0
	end
	local fx = BizMath.UpgradeEffects(rec)
	return math.floor(t.BaseMaxStock * (1 + fx.MaxStock))
end

function BizMath.VaultCap(rec, staffFx): number
	local t = Config.Types[rec.TypeId]
	local info = Config.LevelInfo(BizMath.Level(rec))
	local fx = BizMath.UpgradeEffects(rec)
	local sfx = staffFx or BizMath.StaffEffects(rec, nil)
	return math.floor(info.VaultCap * (t and t.VaultScale or 1) * (1 + fx.VaultCap + sfx.VaultCap))
end

function BizMath.MaxStaff(rec): number
	return Config.LevelInfo(BizMath.Level(rec)).MaxStaff
end

function BizMath.Floors(rec): number
	return 1 + math.floor(BizMath.UpgradeEffects(rec).Floors)
end

function BizMath.MaxItems(rec): number
	return Config.LevelInfo(BizMath.Level(rec)).MaxItems + math.floor(BizMath.UpgradeEffects(rec).MaxItems)
end

function BizMath.PriceOf(rec, product): number
	local prices = type(rec.Prices) == "table" and rec.Prices or {}
	local p = prices[product.Id]
	local lo, hi = Config.PriceBounds(rec.TypeId, product.Id)
	if type(p) ~= "number" or p ~= p or not lo then
		return product.Price
	end
	return math.clamp(math.floor(p), lo, hi :: number)
end

function BizMath.PriceRatio(rec): number
	local t = Config.Types[rec.TypeId]
	if not t or #t.Products == 0 then
		return 1
	end
	local sum, w = 0, 0
	for _, p in ipairs(t.Products) do
		local weight = p.Weight or 1
		sum += (BizMath.PriceOf(rec, p) / p.Price) * weight
		w += weight
	end
	return sum / math.max(1e-6, w)
end

function BizMath.PriceFactor(rec, tolerance: number): number
	local t = Config.Types[rec.TypeId]
	local g = Config.General
	local e = (t and t.Elasticity or 1.5) / (1 + math.max(0, tolerance))
	local r = math.max(0.05, BizMath.PriceRatio(rec))
	return math.clamp(r ^ -e, g.PriceFactorMin, g.PriceFactorMax)
end

function BizMath.CustomersPerMinute(rec, env): number
	local t = Config.Types[rec.TypeId]
	if not t then
		return 0
	end
	local ufx = BizMath.UpgradeEffects(rec)
	local sfx = BizMath.StaffEffects(rec, env.OnlineEmployees)
	local decor = math.min(Config.Decor.Max, (env.DecorCount or 0) * Config.Decor.PerItem)
	local level = BizMath.Level(rec)
	local cpm = t.BaseCustomersPerMinute
		* (1 + ufx.Customers)
		* (1 + sfx.Customers)
		* (1 + decor)
		* (1 + Config.Levels.CustomersPerLevel * (level - 1))
	cpm *= Config.TrafficAt(rec.TypeId, env.Clock or 12)
	cpm *= Config.WeatherFactor[env.Weather or "Clear"] or 1
	if type(env.Event) == "table" then
		cpm *= Config.EventFactorById[env.Event.Id] or Config.EventFactor
	end
	cpm *= BizMath.PriceFactor(rec, ufx.Tolerance + sfx.Tolerance)
	return math.clamp(cpm, 0, t.MaxCustomersPerMinute)
end

function BizMath.PickProduct(t, rng: Random)
	local total = 0
	for _, p in ipairs(t.Products) do
		total += p.Weight or 1
	end
	local roll = rng:NextNumber() * total
	for _, p in ipairs(t.Products) do
		roll -= p.Weight or 1
		if roll <= 0 then
			return p
		end
	end
	return t.Products[#t.Products]
end

return BizMath
