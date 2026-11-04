-- Props (World helper): fast anchored part factory, tagging, invisible volumes, signs,
-- cached prop templates (trees, palms, benches, streetlights, ATMs ...) and real-asset overrides.
--
--   Props.Part(parent, name, size, cframe, color, material?, extra?) -> Part
--   Props.Small(...)                         same as Part but CastShadow = false (small props)
--   Props.Cyl(parent, name, radius, height, cframe, color, material?, extra?)  upright cylinder centred at cframe
--   Props.Ball(parent, name, diameter, cframe, color, material?, extra?)
--   Props.Wedge(parent, name, size, cframe, color, material?, extra?)
--   Props.Volume(parent, name, cframe, size, tag?, attrs?) -> invisible, no collide / query / touch
--   Props.Tag(inst, tag, attrs?)
--   Props.Sign(part, text, opts?)            SurfaceGui text on a face (default Front)
--   Props.Billboard(part, text, opts?)       floating label
--   Props.Facing(pos, dir) -> CFrame (LookVector = dir)
--   Props.StreetFacing(pos, streetDir) -> CFrame whose local +Z points at the street (plots / lots convention)
--   Props.Template(key, factory) -> Model clone (factory runs once)
--   Props.Asset(category, id) -> Instance? clone from ServerStorage.Assets.<category>.<id>
--   Props.SetYielding(on) / Props.Count()    decor builds yield every few hundred parts

local ServerStorage = game:GetService("ServerStorage")
local CollectionService = game:GetService("CollectionService")

local Props = {}

local created = 0
local yielding = false
local YIELD_EVERY = 350

function Props.SetYielding(on: boolean)
	yielding = on
end

function Props.Count(): number
	return created
end

local function counted()
	created += 1
	if yielding and created % YIELD_EVERY == 0 then
		task.wait()
	end
end

local function apply(p: BasePart, extra: { [string]: any }?)
	if extra then
		for k, v in pairs(extra) do
			(p :: any)[k] = v
		end
	end
end

function Props.Part(parent: Instance?, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?, extra: { [string]: any }?): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	apply(p, extra)
	p.Parent = parent
	counted()
	return p
end

function Props.Small(parent: Instance?, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?, extra: { [string]: any }?): Part
	local p = Props.Part(parent, name, size, cf, color, material, extra)
	p.CastShadow = false
	return p
end

function Props.Cyl(parent: Instance?, name: string, radius: number, height: number, cf: CFrame, color: Color3, material: Enum.Material?, extra: { [string]: any }?): Part
	local p = Props.Part(nil, name, Vector3.new(height, radius * 2, radius * 2), cf * CFrame.Angles(0, 0, math.pi / 2), color, material, extra)
	p.Shape = Enum.PartType.Cylinder
	p.Parent = parent
	return p
end

function Props.Ball(parent: Instance?, name: string, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?, extra: { [string]: any }?): Part
	local p = Props.Part(nil, name, Vector3.new(diameter, diameter, diameter), cf, color, material, extra)
	p.Shape = Enum.PartType.Ball
	p.Parent = parent
	return p
end

function Props.Wedge(parent: Instance?, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?, extra: { [string]: any }?): WedgePart
	local p = Instance.new("WedgePart")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	apply(p, extra)
	p.Parent = parent
	counted()
	return p
end

function Props.Tag(inst: Instance, tag: string?, attrs: { [string]: any }?)
	if attrs then
		for k, v in pairs(attrs) do
			inst:SetAttribute(k, v)
		end
	end
	if tag then
		CollectionService:AddTag(inst, tag)
	end
	return inst
end

-- Invisible gameplay volume (zones). Never collides, never blocks raycasts, never fires Touched.
function Props.Volume(parent: Instance?, name: string, cf: CFrame, size: Vector3, tag: string?, attrs: { [string]: any }?): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Transparency = 1
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Locked = true
	if attrs then
		for k, v in pairs(attrs) do
			p:SetAttribute(k, v)
		end
	end
	p.Parent = parent
	if tag then
		CollectionService:AddTag(p, tag)
	end
	counted()
	return p
end

local FACE_SIZE = {
	[Enum.NormalId.Front] = function(s: Vector3)
		return s.X, s.Y
	end,
	[Enum.NormalId.Back] = function(s: Vector3)
		return s.X, s.Y
	end,
	[Enum.NormalId.Left] = function(s: Vector3)
		return s.Z, s.Y
	end,
	[Enum.NormalId.Right] = function(s: Vector3)
		return s.Z, s.Y
	end,
	[Enum.NormalId.Top] = function(s: Vector3)
		return s.X, s.Z
	end,
	[Enum.NormalId.Bottom] = function(s: Vector3)
		return s.X, s.Z
	end,
}

-- Text sign on one face of a part (server-built SurfaceGui replicates and streams with the part).
function Props.Sign(part: BasePart, text: string, opts: { [string]: any }?)
	local o = opts or {}
	local face = o.Face or Enum.NormalId.Front
	local w, h = FACE_SIZE[face](part.Size)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "Sign"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = o.PixelsPerStud or 24
	gui.LightInfluence = o.LightInfluence or 0
	gui.Brightness = o.Brightness or 1.5
	gui.MaxDistance = o.MaxDistance or 600
	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.BackgroundTransparency = o.Background and 0 or 1
	label.BackgroundColor3 = o.Background or Color3.new(0, 0, 0)
	label.Size = UDim2.fromScale(1, 1)
	label.Text = text
	label.TextScaled = true
	label.Font = o.Font or Enum.Font.GothamBlack
	label.TextColor3 = o.TextColor or Color3.new(1, 1, 1)
	label.TextStrokeTransparency = o.Stroke == false and 1 or 0.6
	label.Parent = gui
	local pad = Instance.new("UIPadding")
	local px = UDim.new(0, math.floor(math.min(w, h) * (gui.PixelsPerStud) * 0.08))
	pad.PaddingLeft = px
	pad.PaddingRight = px
	pad.PaddingTop = px
	pad.PaddingBottom = px
	pad.Parent = label
	gui.Parent = part
	return gui
end

function Props.Billboard(part: BasePart, text: string, opts: { [string]: any }?)
	local o = opts or {}
	local gui = Instance.new("BillboardGui")
	gui.Name = "Label"
	gui.Size = o.Size or UDim2.fromOffset(200, 46)
	gui.StudsOffsetWorldSpace = o.Offset or Vector3.new(0, 5, 0)
	gui.MaxDistance = o.MaxDistance or 120
	gui.LightInfluence = 0
	gui.AlwaysOnTop = o.AlwaysOnTop == true
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = Color3.fromRGB(18, 20, 28)
	label.BackgroundTransparency = 0.25
	label.TextColor3 = o.TextColor or Color3.new(1, 1, 1)
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.Text = text
	label.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 10)
	corner.Parent = label
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 8)
	pad.PaddingRight = UDim.new(0, 8)
	pad.PaddingTop = UDim.new(0, 4)
	pad.PaddingBottom = UDim.new(0, 4)
	pad.Parent = label
	gui.Parent = part
	return gui
end

function Props.Facing(pos: Vector3, dir: Vector3): CFrame
	local flat = Vector3.new(dir.X, 0, dir.Z)
	if flat.Magnitude < 1e-3 then
		flat = Vector3.new(0, 0, -1)
	end
	return CFrame.lookAt(pos, pos + flat.Unit)
end

-- local +Z = streetDir (house plots, business lots and apartment units use this convention)
function Props.StreetFacing(pos: Vector3, streetDir: Vector3): CFrame
	return Props.Facing(pos, -streetDir)
end

---------------------------------------------------------------------------
-- Templates (built once, cloned many times)
---------------------------------------------------------------------------
local templates: { [string]: Model } = {}

-- A real model named "Prop_<key>" in ServerStorage.Assets.Buildings replaces the procedural template
-- (keys: Tree1..3, Palm, Bench, Streetlight, StreetlightDouble, ATM). Keep its pivot at the bottom centre.
function Props.Template(key: string, factory: () -> Model): Model
	local t = templates[key]
	if not t then
		local asset = Props.Asset("Buildings", "Prop_" .. key)
		if asset and asset:IsA("Model") then
			for _, d in ipairs(asset:GetDescendants()) do
				if d:IsA("BasePart") then
					d.Anchored = true
				elseif d:IsA("Script") or d:IsA("LocalScript") then
					d:Destroy()
				end
			end
			t = asset
		else
			local wasYielding = yielding
			yielding = false
			t = factory()
			yielding = wasYielding
		end
		templates[key] = t :: Model
	end
	local clone = t:Clone()
	created += #clone:GetChildren()
	counted()
	return clone
end

function Props.Place(model: Model, cf: CFrame, parent: Instance?): Model
	model:PivotTo(cf)
	model.Parent = parent
	return model
end

---------------------------------------------------------------------------
-- Real asset overrides (ServerStorage.Assets.<Category>.<Id>)
---------------------------------------------------------------------------
function Props.Asset(category: string, id: string): Instance?
	local assets = ServerStorage:FindFirstChild("Assets")
	local folder = assets and assets:FindFirstChild(category)
	local src = folder and folder:FindFirstChild(id)
	if src then
		return src:Clone()
	end
	return nil
end

-- Clone ServerStorage.Assets.Buildings.<id> at `cf` if it exists. Returns the model or nil.
function Props.TryBuilding(id: string, cf: CFrame, parent: Instance?): Instance?
	local inst = Props.Asset("Buildings", id)
	if not inst then
		return nil
	end
	if inst:IsA("Model") then
		inst:PivotTo(cf)
	elseif inst:IsA("BasePart") then
		inst.CFrame = cf
	end
	inst.Parent = parent
	return inst
end

return Props
