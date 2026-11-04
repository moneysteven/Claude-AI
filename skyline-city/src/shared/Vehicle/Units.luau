-- Units: conversions between Roblox studs and real-world units for the driving model.
-- Shared by client (chassis, dashboard) and server (mileage / anti-exploit may use it too).
--
-- Scale: 1 stud = 0.28 m (Roblox avatar scale: a 5-stud character ≈ 1.4 m... close enough to feel right
-- next to cars built at the same scale).

local Units = {}

Units.STUD_METERS = 0.28
Units.MPS_TO_MPH = 2.2369363
Units.MPS_TO_KMH = 3.6
Units.G = 9.81 -- real gravity (m/s^2)
Units.G_STUDS = Units.G / Units.STUD_METERS -- 1 g expressed in studs/s^2 (≈ 35)
Units.METERS_PER_MILE = 1609.344
Units.TAU = math.pi * 2

function Units.StudsToMeters(studs: number): number
	return studs * Units.STUD_METERS
end

function Units.MetersToStuds(m: number): number
	return m / Units.STUD_METERS
end

-- velocities ---------------------------------------------------------------
function Units.StudsToMps(v: number): number
	return v * Units.STUD_METERS
end

function Units.MpsToStuds(v: number): number
	return v / Units.STUD_METERS
end

function Units.StudsToMph(v: number): number
	return v * Units.STUD_METERS * Units.MPS_TO_MPH
end

function Units.StudsToKmh(v: number): number
	return v * Units.STUD_METERS * Units.MPS_TO_KMH
end

function Units.MphToStuds(mph: number): number
	return mph / Units.MPS_TO_MPH / Units.STUD_METERS
end

function Units.MphToMps(mph: number): number
	return mph / Units.MPS_TO_MPH
end

function Units.KmhToStuds(kmh: number): number
	return kmh / Units.MPS_TO_KMH / Units.STUD_METERS
end

-- Speed in the player's unit. unit = "MPH" | "KMH"
function Units.SpeedIn(studsPerSecond: number, unit: string?): number
	if unit == "KMH" then
		return Units.StudsToKmh(studsPerSecond)
	end
	return Units.StudsToMph(studsPerSecond)
end

function Units.SpeedLabel(unit: string?): string
	return unit == "KMH" and "km/h" or "mph"
end

-- Distance (for the odometer). sourceUnit = "studs" | "miles" | "km"; unit = "MPH" | "KMH"
function Units.Distance(value: number, sourceUnit: string?, unit: string?): number
	local meters
	if sourceUnit == "miles" then
		meters = value * Units.METERS_PER_MILE
	elseif sourceUnit == "km" then
		meters = value * 1000
	else
		meters = value * Units.STUD_METERS
	end
	if unit == "KMH" then
		return meters / 1000
	end
	return meters / Units.METERS_PER_MILE
end

function Units.DistanceLabel(unit: string?): string
	return unit == "KMH" and "km" or "mi"
end

-- rotation -----------------------------------------------------------------
function Units.RpmToRadPerSec(rpm: number): number
	return rpm * Units.TAU / 60
end

function Units.RadPerSecToRpm(w: number): number
	return w * 60 / Units.TAU
end

function Units.HorsepowerToWatts(hp: number): number
	return hp * 745.7
end

return Units
