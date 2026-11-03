-- Npc: pooled, anchored, blocky NPCs built from Parts (no Humanoid, no physics cost).
-- If ServerStorage.Assets.NPCs.Civilian exists it is cloned instead of the greybox.
--
--   local npc = Npc.Get(cframe, { Pose = "Stand" | "Lie" | "Sit", Label = "Passenger", Icon = "🙋", Color = Color3? })
--   Npc.SetLabel(npc, text)
--   Npc.Move(npc, cframe, pose?)
--   Npc.Release(npc)
-- `cframe` is the point on the ground between the NPC's feet, facing its look direction.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")

local Pool = require(ReplicatedStorage:WaitForChild("Shared").Util.Pool)

local Npc = {}

local SHIRTS = {
	Color3.fromRGB(52, 120, 200),
	Color3.fromRGB(200, 60, 60),
	Color3.fromRGB(60, 160, 90),
	Color3.fromRGB(230, 180, 50),
	Color3.fromRGB(140, 80, 180),
	Color3.fromRGB(240, 240, 240),
	Color3.fromRGB(40, 40, 50),
	Color3.fromRGB(230, 120, 160),
}
local PANTS = {
	Color3.fromRGB(40, 50, 80),
	Color3.fromRGB(30, 30, 30),
	Color3.fromRGB(110, 90, 70),
	Color3.fromRGB(80, 80, 90),
}
local SKIN = {
	Color3.fromRGB(255, 220, 185),
	Color3.fromRGB(234, 192, 150),
	Color3.fromRGB(198, 140, 100),
	Color3.fromRGB(141, 85, 56),
	Color3.fromRGB(96, 60, 40),
}

local rng = Random.new()
local folder: Folder? = nil

local function getFolder(): Folder
	if folder and folder.Parent then
		return folder
	end
	local f = Workspace:FindFirstChild("JobProps")
	if not f then
		f = Instance.new("Folder")
		f.Name = "JobProps"
		f.Parent = Workspace
	end
	folder = f :: Folder
	return f :: Folder
end
Npc.GetFolder = getFolder

local function part(name: string, size: Vector3, parent: Instance): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.CastShadow = true
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

-- Local offsets from the feet point (standing pose).
local LAYOUT = {
	Root = CFrame.new(0, 3, 0),
	Torso = CFrame.new(0, 3, 0),
	Head = CFrame.new(0, 4.6, 0),
	LeftArm = CFrame.new(-1.5, 3, 0),
	RightArm = CFrame.new(1.5, 3, 0),
	LeftLeg = CFrame.new(-0.5, 1, 0),
	RightLeg = CFrame.new(0.5, 1, 0),
}

local function build(): Model
	local template = ServerStorage:FindFirstChild("Assets")
	template = template and template:FindFirstChild("NPCs")
	template = template and template:FindFirstChild("Civilian")
	if template and template:IsA("Model") then
		local m = template:Clone()
		for _, d in ipairs(m:GetDescendants()) do
			if d:IsA("BasePart") then
				d.Anchored = true
				d.CanCollide = false
			end
		end
		if not m.PrimaryPart then
			m.PrimaryPart = m:FindFirstChild("HumanoidRootPart") or m:FindFirstChildWhichIsA("BasePart", true)
		end
		m:SetAttribute("Custom", true)
		return m
	end

	local m = Instance.new("Model")
	m.Name = "JobNPC"
	local root = part("Root", Vector3.new(2, 2, 1), m)
	root.Transparency = 1
	root.CastShadow = false
	part("Torso", Vector3.new(2, 2, 1), m)
	local head = part("Head", Vector3.new(1.2, 1.2, 1.2), m)
	local face = Instance.new("Decal")
	face.Name = "Face"
	face.Face = Enum.NormalId.Front
	face.Texture = "rbxasset://textures/face.png"
	face.Parent = head
	part("LeftArm", Vector3.new(1, 2, 1), m)
	part("RightArm", Vector3.new(1, 2, 1), m)
	part("LeftLeg", Vector3.new(1, 2, 1), m)
	part("RightLeg", Vector3.new(1, 2, 1), m)
	m.PrimaryPart = root

	local gui = Instance.new("BillboardGui")
	gui.Name = "Tag"
	gui.Size = UDim2.fromOffset(150, 36)
	gui.StudsOffsetWorldSpace = Vector3.new(0, 2.8, 0)
	gui.MaxDistance = 70
	gui.LightInfluence = 0
	gui.Adornee = head
	gui.Parent = head
	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0.4
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.Text = ""
	label.Parent = gui
	return m
end

local pool = Pool.new(build, 4, 60)

local function poseOffset(pose: string?): CFrame
	if pose == "Lie" then
		-- body extends along -Z, lying on its back
		return CFrame.new(0, 0.5, 0) * CFrame.Angles(math.rad(-90), 0, 0)
	elseif pose == "Sit" then
		return CFrame.new(0, -1, 0)
	end
	return CFrame.new()
end

local function place(m: Model, cf: CFrame, pose: string?)
	if m:GetAttribute("Custom") then
		m:PivotTo(cf * poseOffset(pose) * CFrame.new(0, 3, 0))
		return
	end
	local base = cf * poseOffset(pose)
	for name, offset in pairs(LAYOUT) do
		local p = m:FindFirstChild(name)
		if p and p:IsA("BasePart") then
			local o = offset
			if pose == "Sit" and (name == "LeftLeg" or name == "RightLeg") then
				o = CFrame.new(offset.X, 2, -1) * CFrame.Angles(math.rad(90), 0, 0)
			end
			p.CFrame = base * o
		end
	end
end

function Npc.Get(cf: CFrame, opts: { [string]: any }?): Model
	local o = opts or {}
	local m = pool:Get() :: Model
	if not m:GetAttribute("Custom") then
		local shirt = o.Color or SHIRTS[rng:NextInteger(1, #SHIRTS)]
		local pants = PANTS[rng:NextInteger(1, #PANTS)]
		local skin = SKIN[rng:NextInteger(1, #SKIN)]
		local function color(name: string, c: Color3)
			local p = m:FindFirstChild(name)
			if p and p:IsA("BasePart") then
				p.Color = c
			end
		end
		color("Torso", shirt)
		color("LeftArm", skin)
		color("RightArm", skin)
		color("Head", skin)
		color("LeftLeg", pants)
		color("RightLeg", pants)
	end
	place(m, cf, o.Pose)
	Npc.SetLabel(m, o.Label and ((o.Icon and (o.Icon .. " ") or "") .. o.Label) or "")
	m.Parent = getFolder()
	return m
end

function Npc.SetLabel(m: Model, text: string)
	local head = m:FindFirstChild("Head")
	local gui = head and head:FindFirstChild("Tag")
	local label = gui and gui:FindFirstChild("Text")
	if label and label:IsA("TextLabel") then
		label.Text = text
		(gui :: BillboardGui).Enabled = text ~= ""
	end
end

function Npc.Move(m: Model, cf: CFrame, pose: string?)
	place(m, cf, pose)
end

function Npc.Release(m: Model?)
	if m then
		Npc.SetLabel(m, "")
		pool:Release(m)
	end
end

return Npc
