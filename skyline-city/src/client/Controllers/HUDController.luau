-- HUDController: the top-left status card.
--   💵 cash (animated count-up/down + green/red delta popups) · 🏦 bank
--   🕒 in-game clock (Lighting.ClockTime) + weather icon (Workspace attribute "Weather")
--   💼 current job (player attributes JobId / JobLevel)
--   wealth title chip in the tier colour (tap it to open the Leaderboard)
-- Compact layout on phones. Hidden with everything else by Router.SetHudVisible(false).
--
-- API (client):
--   HUDController:GetCard() -> Frame
--   HUDController:FlashCash(delta)   -- show a delta popup without a data change (e.g. preview)

local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Format = require(Shared.Util.Format)
local Economy = require(Shared.Config.Economy)
local World = require(Shared.Config.World)

local Client = script.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local HUDController = {
	Name = "HUDController",
	Priority = 10,
}

local localPlayer = Players.LocalPlayer

local WEATHER_ICONS = {
	Clear = "☀️",
	Cloudy = "☁️",
	Rain = "🌧️",
	Fog = "🌫️",
}

local card: Frame
local cashLabel: TextLabel
local bankLabel: TextLabel
local clockLabel: TextLabel
local jobLabel: TextLabel
local chip: TextButton
local chipLabel: TextLabel
local popupHolder: Frame

local cashValue: NumberValue
local shownCash: number? = nil
local compact = false

local JOB_NAMES = {
	Pizza = "Pizza Delivery",
	Taxi = "Taxi Driver",
	Police = "Police Officer",
	Fire = "Firefighter",
	Paramedic = "Paramedic",
	Mechanic = "Mechanic",
	Cashier = "Cashier",
	Chef = "Chef",
	CarSales = "Car Sales",
	RealEstate = "Real Estate",
	Construction = "Construction",
}

---------------------------------------------------------------------------
-- Pieces
---------------------------------------------------------------------------
local function tierColor(tierId: number?): Color3
	for _, t in ipairs(Economy.WealthTiers) do
		if t.Id == tierId then
			return t.Color
		end
	end
	return Economy.WealthTiers[1].Color
end

local function popup(delta: number)
	if delta == 0 or not popupHolder then
		return
	end
	local positive = delta > 0
	local label = Kit.new("TextLabel", {
		Text = (positive and "+" or "-") .. Format.Money(math.abs(delta)),
		Font = Theme.FontBold,
		TextSize = compact and 15 or 18,
		TextColor3 = positive and Theme.Colors.Money or Theme.Colors.Danger,
		TextStrokeTransparency = 0.6,
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 0, 0.5, 0),
		Size = UDim2.new(1, 0, 0, 22),
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = popupHolder,
	})
	local s = Kit.new("UIScale", { Scale = 0.6, Parent = label })
	Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
	Kit.Tween(label, {
		Position = UDim2.new(0, 0, 0.5, positive and -26 or 26),
		TextTransparency = 1,
		TextStrokeTransparency = 1,
	}, TweenInfo.new(1.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out))
	task.delay(1.45, function()
		label:Destroy()
	end)
	-- pulse the cash line
	Kit.Tween(cashLabel, { TextColor3 = positive and Theme.Colors.Money or Theme.Colors.Danger }, Theme.Tween.Fast)
	task.delay(0.35, function()
		Kit.Tween(cashLabel, { TextColor3 = Theme.Colors.Money }, Theme.Tween.Normal)
	end)
end

local function onCash(v: any)
	local cash = type(v) == "number" and v or 0
	if shownCash == nil then
		shownCash = cash
		cashValue.Value = cash
		return
	end
	local delta = cash - shownCash
	shownCash = cash
	if delta == 0 then
		return
	end
	popup(delta)
	local duration = math.clamp(math.log10(math.abs(delta) + 1) * 0.18, 0.25, 1.1)
	Kit.Tween(cashValue, { Value = cash }, TweenInfo.new(duration, Enum.EasingStyle.Quad, Enum.EasingDirection.Out))
end

local function updateClock()
	local clock = Lighting.ClockTime
	local weather = Workspace:GetAttribute("Weather")
	local night = clock >= World.Time.NightStart or clock < World.Time.NightEnd
	local icon = WEATHER_ICONS[weather] or "☀️"
	if night and (weather == nil or weather == "Clear") then
		icon = "🌙"
	end
	clockLabel.Text = ("%s %s"):format(icon, Format.ClockTime(clock))
end

local function updateJob()
	local jobId = localPlayer:GetAttribute("JobId")
	local level = localPlayer:GetAttribute("JobLevel")
	if type(jobId) == "string" and jobId ~= "" then
		local name = JOB_NAMES[jobId] or jobId
		if type(level) == "number" and level > 0 then
			jobLabel.Text = ("💼 %s · Lv %d"):format(name, level)
		else
			jobLabel.Text = "💼 " .. name
		end
		jobLabel.TextColor3 = Theme.Colors.Text
	else
		jobLabel.Text = "💼 Off duty"
		jobLabel.TextColor3 = Theme.Colors.TextDim
	end
end

local function updateChip()
	local title = localPlayer:GetAttribute("WealthTitle")
	local tierId = localPlayer:GetAttribute("WealthTier")
	local worth = localPlayer:GetAttribute("NetWorth")
	local color = tierColor(type(tierId) == "number" and tierId or 1)
	local text = type(title) == "string" and title or Economy.WealthTiers[1].Name
	if type(worth) == "number" and not compact then
		text ..= "  ·  " .. Format.MoneyShort(worth)
	end
	chipLabel.Text = "💎 " .. text
	Kit.Tween(chip, { BackgroundColor3 = color }, Theme.Tween.Normal)
	-- dark text on bright tiers keeps contrast
	local lum = 0.299 * color.R + 0.587 * color.G + 0.114 * color.B
	chipLabel.TextColor3 = lum > 0.6 and Color3.fromRGB(25, 25, 30) or Color3.new(1, 1, 1)
end

local function line(parent: Instance, order: number, size: number, color: Color3, bold: boolean?): TextLabel
	return Kit.Label("", {
		Font = bold and Theme.FontBold or Theme.Font,
		TextSize = size,
		TextColor3 = color,
		AutomaticSize = Enum.AutomaticSize.None,
		Size = UDim2.new(1, 0, 0, size + 4),
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextWrapped = false,
		LayoutOrder = order,
		Parent = parent,
	})
end

local function build()
	compact = Kit.IsMobile()
	local layer = Router.GetLayer("HUD")
	card = Kit.new("Frame", {
		Name = "StatusCard",
		Position = UDim2.fromOffset(10, 10),
		Size = UDim2.fromOffset(compact and 196 or 248, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.15,
		Parent = layer,
	})
	Kit.Corner(card)
	Kit.Stroke(card)
	Kit.Padding(card, compact and 8 or 10)
	Kit.List(card, compact and 2 or 4)

	-- cash row with popup lane on the right
	local cashRow = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, compact and 24 or 30),
		BackgroundTransparency = 1,
		LayoutOrder = 1,
		Parent = card,
	})
	cashLabel = Kit.Label("💵 $0", {
		Font = Theme.FontBold,
		TextSize = compact and 20 or 24,
		TextColor3 = Theme.Colors.Money,
		AutomaticSize = Enum.AutomaticSize.None,
		Size = UDim2.fromScale(1, 1),
		TextWrapped = false,
		Parent = cashRow,
	})
	popupHolder = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0, 0),
		Position = UDim2.new(1, 8, 0, 0),
		Size = UDim2.new(0, 140, 1, 0),
		BackgroundTransparency = 1,
		Parent = cashRow,
	})

	bankLabel = line(card, 2, compact and 13 or 15, Theme.Colors.TextDim)
	clockLabel = line(card, 3, compact and 13 or 15, Theme.Colors.Text)
	jobLabel = line(card, 4, compact and 13 or 15, Theme.Colors.TextDim)

	chip = Kit.new("TextButton", {
		Text = "",
		AutoButtonColor = true,
		Size = UDim2.new(1, 0, 0, compact and 26 or 30),
		BackgroundColor3 = tierColor(1),
		LayoutOrder = 5,
		Parent = card,
	})
	Kit.Corner(chip, UDim.new(1, 0))
	Kit.Ripple(chip)
	chipLabel = Kit.Label("💎 …", {
		Font = Theme.FontBold,
		TextSize = compact and 13 or 14,
		TextXAlignment = Enum.TextXAlignment.Center,
		AutomaticSize = Enum.AutomaticSize.None,
		Size = UDim2.fromScale(1, 1),
		TextWrapped = false,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = chip,
	})
	chip.Activated:Connect(function()
		Router.Toggle("Leaderboard", nil)
	end)

	cashValue = Instance.new("NumberValue")
	cashValue.Changed:Connect(function(v)
		cashLabel.Text = "💵 " .. Format.Money(math.floor(v + 0.5))
	end)

	-- slide in
	card.Position = UDim2.fromOffset(-280, 10)
	Kit.Tween(card, { Position = UDim2.fromOffset(10, 10) }, Theme.Tween.Spring)
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function HUDController:GetCard(): Frame
	return card
end

function HUDController:FlashCash(delta: number)
	if type(delta) == "number" then
		popup(math.floor(delta))
	end
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function HUDController:Start()
	build()

	ClientData.OnChanged("Cash", onCash)
	ClientData.OnChanged("Bank", function(v)
		bankLabel.Text = "🏦 " .. Format.Money(type(v) == "number" and v or 0)
	end)
	bankLabel.Text = "🏦 " .. Format.Money(tonumber(ClientData.Get("Bank")) or 0)
	if shownCash == nil and ClientData.IsLoaded() then
		onCash(ClientData.Get("Cash"))
	end

	localPlayer:GetAttributeChangedSignal("JobId"):Connect(updateJob)
	localPlayer:GetAttributeChangedSignal("JobLevel"):Connect(updateJob)
	localPlayer:GetAttributeChangedSignal("WealthTitle"):Connect(updateChip)
	localPlayer:GetAttributeChangedSignal("WealthTier"):Connect(updateChip)
	localPlayer:GetAttributeChangedSignal("NetWorth"):Connect(updateChip)
	Workspace:GetAttributeChangedSignal("Weather"):Connect(updateClock)
	updateJob()
	updateChip()
	updateClock()

	-- the clock only needs ~1 Hz
	task.spawn(function()
		while true do
			task.wait(1)
			if card and card.Parent then
				updateClock()
			end
		end
	end)
end

return HUDController
