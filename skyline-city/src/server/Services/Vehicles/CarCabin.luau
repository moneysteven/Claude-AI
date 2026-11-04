-- CarCabin: the greenhouse — windshield, pillars, roof (with optional sliding Sunroof), rear glass
-- (or the hatch, which is the "Trunk" on hatchbacks / SUVs / vans), fixed side glass, the folding
-- convertible "Roof" model, and the Doors (each a Model with a "Door" part on a "Hinge" Motor6D and a
-- "Window" part on a "WindowMotor" Motor6D).
--
--   CarCabin.Build(k: CarKit, B: CarLayout, paint: Color3)
--
-- Motor attributes read by CarVisualsController:
--   Hinge: OpenAxis ("X"|"Y"), OpenAngle (signed deg)   WindowMotor: Drop (studs)
--   Slide: SlideDistance (studs), Lift (studs)           Fold: FoldAngle (deg)

local CarKit = require(script.Parent.CarKit)
local CarBody = require(script.Parent.CarBody)

local CarCabin = {}

local TRIM = Color3.fromRGB(28, 28, 32)
local GLASS = Color3.fromRGB(40, 52, 64)
local CANVAS = Color3.fromRGB(32, 32, 36)

local function glass(k, parent: Instance, name: string, p0: Vector3, p1: Vector3, width: number, opts: { [string]: any }?)
	local o = { Glass = true, Transparency = 0.5 }
	if opts then
		for key, v in pairs(opts) do
			o[key] = v
		end
	end
	return k:Beam(parent, name, p0, p1, width, 0.1, GLASS, Enum.Material.Glass, o)
end

-- Fixed side glass for the parts of the greenhouse side not covered by door windows.
local function sideGlass(k, B, body: Instance, side: number)
	local x = side * (B.CabW / 2 - 0.05)
	local h = B.CabH - 0.14
	if h <= 0.2 then
		return
	end
	local yMid = B.Belt + h / 2
	if B.RakeF > 0.2 then
		k:Wedge(body, "QuarterGlassFront", Vector3.new(0.08, h, B.RakeF), CFrame.new(x, yMid, B.ZWs + B.RakeF / 2), GLASS, nil, { Glass = true })
	end
	if B.RakeR > 0.2 and B.RoofStyle ~= "Cab" then
		k:Wedge(body, "QuarterGlassRear", Vector3.new(0.08, h, B.RakeR), CFrame.new(x, yMid, B.ZRoofR + B.RakeR / 2) * CFrame.Angles(0, math.pi, 0), GLASS, nil, { Glass = true })
	end
	-- rectangles between zRoofF..zRoofR not covered by door windows
	local covered = {}
	for _, d in ipairs(B.Doors) do
		if d.Side == side and d.Window then
			table.insert(covered, { d.Window.Z0 - 0.06, d.Window.Z1 + 0.06 })
		end
	end
	table.sort(covered, function(a, b)
		return a[1] < b[1]
	end)
	local cursor = B.ZRoofF
	local gaps = {}
	for _, c in ipairs(covered) do
		if c[1] > cursor + 0.3 then
			table.insert(gaps, { cursor, c[1] })
		end
		cursor = math.max(cursor, c[2])
	end
	if B.ZRoofR > cursor + 0.3 then
		table.insert(gaps, { cursor, B.ZRoofR })
	end
	for _, g in ipairs(gaps) do
		k:Box(body, "SideGlass", Vector3.new(0.08, h, g[2] - g[1]), CFrame.new(x, yMid, (g[1] + g[2]) / 2), GLASS, nil, { Glass = true })
	end
end

local function roof(k, B, paint: Color3, body: Instance)
	local len = B.ZRoofR - B.ZRoofF
	if len <= 0.2 then
		return
	end
	local y = B.RoofY - 0.1
	local zMid = (B.ZRoofF + B.ZRoofR) / 2
	local wantsSunroof = B.Features.Sunroof and len > 2.2 and B.CabW > 3
	if not wantsSunroof then
		k:Box(body, "Roof", Vector3.new(B.CabW, 0.2, len), CFrame.new(0, y, zMid), paint, nil, { Paint = true, CanCollide = true })
		return
	end
	local holeLen = len * 0.38
	local holeW = B.CabW * 0.62
	local h0 = B.ZRoofF + len * 0.16
	local h1 = h0 + holeLen
	k:Box(body, "RoofFront", Vector3.new(B.CabW, 0.2, h0 - B.ZRoofF), CFrame.new(0, y, (B.ZRoofF + h0) / 2), paint, nil, { Paint = true, CanCollide = true })
	k:Box(body, "RoofRear", Vector3.new(B.CabW, 0.2, B.ZRoofR - h1), CFrame.new(0, y, (h1 + B.ZRoofR) / 2), paint, nil, { Paint = true, CanCollide = true })
	local sideW = (B.CabW - holeW) / 2
	for _, side in ipairs({ -1, 1 }) do
		k:Box(body, "RoofSide", Vector3.new(sideW, 0.2, holeLen), CFrame.new(side * (holeW / 2 + sideW / 2), y, (h0 + h1) / 2), paint, nil, { Paint = true, CanCollide = true })
	end
	-- the sliding glass panel
	local sunroof = k:Box(k.Model, "Sunroof", Vector3.new(holeW - 0.06, 0.08, holeLen - 0.06), CFrame.new(0, B.RoofY - 0.06, (h0 + h1) / 2), GLASS, Enum.Material.Glass, { Glass = true, Transparency = 0.35, NoWeld = true })
	local slide = CarKit.Motor("Slide", k.Chassis, sunroof, CFrame.new(0, B.RoofY - 0.06, (h0 + h1) / 2), sunroof)
	slide:SetAttribute("SlideDistance", holeLen * 0.85)
	slide:SetAttribute("Lift", 0.16)
	k:Box(body, "SunroofLiner", Vector3.new(holeW + 0.1, 0.04, holeLen + 0.1), CFrame.new(0, B.RoofY - 0.22, (h0 + h1) / 2), TRIM, nil, { Transparency = 1, Shadow = false })
end

local function convertibleRoof(k, B)
	local len = B.ZRoofR - B.ZRoofF
	if len <= 0.3 or B.CabH <= 0.3 then
		return
	end
	local roofModel = k:ModelFolder("Roof")
	local y = B.RoofY - 0.08
	local base = k:Box(roofModel, "RoofBase", Vector3.new(B.CabW - 0.1, 0.16, len), CFrame.new(0, y, (B.ZRoofF + B.ZRoofR) / 2), CANVAS, Enum.Material.Fabric, { NoWeld = true, CanCollide = true })
	local fold = CarKit.Motor("Fold", k.Chassis, base, CFrame.new(0, B.Belt, B.ZCe), base)
	fold:SetAttribute("FoldAngle", 172)
	roofModel.PrimaryPart = base
	local opts = { WeldTo = base }
	-- rear canvas with a small window
	k:Beam(roofModel, "RoofRearCanvas", Vector3.new(0, y, B.ZRoofR), Vector3.new(0, B.Belt + 0.06, B.ZCe), B.CabW - 0.1, 0.14, CANVAS, Enum.Material.Fabric, opts)
	local gy0 = B.Belt + B.CabH * 0.35
	local gy1 = B.Belt + B.CabH * 0.8
	local t0 = (B.RoofY - gy1) / math.max(0.1, B.CabH)
	local t1 = (B.RoofY - gy0) / math.max(0.1, B.CabH)
	local z0 = B.ZRoofR + (B.ZCe - B.ZRoofR) * t0
	local z1 = B.ZRoofR + (B.ZCe - B.ZRoofR) * t1
	glass(k, roofModel, "RoofRearGlass", Vector3.new(0, gy1, z0 + 0.06), Vector3.new(0, gy0, z1 + 0.06), B.CabW * 0.5, { WeldTo = base, Transparency = 0.35 })
	-- canvas side panels behind the door windows
	for _, side in ipairs({ -1, 1 }) do
		local x = side * (B.CabW / 2 - 0.06)
		local h = B.CabH - 0.14
		local lastWindow = B.ZRoofF
		for _, d in ipairs(B.Doors) do
			if d.Side == side and d.Window then
				lastWindow = math.max(lastWindow, d.Window.Z1 + 0.06)
			end
		end
		if B.ZRoofR - lastWindow > 0.3 then
			k:Box(roofModel, "RoofSideCanvas", Vector3.new(0.1, h, B.ZRoofR - lastWindow), CFrame.new(x, B.Belt + h / 2, (lastWindow + B.ZRoofR) / 2), CANVAS, Enum.Material.Fabric, opts)
		end
		if B.RakeR > 0.2 then
			k:Wedge(roofModel, "RoofSideRear", Vector3.new(0.1, h, B.RakeR), CFrame.new(x, B.Belt + h / 2, B.ZRoofR + B.RakeR / 2) * CFrame.Angles(0, math.pi, 0), CANVAS, Enum.Material.Fabric, opts)
		end
	end
	-- the folded-down tonneau cover (visible when the roof is open)
	k:Box(k:Folder("Body"), "Tonneau", Vector3.new(B.CabW - 0.2, 0.06, math.max(0.4, math.min(2, B.RearZ - B.ZCe - 0.4))), CFrame.new(0, B.Belt + 0.04, B.ZCe + 0.9), CANVAS, Enum.Material.Fabric, { Shadow = false })
end

local function doors(k, B, paint: Color3)
	if #B.Doors == 0 then
		return
	end
	local folder = k:Folder("Doors")
	for _, d in ipairs(B.Doors) do
		local model = k:ModelFolder(d.Id, folder)
		local x = d.Side * (B.W / 2 + 0.07)
		local h = d.Top - d.Bottom
		local len = d.Z1 - d.Z0 - 0.06
		local cf = CFrame.new(x, d.Bottom + h / 2, (d.Z0 + d.Z1) / 2)
		local door = k:Box(model, "Door", Vector3.new(0.14, h, len), cf, paint, nil, { Paint = true, NoWeld = true })
		model.PrimaryPart = door
		local hingeMotor = CarKit.Motor("Hinge", k.Chassis, door, CFrame.new(x, d.Bottom + h / 2, d.Z0), door)
		hingeMotor:SetAttribute("OpenAxis", "Y")
		hingeMotor:SetAttribute("OpenAngle", d.Side * 68)
		local o = { WeldTo = door }
		k:Box(model, "Handle", Vector3.new(0.08, 0.14, 0.55), CFrame.new(x + d.Side * 0.09, d.Top - 0.45, d.Z1 - 0.6), TRIM, nil, o)
		k:Box(model, "Seam", Vector3.new(0.02, h - 0.1, 0.04), CFrame.new(x + d.Side * 0.075, d.Bottom + h / 2, d.Z1 - 0.06), TRIM, nil, { WeldTo = door, Shadow = false })
		k:Box(model, "InnerPanel", Vector3.new(0.06, h - 0.2, len - 0.2), CFrame.new(x - d.Side * 0.1, d.Bottom + h / 2, (d.Z0 + d.Z1) / 2), Color3.fromRGB(44, 44, 50), nil, o)
		if d.Window then
			local w = d.Window
			local wh = w.Top - w.Bottom
			local wcf = CFrame.new(d.Side * (B.CabW / 2 - 0.05), w.Bottom + wh / 2, (w.Z0 + w.Z1) / 2)
			local win = k:Box(model, "Window", Vector3.new(0.08, wh, w.Z1 - w.Z0), wcf, GLASS, Enum.Material.Glass, { Glass = true, NoWeld = true })
			local wm = CarKit.Motor("WindowMotor", door, win, wcf, win)
			wm:SetAttribute("Drop", math.max(0.2, math.min(wh - 0.05, B.Belt - d.Bottom - 0.1)))
		end
	end
end

function CarCabin.Build(k, B, paint: Color3)
	local body = k:Folder("Body")
	doors(k, B, paint)
	if B.CabH <= 0.3 then
		return
	end
	local half = B.CabW / 2

	-- windshield + A pillars + header
	glass(k, body, "Windshield", Vector3.new(0, B.Belt + 0.02, B.ZWs), Vector3.new(0, B.RoofY - 0.06, B.ZRoofF), B.CabW - 0.25)
	for _, side in ipairs({ -1, 1 }) do
		k:Beam(body, "APillar", Vector3.new(side * (half - 0.08), B.Belt, B.ZWs), Vector3.new(side * (half - 0.08), B.RoofY - 0.05, B.ZRoofF), 0.2, 0.2, paint, nil, { Paint = true })
	end
	k:Box(body, "Header", Vector3.new(B.CabW, 0.16, 0.3), CFrame.new(0, B.RoofY - 0.08, B.ZRoofF), paint, nil, { Paint = true })

	if B.Convertible then
		convertibleRoof(k, B)
	else
		roof(k, B, paint, body)
		-- rear: glass, hatch or cab wall
		if B.RoofStyle == "Cab" then
			local wallH = B.CabH
			k:Box(body, "CabRearWall", Vector3.new(B.CabW, wallH, 0.2), CFrame.new(0, B.Belt + wallH / 2, B.ZCe - 0.1), paint, nil, { Paint = true, CanCollide = true })
			k:Box(body, "CabRearGlass", Vector3.new(math.max(0.5, B.CabW - 1.4), wallH * 0.45, 0.06), CFrame.new(0, B.Belt + wallH * 0.58, B.ZCe + 0.03), GLASS, nil, { Glass = true })
			if B.ZCe - B.ZRoofR > 0.05 then
				k:Box(body, "RoofExtension", Vector3.new(B.CabW, 0.2, B.ZCe - B.ZRoofR), CFrame.new(0, B.RoofY - 0.1, (B.ZRoofR + B.ZCe) / 2), paint, nil, { Paint = true })
			end
		elseif B.Rear == "Hatch" then
			local top = Vector3.new(0, B.RoofY - 0.05, B.ZRoofR)
			local bottom = Vector3.new(0, B.Belt + 0.02, B.ZCe)
			local hatch = glass(k, k.Model, "Trunk", top, bottom, B.CabW - 0.2, { NoWeld = true, Transparency = 0.45 })
			CarBody.Hinge(k, hatch, CFrame.new(top), "X", -75)
			k:Beam(hatch, "HatchFrame", top + Vector3.new(0, 0.02, 0.05), top + (bottom - top) * 0.08 + Vector3.new(0, 0.02, 0.05), B.CabW - 0.1, 0.12, paint, nil, { WeldTo = hatch, Paint = true })
		else
			glass(k, body, "RearGlass", Vector3.new(0, B.RoofY - 0.06, B.ZRoofR), Vector3.new(0, B.Belt + 0.02, B.ZCe), B.CabW - 0.25)
		end
		-- C pillars
		if B.RoofStyle ~= "Cab" and B.RakeR > 0.05 then
			for _, side in ipairs({ -1, 1 }) do
				k:Beam(body, "CPillar", Vector3.new(side * (half - 0.08), B.RoofY - 0.05, B.ZRoofR), Vector3.new(side * (half - 0.08), B.Belt, B.ZCe), 0.22, 0.22, paint, nil, { Paint = true })
			end
		end
		-- B pillars on four-door cars
		if B.ZB then
			for _, side in ipairs({ -1, 1 }) do
				k:Box(body, "BPillar", Vector3.new(0.14, B.CabH, 0.22), CFrame.new(side * (half - 0.03), B.Belt + B.CabH / 2, B.ZB), TRIM)
			end
		end
	end

	for _, side in ipairs({ -1, 1 }) do
		sideGlass(k, B, body, side)
	end
	-- window line trim on the body shoulder
	for _, side in ipairs({ -1, 1 }) do
		k:Box(body, "BeltTrim", Vector3.new(0.12, 0.06, B.ZCe - B.ZWs), CFrame.new(side * (half + 0.02), B.Belt + 0.03, (B.ZWs + B.ZCe) / 2), TRIM, nil, { Shadow = false })
	end
end

return CarCabin
