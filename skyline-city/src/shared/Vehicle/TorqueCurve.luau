-- TorqueCurve: engine torque-curve maths (pure, shared).
--
--   local curve = TorqueCurve.Build(stats.TorqueCurve, idleRpm, redlineRpm)
--   local fraction = TorqueCurve.Sample(curve, rpm)          -- 0..1 of PeakTorque
--   TorqueCurve.ElectricTorque(peakTorqueNm, maxPowerW, rpm) -- flat torque then constant power
--
-- Config curves are arrays of { rpm, fraction } pairs. RPM values may be absolute (e.g. 4500) or
-- normalised 0..1 of the idle→redline range (detected automatically). Points may be in any order.

local Units = require(script.Parent.Units)

local TorqueCurve = {}

-- Generic petrol engine shape (normalised rpm 0 = idle, 1 = redline)
TorqueCurve.DefaultNormalized = {
	{ 0, 0.55 },
	{ 0.15, 0.7 },
	{ 0.35, 0.88 },
	{ 0.55, 1.0 },
	{ 0.75, 0.97 },
	{ 0.9, 0.88 },
	{ 1.0, 0.78 },
}

export type Curve = { { number } }

local function valid(curve: any): boolean
	if type(curve) ~= "table" or #curve < 2 then
		return false
	end
	for _, p in ipairs(curve) do
		if type(p) ~= "table" or type(p[1]) ~= "number" or type(p[2]) ~= "number" then
			return false
		end
	end
	return true
end

-- Returns a sorted array of absolute { rpm, fraction } points.
function TorqueCurve.Build(curve: any, idle: number, redline: number): Curve
	local src = valid(curve) and curve or TorqueCurve.DefaultNormalized
	local normalized = true
	for _, p in ipairs(src) do
		if p[1] > 1.5 then
			normalized = false
			break
		end
	end
	local out = {}
	for _, p in ipairs(src) do
		local rpm = p[1]
		if normalized then
			rpm = idle + (redline - idle) * rpm
		end
		table.insert(out, { rpm, math.clamp(p[2], 0, 1.5) })
	end
	table.sort(out, function(a, b)
		return a[1] < b[1]
	end)
	return out
end

-- Linear interpolation, clamped at both ends.
function TorqueCurve.Sample(curve: Curve, rpm: number): number
	local n = #curve
	if n == 0 then
		return 1
	end
	if rpm <= curve[1][1] then
		return curve[1][2]
	end
	if rpm >= curve[n][1] then
		return curve[n][2]
	end
	for i = 1, n - 1 do
		local a, b = curve[i], curve[i + 1]
		if rpm >= a[1] and rpm <= b[1] then
			local span = b[1] - a[1]
			if span <= 0 then
				return b[2]
			end
			local t = (rpm - a[1]) / span
			return a[2] + (b[2] - a[2]) * t
		end
	end
	return curve[n][2]
end

-- The rpm with the highest power (torque x rpm). Useful for shift points / UI.
function TorqueCurve.PeakPowerRpm(curve: Curve, idle: number, redline: number): number
	local best, bestRpm = 0, redline
	local steps = 40
	for i = 0, steps do
		local rpm = idle + (redline - idle) * i / steps
		local p = TorqueCurve.Sample(curve, rpm) * rpm
		if p > best then
			best = p
			bestRpm = rpm
		end
	end
	return bestRpm
end

-- Electric motor: peak torque up to base speed, then constant power (torque falls with rpm).
function TorqueCurve.ElectricTorque(peakTorque: number, maxPowerW: number, rpm: number): number
	local w = Units.RpmToRadPerSec(math.max(rpm, 1))
	return math.min(peakTorque, maxPowerW / w)
end

return TorqueCurve
