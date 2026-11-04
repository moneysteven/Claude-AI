-- CarPreview: a spinning 3D preview of a car inside a ViewportFrame.
--   * clones a showroom display model (tag "DealershipDisplayCar", attribute ModelId) when one is streamed in
--   * otherwise builds a simple box silhouette sized by class
--   * recolours parts with attribute Paint = true (and applies the finish material) live
--
--   local p = CarPreview.new(parent, props?)
--   p.Show(modelId, class, color3, finishId)  p.SetPaint(color3, finishId)  p.Destroy()

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Tuning = require(Shared.Config.Tuning)

local Client = script:FindFirstAncestor("Client") :: Instance
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local CarPreview = {}

local DISPLAY_TAG = "DealershipDisplayCar"

local function findDisplay(modelId: string): Model?
	for _, inst in ipairs(CollectionService:GetTagged(DISPLAY_TAG)) do
		if inst:IsA("Model") and inst:GetAttribute("ModelId") == modelId and inst:IsDescendantOf(Workspace) then
			return inst
		end
	end
	return nil
end

local function finishProps(finish: string?): (Enum.Material, number)
	local row = finish and Tuning.Finishes[finish] or Tuning.Finishes.Gloss
	local mat = Enum.Material.SmoothPlastic
	local ok, m = pcall(function()
		return (Enum.Material :: any)[row.Material]
	end)
	if ok and typeof(m) == "EnumItem" then
		mat = m
	end
	return mat, row.Reflectance or 0
end

local function silhouette(class: string?): Model
	local c = string.lower(tostring(class or "sedan"))
	local length, width, height = 15, 7, 3.2
	if c:find("suv") or c:find("truck") or c:find("van") or c:find("offroad") or c:find("pickup") then
		length, width, height = 16, 7.6, 4.4
	elseif c:find("super") or c:find("hyper") or c:find("sport") then
		length, width, height = 15.5, 7.4, 2.6
	elseif c:find("compact") or c:find("hatch") or c:find("scooter") then
		length, width, height = 12.5, 6.6, 3.2
	end
	local model = Instance.new("Model")
	local function part(name, size, cf, color, material, extra)
		local p = Instance.new("Part")
		p.Name = name
		p.Size = size
		p.CFrame = cf
		p.Color = color
		p.Material = material
		p.Anchored = true
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		if extra then
			for k, v in pairs(extra) do
				(p :: any)[k] = v
			end
		end
		p.Parent = model
		return p
	end
	local wheelR = 1.25
	local bodyY = wheelR + height / 2 - 0.3
	local body = part("Body", Vector3.new(width, height, length), CFrame.new(0, bodyY, 0), Color3.new(0.8, 0.8, 0.8), Enum.Material.SmoothPlastic)
	body:SetAttribute("Paint", true)
	local cabinH = height * 0.8
	local cabin = part(
		"Cabin",
		Vector3.new(width * 0.86, cabinH, length * 0.48),
		CFrame.new(0, bodyY + height / 2 + cabinH / 2 - 0.05, -length * 0.04),
		Color3.new(0.8, 0.8, 0.8),
		Enum.Material.SmoothPlastic
	)
	cabin:SetAttribute("Paint", true)
	part(
		"Glass",
		Vector3.new(width * 0.88, cabinH * 0.7, length * 0.5),
		CFrame.new(0, bodyY + height / 2 + cabinH * 0.45, -length * 0.04),
		Color3.fromRGB(40, 50, 60),
		Enum.Material.Glass,
		{ Transparency = 0.3 }
	)
	part("LightL", Vector3.new(1.4, 0.6, 0.2), CFrame.new(-width / 2 + 1.1, bodyY + 0.4, -length / 2 - 0.05), Color3.fromRGB(255, 250, 230), Enum.Material.Neon)
	part("LightR", Vector3.new(1.4, 0.6, 0.2), CFrame.new(width / 2 - 1.1, bodyY + 0.4, -length / 2 - 0.05), Color3.fromRGB(255, 250, 230), Enum.Material.Neon)
	part("TailL", Vector3.new(1.4, 0.5, 0.2), CFrame.new(-width / 2 + 1.1, bodyY + 0.5, length / 2 + 0.05), Color3.fromRGB(200, 20, 30), Enum.Material.Neon)
	part("TailR", Vector3.new(1.4, 0.5, 0.2), CFrame.new(width / 2 - 1.1, bodyY + 0.5, length / 2 + 0.05), Color3.fromRGB(200, 20, 30), Enum.Material.Neon)
	for _, w in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
		part(
			"Wheel",
			Vector3.new(1.1, wheelR * 2, wheelR * 2),
			CFrame.new(w[1] * (width / 2 - 0.3), wheelR, w[2] * (length / 2 - 2.6)),
			Color3.fromRGB(25, 25, 28),
			Enum.Material.SmoothPlastic,
			{ Shape = Enum.PartType.Cylinder }
		)
	end
	return model
end

-- Clones keep CollectionService tags: strip them BEFORE parenting so the preview copy is never picked up as a
-- real car / showroom car by other controllers (turntable, car visuals, our own findDisplay).
local function stripTags(inst: Instance)
	for _, tag in ipairs(CollectionService:GetTags(inst)) do
		CollectionService:RemoveTag(inst, tag)
	end
end

local function sanitize(model: Model)
	stripTags(model)
	model:SetAttribute("CarUid", nil)
	model:SetAttribute("IsDisplay", nil)
	for _, d in ipairs(model:GetDescendants()) do
		stripTags(d)
		if d:IsA("BaseScript") or d:IsA("ProximityPrompt") or d:IsA("Sound") or d:IsA("ParticleEmitter") or d:IsA("BillboardGui") or d:IsA("Light") then
			d:Destroy()
		elseif d:IsA("BasePart") then
			d.Anchored = true
		end
	end
end

function CarPreview.new(parent: Instance, props: { [string]: any }?)
	local base = {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Colors.Background,
		Ambient = Color3.fromRGB(170, 170, 185),
		LightColor = Color3.fromRGB(255, 255, 250),
		LightDirection = Vector3.new(-0.6, -1, -0.4),
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local vpf = Kit.new("ViewportFrame", base)
	Kit.Corner(vpf, Theme.CornerSmall)
	local cam = Instance.new("Camera")
	cam.FieldOfView = 40
	cam.Parent = vpf
	vpf.CurrentCamera = cam
	local world = Instance.new("WorldModel")
	world.Parent = vpf

	local hint = Kit.Label("Drag to rotate", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -6),
		Size = UDim2.new(1, 0, 0, 16),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = 12,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		Parent = vpf,
	})
	hint.ZIndex = 2

	local model: Model? = nil
	local center = Vector3.zero
	local radius = 12
	local yaw = math.rad(35)
	local dragging = false
	local lastX = 0
	local idleSpin = true
	local conns: { RBXScriptConnection } = {}

	local function frameCamera()
		local pitch = math.rad(18)
		local dist = radius / math.tan(math.rad(cam.FieldOfView / 2)) * 0.9
		local offset = CFrame.Angles(0, yaw, 0) * CFrame.Angles(-pitch, 0, 0) * Vector3.new(0, 0, dist)
		cam.CFrame = CFrame.lookAt(center + offset, center)
	end

	local api = { Frame = vpf }

	function api.SetPaint(color: Color3, finish: string?)
		if not model then
			return
		end
		local mat, refl = finishProps(finish)
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") and d:GetAttribute("Paint") == true then
				d.Color = color
				d.Material = mat
				d.Reflectance = refl
			end
		end
	end

	function api.Show(modelId: string, class: string?, color: Color3?, finish: string?)
		if model then
			model:Destroy()
			model = nil
		end
		local source = findDisplay(modelId)
		local m: Model
		if source then
			local ok, clone = pcall(function()
				local wasArchivable = source.Archivable
				source.Archivable = true
				local c = source:Clone()
				source.Archivable = wasArchivable
				return c
			end)
			if ok and clone then
				m = clone
				sanitize(m)
				m:PivotTo(CFrame.new())
			else
				m = silhouette(class)
			end
		else
			m = silhouette(class)
		end
		m.Parent = world
		model = m
		local ok, cf, size = pcall(function()
			return m:GetBoundingBox()
		end)
		if ok then
			center = cf.Position
			radius = math.max(size.X, size.Z, size.Y) * 0.62
		else
			center = Vector3.new(0, 2, 0)
			radius = 10
		end
		if color then
			api.SetPaint(color, finish)
		end
		frameCamera()
	end

	table.insert(conns, vpf.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			dragging = true
			idleSpin = false
			lastX = input.Position.X
		end
	end))
	table.insert(conns, UserInputService.InputChanged:Connect(function(input)
		if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
			local dx = input.Position.X - lastX
			lastX = input.Position.X
			yaw -= dx * 0.012
			frameCamera()
		end
	end))
	table.insert(conns, UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			if dragging then
				dragging = false
				task.delay(3, function()
					if not dragging then
						idleSpin = true
					end
				end)
			end
		end
	end))
	table.insert(conns, RunService.RenderStepped:Connect(function(dt)
		if idleSpin and model and vpf.Visible then
			yaw += dt * 0.35
			frameCamera()
		end
	end))

	function api.Destroy()
		for _, c in ipairs(conns) do
			c:Disconnect()
		end
		table.clear(conns)
		vpf:Destroy()
	end

	return api
end

return CarPreview
