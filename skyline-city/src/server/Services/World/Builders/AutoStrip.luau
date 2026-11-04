-- AutoStrip builder: Skyline Motors dealership (counter, 8 display pads, CarSales job, test-drive spawn),
-- Neon Garage tuning shop (TuningShop zone), Wrench Bros garage (3 MechanicBay zones, Mechanic job, repair spots),
-- FuelUp gas station (4 pumps) and the Meet Lot used by the Car Meet event.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)
local VehiclesConfig = require(Shared.Config.Vehicles)

local AutoStrip = {}

local Tags = World.Tags
local S = Layout.Sites
local GROUND = Layout.Heights.Ground
local NORTH, SOUTH, EAST, WEST = Vector3.new(0, 0, -1), Vector3.new(0, 0, 1), Vector3.new(1, 0, 0), Vector3.new(-1, 0, 0)
local ASPHALT = Color3.fromRGB(44, 46, 52)

-- inside showroom pads (2 rows of 3) + 2 outside on the forecourt
local PADS = {
	{ Vector3.new(400, 0, -795), 25 },
	{ Vector3.new(450, 0, -795), -25 },
	{ Vector3.new(500, 0, -795), 25 },
	{ Vector3.new(400, 0, -760), -25 },
	{ Vector3.new(450, 0, -760), 25 },
	{ Vector3.new(500, 0, -760), -25 },
	{ Vector3.new(420, 0, -688), 30 },
	{ Vector3.new(480, 0, -688), -30 },
}

local function gasStation(P, G, f: Instance, center: Vector3, facing: Vector3)
	-- pumps on two islands under the canopy
	local cf = P.Facing(Vector3.new(center.X, 0, center.Z), facing)
	for _, x in ipairs({ -20, 20 }) do
		P.Part(f, "PumpIsland", Vector3.new(3, 0.6, 20), cf * CFrame.new(x, GROUND + 0.3, 0), Color3.fromRGB(200, 200, 196), Enum.Material.Concrete)
		for _, z in ipairs({ -6, 6 }) do
			local pump = P.Part(f, "FuelPump", Vector3.new(2.2, 6, 1.6), cf * CFrame.new(x, GROUND + 3.6, z) * CFrame.Angles(0, math.pi / 2, 0), Color3.fromRGB(220, 60, 50), Enum.Material.SmoothPlastic)
			P.Small(f, "PumpScreen", Vector3.new(1.4, 1, 0.1), pump.CFrame * CFrame.new(0, 1.6, -0.82), Color3.fromRGB(90, 200, 255), Enum.Material.Neon, { CanCollide = false })
			P.Small(f, "PumpScreenBack", Vector3.new(1.4, 1, 0.1), pump.CFrame * CFrame.new(0, 1.6, 0.82), Color3.fromRGB(90, 200, 255), Enum.Material.Neon, { CanCollide = false })
			P.Tag(pump, Tags.FuelPump)
		end
	end
	return cf
end

local function gasDecor(P, B, G, f: Instance, cf: CFrame, name: string)
	P.Part(f, "Canopy", Vector3.new(70, 1.4, 40), cf * CFrame.new(0, 18, 0), Color3.fromRGB(240, 240, 244), Enum.Material.SmoothPlastic)
	P.Small(f, "CanopyStripe", Vector3.new(70.4, 0.8, 40.4), cf * CFrame.new(0, 17.6, 0), Color3.fromRGB(220, 60, 50), Enum.Material.Neon)
	for _, x in ipairs({ -30, 30 }) do
		for _, z in ipairs({ -16, 16 }) do
			P.Part(f, "CanopyPillar", Vector3.new(1.4, 17.4, 1.4), cf * CFrame.new(x, GROUND + 8.7, z), Color3.fromRGB(210, 210, 214), Enum.Material.Metal)
		end
	end
	local light = Instance.new("PointLight")
	light.Range = 40
	light.Brightness = 1.5
	light.Color = Color3.fromRGB(240, 250, 255)
	light.Parent = P.Small(f, "CanopyLight", Vector3.new(40, 0.2, 2), cf * CFrame.new(0, 17.2, 0), Color3.fromRGB(255, 255, 255), Enum.Material.Neon)
	-- price pylon
	local pylon = P.Part(f, "PricePylon", Vector3.new(8, 14, 1.2), cf * CFrame.new(-44, GROUND + 7, -14), Color3.fromRGB(30, 30, 36))
	P.Sign(pylon, "⛽ FUELUP\n$3.49", { TextColor = Color3.fromRGB(255, 220, 80) })
	B.Box(f, { Name = name .. "Shop", AssetId = "GasStationShop", Position = (cf * CFrame.new(0, 0, 45)).Position, Size = Vector3.new(30, 12, 20), Facing = cf.LookVector, Color = Color3.fromRGB(236, 236, 236), Trim = Color3.fromRGB(220, 60, 50), Sign = "FUELUP MART", FrontOnly = true })
end

function AutoStrip.Essential(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.District("AutoStrip")

	-- Dealership
	local dl = S.Dealership
	ctx.Pave(f, Vector3.new(dl.X, 0, -676.5), 240, 97)
	for slot, pad in ipairs(PADS) do
		local pos: Vector3 = pad[1]
		local y = GROUND
		local p = P.Part(f, "DisplayPad" .. slot, Vector3.new(16, 0.6, 24), CFrame.new(pos.X, y + 0.3, pos.Z) * CFrame.Angles(0, math.rad(pad[2]), 0), Color3.fromRGB(230, 230, 236), Enum.Material.Marble)
		P.Tag(p, Tags.DealershipDisplay, { Slot = slot })
	end
	G.Counter(f, Tags.Dealership, P.Facing(Vector3.new(dl.X, GROUND, -735), SOUTH), "🚗 Skyline Motors — Browse Cars", Color3.fromRGB(30, 30, 36))
	local station = Vector3.new(405, GROUND, -736)
	G.Station(f, "CarSales", P.Facing(station, SOUTH), "Skyline Motors Sales", Color3.fromRGB(200, 60, 50))
	for _, p in ipairs({ Vector3.new(385, GROUND, -740), Vector3.new(395, GROUND, -744), Vector3.new(420, GROUND, -745), Vector3.new(428, GROUND, -744) }) do
		G.Target(f, "CarSales", "Showroom", P.Facing(p, SOUTH))
	end
	G.TestDriveSpawn(f, G.ParkingCF("X", -600, dl.X + 20, 1))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(dl.X + 50, GROUND, -721), SOUTH))

	-- Tuning shop zone (flat floor zone inside the garage)
	local tu = S.TuningShop
	local zone = P.Part(f, "TuningShopZone", Vector3.new(64, 0.2, 48), CFrame.new(tu.X, GROUND + 0.1, tu.Z - 2), Color3.fromRGB(60, 40, 90), Enum.Material.SmoothPlastic, { CanCollide = false, CastShadow = false })
	P.Tag(zone, Tags.TuningShop, { Name = "Neon Garage", ShopName = "Neon Garage" })
	P.Billboard(zone, "🎨 Neon Garage — park inside to tune", { Offset = Vector3.new(0, 10, 0), MaxDistance = 90 })

	-- Mechanic garage
	local me = S.Mechanic
	for i, x in ipairs({ -25, 0, 25 }) do
		local bay = P.Part(f, "MechanicBay" .. i, Vector3.new(20, 0.2, 30), CFrame.new(me.X + x, GROUND + 0.1, me.Z - 6), Color3.fromRGB(240, 190, 40), Enum.Material.SmoothPlastic, { CanCollide = false, CastShadow = false, Transparency = 0.3 })
		P.Tag(bay, Tags.MechanicBay, { Bay = i })
		G.Target(f, "Mechanic", "RepairSpot", P.Facing(Vector3.new(me.X + x, GROUND, me.Z - 6), SOUTH))
		G.Target(f, "Mechanic", "RepairSpot", P.Facing(Vector3.new(me.X + x, GROUND, -735), SOUTH))
	end
	G.Station(f, "Mechanic", P.Facing(Vector3.new(me.X + 40, GROUND, me.Z + 10), WEST), "Wrench Bros Garage", Color3.fromRGB(240, 150, 40))
	ctx.Pave(f, Vector3.new(750, 0, -689), 244, 122)
	ctx.Pave(f, Vector3.new(me.X, 0, -752.5), 90, 5)
	G.CarSpawn(f, G.ParkingCF("X", -600, me.X - 10, -1))
	G.CarSpawn(f, G.ParkingCF("X", -600, me.X + 30, -1))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(tu.X - 20, GROUND, -746), SOUTH))

	-- Gas station (north)
	local gas = S.GasNorth
	ctx.Pave(f, Vector3.new(439, 0, gas.Z), 128, 120)
	ctx.Pave(f, Vector3.new(351.5, 0, gas.Z), 47, 24)
	gasStation(P, G, f, gas, SOUTH)
	G.ATM(f, P.Facing(Vector3.new(gas.X + 25, GROUND, gas.Z - 33), SOUTH))
	G.Lot(f, "auto_1", P.StreetFacing(Vector3.new(535, 0, -380), SOUTH), Vector3.new(64, 40, 64), "CarDealership,GasStation,*")

	-- Meet lot
	local ml = S.MeetLot
	ctx.Pave(f, ml, 200, 130, ASPHALT, Enum.Material.Asphalt)
	G.Lot(f, "auto_2", P.StreetFacing(Vector3.new(700, 0, -375), SOUTH), Vector3.new(64, 40, 64), "CarDealership,*")
	G.CarSpawn(f, G.ParkingCF("Z", 600, -480, 1))
	G.CarSpawn(f, G.ParkingCF("Z", 600, -430, 1))
	G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(ml.X, GROUND, -420), SOUTH))
	-- Premium Car Park showroom: 6 pads along the north edge of the Meet Lot (Vehicles/Showcase puts each
	-- online pass owner's chosen car on one, facing into the lot)
	local padTag = VehiclesConfig.Showcase and VehiclesConfig.Showcase.PadTag or "PremiumShowcasePad"
	for i = 0, 5 do
		local pos = Vector3.new(ml.X - 80 + i * 32, GROUND + 0.3, ml.Z - 48)
		local pad = P.Part(f, "ShowcasePad" .. (i + 1), Vector3.new(16, 0.6, 24), CFrame.lookAt(pos, pos + SOUTH), Color3.fromRGB(26, 28, 36), Enum.Material.Marble)
		P.Small(f, "ShowcaseTrim", Vector3.new(16.4, 0.1, 24.4), pad.CFrame * CFrame.new(0, -0.27, 0), Color3.fromRGB(64, 156, 255), Enum.Material.Neon, { CanCollide = false })
		P.Tag(pad, padTag, { Pad = i + 1 })
	end
	for i = 0, 3 do
		G.Bench(f, P.Facing(Vector3.new(ml.X - 30 + i * 20, 0, -559), SOUTH))
	end
end

function AutoStrip.Decor(ctx)
	local P, B, G = ctx.Props, ctx.B, ctx.G
	local f = ctx.District("AutoStrip")

	B.Hollow(f, {
		Name = "SkylineMotors",
		AssetId = "Dealership",
		Position = S.Dealership,
		Size = Vector3.new(150, 26, 90),
		Facing = SOUTH,
		Color = Color3.fromRGB(236, 238, 242),
		Trim = Color3.fromRGB(30, 30, 36),
		GlassFront = true,
		DoorWidth = 30,
		DoorHeight = 14,
		Sign = "🚗 SKYLINE MOTORS",
		SignColor = Color3.fromRGB(255, 90, 80),
		Floor = Color3.fromRGB(240, 240, 244),
	})
	-- forecourt flags
	for i = 0, 5 do
		local x = 345 + i * 44
		P.Small(f, "FlagPole", Vector3.new(0.4, 16, 0.4), CFrame.new(x, 8, -634), Color3.fromRGB(200, 200, 205), Enum.Material.Metal)
		P.Small(f, "Flag", Vector3.new(0.1, 6, 3), CFrame.new(x, 13, -632.5), i % 2 == 0 and Color3.fromRGB(255, 70, 60) or Color3.fromRGB(255, 255, 255), Enum.Material.Fabric)
	end

	B.Hollow(f, {
		Name = "NeonGarage",
		AssetId = "TuningShop",
		Position = S.TuningShop,
		Size = Vector3.new(80, 24, 60),
		Facing = SOUTH,
		Color = Color3.fromRGB(30, 26, 40),
		Trim = Color3.fromRGB(16, 14, 22),
		DoorWidth = 44,
		DoorHeight = 16,
		Sign = "🎨 NEON GARAGE",
		SignColor = Color3.fromRGB(200, 120, 255),
		Floor = Color3.fromRGB(34, 30, 44),
	})
	local tu = S.TuningShop
	for _, x in ipairs({ -32, 32 }) do
		P.Small(f, "ZoneNeon", Vector3.new(0.4, 0.1, 48), CFrame.new(tu.X + x, GROUND + 0.25, tu.Z - 2), Color3.fromRGB(200, 120, 255), Enum.Material.Neon, { CanCollide = false })
	end

	B.Hollow(f, {
		Name = "WrenchBros",
		AssetId = "MechanicGarage",
		Position = S.Mechanic,
		Size = Vector3.new(90, 22, 50),
		Facing = SOUTH,
		Color = Color3.fromRGB(110, 116, 126),
		Trim = Color3.fromRGB(240, 150, 40),
		DoorWidth = 76,
		DoorHeight = 16,
		Sign = "🔧 WRENCH BROS GARAGE",
		SignColor = Color3.fromRGB(255, 190, 80),
		Floor = Color3.fromRGB(150, 150, 152),
	})
	local me = S.Mechanic
	for _, x in ipairs({ -25, 0, 25 }) do
		P.Small(f, "ToolChest", Vector3.new(4, 4, 2), CFrame.new(me.X + x - 7, GROUND + 2, me.Z + 21), Color3.fromRGB(200, 40, 40), Enum.Material.Metal)
		P.Small(f, "Lift", Vector3.new(1, 5, 1), CFrame.new(me.X + x - 9, GROUND + 2.5, me.Z - 6), Color3.fromRGB(80, 80, 86), Enum.Material.Metal)
		P.Small(f, "Lift", Vector3.new(1, 5, 1), CFrame.new(me.X + x + 9, GROUND + 2.5, me.Z - 6), Color3.fromRGB(80, 80, 86), Enum.Material.Metal)
	end

	gasDecor(P, B, G, f, P.Facing(Vector3.new(S.GasNorth.X, 0, S.GasNorth.Z), SOUTH), "GasNorth")

	-- meet lot lines, bleachers, lamps, sign
	local ml = S.MeetLot
	for row = 0, 1 do
		for col = 0, 5 do
			P.Small(f, "MeetLine", Vector3.new(0.4, 0.06, 20), CFrame.new(ml.X - 90 + col * 36, GROUND + 0.03, ml.Z - 26 + row * 52), Color3.fromRGB(235, 235, 235), Enum.Material.SmoothPlastic, { CanCollide = false })
		end
	end
	P.Part(f, "Bleachers", Vector3.new(90, 2, 6), CFrame.new(ml.X, 1, -566), Color3.fromRGB(150, 152, 158), Enum.Material.Metal)
	for _, p in ipairs({ Vector3.new(ml.X - 96, 0, ml.Z - 61), Vector3.new(ml.X + 96, 0, ml.Z - 61), Vector3.new(ml.X - 96, 0, ml.Z + 61), Vector3.new(ml.X + 96, 0, ml.Z + 61) }) do
		G.ParkLamp(f, p)
	end
	local sign = P.Part(f, "MeetSign", Vector3.new(36, 6, 1), P.Facing(Vector3.new(ml.X, 14, ml.Z + 66), SOUTH), Color3.fromRGB(20, 20, 26))
	P.Sign(sign, "🏁 AUTOSTRIP MEET LOT", { TextColor = Color3.fromRGB(255, 120, 80) })
	for _, x in ipairs({ -16, 16 }) do
		P.Small(f, "SignPost", Vector3.new(0.8, 11, 0.8), CFrame.new(ml.X + x, 5.5, ml.Z + 66), Color3.fromRGB(70, 70, 76), Enum.Material.Metal)
	end
end

-- shared with the Suburbs builder (second gas station)
AutoStrip.GasStation = gasStation
AutoStrip.GasDecor = gasDecor

return AutoStrip
