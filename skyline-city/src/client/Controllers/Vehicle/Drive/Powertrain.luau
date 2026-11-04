-- Powertrain: engine (torque curve, rev limiter, clutch slip), gearbox (automatic with kickdown,
-- manual with sequential shifts, reverse) and EV motor (single gear, instant torque, regen).
--
-- Works in SI units: speeds in m/s, forces in Newtons at the tyres.
--
--   local pt = Powertrain.new(stats, mults)          -- stats = VehicleStats.Resolve(id).Stats (+ .Electric)
--   local res = pt:Update(dt, input)
--       input = { Throttle 0..1, Brake 0..1, Manual bool, ForwardMps, WheelMps, EngineOn bool, PowerScale 0..1 }
--       res   = { DriveForce (N, + = forward), Brake 0..1 (pedal after reverse mapping), Throttle 0..1 (effective) }
--   pt:ShiftUp(speedMps) / pt:ShiftDown(speedMps) -> (ok, reason?)   -- manual mode
--   pt.Gear (-1 = R, 0 = N, 1..n), pt.Rpm, pt.Electric, pt.TopSpeedMps, pt.AeroCoef, pt.RollCoef

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Units = require(Shared.Vehicle.Units)
local TorqueCurve = require(Shared.Vehicle.TorqueCurve)
local Driving = require(Shared.Config.Driving)

local E = Driving.Engine
local P = Driving.Physics

local Powertrain = {}
Powertrain.__index = Powertrain

local function lerp(a: number, b: number, t: number): number
	return a + (b - a) * t
end

local function approach(current: number, target: number, rate: number): number
	if current < target then
		return math.min(target, current + rate)
	end
	return math.max(target, current - rate)
end

function Powertrain.new(stats: { [string]: any }, mults: { [string]: number }, electric: boolean, wheelRadiusStuds: number)
	local self = setmetatable({}, Powertrain)
	self.Stats = stats
	self.Electric = electric == true
	self.MassKg = stats.Mass
	self.R = math.max(0.05, Units.StudsToMeters(wheelRadiusStuds)) -- wheel radius (m)
	self.Idle = stats.IdleRPM
	self.Redline = stats.RedlineRPM
	self.Curve = TorqueCurve.Build(stats.TorqueCurve, self.Idle, self.Redline)
	self.Gears = table.clone(stats.Gears)
	self.ReverseRatio = stats.ReverseGear
	self.Final = stats.FinalDrive
	self.Eff = P.DrivetrainEfficiency

	self.Gear = 1
	self.Rpm = self.Idle
	self.ShiftTimer = 0
	self.Cooldown = 0
	self.LimiterTimer = 0
	self.DirTimer = 0
	self.Boost = 0
	self.ClutchSlip = 0
	self.LastThrottle = 0
	self.Shifted = false -- true for one Update after a gear change (for audio / UI)

	local baseTop = Units.MphToMps(stats.TopSpeed)
	self.BaseTopSpeedMps = baseTop

	if self.Electric then
		self.MaxRpm = self.Redline >= 6000 and self.Redline or E.EVMaxRpm
		self.Redline = self.MaxRpm
		self.MaxPowerW = Units.HorsepowerToWatts(stats.Horsepower)
		-- single reduction gear sized so the motor reaches max rpm slightly above top speed
		local ratio = Units.RpmToRadPerSec(self.MaxRpm) * self.R / (baseTop * 1.05)
		self.Gears = { ratio }
		self.Final = 1
		self.ReverseRatio = ratio
	else
		-- make sure gearing can actually reach TopSpeed before the rev limiter
		local topRatio = self.Gears[#self.Gears]
		local vAtRedline = Units.RpmToRadPerSec(self.Redline) * self.R / (topRatio * self.Final)
		if vAtRedline < baseTop * 1.06 then
			self.Final = Units.RpmToRadPerSec(self.Redline) * self.R / (topRatio * baseTop * 1.08)
		end
	end

	self.RollCoef = P.RollingResistance
	self.AeroCoef = self:_CalibrateAero(baseTop)
	self:SetMultipliers(mults)
	return self
end

function Powertrain:SetMultipliers(mults: { [string]: number })
	self.Mults = mults
	self.PowerMult = mults.Power or 1
	self.TurboMult = mults.TurboPower or 1
	self.ShiftTime = E.ShiftTime / math.max(0.2, mults.ShiftSpeed or 1)
	-- more power → higher natural top speed (drag is v^2, power ~ v^3)
	local powerGain = (self.PowerMult * self.TurboMult) ^ (1 / 3)
	self.TopSpeedMps = self.BaseTopSpeedMps * powerGain * (mults.TopSpeed or 1)
end

-- Maximum engine torque (Nm) at an rpm, before throttle / multipliers.
function Powertrain:_EngineTorque(rpm: number): number
	if self.Electric then
		return TorqueCurve.ElectricTorque(self.Stats.PeakTorque, self.MaxPowerW, rpm)
	end
	return self.Stats.PeakTorque * TorqueCurve.Sample(self.Curve, rpm)
end

function Powertrain:_Ratio(gear: number): number
	if gear == -1 then
		return -self.ReverseRatio
	elseif gear == 0 then
		return 0
	end
	return self.Gears[gear] or 0
end

function Powertrain:_RpmFor(speedMps: number, gear: number): number
	local ratio = math.abs(self:_Ratio(gear))
	return Units.RadPerSecToRpm(math.abs(speedMps) / self.R * ratio * self.Final)
end

-- Aero coefficient so that drag + rolling resistance equals the best available drive force at TopSpeed.
function Powertrain:_CalibrateAero(vTop: number): number
	local best = 0
	for g = 1, #self.Gears do
		local rpm = self:_RpmFor(vTop, g)
		if rpm >= self.Idle and rpm <= self.Redline then
			local f = self:_EngineTorque(rpm) * self.Gears[g] * self.Final * self.Eff / self.R
			best = math.max(best, f)
		end
	end
	if best <= 0 then
		best = Units.HorsepowerToWatts(self.Stats.Horsepower) * self.Eff / vTop
	end
	local roll = self.RollCoef * self.MassKg * Units.G
	local c = (best - roll) / (vTop * vTop)
	if c <= 0.02 or c ~= c then
		return P.DefaultAeroCoef
	end
	return c
end

function Powertrain:_SetGear(gear: number)
	if gear ~= self.Gear then
		self.Gear = gear
		self.ShiftTimer = (self.Electric and 0) or self.ShiftTime
		self.Cooldown = E.ShiftCooldown
		self.Shifted = true
	end
end

-- Manual shifting ----------------------------------------------------------
function Powertrain:ShiftUp(speedMps: number): (boolean, string?)
	if self.Electric then
		return false, "Electric cars have a single gear"
	end
	if self.Gear == -1 then
		self:_SetGear(0)
	elseif self.Gear < #self.Gears then
		self:_SetGear(self.Gear + 1)
	else
		return false, nil
	end
	return true, nil
end

function Powertrain:ShiftDown(speedMps: number): (boolean, string?)
	if self.Electric then
		return false, "Electric cars have a single gear"
	end
	if self.Gear > 1 then
		local rpm = self:_RpmFor(speedMps, self.Gear - 1)
		if rpm > self.Redline * 1.05 then
			return false, "Too fast for that gear"
		end
		self:_SetGear(self.Gear - 1)
	elseif self.Gear == 1 then
		self:_SetGear(0)
	elseif self.Gear == 0 then
		if math.abs(speedMps) > Units.MphToMps(3) then
			return false, "Stop before selecting reverse"
		end
		self:_SetGear(-1)
	else
		return false, nil
	end
	return true, nil
end

-- Switching gearbox mode
function Powertrain:SetManual(manual: boolean)
	if not manual and self.Gear == 0 then
		self:_SetGear(1)
	end
end

---------------------------------------------------------------------------
-- Update
---------------------------------------------------------------------------
function Powertrain:Update(dt: number, input: { [string]: any }): { [string]: number }
	self.Shifted = false
	local throttleIn = input.Throttle or 0
	local brakeIn = input.Brake or 0
	local fwd = input.ForwardMps or 0
	local wheelMps = input.WheelMps or fwd
	local engineOn = input.EngineOn == true
	local manual = input.Manual == true and not self.Electric
	local powerScale = input.PowerScale or 1
	local speedMph = fwd * Units.MPS_TO_MPH

	self.ShiftTimer = math.max(0, self.ShiftTimer - dt)
	self.Cooldown = math.max(0, self.Cooldown - dt)
	self.LimiterTimer = math.max(0, self.LimiterTimer - dt)

	-- 1. pedal mapping & automatic direction selection ---------------------
	local throttle, brake = throttleIn, brakeIn
	if not manual then
		if self.Gear == -1 then
			throttle, brake = brakeIn, throttleIn
			if throttleIn > 0.1 and brakeIn < 0.1 and speedMph > -1.5 then
				self.DirTimer += dt
				if self.DirTimer >= E.ReverseEngageDelay * 0.5 then
					self:_SetGear(1)
					self.DirTimer = 0
				end
			else
				self.DirTimer = 0
			end
		else
			if self.Gear < 1 then
				self:_SetGear(1)
			end
			if brakeIn > 0.1 and throttleIn < 0.1 and speedMph < 1.5 then
				self.DirTimer += dt
				if self.DirTimer >= E.ReverseEngageDelay then
					self:_SetGear(-1)
					self.DirTimer = 0
				end
			else
				self.DirTimer = 0
			end
		end
	end

	-- 2. rpm --------------------------------------------------------------
	local ratio = self:_Ratio(self.Gear)
	local engaged = ratio ~= 0 and self.ShiftTimer <= 0
	local rpmWheels = self:_RpmFor(wheelMps, self.Gear)
	local rpm = self.Rpm
	self.ClutchSlip = 0

	if self.Electric then
		rpm = engineOn and math.min(rpmWheels, self.MaxRpm) or math.max(0, rpm - 6000 * dt)
	elseif not engineOn then
		rpm = math.max(0, rpm - 2500 * dt)
	elseif not engaged then
		local target = self.Idle + throttle * (self.Redline - self.Idle) * 0.95
		local rate = target > rpm and E.RevUpRate or E.RevDownRate
		rpm = approach(rpm, target, rate * dt)
	else
		local launch = self.Idle + (self.Redline - self.Idle) * E.LaunchRpmFraction * throttle
		local floor = math.max(self.Idle, launch)
		if rpmWheels < floor then
			-- clutch slipping: engine held at launch revs, full torque delivered
			rpm = approach(rpm, floor, E.RevUpRate * dt)
			self.ClutchSlip = 1 - rpmWheels / math.max(1, floor)
		else
			rpm = lerp(rpm, rpmWheels, math.min(1, dt * 25))
		end
	end

	-- rev limiter
	if not self.Electric and rpm >= self.Redline then
		self.LimiterTimer = E.LimiterCut
	end
	rpm = math.clamp(rpm, 0, self.Redline + 150)
	self.Rpm = rpm

	-- turbo spool (only when a turbo upgrade is fitted)
	if self.TurboMult > 1.001 then
		local target = throttle > 0.5 and engaged and 1 or 0
		self.Boost = approach(self.Boost, target, dt / E.TurboSpool)
	else
		self.Boost = 0
	end

	-- 3. drive force -------------------------------------------------------
	local force = 0
	local mass = self.MassKg
	local direction = (ratio < 0) and -1 or 1
	if engineOn and engaged and self.LimiterTimer <= 0 and throttle > 0.001 and powerScale > 0 then
		local torque = self:_EngineTorque(math.max(rpm, self.Idle)) * throttle
		torque *= powerScale * self.PowerMult * (1 + (self.TurboMult - 1) * self.Boost)
		force = torque * math.abs(ratio) * self.Final * self.Eff / self.R * direction
	end

	-- caps: top speed / reverse speed
	local topCap = self.TopSpeedMps * P.TopSpeedSoftLimit
	if direction > 0 and fwd > topCap then
		force = math.min(force, 0)
	elseif direction < 0 and fwd < -Units.MphToMps(P.ReverseMaxMph) then
		force = math.max(force, 0)
	end

	-- engine braking / regen when off-throttle and moving
	if engineOn and engaged and throttle < 0.05 and math.abs(fwd) > 0.5 then
		local decel
		if self.Electric then
			decel = P.RegenDecel
		else
			local gearFactor = math.clamp(math.abs(ratio) / math.max(0.1, self.Gears[1]), 0.25, 1)
			decel = P.EngineBrakeDecel * gearFactor * math.clamp(rpm / self.Redline + 0.3, 0, 1.2)
		end
		force -= (fwd > 0 and 1 or -1) * decel * mass
	end

	-- 4. automatic gearbox --------------------------------------------------
	if not manual and not self.Electric and self.Gear >= 1 and engaged and self.Cooldown <= 0 and engineOn then
		local n = #self.Gears
		if self.Gear > 1 and math.abs(fwd) < Units.MphToMps(4) then
			-- coming to a stop: drop straight to first so the next launch isn't in a tall gear
			self:_SetGear(1)
			self.ShiftTimer = 0
		end
		local upAt = lerp(E.AutoUpshift.Min, E.AutoUpshift.Max, throttle) * self.Redline
		local downAt = lerp(E.AutoDownshift.Min, E.AutoDownshift.Max, throttle) * self.Redline
		if self.Gear < n and rpmWheels > upAt and self:_RpmFor(wheelMps, self.Gear + 1) > self.Idle * 1.1 then
			self:_SetGear(self.Gear + 1)
		elseif self.Gear > 1 then
			local lowerRpm = self:_RpmFor(wheelMps, self.Gear - 1)
			local kick = throttle >= E.KickdownThrottle
				and lowerRpm < E.KickdownMaxRpm * self.Redline
				and rpmWheels < 0.6 * self.Redline
			if (rpmWheels < downAt and lowerRpm < 0.88 * self.Redline) or kick then
				self:_SetGear(self.Gear - 1)
			end
		end
	end

	self.LastThrottle = throttle
	return {
		DriveForce = force,
		Brake = brake,
		Throttle = throttle,
	}
end

-- What the dashboard shows: "R", "N", "D3", "1".."6", "E" (EV drive)
function Powertrain:GearLabel(manual: boolean, engineOn: boolean, speedStuds: number): string
	if self.Gear == -1 then
		return "R"
	elseif self.Gear == 0 then
		return "N"
	end
	if self.Electric then
		return (not engineOn or math.abs(speedStuds) < 0.5) and "P" or "D"
	end
	if manual then
		return tostring(self.Gear)
	end
	if not engineOn then
		return "P"
	end
	return "D" .. tostring(self.Gear)
end

return Powertrain
