-- Mechanic: NPC cars at RepairSpots with random faults (part-matching minigame), plus real repairs of
-- other players' damaged cars inside a MechanicBay: the owner gets a "RepairOffer" panel and must accept;
-- the owner is charged a fair fee (EconomyService:Charge) and the mechanic is paid from the job.

local Players = game:GetService("Players")

local Mechanic = { Id = "Mechanic" }

local offers: { [number]: any } = {}
local offerByOwner: { [Player]: number } = {}
local pairCooldown: { [string]: number } = {}
local nextOfferId = 0

local function cfgOf(api)
	return api.JobCfg("Mechanic")
end

local function shuffle(list, rng)
	for i = #list, 2, -1 do
		local j = rng:NextInteger(1, i)
		list[i], list[j] = list[j], list[i]
	end
	return list
end

local function faultById(cfg, id: string)
	for _, f in ipairs(cfg.Faults) do
		if f.Id == id then
			return f
		end
	end
	return nil
end

---------------------------------------------------------------------------
-- NPC repairs
---------------------------------------------------------------------------
function Mechanic.NewTask(session, t, api)
	local cfg = cfgOf(api)
	local center = api.StationPos(session)
	local spot = api.Targets.Pick("Mechanic", "RepairSpot", {
		Center = center,
		Exclusive = true,
		Owner = session.Player,
	})
	if not spot then
		return false
	end
	t.Maid:Give(function()
		api.Targets.Release(spot)
	end)
	local ground = api.Targets.GroundAt(spot.Position)
	local look = spot.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 0.1 then
		flat = Vector3.new(0, 0, -1)
	end
	local carCf = CFrame.lookAt(ground, ground + flat.Unit)
	t.Maid:Give(api.Props.NpcCar(carCf, nil, { HoodOpen = true, Smoke = true }))
	local npc = api.Npc.Get(carCf * CFrame.new(5, 0, -2) * CFrame.Angles(0, math.rad(90), 0), { Label = "Customer", Icon = "🧑" })
	t.Maid:Give(function()
		api.Npc.Release(npc)
	end)

	local pool = table.clone(cfg.Faults)
	shuffle(pool, api.Rng)
	local n = api.Rng:NextInteger(cfg.FaultCount[1], cfg.FaultCount[2])
	local faults = {}
	for i = 1, math.min(n, #pool) do
		faults[pool[i].Id] = true
	end
	t.Data.Faults = faults
	t.Data.FaultCount = math.min(n, #pool)
	t.Data.Spot = spot
	t.Data.Wrong = 0
	t.Data.From = api.Pos(session.Player)
	t.Data.Since = api.Now()
	t.Stage = "Repair"
	t.Title = "🔧 Customer car needs repairs"
	t.Hint = "Inspect the car and replace the faulty parts."
	t.Target = spot.Position
	t.TargetLabel = "Broken car"
	t.Action = "Inspect"
	t.ActionText = "🔧 Inspect Car"
	return true
end

Mechanic.Ops = {
	Inspect = function(session, t, _payload, api)
		if t.Stage ~= "Repair" then
			return { ok = false, err = "Nothing to inspect" }
		end
		if not api.Near(session.Player, t.Data.Spot, t.Radius + 6) then
			return { ok = false, err = "Get to the car" }
		end
		if not api.CheckTravel(session, t.Data.From, t.Data.Since) then
			api.Fail(session, "Job rejected.")
			return { ok = false, err = "Job rejected" }
		end
		local cfg = cfgOf(api)
		local symptoms, offered = {}, {}
		for id in pairs(t.Data.Faults) do
			local f = faultById(cfg, id)
			if f then
				table.insert(symptoms, f.Symptom)
				table.insert(offered, f)
			end
		end
		local others = {}
		for _, f in ipairs(cfg.Faults) do
			if not t.Data.Faults[f.Id] then
				table.insert(others, f)
			end
		end
		shuffle(others, api.Rng)
		for i = 1, math.max(0, cfg.PartChoices - #offered) do
			if others[i] then
				table.insert(offered, others[i])
			end
		end
		shuffle(offered, api.Rng)
		shuffle(symptoms, api.Rng)
		local parts, set = {}, {}
		for i, f in ipairs(offered) do
			parts[i] = { Id = f.Id, Name = f.Name, Icon = f.Icon }
			set[f.Id] = true
		end
		t.Data.Offered = set
		return {
			ok = true,
			Minigame = api.Minigame(t, "Parts", { Symptoms = symptoms, Parts = parts, Need = t.Data.FaultCount, Op = "Repair" }),
		}
	end,

	Repair = function(session, t, payload, api)
		local cfg = cfgOf(api)
		local elapsed = api.MinigameElapsed(t, "Parts")
		if t.Stage ~= "Repair" or not elapsed then
			return { ok = false, err = "Inspect the car first" }
		end
		local list = payload.Parts
		if type(list) ~= "table" or #list == 0 or #list > cfg.PartChoices then
			return { ok = false, err = "Pick the parts to replace" }
		end
		if elapsed < cfg.MinigameMinSeconds then
			return { ok = false, err = "Take a closer look first" }
		end
		local seen, correct, wrong = {}, 0, 0
		for _, raw in ipairs(list) do
			local id = api.Guard.Id(raw, 24)
			if not id or not t.Data.Offered[id] or seen[id] then
				return { ok = false, err = "Bad parts list" }
			end
			seen[id] = true
			if t.Data.Faults[id] then
				correct += 1
			else
				wrong += 1
			end
		end
		t.Data.Wrong += wrong
		if correct < t.Data.FaultCount then
			return { ok = false, err = ("The car still has %d problem(s). Check the symptoms again!"):format(t.Data.FaultCount - correct), Wrong = wrong }
		end
		api.EndMinigame(t)
		local mult = math.max(0.3, 1 - cfg.WrongPartPenalty * t.Data.Wrong)
		local text = t.Data.Wrong == 0 and "🔧 Perfect diagnosis!" or ("🔧 Fixed (%d wrong part%s)"):format(t.Data.Wrong, t.Data.Wrong == 1 and "" or "s")
		local paid = api.Complete(session, { Mult = mult + (t.Data.FaultCount - 2) * 0.15, Text = text })
		return { ok = true, Paid = paid }
	end,
}

---------------------------------------------------------------------------
-- Player car repairs
---------------------------------------------------------------------------
local function fee(cfg, health: number): number
	return math.max(cfg.MinRepairFee, math.ceil((100 - health) * cfg.RepairFeePerHealth))
end

local function clearOffer(id: number)
	local o = offers[id]
	if not o then
		return nil
	end
	offers[id] = nil
	if offerByOwner[o.Owner] == id then
		offerByOwner[o.Owner] = nil
	end
	return o
end

local function activeCar(api, owner: Player): Model?
	local vs = api.Service("VehicleService")
	if not (vs and vs.GetActiveVehicle) then
		return nil
	end
	local ok, model = pcall(vs.GetActiveVehicle, vs, owner)
	if ok and typeof(model) == "Instance" and model:IsA("Model") and model.Parent then
		return model
	end
	return nil
end

function Mechanic.Init(api)
	Players.PlayerRemoving:Connect(function(p)
		for id, o in pairs(offers) do
			if o.Owner == p or o.Mechanic == p then
				clearOffer(id)
			end
		end
	end)
end

function Mechanic.GlobalTick(_dt, api)
	local now = api.Now()
	for id, o in pairs(offers) do
		if now > o.Expires then
			clearOffer(id)
			pairCooldown[o.Mechanic.UserId .. ":" .. o.Owner.UserId] = now + cfgOf(api).DeclineCooldown
			if o.Owner.Parent then
				api.CloseUI(o.Owner, "RepairOffer")
			end
			if o.Mechanic.Parent then
				api.Notify(o.Mechanic, "The repair offer expired.", "warning")
			end
		end
	end
	for k, untilT in pairs(pairCooldown) do
		if now >= untilT then
			pairCooldown[k] = nil
		end
	end
end

function Mechanic.OnClockOut(session, api)
	for id, o in pairs(offers) do
		if o.Mechanic == session.Player then
			clearOffer(id)
			if o.Owner.Parent then
				api.CloseUI(o.Owner, "RepairOffer")
			end
		end
	end
end

Mechanic.FreeOps = {
	OfferRepair = function(session, payload, api)
		local cfg = cfgOf(api)
		local mech = session.Player
		local userId = api.Guard.Int(payload.OwnerUserId, 1, 2 ^ 53)
		local owner = userId and Players:GetPlayerByUserId(userId)
		if not owner then
			return { ok = false, err = "Owner not found" }
		end
		if owner == mech then
			return { ok = false, err = "You can't charge yourself — use a Mechanic shop for your own car" }
		end
		if not api.Guard.NearTagged(mech, "MechanicBay", cfg.BayDistance) then
			return { ok = false, err = "Bring the car into a Mechanic Bay" }
		end
		local car = activeCar(api, owner)
		if not car then
			return { ok = false, err = "That player has no car out" }
		end
		if car:GetAttribute("IsJobVehicle") or car:GetAttribute("IsTestDrive") then
			return { ok = false, err = "Job and test-drive cars are repaired by the city" }
		end
		if not api.Near(mech, car, cfg.CarDistance) then
			return { ok = false, err = "Get closer to the car" }
		end
		local uid = car:GetAttribute("CarUid")
		local health = car:GetAttribute("Health")
		if type(uid) ~= "string" or type(health) ~= "number" then
			return { ok = false, err = "Can't diagnose this car" }
		end
		if health >= 99.5 then
			return { ok = false, err = "That car doesn't need repairs" }
		end
		local key = mech.UserId .. ":" .. owner.UserId
		if pairCooldown[key] then
			return { ok = false, err = "You can't send this player another offer yet" }
		end
		if offerByOwner[owner] then
			return { ok = false, err = "They already have a repair offer pending" }
		end
		local price = fee(cfg, health)
		nextOfferId += 1
		local id = nextOfferId
		offers[id] = {
			Id = id,
			Owner = owner,
			Mechanic = mech,
			Uid = uid,
			Fee = price,
			Health = health,
			Expires = api.Now() + cfg.OfferExpireSeconds,
		}
		offerByOwner[owner] = id
		api.OpenUI(owner, "RepairOffer", {
			OfferId = id,
			MechanicName = mech.DisplayName,
			Car = car:GetAttribute("ModelId") or car.Name,
			Health = math.floor(health),
			Fee = price,
			Expires = offers[id].Expires,
		})
		return { ok = true, Result = ("Offer sent to %s (%s)"):format(owner.DisplayName, "$" .. tostring(price)) }
	end,
}

function Mechanic.AcceptRepair(player: Player, payload, api)
	local cfg = cfgOf(api)
	local id = api.Guard.Int(payload.OfferId, 1, 1e9)
	local o = id and offers[id]
	if not o or o.Owner ~= player then
		return { ok = false, err = "That offer is no longer available" }
	end
	if api.Now() > o.Expires then
		clearOffer(id)
		return { ok = false, err = "The offer expired" }
	end
	local mechSession = api.GetSession(o.Mechanic)
	if not mechSession or mechSession.JobId ~= "Mechanic" then
		clearOffer(id)
		return { ok = false, err = "The mechanic went off duty" }
	end
	local car = activeCar(api, player)
	if not car or car:GetAttribute("CarUid") ~= o.Uid then
		clearOffer(id)
		return { ok = false, err = "Your car isn't here anymore" }
	end
	if not api.Near(o.Mechanic, car, cfg.CarDistance + 10) then
		clearOffer(id)
		return { ok = false, err = "The mechanic is too far from your car" }
	end
	local health = car:GetAttribute("Health")
	if type(health) ~= "number" or health >= 99.5 then
		clearOffer(id)
		return { ok = false, err = "Your car doesn't need repairs" }
	end
	local price = math.min(o.Fee, fee(cfg, health))
	local economy = api.Service("EconomyService")
	local vs = api.Service("VehicleService")
	if not (economy and vs and vs.Repair) then
		return { ok = false, err = "Repairs are unavailable right now" }
	end
	clearOffer(id)
	if not economy:Charge(player, price, "Repair:Mechanic") then
		api.Notify(o.Mechanic, ("%s couldn't afford the repair."):format(player.DisplayName), "warning")
		return { ok = false, err = "You can't afford this repair" }
	end
	local ok, result = pcall(vs.Repair, vs, player, o.Uid)
	if not ok or result == false then
		if not ok then
			warn("[Mechanic] Repair failed:", result)
		end
		economy:AddCash(player, price, "Refund:Repair")
		return { ok = false, err = "Repair failed — you were refunded" }
	end
	pairCooldown[o.Mechanic.UserId .. ":" .. player.UserId] = api.Now() + cfg.PairCooldown
	-- Raw commission (no pay multipliers) so the mechanic always earns less than the owner paid.
	api.Award(mechSession, 1, math.floor(price * cfg.PlayerRepairPayShare), ("🔧 Repaired %s's car"):format(player.DisplayName), { NoBase = true, Raw = true, XPScale = 1.5 })
	api.Notify(player, ("🔧 %s repaired your car!"):format(o.Mechanic.DisplayName), "success")
	return { ok = true }
end

function Mechanic.DeclineRepair(player: Player, payload, api)
	local id = api.Guard.Int(payload.OfferId, 1, 1e9)
	local o = id and offers[id]
	if not o or o.Owner ~= player then
		return { ok = true }
	end
	clearOffer(id)
	pairCooldown[o.Mechanic.UserId .. ":" .. player.UserId] = api.Now() + cfgOf(api).DeclineCooldown
	if o.Mechanic.Parent then
		api.Notify(o.Mechanic, ("%s declined the repair."):format(player.DisplayName), "warning")
	end
	return { ok = true }
end

return Mechanic
