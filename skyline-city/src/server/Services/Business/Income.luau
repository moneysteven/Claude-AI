-- Income (server helper): the passive business simulation. One batched tick every Config.General.TickSeconds
-- over ALL loaded businesses (owner online). Open businesses serve simulated NPC customers, consume stock,
-- pay NPC wages and put revenue in their vault (capped). See Config/Businesses for the formula.
--
--   Income.Tick(dt)                    runs one tick
--   Income.Env() -> env                clock / weather / event snapshot used by BizMath.CustomersPerMinute
--   Income.Preview(biz) -> cpm         customers/min if it were open right now (dashboard)
--   Income.OnClosed = fn(biz, reason)  set by BusinessService (updates sign + attributes)

local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local ServerScriptService = game:GetService("ServerScriptService")

local Registry = require(ServerScriptService.Server.Registry)

local BizState = require(script.Parent.BizState)
local BizMath = require(script.Parent.BizMath)
local Ledger = require(script.Parent.Ledger)
local Stations = require(script.Parent.Stations)
local Staff = require(script.Parent.Staff)

local Config = BizState.Config

local Income = {}
Income.OnClosed = nil :: ((any, string) -> ())?

local rng = Random.new()

function Income.Env()
	local env = { Clock = Lighting.ClockTime, Weather = "Clear", Event = nil }
	local world = Registry.Find("WorldService")
	if world then
		if world.GetClock then
			local ok, c = pcall(world.GetClock, world)
			if ok and type(c) == "number" then
				env.Clock = c
			end
		end
		if world.GetWeather then
			local ok, w = pcall(world.GetWeather, world)
			if ok and type(w) == "string" then
				env.Weather = w
			end
		end
	end
	local events = Registry.Find("EventService")
	if events and events.GetActiveEvent then
		local ok, e = pcall(events.GetActiveEvent, events)
		if ok and type(e) == "table" then
			env.Event = e
		end
	end
	return env
end

function Income.Preview(biz, env): number
	local rec = BizState.RecOf(biz)
	if not rec then
		return 0
	end
	local e = env or Income.Env()
	e.DecorCount = biz.DecorCount or 0
	e.OnlineEmployees = Staff.OnlineEmployees(biz)
	return BizMath.CustomersPerMinute(rec, e)
end

local function close(biz, reason: string)
	BizState.Set(biz, "Open", false)
	biz.CPM = 0
	if Income.OnClosed then
		Income.OnClosed(biz, reason)
	end
end

local function payWages(biz, owed: number): boolean
	if owed <= 0 then
		return true
	end
	local rec = BizState.RecOf(biz)
	if not rec then
		return false
	end
	local vault = math.floor(tonumber(rec.Vault) or 0)
	local fromVault = math.min(vault, owed)
	local rest = owed - fromVault
	if rest > 0 then
		local EconomyService = BizState.Deps.EconomyService
		if not EconomyService:TrySpend(biz.Owner, rest, "Wage:" .. biz.Id) then
			return false
		end
	end
	if fromVault > 0 then
		BizState.Set(biz, "Vault", vault - fromVault)
	end
	return true
end

local function tickBusiness(biz, dt: number, env)
	local rec = BizState.RecOf(biz)
	local t = BizState.TypeOf(biz)
	if not rec or not t then
		return
	end
	Stations.Scan(biz)
	if rec.Open ~= true then
		biz.CPM = 0
		return
	end
	local missing = Stations.Missing(biz)
	if #missing > 0 then
		local names = {}
		for _, m in ipairs(missing) do
			table.insert(names, Config.FunctionNames[m.Function] or m.Function)
		end
		close(biz, "missing")
		BizState.Notify(biz.Owner, ("%s closed: it needs %s."):format(BizState.DisplayName(rec, biz.Owner), table.concat(names, ", ")), "warning", 6)
		return
	end

	env.DecorCount = biz.DecorCount or 0
	env.OnlineEmployees = Staff.OnlineEmployees(biz)
	local cpm = BizMath.CustomersPerMinute(rec, env)
	biz.CPM = cpm

	local expected = cpm * dt / 60 + (biz.Carry or 0)
	local n = math.floor(expected)
	biz.Carry = math.clamp(expected - n, 0, 1)
	n = math.min(n, Config.General.MaxCustomersPerTick)

	local vaultSpace = Ledger.VaultSpace(biz)
	local hourRoom = Ledger.HourRoom(biz)
	local room = math.min(vaultSpace, hourRoom)
	local stock = math.max(0, math.floor(tonumber(rec.Stock) or 0))
	local startStock = stock
	local revenue, served = 0, 0
	local outOfStock, capped = false, false
	for _ = 1, n do
		local product = BizMath.PickProduct(t, rng)
		local price = BizMath.PriceOf(rec, product)
		local units = product.Stock or 0
		if units > stock then
			outOfStock = true
			-- the customer looks for something that IS in stock (services need none)
			product = nil
			for _, p in ipairs(t.Products) do
				if (p.Stock or 0) <= stock then
					product = p
					break
				end
			end
			if product then
				price = BizMath.PriceOf(rec, product)
				units = product.Stock or 0
			end
		end
		if product then
			if revenue + price > room then
				capped = true
				break
			end
			stock -= units
			revenue += price
			served += 1
		end
	end

	-- walk-in / background income
	local base = t.BaseIncomePerMinute * dt / 60 + (biz.BaseCarry or 0)
	local baseInt = math.floor(base)
	biz.BaseCarry = base - baseInt
	baseInt = math.max(0, math.min(baseInt, room - revenue))

	if stock ~= startStock then
		BizState.Set(biz, "Stock", stock)
	end
	if revenue + baseInt > 0 or served > 0 then
		Ledger.Credit(biz, revenue + baseInt, served, "Npc")
	end

	if outOfStock then
		BizState.Warn(biz, "stock", ("📦 %s is running out of stock! Buy more in the Business panel."):format(BizState.DisplayName(rec, biz.Owner)))
	end
	if capped then
		if vaultSpace <= hourRoom then
			BizState.Warn(biz, "vault", ("💰 %s's vault is full — collect your earnings!"):format(BizState.DisplayName(rec, biz.Owner)))
		else
			BizState.Warn(biz, "hour", "⏳ Hourly business income cap reached — your customers will be back soon.", "info")
		end
	end

	-- NPC wages per in-game hour
	local sfx = BizMath.StaffEffects(rec, nil)
	if sfx.WagePerHour > 0 then
		local owed = sfx.WagePerHour * dt / BizMath.GameHourSeconds() + (biz.WageCarry or 0)
		local owedInt = math.floor(owed)
		biz.WageCarry = owed - owedInt
		if not payWages(biz, owedInt) then
			close(biz, "wages")
			BizState.Notify(biz.Owner, ("%s closed: you couldn't pay your staff."):format(BizState.DisplayName(rec, biz.Owner)), "error", 6)
		end
	end
end

function Income.Tick(dt: number)
	local env = Income.Env()
	for _, biz in pairs(BizState.Loaded) do
		if biz.Owner.Parent == Players and BizState.Deps.DataService:IsLoaded(biz.Owner) then
			local ok, err = pcall(tickBusiness, biz, dt, env)
			if not ok then
				warn("[Business] tick error for", biz.Key, err)
			end
			pcall(Ledger.PushHistory, biz)
			local part = biz.Lot and biz.Lot.Part
			if part and part.Parent then
				local rec = BizState.RecOf(biz)
				part:SetAttribute("Open", rec ~= nil and rec.Open == true)
				part:SetAttribute("CustomersPerMinute", math.floor((biz.CPM or 0) * 10 + 0.5) / 10)
			end
		end
	end
end

return Income
