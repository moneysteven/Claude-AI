-- Beach builder: Coral Bay villas (BeachVilla HousePlots), Coral Bay Hotel, surf shop, two business lots, and the
-- coast: Coral Blvd boardwalk, sand, terrain water (part fallback), Sunset Pier, palms, umbrellas, the Beach PartyZone
-- (Beach Party event) and a bonfire VoiceZone.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)
local Housing = require(Shared.Config.Housing)

local Beach = {}

local Tags = World.Tags
local S = Layout.Sites
local COAST = Layout.Coast
local GROUND = Layout.Heights.Ground
local NORTH, SOUTH = Vector3.new(0, 0, -1), Vector3.new(0, 0, 1)
local HALF = Layout.Grid.BlockInner / 2
local SAND_TOP = 1
local BOARD_TOP = 1.1
local SAND = Color3.fromRGB(232, 210, 160)

local VILLA_BLOCKS = { Vector3.new(450, 0, 750), Vector3.new(750, 0, 750) }

local function villaList()
	local out = {}
	local size: Vector2 = Housing.Tiers.BeachVilla.PlotSize
	local n = 0
	for _, center in ipairs(VILLA_BLOCKS) do
		for _, street in ipairs({ NORTH, SOUTH }) do
			local z = center.Z + street.Z * (HALF - 4 - size.Y / 2)
			for _, dx in ipairs({ -55, 55 }) do
				n += 1
				local pos = Vector3.new(center.X + dx, 0, z)
				table.insert(out, { CF = CFrame.lookAt(pos, pos - street), Size = size, Id = "beach_villa_" .. n, Street = street })
			end
		end
	end
	return out
end

function Beach.Essential(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.District("Beach")
	local plots = ctx.Folder("HousePlots")

	for i, v in ipairs(villaList()) do
		G.Plot(plots, Tags.HousePlot, v.Id, "BeachVilla", v.CF, v.Size, SAND, Enum.Material.Sand)
		G.Target(f, "Pizza", "Delivery", P.Facing((v.CF * CFrame.new(v.Size.X / 2 - 4, 0, v.Size.Y / 2 + 2)).Position, v.Street), { PlotId = v.Id })
		if i % 2 == 1 then
			G.Target(f, "RealEstate", "Showing", P.Facing((v.CF * CFrame.new(-v.Size.X / 2 + 2, 0, v.Size.Y / 2 + 2)).Position, v.Street), { Tier = "BeachVilla", PlotId = v.Id })
		end
	end

	-- lots + ATM
	G.Lot(f, "beach_1", P.StreetFacing(Vector3.new(380, 0, 370), NORTH), Vector3.new(64, 40, 64), "Restaurant,Nightclub,*")
	G.Lot(f, "beach_2", P.StreetFacing(Vector3.new(700, 0, 370), NORTH), Vector3.new(64, 40, 64), "*")
	G.ATM(f, P.Facing(Vector3.new(750, 0, 345), NORTH))
	G.CarSpawn(f, G.ParkingCF("X", 900, 450, -1))
	G.CarSpawn(f, G.ParkingCF("X", 900, 750, -1))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(S.Hotel.X + 30, 0, S.Hotel.Z - 29), NORTH))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(S.SurfShop.X, 0, S.SurfShop.Z - 19), NORTH))

	-- boardwalk (walkable, essential)
	local bz = (COAST.BoardwalkZ[1] + COAST.BoardwalkZ[2]) / 2
	local bw = COAST.BoardwalkZ[2] - COAST.BoardwalkZ[1]
	P.Part(f, "Boardwalk", Vector3.new(1240, BOARD_TOP, bw), CFrame.new(0, BOARD_TOP / 2, bz), Color3.fromRGB(160, 120, 80), Enum.Material.WoodPlanks, { CastShadow = false })
	for i = 0, 7 do
		local x = -490 + i * 140
		G.Bench(f, P.Facing(Vector3.new(x, BOARD_TOP, COAST.BoardwalkZ[2] - 3), SOUTH))
	end

	-- party zone + bonfire voice zone
	local party = S.BeachParty
	G.Zone(f, Tags.PartyZone, CFrame.new(party.X, 20, party.Z), Vector3.new(130, 40, 110), { Zone = "Beach", Active = false, Name = "Skyline Beach" })
	local fire = S.Bonfire
	G.Zone(f, Tags.VoiceZone, CFrame.new(fire.X, 8, fire.Z), Vector3.new(44, 16, 44), { Name = "Beach Bonfire" })
	for i = 0, 3 do
		local r = i * math.pi / 2
		local pos = fire + Vector3.new(math.cos(r) * 12, SAND_TOP, math.sin(r) * 12)
		G.Bench(f, P.Facing(pos, fire - pos))
	end

	-- jobs along the coast
	G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(0, BOARD_TOP, bz), SOUTH))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(150, SAND_TOP, 1200), NORTH))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(-350, SAND_TOP, 1180), NORTH))
end

local function fillWater(P, f: Instance)
	local x0, x1 = COAST.WaterX[1], COAST.WaterX[2]
	local z0, z1 = COAST.WaterZ[1], COAST.WaterZ[2]
	local level = COAST.WaterLevel
	local ok = pcall(function()
		local terrain = Workspace.Terrain
		local step = 450
		local x = x0
		while x < x1 do
			local w = math.min(step, x1 - x)
			local z = z0
			while z < z1 do
				local d = math.min(step, z1 - z)
				terrain:FillBlock(CFrame.new(x + w / 2, (level - 4) / 2, z + d / 2), Vector3.new(w, level + 4, d), Enum.Material.Water)
				z += d
				task.wait()
			end
			x += w
		end
		terrain.WaterColor = Color3.fromRGB(40, 140, 170)
		terrain.WaterTransparency = 0.6
		terrain.WaterWaveSize = 0.15
		terrain.WaterWaveSpeed = 8
		terrain.WaterReflectance = 0.6
	end)
	if not ok then
		-- fallback: translucent water plane (no swimming, but looks right)
		P.Part(f, "WaterPlane", Vector3.new(x1 - x0, 0.4, z1 - z0), CFrame.new((x0 + x1) / 2, level - 0.2, (z0 + z1) / 2), Color3.fromRGB(50, 140, 190), Enum.Material.Glass, {
			Transparency = 0.35,
			CanCollide = false,
			CastShadow = false,
		})
	end
end

local function umbrella(P, f: Instance, pos: Vector3, color: Color3)
	P.Small(f, "UmbrellaPole", Vector3.new(0.3, 8, 0.3), CFrame.new(pos + Vector3.new(0, 4, 0)), Color3.fromRGB(240, 240, 240), Enum.Material.Metal)
	P.Cyl(f, "Umbrella", 5, 0.4, CFrame.new(pos + Vector3.new(0, 8, 0)), color, Enum.Material.Fabric, { CastShadow = true, CanCollide = false })
	P.Small(f, "Towel", Vector3.new(3, 0.1, 6), CFrame.new(pos + Vector3.new(2.5, 0.05, 1)), color:Lerp(Color3.new(1, 1, 1), 0.4), Enum.Material.Fabric, { CanCollide = false })
end

function Beach.Decor(ctx)
	local P, B, G = ctx.Props, ctx.B, ctx.G
	local f = ctx.District("Beach")

	-- hotel + pool, surf shop
	B.Tower(f, { Name = "CoralBayHotel", AssetId = "Hotel", Position = S.Hotel, Size = Vector3.new(100, 80, 50), Facing = NORTH, Color = Color3.fromRGB(246, 236, 220), Glass = Color3.fromRGB(80, 170, 190), Accent = Color3.fromRGB(255, 150, 120), Lobby = true, Crown = "Flat", Sign = "CORAL BAY HOTEL" })
	local pool = S.Hotel + Vector3.new(80, 0, 45)
	P.Part(f, "PoolDeck", Vector3.new(40, GROUND, 28), CFrame.new(pool.X, GROUND / 2, pool.Z), Color3.fromRGB(236, 230, 216), Enum.Material.Pavement, { CastShadow = false })
	P.Part(f, "Pool", Vector3.new(30, 0.2, 18), CFrame.new(pool.X, GROUND + 0.05, pool.Z), Color3.fromRGB(60, 190, 230), Enum.Material.SmoothPlastic, { Transparency = 0.15, Reflectance = 0.2, CanCollide = false })
	B.Box(f, { Name = "SurfShop", AssetId = "SurfShop", Position = S.SurfShop, Size = Vector3.new(40, 14, 30), Facing = NORTH, Color = Color3.fromRGB(80, 200, 210), Trim = Color3.fromRGB(250, 240, 220), Sign = "🏄 SURF SHACK", SignColor = Color3.fromRGB(255, 120, 80), FrontOnly = true })
	for _, v in ipairs(villaList()) do
		G.Palm(f, (v.CF * CFrame.new(v.Size.X / 2 + 4, 0, v.Size.Y / 2 - 6)).Position)
	end

	-- sand + seabed + water
	local sx = (COAST.SandX[1] + COAST.SandX[2]) / 2
	local sw = COAST.SandX[2] - COAST.SandX[1]
	local sz = (COAST.SandZ[1] + COAST.SandZ[2]) / 2
	local sd = COAST.SandZ[2] - COAST.SandZ[1]
	P.Part(f, "Sand", Vector3.new(sw, SAND_TOP, sd), CFrame.new(sx, SAND_TOP / 2, sz), SAND, Enum.Material.Sand, { CastShadow = false })
	local wx0, wx1, wz0, wz1 = COAST.WaterX[1], COAST.WaterX[2], COAST.WaterZ[1], COAST.WaterZ[2]
	P.Part(f, "Seabed", Vector3.new(wx1 - wx0, 0.1, wz1 - wz0), CFrame.new((wx0 + wx1) / 2, 0.05, (wz0 + wz1) / 2), Color3.fromRGB(200, 186, 140), Enum.Material.Sand, { CastShadow = false })
	fillWater(P, f)

	-- boardwalk railing + lamps
	P.Small(f, "Railing", Vector3.new(1240, 0.4, 0.4), CFrame.new(0, BOARD_TOP + 3, COAST.BoardwalkZ[1] + 0.3), Color3.fromRGB(240, 240, 240), Enum.Material.Wood)
	for i = 0, 12 do
		local x = -600 + i * 100
		G.ParkLamp(f, Vector3.new(x, BOARD_TOP, COAST.BoardwalkZ[1] + 1.5))
	end

	-- pier
	local pier = S.Pier
	local pierLen = 200
	P.Part(f, "PierDeck", Vector3.new(16, 1, pierLen), CFrame.new(pier.X, 1.7, pier.Z + pierLen / 2), Color3.fromRGB(150, 110, 74), Enum.Material.WoodPlanks)
	P.Part(f, "PierEnd", Vector3.new(40, 1, 30), CFrame.new(pier.X, 1.7, pier.Z + pierLen + 15), Color3.fromRGB(150, 110, 74), Enum.Material.WoodPlanks)
	for i = 0, 10 do
		for _, x in ipairs({ -7, 7 }) do
			P.Small(f, "PierPost", Vector3.new(1, 4, 1), CFrame.new(pier.X + x, 0, pier.Z + i * 20), Color3.fromRGB(110, 80, 56), Enum.Material.Wood)
		end
	end
	for i = 0, 3 do
		G.Bench(f, P.Facing(Vector3.new(pier.X - 14 + i * 9, 2.2, pier.Z + pierLen + 26), SOUTH))
	end
	local pierSign = P.Part(f, "PierSign", Vector3.new(16, 4, 0.5), P.Facing(Vector3.new(pier.X, 10, pier.Z + 2), NORTH), Color3.fromRGB(30, 60, 90))
	P.Sign(pierSign, "🎣 SUNSET PIER", { TextColor = Color3.fromRGB(255, 200, 120) })
	for _, x in ipairs({ -8, 8 }) do
		P.Small(f, "PierArch", Vector3.new(0.8, 10, 0.8), CFrame.new(pier.X + x, 6, pier.Z + 2), Color3.fromRGB(240, 240, 240), Enum.Material.Wood)
	end

	-- party stage + tiki bar
	local party = S.BeachParty
	P.Part(f, "PartyStage", Vector3.new(40, 3, 18), CFrame.new(party.X, SAND_TOP + 1.5, party.Z + 40), Color3.fromRGB(70, 50, 40), Enum.Material.WoodPlanks)
	P.Part(f, "PartyDJ", Vector3.new(10, 4, 4), CFrame.new(party.X, SAND_TOP + 5, party.Z + 44), Color3.fromRGB(24, 24, 30))
	P.Small(f, "PartyArch", Vector3.new(44, 1, 1), CFrame.new(party.X, SAND_TOP + 16, party.Z + 32), Color3.fromRGB(255, 80, 200), Enum.Material.Neon)
	for _, x in ipairs({ -21, 21 }) do
		P.Small(f, "ArchPost", Vector3.new(1, 15, 1), CFrame.new(party.X + x, SAND_TOP + 8.5, party.Z + 32), Color3.fromRGB(80, 200, 255), Enum.Material.Neon)
		P.Part(f, "PartySpeaker", Vector3.new(4, 8, 4), CFrame.new(party.X + x, SAND_TOP + 7, party.Z + 40), Color3.fromRGB(20, 20, 24))
	end
	local bar = party + Vector3.new(-50, 0, -10)
	P.Part(f, "TikiBar", Vector3.new(16, 4, 6), CFrame.new(bar.X, SAND_TOP + 2, bar.Z), Color3.fromRGB(140, 96, 56), Enum.Material.Wood)
	P.Part(f, "TikiRoof", Vector3.new(20, 1.4, 10), CFrame.new(bar.X, SAND_TOP + 11, bar.Z), Color3.fromRGB(200, 170, 100), Enum.Material.Grass)
	for _, x in ipairs({ -8, 8 }) do
		P.Small(f, "TikiPost", Vector3.new(0.8, 10, 0.8), CFrame.new(bar.X + x, SAND_TOP + 5, bar.Z), Color3.fromRGB(110, 76, 44), Enum.Material.Wood)
	end

	-- bonfire
	local fire = S.Bonfire
	local pit = P.Cyl(f, "FirePit", 3, 1, CFrame.new(fire.X, SAND_TOP + 0.5, fire.Z), Color3.fromRGB(90, 86, 80), Enum.Material.Slate)
	local flame = Instance.new("Fire")
	flame.Size = 6
	flame.Heat = 8
	flame.Parent = pit
	local glow = Instance.new("PointLight")
	glow.Color = Color3.fromRGB(255, 150, 60)
	glow.Range = 24
	glow.Brightness = 2
	glow.Parent = pit

	-- lifeguard towers
	for _, x in ipairs({ 100, -560 }) do
		P.Part(f, "LifeguardDeck", Vector3.new(8, 1, 8), CFrame.new(x, 9, 1235), Color3.fromRGB(240, 240, 240), Enum.Material.Wood)
		P.Part(f, "LifeguardHut", Vector3.new(8, 6, 8), CFrame.new(x, 12.5, 1236), Color3.fromRGB(230, 60, 50), Enum.Material.Wood)
		for _, dx in ipairs({ -3.5, 3.5 }) do
			for _, dz in ipairs({ -3.5, 3.5 }) do
				P.Small(f, "LifeguardLeg", Vector3.new(0.6, 8, 0.6), CFrame.new(x + dx, 5, 1235 + dz), Color3.fromRGB(240, 240, 240), Enum.Material.Wood)
			end
		end
	end

	-- palms + umbrellas + volleyball
	for i = 0, 23 do
		local x = -680 + i * 59 + ((i % 3) - 1) * 9
		local z = 1142 + (i % 4) * 14
		if math.abs(x - S.BeachParty.X) > 30 and math.abs(x - S.Pier.X) > 14 then
			G.Palm(f, Vector3.new(x, SAND_TOP, z))
		end
	end
	local colors = { Color3.fromRGB(255, 90, 90), Color3.fromRGB(80, 170, 255), Color3.fromRGB(255, 210, 70), Color3.fromRGB(120, 220, 140) }
	for i = 0, 11 do
		local x = -640 + i * 110
		if math.abs(x - S.BeachParty.X) > 70 and math.abs(x - S.Pier.X) > 20 then
			umbrella(P, f, Vector3.new(x, SAND_TOP, 1215 + (i % 2) * 18), colors[(i % #colors) + 1])
		end
	end
	P.Small(f, "NetPostA", Vector3.new(0.5, 8, 0.5), CFrame.new(480, SAND_TOP + 4, 1190), Color3.fromRGB(240, 240, 240), Enum.Material.Metal)
	P.Small(f, "NetPostB", Vector3.new(0.5, 8, 0.5), CFrame.new(480, SAND_TOP + 4, 1220), Color3.fromRGB(240, 240, 240), Enum.Material.Metal)
	P.Small(f, "VolleyNet", Vector3.new(0.1, 3, 30), CFrame.new(480, SAND_TOP + 6.5, 1205), Color3.fromRGB(250, 250, 250), Enum.Material.Fabric, { Transparency = 0.4, CanCollide = false })
end

return Beach
