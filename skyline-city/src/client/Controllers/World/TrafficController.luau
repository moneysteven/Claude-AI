-- TrafficController: CLIENT-SIDE cosmetic NPC traffic.
--   * pooled cheap car models (NpcModels.Car, ~10 anchored parts) driving the RoadNode lane graph
--     (NavGraph: built from Config/CityLayout, extended with streamed RoadNode parts)
--   * spawn only within Config.Ambient.Traffic.SpawnRadius of you (never right next to you), despawn when far
--   * CFrame lerp along links at varied per-road speeds, smooth heading through intersections
--   * stops for players / player vehicles / other NPC cars ahead (raycast + gap check at ObstacleHz)
--   * max 18 cars (6 with Settings.LowGraphics), headlights at night
-- Purely local: nothing here is replicated or trusted by the server.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Ambient = require(Shared.Config.Ambient)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))

local NavGraph = require(script.Parent:WaitForChild("NavGraph"))
local NpcModels = require(script.Parent:WaitForChild("NpcModels"))
local WorldClock = require(script.Parent:WaitForChild("WorldClock"))

local TrafficController = {
	Name = "TrafficController",
	Priority = 150,
}

local CFG = Ambient.Traffic
local player = Players.LocalPlayer
local rng = Random.new()

local folder: Folder
local graph
local active = {}
local pool = {}
local maxCars = CFG.MaxCars
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude
rayParams.RespectCanCollide = true
rayParams.IgnoreWater = true

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
	local car = table.remove(pool)
	if not car then
		car = NpcModels.FromAsset("TrafficCar") or NpcModels.Car(CFG.Colors[rng:NextInteger(1, #CFG.Colors)])
	elseif not car.Rigid then
		local color = CFG.Colors[rng:NextInteger(1, #CFG.Colors)]
		car.Parts[1].Color = color
		car.Parts[3].Color = color
	end
	car.Model.Parent = folder
	return car
end

local function release(entry)
	local car = entry.Car
	car.Model.Parent = nil
	NpcModels.SetCarLights(car, false)
	table.insert(pool, car)
end

local function setEdge(entry, from, to)
	entry.From = from
	entry.To = to
	local delta = to.Position - from.Position
	entry.Len = math.max(0.1, delta.Magnitude)
	entry.Dist = 0
	-- each car keeps its own temperament (SpeedFactor) so it doesn't speed up / slow down at every node
	local smin, smax = to.SpeedMin or 26, to.SpeedMax or 40
	entry.MaxSpeed = smin + (smax - smin) * (entry.SpeedFactor or 0.5)
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
	for _, other in ipairs(active) do
		if (other.Pos - node.Position).Magnitude < 24 then
			return
		end
	end
	local entry = { Car = acquire(), Blocked = false, Stuck = 0, Speed = 0, SpeedFactor = rng:NextNumber() }
	setEdge(entry, node, nextNode)
	entry.Pos = node.Position
	local dir = nextNode.Position - node.Position
	entry.Look = dir.Magnitude > 0.01 and dir.Unit or Vector3.new(0, 0, -1)
	entry.Speed = entry.MaxSpeed * 0.6
	NpcModels.SetCarLights(entry.Car, WorldClock.IsNight())
	table.insert(active, entry)
end

local function step(dt: number)
	if #active == 0 then
		return
	end
	local parts, cframes = {}, {}
	local turn = 1 - math.exp(-CFG.TurnRate * dt)
	local i = 1
	while i <= #active do
		local e = active[i]
		local target = e.Blocked and 0 or e.MaxSpeed
		if e.Speed < target then
			e.Speed = math.min(target, e.Speed + CFG.Accel * dt)
		else
			e.Speed = math.max(target, e.Speed - CFG.Brake * dt)
		end
		e.Dist += e.Speed * dt
		local alive = true
		local guard = 0
		while e.Dist >= e.Len and guard < 4 do
			guard += 1
			local over = e.Dist - e.Len
			local nextNode = graph:Next(e.To, e.From.Id, rng)
			if not nextNode then
				alive = false
				break
			end
			setEdge(e, e.To, nextNode)
			e.Dist = over
		end
		if not alive then
			release(e)
			table.remove(active, i)
		else
			local t = math.clamp(e.Dist / e.Len, 0, 1)
			local pos = e.From.Position:Lerp(e.To.Position, t)
			local dir = e.To.Position - e.From.Position
			if dir.Magnitude > 0.01 then
				local flat = Vector3.new(dir.X, 0, dir.Z)
				if flat.Magnitude > 0.01 then
					local blended = e.Look:Lerp(flat.Unit, turn)
					if blended.Magnitude > 0.01 then
						e.Look = blended.Unit
					end
				end
			end
			e.Pos = pos
			NpcModels.PoseCar(e.Car, CFrame.lookAt(pos, pos + e.Look), parts, cframes)
			i += 1
		end
	end
	if #parts > 0 then
		Workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

local function isBlocker(inst: Instance): boolean
	local model = inst:FindFirstAncestorOfClass("Model")
	while model do
		if model:FindFirstChildOfClass("Humanoid") then
			return true
		end
		if model:GetAttribute("CarUid") ~= nil or model:GetAttribute("ModelId") ~= nil then
			return true
		end
		model = model:FindFirstAncestorOfClass("Model")
	end
	return inst:IsA("VehicleSeat")
end

local function obstacleCheck()
	local char = player.Character
	local filter = { folder }
	local peds = Workspace:FindFirstChild("NPCPedestrians")
	if peds then
		table.insert(filter, peds)
	end
	local fx = Workspace:FindFirstChild("WorldFx")
	if fx then
		table.insert(filter, fx)
	end
	rayParams.FilterDescendantsInstances = filter
	local myRoot = char and char:FindFirstChild("HumanoidRootPart")
	for _, e in ipairs(active) do
		local blocked = false
		local front = e.Pos + Vector3.new(0, 2.6, 0) + e.Look * 7.8
		-- other NPC cars ahead in the same direction
		for _, o in ipairs(active) do
			if o ~= e then
				local d = o.Pos - e.Pos
				local ahead = d:Dot(e.Look)
				if ahead > 0 and ahead < CFG.CarGap and (d - e.Look * ahead).Magnitude < 4 and o.Look:Dot(e.Look) > 0.3 then
					blocked = true
					break
				end
			end
		end
		-- the local player standing in front (fast path, no raycast)
		if not blocked and myRoot and myRoot:IsA("BasePart") then
			local d = myRoot.Position - e.Pos
			local ahead = d:Dot(e.Look)
			if ahead > 0 and ahead < CFG.LookAhead and (d - e.Look * ahead).Magnitude < 5 and math.abs(d.Y) < 10 then
				blocked = true
			end
		end
		if not blocked then
			local hit = Workspace:Raycast(front, e.Look * CFG.LookAhead, rayParams)
			if hit and isBlocker(hit.Instance) then
				blocked = true
			end
		end
		e.Blocked = blocked
		if blocked then
			e.Stuck += 1 / CFG.ObstacleHz
		else
			e.Stuck = 0
		end
	end
end

local function maintain()
	local focus = focusPosition()
	if not focus then
		return
	end
	-- despawn far / stuck cars
	for i = #active, 1, -1 do
		local e = active[i]
		local d = e.Pos - focus
		if Vector3.new(d.X, 0, d.Z).Magnitude > CFG.DespawnRadius or e.Stuck > CFG.StuckDespawnSeconds then
			release(e)
			table.remove(active, i)
		end
	end
	while #active > maxCars do
		release(table.remove(active) :: any)
	end
	-- no traffic while up in a skyscraper
	if focus.Y > 120 then
		return
	end
	if #active < maxCars then
		trySpawn(focus)
	end
end

local function applyLowGraphics(low: any)
	maxCars = (low == true) and CFG.LowGraphicsMaxCars or CFG.MaxCars
end

function TrafficController:Start()
	folder = Instance.new("Folder")
	folder.Name = "NPCTraffic"
	folder.Parent = Workspace
	graph = NavGraph.new("Road")

	applyLowGraphics(ClientData.Get("Settings.LowGraphics"))
	ClientData.OnChanged("Settings.LowGraphics", applyLowGraphics)

	RunService.Heartbeat:Connect(function(dt)
		local ok, err = pcall(step, math.min(dt, 0.1))
		if not ok then
			warn("[Traffic] " .. tostring(err))
			for _, e in ipairs(active) do
				release(e)
			end
			table.clear(active)
		end
	end)

	task.spawn(function()
		local acc = 0
		local lightAcc = 0
		local interval = 1 / CFG.ObstacleHz
		while true do
			task.wait(interval)
			pcall(obstacleCheck)
			acc += interval
			lightAcc += interval
			if acc >= CFG.SpawnInterval then
				acc = 0
				pcall(maintain)
			end
			if lightAcc >= 1 then
				lightAcc = 0
				local night = WorldClock.IsNight()
				for _, e in ipairs(active) do
					NpcModels.SetCarLights(e.Car, night)
				end
			end
		end
	end)
end

return TrafficController
