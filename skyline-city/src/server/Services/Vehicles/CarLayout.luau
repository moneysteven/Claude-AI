-- CarLayout: turns a Config/Cars definition (Body + Stats) into concrete car-local geometry used by every
-- builder piece (CarBody, CarDetails, CarRig, CarScooter). Pure maths, no instances.
--
--   local B = CarLayout.Compute(def)
--
-- Car-local frame: origin on the ground under the centre, X right, Y up, -Z forward. Units: studs.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local VehicleStats = require(Shared.Vehicle.VehicleStats)

local CarLayout = {}

local function num(v: any, default: number): number
	if type(v) ~= "number" or v ~= v then
		return default
	end
	return v
end

function CarLayout.Compute(def: { [string]: any })
	local resolved = VehicleStats.Resolve(def.Id)
	local s = resolved.Stats
	local b = type(def.Body) == "table" and def.Body or {}
	local features = resolved.Features

	local B: { [string]: any } = {}
	B.Def = def
	B.Stats = s
	B.Features = features
	B.Class = resolved.Class
	B.RoofStyle = b.RoofStyle or "Sedan"
	B.Rear = b.Rear or "Trunk"
	B.Bumper = b.Bumper or "Standard"
	B.Headlights = b.Headlights or "Slim"
	B.Extras = {}
	for _, e in ipairs(type(b.Extras) == "table" and b.Extras or {}) do
		B.Extras[e] = true
	end
	B.Scooter = B.RoofStyle == "Scooter" or B.Class == "Scooter"
	B.Convertible = features.Convertible or B.RoofStyle == "Convertible"
	if B.Convertible then
		B.RoofStyle = "Convertible"
	end

	B.L = math.max(4, num(b.Length, 15))
	B.W = math.max(1.6, num(b.Width, 6.4))
	B.Belt = math.max(1.2, num(b.Height, 3.3))
	B.Cl = math.clamp(num(b.Clearance, s.RideHeight or 0.6), 0.15, B.Belt - 0.6)
	B.CabH = math.max(0, num(b.CabinHeight, 1.9))
	B.RoofY = B.Belt + B.CabH
	B.Front = -B.L / 2
	B.RearZ = B.L / 2
	B.Inset = math.clamp(num(b.CabinInset, 0.35), 0, B.W / 2 - 0.5)
	B.CabW = B.W - 2 * B.Inset
	B.HoodSlope = math.clamp(num(b.HoodSlope, 0.4), 0, math.max(0, B.Belt - B.Cl - 0.6))
	B.LowTop = B.Belt - B.HoodSlope
	B.RearHeight = math.max(0.5, num(b.RearHeight, 2.5))

	local cabStart = math.clamp(num(b.CabinStart, 0.33), 0.03, 0.85)
	local cabLenFrac = math.clamp(num(b.CabinLength, 0.42), 0.08, 0.97)
	B.ZWs = B.Front + cabStart * B.L
	B.ZCe = math.min(B.RearZ - 0.1, B.ZWs + cabLenFrac * B.L)
	B.CabLen = math.max(1, B.ZCe - B.ZWs)
	local rakeF = math.clamp(num(b.WindshieldRake, 0.3), 0, 0.7) * B.CabLen
	local rakeR = math.clamp(num(b.RearRake, 0.3), 0, 0.7) * B.CabLen
	local maxRake = B.CabLen - 0.8
	if rakeF + rakeR > maxRake and rakeF + rakeR > 0 then
		local k = math.max(0, maxRake) / (rakeF + rakeR)
		rakeF *= k
		rakeR *= k
	end
	B.RakeF, B.RakeR = rakeF, rakeR
	B.ZRoofF = B.ZWs + rakeF
	B.ZRoofR = B.ZCe - rakeR

	-- wheels
	B.R = math.max(0.3, s.WheelRadius or 1.2)
	B.WW = math.max(0.2, num(b.WheelWidth, 0.8))
	B.Wheelbase = s.Wheelbase
	B.Track = s.TrackWidth
	local shift = num(b.WheelShift, 0)
	B.ZF = -s.Wheelbase / 2 + shift
	B.ZR = s.Wheelbase / 2 + shift
	B.Arch = B.R + 0.3
	B.ArchTop = 2 * B.R + 0.15
	B.StripW = math.clamp(B.W / 2 - B.Track / 2 + B.WW / 2 + 0.1, 0.25, math.max(0.25, B.W / 2 - 0.3))
	B.RestDrop = math.clamp((s.SuspensionTravel or 1) * 0.6, 0.35, 1.2)
	B.WheelX = B.Scooter and 0 or B.Track / 2

	-- doors
	local doorsN = features.Doors
	if B.Scooter then
		doorsN = 0
	end
	B.DoorCount = doorsN
	B.Doors = {}
	local function overlapsArch(z0: number, z1: number): boolean
		for _, zc in ipairs({ B.ZF, B.ZR }) do
			if z1 > zc - B.Arch and z0 < zc + B.Arch then
				return true
			end
		end
		return false
	end
	local function addDoor(id: string, side: number, z0: number, z1: number)
		if z1 - z0 < 1 then
			z1 = z0 + 1
		end
		local bottom = B.Cl + 0.3
		if overlapsArch(z0, z1) then
			bottom = math.max(bottom, B.ArchTop + 0.05)
		end
		bottom = math.min(bottom, B.Belt - 0.7)
		local wz0 = math.max(z0, B.ZRoofF) + 0.06
		local wz1 = math.min(z1, B.ZRoofR) - 0.06
		local window = nil
		if B.CabH > 0.4 and wz1 - wz0 > 0.4 then
			window = { Z0 = wz0, Z1 = wz1, Bottom = B.Belt, Top = B.RoofY - 0.14 }
		end
		table.insert(B.Doors, { Id = id, Side = side, Z0 = z0, Z1 = z1, Bottom = bottom, Top = B.Belt, Window = window })
	end
	local frontLimit = B.ZR - B.Arch - 0.05
	if doorsN == 2 then
		local z0 = B.ZWs + 0.12
		local z1 = math.min(z0 + math.max(2.6, B.CabLen * 0.62), math.max(frontLimit, z0 + 1.6))
		addDoor("FL", -1, z0, z1)
		addDoor("FR", 1, z0, z1)
	elseif doorsN == 4 then
		local z0 = B.ZWs + 0.12
		local zB = math.max(z0 + 2.2, B.ZRoofF + (B.ZRoofR - B.ZRoofF) * 0.48)
		local rearEnd = math.min(zB + math.max(2.2, B.ZRoofR - zB), math.max(frontLimit, zB + 1.7))
		if B.RoofStyle == "Cab" then
			rearEnd = math.min(rearEnd, B.ZCe - 0.1)
		end
		addDoor("FL", -1, z0, zB - 0.05)
		addDoor("FR", 1, z0, zB - 0.05)
		addDoor("RL", -1, zB + 0.05, rearEnd)
		addDoor("RR", 1, zB + 0.05, rearEnd)
		B.ZB = zB
	end

	-- seats
	local seatTop = math.clamp(B.RoofY - 3.35, B.Cl + 0.45, math.max(B.Cl + 1.3, B.Belt - 1.6))
	if B.CabH <= 0.4 and not B.Convertible then
		seatTop = B.Belt - 0.4
	end
	B.SeatTop = seatTop
	local frontZ = math.clamp(B.ZRoofF + 0.9, B.ZWs + 1.4, math.max(B.ZWs + 1.4, B.ZCe - 0.8))
	B.FrontSeatZ = frontZ
	local frontX = math.max(0.9, B.CabW / 4 + 0.05)
	B.SeatX = frontX
	B.Seats = {}
	local n = math.max(1, resolved.Seats)
	table.insert(B.Seats, { Name = "DriveSeat", X = -frontX, Z = frontZ, Door = "FL", Driver = true })
	if n >= 2 then
		table.insert(B.Seats, { Name = "Passenger1", X = frontX, Z = frontZ, Door = doorsN > 0 and "FR" or "FL" })
	end
	local remaining = n - 2
	local perRow = B.CabW >= 5.8 and 3 or 2
	local row = 1
	local idx = 2
	local rowLimit = math.max(frontZ + 2.2, B.ZCe - 0.9)
	if B.RoofStyle == "Cab" and (B.Rear == "Bed" or B.Rear == "Tow" or B.Rear == "Dump") then
		rowLimit = math.max(frontZ + 1.9, B.ZCe - 0.8)
	end
	while remaining > 0 do
		local z = math.min(frontZ + 2.6 * row, rowLimit + 2.6 * (row - 1) * 0.15)
		local count = math.min(perRow, remaining)
		for i = 1, count do
			local x
			if count == 1 then
				x = 0
			elseif count == 2 then
				x = (i == 1) and -frontX or frontX
			else
				x = (i - 2) * (B.CabW / 3.2)
			end
			local door
			if doorsN == 4 then
				door = x <= 0 and "RL" or "RR"
			elseif doorsN == 2 then
				door = x <= 0 and "FL" or "FR"
			else
				door = "FL"
			end
			table.insert(B.Seats, { Name = "Passenger" .. idx, X = x, Z = z, Door = door })
			idx += 1
		end
		remaining -= count
		row += 1
	end

	-- chassis collider
	B.ChassisSize = Vector3.new(
		math.max(1, B.W - 0.25),
		math.max(0.6, math.max(B.Cl + 0.8, B.Belt - 0.3) - B.Cl),
		math.max(2, B.L - 0.3)
	)
	B.ChassisCenter = Vector3.new(0, B.Cl + B.ChassisSize.Y / 2, 0)
	return B
end

return CarLayout
