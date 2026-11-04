-- Real estate: meet a client at the office, choose a listing that matches the tier they want,
-- drive there and show the home. Commission comes from the tier price in Config.

local RealEstate = { Id = "RealEstate" }

local assignedTier: { [BasePart]: string } = {}
local nextTier = 0

local function cfgOf(api)
	return api.JobCfg("RealEstate")
end

local function tierDef(cfg, id: string)
	for _, t in ipairs(cfg.Tiers) do
		if t.Id == id then
			return t
		end
	end
	return nil
end

local function tierOf(cfg, part: BasePart)
	local attr = part:GetAttribute("Tier")
	if type(attr) == "string" and tierDef(cfg, attr) then
		return tierDef(cfg, attr)
	end
	local id = assignedTier[part]
	if not id then
		nextTier = nextTier % #cfg.Tiers + 1
		id = cfg.Tiers[nextTier].Id
		assignedTier[part] = id
	end
	return tierDef(cfg, id)
end

function RealEstate.NewTask(session, t, api)
	local station = api.Station(session)
	if not station then
		return false
	end
	local npc = api.Npc.Get(api.Targets.SurfaceCFrame(station) * CFrame.new(3, 0, 0), { Label = "Client", Icon = "🧳" })
	t.Data.Npc = npc
	t.Maid:Give(function()
		if t.Data.Npc then
			api.Npc.Release(t.Data.Npc)
			t.Data.Npc = nil
		end
	end)
	t.Data.Wrong = 0
	t.Stage = "Meet"
	t.Title = "🏡 New client at the office"
	t.Hint = "Meet your client to hear what they're looking for."
	t.Target = station.Position
	t.TargetLabel = "Office"
	t.Radius = api.Config.General.StationUseDistance + 6
	t.Action = "Meet"
	t.ActionText = "🤝 Meet Client"
	return true
end

local function listingsMinigame(t, api)
	local cfg = cfgOf(api)
	local list = {}
	local from = t.Data.Office
	for i, part in ipairs(t.Data.Listings) do
		local def = tierOf(cfg, part)
		list[i] = {
			Index = i,
			Tier = def.Name,
			Icon = def.Icon,
			Price = def.Price,
			Distance = math.floor((part.Position - from).Magnitude),
		}
	end
	local want = t.Data.Wish
	return api.Minigame(t, "Listings", {
		Title = "📋 Pick a listing",
		Prompt = "🧳 \"" .. want.Want .. "\"",
		Wish = want.Name,
		Listings = list,
		Op = "Select",
	})
end

RealEstate.Ops = {
	Meet = function(session, t, _payload, api)
		if t.Stage ~= "Meet" then
			return { ok = false, err = "You already met the client" }
		end
		local station = api.Station(session)
		if not station or not api.Near(session.Player, station, t.Radius + 2) then
			return { ok = false, err = "Go to the office" }
		end
		local cfg = cfgOf(api)
		local all = api.Targets.List("RealEstate", "Showing", station.Position)
		if #all == 0 then
			return { ok = false, err = "No listings on the market right now" }
		end
		local pool = table.clone(all)
		for i = #pool, 2, -1 do
			local j = api.Rng:NextInteger(1, i)
			pool[i], pool[j] = pool[j], pool[i]
		end
		local listings = {}
		for i = 1, math.min(cfg.ListingsShown, #pool) do
			listings[i] = pool[i]
		end
		-- the client wants the tier of one of the shown listings (so a match always exists)
		local target = listings[api.Rng:NextInteger(1, #listings)]
		t.Data.Wish = tierOf(cfg, target)
		t.Data.Listings = listings
		t.Data.Office = station.Position
		if t.Data.Npc then
			api.Npc.Release(t.Data.Npc)
			t.Data.Npc = nil
		end
		t.Stage = "Choose"
		t.Title = ("Client wants: %s %s"):format(t.Data.Wish.Icon, t.Data.Wish.Name)
		t.Hint = "Pick a matching listing."
		t.Target = nil
		t.Action = "Choose"
		t.ActionText = "📋 Listings"
		t.Extra = { Wish = t.Data.Wish.Name }
		return { ok = true, Minigame = listingsMinigame(t, api) }
	end,

	Choose = function(session, t, _payload, api)
		if t.Stage ~= "Choose" and t.Stage ~= "Drive" then
			return { ok = false, err = "Meet the client first" }
		end
		return { ok = true, Minigame = listingsMinigame(t, api) }
	end,

	Select = function(session, t, payload, api)
		if t.Stage ~= "Choose" and t.Stage ~= "Drive" then
			return { ok = false, err = "Meet the client first" }
		end
		local idx = api.Guard.Int(payload.Index, 1, #t.Data.Listings)
		if not idx then
			return { ok = false, err = "Pick a listing" }
		end
		api.EndMinigame(t)
		local cfg = cfgOf(api)
		local part = t.Data.Listings[idx]
		local def = tierOf(cfg, part)
		t.Data.Selected = part
		t.Data.From = api.Pos(session.Player)
		t.Data.Since = api.Now()
		t.Stage = "Drive"
		t.Title = ("Show the %s %s"):format(def.Icon, def.Name)
		t.Hint = ("Client wants: %s %s"):format(t.Data.Wish.Icon, t.Data.Wish.Name)
		t.Target = part.Position
		t.TargetLabel = def.Name .. " listing"
		t.Action = "Show"
		t.ActionText = "🏡 Show Home"
		api.Push(session)
		return { ok = true }
	end,

	Show = function(session, t, _payload, api)
		if t.Stage ~= "Drive" or not t.Data.Selected then
			return { ok = false, err = "Pick a listing first" }
		end
		local part = t.Data.Selected
		if not api.Near(session.Player, part, t.Radius + 4) then
			return { ok = false, err = "You're not at the listing yet" }
		end
		if not api.CheckTravel(session, t.Data.From, t.Data.Since) then
			api.Fail(session, "Showing cancelled.")
			return { ok = false, err = "Showing cancelled" }
		end
		local cfg = cfgOf(api)
		local def = tierOf(cfg, part)
		local npc = api.Npc.Get(api.Targets.SurfaceCFrame(part), { Label = def.Id == t.Data.Wish.Id and "I love it!" or "Hmm...", Icon = def.Id == t.Data.Wish.Id and "😍" or "🤨" })
		task.delay(5, function()
			api.Npc.Release(npc)
		end)
		if def.Id == t.Data.Wish.Id then
			local commission = math.min(cfg.MaxCommission, math.floor(def.Price * cfg.Commission))
			local mult = math.max(0.3, 1 - cfg.WrongShowingPenalty * t.Data.Wrong)
			local paid = api.Complete(session, { Mult = mult, Bonus = commission, Text = ("🏡 Sold a %s!"):format(def.Name) })
			return { ok = true, Paid = paid }
		end
		t.Data.Wrong += 1
		if t.Data.Wrong > cfg.MaxWrongShowings then
			api.Fail(session, "🧳 The client gave up and hired another agent.")
			return { ok = false, err = "The client left" }
		end
		t.Stage = "Choose"
		t.Target = nil
		t.Action = "Choose"
		t.ActionText = "📋 Listings"
		t.Title = ("Client wants: %s %s"):format(t.Data.Wish.Icon, t.Data.Wish.Name)
		t.Hint = "That wasn't what they asked for. Pick another listing."
		t.Data.Selected = nil
		api.Push(session)
		return { ok = false, err = "🤨 \"This isn't what I asked for...\"", Minigame = listingsMinigame(t, api) }
	end,
}

return RealEstate
