-- CarDetails: lights (ARCHITECTURE §9 names), bumpers, grille, brand badges, licence plates, mirrors,
-- interior (dashboard, steering wheel), body extras and job-vehicle roof equipment (light bar, roof sign).
--
--   CarDetails.Build(k: CarKit, B: CarLayout, paint: Color3)
--   CarDetails.MakeBadge(k, parent, name, size, cf, face, brandId) / CarDetails.MakePlate(k, parent, name, cf, face)
--
-- Every lamp part carries attributes OnColor / OffColor (Color3) and LampKind
-- ("Head" | "Tail" | "Brake" | "Indicator" | "Reverse" | "Siren"), plus SirenGroup ("A"|"B") for siren lamps.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Looks = require(Shared.Vehicle.Looks)

local CarKit = require(script.Parent.CarKit)

local CarDetails = {}

local TRIM = Color3.fromRGB(28, 28, 32)
local INTERIOR = Color3.fromRGB(44, 44, 50)
local CHROME = Color3.fromRGB(205, 208, 214)

local LAMP = {
	Head = { Off = Color3.fromRGB(205, 210, 215), On = Color3.fromRGB(255, 250, 230), Light = Color3.fromRGB(255, 244, 220) },
	Tail = { Off = Color3.fromRGB(110, 14, 18), On = Color3.fromRGB(255, 30, 30), Light = Color3.fromRGB(255, 40, 40) },
	Brake = { Off = Color3.fromRGB(100, 12, 16), On = Color3.fromRGB(255, 20, 20), Light = Color3.fromRGB(255, 30, 30) },
	Indicator = { Off = Color3.fromRGB(170, 100, 20), On = Color3.fromRGB(255, 170, 30), Light = Color3.fromRGB(255, 160, 40) },
	Reverse = { Off = Color3.fromRGB(190, 190, 195), On = Color3.fromRGB(255, 255, 255), Light = Color3.fromRGB(255, 255, 255) },
}
CarDetails.LampColors = LAMP

local function lamp(k, lights: Instance, name: string, kind: string, size: Vector3, cf: CFrame, lightKind: string, face: Enum.NormalId, range: number, brightness: number, round: boolean?)
	local c = LAMP[kind]
	local part
	if round then
		part = k:Cylinder(lights, name, size.Z, math.max(size.X, size.Y), cf * CFrame.Angles(0, math.pi / 2, 0), c.Off, Enum.Material.SmoothPlastic, { Shadow = false })
	else
		part = k:Box(lights, name, size, cf, c.Off, Enum.Material.SmoothPlastic, { Shadow = false })
	end
	part:SetAttribute("LampKind", kind)
	part:SetAttribute("OnColor", c.On)
	part:SetAttribute("OffColor", c.Off)
	local angle = lightKind == "Spot" and 70 or 110
	CarKit.Light(part, lightKind, c.Light, face, range, brightness, angle)
	return part
end
CarDetails.Lamp = lamp

function CarDetails.MakeBadge(k, parent: Instance, name: string, size: Vector3, cf: CFrame, face: Enum.NormalId, brandId: string?, weldTo: BasePart?)
	local part = k:Box(parent, name, size, cf, TRIM, Enum.Material.SmoothPlastic, { Transparency = 1, Shadow = false, WeldTo = weldTo })
	local gui = Instance.new("SurfaceGui")
	gui.Name = "BadgeGui"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 120
	gui.LightInfluence = 0.6
	gui.MaxDistance = 90
	gui.Parent = part
	Looks.BuildBadge(gui, brandId, 1)
	return part
end

function CarDetails.MakePlate(k, parent: Instance, name: string, cf: CFrame, face: Enum.NormalId, scale: number?)
	local s = scale or 1
	local part = k:Box(parent, name, Vector3.new(1.7 * s, 0.44 * s, 0.04), cf, Color3.fromRGB(245, 245, 240), Enum.Material.SmoothPlastic, { Shadow = false })
	part:SetAttribute("Plate", true)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "PlateGui"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 90
	gui.LightInfluence = 0.8
	gui.MaxDistance = 70
	gui.Parent = part
	local bg = Instance.new("Frame")
	bg.Size = UDim2.fromScale(1, 1)
	bg.BackgroundColor3 = Color3.fromRGB(245, 245, 240)
	bg.BorderSizePixel = 0
	bg.Parent = gui
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Color = Color3.fromRGB(30, 60, 140)
	stroke.Parent = bg
	local header = Instance.new("TextLabel")
	header.Name = "Header"
	header.BackgroundTransparency = 1
	header.Size = UDim2.fromScale(1, 0.26)
	header.Text = "SKYLINE CITY"
	header.TextScaled = true
	header.Font = Enum.Font.GothamBold
	header.TextColor3 = Color3.fromRGB(30, 60, 140)
	header.Parent = bg
	local text = Instance.new("TextLabel")
	text.Name = "PlateText"
	text.BackgroundTransparency = 1
	text.Position = UDim2.fromScale(0.04, 0.24)
	text.Size = UDim2.fromScale(0.92, 0.72)
	text.Text = "SKY 000"
	text.TextScaled = true
	text.Font = Enum.Font.GothamBlack
	text.TextColor3 = Color3.fromRGB(20, 20, 24)
	text.Parent = bg
	return part
end

local function bumperStyle(B)
	if B.Bumper == "Heavy" then
		return TRIM, Enum.Material.SmoothPlastic, 0, 0.6, 0.95, false
	elseif B.Bumper == "Chrome" then
		return CHROME, Enum.Material.SmoothPlastic, 0.55, 0.42, 0.6, false
	elseif B.Bumper == "Sport" then
		return nil, nil, 0, 0.45, 0.75, true
	end
	return nil, nil, 0, 0.45, 0.72, true
end

local function lightbar(k, B, lights: Instance, body: Instance, kind: string)
	local y = B.RoofY + 0.05
	local z = (B.ZRoofF + B.ZRoofR) / 2 - 0.2
	if B.Rear == "Box" or B.Rear == "Ladder" or B.Rear == "Dump" then
		z = B.ZRoofF + 0.8
	end
	if B.CabH <= 0.3 then
		y = B.Belt + 0.6
		z = B.ZCe - 0.4
	end
	k:Box(body, "LightbarBase", Vector3.new(math.min(B.CabW - 0.4, 4.2), 0.18, 0.7), CFrame.new(0, y + 0.09, z), TRIM)
	local colorsA, colorsB
	if kind == "Red" then
		colorsA, colorsB = Color3.fromRGB(255, 30, 30), Color3.fromRGB(255, 255, 255)
	elseif kind == "Amber" then
		colorsA, colorsB = Color3.fromRGB(255, 160, 20), Color3.fromRGB(255, 160, 20)
	else
		colorsA, colorsB = Color3.fromRGB(255, 30, 30), Color3.fromRGB(40, 90, 255)
	end
	local width = math.min(B.CabW - 0.4, 4.2)
	local n = 4
	for i = 1, n do
		local x = -width / 2 + (i - 0.5) * width / n
		local group = (i <= n / 2) and "A" or "B"
		local col = group == "A" and colorsA or colorsB
		local p = k:Box(lights, ("Siren%s_%d"):format(group, i), Vector3.new(width / n - 0.08, 0.26, 0.6), CFrame.new(x, y + 0.31, z), col:Lerp(Color3.new(0, 0, 0), 0.5), Enum.Material.SmoothPlastic, { Transparency = 0.15, Shadow = false })
		p:SetAttribute("LampKind", "Siren")
		p:SetAttribute("SirenGroup", group)
		p:SetAttribute("OnColor", col)
		p:SetAttribute("OffColor", col:Lerp(Color3.new(0, 0, 0), 0.5))
		CarKit.Light(p, "Point", col, nil, 22, 3)
	end
	-- grille strobes for emergency vehicles
	if kind ~= "Amber" then
		for _, side in ipairs({ -1, 1 }) do
			local group = side < 0 and "A" or "B"
			local col = group == "A" and colorsA or colorsB
			local p = k:Box(lights, "SirenGrille" .. group, Vector3.new(0.3, 0.16, 0.06), CFrame.new(side * 0.6, B.LowTop - 0.5, B.Front - 0.05), col:Lerp(Color3.new(0, 0, 0), 0.5), Enum.Material.SmoothPlastic, { Shadow = false })
			p:SetAttribute("LampKind", "Siren")
			p:SetAttribute("SirenGroup", group)
			p:SetAttribute("OnColor", col)
			p:SetAttribute("OffColor", col:Lerp(Color3.new(0, 0, 0), 0.5))
		end
	end
end

local function roofSign(k, B, body: Instance, text: string, livery: any)
	local y = (B.CabH > 0.3) and B.RoofY or (B.Belt + 0.9)
	local z = (B.CabH > 0.3) and ((B.ZRoofF + B.ZRoofR) / 2) or (B.RearZ - 1.0)
	local bg = Looks.Color(livery and livery.Secondary, Color3.fromRGB(20, 20, 20))
	local fg = Looks.Color(livery and livery.Primary, Color3.fromRGB(255, 200, 30))
	local sign = k:Box(body, "RoofSign", Vector3.new(1.6, 0.55, 0.5), CFrame.new(0, y + 0.3, z), bg, Enum.Material.SmoothPlastic)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		local gui = Instance.new("SurfaceGui")
		gui.Face = face
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 80
		gui.LightInfluence = 0.2
		gui.Brightness = 1.5
		gui.Parent = sign
		local t = Instance.new("TextLabel")
		t.Size = UDim2.fromScale(1, 1)
		t.BackgroundTransparency = 1
		t.Text = text
		t.TextScaled = true
		t.Font = Enum.Font.GothamBlack
		t.TextColor3 = fg
		t.Parent = gui
	end
	return sign
end

local function extras(k, B, body: Instance, paint: Color3)
	local E = B.Extras
	if E.Exhausts then
		for _, side in ipairs({ -1, 1 }) do
			k:Cylinder(body, "Exhaust", 0.5, 0.32, CFrame.new(side * (B.W / 2 - 1.2), B.Cl + 0.3, B.RearZ + 0.1) * CFrame.Angles(0, math.pi / 2, 0), CHROME, Enum.Material.Metal)
		end
	end
	if E.RoofRack and B.CabH > 0.3 then
		local len = (B.ZRoofR - B.ZRoofF) * 0.8
		local zc = (B.ZRoofF + B.ZRoofR) / 2
		for _, side in ipairs({ -1, 1 }) do
			k:Box(body, "RoofRail", Vector3.new(0.14, 0.14, len), CFrame.new(side * (B.CabW / 2 - 0.3), B.RoofY + 0.12, zc), TRIM)
		end
		for i = 0, 2 do
			k:Box(body, "RoofBar", Vector3.new(B.CabW - 0.5, 0.08, 0.12), CFrame.new(0, B.RoofY + 0.22, zc - len / 2 + i * len / 2), TRIM)
		end
	end
	if E.SpareWheel then
		k:Cylinder(body, "SpareWheel", 0.7, B.R * 2, CFrame.new(0, B.Belt - B.R * 0.2, B.RearZ + 0.42) * CFrame.Angles(0, math.pi / 2, 0), Color3.fromRGB(24, 24, 26), Enum.Material.SmoothPlastic)
		k:Cylinder(body, "SpareCover", 0.05, B.R * 1.3, CFrame.new(0, B.Belt - B.R * 0.2, B.RearZ + 0.79) * CFrame.Angles(0, math.pi / 2, 0), paint, nil, { Paint = true })
	end
	if E.BullBar then
		local z = B.Front - 0.75
		for _, side in ipairs({ -1, 1 }) do
			k:Beam(body, "BullBarPost", Vector3.new(side * 1.0, B.Cl + 0.3, z), Vector3.new(side * 1.0, B.LowTop - 0.1, z + 0.15), 0.18, 0.18, TRIM)
		end
		k:Box(body, "BullBarTop", Vector3.new(2.3, 0.18, 0.18), CFrame.new(0, B.LowTop - 0.1, z + 0.15), TRIM)
		k:Box(body, "BullBarMid", Vector3.new(2.3, 0.14, 0.14), CFrame.new(0, (B.Cl + B.LowTop) / 2, z + 0.07), TRIM)
	end
	if E.Snorkel and B.CabH > 0.3 then
		local x = B.W / 2 + 0.05
		k:Beam(body, "Snorkel", Vector3.new(x, B.Belt - 0.6, B.ZWs - 0.4), Vector3.new(x, B.Belt + 0.05, B.ZWs - 0.2), 0.3, 0.3, TRIM)
		k:Beam(body, "SnorkelPipe", Vector3.new(x, B.Belt, B.ZWs - 0.2), Vector3.new(x - 0.25, B.RoofY + 0.1, B.ZRoofF - 0.1), 0.26, 0.26, TRIM)
	end
end

function CarDetails.Build(k, B, paint: Color3)
	local body = k:Folder("Body")
	local lights = k:Folder("Lights")
	local mirrors = k:Folder("Mirrors")
	local def = B.Def
	local W, front, rearZ = B.W, B.Front, B.RearZ

	-- bumpers
	local bColor, bMat, bRefl, bDepth, bHeight, painted = bumperStyle(B)
	local fz = front - bDepth / 2 + 0.12
	local rz = rearZ + bDepth / 2 - 0.12
	local by = B.Cl + bHeight / 2 + 0.05
	for _, z in ipairs({ fz, rz }) do
		k:Box(body, z < 0 and "BumperFront" or "BumperRear", Vector3.new(W - 0.1, bHeight, bDepth), CFrame.new(0, by, z),
			bColor or paint, bMat, { Paint = painted, Reflectance = bRefl })
	end
	if B.Bumper == "Sport" then
		k:Box(body, "Splitter", Vector3.new(W - 0.3, 0.08, 0.5), CFrame.new(0, B.Cl + 0.06, front - 0.25), TRIM)
		k:Box(body, "Diffuser", Vector3.new(W - 1.6, 0.3, 0.3), CFrame.new(0, B.Cl + 0.2, rearZ + 0.15), TRIM)
	end
	local frontFace = fz - bDepth / 2
	local rearFace = rz + bDepth / 2

	-- headlights / indicators
	local hy = math.min(B.LowTop - 0.35, B.Cl + 1.6)
	hy = math.max(hy, by + bHeight / 2 + 0.2)
	local style = B.Headlights
	local hSize = (style == "Square" and Vector3.new(0.95, 0.55, 0.16)) or (style == "Round" and Vector3.new(0.7, 0.7, 0.16)) or Vector3.new(1.3, 0.3, 0.16)
	local hx = W / 2 - 0.25 - hSize.X / 2 - 0.4
	for _, side in ipairs({ -1, 1 }) do
		local suffix = side < 0 and "L" or "R"
		lamp(k, lights, "Headlight_" .. suffix, "Head", hSize, CFrame.new(side * hx, hy, front - 0.06), "Spot",
			style == "Round" and Enum.NormalId.Right or Enum.NormalId.Front, 45, 3, style == "Round")
		lamp(k, lights, "Indicator_F" .. suffix, "Indicator", Vector3.new(0.34, 0.2, 0.1), CFrame.new(side * (W / 2 - 0.3), hy - 0.05, front - 0.05),
			"Surface", Enum.NormalId.Front, 8, 2)
	end

	-- tail / brake / reverse / rear indicators
	local ty = math.min(B.Belt - 0.45, B.Cl + 1.9)
	ty = math.max(ty, by + bHeight / 2 + 0.25)
	for _, side in ipairs({ -1, 1 }) do
		local suffix = side < 0 and "L" or "R"
		lamp(k, lights, "Taillight_" .. suffix, "Tail", Vector3.new(0.95, 0.34, 0.1), CFrame.new(side * (W / 2 - 0.75), ty, rearZ + 0.04), "Surface", Enum.NormalId.Back, 8, 1.2)
		lamp(k, lights, "Brake_" .. suffix, "Brake", Vector3.new(0.5, 0.3, 0.1), CFrame.new(side * (W / 2 - 1.55), ty, rearZ + 0.04), "Surface", Enum.NormalId.Back, 10, 2.5)
		lamp(k, lights, "Reverse_" .. suffix, "Reverse", Vector3.new(0.36, 0.18, 0.1), CFrame.new(side * (W / 2 - 0.85), ty - 0.3, rearZ + 0.04), "Surface", Enum.NormalId.Back, 12, 2)
		lamp(k, lights, "Indicator_R" .. suffix, "Indicator", Vector3.new(0.3, 0.2, 0.1), CFrame.new(side * (W / 2 - 0.22), ty, rearZ + 0.04), "Surface", Enum.NormalId.Back, 8, 2)
	end

	-- interior + underglow light holders
	local interior = k:Box(lights, "Interior", Vector3.new(0.3, 0.05, 0.3), CFrame.new(0, math.max(B.Belt, B.RoofY - 0.3), (B.ZRoofF + B.ZRoofR) / 2), Color3.fromRGB(255, 240, 210), Enum.Material.SmoothPlastic, { Transparency = (B.CabH > 0.3 and not B.Convertible) and 0.2 or 1, Shadow = false })
	CarKit.Light(interior, "Point", Color3.fromRGB(255, 236, 200), nil, 9, 1.2)
	local under = k:Box(lights, "Underglow", Vector3.new(0.2, 0.05, 0.2), CFrame.new(0, math.max(0.08, B.Cl - 0.05), 0), Color3.new(0, 0, 0), Enum.Material.SmoothPlastic, { Transparency = 1, Shadow = false })
	CarKit.Light(under, "Point", Color3.fromRGB(80, 160, 255), nil, 16, 4)

	-- grille + badges + plates
	local grilleW = math.max(0.8, W * 0.36)
	k:Box(body, "Grille", Vector3.new(grilleW, 0.5, 0.06), CFrame.new(0, hy - 0.08, front - 0.03), TRIM)
	if B.Bumper == "Chrome" then
		for i = -1, 1 do
			k:Box(body, "GrilleSlat", Vector3.new(grilleW - 0.1, 0.05, 0.03), CFrame.new(0, hy - 0.08 + i * 0.14, front - 0.07), CHROME, nil, { Reflectance = 0.5, Shadow = false })
		end
	end
	local brand = Looks.Brand(def.Brand)
	local wing = brand.Badge and brand.Badge.Shape == "wing"
	local badgeSize = wing and Vector3.new(1.0, 0.5, 0.03) or Vector3.new(0.6, 0.6, 0.03)
	CarDetails.MakeBadge(k, body, "BadgeFront", badgeSize, CFrame.new(0, hy + 0.32, front - 0.08), Enum.NormalId.Front, def.Brand)
	CarDetails.MakeBadge(k, body, "BadgeRear", badgeSize * 0.85, CFrame.new(0, ty + 0.15, rearZ + 0.06), Enum.NormalId.Back, def.Brand)
	CarDetails.MakePlate(k, body, "PlateFront", CFrame.new(0, by, frontFace - 0.025), Enum.NormalId.Front)
	CarDetails.MakePlate(k, body, "PlateRear", CFrame.new(0, by + 0.1, rearFace + 0.025), Enum.NormalId.Back)

	-- mirrors
	if B.CabH > 0.3 then
		for _, side in ipairs({ -1, 1 }) do
			local x = side * (W / 2 + 0.3)
			local mz = B.ZWs + 0.4
			local m = k:Box(mirrors, side < 0 and "Mirror_L" or "Mirror_R", Vector3.new(0.45, 0.3, 0.16), CFrame.new(x, B.Belt + 0.24, mz), paint, nil, { Paint = true })
			k:Box(mirrors, "MirrorGlass", Vector3.new(0.38, 0.24, 0.02), CFrame.new(x, B.Belt + 0.24, mz + 0.09), Color3.fromRGB(160, 180, 200), Enum.Material.Glass, { Reflectance = 0.6, Shadow = false, WeldTo = m })
			k:Box(mirrors, "MirrorStem", Vector3.new(0.3, 0.08, 0.1), CFrame.new(side * (W / 2 + 0.05), B.Belt + 0.12, mz), TRIM, nil, { Shadow = false })
		end
		k:Box(mirrors, "Mirror_C", Vector3.new(0.6, 0.18, 0.06), CFrame.new(0, B.RoofY - 0.36, B.ZRoofF + 0.3), TRIM, nil, { Shadow = false })
	end

	-- interior: dashboard, steering wheel, seat backs are added by CarRig with the seats
	local dashZ = B.ZWs + 0.55
	k:Box(body, "Dashboard", Vector3.new(B.CabW - 0.3, 0.55, 1.0), CFrame.new(0, B.Belt - 0.12, dashZ), INTERIOR)
	k:Box(body, "DashScreen", Vector3.new(0.9, 0.4, 0.05), CFrame.new(0, B.Belt + 0.1, dashZ + 0.35), Color3.fromRGB(20, 30, 40), Enum.Material.Neon, { Transparency = 0.2, Shadow = false })
	local seat0 = B.Seats[1]
	local wheelPos = Vector3.new(seat0.X, B.Belt - 0.02, math.max(dashZ + 0.6, seat0.Z - 1.35))
	local wheelCF = CFrame.new(wheelPos) * CFrame.Angles(math.rad(-25), 0, 0) * CFrame.Angles(0, math.pi / 2, 0)
	k:Cylinder(body, "SteeringWheel", 0.12, 1.0, wheelCF, TRIM)
	k:Cylinder(body, "SteeringHub", 0.16, 0.34, wheelCF, Color3.fromRGB(60, 60, 66))
	k:Beam(body, "SteeringColumn", wheelPos, Vector3.new(seat0.X, B.Belt - 0.25, dashZ + 0.2), 0.14, 0.14, TRIM)

	extras(k, B, body, paint)

	-- job-vehicle equipment
	local livery = def.Livery
	if (livery and livery.Lightbar) or B.Features.Siren then
		lightbar(k, B, lights, body, (livery and livery.Lightbar) or "RedBlue")
	end
	if livery and type(livery.RoofSign) == "string" and livery.RoofSign ~= "" and not B.Scooter then
		roofSign(k, B, body, livery.RoofSign, livery)
	end
end

CarDetails.RoofSign = roofSign
CarDetails.Lightbar = lightbar

return CarDetails
