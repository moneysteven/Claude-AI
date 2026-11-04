-- WorldBuilder (World helper): builds the whole procedural city on top of the baseplate at server start.
--
--   WorldBuilder.Build() -> Folder     (only call when Workspace.City does not exist)
--
-- Phase 1 (synchronous, fast): roads, sidewalks, nav graph, every tagged gameplay part, apartment towers,
--   plots, lots, zones. Other services can rely on these from their Init/Start.
-- Phase 2 (background task, yields every few hundred parts): buildings, markings, streetlights, trees, props.
-- Sets Workspace attributes "CityReady" (phase 1 done) and "CityDecorReady" (phase 2 done).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)

local Props = require(script.Parent.Props)
local Gameplay = require(script.Parent.Gameplay)
local Buildings = require(script.Parent.Buildings)
local RoadBuilder = require(script.Parent.RoadBuilder)

local Builders = script.Parent:WaitForChild("Builders")
local BUILDERS = {
	require(Builders:WaitForChild("Park")),
	require(Builders:WaitForChild("Civic")),
	require(Builders:WaitForChild("Downtown")),
	require(Builders:WaitForChild("Industrial")),
	require(Builders:WaitForChild("AutoStrip")),
	require(Builders:WaitForChild("Mall")),
	require(Builders:WaitForChild("Suburbs")),
	require(Builders:WaitForChild("Beach")),
	require(Builders:WaitForChild("Streets")),
}
local BUILDER_NAMES = { "Park", "Civic", "Downtown", "Industrial", "AutoStrip", "Mall", "Suburbs", "Beach", "Streets" }

local WorldBuilder = {}

local function makeContext(city: Folder)
	local folders: { [string]: Folder } = {}
	local districtRoot = Instance.new("Folder")
	districtRoot.Name = "Districts"
	districtRoot.Parent = city

	local ctx = {
		City = city,
		Layout = Layout,
		Props = Props,
		G = Gameplay,
		B = Buildings,
	}

	function ctx.Folder(name: string): Folder
		local f = folders[name]
		if not f then
			f = Instance.new("Folder")
			f.Name = name
			f.Parent = city
			folders[name] = f
		end
		return f
	end

	function ctx.District(name: string): Folder
		local key = "District:" .. name
		local f = folders[key]
		if not f then
			f = Instance.new("Folder")
			f.Name = name
			f.Parent = districtRoot
			folders[key] = f
		end
		return f
	end

	-- Paved slab (top = Layout.Heights.Ground) centred at (pos.X, pos.Z).
	function ctx.Pave(parent: Instance, pos: Vector3, sizeX: number, sizeZ: number, color: Color3?, material: Enum.Material?)
		local h = Layout.Heights.Ground
		return Props.Part(parent, "Paving", Vector3.new(sizeX, h, sizeZ), CFrame.new(pos.X, h / 2, pos.Z), color or Color3.fromRGB(200, 198, 192), material or Enum.Material.Pavement, { CastShadow = false })
	end

	return ctx
end

local function districtZones(ctx)
	local f = ctx.Folder("Zones")
	for _, d in ipairs(Layout.Districts) do
		Props.Volume(f, "DistrictZone_" .. d.Name, CFrame.new(d.Center.X, 300, d.Center.Z), Vector3.new(d.Size.X, 600, d.Size.Y), World.Tags.DistrictZone, { District = d.Name })
	end
end

local function runPhase(ctx, phase: string)
	for i, b in ipairs(BUILDERS) do
		local fn = b[phase]
		if type(fn) == "function" then
			local t = os.clock()
			local ok, err = pcall(fn, ctx)
			if not ok then
				warn(("[WorldBuilder] %s.%s failed: %s"):format(BUILDER_NAMES[i], phase, tostring(err)))
			elseif phase == "Essential" and os.clock() - t > 0.5 then
				warn(("[WorldBuilder] %s.Essential took %.2fs"):format(BUILDER_NAMES[i], os.clock() - t))
			end
		end
	end
end

function WorldBuilder.Build(): Folder
	local t0 = os.clock()
	local city = Instance.new("Folder")
	city.Name = "City"
	city:SetAttribute("Procedural", true)
	city.Parent = Workspace

	local ctx = makeContext(city)

	-- Phase 1: essentials (synchronous)
	Props.SetYielding(false)
	local ok, err = pcall(RoadBuilder.Essential, ctx)
	if not ok then
		warn("[WorldBuilder] RoadBuilder.Essential failed: " .. tostring(err))
	end
	runPhase(ctx, "Essential")
	districtZones(ctx)
	Workspace:SetAttribute("CityReady", true)
	print(("[WorldBuilder] city essentials built: %d parts in %.2fs"):format(Props.Count(), os.clock() - t0))

	-- Phase 2: decoration (background, yields)
	task.spawn(function()
		local t1 = os.clock()
		Props.SetYielding(true)
		local okDecor, errDecor = pcall(RoadBuilder.Decor, ctx)
		if not okDecor then
			warn("[WorldBuilder] RoadBuilder.Decor failed: " .. tostring(errDecor))
		end
		runPhase(ctx, "Decor")
		Props.SetYielding(false)
		Workspace:SetAttribute("CityDecorReady", true)
		print(("[WorldBuilder] city decor built: %d parts total, %.1fs"):format(Props.Count(), os.clock() - t1))
	end)
	return city
end

return WorldBuilder
