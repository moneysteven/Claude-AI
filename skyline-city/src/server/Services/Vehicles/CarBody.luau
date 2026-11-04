-- CarBody: procedural lower body shell (with wheel arches), hood, trunk / hatch-less rear lids and the
-- special rear modules (pickup bed, box body, fire ladder, dump bed, tow boom).
--
--   CarBody.Build(k: CarKit, B: CarLayout, paint: Color3)
--
-- Hood / Trunk are separate parts joined to the Chassis by a Motor6D named "Hinge" with attributes:
--   OpenAxis ("X" | "Y") and OpenAngle (signed degrees) — CarVisualsController rotates Transform by that.

local CarKit = require(script.Parent.CarKit)

local CarBody = {}

local TRIM = Color3.fromRGB(28, 28, 32)
local DARK = Color3.fromRGB(45, 46, 52)
local METAL = Color3.fromRGB(150, 152, 158)

-- Split [z0, z1] into segments, flagging those inside a wheel arch.
local function archSegments(B, z0: number, z1: number): { { number } }
	local cuts = {}
	for _, zc in ipairs({ B.ZF, B.ZR }) do
		local a0, a1 = zc - B.Arch, zc + B.Arch
		if a1 > z0 and a0 < z1 then
			table.insert(cuts, { math.max(z0, a0), math.min(z1, a1) })
		end
	end
	table.sort(cuts, function(a, b)
		return a[1] < b[1]
	end)
	local out = {}
	local cursor = z0
	for _, c in ipairs(cuts) do
		if c[1] > cursor + 0.01 then
			table.insert(out, { cursor, c[1], 0 })
		end
		table.insert(out, { math.max(cursor, c[1]), c[2], 1 })
		cursor = math.max(cursor, c[2])
	end
	if z1 > cursor + 0.01 then
		table.insert(out, { cursor, z1, 0 })
	end
	return out
end
CarBody.ArchSegments = archSegments

-- Solid painted body block between z0..z1 and y0..y1 with arch cut-outs on both sides.
function CarBody.Section(k, B, folder: Instance, name: string, z0: number, z1: number, y0: number, y1: number, paint: Color3)
	if z1 - z0 < 0.05 or y1 - y0 < 0.05 then
		return
	end
	local coreW = B.W - 2 * B.StripW + 0.02
	if coreW > 0.1 then
		k:Box(folder, name .. "Core", Vector3.new(coreW, y1 - y0, z1 - z0), CFrame.new(0, (y0 + y1) / 2, (z0 + z1) / 2), paint, nil, { Paint = true })
	end
	for _, side in ipairs({ -1, 1 }) do
		local x = side * (B.W / 2 - B.StripW / 2)
		for i, seg in ipairs(archSegments(B, z0, z1)) do
			local sy0 = seg[3] == 1 and math.max(y0, B.ArchTop) or y0
			if y1 - sy0 > 0.05 and seg[2] - seg[1] > 0.02 then
				k:Box(folder, ("%sSide%s%d"):format(name, side < 0 and "L" or "R", i),
					Vector3.new(B.StripW, y1 - sy0, seg[2] - seg[1]),
					CFrame.new(x, (sy0 + y1) / 2, (seg[1] + seg[2]) / 2), paint, nil, { Paint = true })
			end
			if seg[3] == 1 and sy0 > y0 then
				-- dark wheel-well liner under the arch top
				k:Box(folder, name .. "Liner", Vector3.new(B.StripW - 0.05, 0.08, seg[2] - seg[1]),
					CFrame.new(x, sy0 - 0.04, (seg[1] + seg[2]) / 2), TRIM, nil, { Shadow = false })
			end
		end
	end
end

-- Cabin floor height (shared with CarRig for the seat pedestals).
function CarBody.FloorY(B): number
	return math.min(math.max(B.SeatTop - 1.0, B.Cl + 0.2), B.Belt - 0.6)
end

-- Hollow passenger tub between z0..z1: floor at FloorY, thin side walls up to the beltline, wheel tubs
-- where the cabin overlaps a wheel arch. Seats sit inside it so occupants are visible.
function CarBody.Tub(k, B, folder: Instance, name: string, z0: number, z1: number, paint: Color3)
	if z1 - z0 < 0.3 then
		return
	end
	local floorY = CarBody.FloorY(B)
	-- thick enough that a lowered door window (which sits at the greenhouse edge) disappears into it
	local wallT = math.min(math.max(0.36, B.Inset + 0.14), B.StripW, 0.85)
	CarBody.Section(k, B, folder, name .. "Floor", z0, z1, B.Cl, floorY, paint)
	k:Box(folder, name .. "Carpet", Vector3.new(B.W - 2 * wallT - 0.04, 0.05, z1 - z0), CFrame.new(0, floorY + 0.025, (z0 + z1) / 2), Color3.fromRGB(38, 38, 42), Enum.Material.Fabric, { Shadow = false })
	for _, side in ipairs({ -1, 1 }) do
		local x = side * (B.W / 2 - wallT / 2)
		for i, seg in ipairs(archSegments(B, z0, z1)) do
			local sy0 = seg[3] == 1 and math.max(floorY, B.ArchTop) or floorY
			if B.Belt - sy0 > 0.05 and seg[2] - seg[1] > 0.02 then
				k:Box(folder, ("%sWall%s%d"):format(name, side < 0 and "L" or "R", i), Vector3.new(wallT, B.Belt - sy0, seg[2] - seg[1]),
					CFrame.new(x, (sy0 + B.Belt) / 2, (seg[1] + seg[2]) / 2), paint, nil, { Paint = true })
			end
			if seg[3] == 1 and B.ArchTop > floorY then
				local tubW = math.max(0.2, B.StripW - wallT + 0.12)
				k:Box(folder, name .. "WheelTub", Vector3.new(tubW, B.ArchTop - floorY + 0.1, seg[2] - seg[1]),
					CFrame.new(side * (B.W / 2 - wallT - tubW / 2), (floorY + B.ArchTop + 0.1) / 2, (seg[1] + seg[2]) / 2), Color3.fromRGB(38, 38, 42), Enum.Material.Fabric)
			end
		end
		-- door-card trim on the inside of the wall
		k:Box(folder, name .. "Trim", Vector3.new(0.04, 0.12, z1 - z0), CFrame.new(side * (B.W / 2 - wallT - 0.02), B.Belt - 0.06, (z0 + z1) / 2), Color3.fromRGB(44, 44, 50), nil, { Shadow = false })
	end
end

-- Body block from z0 to zEnd with a hollow cabin tub in the middle.
local function cabinBlock(k, B, folder: Instance, z0: number, zEnd: number, tubEnd: number, paint: Color3)
	local tz0 = math.min(B.ZWs + math.min(1.0, B.CabLen * 0.25), zEnd)
	local tz1 = math.clamp(tubEnd, tz0, zEnd)
	CarBody.Section(k, B, folder, "Firewall", z0, tz0, B.Cl, B.Belt, paint)
	if B.CabH > 0.3 or B.Convertible then
		CarBody.Tub(k, B, folder, "Cabin", tz0, tz1, paint)
	else
		CarBody.Section(k, B, folder, "Cabin", tz0, tz1, B.Cl, B.Belt, paint)
	end
	CarBody.Section(k, B, folder, "RearBlock", tz1, zEnd, B.Cl, B.Belt, paint)
end

-- Side walls only (pickup bed / dump bed) with arch cut-outs.
local function walls(k, B, folder: Instance, name: string, z0: number, z1: number, y0: number, y1: number, thick: number, paint: Color3, xHalf: number?)
	local half = xHalf or (B.W / 2)
	for _, side in ipairs({ -1, 1 }) do
		local x = side * (half - thick / 2)
		for i, seg in ipairs(archSegments(B, z0, z1)) do
			local sy0 = seg[3] == 1 and math.max(y0, B.ArchTop) or y0
			if y1 - sy0 > 0.05 and seg[2] - seg[1] > 0.02 then
				k:Box(folder, ("%s%s%d"):format(name, side < 0 and "L" or "R", i), Vector3.new(thick, y1 - sy0, seg[2] - seg[1]),
					CFrame.new(x, (sy0 + y1) / 2, (seg[1] + seg[2]) / 2), paint, nil, { Paint = true })
			end
		end
	end
end

local function hinge(k, part: BasePart, hingeCF: CFrame, axis: string, angle: number)
	local m = CarKit.Motor("Hinge", k.Chassis, part, hingeCF, part)
	m:SetAttribute("OpenAxis", axis)
	m:SetAttribute("OpenAngle", angle)
	return m
end
CarBody.Hinge = hinge

---------------------------------------------------------------------------
-- Rear modules
---------------------------------------------------------------------------
local function rearBed(k, B, body: Instance, paint: Color3)
	local bedFloor = math.min(B.Belt - 1.0, B.Cl + 0.9)
	CarBody.Section(k, B, body, "BedBase", B.ZCe, B.RearZ, B.Cl, bedFloor, paint)
	local z0, z1 = B.ZCe + 0.1, B.RearZ - 0.22
	walls(k, B, body, "BedWall", z0, z1, bedFloor, B.Belt, 0.26, paint)
	k:Box(body, "BedFront", Vector3.new(B.W - 0.1, B.Belt - bedFloor, 0.24), CFrame.new(0, (bedFloor + B.Belt) / 2, z0), paint, nil, { Paint = true })
	k:Box(body, "BedLiner", Vector3.new(B.W - 0.6, 0.06, z1 - z0 - 0.2), CFrame.new(0, bedFloor + 0.03, (z0 + z1) / 2), TRIM)
	-- wheel tubs inside the bed
	if B.ArchTop > bedFloor then
		for _, side in ipairs({ -1, 1 }) do
			k:Box(body, "BedTub", Vector3.new(B.StripW + 0.2, B.ArchTop - bedFloor + 0.1, B.Arch * 2),
				CFrame.new(side * (B.W / 2 - (B.StripW + 0.2) / 2 - 0.2), (bedFloor + B.ArchTop + 0.1) / 2, B.ZR), TRIM)
		end
	end
	-- caps on top of the walls
	for _, side in ipairs({ -1, 1 }) do
		k:Box(body, "BedRail", Vector3.new(0.34, 0.08, z1 - z0), CFrame.new(side * (B.W / 2 - 0.17), B.Belt + 0.04, (z0 + z1) / 2), TRIM)
	end
	-- tailgate (Trunk): hinged at the bottom, drops backwards
	local h = B.Belt - bedFloor
	local tg = k:Box(k.Model, "Trunk", Vector3.new(B.W - 0.55, h, 0.22), CFrame.new(0, bedFloor + h / 2, B.RearZ - 0.11), paint, nil, { Paint = true, NoWeld = true })
	hinge(k, tg, CFrame.new(0, bedFloor, B.RearZ - 0.11), "X", 88)
	k:Box(tg, "TailgateHandle", Vector3.new(0.9, 0.18, 0.06), CFrame.new(0, B.Belt - 0.35, B.RearZ + 0.02), TRIM, nil, { WeldTo = tg })
end

local function rearBox(k, B, body: Instance, paint: Color3)
	cabinBlock(k, B, body, B.ZWs, B.RearZ, B.ZCe - 0.1, paint)
	local z0, z1 = B.ZCe + 0.15, B.RearZ
	local top = B.Belt + B.RearHeight
	k:Box(body, "BoxBody", Vector3.new(B.W, B.RearHeight, z1 - z0), CFrame.new(0, (B.Belt + top) / 2, (z0 + z1) / 2), paint, nil, { Paint = true, CanCollide = true })
	k:Box(body, "BoxRoofTrim", Vector3.new(B.W + 0.1, 0.12, z1 - z0 + 0.1), CFrame.new(0, top + 0.06, (z0 + z1) / 2), TRIM)
	-- side windows on the box
	for _, side in ipairs({ -1, 1 }) do
		k:Box(body, "BoxWindow", Vector3.new(0.06, 0.9, 1.6), CFrame.new(side * (B.W / 2 + 0.02), top - 0.9, z0 + 1.8),
			Color3.fromRGB(40, 52, 64), nil, { Glass = true, Transparency = 0.3 })
	end
	-- rear doors (Trunk): hinged at the top, swing up and back
	local doorTop = top - 0.2
	local doorBottom = B.Cl + 0.45
	local d = k:Box(k.Model, "Trunk", Vector3.new(B.W - 0.5, doorTop - doorBottom, 0.16), CFrame.new(0, (doorTop + doorBottom) / 2, B.RearZ + 0.08), paint, nil, { Paint = true, NoWeld = true })
	hinge(k, d, CFrame.new(0, doorTop, B.RearZ + 0.08), "X", -82)
	k:Box(d, "RearDoorSplit", Vector3.new(0.06, doorTop - doorBottom - 0.1, 0.04), CFrame.new(0, (doorTop + doorBottom) / 2, B.RearZ + 0.17), TRIM, nil, { WeldTo = d })
	k:Box(d, "RearDoorGlass", Vector3.new(B.W - 1.6, 0.9, 0.04), CFrame.new(0, doorTop - 0.8, B.RearZ + 0.17), Color3.fromRGB(40, 52, 64), nil, { WeldTo = d, Glass = true, Transparency = 0.3 })
	return top
end

local function rearLadder(k, B, body: Instance, paint: Color3)
	cabinBlock(k, B, body, B.ZWs, B.RearZ, B.ZCe - 0.1, paint)
	local z0, z1 = B.ZCe + 0.1, B.RearZ
	local equipTop = B.Belt + B.RearHeight * 0.55
	k:Box(body, "EquipmentBody", Vector3.new(B.W, equipTop - B.Belt, z1 - z0), CFrame.new(0, (B.Belt + equipTop) / 2, (z0 + z1) / 2), paint, nil, { Paint = true, CanCollide = true })
	-- roller-shutter lockers
	for _, side in ipairs({ -1, 1 }) do
		local n = math.max(2, math.floor((z1 - z0) / 3))
		for i = 1, n do
			local zc = z0 + (i - 0.5) * (z1 - z0) / n
			k:Box(body, "Locker", Vector3.new(0.05, (equipTop - B.Belt) * 0.8 + 1.4, (z1 - z0) / n - 0.35),
				CFrame.new(side * (B.W / 2 + 0.03), (B.Belt + equipTop) / 2 - 0.6, zc), METAL, Enum.Material.DiamondPlate)
		end
	end
	-- turntable + ladder
	local base = k:Cylinder(body, "LadderTurntable", 0.5, 2.6, CFrame.new(0, equipTop + 0.25, z1 - 2.2) * CFrame.Angles(0, 0, math.pi / 2), DARK)
	base:SetAttribute("Turntable", true)
	local lz0, lz1 = z1 - 1.6, z0 + 0.6
	local ly0, ly1 = equipTop + 0.6, equipTop + 1.2
	for _, side in ipairs({ -1, 1 }) do
		k:Beam(body, "LadderRail", Vector3.new(side * 0.85, ly0, lz0), Vector3.new(side * 0.85, ly1, lz1), 0.18, 0.3, METAL, Enum.Material.Metal)
	end
	local rungs = math.floor(math.abs(lz1 - lz0) / 1.1)
	for i = 1, rungs do
		local t = i / (rungs + 1)
		local y = ly0 + (ly1 - ly0) * t
		local z = lz0 + (lz1 - lz0) * t
		k:Box(body, "LadderRung", Vector3.new(1.7, 0.1, 0.1), CFrame.new(0, y, z), METAL, Enum.Material.Metal)
	end
	-- small rear locker (Trunk)
	local top, bottom = B.Belt + 0.6, B.Cl + 0.6
	local d = k:Box(k.Model, "Trunk", Vector3.new(B.W - 1.2, top - bottom, 0.14), CFrame.new(0, (top + bottom) / 2, B.RearZ + 0.07), METAL, Enum.Material.DiamondPlate, { NoWeld = true })
	hinge(k, d, CFrame.new(0, top, B.RearZ + 0.07), "X", -80)
	return equipTop + 1.2
end

local function rearDump(k, B, body: Instance, paint: Color3)
	cabinBlock(k, B, body, B.ZWs, B.ZCe, B.ZCe - 0.1, paint)
	local floorY = math.max(B.Cl + 0.9, B.ArchTop + 0.1)
	local z0, z1 = B.ZCe + 0.35, B.RearZ
	-- frame rails
	for _, side in ipairs({ -1, 1 }) do
		k:Box(body, "FrameRail", Vector3.new(0.5, floorY - B.Cl, z1 - B.ZCe), CFrame.new(side * (B.Track / 2 - B.WW - 0.4), (B.Cl + floorY) / 2, (B.ZCe + z1) / 2), TRIM)
	end
	local top = floorY + B.RearHeight
	k:Box(body, "DumpFloor", Vector3.new(B.W, 0.3, z1 - z0), CFrame.new(0, floorY + 0.15, (z0 + z1) / 2), METAL, Enum.Material.DiamondPlate, { CanCollide = true })
	for _, side in ipairs({ -1, 1 }) do
		k:Box(body, "DumpWall", Vector3.new(0.25, top - floorY, z1 - z0), CFrame.new(side * (B.W / 2 - 0.125), (floorY + top) / 2, (z0 + z1) / 2), paint, nil, { Paint = true, CanCollide = true })
		-- ribs
		for i = 1, 4 do
			local z = z0 + (z1 - z0) * i / 5
			k:Box(body, "DumpRib", Vector3.new(0.12, top - floorY, 0.2), CFrame.new(side * (B.W / 2 + 0.06), (floorY + top) / 2, z), paint, nil, { Paint = true })
		end
	end
	k:Box(body, "DumpHeadboard", Vector3.new(B.W, top - floorY + 0.8, 0.3), CFrame.new(0, (floorY + top + 0.8) / 2, z0), paint, nil, { Paint = true, CanCollide = true })
	k:Box(body, "DumpCanopy", Vector3.new(B.W, 0.2, 1.6), CFrame.new(0, top + 0.7, z0 - 0.6), paint, nil, { Paint = true })
	local tg = k:Box(k.Model, "Trunk", Vector3.new(B.W - 0.5, top - floorY - 0.3, 0.2), CFrame.new(0, (floorY + top) / 2 + 0.15, z1 - 0.1), paint, nil, { Paint = true, NoWeld = true })
	hinge(k, tg, CFrame.new(0, top, z1 - 0.1), "X", -55)
	return top
end

local function rearTow(k, B, body: Instance, paint: Color3)
	cabinBlock(k, B, body, B.ZWs, B.ZCe, B.ZCe - 0.1, paint)
	local deckTop = B.Belt - 0.9
	CarBody.Section(k, B, body, "TowDeck", B.ZCe, B.RearZ, B.Cl, deckTop, paint)
	k:Box(body, "TowDeckPlate", Vector3.new(B.W - 0.3, 0.06, B.RearZ - B.ZCe - 0.2), CFrame.new(0, deckTop + 0.03, (B.ZCe + B.RearZ) / 2), METAL, Enum.Material.DiamondPlate)
	-- boom
	local boomBase = Vector3.new(0, deckTop, B.RearZ - 2.4)
	local boomTip = Vector3.new(0, deckTop + 3.4, B.RearZ + 0.6)
	k:Beam(body, "TowBoom", boomBase, boomTip, 0.6, 0.6, Color3.fromRGB(30, 30, 30), Enum.Material.Metal)
	k:Box(body, "TowBoomBase", Vector3.new(1.6, 0.8, 1.4), CFrame.new(0, deckTop + 0.4, B.RearZ - 2.4), Color3.fromRGB(30, 30, 30), Enum.Material.Metal)
	k:Beam(body, "TowCable", boomTip, boomTip - Vector3.new(0, 2.2, 0), 0.08, 0.08, Color3.fromRGB(20, 20, 20))
	k:Box(body, "TowHook", Vector3.new(0.3, 0.4, 0.1), CFrame.new(boomTip - Vector3.new(0, 2.4, 0)), METAL, Enum.Material.Metal)
	-- under-lift
	k:Box(body, "UnderLift", Vector3.new(B.W - 1.0, 0.3, 0.5), CFrame.new(0, B.Cl + 0.3, B.RearZ + 0.9), Color3.fromRGB(30, 30, 30), Enum.Material.Metal)
	k:Box(body, "UnderLiftArm", Vector3.new(0.4, 0.3, 1.2), CFrame.new(0, B.Cl + 0.3, B.RearZ + 0.3), Color3.fromRGB(30, 30, 30), Enum.Material.Metal)
	-- tool box behind the cab, its lid is the Trunk
	local tbZ = B.ZCe + 0.9
	local tbH = 0.9
	k:Box(body, "ToolBox", Vector3.new(B.W - 0.6, tbH, 1.4), CFrame.new(0, deckTop + tbH / 2, tbZ), METAL, Enum.Material.DiamondPlate)
	local lid = k:Box(k.Model, "Trunk", Vector3.new(B.W - 0.5, 0.12, 1.45), CFrame.new(0, deckTop + tbH + 0.06, tbZ), METAL, Enum.Material.DiamondPlate, { NoWeld = true })
	hinge(k, lid, CFrame.new(0, deckTop + tbH + 0.06, tbZ - 0.72), "X", -70)
	return deckTop + 3.4
end

---------------------------------------------------------------------------
-- Build
---------------------------------------------------------------------------
function CarBody.Build(k, B, paint: Color3)
	local body = k:Folder("Body")

	-- front section + sloped bonnet base
	CarBody.Section(k, B, body, "Front", B.Front, B.ZWs, B.Cl, B.LowTop, paint)
	if B.HoodSlope > 0.05 and B.ZWs - B.Front > 0.3 then
		k:Wedge(body, "HoodBase", Vector3.new(B.W, B.HoodSlope, B.ZWs - B.Front), CFrame.new(0, B.LowTop + B.HoodSlope / 2, (B.Front + B.ZWs) / 2), paint, nil, { Paint = true })
	end

	local rear = B.Rear
	if rear == "Bed" then
		cabinBlock(k, B, body, B.ZWs, B.ZCe, B.ZCe - 0.1, paint)
		rearBed(k, B, body, paint)
	elseif rear == "Box" then
		B.TopY = rearBox(k, B, body, paint)
	elseif rear == "Ladder" then
		B.TopY = rearLadder(k, B, body, paint)
	elseif rear == "Dump" then
		B.TopY = rearDump(k, B, body, paint)
	elseif rear == "Tow" then
		B.TopY = rearTow(k, B, body, paint)
	else
		cabinBlock(k, B, body, B.ZWs, B.RearZ, (rear == "Hatch") and (B.RearZ - 0.35) or B.ZCe, paint)
		if rear == "Trunk" or rear == "Engine" then
			local z0, z1 = B.ZCe + 0.1, B.RearZ - 0.3
			if z1 - z0 > 0.5 then
				local lid = k:Box(k.Model, "Trunk", Vector3.new(B.W - 0.5, 0.14, z1 - z0), CFrame.new(0, B.Belt + 0.07, (z0 + z1) / 2), paint, nil, { Paint = true, NoWeld = true })
				hinge(k, lid, CFrame.new(0, B.Belt + 0.07, z0), "X", -62)
				if rear == "Engine" then
					local slats = math.max(2, math.floor((z1 - z0) / 0.45))
					for i = 1, slats do
						local z = z0 + (i - 0.5) * (z1 - z0) / slats
						k:Box(lid, "Louvre", Vector3.new(B.W - 1.4, 0.05, 0.16), CFrame.new(0, B.Belt + 0.165, z), TRIM, nil, { WeldTo = lid, Shadow = false })
					end
				end
			end
		end
	end

	-- hood (bonnet), hinged at the windshield end
	local hoodLen = B.ZWs - B.Front - 0.4
	if hoodLen > 0.8 then
		local p0 = Vector3.new(0, B.LowTop + 0.09, B.Front + 0.32)
		local p1 = Vector3.new(0, B.Belt + 0.09, B.ZWs - 0.08)
		local hood = k:Beam(k.Model, "Hood", p0, p1, B.W - 0.45, 0.16, paint, nil, { Paint = true, NoWeld = true })
		hinge(k, hood, CFrame.new(p1), "X", 50)
		if B.Extras.Scoop then
			local mid = (p0 + p1) / 2
			k:Box(hood, "Scoop", Vector3.new(1.4, 0.3, 1.6), CFrame.new(mid + Vector3.new(0, 0.2, 0)), paint, nil, { WeldTo = hood, Paint = true })
			k:Box(hood, "ScoopMouth", Vector3.new(1.1, 0.18, 0.05), CFrame.new(mid + Vector3.new(0, 0.22, -0.82)), TRIM, nil, { WeldTo = hood })
		end
	end

	-- underbody / sills
	k:Box(body, "Underbody", Vector3.new(B.W - 0.4, 0.12, B.L - 0.8), CFrame.new(0, B.Cl + 0.06, 0), TRIM, nil, { Shadow = false })
	return body
end

return CarBody
