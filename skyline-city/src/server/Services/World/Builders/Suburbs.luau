-- Suburbs builder: Maple Heights residential streets. HousePlot-tagged flat plots (Townhouse x20, Suburban x18,
-- Mansion x8) with driveways, mailboxes (Pizza Delivery targets) and For-Sale signs (RealEstate Showing targets),
-- plus the Slice Society pizza shop, the south FuelUp gas station and a corner business lot.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)
local Housing = require(Shared.Config.Housing)

local AutoStrip = require(script.Parent.AutoStrip)

local Suburbs = {}

local Tags = World.Tags
local S = Layout.Sites
local GROUND = Layout.Heights.Ground
local WALK_Y = Layout.Heights.Sidewalk
local NORTH, SOUTH = Vector3.new(0, 0, -1), Vector3.new(0, 0, 1)
local HALF = Layout.Grid.BlockInner / 2

-- { block centre, tier, plots per row, spacing }
local BLOCKS = {
	{ Vector3.new(-750, 0, 450), "Townhouse", 5, 46 },
	{ Vector3.new(-450, 0, 450), "Townhouse", 5, 46 },
	{ Vector3.new(-150, 0, 450), "Suburban", 3, 78 },
	{ Vector3.new(150, 0, 450), "Suburban", 3, 78 },
	{ Vector3.new(-750, 0, 750), "Suburban", 3, 78 },
	{ Vector3.new(-450, 0, 750), "Mansion", 2, 120 },
	{ Vector3.new(-150, 0, 750), "Mansion", 2, 120 },
}

local PLOT_COLOR = Color3.fromRGB(104, 160, 86)

-- Every plot in the district (used by Essential + Decor). { cf, size (Vector2), tier, id, street (Vector3) }
local function plotList()
	local out = {}
	local counters = {}
	for _, b in ipairs(BLOCKS) do
		local center: Vector3, tier: string, count: number, spacing: number = b[1], b[2], b[3], b[4]
		local size: Vector2 = Housing.Tiers[tier].PlotSize
		for _, street in ipairs({ NORTH, SOUTH }) do
			local z = center.Z + street.Z * (HALF - 4 - size.Y / 2)
			for k = 1, count do
				local x = center.X + (k - (count + 1) / 2) * spacing
				counters[tier] = (counters[tier] or 0) + 1
				table.insert(out, {
					CF = CFrame.lookAt(Vector3.new(x, 0, z), Vector3.new(x, 0, z) - street), -- local +Z faces the street
					Size = size,
					Tier = tier,
					Id = string.format("sub_%s_%d", string.lower(tier), counters[tier]),
					Street = street,
				})
			end
		end
	end
	return out
end

function Suburbs.Essential(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.District("Suburbs")
	local plots = ctx.Folder("HousePlots")

	for i, plot in ipairs(plotList()) do
		local cf: CFrame = plot.CF
		local size: Vector2 = plot.Size
		G.Plot(plots, Tags.HousePlot, plot.Id, plot.Tier, cf, size, PLOT_COLOR, Enum.Material.Grass)
		-- mailbox (pizza delivery) in the front verge, right of the driveway
		local mailbox = (cf * CFrame.new(size.X / 2 - 4, 0, size.Y / 2 + 2)).Position
		G.Target(f, "Pizza", "Delivery", P.Facing(mailbox, plot.Street), { PlotId = plot.Id })
		-- every third plot has a For-Sale sign used by the Real Estate job
		if i % 3 == 1 then
			local sign = (cf * CFrame.new(-size.X / 2 + 2, 0, size.Y / 2 + 2)).Position
			G.Target(f, "RealEstate", "Showing", P.Facing(sign, plot.Street), { Tier = plot.Tier, PlotId = plot.Id })
		end
	end

	-- Slice Society pizza (front faces north onto Maple St)
	local pz = S.PizzaShop
	ctx.Pave(f, Vector3.new(pz.X, 0, 645), 70, 34)
	G.Station(f, "Pizza", P.Facing(Vector3.new(pz.X, GROUND, pz.Z - 10), NORTH), "Slice Society Pizza", Color3.fromRGB(230, 120, 40))
	G.CarSpawn(f, G.ParkingCF("X", 600, pz.X - 10, 1))
	G.CarSpawn(f, G.ParkingCF("X", 600, pz.X + 30, 1))

	-- south gas station
	local gas = S.GasSouth
	ctx.Pave(f, gas, 130, 120)
	ctx.Pave(f, Vector3.new(268.5, 0, gas.Z), 7, 24)
	AutoStrip.GasStation(P, G, f, gas, NORTH)
	G.ATM(f, P.Facing(Vector3.new(gas.X - 25, GROUND, gas.Z + 33), NORTH))
	G.Lot(f, "sub_1", P.StreetFacing(Vector3.new(210, 0, 680), NORTH), Vector3.new(64, 40, 64), "Restaurant,ClothingStore,*")

	-- neighbourhood jobs
	G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(-450, WALK_Y, 605 + 18), SOUTH))
	G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(-150, WALK_Y, 300 + 23), SOUTH))
	G.Target(f, "Fire", "FireSpot", P.Facing(Vector3.new(pz.X + 20, GROUND, pz.Z - 21), NORTH))
end

function Suburbs.Decor(ctx)
	local P, B, G = ctx.Props, ctx.B, ctx.G
	local f = ctx.District("Suburbs")
	local driveColor = Color3.fromRGB(176, 174, 168)
	local fence = Color3.fromRGB(240, 238, 232)

	for i, plot in ipairs(plotList()) do
		local cf: CFrame = plot.CF
		local size: Vector2 = plot.Size
		-- driveway from the plot edge across the verge and the sidewalk to the kerb
		P.Small(f, "Driveway", Vector3.new(10, WALK_Y + 0.05, 14), cf * CFrame.new(-size.X / 2 + 8, (WALK_Y + 0.05) / 2, size.Y / 2 + 7), driveColor, Enum.Material.Concrete)
		-- low back fence
		P.Small(f, "BackFence", Vector3.new(size.X, 3, 0.4), cf * CFrame.new(0, 1.5, -size.Y / 2 - 1), fence, Enum.Material.WoodPlanks)
		-- backyard tree
		if i % 2 == 0 then
			G.Tree(f, (cf * CFrame.new(size.X / 2 - 6, 0, -size.Y / 2 - 6)).Position)
		end
	end

	-- pizza shop
	B.Hollow(f, {
		Name = "SliceSociety",
		AssetId = "PizzaShop",
		Position = S.PizzaShop,
		Size = Vector3.new(50, 16, 36),
		Facing = NORTH,
		Color = Color3.fromRGB(250, 236, 210),
		Trim = Color3.fromRGB(200, 70, 30),
		GlassFront = true,
		DoorWidth = 10,
		Sign = "🍕 SLICE SOCIETY",
		SignColor = Color3.fromRGB(255, 160, 60),
	})
	AutoStrip.GasDecor(P, B, G, f, P.Facing(Vector3.new(S.GasSouth.X, 0, S.GasSouth.Z), NORTH), "GasSouth")

	-- tiny playground in the pizza block
	local pg = Vector3.new(70, 0, 820)
	P.Part(f, "Sandbox", Vector3.new(40, 0.3, 30), CFrame.new(pg.X, 0.15, pg.Z), Color3.fromRGB(226, 206, 150), Enum.Material.Sand, { CastShadow = false })
	P.Part(f, "Climber", Vector3.new(8, 6, 8), CFrame.new(pg.X, 3, pg.Z), Color3.fromRGB(80, 160, 240), Enum.Material.SmoothPlastic)
	G.Bench(f, P.Facing(pg + Vector3.new(0, 0, -20), SOUTH))
	for _, p in ipairs({ Vector3.new(40, 0, 760), Vector3.new(110, 0, 860), Vector3.new(250, 0, 640) }) do
		G.Tree(f, p)
	end
end

return Suburbs
