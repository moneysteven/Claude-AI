-- Garage: owned-car data helpers (server).
--
--   Garage.Entry(ctx, player, uid) -> entry?           saved Vehicles[uid] table (read only)
--   Garage.Slots(ctx, player) -> number                base + PremiumCarPark + VIP slots
--   Garage.Count(ctx, player) -> number
--   Garage.Value(ctx, player, uid) -> number           current market value (mileage + damage depreciation)
--   Garage.Resale(ctx, player, uid) -> (payout, gross, financeRemaining)
--   Garage.Ratings(def) -> { Speed, Acceleration, Handling, Braking }   0..1 bars for the UI
--   Garage.ListPayload(ctx, player) -> table           everything the Garage panel shows

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Cars = require(Shared.Config.Cars)
local Economy = require(Shared.Config.Economy)
local VehiclesConfig = require(Shared.Config.Vehicles)
local Units = require(Shared.Vehicle.Units)
local Looks = require(Shared.Vehicle.Looks)

local Garage = {}

local G = VehiclesConfig.Garage
local V = VehiclesConfig.Value

function Garage.Entry(ctx, player: Player, uid: string)
	local vehicles = ctx.Data:Get(player, "Vehicles")
	if type(vehicles) ~= "table" then
		return nil
	end
	local e = vehicles[uid]
	if type(e) == "table" then
		return e
	end
	return nil
end

local function hasPass(ctx, player: Player, key: string): boolean
	local m = ctx.Find("MonetizationService")
	if m and type(m.HasPass) == "function" then
		local ok, has = pcall(m.HasPass, m, player, key)
		if ok then
			return has == true
		end
	end
	if key == "VIP" then
		return player:GetAttribute("VIP") == true
	end
	return player:GetAttribute("Pass_" .. key) == true
end
Garage.HasPass = hasPass

function Garage.Slots(ctx, player: Player): number
	local n = G.BaseSlots
	if hasPass(ctx, player, "PremiumCarPark") then
		n += G.PremiumCarParkSlots
	end
	if hasPass(ctx, player, "VIP") then
		n += G.VipSlots
	end
	return n
end

function Garage.Count(ctx, player: Player): number
	local vehicles = ctx.Data:Get(player, "Vehicles")
	local n = 0
	if type(vehicles) == "table" then
		for _, e in pairs(vehicles) do
			if type(e) == "table" then
				n += 1
			end
		end
	end
	return n
end

function Garage.ValueOf(entry, def): number
	local base = tonumber(entry.Value) or (def and def.Price) or 0
	local miles = Units.Distance(tonumber(entry.Mileage) or 0, "studs", "MPH")
	local condition = math.max(V.MinCondition, 1 - miles * V.DepreciationPerMile)
	local health = math.clamp(tonumber(entry.Health) or 100, 0, 100)
	local damage = 1 - V.DamageWeight * (1 - health / 100)
	return math.max(0, math.floor(base * condition * damage + 0.5))
end

function Garage.Value(ctx, player: Player, uid: string): number
	local entry = Garage.Entry(ctx, player, uid)
	if not entry then
		return 0
	end
	-- live values of a spawned car are newer than the save
	local info = ctx.InfoForUid(player, uid)
	if info then
		local copy = table.clone(entry)
		copy.Mileage = (tonumber(entry.Mileage) or 0) + (info.MileageUnsaved or 0)
		copy.Health = info.Health
		entry = copy
	end
	return Garage.ValueOf(entry, Cars[entry.ModelId])
end

function Garage.FinanceRemaining(entry): number
	local f = entry and entry.Finance
	if type(f) == "table" then
		return math.max(0, math.floor(tonumber(f.Remaining) or 0))
	end
	return 0
end

function Garage.Resale(ctx, player: Player, uid: string): (number, number, number)
	local entry = Garage.Entry(ctx, player, uid)
	if not entry then
		return 0, 0, 0
	end
	local gross = math.floor(Garage.Value(ctx, player, uid) * Economy.ResaleFraction)
	local owed = Garage.FinanceRemaining(entry)
	return gross - owed, gross, owed
end

function Garage.Ratings(def): { [string]: number }
	local s = def and def.Stats or {}
	local hpPerTon = (s.Horsepower or 150) / math.max(0.1, (s.Mass or 1400) / 1000)
	return {
		Speed = math.clamp((s.TopSpeed or 120) / 250, 0.05, 1),
		Acceleration = math.clamp(hpPerTon / 900, 0.05, 1),
		Handling = math.clamp(((s.Grip or 1) - 0.75) / 0.75, 0.05, 1),
		Braking = math.clamp((s.BrakeForce or 0.8), 0.05, 1),
	}
end

function Garage.ListPayload(ctx, player: Player)
	local vehicles = ctx.Data:Get(player, "Vehicles")
	local favorite = ctx.Data:Get(player, "FavoriteVehicle") or ""
	local active = ctx.ActiveInfo(player)
	local cars = {}
	if type(vehicles) == "table" then
		for uid, e in pairs(vehicles) do
			local def = type(e) == "table" and Cars[e.ModelId] or nil
			if def then
				local info = ctx.InfoForUid(player, uid)
				local payout, gross, owed = Garage.Resale(ctx, player, uid)
				local look = Looks.Resolve(e, def)
				table.insert(cars, {
					Uid = uid,
					ModelId = e.ModelId,
					Name = def.Name,
					Brand = def.Brand,
					BrandName = Looks.Brand(def.Brand).Name,
					Class = def.Class,
					Electric = def.Electric == true,
					Seats = def.Seats,
					Plate = e.Plate or "",
					Paint = look.Paint.Color,
					Fuel = info and info.Fuel or tonumber(e.Fuel) or 1,
					Health = info and info.Health or tonumber(e.Health) or 100,
					Mileage = (tonumber(e.Mileage) or 0) + (info and info.MileageUnsaved or 0),
					Value = Garage.Value(ctx, player, uid),
					Resale = payout,
					ResaleGross = gross,
					FinanceRemaining = owed,
					Financed = owed > 0,
					FinancePayment = type(e.Finance) == "table" and tonumber(e.Finance.Payment) or 0,
					FinancePaymentsLeft = type(e.Finance) == "table" and tonumber(e.Finance.PaymentsLeft) or 0,
					Favorite = favorite == uid,
					Active = active ~= nil and active.Uid == uid,
					Locked = (info and info.Model:GetAttribute("Locked") == true) or e.Locked == true,
					Upgrades = type(e.Upgrades) == "table" and e.Upgrades or {},
					TopSpeed = def.Stats and def.Stats.TopSpeed or 0,
					Horsepower = def.Stats and def.Stats.Horsepower or 0,
					Ratings = Garage.Ratings(def),
					PurchasedAt = tonumber(e.PurchasedAt) or 0,
					Showcase = e.Showcase == true,
				})
			end
		end
	end
	table.sort(cars, function(a, b)
		if a.Favorite ~= b.Favorite then
			return a.Favorite
		end
		if a.Active ~= b.Active then
			return a.Active
		end
		return a.PurchasedAt > b.PurchasedAt
	end)
	return {
		Cars = cars,
		Slots = Garage.Slots(ctx, player),
		Used = #cars,
		ActiveUid = active and active.Uid or "",
		Favorite = favorite,
		CallCooldown = math.max(0, math.ceil((ctx.CallReadyAt[player] or 0) - os.clock())),
		PremiumCarPark = hasPass(ctx, player, "PremiumCarPark"),
	}
end

return Garage
