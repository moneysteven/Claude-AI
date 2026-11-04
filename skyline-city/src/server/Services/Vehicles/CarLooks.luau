-- CarLooks: applies a car's customisation to a built model (procedural or asset).
--
--   CarLooks.Apply(model, look, def, B?)    look = Shared/Vehicle/Looks.Resolve(...) result
--     * Paint (Color + Finish) on every part with attribute Paint = true (job vehicles use their Livery colours)
--     * window tint on every part with attribute Glass = true
--     * rims (procedural styles rebuilt on each wheel; asset cars only get re-coloured parts named "Rim*")
--     * spoiler + body kit (procedural cars) — rebuilt in Body/Spoiler and Body/Kit
--     * underglow (Lights/Underglow PointLight + model attribute Underglow: Color3)
--     * licence plate text (every TextLabel named "PlateText") + model attribute Plate
--     * job liveries (stripes, checkers, door lettering) — built once
--
-- Positions are computed in car-local space and transformed by the model pivot (ground centre), so this works
-- on parked spawned cars as well as freshly built ones.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Looks = require(Shared.Vehicle.Looks)
local VehiclesConfig = require(Shared.Config.Vehicles)

local CarLayout = require(script.Parent.CarLayout)

local CarLooks = {}

local TRIM = Color3.fromRGB(28, 28, 32)
local GROUP = VehiclesConfig.Physics.CollisionGroup

local function newPart(className: string, parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?, weldTo: BasePart?): BasePart
	local p = Instance.new(className) :: BasePart
	p.Name = name
	p.Anchored = false
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Massless = true
	p.CastShadow = false
	p.Size = Vector3.new(math.max(0.05, size.X), math.max(0.05, size.Y), math.max(0.05, size.Z))
	p.CFrame = cf
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CollisionGroup = GROUP
	p.Parent = parent
	if weldTo then
		local w = Instance.new("WeldConstraint")
		w.Part0 = weldTo
		w.Part1 = p
		w.Parent = p
	end
	return p
end

local function clearFolder(parent: Instance, name: string): Folder
	local f = parent:FindFirstChild(name)
	if f then
		f:Destroy()
	end
	local nf = Instance.new("Folder")
	nf.Name = name
	nf.Parent = parent
	return nf
end

---------------------------------------------------------------------------
-- Paint / glass
---------------------------------------------------------------------------
local function paintParts(model: Model, color: Color3, finishName: string)
	local finish = Looks.Finish(finishName)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and d:GetAttribute("Paint") == true then
			d.Color = color
			d.Material = finish.Material
			d.Reflectance = finish.Reflectance
			if d.Material == Enum.Material.Glass then
				d.Transparency = 0
			end
		end
	end
	model:SetAttribute("Paint", color)
end

local function tintGlass(model: Model, tint: number)
	local transparency, color = Looks.Tint(tint)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and d:GetAttribute("Glass") == true then
			d.Transparency = transparency
			d.Color = color
		end
	end
end

---------------------------------------------------------------------------
-- Rims
---------------------------------------------------------------------------
local function buildRim(wheel: BasePart, style, color: Color3)
	for _, c in ipairs(wheel:GetChildren()) do
		if c:IsA("BasePart") and c:GetAttribute("Rim") then
			c:Destroy()
		end
	end
	if wheel:GetAttribute("Hidden") then
		return
	end
	local side = wheel:GetAttribute("Side") or 1
	local r = wheel:GetAttribute("Radius") or wheel.Size.Y / 2
	local ww = wheel.Size.X
	local dia = r * 2 * (style.Size or 0.66)
	local depth = style.Depth or 0.1
	local cf = wheel.CFrame
	local outer = side * (ww / 2 + 0.005)
	local function rimPart(className, name, size, localCF, col, mat)
		local p = newPart(className, wheel, name, size, cf * localCF, col, mat, wheel)
		p:SetAttribute("Rim", true)
		return p
	end
	local chrome = Color3.fromRGB(215, 218, 224)
	local kind = style.Kind or "Spoke"
	-- barrel / face disc (recessed by depth)
	local face = rimPart("Part", "RimFace", Vector3.new(0.06, dia, dia), CFrame.new(outer - side * depth, 0, 0), color:Lerp(Color3.new(0, 0, 0), kind == "Disc" and 0 or 0.45), Enum.Material.SmoothPlastic)
	face.Shape = Enum.PartType.Cylinder
	local lip = rimPart("Part", "RimLip", Vector3.new(depth + 0.04, dia + 0.08, dia + 0.08), CFrame.new(outer - side * depth / 2, 0, 0), kind == "Dish" and chrome or color, Enum.Material.SmoothPlastic)
	lip.Shape = Enum.PartType.Cylinder
	local inner = rimPart("Part", "RimWell", Vector3.new(depth + 0.05, dia - 0.12, dia - 0.12), CFrame.new(outer - side * depth / 2, 0, 0), Color3.fromRGB(20, 20, 22), Enum.Material.SmoothPlastic)
	inner.Shape = Enum.PartType.Cylinder

	local spokes = style.Spokes or 5
	local spokeLen = dia * 0.46
	local x = outer - side * depth * 0.4
	if kind == "Spoke" or kind == "Dish" or kind == "Mesh" or kind == "Wire" or kind == "Turbine" then
		local width = style.Width or (kind == "Wire" and 0.04) or (kind == "Turbine" and 0.1) or (kind == "Mesh" and 0.07) or 0.16
		for i = 1, spokes do
			local a = (i / spokes) * math.pi * 2
			local twist = (kind == "Turbine") and math.rad(25) or 0
			rimPart("Part", "RimSpoke", Vector3.new(0.06, spokeLen, width), CFrame.Angles(a, 0, 0) * CFrame.new(x, spokeLen / 2, 0) * CFrame.Angles(0, twist, 0), color, Enum.Material.SmoothPlastic)
			if kind == "Mesh" then
				rimPart("Part", "RimSpoke", Vector3.new(0.05, spokeLen * 0.9, width), CFrame.Angles(a + math.pi / spokes, 0, 0) * CFrame.new(x - side * 0.02, spokeLen * 0.45, 0) * CFrame.Angles(math.rad(18), 0, 0), color, Enum.Material.SmoothPlastic)
			end
		end
	elseif kind == "Beadlock" then
		local bolts = 12
		for i = 1, bolts do
			local a = (i / bolts) * math.pi * 2
			rimPart("Part", "RimBolt", Vector3.new(0.08, 0.1, 0.1), CFrame.Angles(a, 0, 0) * CFrame.new(outer + side * 0.02, dia / 2 - 0.05, 0), chrome, Enum.Material.Metal)
		end
		for i = 1, spokes do
			local a = (i / spokes) * math.pi * 2
			rimPart("Part", "RimSpoke", Vector3.new(0.06, spokeLen * 0.8, 0.24), CFrame.Angles(a, 0, 0) * CFrame.new(x, spokeLen * 0.45, 0), color, Enum.Material.SmoothPlastic)
		end
	else -- Disc / aero
		local disc = rimPart("Part", "RimDisc", Vector3.new(0.05, dia - 0.06, dia - 0.06), CFrame.new(outer - side * 0.02, 0, 0), color, Enum.Material.SmoothPlastic)
		disc.Shape = Enum.PartType.Cylinder
		for i = 1, 5 do
			local a = (i / 5) * math.pi * 2
			rimPart("Part", "RimVent", Vector3.new(0.06, 0.22, 0.12), CFrame.Angles(a, 0, 0) * CFrame.new(outer, dia * 0.3, 0), Color3.fromRGB(20, 20, 22), Enum.Material.SmoothPlastic)
		end
	end
	if style.Cap then
		local cap = rimPart("Part", "RimCap", Vector3.new(0.08, dia * 0.24, dia * 0.24), CFrame.new(outer - side * 0.01, 0, 0), chrome, Enum.Material.SmoothPlastic)
		cap.Shape = Enum.PartType.Cylinder
	end
end

local function applyRims(model: Model, look, isAsset: boolean)
	local style = Looks.RimStyle(look.Rims)
	local color = (type(look.RimColor) == "table") and Looks.Color(look.RimColor) or Looks.Color(style.Color)
	local wheels = model:FindFirstChild("Wheels")
	if not wheels then
		return
	end
	for _, w in ipairs(wheels:GetChildren()) do
		if isAsset then
			for _, d in ipairs(w:GetDescendants()) do
				if d:IsA("BasePart") and d.Name:sub(1, 3) == "Rim" then
					d.Color = color
				end
			end
		elseif w:IsA("BasePart") then
			buildRim(w, style, color)
		end
	end
	model:SetAttribute("Rims", look.Rims)
end

---------------------------------------------------------------------------
-- Spoiler / body kit (procedural cars)
---------------------------------------------------------------------------
local function applySpoiler(model: Model, B, spoiler: string, paint: Color3, finish)
	local body = model:FindFirstChild("Body")
	if not body then
		return
	end
	local folder = clearFolder(body, "Spoiler")
	if spoiler == "None" or spoiler == "" then
		return
	end
	if not (B.Rear == "Trunk" or B.Rear == "Engine" or B.Rear == "Hatch") then
		return
	end
	local pivot = model:GetPivot()
	local trunk = model:FindFirstChild("Trunk")
	local anchor = (trunk and trunk:IsA("BasePart")) and trunk or model.PrimaryPart
	local function put(className, name, size, localCF, painted)
		local p = newPart(className, folder, name, size, pivot * localCF, painted and paint or TRIM, painted and finish.Material or Enum.Material.SmoothPlastic, anchor)
		if painted then
			p:SetAttribute("Paint", true)
			p.Reflectance = finish.Reflectance
		end
		return p
	end
	local W = B.W
	if B.Rear == "Hatch" then
		local y = B.RoofY + 0.02
		local z = B.ZRoofR + 0.15
		if spoiler == "Lip" or spoiler == "Ducktail" then
			put("Part", "RoofSpoiler", Vector3.new(B.CabW - 0.3, 0.08, 0.7), CFrame.new(0, y + 0.02, z) * CFrame.Angles(math.rad(-8), 0, 0), true)
		else
			put("Part", "RoofSpoiler", Vector3.new(B.CabW - 0.1, 0.1, 0.9), CFrame.new(0, y + 0.18, z + 0.1) * CFrame.Angles(math.rad(-12), 0, 0), true)
			for _, side in ipairs({ -1, 1 }) do
				put("Part", "SpoilerEndplate", Vector3.new(0.08, 0.35, 0.9), CFrame.new(side * (B.CabW / 2 - 0.05), y + 0.1, z + 0.1), false)
			end
		end
		return
	end
	local y = B.Belt + 0.14
	local z = B.RearZ - 0.55
	if spoiler == "Lip" then
		put("WedgePart", "SpoilerLip", Vector3.new(W - 1.0, 0.16, 0.5), CFrame.new(0, y + 0.08, z + 0.15), true)
	elseif spoiler == "Ducktail" then
		put("WedgePart", "SpoilerDucktail", Vector3.new(W - 0.7, 0.36, 1.0), CFrame.new(0, y + 0.18, z), true)
	elseif spoiler == "Wing" then
		for _, side in ipairs({ -1, 1 }) do
			put("Part", "SpoilerPost", Vector3.new(0.14, 0.62, 0.3), CFrame.new(side * (W / 2 - 1.3), y + 0.31, z), false)
		end
		put("Part", "SpoilerWing", Vector3.new(W - 0.9, 0.08, 0.85), CFrame.new(0, y + 0.66, z + 0.05) * CFrame.Angles(math.rad(-8), 0, 0), true)
	elseif spoiler == "SwanNeck" then
		local wingY = y + 1.2
		for _, side in ipairs({ -1, 1 }) do
			-- swan-neck posts hang the wing from its top surface
			put("Part", "SpoilerPost", Vector3.new(0.12, 0.75, 0.22), CFrame.new(side * (W / 2 - 1.7), y + 0.37, z - 0.25) * CFrame.Angles(math.rad(-20), 0, 0), false)
			put("Part", "SpoilerNeck", Vector3.new(0.12, 0.12, 0.7), CFrame.new(side * (W / 2 - 1.7), wingY + 0.12, z - 0.05), false)
			put("Part", "SpoilerEndplate", Vector3.new(0.06, 0.5, 1.1), CFrame.new(side * (W / 2 - 0.25), wingY, z + 0.15), false)
		end
		put("Part", "SpoilerWing", Vector3.new(W - 0.45, 0.1, 1.1), CFrame.new(0, wingY, z + 0.15) * CFrame.Angles(math.rad(-10), 0, 0), true)
	else -- GT (and any unknown id)
		for _, side in ipairs({ -1, 1 }) do
			put("Part", "SpoilerPost", Vector3.new(0.12, 1.05, 0.32), CFrame.new(side * (W / 2 - 1.6), y + 0.52, z + 0.1), false)
			put("Part", "SpoilerEndplate", Vector3.new(0.06, 0.55, 1.15), CFrame.new(side * (W / 2 - 0.25), y + 1.12, z + 0.15), false)
		end
		put("Part", "SpoilerWing", Vector3.new(W - 0.45, 0.1, 1.1), CFrame.new(0, y + 1.1, z + 0.15) * CFrame.Angles(math.rad(-10), 0, 0), true)
		put("Part", "SpoilerFlap", Vector3.new(W - 0.5, 0.06, 0.4), CFrame.new(0, y + 1.3, z + 0.55) * CFrame.Angles(math.rad(-22), 0, 0), false)
	end
end

local function applyKit(model: Model, B, kit: string, paint: Color3, finish)
	local body = model:FindFirstChild("Body")
	if not body then
		return
	end
	local folder = clearFolder(body, "Kit")
	if kit == "Stock" or kit == "" or B.Scooter then
		return
	end
	local pivot = model:GetPivot()
	local root = model.PrimaryPart
	local function put(name, size, localCF, painted)
		local p = newPart("Part", folder, name, size, pivot * localCF, painted and paint or TRIM, painted and finish.Material or Enum.Material.SmoothPlastic, root)
		if painted then
			p:SetAttribute("Paint", true)
		end
		return p
	end
	local skirtLen = math.max(0.5, (B.ZR - B.Arch) - (B.ZF + B.Arch))
	local skirtZ = (B.ZF + B.ZR) / 2
	local wide = kit == "Wide" or kit == "Widebody"
	if kit == "Offroad" then
		for _, side in ipairs({ -1, 1 }) do
			for _, zc in ipairs({ B.ZF, B.ZR }) do
				put("FenderFlare", Vector3.new(0.38, 0.32, B.Arch * 2 + 0.4), CFrame.new(side * (B.W / 2 + 0.16), B.ArchTop - 0.08, zc), false)
			end
			put("SideStep", Vector3.new(0.5, 0.12, math.max(0.5, (B.ZR - B.Arch) - (B.ZF + B.Arch))), CFrame.new(side * (B.W / 2 + 0.2), B.Cl + 0.1, (B.ZF + B.ZR) / 2), false)
		end
		put("SkidPlate", Vector3.new(B.W - 1.4, 0.1, 1.6), CFrame.new(0, B.Cl - 0.02, B.Front + 0.9), false)
		if B.CabH > 0.3 then
			put("RoofLightBar", Vector3.new(math.min(B.CabW - 0.6, 3.6), 0.25, 0.3), CFrame.new(0, B.RoofY + 0.2, B.ZRoofF + 0.25), false)
		end
		return
	end
	for _, side in ipairs({ -1, 1 }) do
		put("SideSkirt", Vector3.new(0.22, 0.28, skirtLen), CFrame.new(side * (B.W / 2 + 0.08), B.Cl + 0.12, skirtZ), kit ~= "Track")
		if wide or kit == "Track" then
			for _, zc in ipairs({ B.ZF, B.ZR }) do
				put("FenderFlare", Vector3.new(0.32, 0.3, B.Arch * 2 + 0.3), CFrame.new(side * (B.W / 2 + 0.14), B.ArchTop - 0.05, zc), true)
			end
		end
	end
	put("FrontLip", Vector3.new(B.W - 0.2, 0.08, 0.55), CFrame.new(0, B.Cl + 0.04, B.Front - 0.35), false)
	if kit == "Track" then
		put("Diffuser", Vector3.new(B.W - 1.2, 0.3, 0.5), CFrame.new(0, B.Cl + 0.15, B.RearZ + 0.2), false)
		for i = -2, 2 do
			put("DiffuserFin", Vector3.new(0.06, 0.4, 0.5), CFrame.new(i * 0.7, B.Cl + 0.2, B.RearZ + 0.2), false)
		end
		for _, side in ipairs({ -1, 1 }) do
			put("Canard", Vector3.new(0.5, 0.05, 0.4), CFrame.new(side * (B.W / 2 - 0.15), B.Cl + 0.7, B.Front + 0.1) * CFrame.Angles(0, 0, side * math.rad(12)), false)
		end
	end
end

---------------------------------------------------------------------------
-- Livery (job vehicles)
---------------------------------------------------------------------------
local function applyLivery(model: Model, B, livery)
	local body = model:FindFirstChild("Body")
	if not body or B.Scooter then
		return
	end
	local folder = clearFolder(body, "Livery")
	local pivot = model:GetPivot()
	local root = model.PrimaryPart
	local secondary = Looks.Color(livery.Secondary, Color3.new(0, 0, 0))
	local textColor = Looks.Color(livery.TextColor, secondary)
	local stripeY = (B.Cl + B.Belt) / 2 + 0.25
	-- door ranges per side (in car-local space)
	local doorRanges = { [-1] = {}, [1] = {} }
	local doors = model:FindFirstChild("Doors")
	if doors then
		for _, d in ipairs(doors:GetChildren()) do
			local door = d:FindFirstChild("Door")
			if door and door:IsA("BasePart") then
				local lp = pivot:PointToObjectSpace(door.Position)
				local side = lp.X < 0 and -1 or 1
				table.insert(doorRanges[side], { lp.Z - door.Size.Z / 2, lp.Z + door.Size.Z / 2, door })
			end
		end
	end
	local function stripeSegments(side: number, height: number, y: number, col: Color3, name: string)
		local ranges = doorRanges[side]
		table.sort(ranges, function(a, b)
			return a[1] < b[1]
		end)
		local cursor = B.Front + 0.3
		local function bodyPiece(z0, z1)
			if z1 - z0 > 0.1 then
				newPart("Part", folder, name, Vector3.new(0.04, height, z1 - z0), pivot * CFrame.new(side * (B.W / 2 + 0.02), y, (z0 + z1) / 2), col, nil, root)
			end
		end
		for _, r in ipairs(ranges) do
			bodyPiece(cursor, r[1])
			local door: BasePart = r[3]
			local p = newPart("Part", folder, name .. "Door", Vector3.new(0.04, height, r[2] - r[1] - 0.04), door.CFrame * CFrame.new(side * (door.Size.X / 2 + 0.02), y - (pivot:PointToObjectSpace(door.Position)).Y, 0), col, nil, door)
			p.Parent = door.Parent
			cursor = r[2]
		end
		bodyPiece(cursor, B.RearZ - 0.3)
	end
	for _, side in ipairs({ -1, 1 }) do
		if livery.Stripe then
			stripeSegments(side, 0.38, stripeY, secondary, "LiveryStripe")
		end
		if livery.Checker then
			-- checker band just below the beltline
			local y = B.Belt - 0.32
			local z0, z1 = B.Front + 0.6, B.RearZ - 0.6
			local n = math.floor((z1 - z0) / 0.36)
			for i = 0, n - 1 do
				if i % 2 == 0 then
					local z = z0 + (i + 0.5) * (z1 - z0) / n
					local holder = root
					for _, r in ipairs(doorRanges[side]) do
						if z > r[1] and z < r[2] then
							holder = r[3]
						end
					end
					local p = newPart("Part", folder, "LiveryChecker", Vector3.new(0.04, 0.18, (z1 - z0) / n), pivot * CFrame.new(side * (B.W / 2 + 0.11), y, z), secondary, nil, holder)
					if holder ~= root then
						p.Parent = holder.Parent
					end
				end
			end
		end
		-- lettering on the front door (or body side)
		if type(livery.Text) == "string" and livery.Text ~= "" then
			local target: BasePart? = nil
			for _, r in ipairs(doorRanges[side]) do
				if not target or r[1] < (pivot:PointToObjectSpace(target.Position)).Z then
					target = r[3]
				end
			end
			if target then
				local gui = Instance.new("SurfaceGui")
				gui.Name = "LiveryText"
				gui.Face = side < 0 and Enum.NormalId.Left or Enum.NormalId.Right
				gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
				gui.PixelsPerStud = 60
				gui.LightInfluence = 0.8
				gui.Parent = target
				local t = Instance.new("TextLabel")
				t.BackgroundTransparency = 1
				t.Position = UDim2.fromScale(0.05, 0.12)
				t.Size = UDim2.fromScale(0.9, 0.36)
				t.Text = livery.Text
				t.TextScaled = true
				t.Font = Enum.Font.GothamBlack
				t.TextColor3 = textColor
				t.Parent = gui
			end
		end
	end
end

---------------------------------------------------------------------------
-- Public
---------------------------------------------------------------------------
function CarLooks.SetPlate(model: Model, plate: string)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("TextLabel") and d.Name == "PlateText" then
			d.Text = plate
		end
	end
	model:SetAttribute("Plate", plate)
end

function CarLooks.SetUnderglow(model: Model, rgb: any)
	local lights = model:FindFirstChild("Lights")
	local holder = lights and lights:FindFirstChild("Underglow")
	local light = holder and holder:FindFirstChildWhichIsA("PointLight")
	if type(rgb) == "table" then
		local c = Looks.Color(rgb)
		model:SetAttribute("Underglow", c)
		if light then
			light.Color = c
		end
	else
		model:SetAttribute("Underglow", nil)
		if light then
			light.Enabled = false
		end
	end
end

function CarLooks.Apply(model: Model, look: { [string]: any }, def: { [string]: any }, B: any?)
	local layout = B or CarLayout.Compute(def)
	local isAsset = model:GetAttribute("IsAsset") == true
	local livery = def.Livery
	local paint = livery and Looks.Color(livery.Primary) or Looks.Color(look.Paint and look.Paint.Color)
	local finishName = livery and "Gloss" or (look.Paint and look.Paint.Finish or "Gloss")
	local finish = Looks.Finish(finishName)
	if not isAsset then
		if not livery then
			applySpoiler(model, layout, look.Spoiler or "None", paint, finish)
			applyKit(model, layout, look.BodyKit or "Stock", paint, finish)
		elseif not model:GetAttribute("LiveryApplied") then
			applyLivery(model, layout, livery)
			model:SetAttribute("LiveryApplied", true)
		end
	end
	paintParts(model, paint, finishName)
	tintGlass(model, look.Tint or 0.25)
	applyRims(model, look, isAsset)
	CarLooks.SetUnderglow(model, look.Underglow)
	if type(look.Plate) == "string" and look.Plate ~= "" then
		CarLooks.SetPlate(model, look.Plate)
	end
	model:SetAttribute("Finish", finishName)
	model:SetAttribute("BodyKit", look.BodyKit or "Stock")
	model:SetAttribute("Spoiler", look.Spoiler or "None")
end

return CarLooks
