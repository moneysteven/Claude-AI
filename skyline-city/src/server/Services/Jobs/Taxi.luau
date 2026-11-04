-- Taxi: NPC passenger waits at a Pickup -> drive them to a Dropoff.
-- Fare = flag fare + distance; star rating from speed and crashes (vehicle Health attribute delta).

local Taxi = { Id = "Taxi" }

local function cfgOf(api)
	return api.JobCfg("Taxi")
end

local function vehicleHealth(model: Model?): number?
	if not model then
		return nil
	end
	local h = model:GetAttribute("Health")
	return type(h) == "number" and h or nil
end

function Taxi.NewTask(session, t, api)
	local cfg = cfgOf(api)
	local center = api.StationPos(session)
	local from = api.Pos(session.Player) or center
	local spot = api.Targets.Pick("Taxi", "Pickup", {
		Center = center,
		From = from,
		MinDist = cfg.PickupDistance[1],
		MaxDist = cfg.PickupDistance[2],
		Exclusive = true,
		Owner = session.Player,
	})
	if not spot then
		return false
	end
	t.Maid:Give(function()
		api.Targets.Release(spot)
	end)
	local npc = api.Npc.Get(api.Targets.SurfaceCFrame(spot), { Label = "Passenger", Icon = "🙋" })
	t.Data.Npc = npc
	t.Maid:Give(function()
		if t.Data.Npc then
			api.Npc.Release(t.Data.Npc)
			t.Data.Npc = nil
		end
	end)
	t.Data.Pickup = spot
	t.Data.From = from
	t.Data.Since = api.Now()
	t.Stage = "Pickup"
	t.Title = "Pick up your passenger"
	t.Hint = cfg.RequireVehicle and "Drive up to the waving passenger." or "Meet the passenger."
	t.Target = spot.Position
	t.TargetLabel = "Passenger"
	t.Action = "Board"
	t.ActionText = "🚕 Pick Up"
	t.NeedsVehicle = cfg.RequireVehicle
	return true
end

Taxi.Ops = {
	Board = function(session, t, _payload, api)
		if t.Stage ~= "Pickup" then
			return { ok = false, err = "Your passenger is already on board" }
		end
		local cfg = cfgOf(api)
		local spot = t.Data.Pickup
		if not spot or not api.Near(session.Player, spot, t.Radius + 3) then
			return { ok = false, err = "Get closer to the passenger" }
		end
		local vehicle = api.Vehicle(session.Player)
		if cfg.RequireVehicle and not vehicle then
			return { ok = false, err = "You need to be driving a car" }
		end
		if not api.CheckTravel(session, t.Data.From, t.Data.Since) then
			api.Fail(session, "Ride cancelled.")
			return { ok = false, err = "Ride cancelled" }
		end
		local dropoff = api.Targets.Pick("Taxi", "Dropoff", {
			Center = api.StationPos(session),
			From = spot.Position,
			MinDist = cfg.TripDistance[1],
			MaxDist = cfg.TripDistance[2],
			Exclude = { spot },
		})
		if not dropoff then
			return { ok = false, err = "The passenger can't decide where to go. Try again." }
		end
		if t.Data.Npc then
			api.Npc.Release(t.Data.Npc)
			t.Data.Npc = nil
		end
		local now = api.Now()
		local dist = (dropoff.Position - spot.Position).Magnitude
		t.Data.Dropoff = dropoff
		t.Data.BoardPos = spot.Position
		t.Data.BoardAt = now
		t.Data.TripDist = dist
		t.Data.Limit = 20 + dist * cfg.SecondsPerStud
		t.Data.Health0 = vehicleHealth(vehicle) or 100
		t.Data.CarUid = vehicle and vehicle:GetAttribute("CarUid") or nil
		t.Data.MinHealth = t.Data.Health0
		t.Deadline = now + t.Data.Limit * 2 + 30
		t.Stage = "Dropoff"
		t.Title = "Drive to the destination"
		t.Hint = "Smooth and quick = 5 stars ⭐"
		t.Target = dropoff.Position
		t.TargetLabel = "Destination"
		t.Action = "Drop"
		t.ActionText = "🏁 Drop Off"
		t.Extra = { FareEstimate = math.floor(cfg.BasePay + dist * cfg.FarePerStud), Limit = t.Data.Limit, BoardAt = now }
		api.Push(session)
		return { ok = true }
	end,

	Drop = function(session, t, _payload, api)
		if t.Stage ~= "Dropoff" then
			return { ok = false, err = "Pick up the passenger first" }
		end
		local cfg = cfgOf(api)
		local dropoff = t.Data.Dropoff
		if not dropoff or not api.Near(session.Player, dropoff, t.Radius + 3) then
			return { ok = false, err = "You're not at the destination yet" }
		end
		local vehicle = api.Vehicle(session.Player)
		if cfg.RequireVehicle and not vehicle then
			return { ok = false, err = "Your passenger is still in the car! Drive there." }
		end
		if not api.CheckTravel(session, t.Data.BoardPos, t.Data.BoardAt) then
			api.Fail(session, "Ride rejected.")
			return { ok = false, err = "Ride rejected" }
		end
		local elapsed = api.Now() - t.Data.BoardAt
		local stars = 5
		local health = math.min(vehicleHealth(vehicle) or t.Data.MinHealth, t.Data.MinHealth)
		local lost = math.max(0, t.Data.Health0 - health)
		stars -= math.floor(lost / cfg.CrashHealthPerStar)
		if vehicle and t.Data.CarUid and vehicle:GetAttribute("CarUid") ~= t.Data.CarUid then
			stars -= 2 -- switched cars mid-ride
		end
		if elapsed > t.Data.Limit then
			stars -= 1
		end
		if elapsed > t.Data.Limit * 1.5 then
			stars -= 1
		end
		stars = math.clamp(stars, 1, 5)
		local fare = t.Data.TripDist * cfg.FarePerStud
		local mult = math.max(0.5, 1 + (stars - 3) * cfg.StarPayBonus)
		local text = string.rep("⭐", stars) .. ("  %d-star ride"):format(stars)
		-- passenger steps out and walks off
		local npc = api.Npc.Get(api.Targets.SurfaceCFrame(dropoff), { Label = "Thanks!", Icon = stars >= 4 and "😄" or "😐" })
		task.delay(5, function()
			api.Npc.Release(npc)
		end)
		local paid = api.Complete(session, { Mult = mult, Bonus = fare, Text = text })
		return { ok = true, Paid = paid, Stars = stars, Result = text }
	end,
}

function Taxi.Tick(session, t, _dt, api)
	if t.Stage == "Dropoff" then
		local h = vehicleHealth(api.Vehicle(session.Player))
		if h and h < t.Data.MinHealth then
			t.Data.MinHealth = h
		end
	end
end

return Taxi
