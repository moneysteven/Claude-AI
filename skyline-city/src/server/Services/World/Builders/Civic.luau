-- Civic builder: Police HQ, Fire Station 1, Skyline General Hospital (SafeZone, patient drop-off) and City Hall.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)

local Civic = {}

local Tags = World.Tags
local S = Layout.Sites
local GROUND = Layout.Heights.Ground
local NORTH, SOUTH = Vector3.new(0, 0, -1), Vector3.new(0, 0, 1)

function Civic.Essential(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.District("Civic")

	-- Police HQ (front faces south onto Harbor St W, z = 0)
	local pol = S.Police
	ctx.Pave(f, Vector3.new(pol.X, 0, pol.Z + 41), 120, 22)
	G.Station(f, "Police", P.Facing(Vector3.new(pol.X, GROUND, pol.Z + 20), SOUTH), "Police HQ", Color3.fromRGB(40, 70, 160))
	G.CarSpawn(f, G.ParkingCF("X", 0, pol.X - 30, -1))
	G.CarSpawn(f, G.ParkingCF("X", 0, pol.X + 30, -1))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(pol.X - 40, GROUND, pol.Z + 33), SOUTH))
	G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(pol.X + 45, GROUND, pol.Z + 40), SOUTH))

	-- Fire station
	local fire = S.Fire
	ctx.Pave(f, Vector3.new(fire.X, 0, fire.Z + 40), 110, 24)
	G.Station(f, "Fire", P.Facing(Vector3.new(fire.X - 30, GROUND, fire.Z + 18), SOUTH), "Fire Station", Color3.fromRGB(180, 40, 40))
	G.CarSpawn(f, G.ParkingCF("X", 0, fire.X, -1))
	G.CarSpawn(f, G.ParkingCF("X", 0, fire.X + 40, -1))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(fire.X + 38, GROUND, fire.Z + 31), SOUTH))

	-- Hospital (front faces north onto Harbor St W)
	local hos = S.Hospital
	ctx.Pave(f, Vector3.new(hos.X, 0, hos.Z - 73.5), 180, 77)
	G.Station(f, "Paramedic", P.Facing(Vector3.new(hos.X - 20, GROUND, hos.Z - 26), NORTH), "Hospital", Color3.fromRGB(220, 60, 60))
	G.Target(f, "Paramedic", "Dropoff", P.Facing(Vector3.new(hos.X + 40, GROUND, hos.Z - 60), NORTH))
	G.CarSpawn(f, G.ParkingCF("X", 0, hos.X - 20, 1))
	G.CarSpawn(f, G.ParkingCF("X", 0, hos.X + 20, 1))
	G.ATM(f, P.Facing(Vector3.new(hos.X - 50, GROUND, hos.Z - 40), NORTH))
	G.Zone(f, Tags.SafeZone, CFrame.new(hos.X, 30, hos.Z - 20), Vector3.new(220, 60, 250), { Name = "Hospital" })
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(hos.X - 48, GROUND, hos.Z - 38), NORTH))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(hos.X - 70, GROUND, hos.Z - 80), NORTH))
	for i = 0, 2 do
		G.Bench(f, P.Facing(Vector3.new(hos.X - 80 + i * 8, GROUND, hos.Z - 44), NORTH))
	end

	-- City Hall + business lot
	local ch = S.CityHall
	ctx.Pave(f, Vector3.new(ch.X, 0, ch.Z - 30 - 26), 140, 52)
	G.Lot(f, "civic_1", P.StreetFacing(Vector3.new(ch.X, 0, 220), SOUTH), Vector3.new(64, 40, 64), "Office,RealEstateOffice,Restaurant")
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(ch.X + 30, GROUND, ch.Z - 34), NORTH))
	G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(ch.X, GROUND, ch.Z - 50), NORTH))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(ch.X - 40, GROUND, ch.Z - 46), NORTH))
end

function Civic.Decor(ctx)
	local P, B, G = ctx.Props, ctx.B, ctx.G
	local f = ctx.District("Civic")

	local pol = S.Police
	B.Hollow(f, {
		Name = "PoliceHQ",
		AssetId = "PoliceStation",
		Position = pol,
		Size = Vector3.new(100, 22, 60),
		Facing = SOUTH,
		Color = Color3.fromRGB(214, 218, 226),
		Trim = Color3.fromRGB(30, 50, 110),
		GlassFront = true,
		DoorWidth = 14,
		Sign = "🚓 SKYLINE POLICE",
		SignColor = Color3.fromRGB(110, 160, 255),
	})
	P.Small(f, "PoliceStripe", Vector3.new(101, 1.4, 61), CFrame.new(pol.X, GROUND + 15, pol.Z), Color3.fromRGB(40, 80, 200), Enum.Material.SmoothPlastic)
	P.Small(f, "FlagPole", Vector3.new(0.5, 26, 0.5), CFrame.new(pol.X + 55, 13, pol.Z + 44), Color3.fromRGB(200, 200, 205), Enum.Material.Metal)
	P.Small(f, "Flag", Vector3.new(6, 4, 0.1), CFrame.new(pol.X + 58.2, 23.5, pol.Z + 44), Color3.fromRGB(64, 156, 255), Enum.Material.Fabric)

	local fire = S.Fire
	B.Hollow(f, {
		Name = "FireStation",
		AssetId = "FireStation",
		Position = fire,
		Size = Vector3.new(90, 26, 56),
		Facing = SOUTH,
		Color = Color3.fromRGB(170, 52, 44),
		Trim = Color3.fromRGB(240, 236, 228),
		DoorWidth = 40,
		DoorHeight = 18,
		Sign = "🚒 FIRE STATION 1",
		SignColor = Color3.fromRGB(255, 220, 120),
	})
	P.Part(f, "HoseTower", Vector3.new(12, 44, 12), CFrame.new(fire.X - 52, 22, fire.Z + 10), Color3.fromRGB(160, 48, 40), Enum.Material.Brick)

	local hos = S.Hospital
	B.Hollow(f, {
		Name = "Hospital",
		AssetId = "Hospital",
		Position = hos,
		Size = Vector3.new(110, 30, 70),
		Facing = NORTH,
		Color = Color3.fromRGB(240, 242, 246),
		Trim = Color3.fromRGB(200, 50, 50),
		GlassFront = true,
		DoorWidth = 16,
		Sign = "✚ SKYLINE GENERAL HOSPITAL",
		SignColor = Color3.fromRGB(255, 80, 80),
	})
	B.Tower(f, {
		Name = "HospitalWing",
		Position = hos + Vector3.new(0, 0, 70),
		Size = Vector3.new(80, 70, 40),
		Facing = NORTH,
		Color = Color3.fromRGB(236, 238, 242),
		Glass = Color3.fromRGB(120, 170, 200),
		Crown = "None",
	})
	P.Cyl(f, "Helipad", 14, 0.4, CFrame.new(hos.X, 71.4, hos.Z + 70), Color3.fromRGB(60, 62, 70), Enum.Material.Concrete)
	P.Small(f, "HelipadH", Vector3.new(10, 0.1, 2), CFrame.new(hos.X, 71.65, hos.Z + 70), Color3.fromRGB(255, 255, 255))
	P.Small(f, "AmbulanceCanopy", Vector3.new(30, 1, 24), CFrame.new(hos.X + 40, 14, hos.Z - 58), Color3.fromRGB(220, 220, 226), Enum.Material.Metal)
	for _, x in ipairs({ -14, 14 }) do
		P.Small(f, "CanopyPost", Vector3.new(1, 13, 1), CFrame.new(hos.X + 40 + x, 7, hos.Z - 69), Color3.fromRGB(200, 200, 206), Enum.Material.Metal)
	end

	local ch = S.CityHall
	B.Box(f, {
		Name = "CityHall",
		AssetId = "CityHall",
		Position = ch,
		Size = Vector3.new(100, 28, 60),
		Facing = NORTH,
		Color = Color3.fromRGB(232, 226, 210),
		Trim = Color3.fromRGB(150, 140, 120),
		DoorWidth = 10,
		Sign = "🏛️ CITY HALL",
		SignColor = Color3.fromRGB(60, 50, 30),
		Crown = "Stepped",
		FrontOnly = true,
	})
	for i = 0, 7 do
		P.Part(f, "Column", Vector3.new(2.4, 22, 2.4), CFrame.new(ch.X - 42 + i * 12, GROUND + 11, ch.Z - 34), Color3.fromRGB(244, 240, 230), Enum.Material.Marble)
	end
	P.Part(f, "Portico", Vector3.new(100, 2, 10), CFrame.new(ch.X, GROUND + 23, ch.Z - 34), Color3.fromRGB(236, 230, 214), Enum.Material.Marble)
	for i = 0, 2 do
		P.Part(f, "Step", Vector3.new(60, 0.6, 3), CFrame.new(ch.X, GROUND + 0.3 + i * 0.6, ch.Z - 44 + i * 3), Color3.fromRGB(226, 222, 212), Enum.Material.Marble)
	end

	for _, p in ipairs({ Vector3.new(-860, 0, -40), Vector3.new(-640, 0, -40), Vector3.new(-540, 0, 250), Vector3.new(-360, 0, 250), Vector3.new(-860, 0, 250), Vector3.new(-640, 0, 250) }) do
		G.Tree(f, p)
	end
end

return Civic
