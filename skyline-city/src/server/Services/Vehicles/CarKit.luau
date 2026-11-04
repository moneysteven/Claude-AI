-- CarKit: low-level part helpers for the procedural car builder.
-- All positions are in CAR-LOCAL space: origin on the ground under the car's centre, X = right,
-- Y = up, -Z = forward (CFrame.LookVector of the car). The model is built at the origin and
-- PivotTo()'d into place afterwards. Every visual part is welded to the Chassis and Massless.
--
--   local k = CarKit.new(model, chassis)
--   k:Box(parent, name, size, cframe, color, material?, opts?) -> Part
--   k:Wedge(parent, name, size, cframe, color, material?, opts?) -> WedgePart
--   k:Cylinder(parent, name, length, diameter, cframe, color, material?, opts?) -> Part (axis = local X)
--   k:Beam(parent, name, p0, p1, width, thickness, color, material?, opts?) -> Part spanning two points
--   k:Glass(part)   k:Paint(part)   k:Weld(part, to?)   CarKit.Motor(name, part0, part1, c0, parent?)
--   opts = { Paint = bool, Glass = bool, NoWeld = bool, Transparency, Reflectance, CanCollide, Shadow }

local CarKit = {}
CarKit.__index = CarKit

function CarKit.new(model: Model, chassis: BasePart)
	return setmetatable({ Model = model, Chassis = chassis }, CarKit)
end

local function apply(part: BasePart, color: Color3, material: Enum.Material?, opts: { [string]: any }?)
	part.Anchored = false
	part.CanCollide = false
	part.CanTouch = false
	part.Massless = true
	part.Color = color
	part.Material = material or Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	if opts then
		if opts.Transparency then
			part.Transparency = opts.Transparency
		end
		if opts.Reflectance then
			part.Reflectance = opts.Reflectance
		end
		if opts.CanCollide then
			part.CanCollide = true
		end
		if opts.Shadow == false then
			part.CastShadow = false
		end
		if opts.Paint then
			part:SetAttribute("Paint", true)
		end
		if opts.Glass then
			part:SetAttribute("Glass", true)
			part.Material = Enum.Material.Glass
			part.Transparency = opts.Transparency or 0.5
			part.CastShadow = false
		end
	end
end

function CarKit:Weld(part: BasePart, to: BasePart?)
	local w = Instance.new("WeldConstraint")
	w.Part0 = to or self.Chassis
	w.Part1 = part
	w.Parent = part
	return w
end

function CarKit:_finish(part: BasePart, parent: Instance, name: string, size: Vector3, cf: CFrame, opts: { [string]: any }?)
	part.Name = name
	part.Size = Vector3.new(math.max(0.05, size.X), math.max(0.05, size.Y), math.max(0.05, size.Z))
	part.CFrame = cf
	part.Parent = parent
	if not (opts and opts.NoWeld) then
		self:Weld(part, opts and opts.WeldTo or nil)
	end
	return part
end

function CarKit:Box(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?, opts: { [string]: any }?): Part
	local p = Instance.new("Part")
	apply(p, color, material, opts)
	return self:_finish(p, parent, name, size, cf, opts) :: Part
end

function CarKit:Wedge(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?, opts: { [string]: any }?): WedgePart
	local p = Instance.new("WedgePart")
	apply(p, color, material, opts)
	return self:_finish(p, parent, name, size, cf, opts) :: WedgePart
end

-- Cylinder whose axis runs along the part's local X axis (rotate cf to aim it).
function CarKit:Cylinder(parent: Instance, name: string, length: number, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?, opts: { [string]: any }?): Part
	local p = Instance.new("Part")
	p.Shape = Enum.PartType.Cylinder
	apply(p, color, material, opts)
	return self:_finish(p, parent, name, Vector3.new(length, diameter, diameter), cf, opts) :: Part
end

function CarKit:Ball(parent: Instance, name: string, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?, opts: { [string]: any }?): Part
	local p = Instance.new("Part")
	p.Shape = Enum.PartType.Ball
	apply(p, color, material, opts)
	return self:_finish(p, parent, name, Vector3.new(diameter, diameter, diameter), cf, opts) :: Part
end

-- A flat bar from p0 to p1. `width` runs along local X (kept horizontal), `thickness` along local Y.
function CarKit:Beam(parent: Instance, name: string, p0: Vector3, p1: Vector3, width: number, thickness: number, color: Color3, material: Enum.Material?, opts: { [string]: any }?): Part
	local d = p1 - p0
	local len = d.Magnitude
	local mid = (p0 + p1) / 2
	local cf
	if len < 1e-3 then
		cf = CFrame.new(mid)
	else
		local look = d.Unit
		local upHint = math.abs(look.Y) > 0.98 and Vector3.zAxis or Vector3.yAxis
		cf = CFrame.lookAt(mid, mid + look, upHint)
	end
	return self:Box(parent, name, Vector3.new(width, thickness, math.max(0.05, len)), cf, color, material, opts)
end

-- Motor6D whose joint frame is `hingeWorld` (a CFrame in world space — at build time the car sits at the
-- origin, so this is the car-local hinge position). C0 / C1 are derived so the part stays exactly where
-- it is with Transform = identity; Transform then rotates / slides around the hinge frame's axes.
function CarKit.Motor(name: string, part0: BasePart, part1: BasePart, hingeWorld: CFrame, parent: Instance?): Motor6D
	local m = Instance.new("Motor6D")
	m.Name = name
	m.Part0 = part0
	m.Part1 = part1
	-- Part1 = Part0 * C0 * Transform * C1^-1
	m.C0 = part0.CFrame:ToObjectSpace(hingeWorld)
	m.C1 = part1.CFrame:ToObjectSpace(hingeWorld)
	m.Parent = parent or part1
	return m
end

function CarKit:Folder(name: string, parent: Instance?): Instance
	local existing = (parent or self.Model):FindFirstChild(name)
	if existing then
		return existing
	end
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent or self.Model
	return f
end

function CarKit:ModelFolder(name: string, parent: Instance?): Model
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = parent or self.Model
	return m
end

-- Add a light to a part. kind = "Spot" | "Surface" | "Point"
function CarKit.Light(part: BasePart, kind: string, color: Color3, face: Enum.NormalId?, range: number?, brightness: number?, angle: number?)
	local light: Light
	if kind == "Spot" then
		local s = Instance.new("SpotLight")
		s.Face = face or Enum.NormalId.Front
		s.Angle = angle or 70
		light = s
	elseif kind == "Surface" then
		local s = Instance.new("SurfaceLight")
		s.Face = face or Enum.NormalId.Back
		s.Angle = angle or 120
		light = s
	else
		light = Instance.new("PointLight")
	end
	light.Color = color
	light.Range = range or 12
	light.Brightness = brightness or 2
	light.Shadows = false
	light.Enabled = false
	light.Parent = part
	return light
end

return CarKit
