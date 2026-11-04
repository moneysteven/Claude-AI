-- Firefighter: drive to a FireSpot, then hold the hose. Fire HP only drops on the server while the
-- player is in range, facing the fire, on foot and holding the action (refreshed by the client ~1/s).

local Fire = { Id = "Fire" }

local function cfgOf(api)
	return api.JobCfg("Fire")
end

local function totals(t)
	local hp, max = 0, 0
	for _, f in ipairs(t.Data.Fires) do
		hp += f.HP
		max += f.Max
	end
	return hp, max
end

local function updateView(t)
	local hp, max = totals(t)
	t.Progress = max > 0 and (1 - hp / max) or 0
	local left = 0
	local positions = {}
	for _, f in ipairs(t.Data.Fires) do
		if f.HP > 0 then
			left += 1
			table.insert(positions, f.Part.Position)
		end
	end
	t.ProgressText = ("%d fire%s left"):format(left, left == 1 and "" or "s")
	t.Extra = { Fires = positions, HoseRange = t.Data.Range }
end

function Fire.NewTask(session, t, api)
	local cfg = cfgOf(api)
	local center = api.StationPos(session)
	local from = api.Pos(session.Player) or center
	local spot = api.Targets.Pick("Fire", "FireSpot", {
		Center = center,
		From = from,
		MinDist = 60,
		Exclusive = true,
		Owner = session.Player,
	})
	if not spot then
		return false
	end
	t.Maid:Give(function()
		api.Targets.Release(spot)
	end)
	local count = api.Rng:NextInteger(cfg.FireCount[1], cfg.FireCount[2])
	local fires = {}
	for i = 1, count do
		local angle = (i / count) * math.pi * 2 + api.Rng:NextNumber(-0.4, 0.4)
		local r = (i == 1) and 0 or api.Rng:NextNumber(cfg.FireSpread * 0.4, cfg.FireSpread)
		local pos = api.Targets.GroundAt(spot.Position + Vector3.new(math.cos(angle) * r, 0, math.sin(angle) * r))
		local part = api.Props.Fire(CFrame.new(pos))
		t.Maid:Give(function()
			api.Props.ReleaseFire(part)
		end)
		table.insert(fires, { Part = part, HP = cfg.FireHP, Max = cfg.FireHP })
	end
	t.Data.Fires = fires
	t.Data.Spot = spot
	t.Data.From = from
	t.Data.Since = api.Now()
	t.Data.Range = cfg.HoseRange
	t.Data.HoseUntil = 0
	t.Stage = "Drive"
	t.Title = "🔥 Fire reported!"
	t.Hint = "Drive to the fire."
	t.Target = spot.Position
	t.TargetLabel = "Fire"
	t.Radius = cfg.InteractRadius
	updateView(t)
	return true
end

Fire.Ops = {
	Hose = function(session, t, payload, api)
		if t.Stage ~= "Extinguish" then
			return { ok = false, err = "Get to the fire first" }
		end
		local on = api.Guard.Bool(payload.On)
		if on == nil then
			return { ok = false, err = "Bad request" }
		end
		t.Data.HoseUntil = on and (api.Now() + 1.6) or 0
		return { ok = true }
	end,
}

function Fire.Tick(session, t, dt, api)
	local cfg = cfgOf(api)
	local player = session.Player
	if t.Stage == "Drive" then
		if api.Near(player, t.Data.Spot, t.Radius) then
			if not api.CheckTravel(session, t.Data.From, t.Data.Since) then
				api.Fail(session, "Response rejected.")
				return
			end
			t.Stage = "Extinguish"
			t.Title = "Put out the fires"
			t.Hint = "Face a fire and hold the hose button."
			t.Action = "Hose"
			t.ActionText = "💦 Hose"
			t.Hold = true
			api.Push(session)
		end
		return
	end

	local now = api.Now()
	local hosing = now < t.Data.HoseUntil and not api.Vehicle(player)
	local hitIndex = nil
	if hosing then
		local root = api.Root(player)
		if root then
			local look = root.CFrame.LookVector
			local flatLook = Vector3.new(look.X, 0, look.Z)
			local bestD = cfg.HoseRange
			for i, f in ipairs(t.Data.Fires) do
				if f.HP > 0 then
					local offset = f.Part.Position - root.Position
					local d = offset.Magnitude
					local flat = Vector3.new(offset.X, 0, offset.Z)
					local facing = (flat.Magnitude < 3 or flatLook.Magnitude < 0.01) and 1 or flatLook.Unit:Dot(flat.Unit)
					if d <= bestD and facing >= cfg.HoseFacingDot then
						bestD = d
						hitIndex = i
					end
				end
			end
		end
	end

	local changed = false
	local dps = cfg.HoseDps * (1 + cfg.HoseDpsPerLevel * (session.Level - 1))
	for i, f in ipairs(t.Data.Fires) do
		if f.HP > 0 then
			local before = f.HP
			if i == hitIndex then
				f.HP = math.max(0, f.HP - dps * dt)
			else
				f.HP = math.min(f.Max, f.HP + cfg.FireRegenPerSecond * dt)
			end
			if f.HP ~= before then
				changed = true
				api.Props.SetFire(f.Part, f.HP / f.Max)
			end
		end
	end

	local hp = totals(t)
	if hp <= 0 then
		local count = #t.Data.Fires
		local paid = api.Complete(session, { Mult = 1 + cfg.PayPerFire * (count - 1), Text = ("🧯 %d fires out!"):format(count) })
		api.Event(session, "Progress", { TaskId = t.Id, Done = true, Paid = paid })
		return
	end
	if changed and now - (t.Data.LastPush or 0) >= 0.5 then
		t.Data.LastPush = now
		updateView(t)
		api.Event(session, "Progress", { TaskId = t.Id, Progress = t.Progress, ProgressText = t.ProgressText, Hitting = hitIndex ~= nil, Extra = t.Extra })
	end
end

function Fire.OnTimeout(session, t, api)
	local hp, max = totals(t)
	local done = max > 0 and (1 - hp / max) or 0
	if done >= 0.5 then
		api.Fail(session, "⏰ Backup crews finished the job. Partial pay.", { Partial = done * 0.5 })
	end
end

return Fire
