-- Paramedic: drive to a PatientSpot -> CPR rhythm minigame -> transport to the hospital Dropoff for a bonus.

local Paramedic = { Id = "Paramedic" }

local function cfgOf(api)
	return api.JobCfg("Paramedic")
end

function Paramedic.NewTask(session, t, api)
	local center = api.StationPos(session)
	local from = api.Pos(session.Player) or center
	local spot = api.Targets.Pick("Paramedic", "PatientSpot", {
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
	local npc = api.Npc.Get(api.Targets.SurfaceCFrame(spot), { Pose = "Lie", Label = "Patient", Icon = "🤕" })
	t.Data.Npc = npc
	t.Maid:Give(function()
		if t.Data.Npc then
			api.Npc.Release(t.Data.Npc)
			t.Data.Npc = nil
		end
	end)
	t.Data.Spot = spot
	t.Data.From = from
	t.Data.Since = api.Now()
	t.Stage = "Respond"
	t.Title = "🚑 Medical emergency"
	t.Hint = "Someone collapsed! Get there fast."
	t.Target = spot.Position
	t.TargetLabel = "Patient"
	t.Action = "StartCpr"
	t.ActionText = "❤️ Start CPR"
	return true
end

Paramedic.Ops = {
	StartCpr = function(session, t, _payload, api)
		if t.Stage ~= "Respond" then
			return { ok = false, err = "The patient is already stable" }
		end
		if not api.Near(session.Player, t.Data.Spot, t.Radius + 3) then
			return { ok = false, err = "Get to the patient" }
		end
		if api.Vehicle(session.Player) then
			return { ok = false, err = "Get out of the ambulance first" }
		end
		if not t.Data.Arrived then
			if not api.CheckTravel(session, t.Data.From, t.Data.Since) then
				api.Fail(session, "Call cancelled.")
				return { ok = false, err = "Call cancelled" }
			end
			t.Data.Arrived = true
		end
		local cfg = cfgOf(api)
		return {
			ok = true,
			Minigame = api.Minigame(t, "Cpr", { Compressions = cfg.CprCompressions, Bpm = 110, Op = "Cpr", MaxSeconds = cfg.CprMaxSeconds }),
		}
	end,

	Cpr = function(session, t, payload, api)
		local cfg = cfgOf(api)
		local elapsed = api.MinigameElapsed(t, "Cpr")
		if t.Stage ~= "Respond" or not elapsed then
			return { ok = false, err = "Start CPR first" }
		end
		local score = api.Guard.Number(payload.Score, 0, 1)
		if not score then
			return { ok = false, err = "Bad request" }
		end
		if elapsed < cfg.CprMinSeconds or elapsed > cfg.CprMaxSeconds + 3 then
			api.RearmMinigame(t, "Cpr") -- let the medic try again from a fresh clock
			return { ok = false, err = "The rhythm was off. Try again!" }
		end
		if score < 0.35 then
			api.RearmMinigame(t, "Cpr")
			return { ok = false, err = "No pulse yet... keep the rhythm! Try again." }
		end
		api.EndMinigame(t)
		t.Data.Quality = score
		local hospital = api.Targets.Pick("Paramedic", "Dropoff", {
			Center = api.StationPos(session),
			RadiusKey = "HospitalDropoff",
		})
		if not hospital then
			-- no hospital at all: pay for the on-scene treatment
			local paid = api.Complete(session, { Mult = 0.8 + 0.4 * score, Text = "❤️ Patient stabilized" })
			return { ok = true, Paid = paid }
		end
		if t.Data.Npc then
			api.Npc.Release(t.Data.Npc)
			t.Data.Npc = nil
		end
		local now = api.Now()
		local dist = (hospital.Position - t.Data.Spot.Position).Magnitude
		local limit = 25 + dist * cfg.TransportSecondsPerStud
		t.Data.Hospital = hospital
		t.Data.LoadAt = now
		t.Data.TransportUntil = now + limit
		t.Deadline = now + limit * 1.6 + 30
		t.Stage = "Transport"
		t.Title = "Rush the patient to the hospital"
		t.Hint = ("Patient stable (%d%% CPR). Get to Skyline General!"):format(math.floor(score * 100))
		t.Target = hospital.Position
		t.TargetLabel = "Skyline General"
		t.Action = "Admit"
		t.ActionText = "🏥 Admit Patient"
		t.Extra = { TransportUntil = t.Data.TransportUntil }
		api.Push(session)
		return { ok = true, Result = "❤️ Pulse restored!" }
	end,

	Admit = function(session, t, _payload, api)
		if t.Stage ~= "Transport" then
			return { ok = false, err = "Treat the patient first" }
		end
		if not api.Near(session.Player, t.Data.Hospital, t.Radius + 4) then
			return { ok = false, err = "Get to the hospital entrance" }
		end
		if not api.CheckTravel(session, t.Data.Spot.Position, t.Data.LoadAt) then
			api.Fail(session, "Transfer rejected.")
			return { ok = false, err = "Transfer rejected" }
		end
		local cfg = cfgOf(api)
		local q = t.Data.Quality or 0.5
		local mult
		local text
		if api.Now() <= t.Data.TransportUntil then
			mult = (1 + cfg.TransportBonus) * (0.8 + 0.2 * q)
			text = "🏥 Patient saved — fast transport bonus!"
		else
			mult = (1 + cfg.TransportBonus * 0.4) * (0.8 + 0.2 * q)
			text = "🏥 Patient admitted"
		end
		local paid = api.Complete(session, { Mult = mult, Text = text })
		return { ok = true, Paid = paid }
	end,
}

function Paramedic.OnTimeout(session, t, api)
	if t.Stage == "Transport" then
		api.Fail(session, "⏰ Another unit took over the transfer. Partial pay.", { Partial = cfgOf(api).NoTransportMultiplier })
	end
end

return Paramedic
