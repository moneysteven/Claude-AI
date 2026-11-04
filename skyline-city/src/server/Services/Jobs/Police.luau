-- Police: patrol checkpoints, respond to calls (cuff QTE on an NPC suspect), write tickets,
-- and roleplay arrests of players who have the "Wanted" attribute (never in safe zones; cuffs auto-release).

local Players = game:GetService("Players")

local Police = { Id = "Police" }

local DIRS = { "Up", "Down", "Left", "Right" }

-- [target Player] = { Officer, Until, WalkSpeed, JumpPower, JumpHeight, Humanoid }
local cuffed: { [Player]: any } = {}
local pairCooldown: { [string]: number } = {}
local arrestPaidUntil: { [string]: number } = {} -- "officer:target" -> time when the pair can pay again
local arrestLog: { [Player]: { number } } = {} -- officer -> times of paid arrests (last hour)

local function cfgOf(api)
	return api.JobCfg("Police")
end

local function weightedPick(weights: { [string]: number }, rng: Random): string
	local total = 0
	for _, w in pairs(weights) do
		total += w
	end
	local r = rng:NextNumber(0, total)
	local keys = {}
	for k in pairs(weights) do
		table.insert(keys, k)
	end
	table.sort(keys)
	for _, k in ipairs(keys) do
		r -= weights[k]
		if r <= 0 then
			return k
		end
	end
	return keys[1]
end

---------------------------------------------------------------------------
-- Player cuffs
---------------------------------------------------------------------------
local function release(target: Player, api, why: string?)
	local c = cuffed[target]
	if not c then
		return
	end
	cuffed[target] = nil
	local hum = c.Humanoid
	if hum and hum.Parent then
		hum.WalkSpeed = c.WalkSpeed
		if hum.UseJumpPower then
			hum.JumpPower = c.JumpPower
		else
			hum.JumpHeight = c.JumpHeight
		end
	end
	if target.Parent == Players then
		target:SetAttribute("Cuffed", false)
		api.Notify(target, why or "🔓 You've been released from cuffs.", "info")
	end
end

function Police.Init(api)
	Players.PlayerRemoving:Connect(function(p)
		arrestLog[p] = nil
		release(p, api)
		for target, c in pairs(cuffed) do
			if c.Officer == p then
				release(target, api, "🔓 The officer left. You're free to go.")
			end
		end
	end)
end

function Police.GlobalTick(_dt, api)
	local now = api.Now()
	for target, c in pairs(cuffed) do
		local hum = c.Humanoid
		if now >= c.Until or not (hum and hum.Parent and hum.Health > 0) then
			release(target, api)
		else
			-- keep the suspect restrained (no driving off, no sprint scripts on the server side)
			local seat = hum.SeatPart
			if seat then
				local weld = seat:FindFirstChild("SeatWeld")
				if weld then
					weld:Destroy()
				end
				hum.Sit = false
			end
			if hum.WalkSpeed > 0 then
				hum.WalkSpeed = 0
			end
		end
	end
	for k, untilT in pairs(pairCooldown) do
		if now >= untilT then
			pairCooldown[k] = nil
		end
	end
	for k, untilT in pairs(arrestPaidUntil) do
		if now >= untilT then
			arrestPaidUntil[k] = nil
		end
	end
end

function Police.OnClockOut(session, api)
	for target, c in pairs(cuffed) do
		if c.Officer == session.Player then
			release(target, api, "🔓 The officer went off duty. You're free to go.")
		end
	end
end

Police.FreeOps = {
	CuffPlayer = function(session, payload, api)
		local cfg = cfgOf(api)
		local officer = session.Player
		local userId = api.Guard.Int(payload.UserId, 1, 2 ^ 53)
		local target = userId and Players:GetPlayerByUserId(userId)
		if not target or target == officer then
			return { ok = false, err = "No suspect" }
		end
		if target:GetAttribute("Wanted") ~= true then
			return { ok = false, err = "That player isn't wanted" }
		end
		if cuffed[target] then
			return { ok = false, err = "Already cuffed" }
		end
		if api.InSafeZone(target) or api.InSafeZone(officer) then
			return { ok = false, err = "No arrests inside safe zones" }
		end
		if target:GetAttribute("InVehicle") == true or api.Vehicle(target) then
			return { ok = false, err = "The suspect is in a vehicle" }
		end
		if api.Vehicle(officer) then
			return { ok = false, err = "Get out of your vehicle first" }
		end
		local troot = api.Root(target)
		if not troot or not api.Near(officer, troot.Position, cfg.PlayerCuffDistance) then
			return { ok = false, err = "Get closer to the suspect" }
		end
		local key = officer.UserId .. ":" .. target.UserId
		if pairCooldown[key] then
			return { ok = false, err = "You recently arrested this player" }
		end
		local hum = target.Character and target.Character:FindFirstChildOfClass("Humanoid")
		if not hum or hum.Health <= 0 then
			return { ok = false, err = "No suspect" }
		end
		hum.Sit = false
		cuffed[target] = {
			Officer = officer,
			Until = api.Now() + cfg.PlayerCuffSeconds,
			WalkSpeed = hum.WalkSpeed,
			JumpPower = hum.JumpPower,
			JumpHeight = hum.JumpHeight,
			Humanoid = hum,
		}
		hum.WalkSpeed = 0
		if hum.UseJumpPower then
			hum.JumpPower = 0
		else
			hum.JumpHeight = 0
		end
		pairCooldown[key] = api.Now() + cfg.PlayerCuffCooldown
		target:SetAttribute("Cuffed", true)
		target:SetAttribute("Wanted", false) -- arrest clears the wanted status
		api.Notify(target, ("🚓 You've been cuffed by Officer %s for %ds."):format(officer.DisplayName, cfg.PlayerCuffSeconds), "warning", 6)
		local js = api.Service("JobService")
		if js and target:GetAttribute("JobId") ~= "" and js.ClockOut then
			-- arrested players can't keep working
			task.spawn(js.ClockOut, js, target, "Arrested")
		end
		-- Arrest bonus, limited per pair and per hour so friends / alts can't farm it.
		local now = api.Now()
		local log = arrestLog[officer]
		if not log then
			log = {}
			arrestLog[officer] = log
		end
		for i = #log, 1, -1 do
			if now - log[i] > 3600 then
				table.remove(log, i)
			end
		end
		if arrestPaidUntil[key] or #log >= cfg.PlayerArrestPaidPerHour then
			return { ok = true, Result = ("Cuffed %s (no bonus — arrest limit reached)"):format(target.DisplayName) }
		end
		arrestPaidUntil[key] = now + cfg.PlayerArrestPayCooldown
		table.insert(log, now)
		api.Award(session, cfg.PlayerArrestPayMultiplier, 0, "🚔 Arrest bonus")
		return { ok = true, Result = ("Cuffed %s"):format(target.DisplayName) }
	end,

	ReleasePlayer = function(session, payload, api)
		local userId = api.Guard.Int(payload.UserId, 1, 2 ^ 53)
		local target = userId and Players:GetPlayerByUserId(userId)
		if not target or not cuffed[target] or cuffed[target].Officer ~= session.Player then
			return { ok = false, err = "Not your suspect" }
		end
		release(target, api)
		return { ok = true }
	end,
}

---------------------------------------------------------------------------
-- NPC tasks
---------------------------------------------------------------------------
local function setCheckpoint(t, api)
	local point = t.Data.Points[t.Data.Index]
	t.Target = point.Position
	t.TargetLabel = ("Checkpoint %d/%d"):format(t.Data.Index, #t.Data.Points)
	t.Progress = (t.Data.Index - 1) / #t.Data.Points
	t.ProgressText = ("%d/%d checkpoints"):format(t.Data.Index - 1, #t.Data.Points)
end

function Police.NewTask(session, t, api)
	local cfg = cfgOf(api)
	local center = api.StationPos(session)
	local from = api.Pos(session.Player) or center
	local kind = weightedPick(cfg.TaskWeights, api.Rng)
	t.Data.Kind = kind
	t.Data.From = from
	t.Data.Since = api.Now()

	if kind == "Patrol" then
		local points = {}
		local last = from
		for _ = 1, cfg.PatrolCheckpoints do
			local p = api.Targets.Pick("Police", "PatrolPoint", {
				Center = center,
				From = last,
				MinDist = cfg.CheckpointDistance[1],
				MaxDist = cfg.CheckpointDistance[2],
				Exclude = points,
			})
			if p then
				table.insert(points, p)
				last = p.Position
			end
		end
		if #points == 0 then
			return false
		end
		t.Data.Points = points
		t.Data.Index = 1
		t.Stage = "Patrol"
		t.Title = "Patrol the city"
		t.Hint = "Check in at each checkpoint."
		t.Action = "Checkpoint"
		t.ActionText = "✅ Check In"
		setCheckpoint(t, api)
		return true
	end

	local spot = api.Targets.Pick("Police", "PatrolPoint", {
		Center = center,
		From = from,
		MinDist = cfg.CheckpointDistance[1],
		MaxDist = cfg.CheckpointDistance[2],
		Exclusive = true,
		Owner = session.Player,
	})
	if not spot then
		return false
	end
	t.Maid:Give(function()
		api.Targets.Release(spot)
	end)
	t.Data.Spot = spot
	t.Target = spot.Position
	local standCf = api.Targets.SurfaceCFrame(spot)

	if kind == "Call" then
		local npc = api.Npc.Get(standCf, { Label = "Suspect", Icon = "❗" })
		t.Maid:Give(function()
			api.Npc.Release(npc)
		end)
		t.Stage = "Call"
		t.Title = "🚨 Respond to a call"
		t.Hint = "A suspect was reported. Arrest them!"
		t.TargetLabel = "Suspect"
		t.Action = "StartCuff"
		t.ActionText = "🔗 Arrest"
		t.Data.Attempts = 0
	else
		local car = api.Props.NpcCar(standCf * CFrame.new(0, 0, 6) * CFrame.Angles(0, math.rad(90), 0))
		t.Maid:Give(car)
		local v = cfg.Violations[api.Rng:NextInteger(1, #cfg.Violations)]
		t.Data.Violation = v
		t.Stage = "Ticket"
		t.Title = "📝 Write a ticket"
		t.Hint = "Inspect the reported car."
		t.TargetLabel = "Reported car"
		t.Action = "Inspect"
		t.ActionText = "📝 Inspect Car"
	end
	return true
end

local function shuffle(list, rng)
	for i = #list, 2, -1 do
		local j = rng:NextInteger(1, i)
		list[i], list[j] = list[j], list[i]
	end
	return list
end

Police.Ops = {
	Checkpoint = function(session, t, _payload, api)
		if t.Stage ~= "Patrol" then
			return { ok = false, err = "Not on patrol" }
		end
		local point = t.Data.Points[t.Data.Index]
		if not point or not api.Near(session.Player, point, t.Radius + 3) then
			return { ok = false, err = "Drive to the checkpoint" }
		end
		local prevPos = t.Data.Index == 1 and t.Data.From or t.Data.Points[t.Data.Index - 1].Position
		if not api.CheckTravel(session, prevPos, t.Data.Since) then
			api.Fail(session, "Patrol rejected.")
			return { ok = false, err = "Patrol rejected" }
		end
		t.Data.Since = api.Now()
		t.Data.Index += 1
		if t.Data.Index > #t.Data.Points then
			local paid = api.Complete(session, { Mult = 1, Text = "Patrol complete" })
			return { ok = true, Paid = paid }
		end
		setCheckpoint(t, api)
		api.Push(session)
		return { ok = true }
	end,

	StartCuff = function(session, t, _payload, api)
		if t.Stage ~= "Call" then
			return { ok = false, err = "No suspect here" }
		end
		if not api.Near(session.Player, t.Data.Spot, t.Radius + 3) then
			return { ok = false, err = "Get closer to the suspect" }
		end
		if api.Vehicle(session.Player) then
			return { ok = false, err = "Get out of your vehicle first" }
		end
		if not t.Data.Arrived then
			if not api.CheckTravel(session, t.Data.From, t.Data.Since) then
				api.Fail(session, "Call cancelled.")
				return { ok = false, err = "Call cancelled" }
			end
			t.Data.Arrived = true
		end
		local cfg = cfgOf(api)
		local seq = {}
		for i = 1, cfg.CuffSequenceLength do
			seq[i] = DIRS[api.Rng:NextInteger(1, #DIRS)]
		end
		t.Data.Sequence = seq
		return { ok = true, Minigame = api.Minigame(t, "Cuff", { Sequence = seq, Window = cfg.CuffWindow, Op = "Cuff" }) }
	end,

	Cuff = function(session, t, payload, api)
		local cfg = cfgOf(api)
		local elapsed = api.MinigameElapsed(t, "Cuff")
		if t.Stage ~= "Call" or not elapsed then
			return { ok = false, err = "Start the arrest first" }
		end
		local input = payload.Sequence
		local good = type(input) == "table" and #input == #t.Data.Sequence
		if good then
			for i, dir in ipairs(t.Data.Sequence) do
				if input[i] ~= dir then
					good = false
					break
				end
			end
		end
		if elapsed < cfg.CuffMinSeconds then
			good = false
		end
		if elapsed > cfg.CuffWindow + 2 then
			api.EndMinigame(t)
			api.Fail(session, "🏃 The suspect got away!")
			return { ok = false, err = "Too slow — the suspect escaped" }
		end
		if not good then
			t.Data.Attempts += 1
			if t.Data.Attempts >= 3 then
				api.EndMinigame(t)
				api.Fail(session, "🏃 The suspect broke free and escaped!")
				return { ok = false, err = "The suspect escaped" }
			end
			api.RearmMinigame(t, "Cuff") -- retry with a fresh window
			return { ok = false, err = "The suspect struggled free! Try again." }
		end
		api.EndMinigame(t)
		local mult = cfg.CallPayMultiplier * (1 - 0.15 * t.Data.Attempts)
		local paid = api.Complete(session, { Mult = mult, Text = "🚔 Suspect arrested" })
		return { ok = true, Paid = paid }
	end,

	Inspect = function(session, t, _payload, api)
		if t.Stage ~= "Ticket" then
			return { ok = false, err = "Nothing to inspect" }
		end
		if not api.Near(session.Player, t.Data.Spot, t.Radius + 6) then
			return { ok = false, err = "Get closer to the car" }
		end
		if not t.Data.Arrived then
			if not api.CheckTravel(session, t.Data.From, t.Data.Since) then
				api.Fail(session, "Call cancelled.")
				return { ok = false, err = "Call cancelled" }
			end
			t.Data.Arrived = true
		end
		local cfg = cfgOf(api)
		local options = { t.Data.Violation }
		local pool = {}
		for _, v in ipairs(cfg.Violations) do
			if v.Id ~= t.Data.Violation.Id then
				table.insert(pool, v)
			end
		end
		shuffle(pool, api.Rng)
		for i = 1, math.min(#pool, cfg.TicketChoices - 1) do
			table.insert(options, pool[i])
		end
		shuffle(options, api.Rng)
		t.Data.Options = options
		local labels = {}
		for i, v in ipairs(options) do
			labels[i] = v.Name
		end
		return {
			ok = true,
			Minigame = api.Minigame(t, "Choice", {
				Title = "📝 Write a Ticket",
				Prompt = t.Data.Violation.Clue,
				Question = "Which violation do you write?",
				Options = labels,
				Op = "Ticket",
			}),
		}
	end,

	Ticket = function(session, t, payload, api)
		local elapsed = api.MinigameElapsed(t, "Choice")
		if t.Stage ~= "Ticket" or not elapsed or not t.Data.Options then
			return { ok = false, err = "Inspect the car first" }
		end
		local choice = api.Guard.Int(payload.Choice, 1, #t.Data.Options)
		if not choice then
			return { ok = false, err = "Pick a violation" }
		end
		if elapsed < 1 then
			return { ok = false, err = "Take a moment to read the report" }
		end
		api.EndMinigame(t)
		local cfg = cfgOf(api)
		if t.Data.Options[choice].Id == t.Data.Violation.Id then
			local paid = api.Complete(session, { Mult = cfg.TicketPayMultiplier, Text = "📝 Ticket issued" })
			return { ok = true, Paid = paid, Result = "Correct violation!" }
		end
		api.Fail(session, "❌ Wrong violation — the ticket was thrown out in court.")
		return { ok = false, err = "Wrong violation" }
	end,
}

return Police
