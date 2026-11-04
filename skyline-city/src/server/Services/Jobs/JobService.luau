-- JobService: clock in/out, worker slots + queue, uniforms, job vehicles, server-validated
-- task flow for all 11 jobs, pay + XP + levels.
--
-- PUBLIC API (ARCHITECTURE §5)
--   JobService:GetCurrentJob(player) -> jobId?
--   JobService:ClockOut(player, reason?)
--   JobService.TaskCompleted : Signal(player, jobId, pay)
-- Extras
--   JobService:ClockIn(player, jobId) -> (ok, err?)
--   JobService:GetJobLevel(player, jobId) -> number
--
-- REMOTE DOMAIN "Jobs"
--   List, GetOffer {JobId}, ClockIn {JobId}, ClockOut, GetState, Act {Op, TaskId?, ...}, AcceptRepair {OfferId}, DeclineRepair {OfferId}
-- EVENT "JobEvent" (s->c): (kind, data)
--   "State" state? | "Task" view? | "TaskEnded" {...} | "Paid" {...} | "LevelUp" {...} | "Progress" {...} | "Queue" {...}
--
-- Every job lives in its own helper module next to this file (Pizza.luau, Taxi.luau, ...).
-- Job module shape:
--   { Id, Init(api)?, NewTask(session, task, api) -> bool, Ops = { [op] = fn(session, task, payload, api) -> res },
--     FreeOps = { [op] = fn(session, payload, api) -> res }?, Tick(session, task, dt, api)?, GlobalTick(dt, api)?,
--     OnTimeout(session, task, api)?, Cleanup(session, task, api)?, OnRespawn(session, task, api)?,
--     OnClockIn(session, api)?, OnClockOut(session, api)? }

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Maid = require(Shared.Util.Maid)
local Format = require(Shared.Util.Format)
local World = require(Shared.Config.World)
local Config = require(Shared.Config.Jobs)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local Targets = require(script.Parent.Targets)
local Npc = require(script.Parent.Npc)
local Props = require(script.Parent.Props)
local Uniform = require(script.Parent.Uniform)

local JobService = {
	Name = "JobService",
	Priority = 60,
}

JobService.TaskCompleted = Signal.new()
JobService.ClockedIn = Signal.new() -- (player, jobId)
JobService.ClockedOut = Signal.new() -- (player, jobId, reason)

local General = Config.General
local DataService, EconomyService, NotifyService

local sessions: { [Player]: any } = {}
local queues: { [string]: { { Player: Player, ReservedUntil: number? } } } = {}
local stations: { [string]: { BasePart } } = {}
local modules: { [string]: any } = {}
local api: { [string]: any } = {}
local rng = Random.new()

local function now(): number
	return Workspace:GetServerTimeNow()
end

local function jobCfg(jobId: string)
	return Config.Jobs[jobId]
end

local function titleFor(jobId: string, level: number): string
	local cfg = jobCfg(jobId)
	local titles = (cfg and cfg.Titles) or Config.DefaultTitles
	return titles[math.clamp(level, 1, #titles)] or Config.DefaultTitles[1]
end

local function levelMult(cfg, level: number): number
	return 1 + (cfg.PayPerLevel or 0) * (level - 1)
end

local function hasVip(player: Player): boolean
	local m = Registry.Find("MonetizationService")
	if m and m.HasPass then
		local ok, res = pcall(m.HasPass, m, player, "VIP")
		if ok then
			return res == true
		end
	end
	return player:GetAttribute("VIP") == true
end

local function tutorial(player: Player, step: string)
	local t = Registry.Find("TutorialService")
	if t and t.Advance then
		task.spawn(function()
			pcall(t.Advance, t, player, step)
		end)
	end
end

local function flag(player: Player, kind: string, detail: string)
	local a = Registry.Find("AntiExploitService")
	if a and a.Flag then
		pcall(a.Flag, a, player, kind, detail)
	else
		warn(("[JobService] flag %s %s: %s"):format(player.Name, kind, detail))
	end
end

local function getJobData(player: Player, jobId: string)
	local d = DataService:Get(player, "Jobs." .. jobId)
	if type(d) ~= "table" then
		return { Level = 1, XP = 0, Tasks = 0 }
	end
	return {
		Level = math.clamp(tonumber(d.Level) or 1, 1, Config.Leveling.MaxLevel),
		XP = math.max(0, tonumber(d.XP) or 0),
		Tasks = math.max(0, tonumber(d.Tasks) or 0),
	}
end

local function event(player: Player, kind: string, data: any)
	if player.Parent == Players then
		Net.Fire(player, "JobEvent", kind, data)
	end
end

local function rootOf(player: Player): BasePart?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root
	end
	return nil
end

local function partOf(inst: Instance): BasePart?
	if inst:IsA("BasePart") then
		return inst
	elseif inst:IsA("Model") then
		return inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	return nil
end

---------------------------------------------------------------------------
-- Stations
---------------------------------------------------------------------------
local function stationList(jobId: string): { BasePart }
	local out = {}
	for _, p in ipairs(stations[jobId] or {}) do
		if p.Parent and p:IsDescendantOf(Workspace) then
			table.insert(out, p)
		end
	end
	return out
end

local function primaryStation(jobId: string): BasePart?
	return stationList(jobId)[1]
end

local function nearestStation(jobId: string, pos: Vector3?): BasePart?
	local best, bestD = nil, math.huge
	for _, p in ipairs(stationList(jobId)) do
		local d = pos and (p.Position - pos).Magnitude or 0
		if d < bestD then
			best, bestD = p, d
		end
	end
	return best
end

local function nearStation(player: Player, jobId: string, dist: number): BasePart?
	for _, p in ipairs(stationList(jobId)) do
		if Guard.Near(player, p, dist) then
			return p
		end
	end
	return nil
end

---------------------------------------------------------------------------
-- Slots + queue
---------------------------------------------------------------------------
local function activeCount(jobId: string): number
	local n = 0
	for _, s in pairs(sessions) do
		if s.JobId == jobId then
			n += 1
		end
	end
	return n
end

local function queueOf(jobId: string)
	local q = queues[jobId]
	if not q then
		q = {}
		queues[jobId] = q
	end
	return q
end

local function queueIndex(jobId: string, player: Player): number?
	for i, e in ipairs(queueOf(jobId)) do
		if e.Player == player then
			return i
		end
	end
	return nil
end

local function reservedOthers(jobId: string, player: Player?): number
	local n, t = 0, now()
	for _, e in ipairs(queueOf(jobId)) do
		if e.Player ~= player and e.ReservedUntil and e.ReservedUntil > t then
			n += 1
		end
	end
	return n
end

local function removeFromQueues(player: Player)
	for _, q in pairs(queues) do
		for i = #q, 1, -1 do
			if q[i].Player == player then
				table.remove(q, i)
			end
		end
	end
end

-- returns (allowed, queuePosition?)
local function trySlot(player: Player, jobId: string): (boolean, number?)
	local cfg = jobCfg(jobId)
	local q = queueOf(jobId)
	local idx = queueIndex(jobId, player)
	if idx and q[idx].ReservedUntil and q[idx].ReservedUntil > now() then
		table.remove(q, idx)
		return true, nil
	end
	local active = activeCount(jobId)
	local used = active + reservedOthers(jobId, player)
	if used < cfg.Slots then
		if idx then
			table.remove(q, idx)
		end
		return true, nil
	end
	local vip = hasVip(player)
	if vip and active < cfg.Slots + General.VipExtraSlots then
		if idx then
			table.remove(q, idx)
		end
		return true, nil
	end
	-- queue up (VIP skips to the front of the line)
	if not idx then
		local entry = { Player = player, ReservedUntil = nil }
		if vip then
			local pos = 1
			for i, e in ipairs(q) do
				if e.ReservedUntil then
					pos = i + 1
				end
			end
			table.insert(q, pos, entry)
		else
			table.insert(q, entry)
		end
		idx = queueIndex(jobId, player)
	end
	return false, idx
end

local function processQueues()
	local t = now()
	for jobId, q in pairs(queues) do
		local cfg = jobCfg(jobId)
		for i = #q, 1, -1 do
			local e = q[i]
			if e.Player.Parent ~= Players or sessions[e.Player] ~= nil and sessions[e.Player].JobId == jobId then
				table.remove(q, i)
			elseif e.ReservedUntil and e.ReservedUntil <= t then
				table.remove(q, i)
				NotifyService:Send(e.Player, ("You missed your %s slot. Clock in again to rejoin the line."):format(cfg.Name), "warning")
			end
		end
		local free = cfg.Slots - activeCount(jobId) - reservedOthers(jobId, nil)
		for _, e in ipairs(q) do
			if free <= 0 then
				break
			end
			if not e.ReservedUntil then
				e.ReservedUntil = t + General.QueueReserveSeconds
				free -= 1
				NotifyService:Send(
					e.Player,
					("%s A %s slot opened! Clock in within %ds."):format(cfg.Icon, cfg.Name, General.QueueReserveSeconds),
					"success",
					8
				)
				local st = nearestStation(jobId, Guard.RootPosition(e.Player))
				event(e.Player, "Queue", { JobId = jobId, Ready = true, Expires = e.ReservedUntil, Station = st and st.Position or nil })
				local phone = Registry.Find("PhoneService")
				if phone and phone.SendSystemMessage then
					pcall(phone.SendSystemMessage, phone, e.Player, cfg.Name, "A shift just opened up for you. Head to the station to clock in!")
				end
			end
		end
	end
end

---------------------------------------------------------------------------
-- Views / state
---------------------------------------------------------------------------
local VIEW_FIELDS = {
	"Id",
	"Stage",
	"Title",
	"Hint",
	"Icon",
	"Target",
	"TargetLabel",
	"Radius",
	"Action",
	"ActionText",
	"Hold",
	"Deadline",
	"StartedAt",
	"Progress",
	"ProgressText",
	"NeedsVehicle",
	"Extra",
}

local function viewOf(session, t)
	if not t then
		return nil
	end
	local v = { JobId = session.JobId }
	for _, f in ipairs(VIEW_FIELDS) do
		v[f] = t[f]
	end
	return v
end

local function stateOf(session)
	if not session then
		return nil
	end
	local d = getJobData(session.Player, session.JobId)
	return {
		JobId = session.JobId,
		Level = d.Level,
		Title = titleFor(session.JobId, d.Level),
		XP = d.XP,
		XPNext = d.Level < Config.Leveling.MaxLevel and Config.XPFor(d.Level) or 0,
		Earned = session.Earned,
		Tasks = session.TasksDone,
		StartedAt = session.StartedAt,
		NextTaskAt = session.NextTaskAt,
		Task = viewOf(session, session.Task),
	}
end

local function payAtLevel(jobId: string, level: number): number
	local cfg = jobCfg(jobId)
	return math.floor(cfg.BasePay * levelMult(cfg, level) + 0.5)
end

local function offerFor(player: Player, jobId: string)
	local cfg = jobCfg(jobId)
	local d = getJobData(player, jobId)
	local s = sessions[player]
	local station = nearestStation(jobId, Guard.RootPosition(player))
	return {
		Id = jobId,
		Name = cfg.Name,
		Icon = cfg.Icon,
		Description = cfg.Description,
		Level = d.Level,
		Title = titleFor(jobId, d.Level),
		XP = d.XP,
		XPNext = d.Level < Config.Leveling.MaxLevel and Config.XPFor(d.Level) or 0,
		Tasks = d.Tasks,
		Pay = payAtLevel(jobId, d.Level),
		NextPay = d.Level < Config.Leveling.MaxLevel and payAtLevel(jobId, d.Level + 1) or nil,
		Slots = { Used = activeCount(jobId), Max = cfg.Slots, VipExtra = General.VipExtraSlots },
		Vip = hasVip(player),
		HasVehicle = cfg.Vehicle ~= nil,
		Station = station and station.Position or nil,
		Current = s ~= nil and s.JobId == jobId,
		CurrentJob = s and s.JobId or nil,
		Queue = queueIndex(jobId, player),
	}
end

---------------------------------------------------------------------------
-- Pay / XP
---------------------------------------------------------------------------
-- Pays (BasePay + bonus) * levelMult * mult (or bonus * mult if opts.NoBase). Returns amount paid.
local function award(session, mult: number, bonus: number?, text: string?, opts: { [string]: any }?)
	local o = opts or {}
	local player = session.Player
	local cfg = session.Cfg
	local t = now()

	-- hourly anti-farm cap (counts tasks + awards)
	local log = session.HourLog
	for i = #log, 1, -1 do
		if t - log[i] > 3600 then
			table.remove(log, i)
		end
	end
	if #log >= General.MaxTasksPerHour then
		NotifyService:Send(player, "You've hit the hourly task limit for this job. Take a break or try another job!", "warning", 6)
		return 0
	end
	table.insert(log, t)

	local m = math.clamp(mult, 0, General.MaxTaskMultiplier)
	local d = getJobData(player, session.JobId)
	local base
	if o.NoBase then
		base = (bonus or 0) * m
	else
		base = (cfg.BasePay + (bonus or 0)) * levelMult(cfg, d.Level) * m
	end
	base = math.floor(base + 0.5)
	local paid = 0
	if base > 0 then
		if o.Raw then
			-- player-funded commission: no pay modifiers (VIP / events) so it can never exceed what was charged
			if EconomyService:AddCash(player, base, "Job:" .. session.JobId .. ":Commission") then
				paid = base
			end
		else
			paid = EconomyService:Pay(player, base, "Job:" .. session.JobId)
		end
	end
	session.Earned += paid
	if o.CountsAsTask ~= false then
		session.TasksDone += 1
		d.Tasks += 1
		DataService:Increment(player, "Stats.TasksCompleted", 1)
	end

	-- XP + level ups
	local gained = math.max(1, math.floor(cfg.XP * math.clamp(m, 0.5, 2) * (o.XPScale or 1) + 0.5))
	local leveled = false
	if d.Level < Config.Leveling.MaxLevel then
		d.XP += gained
		while d.Level < Config.Leveling.MaxLevel and d.XP >= Config.XPFor(d.Level) do
			d.XP -= Config.XPFor(d.Level)
			d.Level += 1
			leveled = true
		end
		if d.Level >= Config.Leveling.MaxLevel then
			d.XP = 0
		end
	end
	DataService:Set(player, "Jobs." .. session.JobId, d)
	session.Level = d.Level
	player:SetAttribute("JobLevel", d.Level)

	if paid > 0 and not session.ReportedPay then
		session.ReportedPay = true
		tutorial(player, "FirstPay")
	end
	JobService.TaskCompleted:Fire(player, session.JobId, paid)

	event(player, "Paid", {
		Amount = paid,
		XP = gained,
		Level = d.Level,
		LevelXP = d.XP,
		XPNext = d.Level < Config.Leveling.MaxLevel and Config.XPFor(d.Level) or 0,
		Earned = session.Earned,
		Tasks = session.TasksDone,
		Text = text,
	})
	if leveled then
		local title = titleFor(session.JobId, d.Level)
		player:SetAttribute("JobTitle", title)
		NotifyService:Send(player, ("⭐ Level up! You're now a Level %d %s (%s per task)"):format(d.Level, title, Format.Money(payAtLevel(session.JobId, d.Level))), "success", 6)
		event(player, "LevelUp", { JobId = session.JobId, Level = d.Level, Title = title, Pay = payAtLevel(session.JobId, d.Level) })
	end
	return paid
end

local function finishTask(session, outcome: string, info: { [string]: any }?)
	local t = session.Task
	if not t then
		return
	end
	session.Task = nil
	local mod = modules[session.JobId]
	if mod and mod.Cleanup then
		local ok, err = pcall(mod.Cleanup, session, t, api)
		if not ok then
			warn("[JobService] cleanup error:", err)
		end
	end
	t.Maid:Clean()
	session.NextTaskAt = now() + (session.Cfg.Cooldown or 3)
	local payload = info or {}
	payload.Outcome = outcome
	payload.TaskId = t.Id
	payload.NextAt = session.NextTaskAt
	event(session.Player, "TaskEnded", payload)
end

local function newTask(session)
	local mod = modules[session.JobId]
	if not mod then
		return
	end
	session.TaskSeq += 1
	local t = {
		Id = session.TaskSeq,
		JobId = session.JobId,
		StartedAt = now(),
		Data = {},
		Extra = {},
		Maid = Maid.new(),
		Radius = session.Cfg.InteractRadius or General.DefaultInteractRadius,
		Icon = session.Cfg.Icon,
	}
	local ok, created = pcall(mod.NewTask, session, t, api)
	if not ok or not created then
		if not ok then
			warn(("[JobService] %s NewTask error: %s"):format(session.JobId, tostring(created)))
		end
		t.Maid:Clean()
		session.NextTaskAt = now() + 5
		return
	end
	t.Deadline = t.Deadline or (t.StartedAt + (t.Timeout or session.Cfg.TaskTimeout))
	session.Task = t
	event(session.Player, "Task", viewOf(session, t))
end

---------------------------------------------------------------------------
-- Vehicles
---------------------------------------------------------------------------
local function vehicleSpawnCFrame(station: BasePart): CFrame
	local best, bestD = nil, General.VehicleSpawnSearch
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.CarSpawn)) do
		local p = partOf(inst)
		if p then
			local d = (p.Position - station.Position).Magnitude
			if d < bestD then
				best, bestD = p, d
			end
		end
	end
	if best then
		return best.CFrame + Vector3.new(0, 3, 0)
	end
	local look = station.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 0.1 then
		flat = Vector3.new(0, 0, -1)
	end
	flat = flat.Unit
	local spot = Targets.GroundAt(station.Position + flat * 18)
	local right = flat:Cross(Vector3.yAxis)
	return CFrame.lookAt(spot + Vector3.new(0, 3, 0), spot + Vector3.new(0, 3, 0) + right)
end

local function spawnJobVehicle(session)
	local modelId = session.Cfg.Vehicle
	if not modelId or not session.Station then
		return
	end
	local vs = Registry.Find("VehicleService")
	if not (vs and vs.SpawnJobVehicle) then
		return
	end
	local cf = vehicleSpawnCFrame(session.Station)
	local ok, model = pcall(vs.SpawnJobVehicle, vs, session.Player, modelId, cf)
	if ok and model then
		session.Vehicle = model
		NotifyService:Send(session.Player, "🚗 Your job vehicle is parked outside.", "info", 4)
	elseif not ok then
		warn("[JobService] SpawnJobVehicle failed:", model)
	end
end

local function despawnJobVehicle(player: Player)
	local vs = Registry.Find("VehicleService")
	if vs and vs.DespawnJobVehicle then
		pcall(vs.DespawnJobVehicle, vs, player)
	end
end

---------------------------------------------------------------------------
-- Clock in / out
---------------------------------------------------------------------------
local function applyUniform(session, character: Model?)
	if not character then
		return
	end
	task.spawn(function()
		local torso = character:WaitForChild("HumanoidRootPart", 10)
		if torso and sessions[session.Player] == session and session.Player.Character == character then
			character:WaitForChild("Head", 5)
			Uniform.Apply(character, session.JobId, session.Cfg)
		end
	end)
end

function JobService:GetCurrentJob(player: Player): string?
	local s = sessions[player]
	return s and s.JobId or nil
end

function JobService:GetJobLevel(player: Player, jobId: string): number
	if not DataService:IsLoaded(player) or not jobCfg(jobId) then
		return 1
	end
	return getJobData(player, jobId).Level
end

function JobService:ClockOut(player: Player, reason: string?)
	local s = sessions[player]
	if not s then
		return
	end
	if s.Task then
		finishTask(s, "Cancelled", { Text = "Shift ended" })
	end
	sessions[player] = nil
	local mod = modules[s.JobId]
	if mod and mod.OnClockOut then
		pcall(mod.OnClockOut, s, api)
	end
	Targets.ReleaseAllFor(player)
	s.Maid:Clean()
	if player.Character then
		Uniform.Remove(player.Character)
	end
	if s.Cfg.Vehicle then
		despawnJobVehicle(player)
	end
	if player.Parent == Players then
		player:SetAttribute("JobId", "")
		player:SetAttribute("JobLevel", 0)
		player:SetAttribute("JobTitle", "")
		event(player, "State", nil)
		if General.ShiftSummaryOnClockOut then
			local why = reason and reason ~= "" and (" (" .. reason .. ")") or ""
			NotifyService:Send(
				player,
				("%s Clocked out%s. Shift: %d tasks, %s earned."):format(s.Cfg.Icon, why, s.TasksDone, Format.Money(s.Earned)),
				"info",
				6
			)
		end
	end
	JobService.ClockedOut:Fire(player, s.JobId, reason or "")
	processQueues()
end

function JobService:ClockIn(player: Player, jobId: string): (boolean, string?, number?)
	local cfg = jobCfg(jobId)
	if not cfg then
		return false, "Unknown job"
	end
	if not DataService:IsLoaded(player) then
		return false, "Your data is still loading"
	end
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not hum or hum.Health <= 0 then
		return false, "You can't clock in right now"
	end
	if player:GetAttribute("Cuffed") then
		return false, "You can't work while in cuffs!"
	end
	local current = sessions[player]
	if current and current.JobId == jobId then
		return false, "You're already working this job"
	end
	local station = nearStation(player, jobId, General.StationUseDistance)
	if not station then
		return false, ("Go to the %s station to clock in (check the phone Jobs app for GPS)."):format(cfg.Name)
	end
	local allowed, queuePos = trySlot(player, jobId)
	if not allowed then
		event(player, "Queue", { JobId = jobId, Position = queuePos })
		return false, ("All %d %s shifts are taken. You're #%d in line."):format(cfg.Slots, cfg.Name, queuePos or 0), queuePos
	end
	if current then
		self:ClockOut(player, "Switched jobs")
	end
	removeFromQueues(player)

	local d = getJobData(player, jobId)
	local session = {
		Player = player,
		JobId = jobId,
		Cfg = cfg,
		Level = d.Level,
		StartedAt = now(),
		Earned = 0,
		TasksDone = 0,
		Task = nil,
		TaskSeq = 0,
		NextTaskAt = now() + General.FirstTaskDelay,
		Station = station,
		Maid = Maid.new(),
		HourLog = {},
		State = {},
		AfkSince = nil,
		ReportedPay = false,
	}
	sessions[player] = session

	player:SetAttribute("JobId", jobId)
	player:SetAttribute("JobLevel", d.Level)
	player:SetAttribute("JobTitle", titleFor(jobId, d.Level))

	applyUniform(session, player.Character)
	session.Maid:Give(player.CharacterAdded:Connect(function(char)
		applyUniform(session, char)
		local t = session.Task
		local mod = modules[jobId]
		if t and mod and mod.OnRespawn then
			task.delay(1, function()
				if session.Task == t then
					pcall(mod.OnRespawn, session, t, api)
				end
			end)
		end
	end))
	session.Maid:Give(player.CharacterRemoving:Connect(function(char)
		Uniform.Remove(char)
	end))

	spawnJobVehicle(session)
	local mod = modules[jobId]
	if mod and mod.OnClockIn then
		pcall(mod.OnClockIn, session, api)
	end

	tutorial(player, "ClockIn")
	NotifyService:Send(player, ("%s You're on the clock as a %s %s!"):format(cfg.Icon, titleFor(jobId, d.Level), cfg.Name), "success", 5)
	event(player, "State", stateOf(session))
	JobService.ClockedIn:Fire(player, jobId)
	return true, nil
end

---------------------------------------------------------------------------
-- Module API (shared by every job helper module)
---------------------------------------------------------------------------
api.Config = Config
api.Targets = Targets
api.Npc = Npc
api.Props = Props
api.Guard = Guard
api.Rng = rng
api.Now = now

function api.JobCfg(jobId: string)
	return jobCfg(jobId)
end

function api.Service(name: string)
	return Registry.Find(name)
end

function api.GetSession(player: Player)
	return sessions[player]
end

function api.Sessions()
	return sessions
end

function api.Notify(player: Player, text: string, kind: string?, dur: number?)
	if player.Parent == Players then
		NotifyService:Send(player, text, kind, dur)
	end
end

function api.OpenUI(player: Player, panel: string, data: any)
	NotifyService:OpenUI(player, panel, data)
end

function api.CloseUI(player: Player, panel: string)
	NotifyService:CloseUI(player, panel)
end

function api.Event(session, kind: string, data: any)
	event(session.Player, kind, data)
end

function api.Push(session)
	if session.Task then
		event(session.Player, "Task", viewOf(session, session.Task))
	end
end

function api.View(session)
	return viewOf(session, session.Task)
end

function api.Flag(player: Player, kind: string, detail: string)
	flag(player, kind, detail)
end

function api.Root(player: Player): BasePart?
	return rootOf(player)
end

function api.Pos(player: Player): Vector3?
	return Guard.RootPosition(player)
end

function api.Near(player: Player, target: any, dist: number): boolean
	return Guard.Near(player, target, dist)
end

function api.StationPos(session): Vector3
	local st = session.Station
	if st and st.Parent then
		return st.Position
	end
	local alt = primaryStation(session.JobId)
	if alt then
		session.Station = alt
		return alt.Position
	end
	return Guard.RootPosition(session.Player) or Vector3.zero
end

function api.Station(session): BasePart?
	if session.Station and session.Station.Parent then
		return session.Station
	end
	return primaryStation(session.JobId)
end

function api.LevelMult(session): number
	return levelMult(session.Cfg, session.Level)
end

-- Did the player get from `fromPos` (at time `since`) to where they are now plausibly fast?
function api.CheckTravel(session, fromPos: Vector3?, since: number?): boolean
	local pos = Guard.RootPosition(session.Player)
	if not pos or not fromPos or not since then
		return true
	end
	local dist = (pos - fromPos).Magnitude
	local minTime = dist / General.MaxTravelSpeed
	local elapsed = now() - since
	if elapsed + 0.75 < minTime then
		flag(session.Player, "JobTravel", ("%s: %.0f studs in %.1fs"):format(session.JobId, dist, elapsed))
		return false
	end
	return true
end

-- The vehicle the player is currently driving or riding in (or nil).
function api.Vehicle(player: Player): Model?
	local vs = Registry.Find("VehicleService")
	if vs and vs.GetOccupiedVehicle then
		local ok, model = pcall(vs.GetOccupiedVehicle, vs, player)
		if ok and model then
			return model
		end
	end
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	if seat then
		local model = seat:FindFirstAncestorWhichIsA("Model")
		while model and model.Parent and model.Parent:IsA("Model") and not model:GetAttribute("CarUid") do
			model = model.Parent :: Model
		end
		return model
	end
	return nil
end

function api.InSafeZone(player: Player): boolean
	if player:GetAttribute("InSafeZone") == true then
		return true
	end
	local pos = Guard.RootPosition(player)
	if not pos then
		return false
	end
	local ws = Registry.Find("WorldService")
	if ws and ws.IsInSafeZone then
		local ok, res = pcall(ws.IsInSafeZone, ws, pos)
		if ok then
			return res == true
		end
	end
	-- fallback: SafeZone-tagged volumes
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.SafeZone)) do
		local part = partOf(inst)
		if part then
			local rel = part.CFrame:PointToObjectSpace(pos)
			local half = part.Size * 0.5
			if math.abs(rel.X) <= half.X and math.abs(rel.Y) <= half.Y + 4 and math.abs(rel.Z) <= half.Z then
				return true
			end
		end
	end
	return false
end

-- Register a minigame start on the task (server remembers when it began).
function api.Minigame(t, kind: string, data: { [string]: any })
	t.Data.MinigameType = kind
	t.Data.MinigameAt = now()
	return { Type = kind, TaskId = t.Id, Data = data }
end

function api.MinigameElapsed(t, kind: string): number?
	if t.Data.MinigameType ~= kind or not t.Data.MinigameAt then
		return nil
	end
	return now() - t.Data.MinigameAt
end

-- Restart the server-side clock of the running minigame (used when a retry is allowed).
function api.RearmMinigame(t, kind: string)
	t.Data.MinigameType = kind
	t.Data.MinigameAt = now()
end

function api.EndMinigame(t)
	t.Data.MinigameType = nil
	t.Data.MinigameAt = nil
end

-- Finish the current task successfully. opts = { Mult?, Bonus?, Text? } -> paid
function api.Complete(session, opts: { [string]: any }?): number
	local t = session.Task
	if not t then
		return 0
	end
	local o = opts or {}
	local took = now() - t.StartedAt
	local minSeconds = session.Cfg.MinTaskSeconds or 0
	if took < minSeconds then
		-- only flag clearly impossible times; borderline-fast legit players just don't get paid
		if took < minSeconds * 0.5 then
			flag(session.Player, "JobTooFast", ("%s task in %.1fs"):format(session.JobId, took))
		end
		finishTask(session, "Failed", { Text = "That was too rushed — no pay this time." })
		NotifyService:Send(session.Player, "⚠️ Task rushed — no pay. Take your time!", "warning", 4)
		return 0
	end
	local paid = award(session, o.Mult or 1, o.Bonus or 0, o.Text)
	finishTask(session, "Complete", { Paid = paid, Text = o.Text })
	local cue = Config.Jobs[session.JobId]
	if cue and paid > 0 then
		NotifyService:Send(session.Player, ("%s +%s%s"):format(cue.Icon, Format.Money(paid), o.Text and ("  " .. o.Text) or ""), "money", 3)
	end
	return paid
end

-- Fail the current task. opts = { Partial = mult? } pays a fraction of the base if > 0.
function api.Fail(session, reason: string?, opts: { [string]: any }?)
	local t = session.Task
	if not t then
		return
	end
	local o = opts or {}
	local paid = 0
	if o.Partial and o.Partial > 0 and now() - t.StartedAt >= (session.Cfg.MinTaskSeconds or 0) then
		paid = award(session, o.Partial, 0, reason)
	end
	finishTask(session, "Failed", { Text = reason, Paid = paid })
	NotifyService:Send(session.Player, reason or "Task failed", paid > 0 and "money" or "warning", 4)
end

-- Pay outside the task flow (arrests, player repairs, site bonuses).
function api.Award(session, mult: number, bonus: number?, text: string?, opts: { [string]: any }?): number
	local paid = award(session, mult, bonus, text, opts)
	if paid > 0 then
		NotifyService:Send(session.Player, ("%s +%s%s"):format(session.Cfg.Icon, Format.Money(paid), text and ("  " .. text) or ""), "money", 4)
	end
	return paid
end

---------------------------------------------------------------------------
-- Station prompts + fallback stations
---------------------------------------------------------------------------
local function addStation(inst: Instance)
	local jobId = inst:GetAttribute("JobId")
	local part = partOf(inst)
	if type(jobId) ~= "string" or not part then
		return
	end
	-- StationJobId lets several config jobs share a station id; map back to config ids.
	local ids = {}
	for id, cfg in pairs(Config.Jobs) do
		if cfg.StationJobId == jobId then
			table.insert(ids, id)
		end
	end
	if #ids == 0 then
		return
	end
	for _, id in ipairs(ids) do
		local list = stations[id]
		if not list then
			list = {}
			stations[id] = list
		end
		if not table.find(list, part) then
			table.insert(list, part)
		end
	end
	local id = ids[1]
	local cfg = jobCfg(id)
	if part:FindFirstChild("JobPrompt") then
		return
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "JobPrompt"
	prompt.ActionText = "Job Info"
	prompt.ObjectText = cfg.Icon .. " " .. cfg.Name
	prompt.HoldDuration = 0.2
	prompt.MaxActivationDistance = General.PromptDistance
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = part
	prompt.Triggered:Connect(function(player)
		if not DataService:IsLoaded(player) then
			return
		end
		NotifyService:OpenUI(player, "JobOffer", offerFor(player, id))
	end)
end

local function removeStation(inst: Instance)
	local part = partOf(inst) or inst
	for _, list in pairs(stations) do
		local i = table.find(list, part :: any)
		if i then
			table.remove(list, i)
		end
	end
end

local function buildFallbackStation(jobId: string, index: number)
	local cfg = jobCfg(jobId)
	local origin = General.FallbackStationOrigin + Vector3.new((index - 1) * General.FallbackStationSpacing, 0, 0)
	local ground = Targets.GroundAt(origin)
	local folder = Workspace:FindFirstChild("JobFallbackStations")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "JobFallbackStations"
		folder.Parent = Workspace
	end
	local cf = CFrame.lookAt(ground, ground + Vector3.new(0, 0, -1))

	local assets = ServerStorage:FindFirstChild("Assets")
	local buildings = assets and assets:FindFirstChild("Buildings")
	local custom = buildings and buildings:FindFirstChild("Station_" .. jobId)
	if custom and custom:IsA("Model") then
		local m = custom:Clone()
		m:PivotTo(cf)
		local p = m.PrimaryPart or m:FindFirstChildWhichIsA("BasePart", true)
		if p then
			p:SetAttribute("JobId", cfg.StationJobId)
			m.Parent = folder
			CollectionService:AddTag(p, World.Tags.JobStation)
			return
		end
		m:Destroy()
	end

	local m = Instance.new("Model")
	m.Name = "Station_" .. jobId
	local function block(name: string, size: Vector3, offset: CFrame, color: Color3, material: Enum.Material?): Part
		local p = Instance.new("Part")
		p.Name = name
		p.Anchored = true
		p.Size = size
		p.CFrame = cf * offset
		p.Color = color
		p.Material = material or Enum.Material.SmoothPlastic
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		p.Parent = m
		return p
	end
	block("Floor", Vector3.new(16, 0.6, 12), CFrame.new(0, 0.3, 0), Color3.fromRGB(200, 200, 205), Enum.Material.Concrete)
	block("Back", Vector3.new(16, 10, 0.8), CFrame.new(0, 5, 5.6), cfg.UniformColor)
	block("Roof", Vector3.new(17, 0.8, 13), CFrame.new(0, 10.2, 0), Color3.fromRGB(50, 52, 60))
	block("PillarL", Vector3.new(0.8, 10, 0.8), CFrame.new(-7.6, 5, -5.6), Color3.fromRGB(230, 230, 235))
	block("PillarR", Vector3.new(0.8, 10, 0.8), CFrame.new(7.6, 5, -5.6), Color3.fromRGB(230, 230, 235))
	local desk = block("Desk", Vector3.new(6, 3.4, 2), CFrame.new(0, 2, 1), cfg.UniformAccent)
	local sign = block("Sign", Vector3.new(12, 2.4, 0.4), CFrame.new(0, 8.6, 5.0), Color3.fromRGB(25, 27, 35))
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.LightInfluence = 0
	gui.Parent = sign
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Text = cfg.Icon .. " " .. cfg.Name
	label.Parent = gui
	m.PrimaryPart = desk
	desk:SetAttribute("JobId", cfg.StationJobId)
	m.Parent = folder
	CollectionService:AddTag(desk, World.Tags.JobStation)
end

local function ensureStations()
	local index = 0
	for _, jobId in ipairs(Config.Order) do
		index += 1
		if #stationList(jobId) == 0 then
			buildFallbackStation(jobId, index)
			-- signal may be deferred: register directly too
			local folder = Workspace:FindFirstChild("JobFallbackStations")
			local m = folder and folder:FindFirstChild("Station_" .. jobId)
			if m and m:IsA("Model") then
				local p = m.PrimaryPart
				if p then
					addStation(p)
				end
			end
		end
	end
end

---------------------------------------------------------------------------
-- Remote handlers
---------------------------------------------------------------------------
local function listFor(player: Player)
	local out = {}
	for _, id in ipairs(Config.Order) do
		if jobCfg(id) then
			table.insert(out, offerFor(player, id))
		end
	end
	local s = sessions[player]
	return { Jobs = out, Current = s and s.JobId or nil, Vip = hasVip(player) }
end

local function handleAct(player: Player, payload)
	local s = sessions[player]
	if not s then
		return { ok = false, err = "You're not clocked in" }
	end
	local op = Guard.Id(payload.Op, 24)
	if not op then
		return { ok = false, err = "Bad request" }
	end
	local mod = modules[s.JobId]
	if not mod then
		return { ok = false, err = "Job unavailable" }
	end
	s.AfkSince = nil
	local free = mod.FreeOps and mod.FreeOps[op]
	if free then
		local res = free(s, payload, api)
		if type(res) ~= "table" then
			res = { ok = res ~= false }
		end
		return res
	end
	local fn = mod.Ops and mod.Ops[op]
	if not fn then
		return { ok = false, err = "Unknown action" }
	end
	local t = s.Task
	if not t then
		return { ok = false, err = "No active task" }
	end
	if Guard.Int(payload.TaskId, 1, 1e9) ~= t.Id then
		return { ok = false, err = "That task has changed", Task = viewOf(s, t) }
	end
	local res = fn(s, t, payload, api)
	if type(res) ~= "table" then
		res = { ok = res ~= false }
	end
	if sessions[player] == s then
		res.Task = viewOf(s, s.Task)
		res.HasTask = s.Task ~= nil
	end
	return res
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function JobService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	Net.Declare("JobEvent")

	for _, id in ipairs(Config.Order) do
		local m = script.Parent:FindFirstChild(id)
		if m and m:IsA("ModuleScript") then
			local ok, mod = pcall(require, m)
			if ok and type(mod) == "table" then
				modules[id] = mod
			else
				warn(("[JobService] failed to load job module %s: %s"):format(id, tostring(mod)))
			end
		else
			warn("[JobService] missing job module " .. id)
		end
	end

	Net.HandleActions("Jobs", {
		List = function(player)
			return listFor(player)
		end,
		GetOffer = function(player, payload)
			local id = Guard.OneOf(payload.JobId, Config.Jobs)
			if not id then
				return { ok = false, err = "Unknown job" }
			end
			return { ok = true, Offer = offerFor(player, id) }
		end,
		ClockIn = function(player, payload)
			local id = Guard.OneOf(payload.JobId, Config.Jobs)
			if not id then
				return { ok = false, err = "Unknown job" }
			end
			local ok, err, queuePos = self:ClockIn(player, id)
			return { ok = ok, err = err, Queue = queuePos, State = stateOf(sessions[player]) }
		end,
		ClockOut = function(player)
			if not sessions[player] then
				return { ok = false, err = "You're not clocked in" }
			end
			self:ClockOut(player, "")
			return { ok = true }
		end,
		LeaveQueue = function(player)
			removeFromQueues(player)
			return { ok = true }
		end,
		GetState = function(player)
			return { ok = true, State = stateOf(sessions[player]) }
		end,
		Act = handleAct,
		AcceptRepair = function(player, payload)
			local mech = modules.Mechanic
			if not (mech and mech.AcceptRepair) then
				return { ok = false, err = "Unavailable" }
			end
			return mech.AcceptRepair(player, payload, api)
		end,
		DeclineRepair = function(player, payload)
			local mech = modules.Mechanic
			if not (mech and mech.DeclineRepair) then
				return { ok = false, err = "Unavailable" }
			end
			return mech.DeclineRepair(player, payload, api)
		end,
	}, {
		rate = 6,
		burst = 14,
		perAction = {
			List = { rate = 1, burst = 4 },
			GetOffer = { rate = 2, burst = 4 },
			ClockIn = { rate = 0.5, burst = 3 },
			ClockOut = { rate = 0.5, burst = 3 },
			Act = { rate = 5, burst = 10 },
			AcceptRepair = { rate = 1, burst = 2 },
			DeclineRepair = { rate = 1, burst = 2 },
		},
	})

	Targets.Init()
	local tag = World.Tags.JobStation
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		addStation(inst)
	end
	CollectionService:GetInstanceAddedSignal(tag):Connect(addStation)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(removeStation)

	Players.PlayerRemoving:Connect(function(player)
		self:ClockOut(player, "Left")
		removeFromQueues(player)
	end)
end

function JobService:Start()
	for id, mod in pairs(modules) do
		if mod.Init then
			local ok, err = pcall(mod.Init, api)
			if not ok then
				warn(("[JobService] %s.Init failed: %s"):format(id, tostring(err)))
			end
		end
	end

	-- Generate greybox stations only for jobs the world never provided. Wait until the world has
	-- stopped adding stations (it may build the city over several seconds) before deciding.
	task.spawn(function()
		local started = os.clock()
		local lastCount, stableSince = -1, os.clock()
		while true do
			task.wait(2)
			local count = #CollectionService:GetTagged(World.Tags.JobStation)
			if count ~= lastCount then
				lastCount = count
				stableSince = os.clock()
			end
			local waited = os.clock() - started
			if (waited >= General.FallbackStationWait and os.clock() - stableSince >= 6) or waited >= 90 then
				break
			end
		end
		ensureStations()
	end)

	-- Batched job loop (<= 5 Hz)
	local rate = math.clamp(General.TickRate, 1, 5)
	local last = os.clock()
	while true do
		task.wait(1 / rate)
		local clock = os.clock()
		local dt = clock - last
		last = clock
		local t = now()
		for player, s in pairs(sessions) do
			local ok, err = pcall(function()
				-- AFK auto clock-out
				if player:GetAttribute("AFK") == true then
					s.AfkSince = s.AfkSince or t
					if t - s.AfkSince > General.AfkClockOutSeconds then
						self:ClockOut(player, "AFK")
						return
					end
				else
					s.AfkSince = nil
				end
				local mod = modules[s.JobId]
				local task_ = s.Task
				if task_ then
					if t > task_.Deadline then
						if mod and mod.OnTimeout then
							mod.OnTimeout(s, task_, api)
						end
						if s.Task == task_ then
							api.Fail(s, "⏰ Out of time!")
						end
					elseif mod and mod.Tick then
						mod.Tick(s, task_, dt, api)
					end
				elseif t >= s.NextTaskAt then
					newTask(s)
				end
			end)
			if not ok then
				warn("[JobService] tick error:", err)
			end
		end
		for id, mod in pairs(modules) do
			if mod.GlobalTick then
				local ok, err = pcall(mod.GlobalTick, dt, api)
				if not ok then
					warn(("[JobService] %s.GlobalTick error: %s"):format(id, tostring(err)))
				end
			end
		end
		processQueues()
	end
end

return JobService
