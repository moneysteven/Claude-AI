-- FurnitureBuilder: turns a Config.Furniture recipe into a greybox Model (works on server AND client).
--
--   FurnitureBuilder.Build(def, opts?) -> Model
--     opts.Color     Color3?          tint for paintable parts (recipe parts with P = true)
--     opts.Material  string?          Enum.Material name for paintable parts
--     opts.Ghost     boolean?         client preview: no collision / query / touch, seats and lights disabled
--
-- The model's pivot is the bottom-centre of the item's bounding box (PrimaryPart "Root" + PivotOffset),
-- so Model:PivotTo(originCFrame * relativeCFrame) places it exactly like the server does.
-- Seat parts get attribute SeatPose ("Sit"|"Sleep"); the server tags them RPSeat. Door parts get DoorPart = true.

local FurnitureBuilder = {}

local SHAPES = {
	Ball = Enum.PartType.Ball,
	Cylinder = Enum.PartType.Cylinder,
}

local function materialFromName(name: string?): Enum.Material?
	if type(name) ~= "string" then
		return nil
	end
	local ok, mat = pcall(function()
		return (Enum.Material :: any)[name]
	end)
	if ok and typeof(mat) == "EnumItem" then
		return mat
	end
	return nil
end
FurnitureBuilder.MaterialFromName = materialFromName

local function newPart(spec): BasePart
	local p: BasePart
	if spec.Seat then
		p = Instance.new("Seat")
	elseif spec.Sh == "Wedge" then
		p = Instance.new("WedgePart")
	elseif spec.Sh == "CornerWedge" then
		p = Instance.new("CornerWedgePart")
	else
		p = Instance.new("Part")
		local shape = SHAPES[spec.Sh]
		if shape then
			(p :: Part).Shape = shape
		end
	end
	return p
end

function FurnitureBuilder.Build(def, opts: { [string]: any }?)
	local o = opts or {}
	local model = Instance.new("Model")
	model.Name = def.Id

	local size: Vector3 = def.Size
	local root = Instance.new("Part")
	root.Name = "Root"
	root.Size = Vector3.new(math.max(0.05, size.X), math.max(0.05, size.Y), math.max(0.05, size.Z))
	root.CFrame = CFrame.new(0, size.Y / 2, 0)
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.CastShadow = false
	root.Parent = model
	root.PivotOffset = CFrame.new(0, -size.Y / 2, 0)
	model.PrimaryPart = root

	local tint: Color3? = o.Color
	local tintMat = materialFromName(o.Material)

	for i, spec in ipairs(def.Parts or {}) do
		local p = newPart(spec)
		p.Name = spec.N or ("P" .. i)
		p.Size = spec.S
		local cf = CFrame.new(spec.O)
		if spec.R then
			cf *= CFrame.Angles(math.rad(spec.R.X), math.rad(spec.R.Y), math.rad(spec.R.Z))
		end
		p.CFrame = cf
		p.Anchored = true
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		p.Color = spec.C or Color3.fromRGB(200, 200, 200)
		p.Material = spec.M or Enum.Material.SmoothPlastic
		p.Transparency = spec.T or 0
		p.CanTouch = false
		p.CanCollide = not spec.NC
		if spec.P then
			p:SetAttribute("Paint", true)
			if tint then
				p.Color = tint
			end
			if tintMat then
				p.Material = tintMat
			end
		end
		if spec.M == Enum.Material.Glass then
			p:SetAttribute("Glass", true)
		end
		if spec.Door then
			p:SetAttribute("DoorPart", true)
		end
		if spec.Seat then
			local seat = p :: Seat
			seat:SetAttribute("SeatPose", spec.Seat)
			if o.Ghost then
				seat.Disabled = true
			end
		end
		if spec.L then
			local light = Instance.new("PointLight")
			light.Range = spec.L.Range or 14
			light.Brightness = spec.L.Brightness or 1
			light.Color = spec.L.Color or Color3.fromRGB(255, 220, 180)
			light.Shadows = false
			light.Enabled = not o.Ghost
			light.Parent = p
			p:SetAttribute("LightPart", true)
		end
		if o.Ghost then
			p.CanCollide = false
			p.CanQuery = false
			p.CastShadow = false
		end
		p.Parent = model
	end

	if #model:GetChildren() == 1 then
		-- no recipe: show the bounding box so the item is still visible
		root.Transparency = o.Ghost and 0.5 or 0
		root.CanCollide = not o.Ghost
		root.Color = Color3.fromRGB(190, 190, 196)
	end

	return model
end

-- Apply colour / material to the paintable parts of an existing model (server re-paint, client preview).
function FurnitureBuilder.Paint(model: Instance, color: Color3?, materialName: string?)
	local mat = materialFromName(materialName)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and d:GetAttribute("Paint") then
			if color then
				d.Color = color
			end
			if mat then
				d.Material = mat
			end
		end
	end
end

-- Turn any model (procedural or a real asset clone) into a client-side ghost.
function FurnitureBuilder.MakeGhost(model: Instance, transparency: number?)
	local t = transparency or 0.45
	local CollectionService = game:GetService("CollectionService")
	for _, d in ipairs(model:GetDescendants()) do
		-- clones keep tags (RPSeat ...); a ghost must never look like a real interactable
		for _, tag in ipairs(CollectionService:GetTags(d)) do
			CollectionService:RemoveTag(d, tag)
		end
		if d:IsA("BasePart") then
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
			d.CastShadow = false
			d.Anchored = true
			if d.Name ~= "Root" then
				d.Transparency = math.max(d.Transparency, t)
			end
			if d:IsA("Seat") then
				d.Disabled = true
			end
		elseif d:IsA("Light") then
			d.Enabled = false
		elseif d:IsA("ProximityPrompt") or d:IsA("Script") or d:IsA("LocalScript") then
			d:Destroy()
		end
	end
end

return FurnitureBuilder
