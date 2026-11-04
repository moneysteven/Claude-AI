-- Cosmetics: consumable, purely visual developer-product effects (no money, no stats).
--
--   Cosmetics.Fireworks(player)   ~25 s fireworks show above the player, visible to the whole server
--   Cosmetics.Party(player)       confetti bursts + glowing party aura + disco light for N minutes (survives respawn)
--   Cosmetics.Run(effectName, player) -> boolean
--
-- Everything is event-driven (task.delay + TweenService); no per-frame server loops.

local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config.Monetization)

local MonUtil = require(script.Parent.MonUtil)

local Cosmetics = {}

local FX = Config.Effects
local rng = Random.new()

local PALETTE = {
	Color3.fromRGB(255, 80, 90),
	Color3.fromRGB(255, 196, 40),
	Color3.fromRGB(80, 220, 120),
	Color3.fromRGB(64, 156, 255),
	Color3.fromRGB(190, 110, 255),
	Color3.fromRGB(255, 120, 200),
	Color3.fromRGB(255, 255, 255),
}

local partyUntil: { [Player]: number } = {}
local partyConn: { [Player]: RBXScriptConnection } = {}

local function effectsFolder(): Folder
	local f = Workspace:FindFirstChild("SkylineEffects")
	if not f then
		f = Instance.new("Folder")
		f.Name = "SkylineEffects"
		f.Parent = Workspace
	end
	return f :: Folder
end

local function randomColor(): Color3
	return PALETTE[rng:NextInteger(1, #PALETTE)]
end

---------------------------------------------------------------------------
-- Fireworks
---------------------------------------------------------------------------
local function burst(position: Vector3, color: Color3)
	local holder = Instance.new("Part")
	holder.Name = "FireworkBurst"
	holder.Anchored = true
	holder.CanCollide = false
	holder.CanQuery = false
	holder.CanTouch = false
	holder.Transparency = 1
	holder.Size = Vector3.new(1, 1, 1)
	holder.Position = position
	holder.Parent = effectsFolder()

	local second = rng:NextNumber() < 0.5 and randomColor() or color
	local emitter = Instance.new("ParticleEmitter")
	emitter.Rate = 0
	emitter.Speed = NumberRange.new(28, 42)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.Lifetime = NumberRange.new(1.2, 2.1)
	emitter.Drag = 2.5
	emitter.Acceleration = Vector3.new(0, -12, 0)
	emitter.LightEmission = 1
	emitter.LightInfluence = 0
	emitter.Color = ColorSequence.new(color, second)
	emitter.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1.4),
		NumberSequenceKeypoint.new(0.7, 0.9),
		NumberSequenceKeypoint.new(1, 0),
	})
	emitter.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0),
		NumberSequenceKeypoint.new(0.8, 0.2),
		NumberSequenceKeypoint.new(1, 1),
	})
	emitter.Parent = holder
	emitter:Emit(140)

	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = 60
	light.Brightness = 6
	light.Shadows = false
	light.Parent = holder
	TweenService:Create(light, TweenInfo.new(1.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Brightness = 0 }):Play()

	Debris:AddItem(holder, 3)
end

local function launch(origin: Vector3)
	local height = rng:NextNumber(FX.Fireworks.Height[1], FX.Fireworks.Height[2])
	local color = randomColor()
	local rocket = Instance.new("Part")
	rocket.Name = "FireworkRocket"
	rocket.Anchored = true
	rocket.CanCollide = false
	rocket.CanQuery = false
	rocket.CanTouch = false
	rocket.Material = Enum.Material.Neon
	rocket.Color = color
	rocket.Size = Vector3.new(0.35, 1.2, 0.35)
	rocket.CFrame = CFrame.new(origin)

	local a0 = Instance.new("Attachment")
	a0.Position = Vector3.new(0, -0.5, 0)
	a0.Parent = rocket
	local a1 = Instance.new("Attachment")
	a1.Position = Vector3.new(0, 0.5, 0)
	a1.Parent = rocket
	local trail = Instance.new("Trail")
	trail.Attachment0 = a0
	trail.Attachment1 = a1
	trail.Lifetime = 0.45
	trail.LightEmission = 1
	trail.Color = ColorSequence.new(Color3.fromRGB(255, 230, 160), color)
	trail.Transparency = NumberSequence.new(0, 1)
	trail.Parent = rocket
	rocket.Parent = effectsFolder()

	local target = origin + Vector3.new(rng:NextNumber(-4, 4), height, rng:NextNumber(-4, 4))
	local flight = TweenService:Create(
		rocket,
		TweenInfo.new(1.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{ CFrame = CFrame.new(target) }
	)
	flight.Completed:Connect(function()
		rocket.Transparency = 1
		burst(target, color)
		Debris:AddItem(rocket, 0.6)
	end)
	flight:Play()
end

-- a purchase can complete while the buyer is respawning: wait (bounded) for a character so the show isn't lost
local function waitForRoot(player: Player, timeout: number): BasePart?
	local t = 0
	local root = MonUtil.Root(player)
	while not root and t < timeout and player.Parent == Players do
		task.wait(0.5)
		t += 0.5
		root = MonUtil.Root(player)
	end
	return root
end

function Cosmetics.Fireworks(player: Player)
	local root = waitForRoot(player, 20)
	local center = root and root.Position or nil
	if not center then
		return
	end
	local cfg = FX.Fireworks
	local spread = cfg.Spread
	for i = 1, cfg.Rockets do
		local at = (i - 1) * (cfg.Duration / cfg.Rockets) + rng:NextNumber(0, 0.6)
		task.delay(at, function()
			if player.Parent ~= Players then
				return
			end
			-- follow the player loosely so the show stays overhead if they walk around
			local r = MonUtil.Root(player)
			local base = (r and r.Position or center) :: Vector3
			launch(base + Vector3.new(rng:NextNumber(-spread, spread) * 0.5, 2, rng:NextNumber(-spread, spread) * 0.5))
		end)
	end
	-- grand finale: 6 at once
	task.delay(cfg.Duration + 0.8, function()
		local r = MonUtil.Root(player)
		if player.Parent ~= Players or not r then
			return
		end
		for _ = 1, 6 do
			launch(r.Position + Vector3.new(rng:NextNumber(-spread, spread) * 0.4, 2, rng:NextNumber(-spread, spread) * 0.4))
		end
	end)
end

---------------------------------------------------------------------------
-- Party pack
---------------------------------------------------------------------------
local function confetti(root: BasePart)
	local att = Instance.new("Attachment")
	att.Name = "SkylineConfetti"
	att.Position = Vector3.new(0, 2.5, 0)
	att.Parent = root
	local emitter = Instance.new("ParticleEmitter")
	emitter.Rate = 0
	emitter.Speed = NumberRange.new(18, 30)
	emitter.SpreadAngle = Vector2.new(60, 60)
	emitter.EmissionDirection = Enum.NormalId.Top
	emitter.Lifetime = NumberRange.new(2, 3.2)
	emitter.Acceleration = Vector3.new(0, -30, 0)
	emitter.Drag = 1.5
	emitter.RotSpeed = NumberRange.new(-260, 260)
	emitter.Rotation = NumberRange.new(0, 360)
	emitter.Size = NumberSequence.new(0.35)
	emitter.LightInfluence = 0.4
	emitter.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, PALETTE[1]),
		ColorSequenceKeypoint.new(0.25, PALETTE[2]),
		ColorSequenceKeypoint.new(0.5, PALETTE[3]),
		ColorSequenceKeypoint.new(0.75, PALETTE[4]),
		ColorSequenceKeypoint.new(1, PALETTE[6]),
	})
	emitter.Parent = att
	emitter:Emit(160)
	Debris:AddItem(att, 4)
end

local function applyAura(player: Player)
	local root = MonUtil.Root(player)
	local untilT = partyUntil[player]
	if not root or not untilT then
		return
	end
	local remaining = untilT - os.time()
	if remaining <= 0 then
		return
	end
	local old = root:FindFirstChild("SkylinePartyAura")
	if old then
		old:Destroy()
	end
	local att = Instance.new("Attachment")
	att.Name = "SkylinePartyAura"
	att.Parent = root

	local sparkle = Instance.new("ParticleEmitter")
	sparkle.Rate = 8
	sparkle.Speed = NumberRange.new(1, 3)
	sparkle.SpreadAngle = Vector2.new(180, 180)
	sparkle.Lifetime = NumberRange.new(1, 1.8)
	sparkle.LightEmission = 1
	sparkle.LightInfluence = 0
	sparkle.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.5),
		NumberSequenceKeypoint.new(1, 0),
	})
	sparkle.Color = ColorSequence.new(PALETTE[2], PALETTE[5])
	sparkle.Parent = att

	local light = Instance.new("PointLight")
	light.Range = 16
	light.Brightness = 2.5
	light.Shadows = false
	light.Color = PALETTE[5]
	light.Parent = att
	-- disco colour loop (TweenService handles it; no server loop)
	TweenService:Create(
		light,
		TweenInfo.new(0.8, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ Color = PALETTE[4] }
	):Play()

	task.delay(remaining, function()
		if att.Parent then
			att:Destroy()
		end
	end)
end

function Cosmetics.Party(player: Player)
	local minutes = FX.Party.AuraMinutes
	partyUntil[player] = math.max(partyUntil[player] or 0, os.time()) + minutes * 60
	local root = MonUtil.Root(player)
	if root then
		for i = 1, FX.Party.ConfettiBursts do
			task.delay((i - 1) * 0.7, function()
				local r = MonUtil.Root(player)
				if r then
					confetti(r)
				end
			end)
		end
	end
	applyAura(player)
	if not partyConn[player] then
		partyConn[player] = player.CharacterAdded:Connect(function(char)
			char:WaitForChild("HumanoidRootPart", 10)
			if partyUntil[player] and partyUntil[player] > os.time() then
				applyAura(player)
			end
		end)
	end
end

local RUNNERS = {
	Fireworks = Cosmetics.Fireworks,
	Party = Cosmetics.Party,
}

function Cosmetics.Run(effect: string, player: Player): boolean
	local fn = RUNNERS[effect]
	if not fn then
		warn("[Cosmetics] unknown effect " .. tostring(effect))
		return false
	end
	local ok, err = pcall(fn, player)
	if not ok then
		warn("[Cosmetics] effect failed:", err)
	end
	return ok
end

Players.PlayerRemoving:Connect(function(player)
	partyUntil[player] = nil
	local c = partyConn[player]
	if c then
		c:Disconnect()
		partyConn[player] = nil
	end
end)

return Cosmetics
