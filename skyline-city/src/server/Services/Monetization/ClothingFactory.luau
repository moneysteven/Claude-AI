-- ClothingFactory: dresses a character with equipped Config/Clothing items.
--
--   ClothingFactory.Apply(character, items)   items = array of Config.Clothing item tables (one per slot)
--   ClothingFactory.Clear(character)          removes everything we added and restores the original look
--
-- For every item, in order of preference:
--   1. ServerStorage.Assets.Clothing.<ItemId>  (Accessory -> Humanoid:AddAccessory, Shirt/Pants -> applied,
--      Model/Folder of parts -> welded to the slot's body part; PrimaryPart (or first part) is aligned to it)
--   2. item.ShirtTemplate / item.PantsTemplate (real Shirt/Pants instances) for Shirt/Pants/Outfit slots
--   3. item.AssetId ~= 0 -> InsertService:LoadAsset (accessories; cached per server)
--   4. Procedural greybox built from Parts welded to the character (works for R15 and R6)
--
-- Body tints remember the original colour/material in attributes, and avatar clothing/accessories that would
-- cover ours (shirts, layered jackets, hats...) are parked off the character and put back by Clear.

local InsertService = game:GetService("InsertService")
local ServerStorage = game:GetService("ServerStorage")

local ClothingFactory = {}

local FOLDER_NAME = "SkylineClothing"
local ADDED_ATTR = "SkylineClothing"
local ORIG_COLOR = "SkyOrigColor"
local ORIG_MAT = "SkyOrigMaterial"

-- character -> list of { inst, parent } hidden by us
local hidden: { [Model]: { { any } } } = setmetatable({}, { __mode = "k" }) :: any
local assetCache: { [number]: Instance | false } = {}
local assetLoading: { [number]: boolean } = {}
-- character -> apply generation. Apply can yield (InsertService), so a newer Apply makes older ones stop.
local generation: { [Model]: number } = setmetatable({}, { __mode = "k" }) :: any

local function c3(rgb: { number }?, fallback: Color3): Color3
	if type(rgb) == "table" and #rgb >= 3 then
		return Color3.fromRGB(rgb[1], rgb[2], rgb[3])
	end
	return fallback
end

local function material(name: string?, fallback: Enum.Material): Enum.Material
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

-- newer material; resolved safely so older engines fall back to Fabric
local LEATHER = material("Leather", Enum.Material.Fabric)

local function colors(item)
	local cols = item.Colors or {}
	local primary = c3(cols.Primary, Color3.fromRGB(200, 200, 200))
	local secondary = c3(cols.Secondary, primary:Lerp(Color3.new(0, 0, 0), 0.25))
	local accent = c3(cols.Accent, secondary)
	return primary, secondary, accent
end

---------------------------------------------------------------------------
-- Body part lookup (R15 first, R6 fallback)
---------------------------------------------------------------------------
local function part(char: Model, name: string): BasePart?
	local p = char:FindFirstChild(name)
	if p and p:IsA("BasePart") then
		return p
	end
	return nil
end

local function body(char: Model)
	local isR6 = part(char, "Torso") ~= nil and part(char, "UpperTorso") == nil
	return {
		R6 = isR6,
		Head = part(char, "Head"),
		Chest = part(char, "UpperTorso") or part(char, "Torso"),
		Hips = part(char, "LowerTorso"),
		LUA = part(char, "LeftUpperArm") or part(char, "Left Arm"),
		RUA = part(char, "RightUpperArm") or part(char, "Right Arm"),
		LLA = part(char, "LeftLowerArm"),
		RLA = part(char, "RightLowerArm"),
		LWrist = part(char, "LeftLowerArm") or part(char, "Left Arm"),
		LUL = part(char, "LeftUpperLeg") or part(char, "Left Leg"),
		RUL = part(char, "RightUpperLeg") or part(char, "Right Leg"),
		LLL = part(char, "LeftLowerLeg"),
		RLL = part(char, "RightLowerLeg"),
		LFoot = part(char, "LeftFoot"),
		RFoot = part(char, "RightFoot"),
		LLeg = part(char, "LeftLowerLeg") or part(char, "Left Leg"),
		RLeg = part(char, "RightLowerLeg") or part(char, "Right Leg"),
	}
end

---------------------------------------------------------------------------
-- Building blocks
---------------------------------------------------------------------------
local function getFolder(char: Model): Folder
	local f = char:FindFirstChild(FOLDER_NAME)
	if not f then
		f = Instance.new("Folder")
		f.Name = FOLDER_NAME
		f.Parent = char
	end
	return f :: Folder
end

-- Creates a welded, massless, non-colliding part at a WORLD cframe.
local function weldPart(anchor: BasePart, worldCF: CFrame, props: { [string]: any }, parent: Instance): Part
	local p = Instance.new("Part")
	p.Anchored = false
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Massless = true
	p.CastShadow = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	for k, v in pairs(props) do
		(p :: any)[k] = v
	end
	p.CFrame = worldCF
	local w = Instance.new("WeldConstraint")
	w.Part0 = anchor
	w.Part1 = p
	w.Parent = p
	p.Parent = parent
	return p
end

local function box(anchor: BasePart, offset: CFrame, size: Vector3, color: Color3, mat: Enum.Material?, parent: Instance, extra: { [string]: any }?): Part
	local props = { Size = size, Color = color, Material = mat or Enum.Material.SmoothPlastic, Name = "Piece" }
	if extra then
		for k, v in pairs(extra) do
			props[k] = v
		end
	end
	return weldPart(anchor, anchor.CFrame * offset, props, parent)
end

-- vertical cylinder (Roblox cylinders run along X, so rotate onto Y)
local UPRIGHT = CFrame.Angles(0, 0, math.pi / 2)
local function cylinder(anchor: BasePart, offset: CFrame, height: number, diameter: number, color: Color3, mat: Enum.Material?, parent: Instance): Part
	return weldPart(anchor, anchor.CFrame * offset * UPRIGHT, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(height, diameter, diameter),
		Color = color,
		Material = mat or Enum.Material.SmoothPlastic,
		Name = "Piece",
	}, parent)
end

local function ball(anchor: BasePart, offset: CFrame, diameter: number, color: Color3, mat: Enum.Material?, parent: Instance): Part
	return weldPart(anchor, anchor.CFrame * offset, {
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(diameter, diameter, diameter),
		Color = color,
		Material = mat or Enum.Material.SmoothPlastic,
		Name = "Piece",
	}, parent)
end

local function tint(p: BasePart?, color: Color3, mat: Enum.Material?)
	if not p then
		return
	end
	if p:GetAttribute(ORIG_COLOR) == nil then
		p:SetAttribute(ORIG_COLOR, p.Color)
		p:SetAttribute(ORIG_MAT, p.Material.Name)
	end
	p.Color = color
	p.Material = mat or Enum.Material.Fabric
end

local function slotModel(char: Model, slot: string): Model
	local m = Instance.new("Model")
	m.Name = slot
	m.Parent = getFolder(char)
	return m
end

---------------------------------------------------------------------------
-- Hiding avatar items that would cover ours
---------------------------------------------------------------------------
local AT = Enum.AccessoryType
local COVER_TYPES = {
	Shirt = { AT.TShirt, AT.Shirt, AT.Jacket, AT.Sweater, AT.DressSkirt },
	Pants = { AT.Pants, AT.Shorts, AT.DressSkirt },
	Shoes = { AT.LeftShoe, AT.RightShoe },
	Hat = { AT.Hat },
	Glasses = { AT.Face },
	Neck = { AT.Neck },
}

local function hide(char: Model, inst: Instance)
	local list = hidden[char]
	if not list then
		list = {}
		hidden[char] = list
	end
	table.insert(list, { inst, inst.Parent })
	inst.Parent = nil
end

local function hideCovering(char: Model, coverSlots: { [string]: boolean })
	local types: { [Enum.AccessoryType]: boolean } = {}
	for slot in pairs(coverSlots) do
		for _, t in ipairs(COVER_TYPES[slot] or {}) do
			types[t] = true
		end
	end
	for _, child in ipairs(char:GetChildren()) do
		if child:GetAttribute(ADDED_ATTR) then
			continue
		end
		if coverSlots.Shirt and (child:IsA("Shirt") or child:IsA("ShirtGraphic")) then
			hide(char, child)
		elseif coverSlots.Pants and child:IsA("Pants") then
			hide(char, child)
		elseif child:IsA("Accessory") and types[child.AccessoryType] then
			hide(char, child)
		end
	end
end

---------------------------------------------------------------------------
-- Procedural styles
---------------------------------------------------------------------------
local function chestDetail(b, item, parent, primary: Color3, secondary: Color3)
	local chest = b.Chest
	if not chest then
		return
	end
	local s = chest.Size
	local style = item.Style
	if style == "Tee" or style == "Tank" then
		if item.Colors and item.Colors.Secondary then
			box(chest, CFrame.new(0, s.Y * 0.12, -s.Z / 2 - 0.02), Vector3.new(s.X * 0.55, s.Y * 0.18, 0.04), secondary, Enum.Material.SmoothPlastic, parent)
		end
	elseif style == "Polo" then
		box(chest, CFrame.new(0, s.Y / 2 - 0.08, -s.Z / 2 + 0.05), Vector3.new(s.X * 0.42, 0.16, 0.12), secondary, Enum.Material.Fabric, parent)
		box(chest, CFrame.new(0, s.Y * 0.22, -s.Z / 2 - 0.02), Vector3.new(0.14, s.Y * 0.3, 0.04), secondary, Enum.Material.Fabric, parent)
	elseif style == "Hoodie" then
		-- hood resting on the upper back
		box(chest, CFrame.new(0, s.Y / 2 - 0.12, s.Z / 2 + 0.12), Vector3.new(s.X * 0.62, 0.55, 0.32), primary, Enum.Material.Fabric, parent)
		-- kangaroo pocket
		box(chest, CFrame.new(0, -s.Y * 0.28, -s.Z / 2 - 0.03), Vector3.new(s.X * 0.6, s.Y * 0.24, 0.06), secondary, Enum.Material.Fabric, parent)
		-- drawstrings
		for _, x in ipairs({ -0.18, 0.18 }) do
			box(chest, CFrame.new(x, s.Y * 0.2, -s.Z / 2 - 0.03), Vector3.new(0.05, s.Y * 0.32, 0.04), secondary, Enum.Material.SmoothPlastic, parent)
		end
	end
end

local function sleeveOverlay(arm: BasePart?, color: Color3, parent: Instance, length: number)
	-- R6 short sleeves: a fabric band over the top of the arm
	if not arm then
		return
	end
	local s = arm.Size
	box(arm, CFrame.new(0, s.Y / 2 - length / 2 + 0.02, 0), Vector3.new(s.X + 0.06, length, s.Z + 0.06), color, Enum.Material.Fabric, parent)
end

local function buildShirt(char: Model, b, item, parent: Instance)
	local primary, secondary = colors(item)
	local style = item.Style
	tint(b.Chest, primary)
	if b.R6 then
		if style == "Hoodie" then
			tint(b.LUA, primary)
			tint(b.RUA, primary)
		elseif style ~= "Tank" then
			sleeveOverlay(b.LUA, primary, parent, 0.7)
			sleeveOverlay(b.RUA, primary, parent, 0.7)
		end
	else
		if style ~= "Tank" then
			tint(b.LUA, primary)
			tint(b.RUA, primary)
		end
		if style == "Hoodie" then
			tint(b.LLA, primary)
			tint(b.RLA, primary)
		end
	end
	chestDetail(b, item, parent, primary, secondary)
end

local function belt(b, color: Color3, parent: Instance)
	local hips = b.Hips or b.Chest
	if not hips then
		return
	end
	local s = hips.Size
	local y = b.Hips and (s.Y / 2 - 0.08) or (-s.Y / 2 + 0.1)
	box(hips, CFrame.new(0, y, 0), Vector3.new(s.X + 0.06, 0.16, s.Z + 0.06), color, Enum.Material.SmoothPlastic, parent)
	box(hips, CFrame.new(0, y, -s.Z / 2 - 0.04), Vector3.new(0.26, 0.2, 0.04), Color3.fromRGB(200, 200, 205), Enum.Material.Metal, parent)
end

local function legOverlay(leg: BasePart?, color: Color3, parent: Instance, length: number)
	if not leg then
		return
	end
	local s = leg.Size
	box(leg, CFrame.new(0, s.Y / 2 - length / 2 + 0.02, 0), Vector3.new(s.X + 0.06, length, s.Z + 0.06), color, Enum.Material.Fabric, parent)
end

local function buildPants(char: Model, b, item, parent: Instance)
	local primary, secondary = colors(item)
	local style = item.Style
	tint(b.Hips, primary)
	if b.R6 then
		if style == "Shorts" then
			legOverlay(b.LUL, primary, parent, 1)
			legOverlay(b.RUL, primary, parent, 1)
		else
			tint(b.LUL, primary)
			tint(b.RUL, primary)
		end
	else
		tint(b.LUL, primary)
		tint(b.RUL, primary)
		if style ~= "Shorts" then
			tint(b.LLL, primary)
			tint(b.RLL, primary)
		end
	end
	if style == "Jeans" or style == "Chinos" then
		belt(b, style == "Jeans" and Color3.fromRGB(70, 46, 30) or Color3.fromRGB(40, 30, 24), parent)
	elseif style == "Joggers" then
		-- elastic cuffs + side stripes
		for _, leg in ipairs({ b.LLeg, b.RLeg }) do
			if leg then
				local s = leg.Size
				box(leg, CFrame.new(0, -s.Y / 2 + 0.12, 0), Vector3.new(s.X + 0.07, 0.2, s.Z + 0.07), secondary, Enum.Material.Fabric, parent)
			end
		end
		for i, leg in ipairs({ b.LUL, b.RUL }) do
			if leg then
				local s = leg.Size
				local x = (i == 1 and -1 or 1) * (s.X / 2 + 0.02)
				box(leg, CFrame.new(x, 0, 0), Vector3.new(0.04, s.Y * 0.9, 0.12), secondary, Enum.Material.SmoothPlastic, parent)
			end
		end
	elseif style == "Shorts" and item.Colors and item.Colors.Secondary then
		for _, leg in ipairs({ b.LUL, b.RUL }) do
			if leg then
				local s = leg.Size
				local y = b.R6 and (s.Y / 2 - 1) or (-s.Y / 2 + 0.08)
				box(leg, CFrame.new(0, y, 0), Vector3.new(s.X + 0.08, 0.1, s.Z + 0.08), secondary, Enum.Material.Fabric, parent)
			end
		end
	end
end

local function buildOutfit(char: Model, b, item, parent: Instance)
	local primary, secondary, accent = colors(item)
	local style = item.Style
	-- full sleeves + full legs
	tint(b.Chest, primary)
	tint(b.Hips, primary)
	for _, p in ipairs({ b.LUA, b.RUA, b.LLA, b.RLA, b.LUL, b.RUL, b.LLL, b.RLL }) do
		tint(p, primary)
	end
	local chest = b.Chest
	if not chest then
		return
	end
	local s = chest.Size
	local front = -s.Z / 2 - 0.02
	if style == "Suit" then
		-- dress shirt panel, tie, lapels and pocket square
		box(chest, CFrame.new(0, s.Y * 0.18, front), Vector3.new(s.X * 0.26, s.Y * 0.62, 0.04), secondary, Enum.Material.SmoothPlastic, parent)
		box(chest, CFrame.new(0, s.Y * 0.12, front - 0.03), Vector3.new(0.14, s.Y * 0.55, 0.04), accent, Enum.Material.Fabric, parent)
		for _, side in ipairs({ -1, 1 }) do
			box(chest, CFrame.new(side * s.X * 0.18, s.Y * 0.2, front - 0.01) * CFrame.Angles(0, 0, side * math.rad(-14)), Vector3.new(0.12, s.Y * 0.55, 0.05), primary:Lerp(Color3.new(0, 0, 0), 0.35), Enum.Material.Fabric, parent)
		end
		box(chest, CFrame.new(s.X * 0.3, s.Y * 0.2, front - 0.02), Vector3.new(0.22, 0.12, 0.04), accent, Enum.Material.Fabric, parent)
		belt(b, Color3.fromRGB(20, 20, 24), parent)
	elseif style == "Tracksuit" then
		-- zipper + contrast stripes down arms and legs
		box(chest, CFrame.new(0, 0, front), Vector3.new(0.06, s.Y * 0.95, 0.04), secondary, Enum.Material.Metal, parent)
		for i, limb in ipairs({ b.LUA, b.RUA, b.LUL, b.RUL, b.LLA, b.RLA, b.LLL, b.RLL }) do
			if limb then
				local ls = limb.Size
				local side = (i % 2 == 1) and -1 or 1
				box(limb, CFrame.new(side * (ls.X / 2 + 0.02), 0, 0), Vector3.new(0.04, ls.Y * 0.96, 0.14), secondary, Enum.Material.SmoothPlastic, parent)
			end
		end
		box(chest, CFrame.new(0, s.Y / 2 - 0.08, 0), Vector3.new(s.X * 0.5, 0.16, s.Z + 0.06), secondary, Enum.Material.Fabric, parent)
	elseif style == "Streetwear" then
		-- oversized hoodie with neon trims + cargo pockets
		box(chest, CFrame.new(0, s.Y / 2 - 0.12, s.Z / 2 + 0.12), Vector3.new(s.X * 0.62, 0.55, 0.32), primary, Enum.Material.Fabric, parent)
		box(chest, CFrame.new(0, s.Y * 0.05, front), Vector3.new(s.X * 0.7, 0.1, 0.04), secondary, Enum.Material.Neon, parent)
		box(chest, CFrame.new(0, -s.Y * 0.28, front), Vector3.new(s.X * 0.6, s.Y * 0.22, 0.05), accent, Enum.Material.Fabric, parent)
		for i, leg in ipairs({ b.LUL, b.RUL }) do
			if leg then
				local ls = leg.Size
				local side = i == 1 and -1 or 1
				box(leg, CFrame.new(side * (ls.X / 2 + 0.04), -ls.Y * 0.1, 0), Vector3.new(0.08, ls.Y * 0.35, ls.Z * 0.6), primary:Lerp(Color3.new(0, 0, 0), 0.2), Enum.Material.Fabric, parent)
			end
		end
		for _, leg in ipairs({ b.LLeg, b.RLeg }) do
			if leg then
				local ls = leg.Size
				box(leg, CFrame.new(0, -ls.Y / 2 + 0.12, 0), Vector3.new(ls.X + 0.07, 0.12, ls.Z + 0.07), secondary, Enum.Material.Neon, parent)
			end
		end
	end
end

local function headMetrics(head: BasePart)
	local s = math.min(head.Size.X, head.Size.Y, head.Size.Z)
	return s
end

local function buildHat(char: Model, b, item, parent: Instance)
	local head = b.Head
	if not head then
		return
	end
	local primary, secondary = colors(item)
	local mat = material(item.Material, Enum.Material.Fabric)
	local s = headMetrics(head)
	local d = s * 1.12
	local style = item.Style
	if style == "Cap" then
		cylinder(head, CFrame.new(0, s * 0.42, 0), s * 0.42, d, primary, mat, parent)
		ball(head, CFrame.new(0, s * 0.64, 0), 0.14, secondary, Enum.Material.SmoothPlastic, parent)
		box(head, CFrame.new(0, s * 0.3, -d * 0.62), Vector3.new(d * 0.82, 0.08, d * 0.55), secondary, mat, parent)
	elseif style == "Beanie" then
		cylinder(head, CFrame.new(0, s * 0.45, 0), s * 0.55, d, primary, Enum.Material.Fabric, parent)
		cylinder(head, CFrame.new(0, s * 0.24, 0), s * 0.18, d + 0.08, primary:Lerp(Color3.new(0, 0, 0), 0.15), Enum.Material.Fabric, parent)
		ball(head, CFrame.new(0, s * 0.82, 0), s * 0.32, secondary, Enum.Material.Fabric, parent)
	elseif style == "Bucket" then
		cylinder(head, CFrame.new(0, s * 0.46, 0), s * 0.48, d, primary, mat, parent)
		cylinder(head, CFrame.new(0, s * 0.24, 0), 0.08, d * 1.55, primary, mat, parent)
		cylinder(head, CFrame.new(0, s * 0.3, 0), s * 0.12, d + 0.04, secondary, Enum.Material.Fabric, parent)
	elseif style == "Fedora" then
		cylinder(head, CFrame.new(0, s * 0.55, 0), s * 0.55, d * 0.92, primary, Enum.Material.Fabric, parent)
		cylinder(head, CFrame.new(0, s * 0.3, 0), 0.07, d * 1.7, primary, Enum.Material.Fabric, parent)
		cylinder(head, CFrame.new(0, s * 0.38, 0), s * 0.14, d * 0.94, secondary, Enum.Material.Fabric, parent)
		box(head, CFrame.new(0, s * 0.83, 0), Vector3.new(d * 0.5, 0.06, d * 0.7), primary:Lerp(Color3.new(0, 0, 0), 0.2), Enum.Material.Fabric, parent)
	else
		cylinder(head, CFrame.new(0, s * 0.42, 0), s * 0.42, d, primary, mat, parent)
	end
end

local function buildGlasses(char: Model, b, item, parent: Instance)
	local head = b.Head
	if not head then
		return
	end
	local primary, secondary = colors(item)
	local s = headMetrics(head)
	local z = -s * 0.56
	local y = s * 0.1
	local style = item.Style
	if style == "Visor" then
		box(head, CFrame.new(0, y, z), Vector3.new(s * 0.95, s * 0.2, 0.08), secondary, Enum.Material.Neon, parent, { Transparency = 0.1 })
		box(head, CFrame.new(0, y + s * 0.12, z + 0.02), Vector3.new(s * 1.0, 0.05, 0.1), primary, Enum.Material.Metal, parent)
	else
		local lensW = style == "Aviator" and s * 0.36 or s * 0.32
		local lensH = style == "Aviator" and s * 0.26 or s * 0.2
		local frameColor = primary
		local lensColor = secondary
		for _, side in ipairs({ -1, 1 }) do
			box(head, CFrame.new(side * s * 0.22, y, z), Vector3.new(lensW, lensH, 0.06), lensColor, Enum.Material.Glass, parent, { Transparency = 0.15, Reflectance = 0.25 })
			box(head, CFrame.new(side * s * 0.22, y + lensH / 2, z + 0.01), Vector3.new(lensW + 0.04, 0.04, 0.07), frameColor, style == "Aviator" and Enum.Material.Metal or Enum.Material.SmoothPlastic, parent)
			-- temple arms
			box(head, CFrame.new(side * s * 0.47, y + lensH * 0.3, z + s * 0.3), Vector3.new(0.04, 0.05, s * 0.6), frameColor, Enum.Material.SmoothPlastic, parent)
		end
		box(head, CFrame.new(0, y + lensH * 0.3, z), Vector3.new(s * 0.14, 0.05, 0.05), frameColor, Enum.Material.SmoothPlastic, parent)
	end
end

local function buildNeck(char: Model, b, item, parent: Instance)
	local chest = b.Chest
	if not chest then
		return
	end
	local primary, _, accent = colors(item)
	local mat = material(item.Material, Enum.Material.Metal)
	local s = chest.Size
	local style = item.Style
	local links = style == "Rope" and 26 or 20
	local linkSize = style == "Rope" and Vector3.new(0.13, 0.13, 0.2) or Vector3.new(0.12, 0.08, 0.2)
	local rx, rz = 0.5, 0.42
	local topY = s.Y / 2 - 0.05
	local reflect = (mat == Enum.Material.Foil or mat == Enum.Material.Metal) and 0.25 or 0
	local points = {}
	for i = 0, links - 1 do
		local a = (i / links) * math.pi * 2
		local front = math.max(0, math.cos(a))
		local x = math.sin(a) * rx
		local z = -math.cos(a) * rz - front * 0.06
		local y = topY - (front ^ 1.6) * (style == "Pendant" and 0.62 or 0.5)
		points[i + 1] = Vector3.new(x, y, z)
	end
	for i = 1, #points do
		local p0 = points[i]
		local p1 = points[(i % #points) + 1]
		local mid = (p0 + p1) / 2
		local cf = CFrame.lookAt(mid, p1)
		if (p1 - p0).Magnitude < 1e-3 then
			cf = CFrame.new(mid)
		end
		local link = box(chest, cf, linkSize, (style == "Rope" and i % 2 == 0) and accent or primary, mat, parent)
		link.Reflectance = reflect
	end
	if style == "Pendant" then
		local lowest = points[1]
		local gem = box(chest, CFrame.new(lowest + Vector3.new(0, -0.2, -0.04)) * CFrame.Angles(0, 0, math.rad(45)), Vector3.new(0.28, 0.28, 0.08), accent, Enum.Material.Glass, parent)
		gem.Reflectance = 0.4
		gem.Transparency = 0.1
		local setting = box(chest, CFrame.new(lowest + Vector3.new(0, -0.2, -0.01)) * CFrame.Angles(0, 0, math.rad(45)), Vector3.new(0.34, 0.34, 0.05), primary, mat, parent)
		setting.Reflectance = reflect
	end
end

local function buildWrist(char: Model, b, item, parent: Instance)
	local arm = b.LWrist
	if not arm then
		return
	end
	local primary, secondary, accent = colors(item)
	local mat = material(item.Material, Enum.Material.Metal)
	local s = arm.Size
	local y = -s.Y / 2 + (b.R6 and 0.45 or 0.22)
	local style = item.Style
	if style == "Bracelet" then
		local band = box(arm, CFrame.new(0, y, 0), Vector3.new(s.X + 0.08, 0.14, s.Z + 0.08), primary, mat, parent)
		band.Material = material(item.Material, Enum.Material.Fabric)
		return
	end
	local band = box(arm, CFrame.new(0, y, 0), Vector3.new(s.X + 0.08, 0.22, s.Z + 0.08), primary, mat, parent)
	band.Reflectance = (mat == Enum.Material.Foil or mat == Enum.Material.Metal) and 0.2 or 0
	-- watch face on the outer side of the left wrist (-X)
	local faceCF = CFrame.new(-(s.X / 2 + 0.06), y, 0)
	local bezel = weldPart(arm, arm.CFrame * faceCF, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.08, 0.44, 0.44),
		Color = primary,
		Material = mat,
		Reflectance = 0.25,
		Name = "Bezel",
	}, parent)
	bezel.Name = "Bezel"
	weldPart(arm, arm.CFrame * faceCF * CFrame.new(-0.03, 0, 0), {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.06, 0.34, 0.34),
		Color = secondary,
		Material = Enum.Material.Glass,
		Reflectance = 0.3,
		Name = "Face",
	}, parent)
	if item.Colors and item.Colors.Accent then
		-- iced bezel sparkle
		for i = 0, 7 do
			local a = i / 8 * math.pi * 2
			box(arm, faceCF * CFrame.new(-0.05, math.sin(a) * 0.19, math.cos(a) * 0.19), Vector3.new(0.04, 0.06, 0.06), accent, Enum.Material.Neon, parent)
		end
	end
end

local function footFrame(b, side: string): (BasePart?, CFrame?, Vector3?)
	local foot = side == "L" and b.LFoot or b.RFoot
	if foot then
		return foot, foot.CFrame, foot.Size
	end
	local leg = side == "L" and b.LLeg or b.RLeg
	if not leg then
		return nil, nil, nil
	end
	local fs = Vector3.new(leg.Size.X, 0.4, leg.Size.Z)
	return leg, leg.CFrame * CFrame.new(0, -leg.Size.Y / 2 + fs.Y / 2, 0), fs
end

local function buildShoes(char: Model, b, item, parent: Instance)
	local primary, secondary, accent = colors(item)
	local style = item.Style
	for _, side in ipairs({ "L", "R" }) do
		local anchor, cf, fs = footFrame(b, side)
		if anchor and cf and fs then
			local function at(offset: CFrame, size: Vector3, color: Color3, mat: Enum.Material?)
				return weldPart(anchor, cf * offset, { Size = size, Color = color, Material = mat or Enum.Material.SmoothPlastic, Name = "Piece" }, parent)
			end
			-- upper
			at(CFrame.new(0, 0.04, -0.08), Vector3.new(fs.X + 0.1, fs.Y + 0.1, fs.Z + 0.22), primary, style == "Boots" and LEATHER or Enum.Material.SmoothPlastic)
			-- sole
			at(CFrame.new(0, -fs.Y / 2 - 0.03, -0.09), Vector3.new(fs.X + 0.14, 0.12, fs.Z + 0.28), secondary)
			-- toe cap
			at(CFrame.new(0, -0.02, -(fs.Z / 2) - 0.14), Vector3.new(fs.X + 0.08, fs.Y * 0.7, 0.16), secondary)
			-- side swoosh
			if style ~= "Boots" then
				local x = (side == "L" and -1 or 1) * (fs.X / 2 + 0.06)
				at(CFrame.new(x, 0.02, -0.06) * CFrame.Angles(math.rad(12), 0, 0), Vector3.new(0.03, 0.1, fs.Z * 0.75), accent)
			end
			-- high-top / boot collar around the ankle
			if style == "HighTops" or style == "Boots" then
				local leg = side == "L" and b.LLeg or b.RLeg
				if leg then
					local ls = leg.Size
					local y = b.R6 and (-ls.Y / 2 + fs.Y + 0.25) or (-ls.Y / 2 + 0.25)
					box(leg, CFrame.new(0, y, 0), Vector3.new(ls.X + 0.12, 0.5, ls.Z + 0.12), primary, style == "Boots" and LEATHER or Enum.Material.SmoothPlastic, parent)
					box(leg, CFrame.new(0, y + 0.24, 0), Vector3.new(ls.X + 0.14, 0.06, ls.Z + 0.14), accent, Enum.Material.SmoothPlastic, parent)
				end
			end
		end
	end
end

local BUILDERS = {
	Shirt = buildShirt,
	Pants = buildPants,
	Outfit = buildOutfit,
	Hat = buildHat,
	Glasses = buildGlasses,
	Neck = buildNeck,
	Wrist = buildWrist,
	Shoes = buildShoes,
}

-- body part a custom Model is aligned to, by slot
local MODEL_ANCHOR = {
	Hat = "Head",
	Glasses = "Head",
	Neck = "Chest",
	Wrist = "LWrist",
	Shirt = "Chest",
	Outfit = "Chest",
	Pants = "Hips",
	Shoes = "LFoot",
}

---------------------------------------------------------------------------
-- Real assets
---------------------------------------------------------------------------
local function assetTemplate(item): Instance?
	local assets = ServerStorage:FindFirstChild("Assets")
	local folder = assets and assets:FindFirstChild("Clothing")
	local custom = folder and folder:FindFirstChild(item.Id)
	if custom then
		return custom
	end
	local assetId = tonumber(item.AssetId) or 0
	if assetId == 0 then
		return nil
	end
	-- another Apply is already loading this asset: wait for it instead of loading it twice
	local waited = 0
	while assetLoading[assetId] and waited < 15 do
		task.wait(0.1)
		waited += 0.1
	end
	local cached = assetCache[assetId]
	if cached ~= nil then
		return cached or nil
	end
	assetLoading[assetId] = true
	local ok, model = pcall(function()
		return InsertService:LoadAsset(assetId)
	end)
	if ok and model then
		local acc = model:FindFirstChildWhichIsA("Accessory", true)
		if acc then
			acc.Parent = nil
			assetCache[assetId] = acc
			assetLoading[assetId] = nil
			model:Destroy()
			return acc
		end
		model:Destroy()
	else
		warn(("[ClothingFactory] could not load asset %d for %s: %s"):format(assetId, item.Id, tostring(model)))
	end
	assetCache[assetId] = false
	assetLoading[assetId] = nil
	return nil
end

local function applyAsset(char: Model, b, item, template: Instance, parent: Instance): boolean
	local humanoid = char:FindFirstChildOfClass("Humanoid")
	if template:IsA("Accessory") then
		if not humanoid then
			return false
		end
		local acc = template:Clone()
		acc:SetAttribute(ADDED_ATTR, true)
		humanoid:AddAccessory(acc)
		return true
	elseif template:IsA("Shirt") or template:IsA("Pants") or template:IsA("ShirtGraphic") then
		local c = template:Clone()
		c:SetAttribute(ADDED_ATTR, true)
		c.Parent = char
		return true
	elseif template:IsA("Model") or template:IsA("Folder") then
		local anchor = b[MODEL_ANCHOR[item.Slot] or "Chest"] or b.Chest
		if not anchor then
			return false
		end
		local clone = template:Clone()
		local primary = (clone:IsA("Model") and clone.PrimaryPart) or clone:FindFirstChildWhichIsA("BasePart", true)
		if clone:IsA("Model") and primary then
			clone:PivotTo(anchor.CFrame)
		end
		local any = false
		for _, d in ipairs(clone:GetDescendants()) do
			if d:IsA("Shirt") or d:IsA("Pants") then
				local c = d:Clone()
				c:SetAttribute(ADDED_ATTR, true)
				c.Parent = char
				any = true
			elseif d:IsA("BasePart") then
				d.Anchored = false
				d.CanCollide = false
				d.CanTouch = false
				d.CanQuery = false
				d.Massless = true
				local w = Instance.new("WeldConstraint")
				w.Part0 = anchor
				w.Part1 = d
				w.Parent = d
				any = true
			end
		end
		clone.Parent = parent
		return any
	end
	return false
end

local function applyTemplates(char: Model, item): boolean
	local any = false
	local shirtId = tonumber(item.ShirtTemplate) or 0
	local pantsId = tonumber(item.PantsTemplate) or 0
	if shirtId ~= 0 and (item.Slot == "Shirt" or item.Slot == "Outfit") then
		local s = Instance.new("Shirt")
		s.Name = "SkylineShirt"
		s.ShirtTemplate = "rbxassetid://" .. tostring(shirtId)
		s:SetAttribute(ADDED_ATTR, true)
		s.Parent = char
		any = true
	end
	if pantsId ~= 0 and (item.Slot == "Pants" or item.Slot == "Outfit") then
		local p = Instance.new("Pants")
		p.Name = "SkylinePants"
		p.PantsTemplate = "rbxassetid://" .. tostring(pantsId)
		p:SetAttribute(ADDED_ATTR, true)
		p.Parent = char
		any = true
	end
	return any
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function ClothingFactory.Clear(char: Model)
	if not char then
		return
	end
	local f = char:FindFirstChild(FOLDER_NAME)
	if f then
		f:Destroy()
	end
	for _, d in ipairs(char:GetChildren()) do
		if d:GetAttribute(ADDED_ATTR) then
			d:Destroy()
		end
	end
	for _, d in ipairs(char:GetDescendants()) do
		if d:IsA("BasePart") then
			local orig = d:GetAttribute(ORIG_COLOR)
			if typeof(orig) == "Color3" then
				d.Color = orig
				d.Material = material(d:GetAttribute(ORIG_MAT), Enum.Material.Plastic)
				d:SetAttribute(ORIG_COLOR, nil)
				d:SetAttribute(ORIG_MAT, nil)
			end
		end
	end
	local list = hidden[char]
	if list then
		hidden[char] = nil
		for _, entry in ipairs(list) do
			local inst, parent = entry[1], entry[2]
			if parent and parent.Parent then
				inst.Parent = parent
			else
				inst.Parent = char
			end
		end
	end
end

function ClothingFactory.Apply(char: Model, items: { any })
	if not char or not char.Parent then
		return
	end
	local gen = (generation[char] or 0) + 1
	generation[char] = gen
	ClothingFactory.Clear(char)

	-- which avatar items to park
	local cover: { [string]: boolean } = {}
	for _, item in ipairs(items) do
		if item.Slot == "Outfit" then
			cover.Shirt = true
			cover.Pants = true
		elseif COVER_TYPES[item.Slot] then
			cover[item.Slot] = true
		end
	end
	hideCovering(char, cover)

	local b = body(char)
	for _, item in ipairs(items) do
		local done = false
		local template = assetTemplate(item)
		if not char.Parent or generation[char] ~= gen then
			return -- character died, or a newer Apply took over, while an asset was loading
		end
		if template then
			local holder = slotModel(char, item.Slot)
			local ok, res = pcall(applyAsset, char, b, item, template, holder)
			done = ok and res == true
			if not ok then
				warn("[ClothingFactory] asset apply failed for " .. item.Id .. ": " .. tostring(res))
			end
		end
		if not done then
			done = applyTemplates(char, item)
		end
		if not done then
			local builder = BUILDERS[item.Slot]
			if builder then
				local holder = slotModel(char, item.Slot)
				local ok, err = pcall(builder, char, b, item, holder)
				if not ok then
					warn("[ClothingFactory] build failed for " .. item.Id .. ": " .. tostring(err))
				end
			end
		end
	end
end

return ClothingFactory
