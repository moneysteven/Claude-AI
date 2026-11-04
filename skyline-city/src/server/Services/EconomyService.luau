-- EconomyService: the ONLY code allowed to change a player's wallet Cash.
-- (Bank / Savings balances are changed only by BankService, which uses the same guards.)
--
-- API (server):
--   Economy:GetCash(player) -> number
--   Economy:CanAfford(player, amount) -> boolean
--   Economy:AddCash(player, amount, reason) -> boolean          -- raw add (refunds, rewards, sales)
--   Economy:Pay(player, baseAmount, reason) -> number           -- paycheck: applies pay modifiers (VIP 2x, events); returns amount paid
--   Economy:TrySpend(player, amount, reason) -> boolean         -- atomic check + deduct
--   Economy:Charge(player, amount, reason) -> boolean           -- like TrySpend but may take from Bank if wallet is short (rent, finance)
--   Economy:Transfer(from, to, amount, reason) -> boolean       -- player to player
--   Economy:GetPrice(player, basePrice, category) -> number     -- applies price modifiers (VIP furniture discount etc.)
--   Economy:MoveCashToBank(player, amount) -> boolean          -- wallet -> bank (no TotalEarned/TotalSpent change, kind "bank")
--   Economy:MoveBankToCash(player, amount) -> boolean          -- bank -> wallet (no TotalEarned/TotalSpent change, kind "bank")
--   Economy:RegisterPayModifier(fn(player, amount, reason) -> multiplier)
--   Economy:RegisterPriceModifier(fn(player, price, category) -> multiplier)
--   Economy.Transaction : Signal(player, delta, reason, kind)    -- kind: "earn" | "spend" | "transfer" | "purchase" | "bank"
--
-- `reason` is a short string like "Job:Pizza", "Buy:Car:porza_gt", "Rent", "Robux:VIPDaily".
-- Reasons starting with "Robux:", "Admin:" or "Reward:" are excluded from the earning-rate watchdog.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Signal = require(Shared.Util.Signal)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Economy)
local Registry = require(ServerScriptService.Server.Registry)

local EconomyService = {
	Name = "EconomyService",
	Priority = 5,
}

EconomyService.Transaction = Signal.new()

local DataService
local payModifiers: { (Player, number, string) -> number } = {}
local priceModifiers: { (Player, number, string) -> number } = {}
local earnWindow: { [Player]: { t: number, amount: number } } = {}

local function validAmount(amount: any): boolean
	return type(amount) == "number"
		and amount == amount
		and amount > 0
		and amount <= Config.MaxSingleTransaction
		and math.floor(amount) == amount
end

local function watchdog(player: Player, amount: number, reason: string)
	if reason:sub(1, 6) == "Robux:" or reason:sub(1, 6) == "Admin:" or reason:sub(1, 7) == "Reward:" then
		return
	end
	local now = os.clock()
	local w = earnWindow[player]
	if not w or now - w.t > 60 then
		w = { t = now, amount = 0 }
		earnWindow[player] = w
	end
	w.amount += amount
	if w.amount > Config.MaxEarnPerMinute then
		warn(
			("[Economy] %s (%d) earned %s in under a minute (last: %s). Flagged."):format(
				player.Name,
				player.UserId,
				Format.Money(w.amount),
				reason
			)
		)
		local anti = Registry.Find("AntiExploitService")
		if anti and anti.Flag then
			anti:Flag(player, "EarnRate", reason)
		end
	end
end

function EconomyService:GetCash(player: Player): number
	return DataService:Get(player, "Cash") or 0
end

function EconomyService:CanAfford(player: Player, amount: number): boolean
	return self:GetCash(player) >= amount
end

function EconomyService:AddCash(player: Player, amount: number, reason: string): boolean
	if not validAmount(amount) or not DataService:IsLoaded(player) then
		return false
	end
	local cash = self:GetCash(player)
	local new = math.min(Config.MaxCash, cash + amount)
	local delta = new - cash
	if delta <= 0 then
		return false
	end
	DataService:Set(player, "Cash", new)
	DataService:Increment(player, "Stats.TotalEarned", delta)
	watchdog(player, delta, reason or "?")
	EconomyService.Transaction:Fire(player, delta, reason or "?", "earn")
	return true
end

function EconomyService:Pay(player: Player, baseAmount: number, reason: string): number
	if type(baseAmount) ~= "number" or baseAmount <= 0 then
		return 0
	end
	local mult = 1
	for _, fn in ipairs(payModifiers) do
		local ok, m = pcall(fn, player, baseAmount, reason)
		if ok and type(m) == "number" and m > 0 and m <= 10 then
			mult *= m
		end
	end
	local amount = math.floor(baseAmount * mult + 0.5)
	if amount <= 0 then
		return 0
	end
	if self:AddCash(player, amount, reason) then
		return amount
	end
	return 0
end

function EconomyService:TrySpend(player: Player, amount: number, reason: string): boolean
	if not validAmount(amount) or not DataService:IsLoaded(player) then
		return false
	end
	local cash = self:GetCash(player)
	if cash < amount then
		return false
	end
	DataService:Set(player, "Cash", cash - amount)
	DataService:Increment(player, "Stats.TotalSpent", amount)
	EconomyService.Transaction:Fire(player, -amount, reason or "?", "spend")
	return true
end

-- Wallet first, then bank. Used for recurring bills so players aren't evicted while their money sits in the bank.
function EconomyService:Charge(player: Player, amount: number, reason: string): boolean
	if not validAmount(amount) or not DataService:IsLoaded(player) then
		return false
	end
	local cash = self:GetCash(player)
	local bank = DataService:Get(player, "Bank") or 0
	if cash + bank < amount then
		return false
	end
	local fromCash = math.min(cash, amount)
	local fromBank = amount - fromCash
	DataService:Set(player, "Cash", cash - fromCash)
	if fromBank > 0 then
		DataService:Set(player, "Bank", bank - fromBank)
	end
	DataService:Increment(player, "Stats.TotalSpent", amount)
	EconomyService.Transaction:Fire(player, -amount, reason or "?", "spend")
	return true
end

function EconomyService:Transfer(from: Player, to: Player, amount: number, reason: string): boolean
	if from == to or not validAmount(amount) then
		return false
	end
	if not (DataService:IsLoaded(from) and DataService:IsLoaded(to)) then
		return false
	end
	local fromCash = self:GetCash(from)
	local toCash = self:GetCash(to)
	if fromCash < amount or toCash + amount > Config.MaxCash then
		return false
	end
	DataService:Set(from, "Cash", fromCash - amount)
	DataService:Set(to, "Cash", toCash + amount)
	EconomyService.Transaction:Fire(from, -amount, reason or "Transfer", "transfer")
	EconomyService.Transaction:Fire(to, amount, reason or "Transfer", "transfer")
	return true
end

-- Wallet <-> bank moves. Not earning or spending, so lifetime stats and the watchdog are untouched.
function EconomyService:MoveCashToBank(player: Player, amount: number): boolean
	if not validAmount(amount) or not DataService:IsLoaded(player) then
		return false
	end
	local cash = self:GetCash(player)
	local bank = DataService:Get(player, "Bank") or 0
	if cash < amount or bank + amount > Config.MaxBank then
		return false
	end
	DataService:Set(player, "Cash", cash - amount)
	DataService:Set(player, "Bank", bank + amount)
	EconomyService.Transaction:Fire(player, -amount, "Bank:Deposit", "bank")
	return true
end

function EconomyService:MoveBankToCash(player: Player, amount: number): boolean
	if not validAmount(amount) or not DataService:IsLoaded(player) then
		return false
	end
	local cash = self:GetCash(player)
	local bank = DataService:Get(player, "Bank") or 0
	if bank < amount or cash + amount > Config.MaxCash then
		return false
	end
	DataService:Set(player, "Bank", bank - amount)
	DataService:Set(player, "Cash", cash + amount)
	EconomyService.Transaction:Fire(player, amount, "Bank:Withdraw", "bank")
	return true
end

function EconomyService:GetPrice(player: Player, basePrice: number, category: string): number
	local mult = 1
	for _, fn in ipairs(priceModifiers) do
		local ok, m = pcall(fn, player, basePrice, category)
		if ok and type(m) == "number" and m > 0 and m <= 2 then
			mult *= m
		end
	end
	return math.max(0, math.floor(basePrice * mult + 0.5))
end

function EconomyService:RegisterPayModifier(fn)
	table.insert(payModifiers, fn)
end

function EconomyService:RegisterPriceModifier(fn)
	table.insert(priceModifiers, fn)
end

function EconomyService:Init()
	DataService = Registry.Get("DataService")
	Players.PlayerRemoving:Connect(function(player)
		earnWindow[player] = nil
	end)
end

return EconomyService
