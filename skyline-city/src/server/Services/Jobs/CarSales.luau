-- Car sales: greet an NPC customer at a Showroom spot and pick the right pitch each round.
-- Close the sale (NeedCorrect of Rounds) to earn a commission on the car's price (from Config, never the client).

local CarSales = { Id = "CarSales" }

local FOLLOW_UPS = {
	"Hmm, tell me more about it.",
	"Okay... and why should I pick this one?",
	"What else makes it special?",
	"Convince me. One more reason?",
}

local function cfgOf(api)
	return api.JobCfg("CarSales")
end

local function shuffle(list, rng)
	for i = #list, 2, -1 do
		local j = rng:NextInteger(1, i)
		list[i], list[j] = list[j], list[i]
	end
	return list
end

function CarSales.NewTask(session, t, api)
	local cfg = cfgOf(api)
	local spot = api.Targets.Pick("CarSales", "Showroom", {
		Center = api.StationPos(session),
		From = api.Pos(session.Player),
	})
	if not spot then
		return false
	end
	local prefs = {}
	for k in pairs(cfg.Preferences) do
		table.insert(prefs, k)
	end
	table.sort(prefs)
	local pref = prefs[api.Rng:NextInteger(1, #prefs)]
	local matching = {}
	for _, car in ipairs(cfg.Cars) do
		if car.Tag == pref then
			table.insert(matching, car)
		end
	end
	local car = (#matching > 0) and matching[api.Rng:NextInteger(1, #matching)] or cfg.Cars[1]

	local base = api.Targets.SurfaceCFrame(spot)
	local offset = CFrame.new(api.Rng:NextNumber(-5, 5), 0, api.Rng:NextNumber(-2, 2))
	local npc = api.Npc.Get(base * offset, { Label = "Customer", Icon = "🧐" })
	t.Maid:Give(function()
		api.Npc.Release(npc)
	end)
	t.Data.Spot = spot
	t.Data.Pref = pref
	t.Data.Car = car
	t.Data.Round = 0
	t.Data.Correct = 0
	t.Data.Used = {}
	t.Stage = "Greet"
	t.Title = "🚗 Customer on the lot"
	t.Hint = "Greet them and find out what they want."
	t.Target = spot.Position
	t.TargetLabel = "Customer"
	t.Action = "Greet"
	t.ActionText = "👋 Greet Customer"
	return true
end

local function buildRound(t, api)
	local cfg = cfgOf(api)
	local p = cfg.Preferences[t.Data.Pref]
	t.Data.Round += 1
	local function pick(list)
		local free = {}
		for _, line in ipairs(list) do
			if not t.Data.Used[line] then
				table.insert(free, line)
			end
		end
		if #free == 0 then
			free = list
		end
		local line = free[api.Rng:NextInteger(1, #free)]
		t.Data.Used[line] = true
		return line
	end
	local good = pick(p.Good)
	local bads = table.clone(p.Bad)
	shuffle(bads, api.Rng)
	local options = { good, bads[1], bads[2] or bads[1] }
	shuffle(options, api.Rng)
	t.Data.Answer = table.find(options, good)
	t.Data.Options = options
	local prompt = t.Data.Round == 1 and p.Want or FOLLOW_UPS[api.Rng:NextInteger(1, #FOLLOW_UPS)]
	t.Data.RoundData = {
		Title = ("🚗 Pitch the %s"):format(t.Data.Car.Name),
		Prompt = "🧐 \"" .. prompt .. "\"",
		Question = ("Round %d of %d — what do you say?"):format(t.Data.Round, cfg.Rounds),
		Options = options,
		Op = "Pitch",
		Round = t.Data.Round,
		Rounds = cfg.Rounds,
		Price = t.Data.Car.Price,
	}
	return api.Minigame(t, "Choice", t.Data.RoundData)
end

CarSales.Ops = {
	Greet = function(session, t, _payload, api)
		if t.Stage ~= "Greet" then
			return { ok = false, err = "You're already talking" }
		end
		if not api.Near(session.Player, t.Data.Spot, t.Radius + 6) then
			return { ok = false, err = "Walk over to the customer" }
		end
		t.Stage = "Pitch"
		t.Action = "Resume"
		t.ActionText = "💬 Continue Pitch"
		return { ok = true, Minigame = buildRound(t, api) }
	end,

	Resume = function(session, t, _payload, api)
		if t.Stage ~= "Pitch" or not t.Data.RoundData then
			return { ok = false, err = "Greet the customer first" }
		end
		if not api.Near(session.Player, t.Data.Spot, t.Radius + 10) then
			return { ok = false, err = "Walk back to the customer" }
		end
		return { ok = true, Minigame = api.Minigame(t, "Choice", t.Data.RoundData) }
	end,

	Pitch = function(session, t, payload, api)
		local cfg = cfgOf(api)
		local elapsed = api.MinigameElapsed(t, "Choice")
		if t.Stage ~= "Pitch" or not elapsed then
			return { ok = false, err = "Greet the customer first" }
		end
		local choice = api.Guard.Int(payload.Choice, 1, #t.Data.Options)
		if not choice then
			return { ok = false, err = "Pick a line" }
		end
		if elapsed < cfg.MinSecondsPerRound then
			return { ok = false, err = "Let the customer finish talking!" }
		end
		local right = choice == t.Data.Answer
		if right then
			t.Data.Correct += 1
		end
		local feedback = right and "😊 The customer nods." or "😕 The customer frowns."
		if t.Data.Round >= cfg.Rounds then
			api.EndMinigame(t)
			if t.Data.Correct >= cfg.NeedCorrect then
				local commission = math.min(cfg.MaxCommission, math.floor(t.Data.Car.Price * cfg.Commission))
				local mult = 1 + 0.1 * (t.Data.Correct - cfg.NeedCorrect)
				local paid = api.Complete(session, { Mult = mult, Bonus = commission, Text = ("🤝 Sold the %s!"):format(t.Data.Car.Name) })
				return { ok = true, Paid = paid, Result = feedback .. " SOLD!" }
			end
			api.Fail(session, "🚶 The customer walked away without buying.")
			return { ok = true, Result = feedback .. " No sale this time." }
		end
		return { ok = true, Result = feedback, Minigame = buildRound(t, api) }
	end,
}

return CarSales
