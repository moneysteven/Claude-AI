-- Chassis: the client-side raycast vehicle. The driver's client is the network owner of the car, so
-- impulses applied here move the car for everyone (the server watches speed/position for anti-exploit).
--
--   local chassis = Chassis.new(model, def, mults, character)   -- def = VehicleStats.Resolve(modelId)
--   chassis:Step(dt, controls)   -- RunService.Heartbeat (physics); controls =
--       { Throttle 0..1, Brake 0..1, Steer -1..1, SteerAnalog bool, Handbrake bool, Manual bool,
--         EngineOn bool, PowerScale 0..1 }
--   chassis:UpdateVisuals(dt)    -- RenderStepped: wheel spin / steer / suspension via WheelMotor.C0
--   chassis:SetMultipliers(mults)
--   chassis:GetBasis() -> CFrame (LookVector = car forward)
--   chassis:Destroy()            -- restores the wheel joints
--
-- Readable state: Speed, ForwardSpeed (studs/s), Rpm, Gear, Throttle, BrakeLight, Reverse, Skid (0..1),
-- Grounded (count), Impact / ImpactHorizontal (mph of unexplained velocity change this step), Flipped.
--
-- Forces are accumulated and applied ONCE per step (ApplyImpulse + ApplyAngularImpulse) — no BodyMovers.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Units = require(Shared.Vehicle.Units)
local VehicleStats = require(Shared.Vehicle.VehicleStats)
local Driving = require(Shared.Config.Driving)

local Suspension = require(script.Parent.Suspension)
local Tires = require(script.Parent.Tires)
local Powertrain = require(script.Parent.Powertrain)

local P = Driving.Physics
local S = Driving.Steering

local Chassis = {}
Chassis.__index = Chassis

local TAU = math.pi * 2

local function sign(x: number): number
	if x > 0 then
		return 1
	elseif x < 0 then
		return -1
	end
	return 0
end

local function approach(current: number, target: number, step: number): number
	if current < target then
		return math.min(target, current + step)
	end
	return math.max(target, current - step)
end

local function flat(v: Vector3): Vector3
	return Vector3.new(v.X, 0, v.Z)
end

function Chassis.new(model: Model, def: { [string]: any }, mults: { [string]: number }, character: Model?)
	local root = model.PrimaryPart or model:FindFirstChild("Chassis")
	assert(root and root:IsA("BasePart"), "car has no Chassis / PrimaryPart")

	local self = setmetatable({}, Chassis)
	self.Model = model
	self.Root = root :: BasePart
	self.Def = def
	self.Stats = def.Stats
	self.Mults = mults

	local stiff = VehicleStats.Relative(def.Stats.SuspensionStiffness, 0.4, 2.5) * (mults.Stiffness or 1)
	self.DampMult = VehicleStats.Relative(def.Stats.SuspensionDamping, 0.4, 2.5)
	self.Geo = Suspension.Build(model, self.Root, def.Stats, stiff)

	local radius = def.Stats.WheelRadius
	if not radius then
		local sum, n = 0, 0
		for _, w in ipairs(self.Geo.Wheels) do
			sum += w.Radius
			n += 1
		end
		radius = n > 0 and sum / n or 1.2
	end
	self.WheelRadius = radius
	self.Powertrain = Powertrain.new(def.Stats, mults, def.Electric, radius)

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.RespectCanCollide = true
	params.IgnoreWater = false
	-- rays respect the car's collision group (e.g. cars pass through characters inside safe zones)
	pcall(function()
		params.CollisionGroup = (root :: BasePart).CollisionGroup
	end)
	self.RayParams = params
	self.Character = character
	self:_RefreshFilter()

	-- axle counts for torque / brake split
	local nF, nR = 0, 0
	for _, w in ipairs(self.Geo.Wheels) do
		if w.Axle == "F" then
			nF += 1
		else
			nR += 1
		end
	end
	self.AxleCount = { F = math.max(1, nF), R = math.max(1, nR) }
	local drivetrain = def.Stats.Drivetrain
	self.FrontShare = (drivetrain == "FWD" and 1) or (drivetrain == "RWD" and 0) or P.AwdFrontShare

	self.DownforceFrac = def.Stats.Downforce or P.DownforceByClass[def.Class] or 0

	self.Mass = math.max(1, self.Root.AssemblyMass)
	self.Gravity = Workspace.Gravity
	self.MassAt = os.clock()

	self.Steer = 0
	self.RearGrip = 1
	self.FlipTimer = 0
	self.PrevVel = nil :: Vector3?
	self.ExpectedDv = Vector3.zero

	self.Speed = 0
	self.ForwardSpeed = 0
	self.Rpm = self.Powertrain.Idle
	self.Gear = self.Powertrain.Gear
	self.Throttle = 0
	self.BrakeLight = false
	self.Reverse = false
	self.Skid = 0
	self.Grounded = 0
	self.Impact = 0
	self.ImpactHorizontal = 0
	self.Flipped = false
	return self
end

-- Suspension rays ignore our own car and every character (wheels must not "climb" on people; the body
-- still collides with them normally). Refreshed every FILTER_REFRESH seconds for players that respawn.
local FILTER_REFRESH = 1
function Chassis:_RefreshFilter()
	local exclude: { Instance } = { self.Model }
	if self.Character then
		table.insert(exclude, self.Character)
	end
	for _, plr in ipairs(Players:GetPlayers()) do
		local char = plr.Character
		if char and char ~= self.Character then
			table.insert(exclude, char)
		end
	end
	self.RayParams.FilterDescendantsInstances = exclude
	self.FilterAt = os.clock()
end

function Chassis:SetMultipliers(mults: { [string]: number })
	self.Mults = mults
	self.Powertrain:SetMultipliers(mults)
	local stiff = VehicleStats.Relative(self.Stats.SuspensionStiffness, 0.4, 2.5) * (mults.Stiffness or 1)
	Suspension.SetStiffness(self.Geo, stiff)
end

function Chassis:GetBasis(): CFrame
	return self.Root.CFrame * self.Geo.BasisLocal
end

function Chassis:GetGroundY(): number?
	local sum, n = 0, 0
	for _, w in ipairs(self.Geo.Wheels) do
		if w.Contact then
			sum += w.HitPos.Y
			n += 1
		end
	end
	if n == 0 then
		return nil
	end
	return sum / n
end

---------------------------------------------------------------------------
-- Physics step
---------------------------------------------------------------------------
function Chassis:Step(rawDt: number, ctl: { [string]: any })
	local root = self.Root
	if not root.Parent then
		return
	end
	local dt = math.clamp(rawDt, 1 / 240, P.MaxDt)
	local now = os.clock()
	if now - self.MassAt > P.MassRefresh then
		self.Mass = math.max(1, root.AssemblyMass)
		self.Gravity = Workspace.Gravity
		self.MassAt = now
	end
	if now - (self.FilterAt or 0) > FILTER_REFRESH then
		self:_RefreshFilter()
	end
	local mass, worldG = self.Mass, self.Gravity
	-- effective gravity felt by the car (see Config/Driving.Physics.VehicleGravityG)
	local g = math.min(worldG, Units.G_STUDS * P.VehicleGravityG)
	local stats = self.Stats
	local mults = self.Mults
	local geo = self.Geo
	geo.Impulse = Vector3.zero
	geo.AngularImpulse = Vector3.zero
	self.Flipped = false

	local basis = root.CFrame * geo.BasisLocal
	local up, fwd = basis.UpVector, basis.LookVector
	local vel = root.AssemblyLinearVelocity

	-- impact = velocity change we did not cause (walls, other cars, hard landings)
	-- (the impulse we applied last step acted over the interval that ends now, as did gravity, so gravity is
	-- predicted with THIS step's rawDt — using last step's dt made every frame hitch look like a crash)
	-- Frame hitches (> 0.1 s) are skipped: the physics engine may have throttled, so the prediction is unreliable.
	if self.PrevVel and rawDt <= 0.1 then
		local dv = vel - self.PrevVel - self.ExpectedDv - Vector3.new(0, -worldG * rawDt, 0)
		self.Impact = Units.StudsToMph(dv.Magnitude)
		self.ImpactHorizontal = Units.StudsToMph(flat(dv).Magnitude)
	else
		self.Impact = 0
		self.ImpactHorizontal = 0
	end

	local fwdSpeed = vel:Dot(fwd)
	self.Speed = vel.Magnitude
	self.ForwardSpeed = fwdSpeed

	-- 1. suspension -----------------------------------------------------------
	local grounded, massShare = Suspension.Solve(geo, root, self.RayParams, dt, mass, g, self.DampMult)
	self.Grounded = grounded

	-- 2. steering (speed sensitive, smoothed, Ackermann) ----------------------
	local speedMph = math.abs(Units.StudsToMph(fwdSpeed))
	local fullLock = math.rad(stats.SteerAngle)
	local frac = math.clamp(speedMph / S.SpeedForMinAngle, 0, 1)
	local maxAngle = fullLock * (1 + (S.MinAngleFraction - 1) * frac)
	local target = math.clamp(ctl.Steer or 0, -1, 1) * maxAngle
	local rate
	if ctl.SteerAnalog then
		rate = S.AnalogRate
	elseif math.abs(target) < math.abs(self.Steer) or sign(target) ~= sign(self.Steer) then
		rate = S.ReturnRate
	else
		rate = S.Rate
	end
	self.Steer = approach(self.Steer, target, rate * fullLock * dt)

	local L, T = geo.Wheelbase, geo.Track
	local absSteer = math.abs(self.Steer)
	local inner, outer = absSteer, absSteer
	if absSteer > 0.002 then
		local R = L / math.tan(absSteer)
		inner = math.atan(L / math.max(0.5, R - T / 2))
		outer = math.atan(L / (R + T / 2))
	end
	local steerSign = sign(self.Steer)
	for _, w in ipairs(geo.Wheels) do
		if w.Steer then
			if w.Side == 0 or steerSign == 0 then
				w.SteerAngle = self.Steer
			else
				w.SteerAngle = steerSign * ((w.Side == steerSign) and inner or outer)
			end
		else
			w.SteerAngle = 0
		end
	end

	-- 3. powertrain -----------------------------------------------------------
	local frontShare = self.FrontShare
	local wheelSum, wheelN = 0, 0
	for _, w in ipairs(geo.Wheels) do
		local share = w.Axle == "F" and frontShare or (1 - frontShare)
		if share > 0 then
			wheelSum += w.SurfaceSpeed
			wheelN += 1
		end
	end
	local wheelSpeed = wheelN > 0 and wheelSum / wheelN or fwdSpeed
	local pt = self.Powertrain
	local res = pt:Update(dt, {
		Throttle = ctl.Throttle or 0,
		Brake = ctl.Brake or 0,
		Manual = ctl.Manual,
		ForwardMps = Units.StudsToMps(fwdSpeed),
		WheelMps = Units.StudsToMps(wheelSpeed),
		EngineOn = ctl.EngineOn,
		PowerScale = ctl.PowerScale or 1,
	})

	-- SI Newtons → Roblox force (same acceleration in studs/s^2 for the assembly's real mass)
	local K = mass / (stats.Mass * Units.STUD_METERS)
	local driveTotal = res.DriveForce * K
	local brakeTotal = res.Brake * P.MaxBrakeDecel * stats.BrakeForce * (mults.Brake or 1) * stats.Mass * K
	if res.Throttle < 0.02 and math.abs(fwdSpeed) < P.HoldSpeed then
		brakeTotal = math.max(brakeTotal, mass * Units.G_STUDS) -- parking hold
	end

	-- handbrake drift grip (instant loss, smooth recovery)
	local rearTarget = ctl.Handbrake and stats.DriftGrip or 1
	if rearTarget < self.RearGrip then
		self.RearGrip = rearTarget
	else
		self.RearGrip = approach(self.RearGrip, rearTarget, dt / math.max(0.05, P.DriftRecoverTime))
	end

	-- 4. tyres ---------------------------------------------------------------
	local com = root.AssemblyCenterOfMass
	local gripBase = stats.Grip * (mults.Grip or 1) * P.GripScale * Units.G_STUDS / g
	local skidMax = 0
	for _, w in ipairs(geo.Wheels) do
		local axleShare = w.Axle == "F" and frontShare or (1 - frontShare)
		local axleCount = self.AxleCount[w.Axle]
		local locked = ctl.Handbrake == true and w.Axle == "R"
		local drive = locked and 0 or driveTotal * axleShare / axleCount
		if w.Contact then
			local n = w.Normal
			local wf = fwd
			if w.SteerAngle ~= 0 then
				wf = CFrame.fromAxisAngle(up, -w.SteerAngle):VectorToWorldSpace(fwd)
			end
			wf -= n * wf:Dot(n)
			if wf.Magnitude < 1e-3 then
				wf = fwd
			else
				wf = wf.Unit
			end
			local wr = wf:Cross(n).Unit
			local v = root:GetVelocityAtPosition(w.HitPos)
			local vLong, vLat = v:Dot(wf), v:Dot(wr)
			local surface = P.SurfaceGrip[w.Material.Name] or 1
			local grip = w.Load * gripBase * surface
			local latGrip = grip * (w.Axle == "R" and self.RearGrip or 1)
			local longGrip = grip * P.LongGripShare
			local bias = w.Axle == "F" and P.BrakeFrontBias or (1 - P.BrakeFrontBias)
			local brake = brakeTotal * bias / axleCount
			local fL, fT, spin, skid = Tires.Solve(vLong, vLat, longGrip, latGrip, drive, brake, locked, massShare, dt)
			local lift = (com - w.HitPos):Dot(up) * P.RollCenterLift
			local at = w.HitPos + up * lift
			Suspension.AddImpulse(geo, com, (wf * fL + wr * fT) * dt, at)
			if locked then
				w.SurfaceSpeed = 0
			else
				w.SurfaceSpeed = vLong + sign(drive) * spin * P.WheelspinVisualGain
			end
			w.Skid = skid
			skidMax = math.max(skidMax, skid)
		else
			-- airborne: no control. Wheels keep spinning (driven ones rev with throttle).
			local targetSpeed = (drive ~= 0) and (w.SurfaceSpeed + sign(drive) * 60 * dt) or w.SurfaceSpeed * (1 - math.min(1, dt * 0.6))
			w.SurfaceSpeed = locked and 0 or math.clamp(targetSpeed, -400, 400)
			w.Skid = 0
		end
	end
	self.Skid = skidMax

	-- 5. aero drag, rolling resistance, downforce ------------------------------
	local speed = vel.Magnitude
	if speed > 0.1 then
		local vMps = Units.StudsToMps(speed)
		local dragImp = math.min(pt.AeroCoef * vMps * vMps * K * dt, mass * speed * 0.5)
		geo.Impulse -= vel.Unit * dragImp
		if grounded > 0 and math.abs(fwdSpeed) > 0.3 then
			local rollImp = math.min(pt.RollCoef * stats.Mass * Units.G * K * dt, mass * math.abs(fwdSpeed) * 0.5)
			geo.Impulse -= fwd * sign(fwdSpeed) * rollImp
		end
		if self.DownforceFrac > 0 and grounded > 0 then
			local ratio = math.clamp(vMps / math.max(1, pt.TopSpeedMps), 0, 1.2)
			geo.Impulse -= up * (ratio * ratio * self.DownforceFrac * mass * g * dt)
		end
	end

	-- gravity compensation (always on while we simulate the car, airborne too)
	if worldG > g then
		geo.Impulse += Vector3.yAxis * (mass * (worldG - g) * dt)
	end

	-- 6. apply once -----------------------------------------------------------
	root:ApplyImpulse(geo.Impulse)
	root:ApplyAngularImpulse(geo.AngularImpulse)
	self.ExpectedDv = geo.Impulse / mass
	self.PrevVel = vel

	-- 7. auto-flip when stuck on the roof / side --------------------------------
	if up:Dot(Vector3.yAxis) < P.UpsideDownDot and speed < 8 and grounded < 2 then
		self.FlipTimer += rawDt
		if self.FlipTimer >= P.AutoFlipDelay then
			self.FlipTimer = 0
			local look = flat(fwd)
			if look.Magnitude < 0.1 then
				look = flat(up)
			end
			if look.Magnitude < 0.1 then
				look = Vector3.zAxis
			end
			local pos = root.Position + Vector3.new(0, P.AutoFlipLift, 0)
			local targetBasis = CFrame.lookAt(pos, pos + look.Unit)
			root.CFrame = targetBasis * geo.BasisLocal:Inverse()
			root.AssemblyLinearVelocity = Vector3.zero
			root.AssemblyAngularVelocity = Vector3.zero
			self.PrevVel = nil
			self.Flipped = true
		end
	else
		self.FlipTimer = 0
	end

	-- 8. telemetry state -------------------------------------------------------
	self.Rpm = pt.Rpm
	self.Gear = pt.Gear
	self.Throttle = res.Throttle
	self.BrakeLight = res.Brake > 0.05
	self.Reverse = pt.Gear == -1
end

---------------------------------------------------------------------------
-- Cosmetic wheels (RenderStepped)
---------------------------------------------------------------------------
function Chassis:UpdateVisuals(dt: number)
	local geo = self.Geo
	local up, right = geo.UpLocal, geo.RightLocal
	local blend = math.min(1, dt * 30)
	for _, v in ipairs(geo.Visuals) do
		local w = v.Physics
		local motor = v.Motor
		if motor.Parent then
			v.Len += (w.SpringLen - v.Len) * blend
			v.Angle = (v.Angle + w.SurfaceSpeed / v.Radius * dt) % TAU
			local pos = v.Top - up * v.Len + v.Offset
			motor.C0 = CFrame.new(pos)
				* CFrame.fromAxisAngle(up, -w.SteerAngle)
				* CFrame.fromAxisAngle(right, -v.Angle)
				* v.BaseRot
		end
	end
end

function Chassis:Destroy()
	for _, v in ipairs(self.Geo.Visuals) do
		if v.Motor.Parent then
			v.Motor.C0 = v.OrigC0
		end
	end
end

return Chassis
