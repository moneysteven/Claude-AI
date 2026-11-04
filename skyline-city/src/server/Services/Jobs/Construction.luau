-- Construction: grab materials at the pile -> carry them to the ConstructionSite -> hammer them in.
-- Every hit adds to the SHARED site progress; when a site reaches 100% all contributors get a bonus
-- proportional to their work and the site starts a new build.

local Players = game:GetService("Players")

local Construction = { Id = "Construction" }

-- [sitePart] = { Progress (0..100), Contrib = { [Player] = hits }, Frame = Model, Pile = Model, PilePos = Vector3 }
local sites: { [BasePart]: any } = {}

local function cfgOf(api)
	return api.JobCfg("Construction")
end

local function siteState(site: BasePart, api)
	local s = sites[site]
	if s and s.Frame.Parent then
		return s
	end
	local cfg = cfgOf(api)
	local frame = api.Props.SiteFrame(site)
	local look = site.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 0.1 then
		flat = Vector3.new(0, 0, -1)
	end
	flat = flat.Unit
	local reach = math.max(site.Size.X, site.Size.Z) * 0.5 + cfg.PileOffset * 0.5
	local pilePos = api.Targets.GroundAt(site.Position + flat * reach)
	local pile = api.Props.Pile(CFrame.lookAt(pilePos, Vector3.new(site.Position.X, pilePos.Y, site.Position.Z)))
	s = { Progress = 0, Contrib = {}, Frame = frame, Pile = pile, PilePos = pilePos }
	sites[site] = s
	api.Props.SetSiteProgress(frame, 0, cfg.SiteMaxHeight)
	return s
end

local function siteRadius(site: BasePart, cfg): number
	return math.max(cfg.InteractRadius, math.max(site.Size.X, site.Size.Z) * 0.5 + 8)
end

local function broadcast(site: BasePart, api)
	local s = sites[site]
	if not s then
		return
	end
	for _, sess in pairs(api.Sessions()) do
		if sess.JobId == "Construction" and sess.Task and sess.Task.Data.Site == site then
			sess.Task.Extra = { SiteProgress = s.Progress }
			api.Event(sess, "Progress", { TaskId = sess.Task.Id, Extra = sess.Task.Extra, SiteProgress = s.Progress })
		end
	end
end

local function completeSite(site: BasePart, api)
	local s = sites[site]
	if not s then
		return
	end
	local cfg = cfgOf(api)
	local total = 0
	for _, hits in pairs(s.Contrib) do
		total += hits
	end
	for player, hits in pairs(s.Contrib) do
		local sess = api.GetSession(player)
		if sess and sess.JobId == "Construction" and total > 0 then
			local share = hits / total
			api.Award(sess, cfg.SiteCompleteBonus * share, 0, ("🏗️ Site complete! (%d%% of the work)"):format(math.floor(share * 100 + 0.5)), { CountsAsTask = false })
		end
	end
	s.Progress = 0
	s.Contrib = {}
	api.Props.SetSiteProgress(s.Frame, 0, cfg.SiteMaxHeight)
	broadcast(site, api)
end

function Construction.Init(api)
	Players.PlayerRemoving:Connect(function(p)
		for _, s in pairs(sites) do
			s.Contrib[p] = nil
		end
	end)
end

function Construction.NewTask(session, t, api)
	local cfg = cfgOf(api)
	local list = api.Targets.List("Construction", "ConstructionSite", api.StationPos(session))
	if #list == 0 then
		return false
	end
	-- prefer the site with the most progress so crews finish together
	local best, bestP = nil, -1
	for _, site in ipairs(list) do
		local p = siteState(site, api).Progress + api.Rng:NextNumber(0, 15)
		if p > bestP then
			best, bestP = site, p
		end
	end
	local site = best :: BasePart
	local s = siteState(site, api)
	t.Data.Site = site
	t.Data.Hits = 0
	t.Data.QualitySum = 0
	t.Data.LastHit = 0
	t.Stage = "Fetch"
	t.Title = "🪵 Fetch building materials"
	t.Hint = "Grab a load from the materials pile."
	t.Target = s.PilePos
	t.TargetLabel = "Materials"
	t.Action = "Grab"
	t.ActionText = "🪵 Grab Materials"
	t.Extra = { SiteProgress = s.Progress }
	t.Radius = cfg.InteractRadius
	return true
end

local function hammerGame(t, api)
	local cfg = cfgOf(api)
	return api.Minigame(t, "Hammer", {
		Hits = cfg.HitsPerMaterial,
		Done = t.Data.Hits,
		Interval = cfg.HammerInterval,
		SiteProgress = sites[t.Data.Site] and sites[t.Data.Site].Progress or 0,
		Op = "Hammer",
	})
end

Construction.Ops = {
	Grab = function(session, t, _payload, api)
		if t.Stage ~= "Fetch" then
			return { ok = false, err = "You're already carrying materials" }
		end
		local s = siteState(t.Data.Site, api)
		if not api.Near(session.Player, s.PilePos, t.Radius + 3) then
			return { ok = false, err = "Go to the materials pile" }
		end
		local prop = api.Props.Carry(session.Player.Character, "Plank")
		if prop then
			t.Data.Prop = prop
			t.Maid:Give(prop)
		end
		t.Data.GrabAt = api.Now()
		t.Stage = "Deliver"
		t.Title = "📦 Carry the materials to the site"
		t.Hint = "Bring them to the build frame."
		t.Target = t.Data.Site.Position
		t.TargetLabel = "Build site"
		t.Radius = siteRadius(t.Data.Site, cfgOf(api))
		t.Action = "Place"
		t.ActionText = "📦 Place Materials"
		api.Push(session)
		return { ok = true }
	end,

	Place = function(session, t, _payload, api)
		if t.Stage ~= "Deliver" then
			return { ok = false, err = "Grab materials first" }
		end
		if not api.Near(session.Player, t.Data.Site, t.Radius + 3) then
			return { ok = false, err = "Get to the build site" }
		end
		local s = siteState(t.Data.Site, api)
		if not api.CheckTravel(session, s.PilePos, t.Data.GrabAt) then
			api.Fail(session, "Delivery rejected.")
			return { ok = false, err = "Delivery rejected" }
		end
		if t.Data.Prop then
			t.Data.Prop:Destroy()
			t.Data.Prop = nil
		end
		t.Stage = "Hammer"
		t.Title = "🔨 Hammer it into place"
		t.Hint = "Hit when the marker is in the green!"
		t.Action = "Resume"
		t.ActionText = "🔨 Hammer"
		api.Push(session)
		return { ok = true, Minigame = hammerGame(t, api) }
	end,

	Resume = function(session, t, _payload, api)
		if t.Stage ~= "Hammer" then
			return { ok = false, err = "Bring materials first" }
		end
		return { ok = true, Minigame = hammerGame(t, api) }
	end,

	Hammer = function(session, t, payload, api)
		local cfg = cfgOf(api)
		if t.Stage ~= "Hammer" or not api.MinigameElapsed(t, "Hammer") then
			return { ok = false, err = "Place materials first" }
		end
		if not api.Near(session.Player, t.Data.Site, t.Radius + 6) then
			return { ok = false, err = "Stay at the build site" }
		end
		local now = api.Now()
		if now - t.Data.LastHit < cfg.HammerInterval then
			return { ok = false, err = "Easy! Wait for the swing.", Soft = true }
		end
		local quality = api.Guard.Number(payload.Quality, 0, 1)
		if not quality then
			return { ok = false, err = "Bad request" }
		end
		t.Data.LastHit = now
		t.Data.Hits += 1
		t.Data.QualitySum += quality
		local site = t.Data.Site
		local s = siteState(site, api)
		local add = cfg.ProgressPerHit * (quality >= 0.5 and 1 or 0.5)
		s.Progress = math.min(100, s.Progress + add)
		s.Contrib[session.Player] = (s.Contrib[session.Player] or 0) + 1
		api.Props.SetSiteProgress(s.Frame, s.Progress / 100, cfg.SiteMaxHeight)
		t.Progress = t.Data.Hits / cfg.HitsPerMaterial
		t.ProgressText = ("%d/%d hits"):format(t.Data.Hits, cfg.HitsPerMaterial)
		local siteDone = s.Progress >= 100
		local hits = t.Data.Hits
		if hits >= cfg.HitsPerMaterial then
			api.EndMinigame(t)
			local avg = t.Data.QualitySum / hits
			local paid = api.Complete(session, { Mult = 1 + cfg.QualityBonus * avg, Text = "🔨 Materials installed" })
			if siteDone then
				completeSite(site, api)
			else
				broadcast(site, api)
			end
			return { ok = true, Done = true, Paid = paid, Hits = hits, SiteProgress = s.Progress }
		end
		if siteDone then
			completeSite(site, api)
		else
			broadcast(site, api)
		end
		return { ok = true, Hits = hits, Need = cfg.HitsPerMaterial, SiteProgress = s.Progress }
	end,
}

function Construction.OnRespawn(session, t, api)
	if t.Stage == "Deliver" then
		local prop = api.Props.Carry(session.Player.Character, "Plank")
		if prop then
			t.Data.Prop = prop
			t.Maid:Give(prop)
		end
	end
end

return Construction
