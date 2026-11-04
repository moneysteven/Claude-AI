-- Pizza delivery: pick up at the shop -> GPS to a Delivery target -> deliver. Faster = bigger tip.

local Pizza = { Id = "Pizza" }

local function cfgOf(api)
	return api.JobCfg("Pizza")
end

function Pizza.NewTask(session, t, api)
	local station = api.Station(session)
	if not station then
		return false
	end
	t.Stage = "Pickup"
	t.Title = "Pick up a hot pizza"
	t.Hint = "Grab the order at the counter."
	t.Target = station.Position
	t.TargetLabel = "Slice Palace"
	t.Radius = api.Config.General.StationUseDistance + 4
	t.Action = "Pickup"
	t.ActionText = "🍕 Grab Pizza"
	return true
end

local function carry(session, t, api)
	local prop = api.Props.Carry(session.Player.Character, "PizzaBox")
	if prop then
		t.Maid:Give(prop)
	end
end

Pizza.Ops = {
	Pickup = function(session, t, _payload, api)
		if t.Stage ~= "Pickup" then
			return { ok = false, err = "You already have the pizza" }
		end
		local station = api.Station(session)
		if not station or not api.Near(session.Player, station, t.Radius + 2) then
			return { ok = false, err = "Go back to the pizza counter" }
		end
		local cfg = cfgOf(api)
		local from = station.Position
		local house = api.Targets.Pick("Pizza", "Delivery", {
			Center = from,
			From = from,
			MinDist = cfg.DeliveryDistance[1],
			MaxDist = cfg.DeliveryDistance[2],
		})
		if not house then
			return { ok = false, err = "No delivery addresses right now" }
		end
		local dist = (house.Position - from).Magnitude
		local limit = 25 + dist * cfg.SecondsPerStud
		local now = api.Now()
		t.Data.House = house
		t.Data.From = from
		t.Data.PickupAt = now
		t.Data.Limit = limit
		t.Data.HotUntil = now + limit
		t.Deadline = now + limit * 2 + 20
		t.Stage = "Deliver"
		t.Title = "Deliver the pizza"
		t.Hint = "Deliver while it's hot for a tip! 🔥"
		t.Target = house.Position
		t.TargetLabel = "Customer"
		t.Radius = cfg.InteractRadius
		t.Action = "Deliver"
		t.ActionText = "🚪 Deliver"
		t.Extra = { HotUntil = t.Data.HotUntil, Distance = math.floor(dist) }
		carry(session, t, api)
		api.Push(session)
		return { ok = true }
	end,

	Deliver = function(session, t, _payload, api)
		if t.Stage ~= "Deliver" then
			return { ok = false, err = "Pick up the pizza first" }
		end
		local house = t.Data.House
		if not house or not api.Near(session.Player, house, t.Radius + 2) then
			return { ok = false, err = "You're not at the customer's door" }
		end
		if not api.CheckTravel(session, t.Data.From, t.Data.PickupAt) then
			api.Fail(session, "Delivery rejected.")
			return { ok = false, err = "Delivery rejected" }
		end
		local cfg = cfgOf(api)
		local now = api.Now()
		local mult, text
		if now <= t.Data.HotUntil then
			local frac = math.clamp((t.Data.HotUntil - now) / t.Data.Limit, 0, 1)
			mult = 1 + cfg.TipMax * frac
			text = ("🔥 Hot delivery! Tip +%d%%"):format(math.floor(cfg.TipMax * frac * 100 + 0.5))
		else
			mult = cfg.LatePayMultiplier
			text = "🥶 Cold pizza, no tip"
		end
		local paid = api.Complete(session, { Mult = mult, Text = text })
		return { ok = true, Paid = paid, Result = text }
	end,
}

function Pizza.OnRespawn(session, t, api)
	if t.Stage == "Deliver" then
		carry(session, t, api)
	end
end

return Pizza
