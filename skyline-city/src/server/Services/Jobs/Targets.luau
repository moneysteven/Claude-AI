-- Targets: finds JobTarget parts (by JobId + Kind) and generates greybox fallbacks
-- around a job station when the map has none. Also tracks exclusive claims so two
-- workers never get the same register / stove / patient at once.
--
--   Targets.Init()
--   Targets.List(jobId, kind, center?) -> { BasePart }   (generates fallbacks at `center` if empty)
--   Targets.Pick(jobId, kind, opts) -> BasePart?
--       opts = { Center = Vector3, From = Vector3?, MinDist = n?, MaxDist = n?, Exclusive = bool?, Owner = Player?, Exclude = {BasePart}? }
--   Targets.Claim(part, owner) / Targets.Release(part) / Targets.IsClaimed(part)
--   Targets.GroundAt(pos) -> Vector3
--   Targets.SurfaceCFrame(part) -> CFrame  (standing spot on top of / in front of the part)

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local JobsConfig = require(Shared.Config.Jobs)

local Targets = {}

local TAG = World.Tags.JobTarget
local buckets: { [string]: { BasePart } } = {}
local claims: { [BasePart]: any } = {}
local generatedFor: { [string]: boolean } = {}
local fallbackFolder: Folder? = nil
local rng = Random.new()

local function key(jobId: string, kind: string): string
	return jobId .. "|" .. kind
end

local function asPart(inst: Instance): BasePart?
	if inst:IsA("BasePart") then
		return inst
	end
	if inst:IsA("Model") then
		return inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	return nil
end

local function addTagged(inst: Instance)
	local jobId = inst:GetAttribute("JobId")
	local kind = inst:GetAttribute("Kind")
	if type(jobId) ~= "string" or type(kind) ~= "string" then
		return
	end
	local part = asPart(inst)
	if not part then
		return
	end
	local k = key(jobId, kind)
	local list = buckets[k]
	if not list then
		list = {}
		buckets[k] = list
	end
	if not table.find(list, part) then
		table.insert(list, part)
	end
end

local function removeTagged(inst: Instance)
	local part = asPart(inst) or inst
	for _, list in pairs(buckets) do
		local i = table.find(list, part :: any)
		if i then
			table.remove(list, i)
		end
	end
	claims[part :: any] = nil
end

function Targets.Init()
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		addTagged(inst)
	end
	CollectionService:GetInstanceAddedSignal(TAG):Connect(addTagged)
	CollectionService:GetInstanceRemovedSignal(TAG):Connect(removeTagged)
end

local function getFolder(): Folder
	if fallbackFolder and fallbackFolder.Parent then
		return fallbackFolder
	end
	local f = Workspace:FindFirstChild("JobFallbackTargets")
	if not f then
		f = Instance.new("Folder")
		f.Name = "JobFallbackTargets"
		f.Parent = Workspace
	end
	fallbackFolder = f :: Folder
	return f :: Folder
end

local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude
rayParams.IgnoreWater = true

function Targets.GroundAt(pos: Vector3): Vector3
	local ignore = { getFolder() }
	local jobFolder = Workspace:FindFirstChild("JobProps")
	if jobFolder then
		table.insert(ignore, jobFolder)
	end
	rayParams.FilterDescendantsInstances = ignore
	local result = Workspace:Raycast(pos + Vector3.new(0, 150, 0), Vector3.new(0, -400, 0), rayParams)
	if result then
		return result.Position
	end
	return Vector3.new(pos.X, 0, pos.Z)
end

-- A standing spot for NPCs / props: on the ground just in front of the part.
function Targets.SurfaceCFrame(part: BasePart): CFrame
	local look = part.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 0.1 then
		flat = Vector3.new(0, 0, -1)
	end
	flat = flat.Unit
	local front = part.Position + flat * (math.max(part.Size.X, part.Size.Z) * 0.5 + 3)
	local ground = Targets.GroundAt(front)
	-- face the part
	return CFrame.lookAt(ground, Vector3.new(part.Position.X, ground.Y, part.Position.Z))
end

---------------------------------------------------------------------------
-- Procedural fallback targets
---------------------------------------------------------------------------
local KIND_STYLE = {
	Delivery = { Color = Color3.fromRGB(230, 120, 60), Icon = "🏠", Label = "Delivery" },
	Pickup = { Color = Color3.fromRGB(255, 205, 40), Icon = "🙋", Label = "Taxi Pickup" },
	Dropoff = { Color = Color3.fromRGB(255, 205, 40), Icon = "🏁", Label = "Dropoff" },
	PatrolPoint = { Color = Color3.fromRGB(60, 110, 230), Icon = "🚨", Label = "Patrol Point" },
	FireSpot = { Color = Color3.fromRGB(120, 110, 100), Icon = "🔥", Label = "Fire Hazard" },
	PatientSpot = { Color = Color3.fromRGB(240, 240, 240), Icon = "🩺", Label = "Emergency" },
	RepairSpot = { Color = Color3.fromRGB(90, 90, 100), Icon = "🔧", Label = "Repair Spot" },
	Register = { Color = Color3.fromRGB(70, 160, 90), Icon = "🛒", Label = "Register" },
	Stove = { Color = Color3.fromRGB(60, 60, 65), Icon = "🍳", Label = "Stove" },
	Showroom = { Color = Color3.fromRGB(220, 220, 230), Icon = "🚗", Label = "Showroom" },
	Showing = { Color = Color3.fromRGB(150, 100, 200), Icon = "🏡", Label = "Open House" },
	ConstructionSite = { Color = Color3.fromRGB(160, 140, 110), Icon = "🏗️", Label = "Construction Site" },
	-- job-specific overrides ("<JobId>_<Kind>")
	Paramedic_Dropoff = { Color = Color3.fromRGB(230, 70, 70), Icon = "🏥", Label = "Hospital" },
}

local function newPart(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	for k, v in pairs(props) do
		(p :: any)[k] = v
	end
	return p
end

local function addSign(parent: BasePart, text: string, color: Color3)
	local gui = Instance.new("BillboardGui")
	gui.Name = "Sign"
	gui.Size = UDim2.fromOffset(160, 44)
	gui.StudsOffsetWorldSpace = Vector3.new(0, 4, 0)
	gui.MaxDistance = 90
	gui.LightInfluence = 0
	gui.Parent = parent
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = Color3.fromRGB(20, 22, 30)
	label.BackgroundTransparency = 0.25
	label.TextColor3 = color
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.Text = text
	label.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = label
end

-- Build one greybox target. Returns the tagged root part.
local function buildFallback(jobId: string, kind: string, ground: Vector3, facing: Vector3, index: number): BasePart
	local style = KIND_STYLE[jobId .. "_" .. kind] or KIND_STYLE[kind] or { Color = Color3.fromRGB(200, 200, 200), Icon = "📍", Label = kind }
	local model = Instance.new("Model")
	model.Name = ("%s_%s_%d"):format(jobId, kind, index)
	local cf = CFrame.lookAt(ground, Vector3.new(facing.X, ground.Y, facing.Z))

	local root: Part
	if kind == "Register" then
		root = newPart({ Name = "Counter", Size = Vector3.new(6, 3.4, 2.6), Color = Color3.fromRGB(235, 235, 235), CFrame = cf * CFrame.new(0, 1.7, 0) })
		newPart({ Name = "Till", Size = Vector3.new(1.6, 1.2, 1.4), Color = Color3.fromRGB(40, 40, 45), CFrame = root.CFrame * CFrame.new(1.4, 2.3, 0), Parent = model })
		newPart({ Name = "Belt", Size = Vector3.new(3.4, 0.2, 2), Color = Color3.fromRGB(25, 25, 25), CFrame = root.CFrame * CFrame.new(-1.2, 1.8, 0), Parent = model })
	elseif kind == "Stove" then
		root = newPart({ Name = "Stove", Size = Vector3.new(4, 3.4, 3), Color = Color3.fromRGB(190, 190, 195), Material = Enum.Material.Metal, CFrame = cf * CFrame.new(0, 1.7, 0) })
		for i = 0, 3 do
			local x = (i % 2 == 0) and -0.9 or 0.9
			local z = (i < 2) and -0.7 or 0.7
			newPart({
				Name = "Burner",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(0.1, 1.1, 1.1),
				Color = Color3.fromRGB(30, 30, 30),
				CFrame = root.CFrame * CFrame.new(x, 1.75, z) * CFrame.Angles(0, 0, math.rad(90)),
				Parent = model,
			})
		end
	elseif kind == "Showing" or kind == "Delivery" then
		-- tiny house facade with a door
		root = newPart({ Name = "Doorstep", Size = Vector3.new(6, 0.6, 4), Color = Color3.fromRGB(150, 150, 150), CFrame = cf * CFrame.new(0, 0.3, 0) })
		local wall = newPart({ Name = "Wall", Size = Vector3.new(14, 10, 1), Color = Color3.fromRGB(225, 215, 195), CFrame = cf * CFrame.new(0, 5, 2.5), Parent = model })
		newPart({ Name = "Door", Size = Vector3.new(3.6, 7, 0.4), Color = style.Color, CFrame = wall.CFrame * CFrame.new(0, -1.5, -0.6), Parent = model })
		newPart({ Name = "Roof", Size = Vector3.new(16, 1, 6), Color = Color3.fromRGB(120, 60, 50), CFrame = wall.CFrame * CFrame.new(0, 5.5, 1.5) * CFrame.Angles(math.rad(-12), 0, 0), Parent = model })
		if kind == "Showing" then
			local post = newPart({ Name = "SignPost", Size = Vector3.new(0.3, 4, 0.3), Color = Color3.fromRGB(240, 240, 240), CFrame = cf * CFrame.new(5, 2, -3), Parent = model })
			newPart({ Name = "ForSale", Size = Vector3.new(2.6, 1.6, 0.2), Color = Color3.fromRGB(200, 40, 50), CFrame = post.CFrame * CFrame.new(0, 1.2, 0), Parent = model })
		end
	elseif kind == "ConstructionSite" then
		root = newPart({ Name = "Slab", Size = Vector3.new(24, 1, 24), Color = Color3.fromRGB(170, 170, 165), Material = Enum.Material.Concrete, CFrame = cf * CFrame.new(0, 0.5, 0) })
		for _, c in ipairs({ { -11, -11 }, { 11, -11 }, { -11, 11 }, { 11, 11 } }) do
			newPart({ Name = "Cone", Size = Vector3.new(1, 2, 1), Color = Color3.fromRGB(255, 120, 20), CFrame = cf * CFrame.new(c[1] * 1.15, 1, c[2] * 1.15), Parent = model })
		end
	else
		root = newPart({
			Name = "Pad",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.4, 10, 10),
			Color = style.Color,
			Transparency = 0.15,
			CFrame = cf * CFrame.new(0, 0.2, 0) * CFrame.Angles(0, 0, math.rad(90)),
		})
		if kind == "RepairSpot" or kind == "Showroom" then
			root.Size = Vector3.new(0.4, 16, 16)
		end
	end
	root.CanCollide = kind == "Register" or kind == "Stove"
	root.Parent = model
	model.PrimaryPart = root
	addSign(root, style.Icon .. " " .. style.Label, Color3.new(1, 1, 1))

	root:SetAttribute("JobId", jobId)
	root:SetAttribute("Kind", kind)
	root:SetAttribute("Generated", true)
	model.Parent = getFolder()
	CollectionService:AddTag(root, TAG) -- fires our added signal -> bucketed
	addTagged(root)
	return root
end

local function generate(jobId: string, kind: string, center: Vector3, radiusKey: string?)
	local k = key(jobId, kind)
	if generatedFor[k] then
		return
	end
	generatedFor[k] = true
	local range = JobsConfig.FallbackRadius[radiusKey or kind] or { 60, 300 }
	local count = JobsConfig.General.FallbackTargetCount
	if kind == "Register" or kind == "Stove" then
		count = 4
	elseif kind == "ConstructionSite" or kind == "RepairSpot" or kind == "Showroom" then
		count = 2
	elseif radiusKey == "HospitalDropoff" then
		count = 1
	end
	local baseAngle = rng:NextNumber(0, math.pi * 2)
	for i = 1, count do
		local pos: Vector3
		if kind == "Register" or kind == "Stove" then
			-- a neat row next to the station
			pos = center + Vector3.new((i - (count + 1) / 2) * 7, 0, range[1] + 2)
		else
			local angle = baseAngle + (i / count) * math.pi * 2 + rng:NextNumber(-0.3, 0.3)
			local dist = rng:NextNumber(range[1], range[2])
			pos = center + Vector3.new(math.cos(angle) * dist, 0, math.sin(angle) * dist)
		end
		local ground = Targets.GroundAt(pos)
		buildFallback(jobId, kind, ground, center, i)
	end
end

local function valid(part: BasePart, jobId: string, kind: string): boolean
	return part.Parent ~= nil and part:IsDescendantOf(Workspace) and part:GetAttribute("JobId") == jobId and part:GetAttribute("Kind") == kind
end

function Targets.List(jobId: string, kind: string, center: Vector3?, radiusKey: string?): { BasePart }
	local list = buckets[key(jobId, kind)]
	local out = {}
	if list then
		for _, p in ipairs(list) do
			if valid(p, jobId, kind) then
				table.insert(out, p)
			end
		end
	end
	if #out == 0 and center then
		generate(jobId, kind, center, radiusKey)
		list = buckets[key(jobId, kind)]
		if list then
			for _, p in ipairs(list) do
				if valid(p, jobId, kind) then
					table.insert(out, p)
				end
			end
		end
	end
	return out
end

function Targets.IsClaimed(part: BasePart): boolean
	return claims[part] ~= nil
end

function Targets.Claim(part: BasePart, owner: any)
	claims[part] = owner
end

function Targets.Release(part: BasePart?)
	if part then
		claims[part] = nil
	end
end

function Targets.ReleaseAllFor(owner: any)
	for part, o in pairs(claims) do
		if o == owner then
			claims[part] = nil
		end
	end
end

function Targets.Pick(jobId: string, kind: string, opts: { [string]: any }): BasePart?
	local list = Targets.List(jobId, kind, opts.Center, opts.RadiusKey)
	if #list == 0 then
		return nil
	end
	local from: Vector3? = opts.From
	local minD = opts.MinDist or 0
	local maxD = opts.MaxDist or math.huge
	local exclude = opts.Exclude or {}
	local good, fallback = {}, {}
	for _, p in ipairs(list) do
		if not table.find(exclude, p) and not (opts.Exclusive and claims[p] ~= nil and claims[p] ~= opts.Owner) then
			table.insert(fallback, p)
			if from then
				local d = (p.Position - from).Magnitude
				if d >= minD and d <= maxD then
					table.insert(good, p)
				end
			else
				table.insert(good, p)
			end
		end
	end
	local pool = (#good > 0) and good or fallback
	if #pool == 0 then
		return nil
	end
	local chosen = pool[rng:NextInteger(1, #pool)]
	if opts.Exclusive then
		claims[chosen] = opts.Owner or true
	end
	return chosen
end

return Targets
