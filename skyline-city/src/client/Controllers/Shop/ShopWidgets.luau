-- ShopWidgets: shared UI pieces for the Shop / Wardrobe panels.
--
--   ShopWidgets.Tabs(parent, defs, onSelect, maid) -> api { Select(i), Index() }
--       defs = { { Id, Text } }; L1 / R1 (and Q / E on PC) cycle tabs while the panel is open.
--   ShopWidgets.Chip(text, color, props?) -> Frame (pill label)
--   ShopWidgets.Section(text, order, parent) -> TextLabel
--   ShopWidgets.Celebrate(root, data, ctx)   full-screen purchase celebration (custom panel body)
--   ShopWidgets.PlaySound(soundId)

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Audio = require(Shared.Config.Audio)
local Monetization = require(Shared.Config.Monetization)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local ShopWidgets = {}

local tabCounter = 0

function ShopWidgets.PlaySound(id: string?)
	if type(id) ~= "string" or id == "" then
		return
	end
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Volume = 0.6
	s.Parent = SoundService
	s:Play()
	s.Ended:Connect(function()
		s:Destroy()
	end)
	task.delay(10, function()
		if s.Parent then
			s:Destroy()
		end
	end)
end

function ShopWidgets.Chip(text: string, color: Color3, props: { [string]: any }?)
	local chip = Kit.new("Frame", {
		BackgroundColor3 = color,
		Size = UDim2.fromOffset(0, 24),
		AutomaticSize = Enum.AutomaticSize.X,
	})
	Kit.Corner(chip, UDim.new(1, 0))
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), Parent = chip })
	local dark = (color.R * 0.299 + color.G * 0.587 + color.B * 0.114) > 0.6
	Kit.Label(text, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small,
		TextColor3 = dark and Color3.fromRGB(30, 24, 8) or Theme.Colors.Text,
		AutomaticSize = Enum.AutomaticSize.X,
		Size = UDim2.fromScale(0, 1),
		TextWrapped = false,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = chip,
	})
	if props then
		for k, v in pairs(props) do
			(chip :: any)[k] = v
		end
	end
	return chip
end

function ShopWidgets.Section(text: string, order: number, parent: Instance)
	return Kit.Label(text, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		LayoutOrder = order,
		Parent = parent,
	})
end

function ShopWidgets.Tabs(parent: Instance, defs: { { Id: string, Text: string } }, onSelect: (string, number) -> (), maid)
	local bar = Kit.new("Frame", {
		Name = "Tabs",
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundColor3 = Theme.Colors.Background,
		BackgroundTransparency = 0.2,
		Parent = parent,
	})
	Kit.Corner(bar, Theme.CornerSmall)
	Kit.Padding(bar, 4)
	local layout = Kit.List(bar, 4, true)
	pcall(function()
		layout.HorizontalFlex = Enum.UIFlexAlignment.Fill -- tabs share the bar width
	end)

	local buttons: { TextButton } = {}
	local index = 0
	local api = {}

	local function paint()
		for i, b in ipairs(buttons) do
			local on = i == index
			Kit.Tween(b, {
				BackgroundColor3 = on and Theme.Colors.Accent or Theme.Colors.SurfaceAlt,
				BackgroundTransparency = on and 0 or 0.4,
				TextColor3 = on and Theme.Colors.Text or Theme.Colors.TextDim,
			}, Theme.Tween.Fast)
		end
	end

	function api.Select(i: number)
		if i < 1 or i > #defs or i == index then
			return
		end
		index = i
		paint()
		task.spawn(onSelect, defs[i].Id, i)
	end

	function api.SelectId(id: string)
		for i, d in ipairs(defs) do
			if d.Id == id then
				api.Select(i)
				return
			end
		end
	end

	function api.Index(): number
		return index
	end

	for i, d in ipairs(defs) do
		local b = Kit.Button(d.Text, "secondary", function()
			api.Select(i)
		end, {
			Size = UDim2.new(0, 60, 1, 0),
			TextSize = Theme.TextSize.Small,
			LayoutOrder = i,
			Parent = bar,
		})
		buttons[i] = b
	end

	-- gamepad bumpers / PC Q-E to cycle tabs (bound only while the panel is open)
	tabCounter += 1
	local action = "SkylineShopTabs" .. tabCounter
	ContextActionService:BindAction(action, function(_, state, input)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		local dir = (input.KeyCode == Enum.KeyCode.ButtonL1 or input.KeyCode == Enum.KeyCode.Q) and -1 or 1
		local n = #defs
		local nextIndex = ((index - 1 + dir) % n) + 1
		api.Select(nextIndex)
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.ButtonL1, Enum.KeyCode.ButtonR1, Enum.KeyCode.Q, Enum.KeyCode.E)
	if maid then
		maid:Give(function()
			ContextActionService:UnbindAction(action)
		end)
	end

	api.Bar = bar
	return api
end

---------------------------------------------------------------------------
-- Celebration overlay
---------------------------------------------------------------------------
local CONFETTI = {
	Color3.fromRGB(255, 196, 40),
	Color3.fromRGB(255, 82, 92),
	Color3.fromRGB(64, 156, 255),
	Color3.fromRGB(52, 199, 120),
	Color3.fromRGB(190, 110, 255),
	Color3.fromRGB(255, 255, 255),
}

function ShopWidgets.Celebrate(root: Frame, data: { [string]: any }?, ctx)
	local d = data or {}
	ShopWidgets.PlaySound(Audio.UI.Purchase)

	local overlay = Kit.new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Colors.Overlay,
		BackgroundTransparency = 1,
		Parent = root,
	})
	Kit.Tween(overlay, { BackgroundTransparency = 0.35 }, Theme.Tween.Normal)

	-- confetti rain (UI only, tweened)
	local rng = Random.new()
	for i = 1, 46 do
		local piece = Kit.new("Frame", {
			Size = UDim2.fromOffset(rng:NextInteger(8, 14), rng:NextInteger(10, 18)),
			Position = UDim2.new(rng:NextNumber(), 0, 0, -30),
			Rotation = rng:NextInteger(0, 360),
			BackgroundColor3 = CONFETTI[(i % #CONFETTI) + 1],
			BorderSizePixel = 0,
			Parent = overlay,
		})
		local dur = rng:NextNumber(1.8, 3.4)
		task.delay(rng:NextNumber(0, 0.9), function()
			if piece.Parent then
				Kit.Tween(piece, {
					Position = UDim2.new(piece.Position.X.Scale + rng:NextNumber(-0.15, 0.15), 0, 1.1, 0),
					Rotation = piece.Rotation + rng:NextInteger(-540, 540),
				}, TweenInfo.new(dur, Enum.EasingStyle.Quad, Enum.EasingDirection.In))
			end
		end)
	end

	local card = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.9, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = overlay,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(420, 640), Parent = card })
	Kit.Corner(card)
	Kit.Stroke(card, Theme.Colors.VIP, 3, 0)
	Kit.Padding(card, 20)
	Kit.List(card, 10, false, Enum.HorizontalAlignment.Center)
	Kit.new("UIGradient", {
		Color = ColorSequence.new(Theme.Colors.SurfaceAlt, Theme.Colors.Surface),
		Rotation = 90,
		Parent = card,
	})
	local scale = Kit.new("UIScale", { Scale = 0.3, Parent = card })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)

	local icon = Kit.Label(tostring(d.Icon or "🎉"), {
		TextSize = 64,
		TextXAlignment = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 74),
		AutomaticSize = Enum.AutomaticSize.None,
		LayoutOrder = 1,
		Parent = card,
	})
	Kit.Tween(icon, { Rotation = 8 }, TweenInfo.new(0.6, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true))
	Kit.Label("PURCHASE COMPLETE", {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.VIP,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 2,
		Parent = card,
	})
	Kit.Title(tostring(d.Title or "Thank you!"), { TextXAlignment = Enum.TextXAlignment.Center, LayoutOrder = 3, Parent = card })
	Kit.Label(tostring(d.Text or ""), {
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 4,
		Parent = card,
	})
	if type(d.Perks) == "table" then
		local list = Kit.Card({ LayoutOrder = 5, Parent = card })
		Kit.List(list, 4)
		for i, perk in ipairs(d.Perks) do
			if i > 6 then
				Kit.Label(("…and %d more"):format(#d.Perks - 6), { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim, LayoutOrder = i, Parent = list })
				break
			end
			Kit.Label(tostring(perk), { TextSize = Theme.TextSize.Small, LayoutOrder = i, Parent = list })
		end
	end
	local btn = Kit.Button("Awesome!", "vip", function()
		ctx.Close()
	end, { LayoutOrder = 10, Parent = card })
	if Kit.IsGamepad() then
		GuiService.SelectedObject = btn
	end
	overlay.Activated:Connect(function()
		ctx.Close()
	end)

	local alive = true
	ctx.Maid:Give(function()
		alive = false
	end)
	task.delay(Monetization.UI.CelebrationSeconds + 4, function()
		if alive then
			ctx.Close()
		end
	end)
end

return ShopWidgets
