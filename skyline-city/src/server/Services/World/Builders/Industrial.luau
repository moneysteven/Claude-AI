-- Industrial builder: Ironworks construction yard (Construction job + ConstructionSite targets + cranes),
-- warehouses, container yard, smokestack, Checker Cab taxi depot and two business lots.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Layout = require(Shared.Config.CityLayout)

local Industrial = {}

local S = Layout.Sites
local GROUND = Layout.Heights.Ground
local SOUTH, EAST = Vector3.new(0, 0, 1), Vector3.new(1, 0, 0)

local SITES = {
	Vector3.new(-800, 0, -800),
	Vector3.new(-700, 0, -800),
	Vector3.new(-800, 0, -700),
	Vector3.new(-540, 0, -690),
}

function Industrial.Essential(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.District("Industrial")
	local yard = S.ConstructionYard

	-- construction office (station faces the street so workers walk straight in)
	local stationPos = Vector3.new(yard.X + 50, GROUND, yard.Z + 100)
	ctx.Pave(f, Vector3.new(yard.X + 50, 0, yard.Z + 108), 40, 28)
	G.Station(f, "Construction", P.Facing(stationPos, SOUTH), "Ironworks Construction", Color3.fromRGB(240, 170, 40))
	for _, site in ipairs(SITES) do
		ctx.Pave(f, site, 34, 34, Color3.fromRGB(150, 150, 150), Enum.Material.Concrete)
		G.Target(f, "Construction", "ConstructionSite", P.Facing(site + Vector3.new(0, GROUND, 10), (stationPos - site)))
	end
	G.CarSpawn(f, G.ParkingCF("X", -600, yard.X + 40, -1))
	G.CarSpawn(f, G.ParkingCF("X", -600, yard.X - 20, -1))

	-- business lots
	G.Lot(f, "ind_1", P.StreetFacing(Vector3.new(-400, 0, -660), SOUTH), Vector3.new(64, 40, 64), "*")
	G.Lot(f, "ind_2", P.StreetFacing(Vector3.new(-750, 0, -380), SOUTH), Vector3.new(64, 40, 64), "*")

	-- taxi depot (front faces east onto Civic Ave)
	local taxi = S.TaxiDepot
	ctx.Pave(f, Vector3.new(-386, 0, taxi.Z), 117, 100)
	G.Station(f, "Taxi", P.Facing(Vector3.new(taxi.X + 45, GROUND, taxi.Z + 10), EAST), "Checker Cab Depot", Color3.fromRGB(250, 200, 40))
	G.CarSpawn(f, G.ParkingCF("Z", -300, taxi.Z - 20, -1))
	G.CarSpawn(f, G.ParkingCF("Z", -300, taxi.Z + 20, -1))
	G.ATM(f, P.Facing(Vector3.new(taxi.X + 45, GROUND, taxi.Z - 30), EAST))

	-- fire hazards at the warehouses
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(S.Warehouses.X + 30, 0, S.Warehouses.Z + 38), SOUTH))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(-770, 0, -466), SOUTH))
	G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(-623, Layout.Heights.Sidewalk, -480), -EAST))
end

local function crane(P, f: Instance, base: Vector3, height: number, yaw: number)
	local yellow = Color3.fromRGB(245, 190, 30)
	local cf = CFrame.new(base) * CFrame.Angles(0, yaw, 0)
	P.Part(f, "CraneBase", Vector3.new(10, 2, 10), cf * CFrame.new(0, 1, 0), Color3.fromRGB(120, 120, 124), Enum.Material.Concrete)
	P.Part(f, "CraneMast", Vector3.new(3, height, 3), cf * CFrame.new(0, 2 + height / 2, 0), yellow, Enum.Material.DiamondPlate)
	P.Part(f, "CraneJib", Vector3.new(2.5, 2.5, 70), cf * CFrame.new(0, height + 3, -30), yellow, Enum.Material.DiamondPlate)
	P.Part(f, "CraneCounterJib", Vector3.new(2.5, 2.5, 22), cf * CFrame.new(0, height + 3, 14), yellow, Enum.Material.DiamondPlate)
	P.Part(f, "Counterweight", Vector3.new(5, 5, 6), cf * CFrame.new(0, height + 1, 22), Color3.fromRGB(110, 110, 114), Enum.Material.Concrete)
	P.Part(f, "CraneCab", Vector3.new(4, 4, 4), cf * CFrame.new(2.5, height + 0.5, -1), Color3.fromRGB(230, 230, 230), Enum.Material.SmoothPlastic)
	P.Small(f, "CraneTop", Vector3.new(1.4, 10, 1.4), cf * CFrame.new(0, height + 9, 0), yellow, Enum.Material.DiamondPlate)
	P.Small(f, "CraneCable", Vector3.new(0.25, 36, 0.25), cf * CFrame.new(0, height - 16, -50), Color3.fromRGB(40, 40, 40), Enum.Material.Metal)
	P.Small(f, "CraneHook", Vector3.new(2, 2, 2), cf * CFrame.new(0, height - 35, -50), Color3.fromRGB(200, 60, 40), Enum.Material.Metal)
end

function Industrial.Decor(ctx)
	local P, B, G = ctx.Props, ctx.B, ctx.G
	local f = ctx.District("Industrial")
	local yard = S.ConstructionYard

	-- yard: dirt ground + fence
	P.Part(f, "YardGround", Vector3.new(240, 0.2, 240), CFrame.new(yard.X, 0.1, yard.Z), Color3.fromRGB(150, 120, 86), Enum.Material.Ground, { CastShadow = false })
	local fenceColor = Color3.fromRGB(150, 150, 150)
	local fenceExtra = { Transparency = 0.4 }
	P.Small(f, "Fence", Vector3.new(240, 6, 0.3), CFrame.new(yard.X, 3, yard.Z - 120), fenceColor, Enum.Material.DiamondPlate, fenceExtra)
	for _, side in ipairs({ -1, 1 }) do
		P.Small(f, "Fence", Vector3.new(0.3, 6, 240), CFrame.new(yard.X + side * 120, 3, yard.Z), fenceColor, Enum.Material.DiamondPlate, fenceExtra)
	end
	-- south fence with a gate opening in front of the site office
	P.Small(f, "Fence", Vector3.new(150, 6, 0.3), CFrame.new(yard.X - 45, 3, yard.Z + 120), fenceColor, Enum.Material.DiamondPlate, fenceExtra)
	P.Small(f, "Fence", Vector3.new(50, 6, 0.3), CFrame.new(yard.X + 95, 3, yard.Z + 120), fenceColor, Enum.Material.DiamondPlate, fenceExtra)
	-- scaffolding frames on each construction site
	for i, site in ipairs(SITES) do
		local h = 14 + (i % 2) * 10
		for _, sx in ipairs({ -1, 1 }) do
			for _, sz in ipairs({ -1, 1 }) do
				P.Small(f, "Scaffold", Vector3.new(0.8, h, 0.8), CFrame.new(site.X + sx * 14, h / 2 + GROUND, site.Z + sz * 14), Color3.fromRGB(200, 120, 40), Enum.Material.Metal)
			end
		end
		P.Small(f, "Beam", Vector3.new(29, 0.8, 0.8), CFrame.new(site.X, h + GROUND, site.Z - 14), Color3.fromRGB(200, 120, 40), Enum.Material.Metal)
		P.Small(f, "Beam", Vector3.new(29, 0.8, 0.8), CFrame.new(site.X, h + GROUND, site.Z + 14), Color3.fromRGB(200, 120, 40), Enum.Material.Metal)
		P.Small(f, "Deck", Vector3.new(29, 0.4, 6), CFrame.new(site.X, h * 0.5 + GROUND, site.Z - 14), Color3.fromRGB(150, 110, 70), Enum.Material.WoodPlanks)
		P.Small(f, "Cone", Vector3.new(1, 2, 1), CFrame.new(site.X - 16, 1 + GROUND, site.Z + 17), Color3.fromRGB(255, 120, 30))
	end
	crane(P, f, Vector3.new(yard.X, 0, yard.Z), 92, 0)
	crane(P, f, Vector3.new(yard.X + 90, 0, yard.Z - 70), 70, math.rad(140))
	-- site office trailer behind the station
	P.Part(f, "SiteOffice", Vector3.new(30, 10, 12), CFrame.new(yard.X + 50, 5, yard.Z + 86), Color3.fromRGB(230, 230, 220), Enum.Material.SmoothPlastic)
	local sign = P.Small(f, "SiteSign", Vector3.new(24, 4, 0.5), P.Facing(Vector3.new(yard.X + 50, 8, yard.Z + 92.4), SOUTH), Color3.fromRGB(240, 170, 40))
	P.Sign(sign, "🏗️ IRONWORKS CONSTRUCTION", { TextColor = Color3.fromRGB(30, 24, 10), Stroke = false })

	-- warehouses
	local wh = S.Warehouses
	B.Box(f, { Name = "Warehouse1", AssetId = "Warehouse", Position = wh, Size = Vector3.new(100, 28, 70), Facing = SOUTH, Color = Color3.fromRGB(150, 160, 170), Material = Enum.Material.CorrodedMetal, Sign = "SKYLINE LOGISTICS", DoorWidth = 20 })
	for i = 0, 2 do
		P.Small(f, "LoadingDoor", Vector3.new(14, 14, 0.4), CFrame.new(wh.X - 30 + i * 30, 7, wh.Z + 35.3), Color3.fromRGB(90, 96, 104), Enum.Material.DiamondPlate)
	end
	B.Box(f, { Name = "Warehouse2", AssetId = "Warehouse", Position = Vector3.new(-790, 0, -500), Size = Vector3.new(90, 24, 60), Facing = SOUTH, Color = Color3.fromRGB(176, 150, 120), Material = Enum.Material.CorrodedMetal, Sign = "HARBOR FREIGHT CO.", DoorWidth = 18 })
	-- container stacks
	local colors = { Color3.fromRGB(190, 60, 50), Color3.fromRGB(40, 110, 170), Color3.fromRGB(60, 140, 80), Color3.fromRGB(220, 160, 40), Color3.fromRGB(120, 120, 130) }
	local n = 0
	for row = 0, 2 do
		for stack = 0, 1 do
			for level = 0, 1 - (row % 2) do
				n += 1
				P.Part(f, "Container", Vector3.new(8, 8.5, 20), CFrame.new(-700 + stack * 9, 4.25 + level * 8.5, -520 + row * 24), colors[(n % #colors) + 1], Enum.Material.CorrodedMetal)
			end
		end
	end
	P.Cyl(f, "Smokestack", 6, 80, CFrame.new(-850, 40, -560), Color3.fromRGB(150, 96, 80), Enum.Material.Brick)
	P.Cyl(f, "SmokestackBand", 6.3, 3, CFrame.new(-850, 72, -560), Color3.fromRGB(240, 240, 240), Enum.Material.SmoothPlastic)
	local top = P.Cyl(f, "SmokestackTop", 5.5, 1, CFrame.new(-850, 80.5, -560), Color3.fromRGB(40, 40, 40), Enum.Material.Metal)
	local smoke = Instance.new("Smoke")
	smoke.Color = Color3.fromRGB(200, 200, 200)
	smoke.Opacity = 0.15
	smoke.RiseVelocity = 6
	smoke.Size = 8
	smoke.Parent = top

	-- taxi depot
	local taxi = S.TaxiDepot
	B.Hollow(f, {
		Name = "TaxiDepot",
		AssetId = "TaxiDepot",
		Position = taxi,
		Size = Vector3.new(80, 20, 50),
		Facing = EAST,
		Color = Color3.fromRGB(240, 200, 60),
		Trim = Color3.fromRGB(30, 30, 30),
		DoorWidth = 40,
		DoorHeight = 14,
		Sign = "🚕 CHECKER CAB CO.",
		SignColor = Color3.fromRGB(250, 210, 60),
	})
	-- checker stripe
	P.Small(f, "CheckerStripe", Vector3.new(51, 1.4, 81), CFrame.new(taxi.X, GROUND + 16, taxi.Z), Color3.fromRGB(20, 20, 20), Enum.Material.SmoothPlastic)

	for _, p in ipairs({ Vector3.new(-860, 0, -640), Vector3.new(-640, 0, -340), Vector3.new(-340, 0, -340), Vector3.new(-560, 0, -640) }) do
		G.Tree(f, p)
	end
end

return Industrial
