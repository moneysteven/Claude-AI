-- Cashier: a customer queues at a Register; scan their items, then count the correct change.
-- The server generates items, total and the bill paid; it only accepts the exact change in cents.

local Cashier = { Id = "Cashier" }

local function cfgOf(api)
	return api.JobCfg("Cashier")
end

function Cashier.NewTask(session, t, api)
	local cfg = cfgOf(api)
	local register = api.Targets.Pick("Cashier", "Register", {
		Center = api.StationPos(session),
		From = api.Pos(session.Player),
		Exclusive = true,
		Owner = session.Player,
	})
	if not register then
		return false
	end
	t.Maid:Give(function()
		api.Targets.Release(register)
	end)

	-- customer stands on the far side of the counter
	local look = register.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 0.1 then
		flat = Vector3.new(0, 0, -1)
	end
	flat = flat.Unit
	local spot = api.Targets.GroundAt(register.Position - flat * (math.max(register.Size.X, register.Size.Z) * 0.5 + 3))
	local npc = api.Npc.Get(CFrame.lookAt(spot, Vector3.new(register.Position.X, spot.Y, register.Position.Z)), { Label = "Customer", Icon = "🛒" })
	t.Maid:Give(function()
		api.Npc.Release(npc)
	end)

	-- basket
	local pool = table.clone(cfg.Items)
	for i = #pool, 2, -1 do
		local j = api.Rng:NextInteger(1, i)
		pool[i], pool[j] = pool[j], pool[i]
	end
	local count = api.Rng:NextInteger(cfg.ItemCount[1], cfg.ItemCount[2])
	local items, total = {}, 0
	for i = 1, math.min(count, #pool) do
		local it = pool[i]
		items[i] = { Name = it.Name, Icon = it.Icon, Price = it.Price }
		total += it.Price
	end
	-- the customer pays with the smallest bill that covers it (sometimes the next one up)
	local bills = table.clone(cfg.Bills)
	table.sort(bills)
	local paid = nil
	for i, b in ipairs(bills) do
		if b >= total then
			paid = b
			if api.Rng:NextNumber() < 0.3 and bills[i + 1] then
				paid = bills[i + 1]
			end
			break
		end
	end
	if not paid then
		local big = bills[#bills]
		paid = math.ceil(total / big) * big
		if paid == total then
			paid += big
		end
	end
	t.Data.Items = items
	t.Data.Total = total
	t.Data.Paid = paid
	t.Data.Change = paid - total
	t.Data.Wrong = 0
	t.Data.Register = register
	t.Stage = "Serve"
	t.Title = "🛒 Customer waiting"
	t.Hint = ("%d items to scan."):format(#items)
	t.Target = register.Position
	t.TargetLabel = "Register"
	t.Action = "Serve"
	t.ActionText = "🛒 Serve Customer"
	return true
end

Cashier.Ops = {
	Serve = function(session, t, _payload, api)
		if t.Stage ~= "Serve" then
			return { ok = false, err = "No customer" }
		end
		if not api.Near(session.Player, t.Data.Register, t.Radius + 3) then
			return { ok = false, err = "Go to the register" }
		end
		local cfg = cfgOf(api)
		return {
			ok = true,
			Minigame = api.Minigame(t, "Register", {
				Items = t.Data.Items,
				Total = t.Data.Total,
				Paid = t.Data.Paid,
				AttemptsLeft = cfg.MaxAttempts - t.Data.Wrong,
				Op = "Checkout",
			}),
		}
	end,

	Checkout = function(session, t, payload, api)
		local cfg = cfgOf(api)
		local elapsed = api.MinigameElapsed(t, "Register")
		if t.Stage ~= "Serve" or not elapsed then
			return { ok = false, err = "Serve the customer first" }
		end
		if not api.Near(session.Player, t.Data.Register, t.Radius + 6) then
			return { ok = false, err = "Stay at the register" }
		end
		local change = api.Guard.Int(payload.Change, 0, 10_000_000)
		if not change then
			return { ok = false, err = "Enter the change" }
		end
		if elapsed < cfg.MinSecondsPerItem * #t.Data.Items + 1 then
			return { ok = false, err = "Scan every item first" }
		end
		if change ~= t.Data.Change then
			t.Data.Wrong += 1
			if t.Data.Wrong >= cfg.MaxAttempts then
				api.Fail(session, "😠 The customer left after getting the wrong change.")
				return { ok = false, err = "Wrong change — the customer left" }
			end
			return { ok = false, err = "That's not the right change! Count again.", AttemptsLeft = cfg.MaxAttempts - t.Data.Wrong }
		end
		local mult = math.max(0.3, 1 - cfg.WrongChangePenalty * t.Data.Wrong + 0.05 * #t.Data.Items)
		local paid = api.Complete(session, { Mult = mult, Text = t.Data.Wrong == 0 and "🧾 Exact change!" or "🧾 Sale complete" })
		return { ok = true, Paid = paid }
	end,
}

return Cashier
