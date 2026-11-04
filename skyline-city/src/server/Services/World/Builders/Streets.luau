-- Streets builder: city-wide street furniture tied to the road graph — taxi Pickup/Dropoff posts at every
-- street corner, extra police PatrolPoints and PatientSpots, kerbside CarSpawns around the park and hydrants.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Layout = require(Shared.Config.CityLayout)
local RoadGraph = require(Shared:WaitForChild("World"):WaitForChild("RoadGraph"))

local Streets = {}

local WALK_Y = Layout.Heights.Sidewalk

local function streetCorners()
	local info = RoadGraph.Analyze(Layout)
	local out = {}
	for _, it in ipairs(info.Intersections) do
		if it.Street and not it.Highway then
			table.insert(out, it)
		end
	end
	return out
end

function Streets.Essential(ctx)
	local P, G = ctx.Props, ctx.G
	local f = ctx.Folder("Streets")
	for i, it in ipairs(streetCorners()) do
		local p = it.Pos
		-- taxi posts sit on the kerb of the north-south street and face away from it (fares wait on the sidewalk)
		G.Target(f, "Taxi", "Pickup", P.Facing(Vector3.new(p.X + it.Hx + 2, WALK_Y, p.Z + it.Hz + 8), Vector3.new(1, 0, 0)))
		G.Target(f, "Taxi", "Dropoff", P.Facing(Vector3.new(p.X - it.Hx - 2, WALK_Y, p.Z - it.Hz - 8), Vector3.new(-1, 0, 0)))
		if i % 8 == 3 then
			G.Target(f, "Police", "PatrolPoint", P.Facing(Vector3.new(p.X - it.Hx - 5, WALK_Y, p.Z + it.Hz + 5), Vector3.new(-1, 0, 1)))
		elseif i % 9 == 5 then
			G.Target(f, "Paramedic", "PatientSpot", P.Facing(Vector3.new(p.X + it.Hx + 5, WALK_Y, p.Z - it.Hz - 5), Vector3.new(1, 0, -1)))
		end
	end
	-- kerbside spawns around Central Park
	G.CarSpawn(f, G.ParkingCF("X", -300, -100, 1))
	G.CarSpawn(f, G.ParkingCF("X", -300, 100, 1))
	G.CarSpawn(f, G.ParkingCF("X", 300, -100, -1))
	G.CarSpawn(f, G.ParkingCF("X", 300, 100, -1))
	G.CarSpawn(f, G.ParkingCF("Z", -300, -150, -1))
	G.CarSpawn(f, G.ParkingCF("Z", 300, 150, 1))
end

function Streets.Decor(ctx)
	local P = ctx.Props
	local f = ctx.Folder("Streets")
	for i, it in ipairs(streetCorners()) do
		if i % 2 == 0 then
			local p = it.Pos + Vector3.new(it.Hx + 7, WALK_Y, -it.Hz - 7)
			P.Small(f, "Hydrant", Vector3.new(1.2, 2.4, 1.2), CFrame.new(p + Vector3.new(0, 1.2, 0)), Color3.fromRGB(220, 50, 40), Enum.Material.Metal)
			P.Small(f, "HydrantCap", Vector3.new(1.5, 0.4, 1.5), CFrame.new(p + Vector3.new(0, 2.6, 0)), Color3.fromRGB(240, 200, 60), Enum.Material.Metal)
		else
			local p = it.Pos + Vector3.new(-it.Hx - 7, WALK_Y, it.Hz + 7)
			P.Small(f, "TrashBin", Vector3.new(2, 3, 2), CFrame.new(p + Vector3.new(0, 1.5, 0)), Color3.fromRGB(40, 90, 60), Enum.Material.Metal)
		end
	end
end

return Streets
