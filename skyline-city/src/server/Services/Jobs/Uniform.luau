-- Uniform: a simple, removable job uniform.
--   * ServerStorage.Assets.Clothing.Uniform_<JobId> (Accessory or Model of welded parts) if present
--   * else Shirt/Pants templates from Config.Jobs (if set)
--   * plus a greybox vest + cap in the job colours (always works, no assets needed)
-- Original clothing is hidden (parented to nil) and restored on Remove.
--
--   Uniform.Apply(character, jobId, cfg)
--   Uniform.Remove(character)

local ServerStorage = game:GetService("ServerStorage")

local Uniform = {}

local saved: { [Model]: { Instance } } = {}

local function weldPart(props: { [string]: any }, to: BasePart, offset: CFrame, parent: Instance): Part
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
	p.CFrame = to.CFrame * offset
	local w = Instance.new("WeldConstraint")
	w.Part0 = to
	w.Part1 = p
	w.Parent = p
	p.Parent = parent
	return p
end

function Uniform.Remove(character: Model?)
	if not character then
		return
	end
	local folder = character:FindFirstChild("JobUniform")
	if folder then
		folder:Destroy()
	end
	for _, name in ipairs({ "JobShirt", "JobPants" }) do
		local c = character:FindFirstChild(name)
		if c then
			c:Destroy()
		end
	end
	local list = saved[character]
	saved[character] = nil
	if list then
		for _, inst in ipairs(list) do
			if character.Parent then
				inst.Parent = character
			end
		end
	end
end

function Uniform.Apply(character: Model?, jobId: string, cfg: { [string]: any })
	if not character then
		return
	end
	Uniform.Remove(character)
	local torso = character:FindFirstChild("UpperTorso") or character:FindFirstChild("Torso")
	local head = character:FindFirstChild("Head")
	if not (torso and torso:IsA("BasePart")) then
		return
	end

	local folder = Instance.new("Folder")
	folder.Name = "JobUniform"
	folder.Parent = character

	-- Clothing templates (optional)
	local hidden = {}
	if type(cfg.ShirtTemplate) == "string" and cfg.ShirtTemplate ~= "" then
		local old = character:FindFirstChildOfClass("Shirt")
		if old then
			old.Parent = nil
			table.insert(hidden, old)
		end
		local shirt = Instance.new("Shirt")
		shirt.Name = "JobShirt"
		shirt.ShirtTemplate = cfg.ShirtTemplate
		shirt.Parent = character
	end
	if type(cfg.PantsTemplate) == "string" and cfg.PantsTemplate ~= "" then
		local old = character:FindFirstChildOfClass("Pants")
		if old then
			old.Parent = nil
			table.insert(hidden, old)
		end
		local pants = Instance.new("Pants")
		pants.Name = "JobPants"
		pants.PantsTemplate = cfg.PantsTemplate
		pants.Parent = character
	end
	saved[character] = hidden

	-- Custom uniform asset
	local assets = ServerStorage:FindFirstChild("Assets")
	local clothing = assets and assets:FindFirstChild("Clothing")
	local custom = clothing and clothing:FindFirstChild("Uniform_" .. jobId)
	if custom then
		local c = custom:Clone()
		if c:IsA("Accessory") then
			local hum = character:FindFirstChildOfClass("Humanoid")
			if hum then
				hum:AddAccessory(c)
			else
				c.Parent = character
			end
			-- keep a reference inside the folder so Remove cleans it up
			local ref = Instance.new("ObjectValue")
			ref.Name = "AccessoryRef"
			ref.Value = c
			ref.Parent = folder
			folder.Destroying:Connect(function()
				if c.Parent then
					c:Destroy()
				end
			end)
			return
		elseif c:IsA("Model") or c:IsA("BasePart") then
			-- a model (or single part) authored around the torso: pivot it onto the torso and weld every part
			if c:IsA("Model") then
				c:PivotTo(torso.CFrame)
			else
				(c :: BasePart).CFrame = torso.CFrame
			end
			local list = c:IsA("BasePart") and { c } or {}
			for _, d in ipairs(c:GetDescendants()) do
				if d:IsA("BasePart") then
					table.insert(list, d)
				end
			end
			for _, p in ipairs(list) do
				local bp = p :: BasePart
				bp.Anchored = false
				bp.CanCollide = false
				bp.CanTouch = false
				bp.CanQuery = false
				bp.Massless = true
				local w = Instance.new("WeldConstraint")
				w.Part0 = torso
				w.Part1 = bp
				w.Parent = bp
			end
			c.Parent = folder
			return
		end
		c:Destroy()
	end

	-- Greybox vest + badge + cap
	local color: Color3 = cfg.UniformColor or Color3.fromRGB(80, 80, 90)
	local accent: Color3 = cfg.UniformAccent or Color3.new(1, 1, 1)
	local ts = torso.Size
	weldPart({ Name = "Vest", Size = Vector3.new(ts.X + 0.12, ts.Y * 0.92, ts.Z + 0.12), Color = color }, torso, CFrame.new(0, -ts.Y * 0.04, 0), folder)
	weldPart({ Name = "Badge", Size = Vector3.new(0.45, 0.45, 0.06), Color = accent, Material = Enum.Material.Neon }, torso, CFrame.new(-ts.X * 0.25, ts.Y * 0.2, -(ts.Z / 2 + 0.09)), folder)
	weldPart({ Name = "Stripe", Size = Vector3.new(ts.X + 0.16, 0.18, ts.Z + 0.16), Color = accent }, torso, CFrame.new(0, -ts.Y * 0.18, 0), folder)
	if head and head:IsA("BasePart") then
		local hs = head.Size
		local capY = hs.Y * 0.42
		weldPart({ Name = "Cap", Shape = Enum.PartType.Cylinder, Size = Vector3.new(hs.Y * 0.35, hs.X * 1.02, hs.X * 1.02), Color = color }, head, CFrame.new(0, capY, 0) * CFrame.Angles(0, 0, math.rad(90)), folder)
		weldPart({ Name = "Brim", Size = Vector3.new(hs.X * 0.9, 0.08, hs.Z * 0.45), Color = accent }, head, CFrame.new(0, capY - hs.Y * 0.12, -hs.Z * 0.62), folder)
	end
end

return Uniform
