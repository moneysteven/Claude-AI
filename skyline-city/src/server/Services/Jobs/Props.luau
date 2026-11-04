-- Props: greybox job props built from Parts (with ServerStorage.Assets overrides).
--
--   Props.Carry(character, kind) -> BasePart?      kind: "PizzaBox" | "Plank" | "Toolbox" | "Clipboard"
--   Props.NpcCar(cframe, color?, opts?) -> Model   anchored parked car (Assets.Cars.npc_car overrides)
--   Props.Fire(cframe) -> BasePart                 pooled fire (ParticleEmitters + light); Props.SetFire(part, 0..1); Props.ReleaseFire(part)
--   Props.SiteFrame(sitePart) -> Model             construction progress frame; Props.SetSiteProgress(model, 0..1)
--   Props.Pile(cframe) -> Model                    construction materials pile

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Pool = require(Shared.Util.Pool)
local Npc = require(script.Parent.Npc)

local Props = {}

local function part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	for k, v in pairs(props) do
		(p :: any)[k] = v
	end
	return p
end

local function asset(category: string, name: string): Instance?
	local assets = ServerStorage:FindFirstChild("Assets")
	local cat = assets and assets:FindFirstChild(category)
	return cat and cat:FindFirstChild(name)
end

---------------------------------------------------------------------------
-- Carried props (welded to the character, massless)
---------------------------------------------------------------------------
local CARRY = {
	PizzaBox = { Size = Vector3.new(2.2, 0.35, 2.2), Color = Color3.fromRGB(210, 170, 110), Offset = CFrame.new(0, -0.2, -1.4) },
	Plank = { Size = Vector3.new(0.5, 0.5, 6), Color = Color3.fromRGB(180, 140, 90), Offset = CFrame.new(1.1, 0.6, -0.6), Material = Enum.Material.Wood },
	Toolbox = { Size = Vector3.new(1.6, 1, 0.8), Color = Color3.fromRGB(200, 40, 40), Offset = CFrame.new(1.3, -1.1, 0) },
	Clipboard = { Size = Vector3.new(1, 1.3, 0.1), Color = Color3.fromRGB(150, 110, 70), Offset = CFrame.new(0.8, -0.3, -0.9) },
}

function Props.Carry(character: Model?, kind: string): BasePart?
	if not character then
		return nil
	end
	local torso = character:FindFirstChild("UpperTorso") or character:FindFirstChild("Torso")
	if not (torso and torso:IsA("BasePart")) then
		return nil
	end
	local def = CARRY[kind]
	if not def then
		return nil
	end
	local existing = character:FindFirstChild("JobCarry_" .. kind)
	if existing then
		existing:Destroy()
	end
	local custom = asset("Furniture", "Carry_" .. kind)
	local p: BasePart
	if custom and custom:IsA("BasePart") then
		p = custom:Clone()
	else
		p = part({ Size = def.Size, Color = def.Color, Material = def.Material or Enum.Material.SmoothPlastic })
		if kind == "PizzaBox" then
			local stripe = part({ Name = "Stripe", Size = Vector3.new(2.25, 0.05, 0.5), Color = Color3.fromRGB(200, 40, 40) })
			stripe.Anchored = false
			stripe.Massless = true
			stripe.CFrame = p.CFrame * CFrame.new(0, 0.18, 0)
			local sw = Instance.new("WeldConstraint")
			sw.Part0 = p
			sw.Part1 = stripe
			sw.Parent = stripe
			stripe.Parent = p
		end
	end
	p.Name = "JobCarry_" .. kind
	p.Anchored = false
	p.Massless = true
	p.CanCollide = false
	p.CFrame = torso.CFrame * def.Offset
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = torso
	weld.Part1 = p
	weld.Parent = p
	p.Parent = character
	return p
end

---------------------------------------------------------------------------
-- Parked NPC cars (greybox)
---------------------------------------------------------------------------
local CAR_COLORS = {
	Color3.fromRGB(200, 40, 40),
	Color3.fromRGB(40, 90, 200),
	Color3.fromRGB(240, 240, 240),
	Color3.fromRGB(30, 30, 35),
	Color3.fromRGB(150, 150, 160),
	Color3.fromRGB(60, 150, 80),
	Color3.fromRGB(230, 170, 40),
}
local rng = Random.new()

function Props.NpcCar(cf: CFrame, color: Color3?, opts: { [string]: any }?): Model
	local o = opts or {}
	local custom = asset("Cars", "npc_car")
	local m: Model
	if custom and custom:IsA("Model") then
		m = custom:Clone()
		for _, d in ipairs(m:GetDescendants()) do
			if d:IsA("BasePart") then
				d.Anchored = true
			end
		end
		m:PivotTo(cf * CFrame.new(0, 2.5, 0))
	else
		m = Instance.new("Model")
		m.Name = "NpcCar"
		local paint = color or CAR_COLORS[rng:NextInteger(1, #CAR_COLORS)]
		local body = part({ Name = "Body", Size = Vector3.new(6, 2, 13), Color = paint, CFrame = cf * CFrame.new(0, 2, 0), CanCollide = true, CanQuery = true })
		body.Material = Enum.Material.SmoothPlastic
		body.Parent = m
		part({ Name = "Cabin", Size = Vector3.new(5.4, 1.9, 6.5), Color = paint, CFrame = body.CFrame * CFrame.new(0, 1.9, 0.6), Parent = m })
		part({
			Name = "Glass",
			Size = Vector3.new(5.5, 1.5, 6.2),
			Color = Color3.fromRGB(60, 80, 100),
			Transparency = 0.35,
			Material = Enum.Material.Glass,
			CFrame = body.CFrame * CFrame.new(0, 2, 0.6),
			Parent = m,
		})
		for _, w in ipairs({ { -3, -4.2 }, { 3, -4.2 }, { -3, 4.2 }, { 3, 4.2 } }) do
			part({
				Name = "Wheel",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(1, 2.4, 2.4),
				Color = Color3.fromRGB(25, 25, 25),
				CFrame = cf * CFrame.new(w[1], 1.2, w[2]),
				Parent = m,
			})
		end
		part({ Name = "HeadL", Size = Vector3.new(1.2, 0.5, 0.2), Color = Color3.fromRGB(255, 250, 220), Material = Enum.Material.Neon, CFrame = body.CFrame * CFrame.new(-2, 0.3, -6.5), Parent = m })
		part({ Name = "HeadR", Size = Vector3.new(1.2, 0.5, 0.2), Color = Color3.fromRGB(255, 250, 220), Material = Enum.Material.Neon, CFrame = body.CFrame * CFrame.new(2, 0.3, -6.5), Parent = m })
		local hood = part({ Name = "Hood", Size = Vector3.new(5.6, 0.25, 3.6), Color = paint, CFrame = body.CFrame * CFrame.new(0, 1.1, -4.4), Parent = m })
		if o.HoodOpen then
			hood.CFrame = body.CFrame * CFrame.new(0, 2.5, -3.2) * CFrame.Angles(math.rad(55), 0, 0)
		end
		m.PrimaryPart = body
	end
	if o.Smoke then
		local anchor = m.PrimaryPart or m:FindFirstChildWhichIsA("BasePart")
		if anchor then
			local smoke = Instance.new("ParticleEmitter")
			smoke.Name = "Smoke"
			smoke.Texture = "rbxasset://textures/particles/smoke_main.dds"
			smoke.Color = ColorSequence.new(Color3.fromRGB(80, 80, 80))
			smoke.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 4) })
			smoke.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.4), NumberSequenceKeypoint.new(1, 1) })
			smoke.Lifetime = NumberRange.new(1.5, 2.5)
			smoke.Rate = 8
			smoke.Speed = NumberRange.new(2, 4)
			smoke.EmissionDirection = Enum.NormalId.Top
			smoke.Parent = anchor
		end
	end
	m.Parent = Npc.GetFolder()
	return m
end

---------------------------------------------------------------------------
-- Pooled fires
---------------------------------------------------------------------------
local function buildFire(): BasePart
	local p = part({ Name = "JobFire", Size = Vector3.new(4, 1, 4), Transparency = 1 })
	local flames = Instance.new("ParticleEmitter")
	flames.Name = "Flames"
	flames.Texture = "rbxasset://textures/particles/fire_main.dds"
	flames.LightEmission = 1
	flames.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 220, 90)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 120, 30)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(180, 40, 10)),
	})
	flames.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 3), NumberSequenceKeypoint.new(1, 0.5) })
	flames.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.1), NumberSequenceKeypoint.new(1, 1) })
	flames.Lifetime = NumberRange.new(0.6, 1.2)
	flames.Speed = NumberRange.new(5, 9)
	flames.Rate = 40
	flames.SpreadAngle = Vector2.new(15, 15)
	flames.EmissionDirection = Enum.NormalId.Top
	flames.Parent = p
	local smoke = Instance.new("ParticleEmitter")
	smoke.Name = "Smoke"
	smoke.Texture = "rbxasset://textures/particles/smoke_main.dds"
	smoke.Color = ColorSequence.new(Color3.fromRGB(60, 60, 60))
	smoke.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 2), NumberSequenceKeypoint.new(1, 7) })
	smoke.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 1) })
	smoke.Lifetime = NumberRange.new(2.5, 4)
	smoke.Speed = NumberRange.new(4, 7)
	smoke.Rate = 6
	smoke.EmissionDirection = Enum.NormalId.Top
	smoke.Parent = p
	local light = Instance.new("PointLight")
	light.Name = "Glow"
	light.Color = Color3.fromRGB(255, 140, 50)
	light.Range = 18
	light.Brightness = 3
	light.Parent = p
	return p
end

local firePool = Pool.new(buildFire, 4, 40)

function Props.Fire(cf: CFrame): BasePart
	local p = firePool:Get() :: BasePart
	p.CFrame = cf * CFrame.new(0, 0.5, 0)
	Props.SetFire(p, 1)
	p.Parent = Npc.GetFolder()
	return p
end

function Props.SetFire(p: BasePart, intensity: number)
	local i = math.clamp(intensity, 0, 1)
	local flames = p:FindFirstChild("Flames") :: ParticleEmitter?
	local smoke = p:FindFirstChild("Smoke") :: ParticleEmitter?
	local light = p:FindFirstChild("Glow") :: PointLight?
	if flames then
		flames.Enabled = i > 0
		flames.Rate = 10 + 40 * i
		flames.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1 + 3 * i), NumberSequenceKeypoint.new(1, 0.3) })
	end
	if smoke then
		smoke.Rate = 2 + 6 * i
	end
	if light then
		light.Enabled = i > 0
		light.Brightness = 1 + 3 * i
	end
	p:SetAttribute("Intensity", i)
end

function Props.ReleaseFire(p: BasePart?)
	if p then
		firePool:Release(p)
	end
end

---------------------------------------------------------------------------
-- Construction
---------------------------------------------------------------------------
function Props.SiteFrame(site: BasePart): Model
	local m = Instance.new("Model")
	m.Name = "SiteFrame"
	local top = site.CFrame * CFrame.new(0, site.Size.Y / 2, 0)
	local w = math.clamp(math.min(site.Size.X, site.Size.Z) * 0.7, 8, 30)
	local rise = part({
		Name = "Rise",
		Size = Vector3.new(w, 0.2, w),
		Color = Color3.fromRGB(190, 180, 160),
		Material = Enum.Material.Concrete,
		CFrame = top * CFrame.new(0, 0.1, 0),
		CanCollide = true,
		Parent = m,
	})
	rise:SetAttribute("BaseY", 0)
	for i, c in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
		part({
			Name = "Pole" .. i,
			Size = Vector3.new(0.6, 0.2, 0.6),
			Color = Color3.fromRGB(140, 140, 150),
			Material = Enum.Material.Metal,
			CFrame = top * CFrame.new(c[1] * (w / 2 + 1), 0.1, c[2] * (w / 2 + 1)),
			Parent = m,
		})
	end
	local gui = Instance.new("BillboardGui")
	gui.Name = "ProgressGui"
	gui.Size = UDim2.fromOffset(180, 40)
	gui.StudsOffsetWorldSpace = Vector3.new(0, 8, 0)
	gui.MaxDistance = 140
	gui.LightInfluence = 0
	gui.Parent = rise
	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = Color3.fromRGB(20, 20, 25)
	label.BackgroundTransparency = 0.3
	label.TextColor3 = Color3.fromRGB(255, 200, 60)
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.Text = "🏗️ 0%"
	label.Parent = gui
	m.PrimaryPart = rise
	m:SetAttribute("Width", w)
	m.Parent = Npc.GetFolder()
	m:SetAttribute("TopCFrame", top)
	return m
end

function Props.SetSiteProgress(m: Model, progress: number, maxHeight: number)
	local p = math.clamp(progress, 0, 1)
	local top = m:GetAttribute("TopCFrame")
	local w = m:GetAttribute("Width") or 12
	if typeof(top) ~= "CFrame" then
		return
	end
	local h = math.max(0.2, maxHeight * p)
	local rise = m:FindFirstChild("Rise")
	if rise and rise:IsA("BasePart") then
		rise.Size = Vector3.new(w, h, w)
		rise.CFrame = top * CFrame.new(0, h / 2, 0)
		rise.Transparency = 0.15
		local gui = rise:FindFirstChild("ProgressGui")
		local label = gui and gui:FindFirstChild("Text")
		if label and label:IsA("TextLabel") then
			label.Text = ("🏗️ %d%%"):format(math.floor(p * 100))
		end
		if gui and gui:IsA("BillboardGui") then
			gui.StudsOffsetWorldSpace = Vector3.new(0, h / 2 + 5, 0)
		end
	end
	for i, c in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
		local pole = m:FindFirstChild("Pole" .. i)
		if pole and pole:IsA("BasePart") then
			local ph = math.max(0.2, h + 3)
			pole.Size = Vector3.new(0.6, ph, 0.6)
			pole.CFrame = top * CFrame.new(c[1] * (w / 2 + 1), ph / 2, c[2] * (w / 2 + 1))
		end
	end
end

function Props.Pile(cf: CFrame): Model
	local custom = asset("Buildings", "MaterialsPile")
	if custom and custom:IsA("Model") then
		local c = custom:Clone()
		c:PivotTo(cf)
		c.Parent = Npc.GetFolder()
		return c
	end
	local m = Instance.new("Model")
	m.Name = "MaterialsPile"
	local pallet = part({ Name = "Pallet", Size = Vector3.new(6, 0.6, 6), Color = Color3.fromRGB(150, 110, 70), Material = Enum.Material.WoodPlanks, CFrame = cf * CFrame.new(0, 0.3, 0), CanCollide = true, Parent = m })
	for i = 0, 4 do
		part({
			Name = "Plank",
			Size = Vector3.new(5.6, 0.5, 0.9),
			Color = Color3.fromRGB(190, 150, 100),
			Material = Enum.Material.Wood,
			CFrame = pallet.CFrame * CFrame.new(0, 0.55 + (i % 3) * 0.5, -2 + i),
			Parent = m,
		})
	end
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(140, 34)
	gui.StudsOffsetWorldSpace = Vector3.new(0, 3.5, 0)
	gui.MaxDistance = 80
	gui.LightInfluence = 0
	gui.Parent = pallet
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 0.3
	label.BackgroundColor3 = Color3.fromRGB(20, 20, 25)
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.Text = "🪵 Materials"
	label.Parent = gui
	m.PrimaryPart = pallet
	m.Parent = Npc.GetFolder()
	return m
end

return Props
