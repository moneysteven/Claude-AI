-- BizState (server helper): shared runtime state + small accessors used by every Business helper.
-- Nothing in here is saved; saved state lives in the owner's data at Businesses.<bizId> (DataService).
--
--   BizState.Deps            = { DataService, EconomyService, NotifyService, BuildService? }   (set in BusinessService:Init/Start)
--   BizState.Loaded[key]     = biz runtime (key = context id "biz_<userId>_<bizId>")
--   BizState.ByOwner[player] = { [bizId] = biz }
--   BizState.Lots[lotId]     = lot runtime
--   BizState.EmployeeOf[userId] = biz      (player employees currently working for a loaded business)
--
-- biz runtime = { Key, Id, Owner, TypeId, Lot, Folder, BuildFolder, Maid, Carry, WageCarry, CPM,
--                 Stations = { [Function] = count }, DecorCount, LastRevenue, Warned = { [kind] = os.clock() } }
-- lot runtime = { Id, Part, Origin: CFrame (top centre), Size: Vector3, Allowed = set|nil (nil = all), AllowedText,
--                 Biz = biz?, Root: Folder, Sign: BasePart?, SignGui, Prompt, Fallback: bool }

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config.Businesses)

local BizState = {}

BizState.Config = Config
BizState.Deps = {} :: { [string]: any }
BizState.Loaded = {} :: { [string]: any }
BizState.ByOwner = {} :: { [Player]: { [string]: any } }
BizState.Lots = {} :: { [string]: any }
BizState.EmployeeOf = {} :: { [number]: any }

function BizState.Key(owner: Player, bizId: string): string
	return ("biz_%d_%s"):format(owner.UserId, bizId)
end

function BizState.Path(bizId: string, field: string?): string
	if field then
		return "Businesses." .. bizId .. "." .. field
	end
	return "Businesses." .. bizId
end

-- Live saved record (read freely, write via DataService).
function BizState.Rec(owner: Player, bizId: string): any?
	local DataService = BizState.Deps.DataService
	if not DataService then
		return nil
	end
	local rec = DataService:Get(owner, "Businesses." .. bizId)
	if type(rec) == "table" then
		return rec
	end
	return nil
end

function BizState.RecOf(biz): any?
	return BizState.Rec(biz.Owner, biz.Id)
end

function BizState.Set(biz, field: string, value: any)
	BizState.Deps.DataService:Set(biz.Owner, BizState.Path(biz.Id, field), value)
end

function BizState.Get(owner: Player, bizId: string)
	local map = BizState.ByOwner[owner]
	return map and map[bizId] or nil
end

function BizState.TypeOf(biz)
	return Config.Types[biz.TypeId]
end

function BizState.Notify(player: Player?, text: string, kind: string?, duration: number?)
	local n = BizState.Deps.NotifyService
	if n and player and player.Parent then
		n:Send(player, text, kind, duration)
	end
end

-- Throttled notification (one per `kind` per Config.General.OutOfStockWarnEvery seconds).
function BizState.Warn(biz, kind: string, text: string, notifyKind: string?)
	biz.Warned = biz.Warned or {}
	local last = biz.Warned[kind]
	local now = os.clock()
	if last and now - last < Config.General.OutOfStockWarnEvery then
		return
	end
	biz.Warned[kind] = now
	BizState.Notify(biz.Owner, text, notifyKind or "warning", 5)
end

function BizState.DisplayName(rec, owner: Player?): string
	if rec and type(rec.Name) == "string" and rec.Name ~= "" then
		return rec.Name
	end
	local t = rec and Config.Types[rec.TypeId]
	return ((owner and owner.DisplayName or "Someone") .. "'s " .. (t and t.Name or "Business"))
end

-- UTC day used for "today" stats.
function BizState.Today(): number
	return (os.time() + Config.General.StatsDayOffsetHours * 3600) // 86400
end

return BizState
