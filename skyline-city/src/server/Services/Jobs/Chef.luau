-- Chef: cook an order at a Stove. The client plays a step-sequence + timing-bar minigame;
-- the server checks the step order and the minimum time, and timing quality only scales a capped bonus.

local Chef = { Id = "Chef" }

local function cfgOf(api)
	return api.JobCfg("Chef")
end

function Chef.NewTask(session, t, api)
	local cfg = cfgOf(api)
	local stove = api.Targets.Pick("Chef", "Stove", {
		Center = api.StationPos(session),
		From = api.Pos(session.Player),
		Exclusive = true,
		Owner = session.Player,
	})
	if not stove then
		return false
	end
	t.Maid:Give(function()
		api.Targets.Release(stove)
	end)
	local recipe = cfg.Recipes[api.Rng:NextInteger(1, #cfg.Recipes)]
	t.Data.Recipe = recipe
	t.Data.Stove = stove
	t.Data.Mistakes = 0
	t.Stage = "Cook"
	t.Title = ("%s Order: %s"):format(recipe.Icon, recipe.Name)
	t.Hint = "Head to a stove and start cooking."
	t.Target = stove.Position
	t.TargetLabel = "Stove"
	t.Action = "Cook"
	t.ActionText = "🍳 Start Cooking"
	return true
end

Chef.Ops = {
	Cook = function(session, t, _payload, api)
		if t.Stage ~= "Cook" then
			return { ok = false, err = "Nothing to cook" }
		end
		if not api.Near(session.Player, t.Data.Stove, t.Radius + 3) then
			return { ok = false, err = "Go to the stove" }
		end
		local cfg = cfgOf(api)
		local options = {}
		for id, def in pairs(cfg.Steps) do
			table.insert(options, { Id = id, Name = def.Name, Icon = def.Icon })
		end
		table.sort(options, function(a, b)
			return a.Name < b.Name
		end)
		return {
			ok = true,
			Minigame = api.Minigame(t, "Recipe", {
				Dish = t.Data.Recipe.Name,
				Icon = t.Data.Recipe.Icon,
				Steps = t.Data.Recipe.Steps,
				Options = options,
				Op = "Serve",
			}),
		}
	end,

	Serve = function(session, t, payload, api)
		local cfg = cfgOf(api)
		local elapsed = api.MinigameElapsed(t, "Recipe")
		if t.Stage ~= "Cook" or not elapsed then
			return { ok = false, err = "Start cooking first" }
		end
		if not api.Near(session.Player, t.Data.Stove, t.Radius + 6) then
			return { ok = false, err = "Stay at the stove" }
		end
		local steps = payload.Steps
		local recipe = t.Data.Recipe.Steps
		if type(steps) ~= "table" or #steps ~= #recipe then
			t.Data.Mistakes += 1
			return { ok = false, err = "That's not the recipe!" }
		end
		for i, id in ipairs(recipe) do
			if steps[i] ~= id then
				t.Data.Mistakes += 1
				return { ok = false, err = "Wrong order — check the recipe card!" }
			end
		end
		if elapsed < cfg.MinSecondsPerStep * #recipe then
			return { ok = false, err = "Slow down, chef! Cook it properly." }
		end
		local quality = api.Guard.Number(payload.Quality, 0, 1) or 0.5
		local reported = api.Guard.Int(payload.Mistakes, 0, 50) or 0
		local mistakes = t.Data.Mistakes + reported
		api.EndMinigame(t)
		local mult = math.max(0.3, 1 + cfg.QualityBonus * quality - cfg.WrongStepPenalty * mistakes)
		local stars = quality >= 0.85 and "⭐⭐⭐" or (quality >= 0.55 and "⭐⭐" or "⭐")
		local paid = api.Complete(session, { Mult = mult, Text = ("%s %s served %s"):format(t.Data.Recipe.Icon, t.Data.Recipe.Name, stars) })
		return { ok = true, Paid = paid }
	end,
}

return Chef
