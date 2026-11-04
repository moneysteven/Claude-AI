-- Park builder: Central Park with the spawn plaza (SpawnPoints, leaderboards, ATMs, fountain), paths,
-- benches (RPSeat), trees, an amphitheatre stage (PartyZone "Park"), a gazebo (VoiceZone), pond and playground.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)

local Park = {}

local Tags = World.Tags
local S = Layout.Sites
local GROUND = Layout.Heights.Ground
local PAVING = Color3.fromRGB(214, 206, 192)
local INNER = 272 -- park interior half size

function Park.Essential(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.District("Park")
	local c = S.SpawnPlaza

	-- plaza slab (players spawn here, so it is essential)
	P.Part(f, "Plaza", Vector3.new(150, GROUND, 150), CFrame.new(c.X, GROUND / 2, c.Z), PAVING, Enum.Material.Pavement, { CastShadow = false })

	-- spawn points around the fountain, facing it
	for _, off in ipairs({ Vector3.new(0, 0, -46), Vector3.new(46, 0, 0), Vector3.new(0, 0, 46), Vector3.new(-46, 0, 0) }) do
		local pos = c + off + Vector3.new(0, GROUND, 0)
		G.Spawn(f, P.Facing(pos, -off))
	end

	-- leaderboards on the north edge of the plaza, facing south into the plaza
	for i, x in ipairs({ -30, 30 }) do
		local pos = c + Vector3.new(x, GROUND + 9.5, -66)
		local board = P.Part(f, "Leaderboard" .. i, Vector3.new(22, 13, 1), P.Facing(pos, Vector3.new(0, 0, 1)), Color3.fromRGB(24, 26, 34), Enum.Material.SmoothPlastic)
		P.Tag(board, Tags.Leaderboard, { BoardIndex = i })
		P.Small(f, "BoardFrame", Vector3.new(23, 14, 0.6), P.Facing(pos + Vector3.new(0, 0, -0.7), Vector3.new(0, 0, 1)), Color3.fromRGB(64, 156, 255), Enum.Material.Neon)
		for _, px in ipairs({ -10, 10 }) do
			P.Small(f, "BoardPost", Vector3.new(0.8, 3, 0.8), CFrame.new(c.X + x + px, GROUND + 1.5, c.Z - 66), Color3.fromRGB(60, 62, 70), Enum.Material.Metal)
		end
	end

	-- ATMs on the east and west edges, facing the plaza
	G.ATM(f, P.Facing(c + Vector3.new(68, GROUND, -16), Vector3.new(-1, 0, 0)))
	G.ATM(f, P.Facing(c + Vector3.new(-68, GROUND, 16), Vector3.new(1, 0, 0)))

	-- plaza benches facing the fountain
	for _, a in ipairs({ 45, 135, 225, 315 }) do
		local r = math.rad(a)
		local pos = c + Vector3.new(math.cos(r) * 62, GROUND, math.sin(r) * 62)
		G.Bench(f, P.Facing(pos, c - pos))
	end

	-- safe zones: spawn plaza + whole park
	G.Zone(f, Tags.SafeZone, CFrame.new(c.X, 30, c.Z), Vector3.new(170, 60, 170), { Name = "Spawn Plaza" })
	G.Zone(f, Tags.SafeZone, CFrame.new(0, 40, 0), Vector3.new(580, 80, 580), { Name = "Central Park" })

	-- amphitheatre party zone
	local stage = S.ParkStage
	G.Zone(f, Tags.PartyZone, CFrame.new(stage.X, 16, stage.Z - 20), Vector3.new(110, 32, 100), { Zone = "Park", Active = false, Name = "Central Park Stage" })
	P.Part(f, "Stage", Vector3.new(44, 3, 22), CFrame.new(stage.X, 1.5, stage.Z + 12), Color3.fromRGB(60, 50, 44), Enum.Material.WoodPlanks)

	-- gazebo voice hangout
	local gz = S.Gazebo
	G.Zone(f, Tags.VoiceZone, CFrame.new(gz.X, 10, gz.Z), Vector3.new(48, 20, 48), { Name = "Park Gazebo" })
	P.Cyl(f, "GazeboFloor", 20, 1, CFrame.new(gz.X, 0.5, gz.Z), Color3.fromRGB(230, 226, 214), Enum.Material.WoodPlanks)
	for i = 0, 3 do
		local r = i * math.pi / 2 + math.pi / 4
		local pos = gz + Vector3.new(math.cos(r) * 12, 1, math.sin(r) * 12)
		G.Bench(f, P.Facing(pos, gz - pos))
	end

	-- path benches
	for _, p in ipairs({ Vector3.new(16, 0, 130), Vector3.new(-16, 0, -130), Vector3.new(130, 0, -16), Vector3.new(-130, 0, 16), Vector3.new(16, 0, -210), Vector3.new(-16, 0, 210) }) do
		local towardPath = Vector3.new(p.X ~= 0 and math.abs(p.X) < 20 and -math.sign(p.X) or 0, 0, math.abs(p.Z) < 20 and -math.sign(p.Z) or 0)
		G.Bench(f, P.Facing(p, towardPath))
	end

	-- jobs
	G.Target(f, "Police", "PatrolPoint", P.Facing(c + Vector3.new(0, GROUND, 72), Vector3.new(0, 0, 1)))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(30, 0, 150), Vector3.new(-1, 0, 0)))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(-120, 0, -60), Vector3.new(1, 0, 0)))
end

local function rngPositions(count: number, seed: number, ok: (Vector3) -> boolean): { Vector3 }
	local rng = Random.new(seed)
	local out = {}
	local tries = 0
	while #out < count and tries < count * 20 do
		tries += 1
		local p = Vector3.new(rng:NextNumber(-INNER + 8, INNER - 8), 0, rng:NextNumber(-INNER + 8, INNER - 8))
		if ok(p) then
			table.insert(out, p)
		end
	end
	return out
end

function Park.Decor(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.District("Park")
	local c = S.SpawnPlaza
	local water = Color3.fromRGB(70, 150, 200)

	-- fountain
	P.Cyl(f, "FountainBase", 17, 2.2, CFrame.new(c.X, GROUND + 1.1, c.Z), Color3.fromRGB(200, 196, 186), Enum.Material.Marble)
	P.Cyl(f, "FountainWater", 15.5, 0.4, CFrame.new(c.X, GROUND + 2.25, c.Z), water, Enum.Material.SmoothPlastic, { Transparency = 0.25, Reflectance = 0.2, CanCollide = false })
	P.Cyl(f, "FountainPillar", 2.2, 9, CFrame.new(c.X, GROUND + 6.5, c.Z), Color3.fromRGB(210, 206, 196), Enum.Material.Marble)
	local bowl = P.Cyl(f, "FountainBowl", 6.5, 1.2, CFrame.new(c.X, GROUND + 10.5, c.Z), Color3.fromRGB(210, 206, 196), Enum.Material.Marble)
	local spray = Instance.new("ParticleEmitter")
	spray.Name = "Spray"
	spray.Color = ColorSequence.new(Color3.fromRGB(200, 230, 255))
	spray.LightEmission = 0.3
	spray.Transparency = NumberSequence.new(0.3, 1)
	spray.Size = NumberSequence.new(0.6, 0.2)
	spray.Lifetime = NumberRange.new(1.2, 1.6)
	spray.Speed = NumberRange.new(18, 24)
	spray.SpreadAngle = Vector2.new(14, 14)
	spray.Acceleration = Vector3.new(0, -40, 0)
	spray.Rate = 60
	spray.EmissionDirection = Enum.NormalId.Right -- cylinder's local +X is world up
	spray.Parent = bowl
	-- monument sign
	local sign = P.Part(f, "PlazaSign", Vector3.new(40, 6, 2), P.Facing(c + Vector3.new(0, GROUND + 3, 66), Vector3.new(0, 0, 1)), Color3.fromRGB(26, 28, 36), Enum.Material.SmoothPlastic)
	P.Sign(sign, "SKYLINE CITY", { TextColor = Color3.fromRGB(64, 156, 255) })

	-- paths (axis + ring)
	local pathColor = Color3.fromRGB(196, 186, 168)
	for _, d in ipairs({ Vector3.new(1, 0, 0), Vector3.new(-1, 0, 0), Vector3.new(0, 0, 1), Vector3.new(0, 0, -1) }) do
		local len = INNER - 75
		local mid = c + d * (75 + len / 2)
		local size = d.X ~= 0 and Vector3.new(len, 0.3, 14) or Vector3.new(14, 0.3, len)
		P.Part(f, "Path", size, CFrame.new(mid.X, 0.15, mid.Z), pathColor, Enum.Material.Pavement, { CastShadow = false })
	end
	for _, s in ipairs({ -1, 1 }) do
		P.Part(f, "RingPath", Vector3.new(400, 0.28, 10), CFrame.new(0, 0.14, s * 200), pathColor, Enum.Material.Pavement, { CastShadow = false })
		P.Part(f, "RingPath", Vector3.new(10, 0.28, 400), CFrame.new(s * 200, 0.14, 0), pathColor, Enum.Material.Pavement, { CastShadow = false })
	end

	-- park lamps along the paths
	for _, p in ipairs({
		Vector3.new(10, 0, 110),
		Vector3.new(-10, 0, 180),
		Vector3.new(10, 0, -110),
		Vector3.new(-10, 0, -180),
		Vector3.new(110, 0, 10),
		Vector3.new(180, 0, -10),
		Vector3.new(-110, 0, -10),
		Vector3.new(-180, 0, 10),
		Vector3.new(200, 0, 200),
		Vector3.new(-200, 0, -200),
		Vector3.new(200, 0, -200),
		Vector3.new(-200, 0, 200),
	}) do
		G.ParkLamp(f, p + Vector3.new(0, 0.3, 0))
	end
	-- plaza lamps
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			G.ParkLamp(f, c + Vector3.new(sx * 70, GROUND, sz * 70))
		end
	end

	-- trees (deterministic scatter avoiding plaza, paths and features)
	local features = { S.ParkStage, S.Gazebo, S.Pond, S.Playground }
	local trees = rngPositions(70, 4242, function(p)
		if math.abs(p.X) < 95 and math.abs(p.Z) < 95 then
			return false
		end
		if math.abs(p.X) < 14 or math.abs(p.Z) < 14 then
			return false
		end
		if (math.abs(math.abs(p.X) - 200) < 10 and math.abs(p.Z) <= 205) or (math.abs(math.abs(p.Z) - 200) < 10 and math.abs(p.X) <= 205) then
			return false
		end
		for _, ft in ipairs(features) do
			if (Vector3.new(p.X, 0, p.Z) - ft).Magnitude < 52 then
				return false
			end
		end
		return true
	end)
	for _, p in ipairs(trees) do
		G.Tree(f, p)
	end

	-- amphitheatre stage dressing
	local st = S.ParkStage
	P.Part(f, "StageBack", Vector3.new(44, 18, 1.5), CFrame.new(st.X, 12, st.Z + 23), Color3.fromRGB(30, 30, 36), Enum.Material.SmoothPlastic)
	P.Part(f, "StageRoof", Vector3.new(48, 1.2, 26), CFrame.new(st.X, 21, st.Z + 12), Color3.fromRGB(40, 40, 46), Enum.Material.Metal)
	for _, x in ipairs({ -23, 23 }) do
		P.Part(f, "Truss", Vector3.new(1.2, 18, 1.2), CFrame.new(st.X + x, 12, st.Z + 1), Color3.fromRGB(150, 150, 156), Enum.Material.DiamondPlate)
		P.Part(f, "Speaker", Vector3.new(4, 7, 4), CFrame.new(st.X + x * 0.8, 6.5, st.Z + 3), Color3.fromRGB(20, 20, 24), Enum.Material.SmoothPlastic)
	end
	P.Small(f, "StageNeon", Vector3.new(44, 0.6, 0.6), CFrame.new(st.X, 20.2, st.Z), Color3.fromRGB(255, 60, 200), Enum.Material.Neon)
	P.Part(f, "DJBooth", Vector3.new(10, 4, 4), CFrame.new(st.X, 5, st.Z + 14), Color3.fromRGB(24, 24, 30), Enum.Material.SmoothPlastic)
	local stageSign = P.Small(f, "StageSign", Vector3.new(24, 4, 0.5), P.Facing(Vector3.new(st.X, 16, st.Z + 22), Vector3.new(0, 0, -1)), Color3.fromRGB(24, 24, 30))
	P.Sign(stageSign, "CENTRAL PARK STAGE", { TextColor = Color3.fromRGB(255, 120, 220) })
	-- lawn seating rows
	for row = 1, 3 do
		for _, x in ipairs({ -14, 14 }) do
			local pos = Vector3.new(st.X + x, 0, st.Z - 14 - row * 9)
			G.Bench(f, P.Facing(pos, Vector3.new(0, 0, 1)))
		end
	end

	-- gazebo pillars + roof
	local gz = S.Gazebo
	for i = 0, 5 do
		local r = i * math.pi / 3
		P.Part(f, "GazeboPillar", Vector3.new(1.4, 12, 1.4), CFrame.new(gz.X + math.cos(r) * 18, 7, gz.Z + math.sin(r) * 18), Color3.fromRGB(240, 238, 230), Enum.Material.Wood)
	end
	P.Cyl(f, "GazeboRoof", 22, 1.4, CFrame.new(gz.X, 13.6, gz.Z), Color3.fromRGB(120, 60, 50), Enum.Material.WoodPlanks)
	P.Cyl(f, "GazeboRoofTop", 12, 2, CFrame.new(gz.X, 15, gz.Z), Color3.fromRGB(110, 54, 46), Enum.Material.WoodPlanks)

	-- pond
	local pd = S.Pond
	P.Cyl(f, "PondRim", 42, 0.6, CFrame.new(pd.X, 0.3, pd.Z), Color3.fromRGB(150, 140, 120), Enum.Material.Slate, { CastShadow = false })
	P.Cyl(f, "Pond", 39, 0.4, CFrame.new(pd.X, 0.62, pd.Z), water, Enum.Material.SmoothPlastic, { Transparency = 0.2, Reflectance = 0.25, CastShadow = false })
	for i = 0, 5 do
		local r = i * 1.1
		P.Ball(f, "Rock", 3 + (i % 3), CFrame.new(pd.X + math.cos(r) * 41, 0.8, pd.Z + math.sin(r) * 41), Color3.fromRGB(120, 118, 112), Enum.Material.Rock).CastShadow = false
	end
	G.Bench(f, P.Facing(pd + Vector3.new(0, 0, 50), Vector3.new(0, 0, -1)))

	-- playground
	local pg = S.Playground
	P.Part(f, "Sandbox", Vector3.new(50, 0.3, 40), CFrame.new(pg.X, 0.15, pg.Z), Color3.fromRGB(226, 206, 150), Enum.Material.Sand, { CastShadow = false })
	P.Part(f, "SlideTower", Vector3.new(6, 8, 6), CFrame.new(pg.X - 12, 4, pg.Z), Color3.fromRGB(240, 80, 70), Enum.Material.SmoothPlastic)
	P.Wedge(f, "Slide", Vector3.new(4, 8, 14), CFrame.new(pg.X - 12, 4, pg.Z + 10) * CFrame.Angles(0, math.pi, 0), Color3.fromRGB(250, 200, 50), Enum.Material.SmoothPlastic)
	P.Part(f, "SwingBar", Vector3.new(20, 0.8, 0.8), CFrame.new(pg.X + 10, 10, pg.Z - 6), Color3.fromRGB(60, 120, 220), Enum.Material.Metal)
	for _, x in ipairs({ 0, 20 }) do
		P.Part(f, "SwingPost", Vector3.new(0.8, 10, 0.8), CFrame.new(pg.X + x, 5, pg.Z - 6), Color3.fromRGB(60, 120, 220), Enum.Material.Metal)
	end
	for _, x in ipairs({ 6, 14 }) do
		P.Small(f, "SwingSeat", Vector3.new(2.4, 0.3, 1.2), CFrame.new(pg.X + x, 3, pg.Z - 6), Color3.fromRGB(30, 30, 34))
		P.Small(f, "SwingRope", Vector3.new(0.15, 7, 0.15), CFrame.new(pg.X + x, 6.5, pg.Z - 6), Color3.fromRGB(120, 120, 120))
	end

	-- hot dog cart near the plaza
	P.Part(f, "HotDogCart", Vector3.new(6, 3.4, 3), CFrame.new(c.X + 86, 1.7, c.Z - 30), Color3.fromRGB(230, 60, 50), Enum.Material.SmoothPlastic)
	P.Small(f, "CartUmbrella", Vector3.new(8, 0.4, 8), CFrame.new(c.X + 86, 7, c.Z - 30), Color3.fromRGB(250, 220, 60))
	P.Small(f, "CartPole", Vector3.new(0.3, 3.6, 0.3), CFrame.new(c.X + 86, 5.1, c.Z - 30), Color3.fromRGB(200, 200, 200), Enum.Material.Metal)
end

return Park
