-- SKYLINE CITY — loading screen (ReplicatedFirst).
-- Animated night skyline + logo, real progress (game:IsLoaded / ContentProvider queue / saved data / character /
-- city ready), rotating tips, a skip button if loading takes long, then a smooth fade out.
-- Self-contained on purpose: nothing from ReplicatedStorage is required (it may not be replicated yet).

local ContentProvider = game:GetService("ContentProvider")
local Players = game:GetService("Players")
local ReplicatedFirst = game:GetService("ReplicatedFirst")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local DATA_TIMEOUT = 45
local CHARACTER_TIMEOUT = 20
local CITY_TIMEOUT = 15
local SKIP_AFTER = 14
local TIP_SECONDS = 4

local TIPS = {
	"💼 Clock in at any job station — every job levels up and pays more over time.",
	"🏦 Deposit cash at an ATM or the bank. Savings earn interest while you play!",
	"📱 Your phone has a map with GPS: tap a place and set a waypoint.",
	"🏠 Rent a studio, then work your way up to a beach villa or a Sky Apartment.",
	"🚗 Test-drive any car at Skyline Motors before you buy it.",
	"🎉 City events start every 20-30 minutes — Double Pay Hour doubles your paychecks!",
	"⛽ Keep an eye on your fuel gauge. FuelUp stations are marked on the map.",
	"🌙 Streetlights switch on at night. Fireworks Night only happens after dark.",
	"🏪 Buy a business lot and hire staff to earn money even while you're busy.",
	"🎙️ Hang out at the Park Gazebo or the Beach Bonfire to chat with other players.",
}

ReplicatedFirst:RemoveDefaultLoadingScreen()

---------------------------------------------------------------------------
-- UI
---------------------------------------------------------------------------
local function new(className: string, props: { [string]: any }, parent: Instance?): any
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		(inst :: any)[k] = v
	end
	inst.Parent = parent
	return inst
end

local gui = new("ScreenGui", {
	Name = "SkylineLoading",
	IgnoreGuiInset = true,
	ResetOnSpawn = false,
	DisplayOrder = 1000,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
}, playerGui)

local root = new("Frame", {
	Name = "Root",
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromRGB(10, 12, 24),
	BorderSizePixel = 0,
}, gui)
new("UIGradient", {
	Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(12, 14, 38)),
		ColorSequenceKeypoint.new(0.6, Color3.fromRGB(46, 30, 84)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(196, 92, 120)),
	}),
	Rotation = 90,
}, root)

-- stars
local rng = Random.new(7)
local stars = {}
for i = 1, 60 do
	local s = new("Frame", {
		Name = "Star",
		BorderSizePixel = 0,
		BackgroundColor3 = Color3.new(1, 1, 1),
		BackgroundTransparency = rng:NextNumber(0.1, 0.7),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(rng:NextNumber(0, 1), rng:NextNumber(0, 0.55)),
		Size = UDim2.fromOffset(i % 7 == 0 and 3 or 2, i % 7 == 0 and 3 or 2),
		ZIndex = 1,
	}, root)
	table.insert(stars, { Frame = s, Phase = rng:NextNumber(0, math.pi * 2), Speed = rng:NextNumber(0.8, 2.2) })
end

-- moon
local moon = new("Frame", {
	Name = "Moon",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.82, 0.18),
	Size = UDim2.fromScale(0.09, 0.09),
	BackgroundColor3 = Color3.fromRGB(255, 240, 210),
	ZIndex = 2,
}, root)
new("UIAspectRatioConstraint", { AspectRatio = 1 }, moon)
new("UICorner", { CornerRadius = UDim.new(1, 0) }, moon)

-- skyline silhouette (two parallax layers of procedural towers with lit windows)
local function skylineLayer(name: string, seed: number, color: Color3, maxHeight: number, z: number): Frame
	local layer = new("Frame", {
		Name = name,
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1.2, 0.5),
		Position = UDim2.fromScale(-0.1, 0.5),
		ZIndex = z,
	}, root)
	local r = Random.new(seed)
	local x = 0
	while x < 1 do
		local w = r:NextNumber(0.025, 0.06)
		local h = r:NextNumber(0.25, maxHeight)
		local tower = new("Frame", {
			BorderSizePixel = 0,
			BackgroundColor3 = color,
			AnchorPoint = Vector2.new(0, 1),
			Position = UDim2.fromScale(x, 1),
			Size = UDim2.fromScale(w, h),
			ZIndex = z,
		}, layer)
		if r:NextNumber() < 0.25 then
			new("Frame", { -- antenna
				BorderSizePixel = 0,
				BackgroundColor3 = color,
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.fromScale(0.5, 0),
				Size = UDim2.new(0, 2, 0.12, 0),
				ZIndex = z,
			}, tower)
		end
		-- windows
		for _ = 1, r:NextInteger(2, 7) do
			new("Frame", {
				BorderSizePixel = 0,
				BackgroundColor3 = Color3.fromRGB(255, 214, 120),
				BackgroundTransparency = r:NextNumber(0, 0.5),
				Position = UDim2.fromScale(r:NextNumber(0.15, 0.75), r:NextNumber(0.08, 0.9)),
				Size = UDim2.fromScale(0.12, 0.02),
				ZIndex = z,
			}, tower)
		end
		x += w + r:NextNumber(0, 0.008)
	end
	return layer
end
local farLayer = skylineLayer("SkylineFar", 11, Color3.fromRGB(34, 26, 60), 0.75, 3)
local nearLayer = skylineLayer("SkylineNear", 23, Color3.fromRGB(14, 12, 26), 0.6, 4)

-- logo
local logo = new("TextLabel", {
	Name = "Logo",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.3),
	Size = UDim2.fromScale(0.8, 0.14),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBlack,
	Text = "SKYLINE CITY",
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	ZIndex = 10,
}, root)
new("UITextSizeConstraint", { MaxTextSize = 110 }, logo)
local logoGradient = new("UIGradient", {
	Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(64, 156, 255)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 255, 255)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(190, 110, 255)),
	}),
}, logo)
new("UIStroke", { Color = Color3.fromRGB(20, 14, 40), Thickness = 3, Transparency = 0.2 }, logo)
local tagline = new("TextLabel", {
	Name = "Tagline",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.fromScale(0.5, 0.375),
	Size = UDim2.fromScale(0.7, 0.04),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamMedium,
	Text = "Work. Live. Drive. Own the skyline.",
	TextScaled = true,
	TextColor3 = Color3.fromRGB(210, 214, 236),
	ZIndex = 10,
}, root)
new("UITextSizeConstraint", { MaxTextSize = 26 }, tagline)

-- bottom panel: status, progress bar, tip
local panel = new("Frame", {
	Name = "Panel",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -24),
	Size = UDim2.new(0.9, 0, 0, 120),
	BackgroundTransparency = 1,
	ZIndex = 10,
}, root)
new("UISizeConstraint", { MaxSize = Vector2.new(720, 140) }, panel)
local status = new("TextLabel", {
	Name = "Status",
	Size = UDim2.new(1, 0, 0, 24),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBold,
	TextSize = 18,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "Loading the city...",
	ZIndex = 11,
}, panel)
local percent = new("TextLabel", {
	Name = "Percent",
	Size = UDim2.new(1, 0, 0, 24),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBold,
	TextSize = 18,
	TextXAlignment = Enum.TextXAlignment.Right,
	TextColor3 = Color3.fromRGB(150, 200, 255),
	Text = "0%",
	ZIndex = 11,
}, panel)
local barBack = new("Frame", {
	Name = "Bar",
	Position = UDim2.fromOffset(0, 30),
	Size = UDim2.new(1, 0, 0, 12),
	BackgroundColor3 = Color3.fromRGB(30, 30, 52),
	BorderSizePixel = 0,
	ZIndex = 11,
}, panel)
new("UICorner", { CornerRadius = UDim.new(1, 0) }, barBack)
local barFill = new("Frame", {
	Name = "Fill",
	Size = UDim2.fromScale(0, 1),
	BackgroundColor3 = Color3.new(1, 1, 1),
	BorderSizePixel = 0,
	ZIndex = 12,
}, barBack)
new("UICorner", { CornerRadius = UDim.new(1, 0) }, barFill)
new("UIGradient", {
	Color = ColorSequence.new(Color3.fromRGB(64, 156, 255), Color3.fromRGB(190, 110, 255)),
}, barFill)
local tip = new("TextLabel", {
	Name = "Tip",
	Position = UDim2.fromOffset(0, 54),
	Size = UDim2.new(1, 0, 0, 44),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamMedium,
	TextSize = 16,
	TextWrapped = true,
	TextXAlignment = Enum.TextXAlignment.Center,
	TextColor3 = Color3.fromRGB(220, 222, 240),
	Text = TIPS[1],
	ZIndex = 11,
}, panel)

local skip = new("TextButton", {
	Name = "Skip",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -16, 0, 16),
	Size = UDim2.fromOffset(120, 44),
	BackgroundColor3 = Color3.fromRGB(36, 40, 64),
	BackgroundTransparency = 0.2,
	Font = Enum.Font.GothamBold,
	TextSize = 16,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "Skip ▶",
	Visible = false,
	ZIndex = 20,
}, root)
new("UICorner", { CornerRadius = UDim.new(0, 10) }, skip)

---------------------------------------------------------------------------
-- Animation
---------------------------------------------------------------------------
local target = 0
local shown = 0
local done = false
local t0 = os.clock()

local anim = RunService.RenderStepped:Connect(function(dt)
	local t = os.clock() - t0
	shown += (target - shown) * math.min(1, dt * 4)
	barFill.Size = UDim2.fromScale(math.clamp(shown, 0, 1), 1)
	percent.Text = math.floor(shown * 100 + 0.5) .. "%"
	logoGradient.Offset = Vector2.new(math.sin(t * 0.8) * 0.35, 0)
	logo.Rotation = math.sin(t * 1.3) * 0.6
	farLayer.Position = UDim2.fromScale(-0.1 + math.sin(t * 0.15) * 0.015, 0.5)
	nearLayer.Position = UDim2.fromScale(-0.1 + math.sin(t * 0.15) * 0.03, 0.5)
	for _, s in ipairs(stars) do
		s.Frame.BackgroundTransparency = 0.35 + 0.35 * math.sin(t * s.Speed + s.Phase)
	end
end)

task.spawn(function()
	local i = 1
	while not done do
		task.wait(TIP_SECONDS)
		if done then
			break
		end
		i = i % #TIPS + 1
		local out = TweenService:Create(tip, TweenInfo.new(0.25), { TextTransparency = 1 })
		out:Play()
		out.Completed:Wait()
		tip.Text = TIPS[i]
		TweenService:Create(tip, TweenInfo.new(0.25), { TextTransparency = 0 }):Play()
	end
end)

task.delay(SKIP_AFTER, function()
	if not done then
		skip.Visible = true
	end
end)

---------------------------------------------------------------------------
-- Progress stages
---------------------------------------------------------------------------
local skipped = false
skip.Activated:Connect(function()
	skipped = true
end)

local function waitUntil(check: () -> boolean, timeout: number, onTick: ((number) -> ())?)
	local start = os.clock()
	while not check() and not skipped and os.clock() - start < timeout do
		if onTick then
			onTick((os.clock() - start) / timeout)
		end
		task.wait(0.1)
	end
end

local function fadeOut()
	done = true
	target = 1
	status.Text = "Welcome to Skyline City!"
	task.wait(0.45)
	local info = TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	for _, d in ipairs(gui:GetDescendants()) do
		if d:IsA("Frame") then
			TweenService:Create(d, info, { BackgroundTransparency = 1 }):Play()
		elseif d:IsA("TextLabel") or d:IsA("TextButton") then
			TweenService:Create(d, info, { TextTransparency = 1, BackgroundTransparency = 1 }):Play()
		elseif d:IsA("UIStroke") then
			TweenService:Create(d, info, { Transparency = 1 }):Play()
		end
	end
	task.wait(0.85)
	anim:Disconnect()
	gui:Destroy()
end

task.spawn(function()
	-- 1. game + assets
	status.Text = "Loading the city..."
	local startQueue = math.max(1, ContentProvider.RequestQueueSize)
	waitUntil(function()
		return game:IsLoaded()
	end, 60, function()
		local q = ContentProvider.RequestQueueSize
		target = math.max(target, 0.35 * (1 - math.clamp(q / startQueue, 0, 1)))
	end)
	target = math.max(target, 0.4)

	-- 2. saved data
	status.Text = "Loading your save..."
	waitUntil(function()
		return player:GetAttribute("DataLoaded") == true
	end, DATA_TIMEOUT, function(f)
		target = math.max(target, 0.4 + 0.35 * f)
	end)
	target = math.max(target, 0.75)

	-- 3. character
	status.Text = "Spawning in..."
	waitUntil(function()
		local c = player.Character
		return c ~= nil and c:FindFirstChild("HumanoidRootPart") ~= nil
	end, CHARACTER_TIMEOUT, function(f)
		target = math.max(target, 0.75 + 0.12 * f)
	end)
	target = math.max(target, 0.87)

	-- 4. city ready (procedural build finished its essentials)
	status.Text = "Turning on the streetlights..."
	waitUntil(function()
		return Workspace:GetAttribute("CityReady") == true
	end, CITY_TIMEOUT, function(f)
		target = math.max(target, 0.87 + 0.1 * f)
	end)
	fadeOut()
end)
