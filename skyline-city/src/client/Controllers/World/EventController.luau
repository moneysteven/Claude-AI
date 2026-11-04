-- EventController: city event UI + effects on the client.
--   * "WorldEvent" s->c: EventStart (banner slides in), EventEnd, Fade (elevator / teleport fade)
--   * event chip (top centre) with a live countdown while an event runs; tap / click / gamepad-select it to open
--   * "CityEvents" window (Router): current event, time left, next event ETA, all events, GPS to the event
--     PC keybind Config.Events.UI.Key (F4), gamepad Config.Events.UI.GamepadKey (D-pad right) while an event runs
--   * effects via EventFx: fireworks (night), car-meet show cars, confetti + party music in active PartyZones

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Events)
local Layout = require(Shared.Config.CityLayout)

local Client = script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local EventFx = require(script.Parent:WaitForChild("EventFx"))
local WorldClock = require(script.Parent:WaitForChild("WorldClock"))

local EventController = {
	Name = "EventController",
	Priority = 130,
}

local PANEL = "CityEvents"
local player = Players.LocalPlayer
local current = nil -- active event info table
local chip: TextButton
local chipLabel: TextLabel
local banner: Frame
local fadeGui: ScreenGui
local fadeFrame: Frame
local fadeLabel: TextLabel
local lowGraphics = false

function EventController:GetActiveEvent()
	return current
end

local function timeLeft(e): number
	if not e then
		return 0
	end
	if type(e.EndsAtServer) == "number" then
		return math.max(0, e.EndsAtServer - Workspace:GetServerTimeNow())
	end
	if type(e._localEnd) == "number" then
		return math.max(0, e._localEnd - os.clock())
	end
	return 0
end

local function eventPosition(e): Vector3?
	if not e or not e.Spot then
		return nil
	end
	local spot = Layout.EventSpots[e.Spot]
	if typeof(spot) == "table" and typeof(spot.Center) == "Vector3" then
		return spot.Center
	elseif typeof(spot) == "table" and typeof(spot[1]) == "Vector3" then
		return spot[1]
	end
	return nil
end

---------------------------------------------------------------------------
-- HUD: chip + banner + fade
---------------------------------------------------------------------------
local function buildHud()
	local hud = Router.GetLayer("HUD")
	chip = Kit.new("TextButton", {
		Name = "EventChip",
		Text = "",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 8),
		Size = UDim2.fromOffset(250, 44),
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.1,
		AutoButtonColor = true,
		Visible = false,
		Parent = hud,
	})
	Kit.Corner(chip, UDim.new(1, 0))
	Kit.Stroke(chip, Theme.Colors.AccentAlt, 2, 0.2)
	Kit.Ripple(chip)
	chipLabel = Kit.Label("", {
		Size = UDim2.fromScale(1, 1),
		AutomaticSize = Enum.AutomaticSize.None,
		TextXAlignment = Enum.TextXAlignment.Center,
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small + 1,
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextWrapped = false,
		Parent = chip,
	})
	chip.Activated:Connect(function()
		Router.Open(PANEL)
	end)

	banner = Kit.new("Frame", {
		Name = "EventBanner",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, -140),
		Size = UDim2.fromOffset(440, 96),
		BackgroundColor3 = Theme.Colors.Surface,
		Visible = false,
		Parent = Router.GetLayer("Toast") or hud,
	})
	Kit.Corner(banner, Theme.Corner)
	Kit.Stroke(banner, Theme.Colors.AccentAlt, 2, 0)
	Kit.Padding(banner, 12)
	Kit.new("UIGradient", {
		Color = ColorSequence.new(Theme.Colors.Surface, Theme.Colors.SurfaceAlt),
		Rotation = 90,
		Parent = banner,
	})
	Kit.new("TextLabel", {
		Name = "Icon",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(64, 64),
		Position = UDim2.new(0, 0, 0.5, -32),
		Font = Theme.FontBold,
		TextSize = 44,
		Text = "🎉",
		TextColor3 = Theme.Colors.Text,
		Parent = banner,
	})
	Kit.Title("", { Name = "Title", Position = UDim2.fromOffset(74, 0), Size = UDim2.new(1, -74, 0, 28), AutomaticSize = Enum.AutomaticSize.None, TextSize = Theme.TextSize.Heading + 2, Parent = banner })
	Kit.Label("", { Name = "Body", Position = UDim2.fromOffset(74, 30), Size = UDim2.new(1, -74, 0, 40), AutomaticSize = Enum.AutomaticSize.None, TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small + 1, Parent = banner })

	fadeGui = Kit.new("ScreenGui", {
		Name = "Skyline_Fade",
		ResetOnSpawn = false,
		IgnoreGuiInset = true,
		DisplayOrder = 100,
		Parent = player:WaitForChild("PlayerGui"),
	})
	fadeFrame = Kit.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 1,
		Visible = false,
		Parent = fadeGui,
	})
	fadeLabel = Kit.Label("", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(400, 40),
		AutomaticSize = Enum.AutomaticSize.None,
		TextXAlignment = Enum.TextXAlignment.Center,
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		TextTransparency = 1,
		Parent = fadeFrame,
	})
end

local function showBanner(e)
	if not banner then
		return
	end
	local title = banner:FindFirstChild("Title") :: TextLabel
	local body = banner:FindFirstChild("Body") :: TextLabel
	local icon = banner:FindFirstChild("Icon") :: TextLabel
	icon.Text = e.Icon or "🎉"
	title.Text = (e.Name or "City Event") .. " started!"
	body.Text = (e.Description or "") .. "  <font color=\"#9aa0b8\">(tap the event chip for details)</font>"
	banner.Visible = true
	banner.Position = UDim2.new(0.5, 0, 0, -140)
	Kit.Tween(banner, { Position = UDim2.new(0.5, 0, 0, 60) }, Theme.Tween.Spring)
	local id = e.Id
	task.delay(Config.Banner.Seconds, function()
		if banner and (not current or current.Id == id) then
			local t = Kit.Tween(banner, { Position = UDim2.new(0.5, 0, 0, -140) }, Theme.Tween.Normal)
			t.Completed:Once(function()
				banner.Visible = false
			end)
		end
	end)
end

local function fade(text: string?)
	if not fadeFrame then
		return
	end
	fadeFrame.Visible = true
	fadeLabel.Text = text and ("🛗 " .. tostring(text)) or ""
	Kit.Tween(fadeFrame, { BackgroundTransparency = 0 }, TweenInfo.new(0.22))
	Kit.Tween(fadeLabel, { TextTransparency = 0 }, TweenInfo.new(0.22))
	task.delay(0.55, function()
		Kit.Tween(fadeLabel, { TextTransparency = 1 }, TweenInfo.new(0.35))
		local t = Kit.Tween(fadeFrame, { BackgroundTransparency = 1 }, TweenInfo.new(0.45))
		t.Completed:Once(function()
			if fadeFrame.BackgroundTransparency >= 0.99 then
				fadeFrame.Visible = false
			end
		end)
	end)
end

local function applyEffects()
	local id = current and current.Id
	EventFx.SetFireworks(id == "Fireworks")
	EventFx.SetCarMeet(id == "CarMeet")
end

local function setEvent(e, announce: boolean)
	current = e
	if e and type(e.EndsAtServer) ~= "number" and type(e.EndsIn) == "number" then
		e._localEnd = os.clock() + e.EndsIn
	end
	if chip then
		chip.Visible = e ~= nil
	end
	applyEffects()
	if e and announce then
		showBanner(e)
	end
	if Router.IsOpen(PANEL) then
		Router.Open(PANEL)
	end
end

---------------------------------------------------------------------------
-- Panel
---------------------------------------------------------------------------
local function buildPanel(content: Frame, _data, ctx)
	local scroll = Kit.Scroll({ Parent = content }, 10)
	local activeCard = Kit.Card({ LayoutOrder = 1, Parent = scroll, BackgroundColor3 = Theme.Colors.Surface })
	Kit.Stroke(activeCard, Theme.Colors.AccentAlt, 2, 0.2)
	Kit.List(activeCard, 6)
	local head = Kit.Title(current and ((current.Icon or "🎉") .. " " .. (current.Name or "")) or "No event right now", { LayoutOrder = 1, TextSize = Theme.TextSize.Heading, Parent = activeCard })
	local desc = Kit.Label(current and (current.Description or "") or "Events start every 20-30 minutes. Keep an eye on this panel!", { LayoutOrder = 2, TextColor3 = Theme.Colors.TextDim, Parent = activeCard })
	local timer = Kit.Label("", { LayoutOrder = 3, Font = Theme.FontBold, TextColor3 = Theme.Colors.Warning, Parent = activeCard })
	local pos = eventPosition(current)
	if pos then
		Kit.Button("📍 Set GPS to the event", "primary", function()
			local phone = Registry.Find("PhoneController")
			if phone and phone.SetWaypoint then
				phone:SetWaypoint(pos, current and current.Name or "Event")
				Router.Notify("📍 GPS set to " .. (current and current.Name or "the event"), "success")
			else
				Router.Notify("GPS is not available right now.", "error")
			end
		end, { LayoutOrder = 4, Parent = activeCard })
	end
	if current and current.PayMultiplier then
		Kit.Label(("💸 Job pay x%s while it lasts"):format(tostring(current.PayMultiplier)), { LayoutOrder = 5, TextColor3 = Theme.Colors.Money, Parent = activeCard })
	end
	if current and current.Discount then
		Kit.Label(("🏷️ %s%% off %s"):format(tostring(math.floor(current.Discount * 100 + 0.5)), tostring(current.PriceCategory or "")), { LayoutOrder = 6, TextColor3 = Theme.Colors.Money, Parent = activeCard })
	end
	head.TextWrapped = true
	desc.TextWrapped = true

	Kit.Title("All city events", { LayoutOrder = 10, TextSize = Theme.TextSize.Body + 1, Parent = scroll })
	local nextLabel = Kit.Label("", { LayoutOrder = 11, TextColor3 = Theme.Colors.TextDim, Parent = scroll })
	for i, def in ipairs(Config.List) do
		local card = Kit.Card({ LayoutOrder = 20 + i, Parent = scroll })
		Kit.List(card, 2)
		local isActive = current and current.Id == def.Id
		Kit.Label(("%s <b>%s</b>%s"):format(def.Icon, def.Name, isActive and "  <font color=\"#34c778\">● LIVE</font>" or ""), { LayoutOrder = 1, Parent = card })
		Kit.Label(("%s  ·  %d min%s"):format(def.Description, def.DurationMinutes, def.NightOnly and "  ·  🌙 night only" or ""), { LayoutOrder = 2, TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim, Parent = card })
	end

	local nextIn: number? = nil
	local fetchedAt = os.clock()
	task.spawn(function()
		local res = Net.Invoke("Events", "GetSchedule")
		if res.ok and type(res.NextIn) == "number" then
			nextIn = res.NextIn
			fetchedAt = os.clock()
		end
	end)
	ctx.Maid:Give(task.spawn(function()
		while true do
			if current then
				timer.Text = "⏳ Ends in " .. Format.Duration(timeLeft(current))
			else
				timer.Text = ""
			end
			if nextIn and not current then
				nextLabel.Text = "Next event in about " .. Format.Duration(math.max(0, nextIn - (os.clock() - fetchedAt)))
			elseif current then
				nextLabel.Text = "Another event follows after this one ends."
			else
				nextLabel.Text = ""
			end
			task.wait(1)
		end
	end))
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function EventController:Init()
	Router.Register(PANEL, {
		Title = "City Events",
		Icon = "🎉",
		Kind = "window",
		Size = Config.UI.PanelSize,
		Build = buildPanel,
	})
end

function EventController:Start()
	local fx = Workspace:FindFirstChild("WorldFx")
	if not fx then
		fx = Instance.new("Folder")
		fx.Name = "WorldFx"
		fx.Parent = Workspace
	end
	EventFx.Init(fx :: Folder)
	buildHud()

	lowGraphics = ClientData.Get("Settings.LowGraphics") == true
	ClientData.OnChanged("Settings.LowGraphics", function(v)
		lowGraphics = v == true
	end)

	Net.Listen("WorldEvent", function(kind: string, data: any)
		if kind == "EventStart" and type(data) == "table" then
			setEvent(data, true)
		elseif kind == "EventEnd" then
			-- the server already broadcasts an "event ended" toast through NotifyService
			if current and (type(data) ~= "table" or data.Id == current.Id) then
				setEvent(nil, false)
			end
		elseif kind == "Fade" then
			fade(type(data) == "table" and data.Text or nil)
		end
	end)

	task.spawn(function()
		local res = Net.Invoke("Events", "GetActive")
		if res.ok and type(res.Event) == "table" and not current then
			setEvent(res.Event, true)
		end
	end)

	-- PC: Config.UI.Key (F4) · gamepad: Config.UI.GamepadKey (D-pad right) · touch: tap the event chip
	ContextActionService:BindAction("SkylineCityEvents", function(_, state, input)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		if input and input.KeyCode == Config.UI.GamepadKey and not Router.IsOpen(PANEL) then
			-- the d-pad is only claimed while an event runs (or to close the panel), so it stays free otherwise;
			-- it also stays with gamepad menu navigation while another menu has a selected object, and with
			-- the driving controls (indicators) while seated
			if not current or GuiService.SelectedObject ~= nil or player:GetAttribute("InVehicle") == true then
				return Enum.ContextActionResult.Pass
			end
		end
		Router.Toggle(PANEL)
		return Enum.ContextActionResult.Sink
	end, false, Config.UI.Key, Config.UI.GamepadKey)

	-- chip countdown (1 Hz) + party zones (2 Hz)
	task.spawn(function()
		local tickCount = 0
		while true do
			task.wait(0.5)
			tickCount += 1
			if current and chip then
				local left = timeLeft(current)
				chipLabel.Text = ("%s %s · %s"):format(current.Icon or "🎉", current.Name or "Event", Format.Duration(left))
				if left <= 0 and tickCount % 10 == 0 then
					-- the server end message may have been missed: resync
					local res = Net.Invoke("Events", "GetActive")
					if res.ok then
						setEvent(type(res.Event) == "table" and res.Event or nil, false)
					end
				end
			end
			local cam = Workspace.CurrentCamera
			pcall(EventFx.PartyTick, cam and cam.CFrame.Position or nil, lowGraphics)
		end
	end)

	RunService.RenderStepped:Connect(function(dt)
		local cam = Workspace.CurrentCamera
		local night = WorldClock.IsNight()
		if current and current.Id == "Fireworks" then
			EventFx.SetFireworks(night)
		end
		local ok, err = pcall(EventFx.Update, dt, cam and cam.CFrame.Position or nil, lowGraphics)
		if not ok then
			warn("[EventFx] " .. tostring(err))
		end
	end)
end

return EventController
