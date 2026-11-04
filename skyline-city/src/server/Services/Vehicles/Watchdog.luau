-- Watchdog: the batched server tick over every active car (Config.Vehicles.Watchdog.Rate Hz, ≤ 5).
--
-- Per car, from SERVER-OBSERVED position / velocity (client telemetry is never trusted here):
--   * anti-exploit: speed above TopSpeed x upgrade cap x tolerance (or teleports) → AntiExploitService:Flag +
--     the car is pulled back to its last legit position with its velocity reset
--   * mileage + fuel use (driving distance + idling), fuel 0 → engine off
--   * crash damage from sudden speed loss → Health attribute (+ saved), smoke, engine dies at 0
--   * driverless cars: settle to ride height and anchor ("sleep") once slow
--   * prompts disabled while moving, test-drive timers, abandoned job vehicles, Wanted expiry
--
--   Watchdog.Start(ctx)        Watchdog.UpdateSmoke(info)        Watchdog.Damage(ctx, info, amount)

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local VehiclesConfig = require(Shared.Config.Vehicles)
local AntiExploitConfig = require(Shared.Config.AntiExploit)
local Units = require(Shared.Vehicle.Units)

local Occupancy = require(script.Parent.Occupancy)

local Watchdog = {}

local W = VehiclesConfig.Watchdog
local F = VehiclesConfig.Fuel
local D = VehiclesConfig.Damage
local P = VehiclesConfig.Physics
local T = VehiclesConfig.TestDrive

local AE_CAP = (AntiExploitConfig.MaxVehicleSpeed or 480) * (AntiExploitConfig.VehicleTolerance or 1.25)

local SMOKE_TEXTURE = "rbxasset://textures/particles/smoke_main.dds"

function Watchdog.UpdateSmoke(info)
	local root: BasePart = info.Root
	local att = root:FindFirstChild("DamageSmoke")
	local health = info.Health or 100
	if health >= D.SmokeBelow then
		if att then
			att:Destroy()
		end
		return
	end
	if not att then
		att = Instance.new("Attachment")
		att.Name = "DamageSmoke"
		local hood = info.Model:FindFirstChild("Hood")
		local worldPos = (hood and hood:IsA("BasePart")) and hood.Position or root.CFrame:PointToWorldSpace(Vector3.new(0, root.Size.Y / 2, -root.Size.Z / 2 + 1.5))
		att.Position = root.CFrame:PointToObjectSpace(worldPos + Vector3.new(0, 0.3, 0))
		att.Parent = root
		local e = Instance.new("ParticleEmitter")
		e.Name = "Smoke"
		e.Texture = SMOKE_TEXTURE
		e.LightEmission = 0
		e.Lifetime = NumberRange.new(1.6, 2.6)
		e.Speed = NumberRange.new(2, 4)
		e.SpreadAngle = Vector2.new(18, 18)
		e.Acceleration = Vector3.new(0, 3, 0)
		e.RotSpeed = NumberRange.new(-40, 40)
		e.Rotation = NumberRange.new(0, 360)
		e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.8), NumberSequenceKeypoint.new(1, 3.2) })
		e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.35), NumberSequenceKeypoint.new(1, 1) })
		e.Parent = att
	end
	local e = att:FindFirstChild("Smoke")
	if e and e:IsA("ParticleEmitter") then
		local heavy = health < D.HeavySmokeBelow
		e.Rate = heavy and 18 or 6
		e.Color = ColorSequence.new(heavy and Color3.fromRGB(40, 40, 42) or Color3.fromRGB(170, 170, 175))
	end
end

function Watchdog.Damage(ctx, info, amount: number)
	if amount <= 0 then
		return
	end
	local model: Model = info.Model
	local before = info.Health or 100
	info.Health = math.max(0, before - amount)
	model:SetAttribute("Health", math.floor(info.Health * 10 + 0.5) / 10)
	info.Dirty = true
	if info.Health <= D.EngineDeadAt and before > D.EngineDeadAt then
		model:SetAttribute("Engine", false)
		model:SetAttribute("EngineDead", true)
		if info.Driver then
			ctx.Notify(info.Driver, "💥 Your engine died! Call a mechanic or visit a repair bay.", "error", 6)
		end
	elseif info.Health < D.SmokeBelow and before >= D.SmokeBelow and info.Driver then
		ctx.Notify(info.Driver, "⚠️ Your car is badly damaged. Get it repaired soon.", "warning", 4)
	end
	Watchdog.UpdateSmoke(info)
end

local function reset(ctx, info, driver: Player)
	local root: BasePart = info.Root
	local model: Model = info.Model
	info.ResetUntil = os.clock() + W.ResetOwnershipDelay
	info.ServerMoveUntil = os.clock() + W.ResetOwnershipDelay + 0.5
	pcall(function()
		root:SetNetworkOwner(nil)
	end)
	root.AssemblyLinearVelocity = Vector3.zero
	root.AssemblyAngularVelocity = Vector3.zero
	if info.LastSafePivot then
		model:PivotTo(info.LastSafePivot)
	end
	info.LastPos = root.Position
	task.delay(W.ResetOwnershipDelay, function()
		if model.Parent and info.Driver == driver and not root.Anchored then
			pcall(function()
				root:SetNetworkOwner(driver)
			end)
		end
	end)
end

local function flag(ctx, player: Player, kind: string, detail: string)
	local anti = ctx.Find("AntiExploitService")
	if anti and type(anti.Flag) == "function" then
		pcall(anti.Flag, anti, player, kind, detail)
	else
		warn(("[Vehicles] %s flagged %s: %s"):format(player.Name, kind, detail))
	end
end

-- Big crash: occupants who aren't buckled up get a friendly reminder — never humanoid damage.
local hintAt: { [Player]: number } = setmetatable({}, { __mode = "k" }) :: any
local function seatbeltHint(ctx, info, now: number)
	for player in pairs(info.Occupants or {}) do
		if player.Parent and player:GetAttribute("Seatbelt") ~= true and now - (hintAt[player] or -math.huge) >= (D.SeatbeltHintCooldown or 45) then
			hintAt[player] = now
			ctx.Notify(player, "💥 Ouch! That was a big bump — buckle up with your seatbelt next time.", "warning", 4)
		end
	end
end

local function tickCar(ctx, info, now: number)
	local model: Model = info.Model
	local root: BasePart = info.Root
	local def = info.Def
	local stats = def.Stats or {}
	local elapsed = math.max(1e-3, now - (info.LastAt or now))
	local pos = root.Position
	local last = info.LastPos or pos
	local dist = (pos - last).Magnitude
	local vel = root.AssemblyLinearVelocity
	local hSpeed = Vector3.new(vel.X, 0, vel.Z).Magnitude
	local driver: Player? = info.Driver
	local electric = def.Electric == true
	local litres = 0

	if info.Sleeping then
		info.LastPos = pos
		info.LastAt = now
		info.LastHSpeed = 0
	else
		local cap = Units.MphToStuds(stats.TopSpeed or 120) * W.UpgradeSpeedCap * W.SpeedTolerance
		local observed = dist / elapsed
		local serverMoved = now < (info.ServerMoveUntil or 0)
		local counted = 0
		if driver and not serverMoved then
			if dist > cap * elapsed + W.TeleportStuds then
				flag(ctx, driver, "VehicleTeleport", ("%s moved %.0f studs in %.2fs"):format(info.ModelId, dist, elapsed))
				reset(ctx, info, driver)
				info.Violations = 0
			elseif observed > cap then
				info.Violations = (info.Violations or 0) + 1
				counted = math.min(dist, cap * elapsed)
				if info.Violations >= W.ViolationsToFlag then
					flag(ctx, driver, "VehicleSpeed", ("%s at %.0f mph (cap %.0f)"):format(info.ModelId, Units.StudsToMph(observed), Units.StudsToMph(cap)))
					reset(ctx, info, driver)
					info.Violations = 0
				end
			else
				info.Violations = 0
				counted = dist
				info.LastSafePivot = model:GetPivot()
				-- legit fast cars: keep the generic movement check from rubber-banding hypercars
				if observed > AE_CAP * 0.75 then
					local anti = ctx.Find("AntiExploitService")
					if anti and anti.Whitelist then
						pcall(anti.Whitelist, anti, driver, 1)
					end
				end
			end
		end

		-- mileage & driving fuel
		counted = math.min(counted, W.MaxCountedSpeed * elapsed)
		if counted > 0.05 then
			info.MileageUnsaved = (info.MileageUnsaved or 0) + counted
			local km = Units.StudsToMeters(counted) / 1000
			litres += km * (stats.FuelEconomy or 8) / 100 * F.UseMultiplier
			info.Dirty = true
		end

		-- crash damage (sudden horizontal speed loss the brakes can't explain)
		if driver and not serverMoved then
			local drop = Units.StudsToMph((info.LastHSpeed or hSpeed) - hSpeed)
			if drop > D.MinImpactMph and now - (info.LastHitAt or 0) > D.HitCooldown then
				info.LastHitAt = now
				local dmg = math.min(D.MaxPerHit, (drop - D.MinImpactMph) * D.DamagePerMph)
				Watchdog.Damage(ctx, info, dmg)
				if drop >= (D.SeatbeltHintImpactMph or 30) then
					seatbeltHint(ctx, info, now)
				end
			end
		end
		info.LastHSpeed = hSpeed

		-- driverless: settle + sleep
		if not driver then
			if vel.Magnitude < P.SettleSpeed then
				info.SlowSince = info.SlowSince or now
				if now - info.SlowSince >= P.ParkSettleSeconds then
					Occupancy.Sleep(info)
				end
			else
				info.SlowSince = nil
				if info.EmptySince and now - info.EmptySince > P.SleepAfterIdle then
					Occupancy.Sleep(info)
				end
			end
		end
		info.LastPos = root.Position
		info.LastAt = now
	end

	-- idling
	if model:GetAttribute("Engine") == true and not electric then
		litres += F.IdleLitresPerHour / 3600 * elapsed * F.UseMultiplier
	end
	if litres > 0 and info.Kind == "Owned" then -- job / test vehicles are fuelled by the city
		local cap = math.max(1, stats.FuelCapacity or 50)
		info.Fuel = math.max(0, (info.Fuel or 1) - litres / cap)
		local shown = math.floor(info.Fuel * 1000 + 0.5) / 1000
		if model:GetAttribute("Fuel") ~= shown then
			model:SetAttribute("Fuel", shown)
		end
		info.Dirty = true
		if info.Fuel <= 0 and model:GetAttribute("Engine") == true then
			model:SetAttribute("Engine", false)
			if driver then
				ctx.Notify(driver, electric and "🔋 Battery flat! Find a charging pump." or "⛽ Out of fuel! Find a fuel pump.", "warning", 5)
			end
		elseif info.Fuel < F.LowFuelWarning and not info.LowFuelWarned and driver then
			info.LowFuelWarned = true
			ctx.Notify(driver, electric and "🔋 Battery low — find a charger soon." or "⛽ Low fuel — find a pump soon.", "warning", 4)
		end
	end

	-- prompts only while (nearly) stopped
	local slow = Units.StudsToMph(vel.Magnitude) < 6
	if info.PromptsEnabled ~= slow then
		info.PromptsEnabled = slow
		for _, p in ipairs(info.Prompts or {}) do
			p.Enabled = slow
		end
	end

	-- persistence (owned cars)
	if info.Kind == "Owned" and info.Dirty and now - (info.LastSave or 0) >= W.SaveEvery then
		ctx.SaveInfo(info)
	end

	-- test drives
	if info.Kind == "Test" then
		local owner = info.Owner
		local remaining = (info.TestEnds or now) - now
		if remaining <= T.WarnBefore and not info.TestWarned then
			info.TestWarned = true
			ctx.Notify(owner, ("⏱️ Test drive ends in %d seconds"):format(math.max(1, math.floor(remaining))), "info", 4)
		end
		if info.Occupants[owner] then
			info.TestAwaySince = nil
		else
			info.TestAwaySince = info.TestAwaySince or now
		end
		if remaining <= 0 then
			ctx.EndTestDrive(info, "time")
			return
		elseif info.TestAwaySince and now - info.TestAwaySince > T.ExitGrace then
			ctx.EndTestDrive(info, "left")
			return
		end
	end

	-- job vehicles left behind after the shift ended
	if info.Kind == "Job" and next(info.Occupants) == nil then
		local jobs = ctx.Find("JobService")
		local onJob = true
		if jobs and type(jobs.GetCurrentJob) == "function" then
			local ok, job = pcall(jobs.GetCurrentJob, jobs, info.Owner)
			onJob = ok and job ~= nil
		end
		if not onJob then
			info.AbandonedSince = info.AbandonedSince or now
			if now - info.AbandonedSince > 30 then
				ctx.Despawn(info, "abandoned")
				return
			end
		elseif info.EmptySince and now - info.EmptySince > VehiclesConfig.JobVehicle.IdleDespawn then
			ctx.Despawn(info, "idle")
			return
		else
			info.AbandonedSince = nil
		end
	end
end

function Watchdog.Start(ctx)
	task.spawn(function()
		local interval = 1 / math.clamp(W.Rate, 1, 5)
		while true do
			task.wait(interval)
			local now = os.clock()
			local list = {}
			for _, info in pairs(ctx.Cars) do
				table.insert(list, info)
			end
			for _, info in ipairs(list) do
				if not info.Model.Parent then
					ctx.Despawn(info, "removed")
				else
					local ok, err = pcall(tickCar, ctx, info, now)
					if not ok then
						warn("[Vehicles] watchdog error:", err)
					end
				end
			end
			-- Wanted expiry
			local t = os.time()
			for player, expiry in pairs(ctx.Wanted) do
				if not player.Parent or t >= expiry then
					ctx.Wanted[player] = nil
					if player.Parent then
						player:SetAttribute("Wanted", false)
					end
				end
			end
		end
	end)
end

return Watchdog
