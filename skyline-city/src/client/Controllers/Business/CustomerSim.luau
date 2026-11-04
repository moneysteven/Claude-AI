-- CustomerSim (client helper): purely cosmetic NPC customers walking into open player businesses.
-- Driven by lot attributes set by the server (Open, CustomersPerMinute, BizType, EntranceOffset, DoorOffset).
-- Pooled block NPCs, ≤ MAX_PER_LOT per business, only for lots near the camera, moved with BulkMoveTo.
--   CustomerSim.Start()   (call once)
-- Works with StreamingEnabled: lots and built items are discovered through CollectionService / folder lookups
-- and simply skipped while not streamed in.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Config = require(Shared.Config.Businesses)
local Furniture = require(Shared.Config.Furniture)
local Pool = require(Shared.Util.Pool)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))

local CustomerSim = {}

local TAG = World.Tags.BusinessLot
local MAX_PER_LOT = 6
local MAX_TOTAL = 30
local RANGE = 260
local SPEED = 6.5
local HIP = 2 -- root height above ground

local SHIRTS = {
	Color3.fromRGB(220, 70, 70),
	Color3.fromRGB(70, 130, 220),
	Color3.fromRGB(80, 180, 110),
	Color3.fromRGB(240, 190, 60),
	Color3.fromRGB(160, 90, 200),
	Color3.fromRGB(240, 240, 240),
	Color3.fromRGB(40, 40, 46),
	Color3.fromRGB(250, 130, 60),
}
local PANTS = {
	Color3.fromRGB(40, 50, 80),
	Color3.fromRGB(30, 30, 34),
	Color3.fromRGB(110, 90, 70),
	Color3.fromRGB(70, 74, 82),
}
local SKIN = {
	Color3.fromRGB(255, 220, 185),
	Color3.fromRGB(234, 184, 146),
	Color3.fromRGB(198, 134, 88),
	Color3.fromRGB(141, 85, 52),
	Color3.fromRGB(96, 60, 38),
}

type Npc = {
	Model: Model,
	Parts: { BasePart },
	Path: { Vector3 },
	Index: number,
	Pos: Vector3,
	Look: Vector3,
	State: string, -- "in" | "wait" | "out"
	WaitUntil: number,
	Phase: number,
	Back: { Vector3 },
}

type LotSim = { Part: BasePart, Npcs: { Npc }, NextSpawn: number }

local rng = Random.new()
local folder: Folder
local pool
local lots: { [BasePart]: LotSim } = {}
local total = 0
local started = false

local function makeNpc(): Model
	local m = Instance.new("Model")
	m.Name = "BizCustomer"
	local function part(name: string, size: Vector3): Part
		local p = Instance.new("Part")
		p.Name = name
		p.Size = size
		p.Anchored = true
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.CastShadow = false
		p.Material = Enum.Material.SmoothPlastic
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		p.Parent = m
		return p
	end
	part("Torso", Vector3.new(2, 2, 1))
	part("Head", Vector3.new(1.2, 1.2, 1.2))
	part("LeftArm", Vector3.new(0.8, 1.9, 0.8))
	part("RightArm", Vector3.new(0.8, 1.9, 0.8))
	part("LeftLeg", Vector3.new(0.95, 2, 0.95))
	part("RightLeg", Vector3.new(0.95, 2, 0.95))
	local face = Instance.new("Decal")
	face.Name = "Face"
	face.Face = Enum.NormalId.Front
	face.Texture = "rbxasset://textures/face.png"
	face.Parent = m:FindFirstChild("Head")
	return m
end

local function pick<T>(list: { T }): T
	return list[rng:NextInteger(1, #list)]
end

local function lotTop(part: BasePart): CFrame
	return part.CFrame * CFrame.new(0, part.Size.Y / 2, 0)
end

local function buildFolderFor(part: BasePart): Instance?
	local root = Workspace:FindFirstChild("SkylineBusinesses")
	local lotId = part:GetAttribute("LotId")
	local lotFolder = root and type(lotId) == "string" and root:FindFirstChild(lotId)
	return lotFolder and lotFolder:FindFirstChild("Build") or nil
end

-- stand point in front of a built item (furniture fronts face -Z)
local function standPoint(model: Model, groundY: number): Vector3?
	local def = Furniture.ById[model:GetAttribute("ItemId") or ""]
	local depth = def and def.Size.Z or 3
	local ok, pivot = pcall(model.GetPivot, model)
	if not ok then
		return nil
	end
	local p = (pivot * CFrame.new(rng:NextNumber(-0.8, 0.8), 0, -(depth / 2 + 1.8))).Position
	return Vector3.new(p.X, groundY, p.Z)
end

local function planPath(part: BasePart): { Vector3 }?
	local top = lotTop(part)
	local entrance = part:GetAttribute("EntranceOffset")
	local door = part:GetAttribute("DoorOffset")
	if typeof(entrance) ~= "Vector3" or typeof(door) ~= "Vector3" then
		return nil
	end
	local groundY = top.Position.Y
	local path = { (top * CFrame.new(entrance + Vector3.new(rng:NextNumber(-2, 2), 0, 0))).Position, (top * CFrame.new(door)).Position }
	local t = Config.Types[part:GetAttribute("BizType") or ""]
	local build = buildFolderFor(part)
	local added = false
	if t and build then
		local byFn: { [string]: { Model } } = {}
		for _, m in ipairs(build:GetChildren()) do
			if m:IsA("Model") then
				local fn = m:GetAttribute("Function")
				if type(fn) == "string" then
					byFn[fn] = byFn[fn] or {}
					table.insert(byFn[fn], m)
				end
			end
		end
		for _, fn in ipairs(t.CustomerPath) do
			local list = byFn[fn]
			if list and #list > 0 then
				local sp = standPoint(pick(list), groundY + 0.4)
				if sp then
					table.insert(path, sp)
					added = true
				end
			end
		end
	end
	if not added then
		-- nothing streamed in yet: wander to a spot just inside the door
		local inside = top * CFrame.new(door - Vector3.new(rng:NextNumber(-4, 4), 0, (Config.Lots.EntranceSide >= 0 and 1 or -1) * 8))
		table.insert(path, inside.Position)
	end
	for i, p in ipairs(path) do
		path[i] = Vector3.new(p.X, p.Y + HIP, p.Z)
	end
	return path
end

local function release(sim: LotSim, index: number)
	local npc = table.remove(sim.Npcs, index)
	if npc then
		total -= 1
		pool:Release(npc.Model)
	end
end

local function clearLot(sim: LotSim)
	for i = #sim.Npcs, 1, -1 do
		release(sim, i)
	end
end

local function spawnNpc(sim: LotSim)
	local path = planPath(sim.Part)
	if not path or #path < 2 then
		return
	end
	local model = pool:Get() :: Model
	local parts = {
		model:FindFirstChild("Torso") :: BasePart,
		model:FindFirstChild("Head") :: BasePart,
		model:FindFirstChild("LeftArm") :: BasePart,
		model:FindFirstChild("RightArm") :: BasePart,
		model:FindFirstChild("LeftLeg") :: BasePart,
		model:FindFirstChild("RightLeg") :: BasePart,
	}
	local shirt, pants, skin = pick(SHIRTS), pick(PANTS), pick(SKIN)
	parts[1].Color = shirt
	parts[2].Color = skin
	parts[3].Color = skin
	parts[4].Color = skin
	parts[5].Color = pants
	parts[6].Color = pants
	local back = {}
	for i = #path - 1, 1, -1 do
		table.insert(back, path[i])
	end
	local npc: Npc = {
		Model = model,
		Parts = parts,
		Path = path,
		Index = 2,
		Pos = path[1],
		Look = (path[2] - path[1]).Magnitude > 0.01 and (path[2] - path[1]).Unit or Vector3.new(0, 0, -1),
		State = "in",
		WaitUntil = 0,
		Phase = rng:NextNumber(0, math.pi * 2),
		Back = back,
	}
	model.Parent = folder
	table.insert(sim.Npcs, npc)
	total += 1
end

local function poseCFrames(npc: Npc, walking: boolean, out: { CFrame })
	local look = Vector3.new(npc.Look.X, 0, npc.Look.Z)
	if look.Magnitude < 1e-3 then
		look = Vector3.new(0, 0, -1)
	end
	local root = CFrame.lookAt(npc.Pos, npc.Pos + look.Unit)
	local swing = walking and math.sin(npc.Phase) * 0.7 or 0
	local bob = walking and math.abs(math.sin(npc.Phase)) * 0.12 or 0
	root *= CFrame.new(0, bob, 0)
	table.insert(out, root * CFrame.new(0, 1, 0))
	table.insert(out, root * CFrame.new(0, 2.6, 0))
	table.insert(out, root * CFrame.new(-1.4, 1.9, 0) * CFrame.Angles(swing, 0, 0) * CFrame.new(0, -0.9, 0))
	table.insert(out, root * CFrame.new(1.4, 1.9, 0) * CFrame.Angles(-swing, 0, 0) * CFrame.new(0, -0.9, 0))
	table.insert(out, root * CFrame.new(-0.5, 0, 0) * CFrame.Angles(-swing, 0, 0) * CFrame.new(0, -1, 0))
	table.insert(out, root * CFrame.new(0.5, 0, 0) * CFrame.Angles(swing, 0, 0) * CFrame.new(0, -1, 0))
end

local function step(dt: number)
	if total == 0 then
		return
	end
	local parts: { BasePart } = {}
	local cfs: { CFrame } = {}
	local now = os.clock()
	for _, sim in pairs(lots) do
		for i = #sim.Npcs, 1, -1 do
			local npc = sim.Npcs[i]
			local walking = false
			if npc.State == "wait" then
				if now >= npc.WaitUntil then
					npc.State = "out"
					npc.Path = npc.Back
					npc.Index = 1
				end
			else
				local target = npc.Path[npc.Index]
				if target then
					local delta = target - npc.Pos
					local dist = delta.Magnitude
					local move = SPEED * dt
					if dist <= move then
						npc.Pos = target
						npc.Index += 1
					else
						npc.Look = delta / dist
						npc.Pos += npc.Look * move
					end
					walking = true
					npc.Phase += dt * 9
				end
				if npc.Index > #npc.Path then
					if npc.State == "in" then
						npc.State = "wait"
						npc.WaitUntil = now + rng:NextNumber(3, 7)
						-- face the station they walked to
						local prev = npc.Path[#npc.Path - 1]
						if prev then
							local d = npc.Pos - prev
							if d.Magnitude > 0.01 then
								npc.Look = d.Unit
							end
						end
					else
						release(sim, i)
						continue
					end
				end
			end
			for _, p in ipairs(npc.Parts) do
				table.insert(parts, p)
			end
			poseCFrames(npc, walking, cfs)
		end
	end
	if #parts > 0 then
		Workspace:BulkMoveTo(parts, cfs, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

local function manage()
	local cam = Workspace.CurrentCamera
	if not cam then
		return
	end
	local camPos = cam.CFrame.Position
	local low = ClientData.Get("Settings.LowGraphics") == true
	local perLot = low and 3 or MAX_PER_LOT
	local cap = low and 12 or MAX_TOTAL
	local now = os.clock()
	for part, sim in pairs(lots) do
		if not part.Parent then
			clearLot(sim)
			lots[part] = nil
		else
			local cpm = tonumber(part:GetAttribute("CustomersPerMinute")) or 0
			local open = part:GetAttribute("Open") == true
			local near = (part.Position - camPos).Magnitude <= RANGE
			if not open or cpm <= 0 or not near then
				if #sim.Npcs > 0 and (not open or not near) then
					clearLot(sim)
				end
			else
				local wanted = math.clamp(math.ceil(cpm * 1.2), 1, perLot)
				if now >= sim.NextSpawn and #sim.Npcs < wanted and total < cap then
					spawnNpc(sim)
					local interval = 60 / math.max(0.2, cpm)
					sim.NextSpawn = now + math.clamp(interval * rng:NextNumber(0.7, 1.3), 2.5, 25)
				end
			end
		end
	end
end

local function track(inst: Instance)
	if inst:IsA("BasePart") and not lots[inst] then
		lots[inst] = { Part = inst, Npcs = {}, NextSpawn = os.clock() + rng:NextNumber(0.5, 3) }
	end
end

local function untrack(inst: Instance)
	local sim = lots[inst :: BasePart]
	if sim then
		clearLot(sim)
		lots[inst :: BasePart] = nil
	end
end

function CustomerSim.Start()
	if started then
		return
	end
	started = true
	folder = Instance.new("Folder")
	folder.Name = "BizCustomersLocal"
	folder.Parent = Workspace
	pool = Pool.new(makeNpc, 4, 40)
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		track(inst)
	end
	CollectionService:GetInstanceAddedSignal(TAG):Connect(track)
	CollectionService:GetInstanceRemovedSignal(TAG):Connect(untrack)
	RunService.Heartbeat:Connect(step)
	task.spawn(function()
		while true do
			task.wait(0.5)
			local ok, err = pcall(manage)
			if not ok then
				warn("[CustomerSim]", err)
			end
		end
	end)
end

return CustomerSim
