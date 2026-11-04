-- Shell (server helper): the shop building on a business lot.
--
--   Shell.Layout(lotSize: Vector3) -> { W, D, Z0, FrontZ, BackZ, DoorX, Side }
--       geometry of the procedural shop building in LOT space (origin = lot top centre). Side = +1/-1 street side.
--   Shell.HasAsset(typeId) -> boolean        a real model exists at ServerStorage.Assets.Buildings.Business_<TypeId>
--   Shell.PlaceAsset(typeId, parent, origin) -> Model?   clones + anchors + pivots the real shell (if it exists)
--   Shell.StarterBuild(typeId, lotSize) -> build table   free starter layout (walls/floor/roof + stations)
--   Shell.DoorOffset(lotSize) / Shell.EntranceOffset(lotSize) -> Vector3 (lot space) used by cosmetic customers
--
-- Lot space: +X right, +Y up, the street is on the Side * +Z edge. Furniture fronts face -Z at step 0.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config.Businesses)
local Furniture = require(Shared.Config.Furniture)
local HousingConfig = require(Shared.Config.Housing)
local BuildMath = require(Shared.Build.BuildMath)
local Serializer = require(Shared.Build.Serializer)

local Shell = {}

local FH = HousingConfig.Build.FloorHeight
local ROOF = HousingConfig.Build.RoofAllowance
local WT = 0.6

local function side(): number
	return (Config.Lots.EntranceSide or 1) >= 0 and 1 or -1
end

function Shell.Layout(lotSize: Vector3)
	local S = Config.Shell
	local W = math.clamp(math.floor((lotSize.X - 12) / 16) * 16, 16, S.Width)
	local D = math.clamp(math.floor((lotSize.Z - 20) / 16) * 16, 16, S.Depth)
	local s = side()
	-- push the building away from the street to leave a front yard
	local z0 = -s * math.max(0, (lotSize.Z - D) / 4)
	local frontZ = z0 + s * (D / 2 - WT / 2)
	local backZ = z0 - s * (D / 2 - WT / 2)
	local segments = W // 8
	local doorIndex = segments // 2
	local doorX = -W / 2 + 4 + 8 * doorIndex
	return { W = W, D = D, Z0 = z0, FrontZ = frontZ, BackZ = backZ, DoorX = doorX, Side = s, Segments = segments, DoorIndex = doorIndex }
end

local function assetFor(typeId: string): Model?
	local assets = ServerStorage:FindFirstChild("Assets")
	local folder = assets and assets:FindFirstChild("Buildings")
	local m = folder and folder:FindFirstChild("Business_" .. typeId)
	if m and m:IsA("Model") then
		return m
	end
	return nil
end

function Shell.HasAsset(typeId: string): boolean
	return assetFor(typeId) ~= nil
end

function Shell.PlaceAsset(typeId: string, parent: Instance, origin: CFrame): Model?
	local template = assetFor(typeId)
	if not template then
		return nil
	end
	local model = template:Clone()
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			d.Anchored = true
		end
	end
	local rot = side() == 1 and CFrame.new() or CFrame.Angles(0, math.pi, 0)
	model:PivotTo(origin * rot)
	model.Name = "Shell"
	model.Parent = parent
	return model
end

function Shell.DoorOffset(lotSize: Vector3): Vector3
	local L = Shell.Layout(lotSize)
	return Vector3.new(L.DoorX, 0, L.FrontZ + L.Side * 2)
end

function Shell.EntranceOffset(lotSize: Vector3): Vector3
	local L = Shell.Layout(lotSize)
	return Vector3.new(L.DoorX, 0, L.Side * (lotSize.Z / 2 + 3))
end

-- Starter build -----------------------------------------------------------
function Shell.StarterBuild(typeId: string, lotSize: Vector3, floors: number?)
	local t = Config.Types[typeId]
	local L = Shell.Layout(lotSize)
	local S = Config.Shell
	local s = L.Side
	local entries = {}
	local n = 0
	local area = Vector3.new(lotSize.X, FH, lotSize.Z)
	local maxTop, maxBottom = BuildMath.HeightLimits(floors or 1, FH, ROOF)

	-- step flip so "12 = faces the street" holds when the street is on -Z
	local function stepFor(step: number): number
		if s == 1 then
			return BuildMath.NormalizeStep(step)
		end
		return BuildMath.NormalizeStep(step + 12)
	end

	local function add(id: string, x: number, y: number, z: number, step: number)
		local def = Furniture.ById[id]
		if not def then
			return
		end
		local pos = BuildMath.RoundVector(Vector3.new(x, y, z))
		if not BuildMath.InBounds(def.Size, pos, step, area, maxTop, maxBottom) then
			return
		end
		n += 1
		local uid = tostring(n)
		entries[uid] = { Uid = uid, ItemId = id, Position = pos, Step = step, Paid = 0, Free = true }
	end

	if not Shell.HasAsset(typeId) then
		-- front wall: glass, doorway in the middle
		for i = 0, L.Segments - 1 do
			local x = -L.W / 2 + 4 + 8 * i
			if i == L.DoorIndex then
				add(S.DoorItem, x, 0, L.FrontZ, 0)
			else
				add(S.WindowItem, x, 0, L.FrontZ, 0)
			end
			add(S.WallItem, x, 0, L.BackZ, 0)
		end
		-- side walls
		for j = 0, (L.D // 8) - 1 do
			local z = L.Z0 - L.D / 2 + 4 + 8 * j
			add(S.WallItem, -L.W / 2 + WT / 2, 0, z, 6)
			add(S.WallItem, L.W / 2 - WT / 2, 0, z, 6)
		end
		-- floor + roof (16 x 16 tiles)
		for i = 0, (L.W // 16) - 1 do
			for j = 0, (L.D // 16) - 1 do
				local x = -L.W / 2 + 8 + 16 * i
				local z = L.Z0 - L.D / 2 + 8 + 16 * j
				add(S.FloorItem, x, 0, z, 0)
				if S.Roof then
					add(S.RoofItem, x, FH, z, 0)
				end
			end
		end
	end

	-- stations
	if t and t.Starter then
		local floorY = Shell.HasAsset(typeId) and 0 or 0.4
		for _, item in ipairs(t.Starter) do
			local def = Furniture.ById[item.Id]
			if def then
				local z
				if item.Anchor == "Back" then
					z = L.BackZ + s * (WT / 2 + item.Z)
				elseif item.Anchor == "Yard" then
					z = L.FrontZ + s * item.Z
				else
					z = L.FrontZ - s * item.Z
				end
				local yBase = item.Anchor == "Yard" and 0 or floorY
				local x = item.X
				if item.Anchor ~= "Yard" then
					-- keep indoor stations inside the (possibly shrunk) building
					local half = math.max(def.Size.X, def.Size.Z) / 2 + WT
					local limit = math.max(0, L.W / 2 - half)
					x = math.clamp(x, -limit, limit)
				end
				add(item.Id, x, yBase + (item.Y or 0), z, stepFor(item.Step or 0))
			end
		end
	end
	return Serializer.EncodeBuild(entries, n + 1, {})
end

return Shell
