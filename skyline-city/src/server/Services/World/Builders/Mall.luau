-- Mall builder: Skyline Galleria (ClothingStore + FurnitureStore counters, food court with Cashier registers),
-- Skyline Diner (Chef job + stoves), Starlight Cinema, Arcade, mall car park and three business lots.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)

local Mall = {}

local Tags = World.Tags
local S = Layout.Sites
local GROUND = Layout.Heights.Ground
local NORTH, SOUTH = Vector3.new(0, 0, -1), Vector3.new(0, 0, 1)
local ASPHALT = Color3.fromRGB(44, 46, 52)

function Mall.Essential(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.District("Mall")
	local mall = S.Mall

	ctx.Pave(f, Vector3.new(mall.X, 0, -56.5), 244, 57)
	-- shops
	G.Counter(f, Tags.ClothingStore, P.Facing(Vector3.new(mall.X - 65, GROUND, -110), SOUTH), "👕 Threadline Apparel", Color3.fromRGB(230, 90, 140))
	G.Counter(f, Tags.FurnitureStore, P.Facing(Vector3.new(mall.X + 65, GROUND, -110), SOUTH), "🛋️ Nest & Co. Furniture", Color3.fromRGB(150, 110, 70))
	-- food court: cashier station between two rows of registers
	G.Station(f, "Cashier", P.Facing(Vector3.new(mall.X, GROUND, -212), SOUTH), "Galleria Food Court", Color3.fromRGB(70, 160, 90))
	for _, x in ipairs({ -6, 6 }) do
		G.Target(f, "Cashier", "Register", P.Facing(Vector3.new(mall.X + x, GROUND, -205), SOUTH))
		G.Target(f, "Cashier", "Register", P.Facing(Vector3.new(mall.X + x, GROUND, -219), NORTH))
	end
	-- food court tables
	for _, tx in ipairs({ -15, 15 }) do
		for _, tz in ipairs({ -160, -135 }) do
			local t = Vector3.new(mall.X + tx, GROUND, tz)
			P.Part(f, "Table", Vector3.new(5, 0.4, 5), CFrame.new(t + Vector3.new(0, 3, 0)), Color3.fromRGB(240, 240, 240), Enum.Material.SmoothPlastic)
			P.Small(f, "TableLeg", Vector3.new(0.6, 3, 0.6), CFrame.new(t + Vector3.new(0, 1.5, 0)), Color3.fromRGB(60, 60, 66), Enum.Material.Metal)
			for _, d in ipairs({ Vector3.new(4, 0, 0), Vector3.new(-4, 0, 0), Vector3.new(0, 0, 4), Vector3.new(0, 0, -4) }) do
				G.Chair(f, P.Facing(t + d, -d), Color3.fromRGB(240, 120, 60))
			end
		end
	end
	G.ATM(f, P.Facing(Vector3.new(mall.X - 30, GROUND, -92), SOUTH))
	G.Zone(f, Tags.SafeZone, CFrame.new(mall.X, 20, -130), Vector3.new(230, 40, 220), { Name = "Skyline Galleria" })
	G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(mall.X, GROUND, -50), SOUTH))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(mall.X - 50, GROUND, -40), SOUTH))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(mall.X + 70, GROUND, -81), SOUTH))
	G.CarSpawn(f, G.ParkingCF("Z", 300, -150, 1))
	G.CarSpawn(f, G.ParkingCF("Z", 300, -100, 1))

	-- Skyline Diner: chef station with three stoves along the back wall
	local dn = S.Diner
	ctx.Pave(f, Vector3.new(dn.X, 0, -91.5), 70, 127, ASPHALT, Enum.Material.Asphalt)
	G.Station(f, "Chef", P.Facing(Vector3.new(dn.X, GROUND, dn.Z - 12), NORTH), "Skyline Diner Kitchen", Color3.fromRGB(240, 240, 240))
	for _, p in ipairs({ Vector3.new(dn.X - 7, GROUND, dn.Z - 19), Vector3.new(dn.X, GROUND, dn.Z - 20), Vector3.new(dn.X + 7, GROUND, dn.Z - 19) }) do
		G.Target(f, "Chef", "Stove", P.Facing(p, SOUTH))
	end
	for i = 0, 3 do
		G.Chair(f, P.Facing(Vector3.new(dn.X - 24 + i * 6, GROUND, dn.Z + 12), NORTH), Color3.fromRGB(200, 40, 40))
	end
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(dn.X + 26, GROUND, dn.Z + 29), SOUTH))

	-- south blocks: lots + car park
	G.Lot(f, "mall_1", P.StreetFacing(Vector3.new(380, 0, 80), NORTH), Vector3.new(64, 40, 64), "*")
	G.Lot(f, "mall_2", P.StreetFacing(Vector3.new(520, 0, 80), NORTH), Vector3.new(64, 40, 64), "ClothingStore,Restaurant,*")
	G.Lot(f, "mall_3", P.StreetFacing(Vector3.new(700, 0, 80), NORTH), Vector3.new(64, 40, 64), "Nightclub,Restaurant,*")
	G.ATM(f, P.Facing(Vector3.new(450, 0, 45), NORTH))
	G.ATM(f, P.Facing(Vector3.new(780, 0, 45), NORTH))
	G.CarSpawn(f, G.ParkingCF("X", 0, 420, 1))
	G.CarSpawn(f, G.ParkingCF("X", 0, 480, 1))
	ctx.Pave(f, S.MallParking, 220, 110, ASPHALT, Enum.Material.Asphalt)
end

function Mall.Decor(ctx)
	local P, B, G = ctx.Props, ctx.B, ctx.G
	local f = ctx.District("Mall")
	local mall = S.Mall

	local res = B.Hollow(f, {
		Name = "SkylineGalleria",
		AssetId = "Mall",
		Position = mall,
		Size = Vector3.new(200, 30, 150),
		Facing = SOUTH,
		Color = Color3.fromRGB(236, 232, 240),
		Trim = Color3.fromRGB(120, 70, 150),
		GlassFront = true,
		DoorWidth = 30,
		DoorHeight = 16,
		Sign = "🛍️ SKYLINE GALLERIA",
		SignColor = Color3.fromRGB(230, 150, 255),
		Floor = Color3.fromRGB(232, 228, 222),
	})
	if res.Model and res.Model:IsA("Model") then
		-- interior partitions: clothing wing (west), food court (centre), furniture wing (east)
		for _, x in ipairs({ -30, 30 }) do
			P.Part(f, "Partition", Vector3.new(0.8, 16, 90), CFrame.new(mall.X + x, GROUND + 8, -189), Color3.fromRGB(210, 206, 214), Enum.Material.SmoothPlastic)
		end
		-- clothing racks + mannequins
		for i = 0, 4 do
			P.Small(f, "ClothingRack", Vector3.new(8, 5, 1), CFrame.new(mall.X - 85 + (i % 2) * 20, GROUND + 2.5, -140 - i * 16), Color3.fromRGB(80, 80, 86), Enum.Material.Metal)
			P.Small(f, "Clothes", Vector3.new(7, 3, 1.6), CFrame.new(mall.X - 85 + (i % 2) * 20, GROUND + 3, -140 - i * 16), Color3.fromRGB(80 + i * 30, 120, 200 - i * 20), Enum.Material.Fabric)
		end
		for i = 0, 2 do
			local p = Vector3.new(mall.X - 50, GROUND, -125 - i * 12)
			P.Small(f, "MannequinBody", Vector3.new(2, 4, 1), CFrame.new(p + Vector3.new(0, 3, 0)), Color3.fromRGB(240, 240, 240))
			P.Ball(f, "MannequinHead", 1.4, CFrame.new(p + Vector3.new(0, 5.8, 0)), Color3.fromRGB(240, 240, 240)).CastShadow = false
		end
		-- furniture showroom vignettes
		for i = 0, 3 do
			local p = Vector3.new(mall.X + 60 + (i % 2) * 22, GROUND, -140 - math.floor(i / 2) * 30)
			P.Small(f, "DisplaySofa", Vector3.new(10, 2, 4), CFrame.new(p + Vector3.new(0, 1, 0)), Color3.fromRGB(90 + i * 30, 110, 150), Enum.Material.Fabric)
			P.Small(f, "DisplaySofaBack", Vector3.new(10, 3, 1), CFrame.new(p + Vector3.new(0, 2.5, 1.6)), Color3.fromRGB(80 + i * 30, 100, 140), Enum.Material.Fabric)
			P.Small(f, "DisplayRug", Vector3.new(14, 0.1, 10), CFrame.new(p + Vector3.new(0, 0.05, -4)), Color3.fromRGB(220, 200, 170), Enum.Material.Fabric, { CanCollide = false })
		end
		-- food court kiosk backdrop
		P.Part(f, "KioskBack", Vector3.new(40, 12, 1), CFrame.new(mall.X, GROUND + 6, -232), Color3.fromRGB(60, 160, 90), Enum.Material.SmoothPlastic)
		local menu = P.Small(f, "Menu", Vector3.new(24, 4, 0.4), P.Facing(Vector3.new(mall.X, GROUND + 10, -231.3), SOUTH), Color3.fromRGB(20, 20, 26))
		P.Sign(menu, "🍔 FOOD COURT 🍕", { TextColor = Color3.fromRGB(255, 220, 80) })
		-- skylight strip
		P.Small(f, "Skylight", Vector3.new(160, 0.4, 20), CFrame.new(mall.X, GROUND + 30.4, -160), Color3.fromRGB(180, 220, 255), Enum.Material.Glass, { Transparency = 0.4, CanCollide = false })
	end
	-- plaza planters
	for i = 0, 3 do
		local p = Vector3.new(mall.X - 90 + i * 60, 0, -50)
		P.Part(f, "Planter", Vector3.new(8, 1.6, 8), CFrame.new(p.X, GROUND + 0.8, p.Z), Color3.fromRGB(150, 146, 140), Enum.Material.Concrete)
		G.Tree(f, p + Vector3.new(0, GROUND + 1.6, 0), 1)
	end

	-- diner
	B.Hollow(f, {
		Name = "SkylineDiner",
		AssetId = "Diner",
		Position = S.Diner,
		Size = Vector3.new(70, 18, 50),
		Facing = SOUTH,
		Color = Color3.fromRGB(240, 240, 236),
		Trim = Color3.fromRGB(200, 40, 40),
		GlassFront = true,
		DoorWidth = 10,
		Sign = "🍳 SKYLINE DINER",
		SignColor = Color3.fromRGB(255, 80, 80),
		Floor = Color3.fromRGB(230, 230, 230),
	})
	local dn = S.Diner
	P.Part(f, "KitchenCounter", Vector3.new(40, 3.6, 2), CFrame.new(dn.X, GROUND + 1.8, dn.Z - 6), Color3.fromRGB(190, 190, 196), Enum.Material.Metal)
	P.Small(f, "CheckerFloor", Vector3.new(66, 0.06, 20), CFrame.new(dn.X, GROUND + 0.03, dn.Z + 12), Color3.fromRGB(30, 30, 30), Enum.Material.SmoothPlastic, { CanCollide = false })
	for i = 0, 5 do
		P.Small(f, "ParkLine", Vector3.new(0.4, 0.06, 18), CFrame.new(dn.X - 30 + i * 12, GROUND + 0.03, -60), Color3.fromRGB(235, 235, 235), Enum.Material.SmoothPlastic, { CanCollide = false })
	end

	B.Box(f, {
		Name = "StarlightCinema",
		AssetId = "Cinema",
		Position = S.Cinema,
		Size = Vector3.new(70, 30, 80),
		Facing = SOUTH,
		Color = Color3.fromRGB(60, 30, 50),
		Trim = Color3.fromRGB(30, 16, 26),
		Sign = "🎬 STARLIGHT CINEMA",
		SignColor = Color3.fromRGB(255, 220, 120),
		DoorWidth = 12,
		FrontOnly = true,
	})
	local cn = S.Cinema
	P.Small(f, "Marquee", Vector3.new(50, 2, 6), CFrame.new(cn.X, 12, cn.Z + 43), Color3.fromRGB(255, 220, 120), Enum.Material.Neon)

	B.Box(f, {
		Name = "PixelArcade",
		AssetId = "Arcade",
		Position = S.Arcade,
		Size = Vector3.new(70, 20, 60),
		Facing = NORTH,
		Color = Color3.fromRGB(40, 30, 80),
		Trim = Color3.fromRGB(20, 16, 40),
		Sign = "👾 PIXEL ARCADE",
		SignColor = Color3.fromRGB(120, 255, 200),
		FrontOnly = true,
	})

	-- car park lines
	local mp = S.MallParking
	for row = 0, 1 do
		for i = 0, 15 do
			P.Small(f, "ParkLine", Vector3.new(0.4, 0.06, 18), CFrame.new(mp.X - 100 + i * 13, GROUND + 0.03, mp.Z - 30 + row * 60), Color3.fromRGB(235, 235, 235), Enum.Material.SmoothPlastic, { CanCollide = false })
		end
	end
	for _, p in ipairs({ Vector3.new(mp.X - 106, 0, mp.Z), Vector3.new(mp.X + 106, 0, mp.Z) }) do
		G.ParkLamp(f, p + Vector3.new(0, GROUND, 0))
	end
end

return Mall
