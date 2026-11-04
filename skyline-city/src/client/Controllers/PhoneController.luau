-- PhoneController: the smartphone (custom Router panel "Phone", Layer "Phone").
--
--   * slides up from the bottom-right; status bar with the in-game time (Lighting.ClockTime); home screen app grid
--     with unread badges; notification banners (inside the phone when open, a "peek" banner when closed)
--   * open/close: HUD button "Phone" (order 10), key P, gamepad ButtonY; ButtonB goes back / closes
--   * apps: see Shared/Config/Phone.Apps (built-in apps live in Controllers/Phone/*, the rest open other panels)
--
-- API (client):
--   PhoneController:Open(appId?, data?)     PhoneController:Close()   PhoneController:Toggle()   :IsOpen()
--   PhoneController:OpenApp(appId, data?)   (opens the phone first if needed)
--   PhoneController:OpenThread(userId)      (Messages with that player)
--   PhoneController:Banner(icon, title, text, appId?, data?)
--   PhoneController:SetWaypoint(position: Vector3, label: string)   PhoneController:ClearWaypoint()
--   PhoneController:GetWaypoint() -> { Position, Label }?            PhoneController.WaypointChanged : Signal(wp?)

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Maid = require(Shared.Util.Maid)
local Format = require(Shared.Util.Format)
local PhoneConfig = require(Shared.Config.Phone)
local Audio = require(Shared.Config.Audio)

local Client = script.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Registry = require(Client:WaitForChild("Registry"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local PhoneFolder = script.Parent:WaitForChild("Phone")
local AppKit = require(PhoneFolder:WaitForChild("AppKit"))
local PhoneState = require(PhoneFolder:WaitForChild("PhoneState"))
local Waypoint = require(PhoneFolder:WaitForChild("Waypoint"))
local CameraApp = require(PhoneFolder:WaitForChild("CameraApp"))

local APP_MODULES = {
	Messages = require(PhoneFolder:WaitForChild("Messages")),
	Contacts = require(PhoneFolder:WaitForChild("Contacts")),
	Map = require(PhoneFolder:WaitForChild("MapApp")),
	Feed = require(PhoneFolder:WaitForChild("FeedApp")),
	Profile = require(PhoneFolder:WaitForChild("ProfileApp")),
}

local PhoneController = {
	Name = "PhoneController",
	Priority = 30,
}
PhoneController.WaypointChanged = Waypoint.Changed

local UI = PhoneConfig.UI
local PANEL = "Phone"
local localPlayer = Players.LocalPlayer

local appsById: { [string]: any } = {}
for _, app in ipairs(PhoneConfig.Apps) do
	appsById[app.Id] = app
end

-- live phone (nil while closed)
local phone: {
	root: Frame,
	screen: Frame,
	appArea: Frame,
	bannerHolder: Frame,
	maid: any,
	viewMaid: any,
	stack: { { Id: string, Data: any } },
	tiles: { [string]: GuiObject },
}? = nil
local pendingOpen: { Id: string, Data: any }? = nil
local peekHolder: Frame? = nil
local lastOpenedReport = 0

---------------------------------------------------------------------------
-- Sounds (optional ids in Config.Audio)
---------------------------------------------------------------------------
local function playSound(id: string?)
	if type(id) ~= "string" or id == "" then
		return
	end
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Volume = 0.6
	local group = SoundService:FindFirstChild("SFX")
	if group and group:IsA("SoundGroup") then
		s.SoundGroup = group
	end
	s.Parent = SoundService
	s.Ended:Once(function()
		s:Destroy()
	end)
	s:Play()
	task.delay(10, function()
		if s.Parent then
			s:Destroy()
		end
	end)
end

---------------------------------------------------------------------------
-- Badges
---------------------------------------------------------------------------
local function refreshBadges()
	if not phone then
		return
	end
	local p = phone
	local msgTile = p.tiles.Messages
	if msgTile then
		local icon = msgTile:FindFirstChild("Icon")
		if icon then
			AppKit.Badge(icon :: GuiObject, PhoneState.TotalUnread())
		end
	end
	local feedTile = p.tiles.Feed
	if feedTile then
		local icon = feedTile:FindFirstChild("Icon")
		if icon then
			AppKit.Badge(icon :: GuiObject, PhoneState.FeedUnseen)
		end
	end
	local profileTile = p.tiles.Profile
	if profileTile then
		local icon = profileTile:FindFirstChild("Icon")
		local n = 0
		for _ in pairs(PhoneState.Invites) do
			n += 1
		end
		if icon then
			AppKit.Badge(icon :: GuiObject, n)
		end
	end
end

local function hudBadge()
	local hud = Router.GetLayer("HUD")
	local bar = hud and hud:FindFirstChild("HudBar")
	local button = bar and bar:FindFirstChild("Phone")
	if button and button:IsA("GuiObject") then
		local n = PhoneState.TotalUnread()
		local invites = 0
		for _ in pairs(PhoneState.Invites) do
			invites += 1
		end
		AppKit.Badge(button, n + invites)
	end
end

---------------------------------------------------------------------------
-- Views
---------------------------------------------------------------------------
local renderTop -- forward

local function clearView()
	if not phone then
		return
	end
	phone.viewMaid:Clean()
	for _, c in ipairs(phone.appArea:GetChildren()) do
		if c:IsA("GuiObject") then
			c:Destroy()
		end
	end
	phone.tiles = {}
end

local function buildHome(area: Frame, maid)
	local home = Kit.new("Frame", {
		Name = "Home",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Parent = area,
	})
	-- clock widget
	local widget = Kit.new("Frame", {
		Size = UDim2.new(1, -24, 0, 92),
		Position = UDim2.fromOffset(12, 10),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.7,
		Parent = home,
	})
	Kit.Corner(widget, UDim.new(0, 18))
	local bigClock = Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(14, 8),
		Size = UDim2.new(1, -28, 0, 44),
		Font = Theme.FontBold,
		TextSize = 38,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.new(1, 1, 1),
		Text = Format.ClockTime(Lighting.ClockTime),
		Parent = widget,
	})
	local sub = Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(14, 54),
		Size = UDim2.new(1, -28, 0, 26),
		Font = Theme.Font,
		TextSize = 14,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(220, 225, 240),
		TextTruncate = Enum.TextTruncate.AtEnd,
		Text = "",
		Parent = widget,
	})
	local function refreshWidget()
		bigClock.Text = Format.ClockTime(Lighting.ClockTime)
		local district = localPlayer:GetAttribute("District")
		local cash = ClientData.Get("Cash")
		local place = (type(district) == "string" and district ~= "") and district or "Skyline City"
		sub.Text = ("📍 %s   💵 %s"):format(place, Format.MoneyShort(type(cash) == "number" and cash or 0))
	end
	refreshWidget()
	maid:Give(task.spawn(function()
		while true do
			task.wait(1)
			refreshWidget()
		end
	end))

	-- app grid
	local grid = Kit.new("ScrollingFrame", {
		Name = "Grid",
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		Position = UDim2.fromOffset(8, 112),
		Size = UDim2.new(1, -16, 1, -116),
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 0,
		ScrollingDirection = Enum.ScrollingDirection.Y,
		Parent = home,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.25, -6, 0, 82),
		CellPadding = UDim2.fromOffset(6, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Parent = grid,
	})
	local first: GuiObject? = nil
	for i, app in ipairs(PhoneConfig.Apps) do
		local tile = Kit.new("TextButton", {
			Name = app.Id,
			Text = "",
			LayoutOrder = i,
			BackgroundTransparency = 1,
			AutoButtonColor = false,
			Parent = grid,
		})
		local icon = Kit.new("Frame", {
			Name = "Icon",
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, 2),
			Size = UDim2.fromOffset(54, 54),
			BackgroundColor3 = app.Color,
			Parent = tile,
		})
		Kit.Corner(icon, UDim.new(0, 15))
		Kit.new("UIGradient", {
			Color = ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(200, 200, 210)),
			Rotation = 90,
			Parent = icon,
		})
		Kit.new("TextLabel", {
			BackgroundTransparency = 1,
			Size = UDim2.fromScale(1, 1),
			Text = app.Icon,
			TextSize = 28,
			Font = Theme.FontBold,
			Parent = icon,
		})
		Kit.new("TextLabel", {
			BackgroundTransparency = 1,
			Position = UDim2.new(0, -4, 0, 60),
			Size = UDim2.new(1, 8, 0, 16),
			Text = app.Name,
			TextSize = 11,
			Font = Theme.FontBold,
			TextColor3 = Color3.new(1, 1, 1),
			TextStrokeTransparency = 0.6,
			TextTruncate = Enum.TextTruncate.AtEnd,
			Parent = tile,
		})
		local scale = Kit.new("UIScale", { Scale = 1, Parent = icon })
		tile.MouseButton1Down:Connect(function()
			Kit.Tween(scale, { Scale = 0.88 }, Theme.Tween.Fast)
		end)
		tile.MouseButton1Up:Connect(function()
			Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)
		end)
		tile.MouseLeave:Connect(function()
			Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)
		end)
		tile.Activated:Connect(function()
			task.spawn(function()
				PhoneController:OpenApp(app.Id)
			end)
		end)
		-- staggered pop-in
		scale.Scale = 0.6
		task.delay(0.02 * i, function()
			Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)
		end)
		if phone then
			phone.tiles[app.Id] = tile
		end
		if not first then
			first = tile
		end
	end
	refreshBadges()
	if first and Kit.IsGamepad() then
		GuiService.SelectedObject = first
	end
end

local function makeCtx(viewMaid)
	return {
		Phone = PhoneController,
		Maid = viewMaid,
		Find = function(name: string)
			return Registry.Find(name)
		end,
		Back = function()
			PhoneController:Back()
		end,
		Open = function(id: string, data: any?)
			PhoneController:OpenApp(id, data)
		end,
		Replace = function(id: string, data: any?)
			if phone and #phone.stack > 0 then
				table.remove(phone.stack)
			end
			PhoneController:OpenApp(id, data)
		end,
	}
end

renderTop = function(direction: number?)
	if not phone then
		return
	end
	local p = phone
	clearView()
	local top = p.stack[#p.stack]
	local view = Kit.new("Frame", {
		Name = "View",
		BackgroundColor3 = Theme.Colors.Background,
		BackgroundTransparency = top and 0 or 1,
		Size = UDim2.fromScale(1, 1),
		Position = UDim2.fromScale((direction or 0) * 0.35, 0),
		Parent = p.appArea,
	})
	if direction and direction ~= 0 then
		Kit.Tween(view, { Position = UDim2.fromScale(0, 0) }, Theme.Tween.Normal)
	end
	if not top then
		buildHome(view, p.viewMaid)
		return
	end
	local module = APP_MODULES[top.Id]
	if not module then
		buildHome(view, p.viewMaid)
		return
	end
	local ok, cleanup = pcall(module.Build, view, top.Data, makeCtx(p.viewMaid))
	if not ok then
		warn(("[PhoneController] app %s failed: %s"):format(top.Id, tostring(cleanup)))
		AppKit.Empty(view, "This app crashed 😵 — go back and try again.", 1)
	elseif type(cleanup) == "function" then
		p.viewMaid:Give(cleanup)
	end
	if Kit.IsGamepad() then
		task.defer(function()
			local firstButton = nil
			for _, d in ipairs(view:GetDescendants()) do
				if d:IsA("GuiButton") and d.Selectable and d.Visible then
					firstButton = d
					break
				end
			end
			if firstButton then
				GuiService.SelectedObject = firstButton
			end
		end)
	end
end

---------------------------------------------------------------------------
-- Banners
---------------------------------------------------------------------------
local function bannerCard(parent: Instance, icon: string, title: string, text: string, onTap: (() -> ())?)
	local card = Kit.new("TextButton", {
		Name = "Banner",
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.new(1, 0, 0, 62),
		BackgroundColor3 = Color3.fromRGB(30, 32, 44),
		BackgroundTransparency = 0.05,
		Parent = parent,
	})
	Kit.Corner(card, UDim.new(0, 16))
	Kit.Stroke(card, Theme.Colors.Stroke, 1, 0.4)
	Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(8, 11),
		Size = UDim2.fromOffset(40, 40),
		Text = icon,
		TextSize = 26,
		Parent = card,
	})
	Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(54, 9),
		Size = UDim2.new(1, -62, 0, 18),
		Text = title,
		TextSize = 13,
		Font = Theme.FontBold,
		TextColor3 = Theme.Colors.Text,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = card,
	})
	Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(54, 28),
		Size = UDim2.new(1, -62, 0, 28),
		Text = text,
		TextSize = 12,
		Font = Theme.Font,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextWrapped = true,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = card,
	})
	if onTap then
		card.Activated:Connect(function()
			card:Destroy()
			task.spawn(onTap)
		end)
	end
	return card
end

function PhoneController:Banner(icon: string, title: string, text: string, appId: string?, data: any?)
	playSound(Audio.UI.MessageReceived)
	local onTap = appId and function()
		PhoneController:Open(appId, data)
	end or nil
	if phone then
		local holder = phone.bannerHolder
		for _, c in ipairs(holder:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local card = bannerCard(holder, icon, title, text, onTap)
		card.Position = UDim2.new(0, 0, 0, -80)
		Kit.Tween(card, { Position = UDim2.new(0, 0, 0, 0) }, Theme.Tween.Spring)
		task.delay(UI.BannerSeconds, function()
			if card.Parent then
				Kit.Tween(card, { Position = UDim2.new(0, 0, 0, -80) }, Theme.Tween.Normal)
				task.wait(0.3)
				card:Destroy()
			end
		end)
	elseif peekHolder then
		local holder = peekHolder
		local card = bannerCard(holder, icon, title, text, onTap)
		card.LayoutOrder = -math.floor(os.clock() * 10)
		local s = Kit.new("UIScale", { Scale = 0.6, Parent = card })
		Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
		local count = 0
		for _, c in ipairs(holder:GetChildren()) do
			if c:IsA("GuiObject") then
				count += 1
			end
		end
		if count > 3 then
			local oldest, oldestOrder = nil, -math.huge
			for _, c in ipairs(holder:GetChildren()) do
				if c:IsA("GuiObject") and c.LayoutOrder > oldestOrder then
					oldest, oldestOrder = c, c.LayoutOrder
				end
			end
			if oldest then
				oldest:Destroy()
			end
		end
		task.delay(UI.ClosedBannerSeconds, function()
			if card.Parent then
				Kit.Tween(s, { Scale = 0.01 }, Theme.Tween.Fast)
				task.wait(0.16)
				card:Destroy()
			end
		end)
	end
end

---------------------------------------------------------------------------
-- The phone panel
---------------------------------------------------------------------------
local function buildPhone(content: Frame, data: any, ctx)
	local maid = ctx.Maid
	local root = Kit.new("Frame", {
		Name = "Phone",
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -UI.RightMargin, 2, 0),
		Size = UDim2.new(0, UI.MaxWidth, UI.HeightScale, 0),
		BackgroundColor3 = UI.BezelColor,
		Active = true,
		Parent = content,
	})
	Kit.new("UIAspectRatioConstraint", { AspectRatio = UI.AspectRatio, Parent = root })
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(UI.MaxWidth, UI.MaxHeight), Parent = root })
	Kit.Corner(root, UDim.new(0, 38))
	Kit.Stroke(root, Color3.fromRGB(70, 74, 90), 2, 0)

	local screen = Kit.new("Frame", {
		Name = "Screen",
		Position = UDim2.fromOffset(7, 7),
		Size = UDim2.new(1, -14, 1, -14),
		BackgroundColor3 = Color3.new(1, 1, 1),
		ClipsDescendants = true,
		Parent = root,
	})
	Kit.Corner(screen, UDim.new(0, 32))
	Kit.new("UIGradient", {
		Color = ColorSequence.new(UI.WallpaperTop, UI.WallpaperBottom),
		Rotation = 90,
		Parent = screen,
	})

	-- status bar
	local status = Kit.new("Frame", {
		Name = "StatusBar",
		Size = UDim2.new(1, 0, 0, 30),
		BackgroundTransparency = 1,
		ZIndex = 5,
		Parent = screen,
	})
	local clock = Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(22, 6),
		Size = UDim2.fromOffset(80, 20),
		Font = Theme.FontBold,
		TextSize = 13,
		TextColor3 = Color3.new(1, 1, 1),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = Format.ClockTime(Lighting.ClockTime),
		ZIndex = 5,
		Parent = status,
	})
	local notch = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 6),
		Size = UDim2.fromOffset(78, 20),
		BackgroundColor3 = Color3.new(0, 0, 0),
		ZIndex = 6,
		Parent = status,
	})
	Kit.Corner(notch, UDim.new(1, 0))
	Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -18, 0, 6),
		Size = UDim2.fromOffset(110, 20),
		Font = Theme.FontBold,
		TextSize = 11,
		TextColor3 = Color3.new(1, 1, 1),
		TextXAlignment = Enum.TextXAlignment.Right,
		Text = UI.CarrierText .. "  📶",
		ZIndex = 5,
		Parent = status,
	})
	maid:Give(task.spawn(function()
		while true do
			task.wait(1)
			clock.Text = Format.ClockTime(Lighting.ClockTime)
		end
	end))

	local appArea = Kit.new("Frame", {
		Name = "AppArea",
		Position = UDim2.fromOffset(0, 30),
		Size = UDim2.new(1, 0, 1, -30 - 26),
		BackgroundTransparency = 1,
		ClipsDescendants = true,
		Parent = screen,
	})

	-- home indicator (tap = home)
	local homeButton = Kit.new("TextButton", {
		Name = "HomeIndicator",
		Text = "",
		AutoButtonColor = false,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, 0),
		Size = UDim2.new(0.6, 0, 0, 26),
		BackgroundTransparency = 1,
		ZIndex = 7,
		Parent = screen,
	})
	local pill = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.6, 0, 0, 5),
		BackgroundColor3 = Color3.new(1, 1, 1),
		BackgroundTransparency = 0.2,
		ZIndex = 7,
		Parent = homeButton,
	})
	Kit.Corner(pill, UDim.new(1, 0))
	homeButton.Activated:Connect(function()
		PhoneController:Home()
	end)

	-- close button on the bezel (big touch target outside the screen corner)
	Kit.IconButton("✕", function()
		Router.Close(PANEL)
	end, {
		Name = "CloseButton",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0, 0, 0, 0),
		Size = UDim2.fromOffset(44, 44),
		TextSize = 16,
		BackgroundColor3 = Theme.Colors.Surface,
		ZIndex = 8,
		Parent = root,
	})

	local bannerHolder = Kit.new("Frame", {
		Name = "Banners",
		Position = UDim2.fromOffset(8, 34),
		Size = UDim2.new(1, -16, 0, 62),
		BackgroundTransparency = 1,
		ZIndex = 9,
		Parent = screen,
	})

	phone = {
		root = root,
		screen = screen,
		appArea = appArea,
		bannerHolder = bannerHolder,
		maid = maid,
		viewMaid = Maid.new(),
		stack = {},
		tiles = {},
	}
	if peekHolder then
		for _, c in ipairs(peekHolder:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
	end

	-- initial view
	local first = (type(data) == "table" and type(data.App) == "string") and { Id = data.App, Data = data.AppData } or pendingOpen
	pendingOpen = nil
	renderTop(0)
	if first then
		PhoneController:OpenApp(first.Id, first.Data)
	end

	-- slide up
	Kit.Tween(root, { Position = UDim2.new(1, -UI.RightMargin, 1, -UI.BottomMargin) }, TweenInfo.new(UI.OpenTween, Enum.EasingStyle.Back, Enum.EasingDirection.Out))
	playSound(Audio.UI.PhoneOpen)

	-- gamepad / B = back
	ContextActionService:BindActionAtPriority("SkylinePhoneBack", function(_, state)
		if state == Enum.UserInputState.Begin then
			PhoneController:Back()
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.ContextActionPriority.Medium.Value, Enum.KeyCode.ButtonB)

	maid:Give(PhoneState.Changed:Connect(function(kind)
		if kind == "Unread" or kind == "Invites" then
			refreshBadges()
		end
	end))

	-- tutorial milestone (server checks the step)
	-- (reported on every open while the tutorial runs: opening the phone before reaching that step must not
	-- swallow the milestone; the server only advances a matching current step and rate-limits this action)
	if ClientData.Get("Tutorial.Done") ~= true and os.clock() - lastOpenedReport > 3 then
		lastOpenedReport = os.clock()
		task.spawn(Net.Invoke, "Phone", "Opened", {})
	end

	return function()
		ContextActionService:UnbindAction("SkylinePhoneBack")
		local p = phone
		phone = nil
		if p then
			p.viewMaid:Clean()
		end
		-- slide down: move the phone out of the panel frame (which Router destroys) and animate it away
		local layer = Router.GetLayer("Phone")
		if layer and root.Parent then
			root.Parent = layer
			Kit.Tween(root, { Position = UDim2.new(1, -UI.RightMargin, 2, 0) }, TweenInfo.new(0.28, Enum.EasingStyle.Quad, Enum.EasingDirection.In))
			task.delay(0.3, function()
				root:Destroy()
			end)
		end
		if GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(root) then
			GuiService.SelectedObject = nil
		end
	end
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function PhoneController:IsOpen(): boolean
	return Router.IsOpen(PANEL)
end

function PhoneController:Open(appId: string?, data: any?)
	if phone then
		if appId then
			self:OpenApp(appId, data)
		end
		return
	end
	if CameraApp.IsActive() then
		Router.Close("PhoneCamera")
	end
	pendingOpen = appId and { Id = appId, Data = data } or nil
	Router.Open(PANEL)
end

function PhoneController:Close()
	Router.Close(PANEL)
end

function PhoneController:Toggle()
	if self:IsOpen() then
		self:Close()
	else
		self:Open()
	end
end

function PhoneController:Home()
	if not phone then
		return
	end
	if #phone.stack == 0 then
		return
	end
	table.clear(phone.stack)
	renderTop(-1)
end

function PhoneController:Back()
	if not phone then
		return
	end
	if #phone.stack == 0 then
		Router.Close(PANEL)
		return
	end
	table.remove(phone.stack)
	renderTop(-1)
end

function PhoneController:OpenApp(appId: string, data: any?)
	local app = appsById[appId]
	if not app then
		warn("[PhoneController] unknown app " .. tostring(appId))
		return
	end
	if app.Id == "Camera" then
		CameraApp.Enter()
		return
	end
	if app.Kind == "panel" then
		local panelData = data
		if panelData == nil and type(app.PanelData) == "table" then
			panelData = table.clone(app.PanelData)
		end
		Router.Open(app.Panel, panelData)
		if Router.IsOpen(app.Panel) then
			Router.Close(PANEL)
		else
			if not phone then
				self:Open()
			end
			self:Banner(app.Icon, app.Name, "This app isn't available yet. Check back soon!")
		end
		return
	end
	if not phone then
		self:Open(appId, data)
		return
	end
	table.insert(phone.stack, { Id = appId, Data = data })
	renderTop(1)
end

function PhoneController:OpenThread(userId: number)
	self:Open("Messages", { UserId = userId })
end

function PhoneController:SetWaypoint(position: Vector3, label: string)
	Waypoint.Set(position, label)
end

function PhoneController:ClearWaypoint()
	Waypoint.Clear()
end

function PhoneController:GetWaypoint()
	return Waypoint.Get()
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function PhoneController:Init()
	Router.Register(PANEL, {
		Title = "Phone",
		Icon = "📱",
		Kind = "custom",
		Layer = "Phone",
		Build = buildPhone,
	})
	CameraApp.Register()
end

function PhoneController:Start()
	Waypoint.Start()

	-- peek banners (phone closed) live in the Phone layer, bottom-right
	local layer = Router.GetLayer("Phone")
	if layer then
		peekHolder = Kit.new("Frame", {
			Name = "PhonePeek",
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -UI.RightMargin, 1, -UI.BottomMargin),
			Size = UDim2.fromOffset(300, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundTransparency = 1,
			Parent = layer,
		})
		local list = Kit.List(peekHolder :: Frame, 6)
		list.VerticalAlignment = Enum.VerticalAlignment.Bottom
	end

	Router.AddHudButton("Phone", "📱", "Phone", UI.HudOrder, function()
		PhoneController:Toggle()
	end)

	-- Bound at LOW priority: contextual ButtonY actions (job action, business work, daily claim, panel
	-- shortcuts) are bound at Default or higher and Sink, so the phone only opens when nothing else wants Y.
	-- See docs/CONTROLS.md.
	-- World ProximityPrompts are handled outside ContextActionService, so a visible prompt bound to the same
	-- gamepad button (e.g. a house light switch on ButtonY) would fire together with the phone. Track the
	-- prompts currently on screen and let the prompt have the button.
	local shownPrompts: { [ProximityPrompt]: boolean } = {}
	ProximityPromptService.PromptShown:Connect(function(prompt: ProximityPrompt)
		shownPrompts[prompt] = true
	end)
	ProximityPromptService.PromptHidden:Connect(function(prompt: ProximityPrompt)
		shownPrompts[prompt] = nil
	end)
	local function promptWants(key: Enum.KeyCode): boolean
		for prompt in pairs(shownPrompts) do
			if prompt.Parent == nil then
				shownPrompts[prompt] = nil
			elseif prompt.Enabled and prompt.GamepadKeyCode == key then
				return true
			end
		end
		return false
	end
	ContextActionService:BindActionAtPriority("SkylinePhoneToggle", function(_, state, input: InputObject)
		if input and input.KeyCode == UI.GamepadButton and not PhoneController:IsOpen() and promptWants(input.KeyCode) then
			return Enum.ContextActionResult.Pass
		end
		if state == Enum.UserInputState.Begin then
			PhoneController:Toggle()
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.ContextActionPriority.Low.Value, UI.Keybind, UI.GamepadButton)

	Net.Listen("PhoneEvent", function(kind, data)
		if type(kind) ~= "string" then
			return
		end
		local banner = PhoneState.HandleEvent(kind, data)
		if banner then
			PhoneController:Banner(banner.Icon, banner.Title, banner.Text, banner.App, banner.Data)
		end
	end)

	PhoneState.Changed:Connect(function(kind)
		if kind == "Unread" or kind == "Invites" then
			hudBadge()
		end
	end)

	task.spawn(function()
		PhoneState.FetchThreads()
		PhoneState.FetchGroup()
		PhoneState.FetchParties()
		hudBadge()
	end)
end

return PhoneController
