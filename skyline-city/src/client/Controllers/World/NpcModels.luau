-- NpcModels (client helper): cheap local models for cosmetic NPC traffic and pedestrians.
-- All parts are anchored, non-colliding, non-queryable and shadowless; they are moved every frame with
-- Workspace:BulkMoveTo from stored offsets, so no physics or welds are involved.
--
--   NpcModels.Car(color) -> car      car = { Model, Parts = {BasePart}, Offsets = {CFrame}, Heads = {BasePart}, Light = SpotLight,
--                                           Tail = BasePart, Glow = PointLight?, Length }
--   NpcModels.SetCarLights(car, on)
--   NpcModels.Pedestrian(skin, shirt, pants, hair) -> ped  ped = { Model, Parts = {...}, Limbs = {...} }
--   NpcModels.PoseCar(car, cf, parts, cframes)           append the car's parts / CFrames for BulkMoveTo
--   NpcModels.PosePed(ped, rootCF, swing, bob, parts, cframes)
-- Parody / generic shapes only — no brand marks.

local NpcModels = {}

local function part(model: Model, name: string, size: Vector3, color: Color3, material: Enum.Material?, shape: Enum.PartType?): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Size = size
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if shape then
		p.Shape = shape
	end
	p.Parent = model
	return p
end

local HEAD_OFF = Color3.fromRGB(220, 220, 210)
local HEAD_ON = Color3.fromRGB(255, 250, 220)

function NpcModels.Car(color: Color3)
	local m = Instance.new("Model")
	m.Name = "NPCCar"
	local parts, offsets = {}, {}
	local function add(p: BasePart, off: CFrame)
		table.insert(parts, p)
		table.insert(offsets, off)
	end
	-- forward = -Z, pivot at the road surface
	add(part(m, "Body", Vector3.new(7, 2.2, 15), color, Enum.Material.SmoothPlastic), CFrame.new(0, 2.1, 0))
	add(part(m, "Cabin", Vector3.new(6.2, 2, 7.6), Color3.fromRGB(30, 36, 46), Enum.Material.Glass), CFrame.new(0, 4.2, 0.9))
	add(part(m, "Roof", Vector3.new(6, 0.3, 6.4), color, Enum.Material.SmoothPlastic), CFrame.new(0, 5.35, 0.9))
	local wheelColor = Color3.fromRGB(24, 24, 26)
	for _, x in ipairs({ -3.3, 3.3 }) do
		for _, z in ipairs({ -4.8, 4.8 }) do
			add(part(m, "Wheel", Vector3.new(1.1, 2.6, 2.6), wheelColor, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder), CFrame.new(x, 1.3, z))
		end
	end
	local heads = {}
	for _, x in ipairs({ -2.4, 2.4 }) do
		local h = part(m, "Headlight", Vector3.new(1.6, 0.6, 0.2), HEAD_OFF, Enum.Material.SmoothPlastic)
		add(h, CFrame.new(x, 2.4, -7.55))
		table.insert(heads, h)
	end
	local tail = part(m, "Taillight", Vector3.new(5.6, 0.4, 0.2), Color3.fromRGB(150, 20, 20), Enum.Material.SmoothPlastic)
	add(tail, CFrame.new(0, 2.6, 7.55))
	local light = Instance.new("SpotLight")
	light.Face = Enum.NormalId.Front
	light.Range = 34
	light.Angle = 70
	light.Brightness = 3
	light.Color = Color3.fromRGB(255, 244, 220)
	light.Shadows = false
	light.Enabled = false
	light.Parent = heads[1]
	m.PrimaryPart = parts[1]
	return { Model = m, Parts = parts, Offsets = offsets, Heads = heads, Light = light, Tail = tail, Length = 15, LightsOn = false }
end

-- Optional real models replicated by WorldService (ReplicatedStorage.WorldNPCAssets, names "TrafficCar*" /
-- "Pedestrian*"). They move rigidly (no limb animation). Returns nil when none exist.
function NpcModels.FromAsset(prefix: string)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local folder = ReplicatedStorage:FindFirstChild("WorldNPCAssets")
	if not folder then
		return nil
	end
	local options = {}
	for _, m in ipairs(folder:GetChildren()) do
		if m:IsA("Model") and m.Name:sub(1, #prefix) == prefix then
			table.insert(options, m)
		end
	end
	if #options == 0 then
		return nil
	end
	local model = options[math.random(1, #options)]:Clone()
	local pivot = model:GetPivot()
	local parts, offsets = {}, {}
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			d.Anchored = true
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
			d.CastShadow = false
			table.insert(parts, d)
			table.insert(offsets, pivot:ToObjectSpace(d.CFrame))
		end
	end
	if #parts == 0 then
		model:Destroy()
		return nil
	end
	return { Model = model, Parts = parts, Offsets = offsets, Heads = {}, Light = nil, Tail = nil, Length = 15, LightsOn = false, Rigid = true }
end

function NpcModels.SetCarLights(car, on: boolean)
	if car.LightsOn == on then
		return
	end
	car.LightsOn = on
	if not car.Light then
		return
	end
	car.Light.Enabled = on
	for _, h in ipairs(car.Heads) do
		h.Material = on and Enum.Material.Neon or Enum.Material.SmoothPlastic
		h.Color = on and HEAD_ON or HEAD_OFF
	end
	car.Tail.Material = on and Enum.Material.Neon or Enum.Material.SmoothPlastic
end

function NpcModels.PoseCar(car, cf: CFrame, parts: { BasePart }, cframes: { CFrame })
	local offs = car.Offsets
	for i, p in ipairs(car.Parts) do
		table.insert(parts, p)
		table.insert(cframes, cf * offs[i])
	end
end

function NpcModels.Pedestrian(skin: Color3, shirt: Color3, pants: Color3, hair: Color3)
	local m = Instance.new("Model")
	m.Name = "NPCPedestrian"
	local torso = part(m, "Torso", Vector3.new(2, 2, 1), shirt)
	local head = part(m, "Head", Vector3.new(1.2, 1.2, 1.2), skin)
	local hairPart = part(m, "Hair", Vector3.new(1.3, 0.35, 1.3), hair)
	local lArm = part(m, "LeftArm", Vector3.new(1, 2, 1), skin)
	local rArm = part(m, "RightArm", Vector3.new(1, 2, 1), skin)
	local lLeg = part(m, "LeftLeg", Vector3.new(1, 2, 1), pants)
	local rLeg = part(m, "RightLeg", Vector3.new(1, 2, 1), pants)
	m.PrimaryPart = torso
	return {
		Model = m,
		Torso = torso,
		Head = head,
		Hair = hairPart,
		LeftArm = lArm,
		RightArm = rArm,
		LeftLeg = lLeg,
		RightLeg = rLeg,
	}
end

local SHOULDER_L = CFrame.new(-1.5, 4, 0)
local SHOULDER_R = CFrame.new(1.5, 4, 0)
local HIP_L = CFrame.new(-0.5, 2, 0)
local HIP_R = CFrame.new(0.5, 2, 0)
local LIMB_DOWN = CFrame.new(0, -1, 0)

function NpcModels.PosePed(ped, root: CFrame, swing: number, bob: number, parts: { BasePart }, cframes: { CFrame })
	if ped.Rigid then
		NpcModels.PoseCar(ped, root * CFrame.new(0, bob, 0), parts, cframes)
		return
	end
	local up = CFrame.new(0, bob, 0)
	local base = root * up
	table.insert(parts, ped.Torso)
	table.insert(cframes, base * CFrame.new(0, 3, 0))
	table.insert(parts, ped.Head)
	table.insert(cframes, base * CFrame.new(0, 4.6, 0))
	table.insert(parts, ped.Hair)
	table.insert(cframes, base * CFrame.new(0, 5.35, 0.05))
	table.insert(parts, ped.LeftArm)
	table.insert(cframes, base * SHOULDER_L * CFrame.Angles(-swing, 0, 0) * LIMB_DOWN)
	table.insert(parts, ped.RightArm)
	table.insert(cframes, base * SHOULDER_R * CFrame.Angles(swing, 0, 0) * LIMB_DOWN)
	table.insert(parts, ped.LeftLeg)
	table.insert(cframes, root * HIP_L * CFrame.Angles(swing, 0, 0) * LIMB_DOWN)
	table.insert(parts, ped.RightLeg)
	table.insert(cframes, root * HIP_R * CFrame.Angles(-swing, 0, 0) * LIMB_DOWN)
end

return NpcModels
