-- Downtown builder: apartment towers (Studio x24, Apartment x16), The Spire (Penthouse x6 + Sky Apartment x4 behind
-- an ExclusiveApartments elevator), office skyscrapers with an enterable lobby, the bank, Skyline Realty,
-- Club Aurora (VIPArea + VIPDoor) and the VIP premium car park.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)
local VehiclesConfig = require(Shared.Config.Vehicles)

local Downtown = {}

local Tags = World.Tags
local S = Layout.Sites
local GROUND = Layout.Heights.Ground
local WALK_Y = Layout.Heights.Sidewalk
local NORTH, SOUTH, EAST, WEST = Vector3.new(0, 0, -1), Vector3.new(0, 0, 1), Vector3.new(1, 0, 0), Vector3.new(-1, 0, 0)
local GOLD = Color3.fromRGB(255, 196, 40)

local function studioLevels()
	local out = {}
	for i = 1, 6 do
		table.insert(out, { Tier = "Studio", Count = 4, Height = 16, Label = "Floor " .. (i + 1) })
	end
	return out
end

local function apartmentLevels()
	local out = {}
	for i = 1, 4 do
		table.insert(out, { Tier = "Apartment", Count = 4, Height = 16, Label = "Floor " .. (i + 1) })
	end
	return out
end

local function vipDoor(P, parent: Instance, cf: CFrame, size: Vector3, inside: CFrame, outside: CFrame, name: string)
	local door = P.Part(parent, name, size, cf, GOLD, Enum.Material.Glass, { Transparency = 0.35, CastShadow = false })
	P.Tag(door, Tags.VIPDoor, { InsideCFrame = inside, OutsideCFrame = outside })
	P.Billboard(door, "👑 VIP ONLY", { Offset = Vector3.new(0, size.Y / 2 + 2, 0), MaxDistance = 60, TextColor = GOLD })
	return door
end

function Downtown.Essential(ctx)
	local P, B, G = ctx.Props, ctx.B, ctx.G
	local f = ctx.District("Downtown")

	-- apartment towers (pads + elevators are gameplay-critical, so the whole tower is built now)
	B.Apartment(f, {
		Name = "SkylineResidences",
		Prefix = "dt_res",
		Position = S.StudioTower,
		Facing = WEST,
		Levels = studioLevels(),
		Color = Color3.fromRGB(214, 206, 196),
		Glass = Color3.fromRGB(130, 170, 200),
		Accent = Color3.fromRGB(255, 190, 110),
		Sign = "SKYLINE RESIDENCES",
		Crown = "Flat",
	}, G)
	ctx.Pave(f, Vector3.new(-252.5, 0, S.StudioTower.Z), 39, 24)

	B.Apartment(f, {
		Name = "HarborPoint",
		Prefix = "dt_hp",
		Position = S.ApartmentTower,
		Facing = WEST,
		Levels = apartmentLevels(),
		Color = Color3.fromRGB(70, 76, 90),
		Glass = Color3.fromRGB(110, 150, 190),
		Accent = Color3.fromRGB(120, 210, 255),
		Sign = "HARBOR POINT",
		Crown = "Stepped",
	}, G)
	ctx.Pave(f, Vector3.new(-255.5, 0, S.ApartmentTower.Z), 33, 24)

	B.Apartment(f, {
		Name = "TheSpire",
		Prefix = "dt_spire",
		Position = S.Spire,
		Facing = SOUTH,
		LobbyHeight = 20,
		PodiumHeight = 120,
		Levels = {
			{ Tier = "Penthouse", Count = 4, Height = 30, Label = "Penthouse Level 1" },
			{ Tier = "Penthouse", Count = 2, Height = 30, Label = "Penthouse Level 2" },
			{ Tier = "SkyApartment", Count = 4, Height = 32, Label = "👑 Sky Level", RequiresPass = "ExclusiveApartments" },
		},
		Color = Color3.fromRGB(40, 44, 56),
		Glass = Color3.fromRGB(80, 120, 170),
		Accent = Color3.fromRGB(140, 220, 255),
		Sign = "THE SPIRE",
		Crown = "Spire",
	}, G)
	ctx.Pave(f, Vector3.new(S.Spire.X, 0, -659.5), 200, 63)
	G.ATM(f, P.Facing(Vector3.new(S.Spire.X + 40, GROUND, -672), SOUTH))
	G.CarSpawn(f, G.ParkingCF("X", -600, S.Spire.X - 30, -1))
	G.CarSpawn(f, G.ParkingCF("X", -600, S.Spire.X + 30, -1))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(S.Spire.X - 50, GROUND, -686), SOUTH))
	G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(S.Spire.X, GROUND, -640), SOUTH))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(S.Spire.X + 70, GROUND, -650), SOUTH))

	-- bank (front faces east onto Central Ave N)
	local bank = S.Bank
	ctx.Pave(f, Vector3.new(-43, 0, bank.Z), 30, 60)
	G.BankCounter(f, P.Facing(Vector3.new(bank.X - 12, GROUND, bank.Z), EAST))
	G.ATM(f, P.Facing(Vector3.new(-44, GROUND, bank.Z - 16), EAST))
	G.ATM(f, P.Facing(Vector3.new(-44, GROUND, bank.Z + 16), EAST))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(-50, GROUND, bank.Z + 26), EAST))

	-- realty office (front faces south onto Plaza St N)
	local re = S.Realty
	ctx.Pave(f, Vector3.new(re.X, 0, -355), 60, 54)
	G.Station(f, "RealEstate", P.Facing(Vector3.new(re.X, GROUND, re.Z + 8), SOUTH), "Skyline Realty", Color3.fromRGB(150, 100, 200))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(re.X + 24, GROUND, -340), SOUTH))

	-- business lot
	G.Lot(f, "dt_1", P.StreetFacing(Vector3.new(80, 0, -520), WEST), Vector3.new(64, 40, 64), "*")

	-- Club Aurora (VIP lounge & club)
	local club = S.Club
	local clubCF = P.Facing(Vector3.new(club.X, 0, club.Z), SOUTH)
	local inside = clubCF * CFrame.new(0, GROUND + 3, -30 + 8)
	local outside = clubCF * CFrame.new(0, GROUND + 3, -30 - 8)
	ctx.Pave(f, Vector3.new(club.X, 0, -349), 100, 42)
	vipDoor(P, f, clubCF * CFrame.new(0, GROUND + 5, -30 + 0.5), Vector3.new(10, 10, 1), inside, outside, "ClubVIPDoor")
	G.Zone(f, Tags.VIPArea, clubCF * CFrame.new(0, GROUND + 12, 0), Vector3.new(78, 24, 58), { Name = "Club Aurora", ExitCFrame = outside })
	G.Zone(f, Tags.PartyZone, clubCF * CFrame.new(0, GROUND + 12, 0), Vector3.new(78, 24, 58), { Zone = "Club", Active = true, Name = "Club Aurora" })
	-- lounge seating along the west wall, facing the dance floor
	for i = 0, 5 do
		local z = -15 + i * 6
		G.Chair(f, clubCF * CFrame.new(-34, GROUND, z) * CFrame.Angles(0, -math.pi / 2, 0), Color3.fromRGB(120, 40, 160))
	end

	-- VIP premium car park (gate on the east side, onto Market Ave)
	local vp = S.VipParking
	ctx.Pave(f, vp, 80, 70, Color3.fromRGB(40, 42, 48), Enum.Material.Asphalt)
	ctx.Pave(f, Vector3.new(256, 0, vp.Z), 32, 18, Color3.fromRGB(40, 42, 48), Enum.Material.Asphalt)
	local gateCF = P.Facing(Vector3.new(vp.X + 40.5, GROUND + 3.5, vp.Z), EAST)
	vipDoor(P, f, gateCF, Vector3.new(16, 6, 1), CFrame.new(vp.X + 28, GROUND + 3, vp.Z), CFrame.new(vp.X + 56, GROUND + 3, vp.Z), "ParkingVIPGate")
	G.Zone(f, Tags.VIPArea, CFrame.new(vp.X, 15, vp.Z), Vector3.new(80, 30, 70), { Name = "VIP Car Park", ExitCFrame = CFrame.new(vp.X + 60, GROUND + 3, vp.Z) })
	-- reserved VIP bays (12): invisible markers between the gold bay lines, nose towards the aisle.
	-- Vehicles/Showcase assigns one to every VIP online and delivers their car here for free.
	local bayTag = VehiclesConfig.VipParking and VehiclesConfig.VipParking.BayTag or "VipParkingBay"
	local bay = 0
	for _, row in ipairs({ { -24, SOUTH }, { 24, NORTH } }) do
		for j = 0, 5 do
			bay += 1
			local pos = Vector3.new(vp.X - 30.5 + j * 11, GROUND + 0.5, vp.Z + row[1])
			P.Volume(f, "VipBay" .. bay, CFrame.lookAt(pos, pos + row[2]), Vector3.new(10, 1, 18), bayTag, { Bay = bay })
		end
	end
end

function Downtown.Decor(ctx)
	local P, B, G = ctx.Props, ctx.B, ctx.G
	local f = ctx.District("Downtown")

	-- office skyscrapers
	B.Tower(f, { Name = "Meridian Tower", AssetId = "OfficeTower1", Position = Vector3.new(-80, 0, -820), Size = Vector3.new(56, 200, 56), Facing = EAST, Color = Color3.fromRGB(220, 222, 226), Glass = Color3.fromRGB(60, 100, 150), Accent = Color3.fromRGB(110, 200, 255), Lobby = true, Crown = "Antenna", Sign = "MERIDIAN" })
	B.Tower(f, { Name = "Copperline", AssetId = "OfficeTower2", Position = Vector3.new(-80, 0, -690), Size = Vector3.new(50, 130, 50), Facing = EAST, Color = Color3.fromRGB(150, 100, 70), Glass = Color3.fromRGB(90, 120, 140), Crown = "Stepped" })
	B.Tower(f, { Name = "Northgate Plaza", AssetId = "OfficeTower3", Position = Vector3.new(80, 0, -400), Size = Vector3.new(50, 140, 50), Facing = WEST, Color = Color3.fromRGB(230, 230, 236), Glass = Color3.fromRGB(70, 130, 120), Accent = Color3.fromRGB(120, 255, 200), Crown = "Flat" })
	B.Tower(f, { Name = "Beacon Point", AssetId = "OfficeTower4", Position = Vector3.new(250, 0, -860), Size = Vector3.new(36, 100, 20), Facing = SOUTH, Color = Color3.fromRGB(200, 200, 206), Glass = Color3.fromRGB(80, 110, 160), Crown = "Flat" })
	B.Tower(f, { Name = "Sterling Court", AssetId = "OfficeTower5", Position = Vector3.new(50, 0, -860), Size = Vector3.new(40, 90, 20), Facing = SOUTH, Color = Color3.fromRGB(170, 170, 176), Glass = Color3.fromRGB(100, 120, 150), Accent = Color3.fromRGB(255, 160, 90), Crown = "Antenna" })

	-- bank + realty buildings
	B.Hollow(f, {
		Name = "SkylineBank",
		AssetId = "Bank",
		Position = S.Bank,
		Size = Vector3.new(60, 22, 44),
		Facing = EAST,
		Color = Color3.fromRGB(236, 232, 220),
		Trim = Color3.fromRGB(30, 90, 60),
		GlassFront = true,
		DoorWidth = 12,
		Sign = "🏦 SKYLINE SAVINGS & TRUST",
		SignColor = Color3.fromRGB(120, 230, 160),
	})
	B.Hollow(f, {
		Name = "SkylineRealty",
		AssetId = "RealtyOffice",
		Position = S.Realty,
		Size = Vector3.new(50, 16, 36),
		Facing = SOUTH,
		Color = Color3.fromRGB(245, 245, 248),
		Trim = Color3.fromRGB(110, 70, 160),
		GlassFront = true,
		DoorWidth = 10,
		Sign = "🏡 SKYLINE REALTY",
		SignColor = Color3.fromRGB(200, 160, 255),
	})

	-- Club Aurora building + interior
	local club = S.Club
	local res = B.Hollow(f, {
		Name = "ClubAurora",
		AssetId = "Club",
		Position = club,
		Size = Vector3.new(80, 24, 60),
		Facing = SOUTH,
		Color = Color3.fromRGB(26, 22, 34),
		Trim = Color3.fromRGB(14, 12, 18),
		DoorWidth = 10,
		DoorHeight = 10,
		Sign = "👑 CLUB AURORA",
		SignColor = GOLD,
		Floor = Color3.fromRGB(20, 18, 26),
	})
	local cf = res.CFrame
	local tileColors = { Color3.fromRGB(255, 60, 160), Color3.fromRGB(80, 160, 255), Color3.fromRGB(150, 90, 255), Color3.fromRGB(60, 230, 200) }
	for ix = 0, 4 do
		for iz = 0, 3 do
			P.Small(f, "DanceTile", Vector3.new(5.8, 0.1, 5.8), cf * CFrame.new(-12 + ix * 6, GROUND + 0.05, -9 + iz * 6), tileColors[((ix + iz) % #tileColors) + 1], Enum.Material.Neon, { CanCollide = false })
		end
	end
	P.Part(f, "Bar", Vector3.new(30, 3.6, 3), cf * CFrame.new(-18, GROUND + 1.8, 18), Color3.fromRGB(60, 40, 30), Enum.Material.Wood)
	P.Small(f, "BarGlow", Vector3.new(30, 0.3, 3.2), cf * CFrame.new(-18, GROUND + 3.75, 18), GOLD, Enum.Material.Neon)
	P.Part(f, "DJBooth", Vector3.new(12, 4, 4), cf * CFrame.new(20, GROUND + 2, 22), Color3.fromRGB(20, 20, 24), Enum.Material.SmoothPlastic)
	P.Small(f, "DJGlow", Vector3.new(12, 0.4, 0.4), cf * CFrame.new(20, GROUND + 4.2, 20), Color3.fromRGB(255, 60, 160), Enum.Material.Neon)
	for _, x in ipairs({ -36, 36 }) do
		local l = P.Small(f, "ClubLight", Vector3.new(1, 1, 1), cf * CFrame.new(x, GROUND + 20, 0), Color3.fromRGB(150, 90, 255), Enum.Material.Neon)
		local pl = Instance.new("PointLight")
		pl.Color = Color3.fromRGB(170, 90, 255)
		pl.Range = 40
		pl.Brightness = 2
		pl.Parent = l
	end
	P.Small(f, "RedCarpet", Vector3.new(8, 0.1, 30), CFrame.new(club.X, GROUND + 0.05, -355), Color3.fromRGB(170, 20, 30), Enum.Material.Fabric, { CanCollide = false })
	for _, x in ipairs({ -6, 6 }) do
		for i = 0, 3 do
			P.Small(f, "RopePost", Vector3.new(0.6, 3, 0.6), CFrame.new(club.X + x, GROUND + 1.5, -362 + i * 8), GOLD, Enum.Material.Metal)
		end
	end

	-- VIP car park walls, bays and sign
	local vp = S.VipParking
	local wall = Color3.fromRGB(30, 30, 36)
	P.Part(f, "ParkWall", Vector3.new(80, 3, 1), CFrame.new(vp.X, GROUND + 1.5, vp.Z - 35), wall, Enum.Material.Concrete)
	P.Part(f, "ParkWall", Vector3.new(80, 3, 1), CFrame.new(vp.X, GROUND + 1.5, vp.Z + 35), wall, Enum.Material.Concrete)
	P.Part(f, "ParkWall", Vector3.new(1, 3, 70), CFrame.new(vp.X - 40, GROUND + 1.5, vp.Z), wall, Enum.Material.Concrete)
	P.Part(f, "ParkWall", Vector3.new(1, 3, 27), CFrame.new(vp.X + 40, GROUND + 1.5, vp.Z - 21.5), wall, Enum.Material.Concrete)
	P.Part(f, "ParkWall", Vector3.new(1, 3, 27), CFrame.new(vp.X + 40, GROUND + 1.5, vp.Z + 21.5), wall, Enum.Material.Concrete)
	for i = 0, 6 do
		P.Small(f, "BayLine", Vector3.new(0.4, 0.06, 18), CFrame.new(vp.X - 36 + i * 11, GROUND + 0.03, vp.Z - 24), GOLD, Enum.Material.Neon, { CanCollide = false })
		P.Small(f, "BayLine", Vector3.new(0.4, 0.06, 18), CFrame.new(vp.X - 36 + i * 11, GROUND + 0.03, vp.Z + 24), GOLD, Enum.Material.Neon, { CanCollide = false })
	end
	local sign = P.Part(f, "VipParkingSign", Vector3.new(20, 4, 0.5), P.Facing(Vector3.new(vp.X + 41, GROUND + 9, vp.Z), EAST), Color3.fromRGB(20, 20, 26))
	P.Sign(sign, "👑 VIP PARKING — FREE", { TextColor = GOLD })
	for _, z in ipairs({ -9, 9 }) do
		P.Small(f, "SignPost", Vector3.new(0.5, 7, 0.5), CFrame.new(vp.X + 41, GROUND + 3.5, vp.Z + z), Color3.fromRGB(60, 60, 66), Enum.Material.Metal)
	end

	-- planters / street trees
	for _, p in ipairs({ Vector3.new(-40, 0, -640), Vector3.new(-260, 0, -640), Vector3.new(40, 0, -340), Vector3.new(260, 0, -560), Vector3.new(-260, 0, -560), Vector3.new(-40, 0, -860) }) do
		P.Part(f, "Planter", Vector3.new(8, 1.6, 8), CFrame.new(p.X, 0.8, p.Z), Color3.fromRGB(150, 146, 140), Enum.Material.Concrete)
		G.Tree(f, p + Vector3.new(0, 1.6, 0), 3)
	end
end

return Downtown
