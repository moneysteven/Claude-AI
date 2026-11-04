-- Displays: featured cars on DealershipDisplay pads (rotated every Config.Dealership.Displays.RotateMinutes).
--
-- Each pad gets an anchored showroom copy built by VehicleService:BuildDisplay(modelId, cframe, look).
-- If VehicleService is missing (or fails) we clone ServerStorage.Assets.Cars[modelId] or build a simple
-- greybox silhouette so the showroom never looks empty.
--
-- Display models carry attributes ModelId, DisplaySlot and the CollectionService tag "DealershipDisplayCar"
-- so clients can find them (StreamingEnabled-safe) for the catalog's 3D preview.
--
--   Displays.Init(deps)   deps = { OnView = function(player, modelId) }
--   Displays.Start()

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Format = require(Shared.Util.Format)
local World = require(Shared.Config.World)
local DealerCfg = require(Shared.Config.Dealership)

local Catalog = require(script.Parent.Catalog)
local Common = require(script.Parent.Common)

local D = DealerCfg.Displays
local DISPLAY_TAG = "DealershipDisplayCar"
local PROMPT_NAME = "DealershipViewPrompt"

local Displays = {}
Displays.Tag = DISPLAY_TAG

local onView: ((Player, string) -> ())? = nil
local folder: Folder? = nil
local current: { [BasePart]: { Model: Model?, ModelId: string } } = {}
local rng = Random.new()

local function getFolder(): Folder
	if folder and folder.Parent then
		return folder
	end
	local f = Workspace:FindFirstChild("DealershipDisplays")
	if not f then
		f = Instance.new("Folder")
		f.Name = "DealershipDisplays"
		f.Parent = Workspace
	end
	folder = f :: Folder
	return folder :: Folder
end

local function toColor(t: any): Color3
	if type(t) == "table" and type(t[1]) == "number" then
		return Color3.fromRGB(t[1], t[2] or 0, t[3] or 0)
	end
	return Color3.fromRGB(200, 200, 205)
end

-- Greybox car: body, cabin, glass, four wheels. Anchored, non-colliding except the base.
local function greybox(modelId: string, cf: CFrame, look: { [string]: any }): Model
	local def = Catalog.GetAnyCar(modelId) or {}
	local class = string.lower(tostring(def.Class or "sedan"))
	local length, width, height = 15, 7, 3.2
	if class:find("suv") or class:find("truck") or class:find("van") or class:find("offroad") or class:find("pickup") then
		length, width, height = 16, 7.6, 4.4
	elseif class:find("super") or class:find("hyper") or class:find("sport") then
		length, width, height = 15.5, 7.4, 2.6
	elseif class:find("compact") or class:find("hatch") or class:find("scooter") then
		length, width, height = 12.5, 6.6, 3.2
	end
	local paint = toColor(look.Paint and look.Paint.Color)

	local model = Instance.new("Model")
	model.Name = modelId

	local function part(name: string, size: Vector3, offset: CFrame, color: Color3, material: Enum.Material, props: { [string]: any }?)
		local p = Instance.new("Part")
		p.Name = name
		p.Size = size
		p.CFrame = cf * offset
		p.Color = color
		p.Material = material
		p.Anchored = true
		p.CanCollide = false
		p.CanQuery = true
		p.CanTouch = false
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		if props then
			for k, v in pairs(props) do
				(p :: any)[k] = v
			end
		end
		p.Parent = model
		return p
	end

	local wheelR = 1.25
	local bodyY = wheelR + height / 2 - 0.3
	local chassis = part("Chassis", Vector3.new(width, 0.6, length), CFrame.new(0, wheelR, 0), Color3.fromRGB(30, 30, 34), Enum.Material.SmoothPlastic, {
		Transparency = 1,
		CanCollide = true,
	})
	local body = part("Body", Vector3.new(width, height, length), CFrame.new(0, bodyY, 0), paint, Enum.Material.SmoothPlastic, {
		Reflectance = 0.1,
	})
	body:SetAttribute("Paint", true)
	local cabinH = height * 0.8
	local cabin = part(
		"Cabin",
		Vector3.new(width * 0.86, cabinH, length * 0.48),
		CFrame.new(0, bodyY + height / 2 + cabinH / 2 - 0.05, -length * 0.04),
		paint,
		Enum.Material.SmoothPlastic,
		{ Reflectance = 0.1 }
	)
	cabin:SetAttribute("Paint", true)
	local glass = part(
		"Glass",
		Vector3.new(width * 0.88, cabinH * 0.7, length * 0.5),
		CFrame.new(0, bodyY + height / 2 + cabinH * 0.45, -length * 0.04),
		Color3.fromRGB(40, 50, 60),
		Enum.Material.Glass,
		{ Transparency = 0.35 }
	)
	glass:SetAttribute("Glass", true)
	part("HeadlightL", Vector3.new(1.4, 0.6, 0.2), CFrame.new(-width / 2 + 1.1, bodyY + 0.4, -length / 2 - 0.05), Color3.fromRGB(255, 250, 230), Enum.Material.Neon)
	part("HeadlightR", Vector3.new(1.4, 0.6, 0.2), CFrame.new(width / 2 - 1.1, bodyY + 0.4, -length / 2 - 0.05), Color3.fromRGB(255, 250, 230), Enum.Material.Neon)
	part("TaillightL", Vector3.new(1.4, 0.5, 0.2), CFrame.new(-width / 2 + 1.1, bodyY + 0.5, length / 2 + 0.05), Color3.fromRGB(200, 20, 30), Enum.Material.Neon)
	part("TaillightR", Vector3.new(1.4, 0.5, 0.2), CFrame.new(width / 2 - 1.1, bodyY + 0.5, length / 2 + 0.05), Color3.fromRGB(200, 20, 30), Enum.Material.Neon)
	for _, w in ipairs({ { "FL", -1, -1 }, { "FR", 1, -1 }, { "RL", -1, 1 }, { "RR", 1, 1 } }) do
		-- cylinders extend along their X axis, which already points sideways in car space
		part(
			"Wheel" .. w[1],
			Vector3.new(1.1, wheelR * 2, wheelR * 2),
			CFrame.new(w[2] * (width / 2 - 0.3), wheelR, w[3] * (length / 2 - 2.6)),
			Color3.fromRGB(25, 25, 28),
			Enum.Material.SmoothPlastic,
			{ Shape = Enum.PartType.Cylinder }
		)
	end
	model.PrimaryPart = chassis
	return model
end

local function fallbackBuild(modelId: string, cf: CFrame, look: { [string]: any }): Model
	local assets = ServerStorage:FindFirstChild("Assets")
	local cars = assets and assets:FindFirstChild("Cars")
	local template = cars and cars:FindFirstChild(modelId)
	if template and template:IsA("Model") then
		local m = template:Clone()
		for _, d in ipairs(m:GetDescendants()) do
			if d:IsA("BasePart") then
				d.Anchored = true
			elseif d:IsA("Script") or d:IsA("LocalScript") then
				d:Destroy()
			end
		end
		local ok = pcall(function()
			local _, size = m:GetBoundingBox()
			m:PivotTo(cf * CFrame.new(0, size.Y / 2, 0))
		end)
		if not ok then
			m:PivotTo(cf)
		end
		return m
	end
	return greybox(modelId, cf, look)
end

local function buildDisplay(modelId: string, cf: CFrame, look: { [string]: any }): Model?
	local vs = Common.VehicleService()
	if vs and type(vs.BuildDisplay) == "function" then
		local ok, m = pcall(vs.BuildDisplay, vs, modelId, cf, look)
		if ok and typeof(m) == "Instance" and m:IsA("Model") then
			return m
		end
		if not ok then
			warn("[Dealership] BuildDisplay failed:", m)
		end
	end
	local ok, m = pcall(fallbackBuild, modelId, cf, look)
	if ok then
		return m
	end
	warn("[Dealership] fallback display failed:", m)
	return nil
end

local function padCFrame(pad: BasePart): CFrame
	-- top-centre of the pad, facing the pad's look vector (yaw only)
	local top = pad.CFrame * CFrame.new(0, pad.Size.Y / 2 + D.HeightOffset, 0)
	local look = pad.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 0.01 then
		flat = Vector3.new(0, 0, -1)
	end
	return CFrame.lookAt(top.Position, top.Position + flat.Unit)
end

local function pads(): { BasePart }
	local out = {}
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.DealershipDisplay)) do
		if inst:IsA("BasePart") and inst:IsDescendantOf(Workspace) then
			table.insert(out, inst)
		end
	end
	table.sort(out, function(a, b)
		local sa, sb = tonumber(a:GetAttribute("Slot")) or 0, tonumber(b:GetAttribute("Slot")) or 0
		if sa == sb then
			return a:GetFullName() < b:GetFullName()
		end
		return sa < sb
	end)
	return out
end

-- Pick distinct featured cars for `count` pads, leaning towards the pricier half.
local function pickCars(count: number): { string }
	local list = Catalog.List()
	if #list == 0 then
		return {}
	end
	local ids = {}
	for _, e in ipairs(list) do
		table.insert(ids, e.Id)
	end
	local half = math.max(1, math.floor(#ids / 2))
	local used = {}
	local out = {}
	for _ = 1, count do
		local pick: string? = nil
		for _attempt = 1, 12 do
			local idx
			if rng:NextNumber() < D.PreferExpensive then
				idx = rng:NextInteger(half, #ids)
			else
				idx = rng:NextInteger(1, #ids)
			end
			if not used[ids[idx]] then
				pick = ids[idx]
				break
			end
		end
		if not pick then
			-- fewer cars than pads: allow repeats
			pick = ids[rng:NextInteger(1, #ids)]
		end
		used[pick :: string] = true
		table.insert(out, pick :: string)
	end
	return out
end

local function randomLook(): { [string]: any }
	local swatch = DealerCfg.Colors[rng:NextInteger(1, #DealerCfg.Colors)]
	local finishes = { "Gloss", "Metallic", "Gloss" }
	return {
		Paint = { Color = table.clone(swatch.Color), Finish = finishes[rng:NextInteger(1, #finishes)] },
		Rims = "Stock",
		Tint = 0.35,
		BodyKit = "Stock",
		Spoiler = "None",
		Underglow = false,
		Plate = "SKY DEAL",
		Upgrades = { Engine = 0, Turbo = 0, Brakes = 0, Suspension = 0, Transmission = 0 },
	}
end

local function attachPrompt(pad: BasePart)
	local prompt = pad:FindFirstChild(PROMPT_NAME)
	if prompt then
		return prompt :: ProximityPrompt
	end
	local p = Instance.new("ProximityPrompt")
	p.Name = PROMPT_NAME
	p.ActionText = "View"
	p.ObjectText = "Featured car"
	p.KeyboardKeyCode = Enum.KeyCode.E
	p.GamepadKeyCode = Enum.KeyCode.ButtonX
	p.HoldDuration = DealerCfg.PromptHoldDuration
	p.MaxActivationDistance = DealerCfg.DisplayPromptDistance
	p.RequiresLineOfSight = false
	p.Style = Enum.ProximityPromptStyle.Default
	p.Triggered:Connect(function(player: Player)
		local entry = current[pad]
		if entry and onView then
			onView(player, entry.ModelId)
		end
	end)
	p.Parent = pad
	return p
end

local function setPad(pad: BasePart, modelId: string)
	local old = current[pad]
	if old and old.Model then
		old.Model:Destroy()
	end
	local look = randomLook()
	local model = buildDisplay(modelId, padCFrame(pad), look)
	if model then
		model.Name = "Display_" .. modelId
		model:SetAttribute("ModelId", modelId)
		model:SetAttribute("DisplaySlot", tonumber(pad:GetAttribute("Slot")) or 0)
		model:SetAttribute("IsDisplay", true)
		pcall(function()
			model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
		end)
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") then
				d.Anchored = true
			elseif d:IsA("VehicleSeat") or d:IsA("Seat") then
				d.Disabled = true
			end
		end
		if not model.Parent or not model:IsDescendantOf(Workspace) then
			model.Parent = getFolder()
		end
		CollectionService:AddTag(model, DISPLAY_TAG)
	end
	current[pad] = { Model = model, ModelId = modelId }
	local prompt = attachPrompt(pad)
	local def = Catalog.GetCar(modelId)
	if def then
		local brand = Catalog.GetBrand(def.Brand)
		prompt.ObjectText = ("%s %s · %s"):format(brand.Name, tostring(def.Name or modelId), Format.MoneyShort(Catalog.Price(def)))
	end
end

function Displays.Rotate()
	local list = pads()
	if #list == 0 then
		return
	end
	local picks = pickCars(#list)
	if #picks == 0 then
		return
	end
	for i, pad in ipairs(list) do
		local id = picks[i] or picks[1]
		local ok, err = pcall(setPad, pad, id)
		if not ok then
			warn("[Dealership] display pad failed:", err)
		end
		task.wait() -- spread instance creation across frames
	end
end

function Displays.CurrentModelIds(): { string }
	local out = {}
	for _, entry in pairs(current) do
		table.insert(out, entry.ModelId)
	end
	return out
end

function Displays.Init(deps)
	onView = deps.OnView
end

function Displays.Start()
	-- pads added later (streamed world builder, new showrooms) get a car on the next rotation,
	-- or immediately if a rotation already happened.
	CollectionService:GetInstanceAddedSignal(World.Tags.DealershipDisplay):Connect(function(inst)
		task.defer(function()
			if inst:IsA("BasePart") and not current[inst] then
				local picks = pickCars(1)
				if picks[1] then
					pcall(setPad, inst, picks[1])
				end
			end
		end)
	end)
	CollectionService:GetInstanceRemovedSignal(World.Tags.DealershipDisplay):Connect(function(inst)
		local entry = current[inst :: BasePart]
		if entry then
			if entry.Model then
				entry.Model:Destroy()
			end
			current[inst :: BasePart] = nil
		end
	end)
	task.spawn(function()
		task.wait(3) -- let VehicleService and the world builder finish
		while true do
			Displays.Rotate()
			task.wait(math.max(30, D.RotateMinutes * 60))
		end
	end)
end

return Displays
