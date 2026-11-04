-- LookPreview: applies a tuning look to the player's car LOCALLY (client-only visuals) and reverts it.
-- Nothing here replicates — the server applies the real look via VehicleService:RefreshLook after Apply.
--
--   local lp = LookPreview.new(model)
--   lp.Apply(look)   look = { Paint = {Color={R,G,B}, Finish}, RimColor, Tint, Underglow, Spoiler, BodyKit, Plate }
--   lp.Revert()      restore every touched property and remove preview-only parts
--
-- Rig (ARCHITECTURE §9): paintable parts have attribute Paint=true, glass has Glass=true,
-- wheels live in Wheels/, underglow is Lights/Underglow (PointLight). Existing spoiler / body-kit parts
-- (anything named "Spoiler" or "BodyKit") are hidden with LocalTransparencyModifier while previewing.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tuning = require(Shared.Config.Tuning)

local LookPreview = {}

-- Shared car-look helper (vehicle subsystem). Optional: used so the tint preview matches what the server renders.
local Looks: any = nil
do
	local folder = Shared:FindFirstChild("Vehicle")
	local module = folder and folder:FindFirstChild("Looks")
	if module and module:IsA("ModuleScript") then
		local ok, m = pcall(require, module)
		if ok and type(m) == "table" then
			Looks = m
		end
	end
end

local function toColor(t: any): Color3?
	if typeof(t) == "Color3" then
		return t
	end
	if type(t) == "table" and type(t[1]) == "number" then
		return Color3.fromRGB(t[1], t[2] or 0, t[3] or 0)
	end
	return nil
end

local function material(name: string?): Enum.Material
	local ok, m = pcall(function()
		return (Enum.Material :: any)[name or "SmoothPlastic"]
	end)
	if ok and typeof(m) == "EnumItem" then
		return m
	end
	return Enum.Material.SmoothPlastic
end

function LookPreview.new(model: Model)
	local saved: { [Instance]: { [string]: any } } = {}
	local extras: { Instance } = {}
	local hidden: { [BasePart]: number } = {}

	local function remember(inst: Instance, prop: string)
		local s = saved[inst]
		if not s then
			s = {}
			saved[inst] = s
		end
		if s[prop] == nil then
			s[prop] = (inst :: any)[prop]
		end
	end

	local function set(inst: Instance, prop: string, value: any)
		remember(inst, prop)
		(inst :: any)[prop] = value
	end

	local function original(inst: Instance, prop: string): any
		local s = saved[inst]
		if s and s[prop] ~= nil then
			return s[prop]
		end
		return (inst :: any)[prop]
	end

	local function clearExtras()
		for _, e in ipairs(extras) do
			e:Destroy()
		end
		table.clear(extras)
		for part, ltm in pairs(hidden) do
			if part.Parent then
				part.LocalTransparencyModifier = ltm
			end
		end
		table.clear(hidden)
	end

	local function chassis(): BasePart?
		local c = model.PrimaryPart or model:FindFirstChild("Chassis")
		if c and c:IsA("BasePart") then
			return c
		end
		return nil
	end

	-- size of the body in chassis space
	local function bodyExtents(): (CFrame, Vector3)
		local root = chassis()
		local body = model:FindFirstChild("Body")
		local cf, size
		local ok = pcall(function()
			if body and body:IsA("Model") then
				cf, size = body:GetBoundingBox()
			else
				cf, size = model:GetBoundingBox()
			end
		end)
		if not ok or not cf then
			cf, size = model:GetPivot(), Vector3.new(7, 4, 15)
		end
		if root then
			-- re-express around the chassis orientation
			local rel = root.CFrame:ToObjectSpace(cf)
			return root.CFrame * CFrame.new(rel.Position), size
		end
		return cf, size
	end

	local function extraPart(name: string, size: Vector3, cf: CFrame, color: Color3, mat: Enum.Material?): Part?
		local root = chassis()
		if not root then
			return nil
		end
		local p = Instance.new("Part")
		p.Name = "Preview_" .. name
		p.Size = size
		p.CFrame = cf
		p.Color = color
		p.Material = mat or Enum.Material.SmoothPlastic
		p.Anchored = false
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.Massless = true
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = root
		weld.Part1 = p
		weld.Parent = p
		p.Parent = model
		table.insert(extras, p)
		return p
	end

	local function hideNamed(name: string)
		for _, d in ipairs(model:GetDescendants()) do
			if d.Name == name or (d.Parent and d.Parent.Name == name) or d:FindFirstAncestor(name) then
				if d:IsA("BasePart") and not d.Name:find("^Preview_") then
					if hidden[d] == nil then
						hidden[d] = d.LocalTransparencyModifier
					end
					d.LocalTransparencyModifier = 1
				end
			end
		end
	end

	local function buildSpoiler(id: string, color: Color3)
		if id == "None" then
			hideNamed("Spoiler")
			return
		end
		hideNamed("Spoiler")
		local cf, size = bodyExtents()
		local halfY, halfZ = size.Y / 2, size.Z / 2
		local rear = cf * CFrame.new(0, 0, halfZ)
		local dark = Color3.fromRGB(24, 24, 28)
		local w = size.X * 0.92
		if id == "Lip" then
			extraPart("Spoiler", Vector3.new(w * 0.9, 0.18, 0.7), rear * CFrame.new(0, halfY * 0.25, -0.5), color)
		elseif id == "Ducktail" then
			extraPart("Spoiler", Vector3.new(w * 0.9, 0.35, 1.3), rear * CFrame.new(0, halfY * 0.3, -0.7) * CFrame.Angles(math.rad(-12), 0, 0), color)
		elseif id == "GT" then
			for _, x in ipairs({ -w * 0.3, w * 0.3 }) do
				extraPart("SpoilerPost", Vector3.new(0.25, 1.4, 0.5), rear * CFrame.new(x, halfY * 0.25 + 0.7, -0.9), dark)
			end
			extraPart("Spoiler", Vector3.new(w, 0.18, 1.6), rear * CFrame.new(0, halfY * 0.25 + 1.45, -0.8) * CFrame.Angles(math.rad(-8), 0, 0), dark)
			for _, x in ipairs({ -w / 2, w / 2 }) do
				extraPart("SpoilerEnd", Vector3.new(0.12, 0.6, 1.7), rear * CFrame.new(x, halfY * 0.25 + 1.45, -0.8), color)
			end
		elseif id == "SwanNeck" then
			for _, x in ipairs({ -w * 0.25, w * 0.25 }) do
				extraPart("SpoilerPost", Vector3.new(0.22, 1.8, 0.35), rear * CFrame.new(x, halfY * 0.25 + 1.2, -0.6) * CFrame.Angles(math.rad(20), 0, 0), dark)
			end
			extraPart("Spoiler", Vector3.new(w * 1.02, 0.16, 1.8), rear * CFrame.new(0, halfY * 0.25 + 2.05, -0.2) * CFrame.Angles(math.rad(-10), 0, 0), dark)
		end
	end

	local function buildKit(id: string, color: Color3)
		-- procedural cars keep their kit in Body/Kit, asset cars may use a "BodyKit" model
		hideNamed("BodyKit")
		hideNamed("Kit")
		if id == "Stock" then
			return
		end
		local cf, size = bodyExtents()
		local halfX, halfY, halfZ = size.X / 2, size.Y / 2, size.Z / 2
		local dark = Color3.fromRGB(24, 24, 28)
		local bottom = -halfY + 0.35
		if id == "Street" or id == "Track" then
			for _, s in ipairs({ -1, 1 }) do
				extraPart("KitSkirt", Vector3.new(0.35, 0.45, size.Z * 0.55), cf * CFrame.new(s * (halfX + 0.05), bottom, 0), color)
			end
			extraPart("KitFront", Vector3.new(size.X * 0.9, 0.4, 0.4), cf * CFrame.new(0, bottom, -halfZ - 0.1), color)
		end
		if id == "Track" then
			extraPart("KitSplitter", Vector3.new(size.X * 0.95, 0.12, 1.2), cf * CFrame.new(0, bottom - 0.25, -halfZ - 0.3), dark)
			extraPart("KitDiffuser", Vector3.new(size.X * 0.7, 0.3, 0.8), cf * CFrame.new(0, bottom - 0.1, halfZ + 0.2), dark)
		elseif id == "Widebody" then
			for _, s in ipairs({ -1, 1 }) do
				for _, z in ipairs({ -halfZ * 0.62, halfZ * 0.62 }) do
					extraPart("KitFlare", Vector3.new(0.7, 1.2, 3.4), cf * CFrame.new(s * (halfX + 0.25), bottom + 0.6, z), color)
				end
				extraPart("KitSkirt", Vector3.new(0.5, 0.5, size.Z * 0.4), cf * CFrame.new(s * (halfX + 0.2), bottom, 0), color)
			end
		elseif id == "Offroad" then
			extraPart("KitBullbar", Vector3.new(size.X * 0.8, 1.2, 0.35), cf * CFrame.new(0, bottom + 0.6, -halfZ - 0.35), dark, Enum.Material.Metal)
			extraPart("KitRack", Vector3.new(size.X * 0.75, 0.2, size.Z * 0.35), cf * CFrame.new(0, halfY + 0.35, -size.Z * 0.05), dark, Enum.Material.Metal)
			for _, s in ipairs({ -1, 1 }) do
				extraPart("KitStep", Vector3.new(0.6, 0.18, size.Z * 0.45), cf * CFrame.new(s * (halfX + 0.25), bottom - 0.1, 0), dark, Enum.Material.Metal)
			end
		end
	end

	local api = {}

	function api.Apply(look: { [string]: any })
		clearExtras()
		-- revert colours first so removed options go back to their originals
		for inst, props in pairs(saved) do
			if inst.Parent then
				for prop, value in pairs(props) do
					(inst :: any)[prop] = value
				end
			end
		end

		local paint = look.Paint
		local paintColor: Color3? = nil
		if type(paint) == "table" then
			paintColor = toColor(paint.Color)
			local row = Tuning.Finishes[paint.Finish or "Gloss"] or Tuning.Finishes.Gloss
			local mat = material(row.Material)
			for _, d in ipairs(model:GetDescendants()) do
				if d:IsA("BasePart") and d:GetAttribute("Paint") == true then
					if paintColor then
						set(d, "Color", paintColor)
					end
					set(d, "Material", mat)
					set(d, "Reflectance", row.Reflectance or 0)
				end
			end
		end
		if not paintColor then
			for _, d in ipairs(model:GetDescendants()) do
				if d:IsA("BasePart") and d:GetAttribute("Paint") == true then
					paintColor = d.Color
					break
				end
			end
		end
		paintColor = paintColor or Color3.fromRGB(200, 200, 205)

		if type(look.Tint) == "number" then
			local t = math.clamp(look.Tint, 0, 0.9)
			for _, d in ipairs(model:GetDescendants()) do
				if d:IsA("BasePart") and d:GetAttribute("Glass") == true then
					local ok, tr, col = false, nil, nil
					if Looks and type(Looks.Tint) == "function" then
						ok, tr, col = pcall(Looks.Tint, t)
					end
					if ok and type(tr) == "number" and typeof(col) == "Color3" then
						set(d, "Transparency", tr)
						set(d, "Color", col)
					else
						local baseT = original(d, "Transparency")
						local baseC = original(d, "Color")
						set(d, "Transparency", baseT * (1 - t / 0.9 * 0.92))
						set(d, "Color", baseC:Lerp(Color3.new(0.03, 0.03, 0.04), t))
					end
				end
			end
		end

		local rimColor = toColor(look.RimColor)
		if rimColor then
			local wheels = model:FindFirstChild("Wheels")
			if wheels then
				for _, d in ipairs(wheels:GetDescendants()) do
					local n = d.Name:lower()
					local isRim = d:GetAttribute("Rim") == true or n:find("rim") ~= nil
					-- the dark wheel well and chrome bolts keep their colour (matches the server's rim recolour)
					if d:IsA("BasePart") and isRim and not n:find("well") and not n:find("bolt") then
						set(d, "Color", rimColor)
					end
				end
			end
		end

		if look.Underglow ~= nil then
			local lights = model:FindFirstChild("Lights")
			local glow = lights and lights:FindFirstChild("Underglow", true)
			local light: Light? = nil
			if glow and glow:IsA("Light") then
				light = glow
			elseif glow then
				light = glow:FindFirstChildWhichIsA("Light", true)
			end
			local color = toColor(look.Underglow)
			if light then
				set(light, "Enabled", color ~= nil)
				if color then
					set(light, "Color", color)
				end
			elseif color then
				local root = chassis()
				if root then
					local att = Instance.new("Attachment")
					att.Name = "Preview_Underglow"
					att.Position = Vector3.new(0, -root.Size.Y / 2 - 0.5, 0)
					local pl = Instance.new("PointLight")
					pl.Color = color
					pl.Range = 14
					pl.Brightness = 3
					pl.Shadows = false
					pl.Parent = att
					att.Parent = root
					table.insert(extras, att)
				end
			end
		end

		if type(look.Spoiler) == "string" then
			buildSpoiler(look.Spoiler, paintColor)
		end
		if type(look.BodyKit) == "string" then
			buildKit(look.BodyKit, paintColor)
		end

		if type(look.Plate) == "string" then
			for _, d in ipairs(model:GetDescendants()) do
				if d:IsA("TextLabel") and (d.Name == "Plate" or d.Name == "PlateText") then
					set(d, "Text", look.Plate)
				end
			end
		end
	end

	function api.Revert()
		clearExtras()
		for inst, props in pairs(saved) do
			if inst.Parent then
				for prop, value in pairs(props) do
					pcall(function()
						(inst :: any)[prop] = value
					end)
				end
			end
		end
		table.clear(saved)
	end

	return api
end

return LookPreview
