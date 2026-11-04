-- Tires: the tyre force model (pure maths, no instances).
--
--   local fLong, fLat, spin, skid = Tires.Solve(vLong, vLat, gripLong, gripLat, driveF, brakeF, locked, massShare, dt)
--     vLong / vLat   contact-patch velocity along / across the wheel (studs/s)
--     gripLong/Lat   maximum friction force the tyre can give in each direction (Roblox force units)
--     driveF         requested drive force (signed, + = wheel forward)
--     brakeF         requested brake force magnitude (ABS-limited here)
--     locked         handbrake lock (rear wheels)
--     massShare      mass carried by this wheel (for "don't overshoot" clamps)
--   returns longitudinal & lateral force (Roblox force units), wheelspin amount (0..), skid intensity (0..1)
--
-- Lateral force follows a Pacejka-style curve of slip angle; longitudinal & lateral forces share a
-- friction ellipse (so full throttle mid-corner makes a RWD car oversteer, braking hard reduces steering).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Driving = require(ReplicatedStorage:WaitForChild("Shared").Config.Driving)
local P = Driving.Physics

local Tires = {}

local function sign(x: number): number
	if x > 0 then
		return 1
	elseif x < 0 then
		return -1
	end
	return 0
end

function Tires.LateralCurve(alpha: number): number
	return math.sin(P.PacejkaC * math.atan(P.PacejkaB * alpha))
end

function Tires.Solve(
	vLong: number,
	vLat: number,
	gripLong: number,
	gripLat: number,
	driveF: number,
	brakeF: number,
	locked: boolean,
	massShare: number,
	dt: number
): (number, number, number, number)
	local absLong = math.abs(vLong)
	local absLat = math.abs(vLat)

	-- lateral ---------------------------------------------------------------
	local alpha = math.atan(absLat / math.max(absLong, P.LowSpeedSlipRef))
	local fLat = -sign(vLat) * gripLat * Tires.LateralCurve(alpha)
	local latStop = massShare * absLat / dt * P.LateralStopFactor
	if math.abs(fLat) > latStop then
		fLat = -sign(vLat) * latStop
	end

	-- longitudinal ----------------------------------------------------------
	local fLong = 0
	local spin = 0
	local longStop = massShare * absLong / dt
	if locked then
		fLong = -sign(vLong) * math.min(gripLong * P.HandbrakeLockGrip, longStop)
	else
		fLong = driveF
		if brakeF > 0 then
			local b = math.min(brakeF, gripLong * P.AbsLimit, longStop)
			fLong -= sign(vLong) * b
		end
		local excess = math.abs(driveF) - gripLong
		if excess > 0 and gripLong > 0 then
			spin = excess / gripLong
		end
	end

	-- friction ellipse --------------------------------------------------------
	if gripLong > 0 and gripLat > 0 then
		local e = (fLong / gripLong) ^ 2 + (fLat / gripLat) ^ 2
		if e > 1 then
			local s = 1 / math.sqrt(e)
			fLong *= s
			fLat *= s
		end
	else
		fLong, fLat = 0, 0
	end

	-- skid intensity for audio / effects
	local skid = 0
	local speed = math.sqrt(absLong * absLong + absLat * absLat)
	if speed > 8 then
		skid = math.clamp((alpha - 0.16) / 0.35, 0, 1)
		if locked and absLong > 6 then
			skid = math.max(skid, 0.8)
		end
	end
	if spin > 0.15 then
		skid = math.max(skid, math.clamp(spin, 0, 1))
	end
	return fLong, fLat, spin, skid
end

return Tires
