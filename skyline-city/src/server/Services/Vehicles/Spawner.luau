-- Spawner: finds a safe place to put a car (server).
--
--   Spawner.Ground(position, ignore?, lift?) -> (Vector3?, Vector3?)  ground hit + normal under a point (ray starts `lift` above)
--   Spawner.PlaceAt(cframe, B, ignore?) -> CFrame                    pivot (ground centre, yaw only) for a given CFrame
--   Spawner.IsClear(pivot, B, ignore?) -> boolean                    no solid parts in the car's footprint
--   Spawner.FindSpot(player, B, opts) -> CFrame?                     opts = { Premium = bool, PreferRoad = bool, Exclude = {Instance} }
--       Premium: right next to the player first. Otherwise nearest free CarSpawn-tagged spot, then a road-side
--       spot near a RoadNode, then beside the player. PreferRoad (call-your-car) tries the road-side spot first.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local VehiclesConfig = require(Shared.Config.Vehicles)

local Spawner = {}

local CFG = VehiclesConfig.Spawn

local function baseIgnore(extra: { Instance }?): { Instance }
	local list: { Instance } = {}
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Character then
			table.insert(list, p.Character)
		end
	end
	local folder = Workspace:FindFirstChild(VehiclesConfig.FolderName)
	if folder then
		table.insert(list, folder)
	end
	if extra then
		for _, e in ipairs(extra) do
			table.insert(list, e)
		end
	end
	return list
end

function Spawner.Ground(position: Vector3, ignore: { Instance }?, lift: number?): (Vector3?, Vector3?)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = baseIgnore(ignore)
	params.RespectCanCollide = true
	local up = lift or 6
	local origin = position + Vector3.new(0, up, 0)
	local hit = Workspace:Raycast(origin, Vector3.new(0, -(CFG.GroundProbe + up), 0), params)
	if hit then
		return hit.Position, hit.Normal
	end
	return nil, nil
end

local function yawOnly(cf: CFrame): CFrame
	local look = Vector3.new(cf.LookVector.X, 0, cf.LookVector.Z)
	if look.Magnitude < 0.01 then
		look = Vector3.new(0, 0, -1)
	end
	return CFrame.lookAt(Vector3.zero, look.Unit)
end

function Spawner.PlaceAt(cf: CFrame, B, ignore: { Instance }?): CFrame
	local ground = Spawner.Ground(cf.Position, ignore)
	local pos = ground or cf.Position
	return CFrame.new(pos + Vector3.new(0, 0.05, 0)) * yawOnly(cf)
end

function Spawner.IsClear(pivot: CFrame, B, ignore: { Instance }?): boolean
	local pad = CFG.ClearancePadding
	local height = math.max(2, (B.TopY or (B.RoofY or B.Belt)) - 0.6)
	local size = Vector3.new(B.W + pad * 2, height, B.L + pad * 2)
	local centre = pivot * CFrame.new(0, 0.6 + height / 2, 0)
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	local exclude: { Instance } = { Workspace.Terrain }
	if ignore then
		for _, e in ipairs(ignore) do
			table.insert(exclude, e)
		end
	end
	params.FilterDescendantsInstances = exclude
	params.RespectCanCollide = true
	params.MaxParts = 1
	local parts = Workspace:GetPartBoundsInBox(centre, size, params)
	return #parts == 0
end

local function tryPivot(cf: CFrame, B, ignore: { Instance }?): CFrame?
	local ground, normal = Spawner.Ground(cf.Position, ignore)
	if not ground or (normal and normal.Y < 0.85) then
		return nil
	end
	local pivot = CFrame.new(ground + Vector3.new(0, 0.05, 0)) * yawOnly(cf)
	if Spawner.IsClear(pivot, B, ignore) then
		return pivot
	end
	return nil
end

-- A requested CFrame (job station / test-drive pad): use it when the footprint is free, otherwise the first
-- free slot beside / behind it (several players clocking in at the same station), else the CFrame itself.
function Spawner.PlaceNear(cf: CFrame, B, ignore: { Instance }?): CFrame
	local base = Spawner.PlaceAt(cf, B, ignore)
	if Spawner.IsClear(base, B, ignore) then
		return base
	end
	local yaw = yawOnly(cf)
	local origin = CFrame.new(cf.Position) * yaw
	local side = B.W + 2
	local back = B.L + 2
	local offsets = {
		CFrame.new(side, 0, 0),
		CFrame.new(-side, 0, 0),
		CFrame.new(0, 0, back),
		CFrame.new(side * 2, 0, 0),
		CFrame.new(-side * 2, 0, 0),
		CFrame.new(side, 0, back),
		CFrame.new(-side, 0, back),
		CFrame.new(0, 0, back * 2),
	}
	for _, o in ipairs(offsets) do
		local p = tryPivot(origin * o, B, ignore)
		if p then
			return p
		end
	end
	return base
end

local function besidePlayer(root: BasePart, B, ignore: { Instance }?): CFrame?
	local base = CFrame.new(root.Position) * yawOnly(root.CFrame)
	local d = CFG.BesidePlayerDistance + B.W / 2
	local offsets = {
		CFrame.new(d, 0, 0),
		CFrame.new(-d, 0, 0),
		CFrame.new(0, 0, -(B.L / 2 + 6)),
		CFrame.new(0, 0, B.L / 2 + 6),
		CFrame.new(d * 1.8, 0, 0),
		CFrame.new(-d * 1.8, 0, 0),
	}
	for _, o in ipairs(offsets) do
		local p = tryPivot(base * o, B, ignore)
		if p then
			return p
		end
	end
	return nil
end

local function sortedTagged(tag: string, from: Vector3, radius: number): { BasePart }
	local list = {}
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		if inst:IsA("BasePart") and inst:IsDescendantOf(Workspace) then
			local d = (inst.Position - from).Magnitude
			if d <= radius then
				table.insert(list, { inst, d })
			end
		end
	end
	table.sort(list, function(a, b)
		return a[2] < b[2]
	end)
	local out = {}
	for i = 1, math.min(#list, 12) do
		out[i] = list[i][1]
	end
	return out
end

local function roadSide(node: BasePart, from: Vector3, B, ignore: { Instance }?): CFrame?
	-- face along the road toward the nearest neighbouring node
	local best, bestD = nil, math.huge
	for _, other in ipairs(sortedTagged(World.Tags.RoadNode, node.Position, 200)) do
		if other ~= node then
			local d = (other.Position - node.Position).Magnitude
			if d > 4 and d < bestD then
				best, bestD = other, d
			end
		end
	end
	local dir = best and (best.Position - node.Position) or (from - node.Position)
	dir = Vector3.new(dir.X, 0, dir.Z)
	if dir.Magnitude < 0.1 then
		dir = Vector3.new(0, 0, -1)
	end
	local cf = CFrame.lookAt(node.Position, node.Position + dir.Unit)
	for _, offset in ipairs({ B.W / 2 + 3.5, -(B.W / 2 + 3.5), 0 }) do
		local p = tryPivot(cf * CFrame.new(offset, 0, 0), B, ignore)
		if p then
			return p
		end
	end
	return nil
end

function Spawner.FindSpot(player: Player, B, opts: { [string]: any }?): CFrame?
	local o = opts or {}
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if not (root and root:IsA("BasePart")) then
		return nil
	end
	local ignore = o.Exclude
	if o.Premium then
		local p = besidePlayer(root, B, ignore)
		if p then
			return p
		end
	end
	local function road(): CFrame?
		for _, node in ipairs(sortedTagged(World.Tags.RoadNode, root.Position, CFG.RoadSearchRadius)) do
			local p = roadSide(node, root.Position, B, ignore)
			if p then
				return p
			end
		end
		return nil
	end
	if o.PreferRoad then
		-- "call your car": it pulls up at the kerb of the nearest road
		local p = road()
		if p then
			return p
		end
	end
	for _, spot in ipairs(sortedTagged(World.Tags.CarSpawn, root.Position, CFG.CarSpawnSearchRadius)) do
		local ig = { spot }
		if ignore then
			for _, e in ipairs(ignore) do
				table.insert(ig, e)
			end
		end
		local top = spot.CFrame * CFrame.new(0, spot.Size.Y / 2, 0)
		local p = tryPivot(top, B, ig)
		if p then
			return p
		end
	end
	if not o.PreferRoad then
		local p = road()
		if p then
			return p
		end
	end
	return besidePlayer(root, B, ignore)
end

return Spawner
