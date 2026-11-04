-- Ledger (server helper): every $ that enters a business vault goes through here.
--
--   Ledger.Stats(rec) -> stats table (today's counters rolled over to the current UTC day; a fresh copy)
--   Ledger.Credit(biz, amount, customers, kind) -> credited
--        kind = "Npc"   NPC customers (capped by vault space + hourly caps; overflow is lost)
--               "Work"  player-employee task bonus (capped by vault space + hourly caps, so alt farms can't print money)
--               "Sale"  a real player bought something (vault first, overflow straight to the owner's wallet)
--   Ledger.VaultSpace(biz) -> number
--   Ledger.HourRoom(biz) -> number    NPC/work revenue still allowed this real hour (business + owner caps, persisted)
--   Ledger.OnLevelUp = fn(biz, newLevel)   set by BusinessService

local BizState = require(script.Parent.BizState)
local BizMath = require(script.Parent.BizMath)

local Config = BizState.Config

local Ledger = {}
Ledger.OnLevelUp = nil :: ((any, number) -> ())?

local function num(v: any): number
	if type(v) == "number" and v == v then
		return v
	end
	return 0
end

function Ledger.Stats(rec)
	local s = type(rec.Stats) == "table" and rec.Stats or {}
	local today = BizState.Today()
	local out = {
		Day = num(s.Day),
		Customers = math.floor(num(s.Customers)),
		Revenue = math.floor(num(s.Revenue)),
		HourStart = num(s.HourStart),
		HourEarned = math.floor(num(s.HourEarned)),
		History = {},
	}
	if type(s.History) == "table" then
		for i = 1, math.min(#s.History, Config.General.HistoryLength) do
			table.insert(out.History, math.floor(num(s.History[i])))
		end
	end
	if out.Day ~= today then
		out.Day = today
		out.Customers = 0
		out.Revenue = 0
	end
	if os.time() - out.HourStart >= 3600 then
		out.HourStart = os.time()
		out.HourEarned = 0
	end
	return out
end

function Ledger.VaultSpace(biz): number
	local rec = BizState.RecOf(biz)
	if not rec then
		return 0
	end
	return math.max(0, BizMath.VaultCap(rec) - math.floor(num(rec.Vault)))
end

-- NPC + player-work revenue already earned this real hour by ALL of the owner's businesses.
-- Computed from the persisted per-business Stats windows, so leaving and rejoining can't reset the owner cap.
local function ownerHourEarned(owner: Player): number
	local DataService = BizState.Deps.DataService
	local all = DataService and DataService:Get(owner, "Businesses")
	local sum = 0
	if type(all) == "table" then
		for _, rec in pairs(all) do
			if type(rec) == "table" then
				sum += Ledger.Stats(rec).HourEarned
			end
		end
	end
	return sum
end

function Ledger.HourRoom(biz): number
	local rec = BizState.RecOf(biz)
	if not rec then
		return 0
	end
	local stats = Ledger.Stats(rec)
	local g = Config.General
	return math.max(0, math.min(g.MaxPassivePerHour - stats.HourEarned, g.MaxPassivePerHourTotal - ownerHourEarned(biz.Owner)))
end

function Ledger.Credit(biz, amount: number, customers: number, kind: string): number
	local rec = BizState.RecOf(biz)
	local DataService = BizState.Deps.DataService
	local EconomyService = BizState.Deps.EconomyService
	if not rec or not DataService then
		return 0
	end
	amount = math.max(0, math.floor(amount))
	local stats = Ledger.Stats(rec)
	local vault = math.floor(num(rec.Vault))
	local cap = BizMath.VaultCap(rec)
	local space = math.max(0, cap - vault)

	local toVault, toWallet = 0, 0
	if kind == "Sale" then
		toVault = math.min(amount, space)
		toWallet = amount - toVault
	else
		-- "Npc" and "Work" revenue is created by the game: capped by vault space AND the hourly caps
		toVault = math.min(amount, space, Ledger.HourRoom(biz))
	end

	if toWallet > 0 and EconomyService then
		if not EconomyService:AddCash(biz.Owner, toWallet, "Business:" .. biz.TypeId) then
			toWallet = 0
		end
	end
	local credited = toVault + toWallet
	if toVault > 0 then
		BizState.Set(biz, "Vault", vault + toVault)
	end
	if kind ~= "Sale" then
		stats.HourEarned += toVault
	end
	stats.Revenue += credited
	stats.Customers += math.max(0, math.floor(customers))
	BizState.Set(biz, "Stats", stats)
	biz.TickRevenue = (biz.TickRevenue or 0) + credited

	if credited > 0 then
		local lifetime = math.floor(num(rec.Lifetime)) + credited
		BizState.Set(biz, "Lifetime", lifetime)
		local newLevel = Config.LevelFor(lifetime)
		if newLevel > BizMath.Level(rec) then
			BizState.Set(biz, "Level", newLevel)
			if Ledger.OnLevelUp then
				task.spawn(Ledger.OnLevelUp, biz, newLevel)
			end
		end
	end
	return credited
end

-- Push the revenue of the last tick into the dashboard history (called once per tick per business).
function Ledger.PushHistory(biz)
	local rec = BizState.RecOf(biz)
	if not rec then
		return
	end
	local stats = Ledger.Stats(rec)
	table.insert(stats.History, math.floor(biz.TickRevenue or 0))
	while #stats.History > Config.General.HistoryLength do
		table.remove(stats.History, 1)
	end
	biz.LastRevenue = biz.TickRevenue or 0
	biz.TickRevenue = 0
	BizState.Set(biz, "Stats", stats)
end

return Ledger
