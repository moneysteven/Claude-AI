-- PedestrianController: CLIENT-SIDE cosmetic pedestrians.
--   * pooled blocky NPCs (NpcModels.Pedestrian, 7 anchored parts) walking the WalkNode sidewalk graph
--     (NavGraph: from Config/CityLayout + streamed WalkNode parts), crossing streets on the crosswalks
--   * only near you: spawn within SpawnRadius (not closer than MinSpawnDistance), despawn beyond DespawnRadius
--   * limb swing + bob animation via CFrame (only within AnimateDistance), occasional short pauses at corners
--   * max 20 (6 with Settings.LowGraphics)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Ambient = require(Shared.Config.Ambient)
local Layout = require(Shared.Config.CityLayout)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))

local NavGraph = require(script.Parent:WaitForChild("NavGraph"))
local NpcModels = require(script.Parent:WaitForChild("NpcModels"))

local PedestrianController = {
	Name = "PedestrianController",
	Priority = 150,
}

local CFG = Ambient.Pedestrians
local ROAD_DIP = (Layout.Heights.Sidewalk or 0.9) - (Layout.Heights.Road or 0.4)
local player = Players.LocalPlayer
local rng = Random.new()

local folder: Folder
local graph
local active = {}
local pool = {}
local maxPeds = CFG.Max

local function pick(list: { Color3 }): Color3
	return list[rng:NextInteger(1, #list)]
end

local function focusPosition(): Vector3?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root.Position
	end
	local cam = Workspace.CurrentCamera
	return cam and cam.Focus.Position or nil
end

local function acquire()
	local ped = table.remove(pool)
	if not ped then
		ped = NpcModels.FromAsset("Pedestrian")
	end
	if ped and ped.Rigid then
		-- real model: keep its own look
	elseif ped then
		ped.Torso.Color = pick(CFG.ShirtColors)
		local skin = pick(CFG.SkinColors)
		ped.Head.Color = skin
		ped.LeftArm.Color = skin
		ped.RightArm.Color = skin
		local pants = pick(CFG.PantsColors)
		ped.LeftLeg.Color = pants
		ped.RightLeg.Color = pants
		ped.Hair.Color = pick(CFG.HairColors)
	else
		ped = NpcModels.Pedestrian(pick(CFG.SkinColors), pick(CFG.ShirtColors), pick(CFG.PantsColors), pick(CFG.HairColors))
	end
	ped.Model.Parent = folder
	return ped
end

local function release(e)
	e.Ped.Model.Parent = nil
	table.insert(pool, e.Ped)
end

local function setEdge(e, from, to)
	e.From = from
	e.To = to
	e.Len = math.max(0.1, (to.Position - from.Position).Magnitude)
	e.Dist = 0
	e.Crossing = from.Cross ~= nil and from.Cross[to.Id] == true
end

local function trySpawn(focus: Vector3)
	local node = graph:RandomNear(focus, CFG.SpawnRadius, CFG.MinSpawnDistance, rng)
	if not node then
		return
	end
	local nextNode = graph:Next(node, nil, rng)
	if not nextNode then
		return
	end
	local e = {
		Ped = acquire(),
		Speed = rng:NextNumber(CFG.WalkSpeed[1], CFG.WalkSpeed[2]),
		Phase = rng:NextNumber(0, math.pi * 2),
		Pause = 0,
		Side = rng:NextNumber(-1.6, 1.6), -- lateral offset so pedestrians don't walk in single file
	}
	setEdge(e, node, nextNode)
	e.Pos = node.Position
	local d = nextNode.Position - node.Position
	e.Look = d.Magnitude > 0.01 and Vector3.new(d.X, 0, d.Z).Unit or Vector3.new(0, 0, -1)
	table.insert(active, e)
end

local function step(dt: number)
	if #active == 0 then
		return
	end
	local focus = focusPosition()
	local parts, cframes = {}, {}
	local turn = 1 - math.exp(-8 * dt)
	for i = #active, 1, -1 do
		local e = active[i]
		local moving = true
		if e.Pause > 0 then
			e.Pause -= dt
			moving = false
		else
			e.Dist += e.Speed * dt
			if e.Dist >= e.Len then
				local nextNode = graph:Next(e.To, e.From.Id, rng)
				if not nextNode then
					release(e)
					table.remove(active, i)
					continue
				end
				setEdge(e, e.To, nextNode)
				if rng:NextNumber() < 0.12 then
					e.Pause = rng:NextNumber(1, 3.5)
				end
			end
		end
		local t = math.clamp(e.Dist / e.Len, 0, 1)
		local pos = e.From.Position:Lerp(e.To.Position, t)
		local dir = e.To.Position - e.From.Position
		local flat = Vector3.new(dir.X, 0, dir.Z)
		if flat.Magnitude > 0.01 then
			local blended = e.Look:Lerp(flat.Unit, turn)
			if blended.Magnitude > 0.01 then
				e.Look = blended.Unit
			end
		end
		if e.Crossing then
			-- step down off the kerb onto the crosswalk and back up
			local edge = math.clamp(math.min(t, 1 - t) / 0.08, 0, 1)
			pos -= Vector3.new(0, ROAD_DIP * edge, 0)
		end
		local right = e.Look:Cross(Vector3.yAxis)
		pos += right * e.Side
		e.Pos = pos
		local swing, bob = 0, 0
		local near = focus and (pos - focus).Magnitude < CFG.AnimateDistance
		if moving and near then
			e.Phase += dt * e.Speed * 1.1
			swing = math.sin(e.Phase) * CFG.SwingAngle
			bob = math.abs(math.cos(e.Phase)) * 0.15
		end
		if near or e.Moved ~= true then
			NpcModels.PosePed(e.Ped, CFrame.lookAt(pos, pos + e.Look), swing, bob, parts, cframes)
			e.Moved = true
		elseif moving then
			-- far away: move rigidly without limb animation (cheaper pose)
			NpcModels.PosePed(e.Ped, CFrame.lookAt(pos, pos + e.Look), 0, 0, parts, cframes)
		end
	end
	if #parts > 0 then
		Workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

local function maintain()
	local focus = focusPosition()
	if not focus then
		return
	end
	for i = #active, 1, -1 do
		local e = active[i]
		local d = e.Pos - focus
		if Vector3.new(d.X, 0, d.Z).Magnitude > CFG.DespawnRadius then
			release(e)
			table.remove(active, i)
		end
	end
	while #active > maxPeds do
		release(table.remove(active) :: any)
	end
	if focus.Y > 120 then
		return
	end
	if #active < maxPeds then
		trySpawn(focus)
	end
end

local function applyLowGraphics(low: any)
	maxPeds = (low == true) and CFG.LowGraphicsMax or CFG.Max
end

function PedestrianController:Start()
	folder = Instance.new("Folder")
	folder.Name = "NPCPedestrians"
	folder.Parent = Workspace
	graph = NavGraph.new("Walk")

	applyLowGraphics(ClientData.Get("Settings.LowGraphics"))
	ClientData.OnChanged("Settings.LowGraphics", applyLowGraphics)

	RunService.Heartbeat:Connect(function(dt)
		local ok, err = pcall(step, math.min(dt, 0.1))
		if not ok then
			warn("[Pedestrians] " .. tostring(err))
			for _, e in ipairs(active) do
				release(e)
			end
			table.clear(active)
		end
	end)
	task.spawn(function()
		while true do
			task.wait(CFG.SpawnInterval)
			pcall(maintain)
		end
	end)
end

return PedestrianController
