-- EventService: rotating server-wide city events (Config/Events): Double Pay Hour, Car Meet, Beach Party,
-- Fireworks Night (night only) and Sale Weekend.
--
-- API (ARCHITECTURE §5):
--   EventService:GetActiveEvent() -> { Id, Name, Icon, Description, StartedAt, EndsAt, PayMultiplier?, Discount?,
--                                      PriceCategory?, Zone?, Spot? }?        (EndsAt / StartedAt are os.time())
-- Extras (admin / testing): EventService:StartEvent(id) -> boolean, EventService:EndEvent(), EventService.EventStarted /
--   EventService.EventEnded : Signal(event)
--
-- Economy hooks: one pay modifier (Double Pay; total capped at Config.MaxTotalPayMultiplier assuming VIP's own 2x)
-- and one price modifier (Sale Weekend; Config Discount off PriceCategory).
-- Networking: "WorldEvent" s->c ("EventStart", info) / ("EventEnd", { Id }); Remote "Events": GetActive, GetSchedule.
-- Workspace attributes: Event (id or ""), EventEndsAt (Workspace:GetServerTimeNow() based).

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Config = require(Shared.Config.Events)
local WorldConfig = require(Shared.Config.World)
local Registry = require(ServerScriptService.Server.Registry)

local EventService = {
	Name = "EventService",
	Priority = 120,
}

EventService.EventStarted = Signal.new()
EventService.EventEnded = Signal.new()

local rng = Random.new()
local active = nil -- { Def, StartedAt, EndsAt, EndsAtServer }
local nextAt = 0 -- os.time() of the next event start
local lastId: string? = nil

local DEFS: { [string]: any } = {}
for _, def in ipairs(Config.List) do
	DEFS[def.Id] = def
end

local function isNight(): boolean
	local world = Registry.Find("WorldService")
	if world and world.IsNight then
		local ok, res = pcall(world.IsNight, world)
		if ok then
			return res == true
		end
	end
	return false
end

local function hasVip(player: Player): boolean
	local mon = Registry.Find("MonetizationService")
	if mon and mon.HasPass then
		local ok, res = pcall(mon.HasPass, mon, player, "VIP")
		if ok then
			return res == true
		end
	end
	return player:GetAttribute("VIP") == true
end

local function info()
	if not active then
		return nil
	end
	local d = active.Def
	return {
		Id = d.Id,
		Name = d.Name,
		Icon = d.Icon,
		Description = d.Description,
		StartedAt = active.StartedAt,
		EndsAt = active.EndsAt,
		EndsAtServer = active.EndsAtServer,
		EndsIn = math.max(0, active.EndsAt - os.time()),
		PayMultiplier = d.PayMultiplier,
		Discount = d.Discount,
		PriceCategory = d.PriceCategory,
		Zone = d.Zone,
		Spot = d.Spot,
	}
end

function EventService:GetActiveEvent()
	return info()
end

local function setPartyZones(zone: string?, on: boolean)
	if not zone then
		return
	end
	for _, inst in ipairs(CollectionService:GetTagged(WorldConfig.Tags.PartyZone)) do
		if inst:GetAttribute("Zone") == zone then
			inst:SetAttribute("Active", on)
		end
	end
end

local function scheduleNext(fromNow: { number })
	nextAt = os.time() + math.floor(rng:NextNumber(fromNow[1], fromNow[2]) * 60)
end

local function announce(text: string, kind: string)
	local notify = Registry.Find("NotifyService")
	if notify then
		notify:SendAll(text, kind, 8)
	end
end

function EventService:EndEvent()
	if not active then
		return
	end
	local ended = info()
	local def = active.Def
	active = nil
	setPartyZones(def.Zone, false)
	Workspace:SetAttribute("Event", "")
	Workspace:SetAttribute("EventEndsAt", 0)
	Net.FireAll("WorldEvent", "EventEnd", { Id = def.Id })
	announce(("%s %s has ended. Thanks for joining!"):format(def.Icon, def.Name), "info")
	EventService.EventEnded:Fire(ended)
end

function EventService:StartEvent(id: string): boolean
	local def = DEFS[id]
	if not def then
		return false
	end
	if def.NightOnly and not isNight() then
		return false
	end
	if active then
		self:EndEvent()
	end
	local duration = math.floor((def.DurationMinutes or 8) * 60)
	active = {
		Def = def,
		StartedAt = os.time(),
		EndsAt = os.time() + duration,
		EndsAtServer = Workspace:GetServerTimeNow() + duration,
	}
	lastId = def.Id
	setPartyZones(def.Zone, true)
	Workspace:SetAttribute("Event", def.Id)
	Workspace:SetAttribute("EventEndsAt", active.EndsAtServer)
	local payload = info()
	Net.FireAll("WorldEvent", "EventStart", payload)
	announce(("%s %s has started! %s"):format(def.Icon, def.Name, def.Description), "success")
	local phone = Registry.Find("PhoneService")
	if phone and phone.PostToFeed then
		local text = (def.FeedText or (def.Icon .. " " .. def.Name)):gsub("{name}", def.Name)
		pcall(phone.PostToFeed, phone, nil, text)
	end
	EventService.EventStarted:Fire(payload)
	return true
end

local function pickNext(): any
	local night = isNight()
	local pool, total = {}, 0
	for _, def in ipairs(Config.List) do
		local ok = (def.Weight or 0) > 0
		if def.NightOnly and not night then
			ok = false
		end
		if Config.AvoidRepeat and def.Id == lastId and #Config.List > 1 then
			ok = false
		end
		if ok then
			table.insert(pool, def)
			total += def.Weight
		end
	end
	if #pool == 0 then
		return nil
	end
	local roll = rng:NextNumber(0, total)
	for _, def in ipairs(pool) do
		roll -= def.Weight
		if roll <= 0 then
			return def
		end
	end
	return pool[#pool]
end

local function tick()
	local now = os.time()
	if active then
		-- night-only events (Fireworks) wrap up early when the sun comes up
		if now >= active.EndsAt or (active.Def.NightOnly and not isNight()) then
			EventService:EndEvent()
		end
		return
	end
	if now >= nextAt then
		local def = pickNext()
		if def then
			EventService:StartEvent(def.Id)
		end
		scheduleNext(Config.IntervalMinutes)
	end
end

function EventService:Init()
	Net.Declare("WorldEvent")
	Workspace:SetAttribute("Event", "")
	Workspace:SetAttribute("EventEndsAt", 0)
	scheduleNext(Config.FirstEventDelayMinutes)
	Net.HandleActions("Events", {
		GetActive = function(_player: Player)
			return { ok = true, Event = info() }
		end,
		GetSchedule = function(_player: Player)
			local list = {}
			for _, def in ipairs(Config.List) do
				table.insert(list, { Id = def.Id, Name = def.Name, Icon = def.Icon, Description = def.Description, NightOnly = def.NightOnly == true, DurationMinutes = def.DurationMinutes })
			end
			return {
				ok = true,
				Event = info(),
				NextIn = active and nil or math.max(0, nextAt - os.time()),
				List = list,
			}
		end,
	}, { rate = 2, burst = 6 })
end

function EventService:Start()
	local economy = Registry.Find("EconomyService")
	if economy then
		economy:RegisterPayModifier(function(player: Player, _amount: number, reason: string): number
			local a = active
			local mult = a and a.Def.PayMultiplier
			if type(mult) ~= "number" or mult <= 1 then
				return 1
			end
			local prefix = a.Def.PayReasonPrefix or "Job:"
			if type(reason) ~= "string" or reason:sub(1, #prefix) ~= prefix then
				return 1
			end
			local others = hasVip(player) and (Config.AssumedVipMultiplier or 2) or 1
			local cap = (Config.MaxTotalPayMultiplier or 4) / others
			return math.clamp(mult, 1, math.max(1, cap))
		end)
		economy:RegisterPriceModifier(function(_player: Player, _price: number, category: string): number
			local a = active
			local discount = a and a.Def.Discount
			if type(discount) ~= "number" or discount <= 0 then
				return 1
			end
			if category ~= a.Def.PriceCategory then
				return 1
			end
			return math.clamp(1 - discount, 0.5, 1)
		end)
	else
		warn("[EventService] EconomyService missing: Double Pay / Sale events will be cosmetic only")
	end
	task.spawn(function()
		while true do
			task.wait(1)
			local ok, err = pcall(tick)
			if not ok then
				warn("[EventService] tick error: " .. tostring(err))
			end
		end
	end)
end

return EventService
