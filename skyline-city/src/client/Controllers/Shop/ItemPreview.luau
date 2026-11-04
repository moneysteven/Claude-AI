-- ItemPreview: renders a small 3D greybox preview of a Config/Clothing item inside a ViewportFrame.
--
--   ItemPreview.Create(item, props?) -> ViewportFrame
--
-- The preview is a simple mannequin piece (torso / head / legs / wrist / feet) wearing the item in its
-- configured colours. Purely visual and static (no per-frame cost).

local ItemPreview = {}

local SKIN = Color3.fromRGB(234, 190, 150)
local MANNEQUIN = Color3.fromRGB(70, 74, 92)

local function c3(rgb, fallback: Color3): Color3
	if type(rgb) == "table" and #rgb >= 3 then
		return Color3.fromRGB(rgb[1], rgb[2], rgb[3])
	end
	return fallback
end

local function mat(name: string?, fallback: Enum.Material): Enum.Material
	if type(name) == "string" then
		local ok, m = pcall(function()
			return (Enum.Material :: any)[name]
		end)
		if ok and m then
			return m
		end
	end
	return fallback
end

local LEATHER = mat("Leather", Enum.Material.Fabric)

local function piece(model: Model, cf: CFrame, size: Vector3, color: Color3, material: Enum.Material?, shape: Enum.PartType?)
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CastShadow = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = material or Enum.Material.SmoothPlastic
	p.Color = color
	if shape then
		p.Shape = shape
	end
	p.Size = size
	p.CFrame = cf
	p.Parent = model
	return p
end

local UP = CFrame.Angles(0, 0, math.pi / 2)

local function build(item): Model
	local model = Instance.new("Model")
	local cols = item.Colors or {}
	local primary = c3(cols.Primary, Color3.fromRGB(200, 200, 200))
	local secondary = c3(cols.Secondary, primary:Lerp(Color3.new(0, 0, 0), 0.25))
	local accent = c3(cols.Accent, secondary)
	local m = mat(item.Material, Enum.Material.SmoothPlastic)
	local slot = item.Slot
	local style = item.Style

	if slot == "Shirt" or slot == "Outfit" then
		local torsoColor = primary
		piece(model, CFrame.new(0, 0, 0), Vector3.new(2, 1.8, 1), torsoColor, Enum.Material.Fabric)
		local sleeveLen = (style == "Tank") and 0 or ((style == "Tee" or style == "Polo") and 0.8 or 1.8)
		for _, x in ipairs({ -1.5, 1.5 }) do
			if sleeveLen > 0 then
				piece(model, CFrame.new(x, 0.9 - sleeveLen / 2, 0), Vector3.new(0.95, sleeveLen, 0.95), torsoColor, Enum.Material.Fabric)
			end
			if sleeveLen < 1.8 then
				local rest = 1.8 - sleeveLen
				piece(model, CFrame.new(x, 0.9 - sleeveLen - rest / 2, 0), Vector3.new(0.85, rest, 0.85), SKIN)
			end
		end
		if slot == "Outfit" then
			for _, x in ipairs({ -0.5, 0.5 }) do
				piece(model, CFrame.new(x, -1.9, 0), Vector3.new(0.95, 2, 0.95), primary, Enum.Material.Fabric)
			end
			if style == "Suit" then
				piece(model, CFrame.new(0, 0.2, -0.52), Vector3.new(0.5, 1.2, 0.05), secondary)
				piece(model, CFrame.new(0, 0.1, -0.56), Vector3.new(0.18, 1.0, 0.05), accent, Enum.Material.Fabric)
			elseif style == "Tracksuit" then
				for _, x in ipairs({ -1.99, 1.99 }) do
					piece(model, CFrame.new(x, 0, 0), Vector3.new(0.05, 1.8, 0.15), secondary)
				end
				piece(model, CFrame.new(0, 0, -0.52), Vector3.new(0.07, 1.7, 0.05), secondary, Enum.Material.Metal)
			else
				piece(model, CFrame.new(0, 0.1, -0.52), Vector3.new(1.4, 0.12, 0.05), secondary, Enum.Material.Neon)
				piece(model, CFrame.new(0, -0.5, -0.53), Vector3.new(1.2, 0.4, 0.05), accent, Enum.Material.Fabric)
			end
		elseif style == "Hoodie" then
			piece(model, CFrame.new(0, 0.85, 0.55), Vector3.new(1.2, 0.55, 0.35), primary, Enum.Material.Fabric)
			piece(model, CFrame.new(0, -0.5, -0.53), Vector3.new(1.2, 0.45, 0.06), secondary, Enum.Material.Fabric)
		elseif style == "Polo" then
			piece(model, CFrame.new(0, 0.85, -0.45), Vector3.new(0.9, 0.16, 0.14), secondary, Enum.Material.Fabric)
		elseif cols.Secondary then
			piece(model, CFrame.new(0, 0.2, -0.52), Vector3.new(1.1, 0.35, 0.05), secondary)
		end
	elseif slot == "Pants" then
		piece(model, CFrame.new(0, 0.8, 0), Vector3.new(2, 0.5, 1), primary, Enum.Material.Fabric)
		local len = style == "Shorts" and 1.0 or 2.0
		for _, x in ipairs({ -0.5, 0.5 }) do
			piece(model, CFrame.new(x, 0.55 - len / 2, 0), Vector3.new(0.95, len, 0.95), primary, Enum.Material.Fabric)
			if len < 2 then
				piece(model, CFrame.new(x, 0.55 - len - 0.5, 0), Vector3.new(0.85, 1.0, 0.85), SKIN)
			end
			if style == "Joggers" then
				piece(model, CFrame.new(x, -1.35, 0), Vector3.new(1.0, 0.2, 1.0), secondary, Enum.Material.Fabric)
			end
		end
		if style == "Jeans" or style == "Chinos" then
			piece(model, CFrame.new(0, 0.98, 0), Vector3.new(2.05, 0.16, 1.05), Color3.fromRGB(60, 40, 28))
		end
	elseif slot == "Hat" or slot == "Glasses" then
		piece(model, CFrame.new(0, 0, 0), Vector3.new(1.4, 1.4, 1.4), SKIN, Enum.Material.SmoothPlastic, Enum.PartType.Ball)
		if slot == "Hat" then
			local d = 1.5
			if style == "Cap" then
				piece(model, CFrame.new(0, 0.5, 0) * UP, Vector3.new(0.55, d, d), primary, Enum.Material.Fabric, Enum.PartType.Cylinder)
				piece(model, CFrame.new(0, 0.35, -0.9), Vector3.new(1.2, 0.1, 0.8), secondary, Enum.Material.Fabric)
			elseif style == "Beanie" then
				piece(model, CFrame.new(0, 0.55, 0) * UP, Vector3.new(0.75, d, d), primary, Enum.Material.Fabric, Enum.PartType.Cylinder)
				piece(model, CFrame.new(0, 1.05, 0), Vector3.new(0.45, 0.45, 0.45), secondary, Enum.Material.Fabric, Enum.PartType.Ball)
			elseif style == "Bucket" then
				piece(model, CFrame.new(0, 0.55, 0) * UP, Vector3.new(0.65, d, d), primary, Enum.Material.Fabric, Enum.PartType.Cylinder)
				piece(model, CFrame.new(0, 0.28, 0) * UP, Vector3.new(0.1, d * 1.55, d * 1.55), primary, Enum.Material.Fabric, Enum.PartType.Cylinder)
				piece(model, CFrame.new(0, 0.38, 0) * UP, Vector3.new(0.16, d + 0.04, d + 0.04), secondary, Enum.Material.Fabric, Enum.PartType.Cylinder)
			else
				piece(model, CFrame.new(0, 0.65, 0) * UP, Vector3.new(0.7, d * 0.92, d * 0.92), primary, Enum.Material.Fabric, Enum.PartType.Cylinder)
				piece(model, CFrame.new(0, 0.35, 0) * UP, Vector3.new(0.08, d * 1.7, d * 1.7), primary, Enum.Material.Fabric, Enum.PartType.Cylinder)
				piece(model, CFrame.new(0, 0.45, 0) * UP, Vector3.new(0.18, d * 0.94, d * 0.94), secondary, Enum.Material.Fabric, Enum.PartType.Cylinder)
			end
		else
			if style == "Visor" then
				piece(model, CFrame.new(0, 0.12, -0.72), Vector3.new(1.3, 0.28, 0.08), secondary, Enum.Material.Neon)
			else
				for _, x in ipairs({ -0.3, 0.3 }) do
					local lens = piece(model, CFrame.new(x, 0.12, -0.7), Vector3.new(0.45, style == "Aviator" and 0.36 or 0.28, 0.06), secondary, Enum.Material.Glass)
					lens.Reflectance = 0.3
					piece(model, CFrame.new(x, 0.3, -0.69), Vector3.new(0.5, 0.05, 0.07), primary, style == "Aviator" and Enum.Material.Metal or Enum.Material.SmoothPlastic)
				end
				piece(model, CFrame.new(0, 0.2, -0.7), Vector3.new(0.2, 0.06, 0.05), primary)
			end
		end
	elseif slot == "Neck" then
		piece(model, CFrame.new(0, -0.6, 0), Vector3.new(2, 1.6, 1), MANNEQUIN)
		piece(model, CFrame.new(0, 0.45, 0) * UP, Vector3.new(0.5, 0.6, 0.6), MANNEQUIN, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder)
		local links = 22
		local pts = {}
		for i = 0, links - 1 do
			local a = i / links * math.pi * 2
			local front = math.max(0, math.cos(a))
			pts[i + 1] = Vector3.new(math.sin(a) * 0.5, 0.18 - front ^ 1.6 * 0.55, -math.cos(a) * 0.42 - front * 0.06)
		end
		for i = 1, #pts do
			local p0, p1 = pts[i], pts[(i % #pts) + 1]
			local mid = (p0 + p1) / 2
			local link = piece(model, CFrame.lookAt(mid, p1), Vector3.new(0.12, 0.09, 0.2), (style == "Rope" and i % 2 == 0) and accent or primary, m)
			link.Reflectance = 0.25
		end
		if style == "Pendant" then
			local gem = piece(model, CFrame.new(pts[1] + Vector3.new(0, -0.22, -0.04)) * CFrame.Angles(0, 0, math.rad(45)), Vector3.new(0.3, 0.3, 0.08), accent, Enum.Material.Glass)
			gem.Reflectance = 0.4
		end
	elseif slot == "Wrist" then
		piece(model, CFrame.new(0, 0, 0), Vector3.new(0.8, 2, 0.8), SKIN)
		piece(model, CFrame.new(0, -0.3, 0), Vector3.new(0.9, style == "Bracelet" and 0.14 or 0.24, 0.9), primary, m)
		if style ~= "Bracelet" then
			piece(model, CFrame.new(0, -0.3, -0.48) * CFrame.Angles(0, math.pi / 2, 0), Vector3.new(0.08, 0.46, 0.46), primary, m, Enum.PartType.Cylinder)
			piece(model, CFrame.new(0, -0.3, -0.52) * CFrame.Angles(0, math.pi / 2, 0), Vector3.new(0.06, 0.36, 0.36), secondary, Enum.Material.Glass, Enum.PartType.Cylinder)
		end
	elseif slot == "Shoes" then
		for _, x in ipairs({ -0.6, 0.6 }) do
			piece(model, CFrame.new(x, 0.15, -0.1), Vector3.new(0.95, 0.5, 1.5), primary, style == "Boots" and LEATHER or Enum.Material.SmoothPlastic)
			piece(model, CFrame.new(x, -0.15, -0.12), Vector3.new(1.0, 0.14, 1.58), secondary)
			if style == "HighTops" or style == "Boots" then
				piece(model, CFrame.new(x, 0.6, 0.15), Vector3.new(0.95, 0.5, 0.95), primary, style == "Boots" and LEATHER or Enum.Material.SmoothPlastic)
			end
			if style ~= "Boots" then
				piece(model, CFrame.new(x + (x < 0 and -0.49 or 0.49), 0.18, -0.1), Vector3.new(0.03, 0.12, 1.1), accent)
			end
		end
	end
	return model
end

function ItemPreview.Create(item, props: { [string]: any }?): ViewportFrame
	local vp = Instance.new("ViewportFrame")
	vp.BackgroundTransparency = 1
	vp.Size = UDim2.fromScale(1, 1)
	vp.Ambient = Color3.fromRGB(150, 150, 165)
	vp.LightColor = Color3.fromRGB(255, 250, 240)
	vp.LightDirection = Vector3.new(-1, -1.4, -0.8)
	if props then
		for k, v in pairs(props) do
			if k ~= "Parent" then
				(vp :: any)[k] = v
			end
		end
	end

	local ok, model = pcall(build, item)
	if ok and model then
		model.Parent = vp
		local cf, size = model:GetBoundingBox()
		local cam = Instance.new("Camera")
		cam.FieldOfView = 40
		local dist = math.max(size.X, size.Y, size.Z) * 1.9 + 1
		-- items face -Z: look from the front, a little above and to the side
		local dir = (CFrame.Angles(0, math.rad(28), 0) * CFrame.Angles(math.rad(14), 0, 0)):VectorToWorldSpace(Vector3.new(0, 0, -1))
		local eye = cf.Position + dir * dist
		cam.CFrame = CFrame.lookAt(eye, cf.Position)
		cam.Parent = vp
		vp.CurrentCamera = cam
	end
	if props and props.Parent then
		vp.Parent = props.Parent
	end
	return vp
end

return ItemPreview
