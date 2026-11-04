-- Finance: car loans. Loans live on the car itself in saved data:
--   Vehicles[uid].Finance = false | { Remaining, Payment, PaymentsLeft, Missed, Since, Total }
-- Payments are charged once per in-game day (EconomyService:Charge = wallet then bank).
-- Missed payments accumulate (plus a small late fee); after MissedLimit misses the car is repossessed.
--
--   Finance.Init(deps)                     deps = { DataService, EconomyService }
--   Finance.Summary(player) -> { Count, Outstanding, CreditLimit, Available, MaxCars, Loans = {...} }
--   Finance.CheckNewLoan(player, financedOwed) -> (ok, err?)
--   Finance.Tick()                          charge every loaded player (call on DayChanged)
--   Finance.PayEarly(player, uid) -> (ok, err?)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Format = require(Shared.Util.Format)
local DealerCfg = require(Shared.Config.Dealership)

local Common = require(script.Parent.Common)
local Catalog = require(script.Parent.Catalog)

local F = DealerCfg.Finance

local Finance = {}

local DataService
local Economy

function Finance.Init(deps)
	DataService = deps.DataService
	Economy = deps.EconomyService
end

local function isLoan(f: any): boolean
	return type(f) == "table" and type(f.Remaining) == "number" and f.Remaining > 0
end

function Finance.CreditLimit(player: Player): number
	local nw = Common.NetWorth(player)
	return math.clamp(math.floor(F.BaseCredit + nw * F.NetWorthFactor), 0, F.MaxCredit)
end

function Finance.MaxCars(player: Player): number
	local n = F.MaxFinancedCars
	if Common.HasPass(player, "VIP") then
		n += F.VipBonusFinancedCars
	end
	return n
end

function Finance.Summary(player: Player)
	local data = DataService:GetData(player)
	local loans = {}
	local outstanding = 0
	if data and type(data.Vehicles) == "table" then
		for uid, car in pairs(data.Vehicles) do
			if type(car) == "table" and isLoan(car.Finance) then
				outstanding += car.Finance.Remaining
				local def = Catalog.GetAnyCar(car.ModelId)
				table.insert(loans, {
					Uid = uid,
					ModelId = car.ModelId,
					Name = def and def.Name or car.ModelId,
					Remaining = car.Finance.Remaining,
					Payment = car.Finance.Payment,
					PaymentsLeft = car.Finance.PaymentsLeft,
					Missed = car.Finance.Missed or 0,
				})
			end
		end
	end
	table.sort(loans, function(a, b)
		return tostring(a.Uid) < tostring(b.Uid)
	end)
	local limit = Finance.CreditLimit(player)
	return {
		Count = #loans,
		Outstanding = outstanding,
		CreditLimit = limit,
		Available = math.max(0, limit - outstanding),
		MaxCars = Finance.MaxCars(player),
		MissedLimit = F.MissedLimit,
		Loans = loans,
	}
end

-- `excludeUid`: a car being traded in on this purchase (its loan is closed by the trade, so it doesn't count).
function Finance.CheckNewLoan(player: Player, owed: number, excludeUid: string?): (boolean, string?)
	if not F.Enabled then
		return false, "Financing is not available right now."
	end
	local s = Finance.Summary(player)
	local count, outstanding = 0, 0
	for _, loan in ipairs(s.Loans) do
		if loan.Uid ~= excludeUid then
			count += 1
			outstanding += loan.Remaining
			if loan.Missed > 0 then
				return false, "Catch up on your missed car payments before taking a new loan."
			end
		end
	end
	if count >= s.MaxCars then
		return false, ("You can only finance %d cars at once. Pay one off first."):format(s.MaxCars)
	end
	local available = math.max(0, s.CreditLimit - outstanding)
	if owed > available then
		return false, ("That loan (%s) is over your available credit (%s)."):format(
			Format.Money(owed),
			Format.Money(available)
		)
	end
	return true, nil
end

local function carName(car: { [string]: any }): string
	local def = Catalog.GetAnyCar(car.ModelId)
	return (def and def.Name) or tostring(car.ModelId or "car")
end

local function repossess(player: Player, uid: string, car: { [string]: any })
	local name = carName(car)
	local vs = Common.VehicleService()
	local removed = false
	if vs and type(vs.RemoveVehicle) == "function" then
		local ok, res = pcall(vs.RemoveVehicle, vs, player, uid)
		removed = ok and res ~= false
	end
	if not removed then
		-- VehicleService missing: drop the record directly so the loan can't be dodged
		if Common.GetCarData(player, uid) then
			DataService:Set(player, "Vehicles." .. uid, nil)
			removed = true
		end
	end
	if removed then
		local text = ("Your %s was repossessed after %d missed payments. The remaining loan has been closed."):format(
			name,
			F.MissedLimit
		)
		Common.PhoneMessage(player, F.SenderName, text)
		Common.Notify(player, "🚨 " .. text, "error", 8)
	end
end

local function chargeOne(player: Player, uid: string, car: { [string]: any })
	local f = car.Finance
	if not isLoan(f) then
		return
	end
	if type(f.Since) == "number" and os.time() - f.Since < F.FirstPaymentGraceSeconds then
		return
	end
	local payment = math.max(1, math.floor(tonumber(f.Payment) or 1))
	local missed = math.max(0, math.floor(tonumber(f.Missed) or 0))
	local balance = math.max(1, math.ceil(f.Remaining)) -- Charge only takes whole dollars
	local name = carName(car)
	local base = "Vehicles." .. uid .. ".Finance"

	-- try to clear today's payment + arrears
	local catchUp = math.min(balance, payment * (1 + missed))
	if Economy:Charge(player, catchUp, "Finance:" .. tostring(car.ModelId)) then
		local remaining = balance - catchUp
		local left = math.max(0, (f.PaymentsLeft or 1) - (1 + missed))
		if remaining <= 0 then
			DataService:Set(player, base, false)
			Common.PhoneMessage(
				player,
				F.SenderName,
				("Congratulations! Your %s is fully paid off. It's all yours. 🎉"):format(name)
			)
			Common.Notify(player, ("🎉 %s paid off!"):format(name), "success", 6)
		else
			DataService:Set(player, base .. ".Remaining", remaining)
			DataService:Set(player, base .. ".PaymentsLeft", math.max(1, left))
			DataService:Set(player, base .. ".Missed", 0)
			if missed > 0 then
				Common.PhoneMessage(
					player,
					F.SenderName,
					("Thanks! You're caught up on your %s. Paid %s. Balance %s."):format(
						name,
						Format.Money(catchUp),
						Format.Money(remaining)
					)
				)
			else
				Common.Notify(
					player,
					("🚗 Car payment %s (%s). Balance %s."):format(Format.Money(catchUp), name, Format.Money(remaining)),
					"money",
					5
				)
			end
		end
		return
	end

	-- couldn't catch up: at least pay today's instalment to avoid falling further behind
	if missed > 0 then
		local today = math.min(balance, payment)
		if Economy:Charge(player, today, "Finance:" .. tostring(car.ModelId)) then
			local remaining = balance - today
			if remaining <= 0 then
				DataService:Set(player, base, false)
			else
				DataService:Set(player, base .. ".Remaining", remaining)
				DataService:Set(player, base .. ".PaymentsLeft", math.max(1, (f.PaymentsLeft or 1) - 1))
			end
			Common.PhoneMessage(
				player,
				F.SenderName,
				("Paid today's %s instalment for your %s, but you are still %d payment(s) behind."):format(
					Format.Money(today),
					name,
					missed
				)
			)
			return
		end
	end

	-- missed
	missed += 1
	if missed >= F.MissedLimit then
		repossess(player, uid, car)
		return
	end
	local fee = math.max(0, math.floor(payment * F.LateFeePct))
	DataService:Set(player, base .. ".Missed", missed)
	if fee > 0 then
		DataService:Set(player, base .. ".Remaining", balance + fee)
	end
	Common.PhoneMessage(
		player,
		F.SenderName,
		("⚠️ Missed payment of %s for your %s (%d/%d). Late fee %s added. After %d missed payments the car will be repossessed."):format(
			Format.Money(payment),
			name,
			missed,
			F.MissedLimit,
			Format.Money(fee),
			F.MissedLimit
		)
	)
	Common.Notify(player, ("⚠️ Missed car payment (%d/%d)"):format(missed, F.MissedLimit), "warning", 6)
end

function Finance.TickPlayer(player: Player)
	local data = DataService:GetData(player)
	if not data or type(data.Vehicles) ~= "table" then
		return
	end
	-- collect first: charging may remove cars from the table
	local due = {}
	for uid, car in pairs(data.Vehicles) do
		if type(car) == "table" and isLoan(car.Finance) then
			table.insert(due, uid)
		end
	end
	table.sort(due)
	for _, uid in ipairs(due) do
		local car = data.Vehicles[uid]
		if type(car) == "table" then
			local ok, err = pcall(chargeOne, player, uid, car)
			if not ok then
				warn("[Dealership] finance charge failed:", err)
			end
		end
	end
end

function Finance.Tick()
	for _, player in ipairs(Players:GetPlayers()) do
		if DataService:IsLoaded(player) then
			Finance.TickPlayer(player)
		end
	end
end

function Finance.PayEarly(player: Player, uid: string): (boolean, string?)
	local car = Common.GetCarData(player, uid)
	if not car then
		return false, "Car not found."
	end
	local f = car.Finance
	if not isLoan(f) then
		return false, "That car has no loan."
	end
	local amount = math.ceil(f.Remaining)
	if amount <= 0 then
		DataService:Set(player, "Vehicles." .. uid .. ".Finance", false)
		return true, nil
	end
	if not Economy:Charge(player, amount, "Finance:Payoff:" .. tostring(car.ModelId)) then
		return false, ("You need %s (wallet + bank) to pay this off."):format(Format.Money(amount))
	end
	DataService:Set(player, "Vehicles." .. uid .. ".Finance", false)
	Common.PhoneMessage(
		player,
		F.SenderName,
		("Loan closed: you paid %s and now own your %s outright. 🎉"):format(Format.Money(amount), carName(car))
	)
	return true, nil
end

return Finance
