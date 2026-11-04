-- CarScooter: procedural body for scooters / mopeds (RoofStyle "Scooter"). Wheels are coincident pairs
-- (FL+FR at the front, RL+RR at the rear, the R twins invisible) which the client chassis turns into a
-- stable single-track vehicle with virtual outriggers.
--
--   CarScooter.Prepare(B)              -- adjusts seats / chassis collider in the layout (call before the rig)
--   CarScooter.Build(k, B, paint)      -- body, lights, badge, plate, optional top box (its lid is the Trunk)

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Looks = require(Shared.Vehicle.Looks)

local CarKit = require(script.Parent.CarKit)
local CarBody = require(script.Parent.CarBody)
local CarDetails = require(script.Parent.CarDetails)

local CarScooter = {}

local TRIM = Color3.fromRGB(28, 28, 32)
local CHROME = Color3.fromRGB(205, 208, 214)

function CarScooter.Prepare(B)
	local deckY = B.R + 0.2
	B.DeckY = deckY
	B.SeatTop = deckY + 1.15
	local n = #B.Seats
	B.Seats = {
		{ Name = "DriveSeat", X = 0, Z = B.ZR - 1.2, Door = "FL", Driver = true },
	}
	if n >= 2 then
		table.insert(B.Seats, { Name = "Passenger1", X = 0, Z = B.ZR - 0.15, Door = "FR" })
	end
	B.ChassisSize = Vector3.new(1.3, math.max(0.6, deckY + 0.4 - B.Cl), math.max(2, B.L - 0.8))
	B.ChassisCenter = Vector3.new(0, B.Cl + B.ChassisSize.Y / 2, 0)
	B.Doors = {}
	B.DoorCount = 0
end

function CarScooter.Build(k, B, paint: Color3)
	local body = k:Folder("Body")
	local lights = k:Folder("Lights")
	local mirrors = k:Folder("Mirrors")
	local def = B.Def
	local deckY = B.DeckY
	local zF, zR = B.ZF, B.ZR

	-- floorboard + rear cowl + seat base
	k:Box(body, "Floorboard", Vector3.new(1.25, 0.24, zR - zF - 2.2), CFrame.new(0, deckY, (zF + zR) / 2 - 0.2), TRIM, nil, { CanCollide = true })
	local cowlZ0, cowlZ1 = zR - 1.9, zR + 1.0
	local cowlTop = B.SeatTop - 0.3
	k:Box(body, "RearCowl", Vector3.new(1.5, cowlTop - deckY, cowlZ1 - cowlZ0), CFrame.new(0, (deckY + cowlTop) / 2, (cowlZ0 + cowlZ1) / 2), paint, nil, { Paint = true })
	k:Wedge(body, "CowlTail", Vector3.new(1.4, 0.5, 0.8), CFrame.new(0, cowlTop - 0.25, cowlZ1 + 0.4) * CFrame.Angles(0, math.pi, 0), paint, nil, { Paint = true })
	k:Box(body, "Engine", Vector3.new(0.7, 0.6, 1.3), CFrame.new(0.35, B.R + 0.1, zR - 0.5), Color3.fromRGB(70, 72, 78), Enum.Material.Metal)
	k:Cylinder(body, "Exhaust", 1.1, 0.22, CFrame.new(0.55, B.R - 0.15, zR + 0.1) * CFrame.Angles(0, math.pi / 2, 0), CHROME, Enum.Material.Metal)

	-- leg shield + front cowl
	local shieldZ = zF + 1.15
	k:Box(body, "LegShield", Vector3.new(1.45, 1.75, 0.22), CFrame.new(0, deckY + 0.95, shieldZ) * CFrame.Angles(math.rad(-12), 0, 0), paint, nil, { Paint = true })
	k:Box(body, "FrontFender", Vector3.new(0.62, 0.18, 1.5), CFrame.new(0, B.R * 2 + 0.12, zF), paint, nil, { Paint = true })

	-- steering column + handlebars
	local barY = B.SeatTop + 0.75
	local barZ = shieldZ - 0.25
	k:Beam(body, "Fork", Vector3.new(0, B.R, zF), Vector3.new(0, barY - 0.2, barZ), 0.22, 0.22, CHROME, Enum.Material.Metal)
	k:Box(body, "Handlebar", Vector3.new(1.9, 0.14, 0.14), CFrame.new(0, barY, barZ), TRIM)
	for _, side in ipairs({ -1, 1 }) do
		k:Cylinder(body, "Grip", 0.36, 0.2, CFrame.new(side * 0.95, barY, barZ), Color3.fromRGB(20, 20, 20), Enum.Material.Fabric)
		local m = k:Box(mirrors, side < 0 and "Mirror_L" or "Mirror_R", Vector3.new(0.34, 0.22, 0.08), CFrame.new(side * 0.85, barY + 0.55, barZ + 0.05), CHROME, nil, { Reflectance = 0.5 })
		k:Beam(mirrors, "MirrorStem", Vector3.new(side * 0.7, barY, barZ), Vector3.new(side * 0.85, barY + 0.45, barZ + 0.05), 0.05, 0.05, TRIM, nil, { WeldTo = m })
	end
	k:Box(body, "HeadsetCover", Vector3.new(1.0, 0.45, 0.6), CFrame.new(0, barY + 0.05, barZ - 0.05), paint, nil, { Paint = true })
	k:Box(body, "Speedo", Vector3.new(0.5, 0.05, 0.3), CFrame.new(0, barY + 0.3, barZ + 0.1), Color3.fromRGB(20, 30, 40), Enum.Material.Neon, { Transparency = 0.3, Shadow = false })

	-- lights
	CarDetails.Lamp(k, lights, "Headlight_L", "Head", Vector3.new(0.5, 0.5, 0.14), CFrame.new(0, barY - 0.05, barZ - 0.38), "Spot", Enum.NormalId.Right, 40, 3, true)
	CarDetails.Lamp(k, lights, "Headlight_R", "Head", Vector3.new(0.3, 0.12, 0.08), CFrame.new(0, deckY + 1.5, shieldZ - 0.25), "Spot", Enum.NormalId.Front, 25, 1)
	local tailZ = cowlZ1 + 0.82
	local tailY = cowlTop - 0.3
	CarDetails.Lamp(k, lights, "Taillight_L", "Tail", Vector3.new(0.5, 0.22, 0.08), CFrame.new(0, tailY, tailZ), "Surface", Enum.NormalId.Back, 6, 1)
	CarDetails.Lamp(k, lights, "Taillight_R", "Tail", Vector3.new(0.2, 0.1, 0.06), CFrame.new(0, tailY - 0.25, tailZ), "Surface", Enum.NormalId.Back, 4, 0.6)
	CarDetails.Lamp(k, lights, "Brake_L", "Brake", Vector3.new(0.28, 0.12, 0.08), CFrame.new(-0.3, tailY + 0.16, tailZ - 0.02), "Surface", Enum.NormalId.Back, 7, 2)
	CarDetails.Lamp(k, lights, "Brake_R", "Brake", Vector3.new(0.28, 0.12, 0.08), CFrame.new(0.3, tailY + 0.16, tailZ - 0.02), "Surface", Enum.NormalId.Back, 7, 2)
	CarDetails.Lamp(k, lights, "Reverse_L", "Reverse", Vector3.new(0.1, 0.06, 0.04), CFrame.new(-0.12, tailY - 0.3, tailZ), "Surface", Enum.NormalId.Back, 4, 0.5)
	CarDetails.Lamp(k, lights, "Reverse_R", "Reverse", Vector3.new(0.1, 0.06, 0.04), CFrame.new(0.12, tailY - 0.3, tailZ), "Surface", Enum.NormalId.Back, 4, 0.5)
	for _, side in ipairs({ -1, 1 }) do
		local suffix = side < 0 and "L" or "R"
		CarDetails.Lamp(k, lights, "Indicator_F" .. suffix, "Indicator", Vector3.new(0.2, 0.14, 0.14), CFrame.new(side * 0.62, barY, barZ - 0.12), "Surface", Enum.NormalId.Front, 6, 2)
		CarDetails.Lamp(k, lights, "Indicator_R" .. suffix, "Indicator", Vector3.new(0.18, 0.12, 0.1), CFrame.new(side * 0.6, tailY, tailZ - 0.1), "Surface", Enum.NormalId.Back, 6, 2)
	end
	local interior = k:Box(lights, "Interior", Vector3.new(0.1, 0.05, 0.1), CFrame.new(0, barY + 0.32, barZ + 0.1), Color3.new(1, 1, 1), nil, { Transparency = 1, Shadow = false })
	CarKit.Light(interior, "Point", Color3.fromRGB(150, 200, 255), nil, 4, 0.6)
	local under = k:Box(lights, "Underglow", Vector3.new(0.1, 0.05, 0.1), CFrame.new(0, math.max(0.1, deckY - 0.2), 0), Color3.new(0, 0, 0), nil, { Transparency = 1, Shadow = false })
	CarKit.Light(under, "Point", Color3.fromRGB(80, 160, 255), nil, 10, 3)

	-- badge + plate
	CarDetails.MakeBadge(k, body, "BadgeFront", Vector3.new(0.5, 0.5, 0.03), CFrame.new(0, deckY + 1.3, shieldZ - 0.15) * CFrame.Angles(math.rad(-12), 0, 0), Enum.NormalId.Front, def.Brand)
	CarDetails.MakePlate(k, body, "PlateRear", CFrame.new(0, tailY - 0.5, tailZ - 0.25) * CFrame.Angles(math.rad(10), 0, 0), Enum.NormalId.Back, 0.6)

	-- delivery top box (job scooters): the lid is the "Trunk"
	if B.Rear == "TopBox" then
		local boxY = B.SeatTop + 0.35
		local boxZ = zR + 0.75
		local box = k:Box(body, "TopBox", Vector3.new(1.5, 1.0, 1.3), CFrame.new(0, boxY + 0.5, boxZ), paint, nil, { Paint = true })
		local lid = k:Box(k.Model, "Trunk", Vector3.new(1.55, 0.14, 1.35), CFrame.new(0, boxY + 1.07, boxZ), paint, nil, { Paint = true, NoWeld = true })
		CarBody.Hinge(k, lid, CFrame.new(0, boxY + 1.07, boxZ - 0.67), "X", -75)
		local livery = def.Livery
		local text = (livery and (livery.RoofSign or livery.Text)) or "DELIVERY"
		for _, face in ipairs({ Enum.NormalId.Left, Enum.NormalId.Right, Enum.NormalId.Back }) do
			local gui = Instance.new("SurfaceGui")
			gui.Face = face
			gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
			gui.PixelsPerStud = 70
			gui.Parent = box
			local t = Instance.new("TextLabel")
			t.Size = UDim2.fromScale(1, 1)
			t.BackgroundTransparency = 1
			t.Text = text
			t.TextScaled = true
			t.Font = Enum.Font.GothamBlack
			t.TextColor3 = Looks.Color(livery and livery.TextColor, Color3.new(1, 1, 1))
			t.Parent = gui
		end
	end
end

return CarScooter
