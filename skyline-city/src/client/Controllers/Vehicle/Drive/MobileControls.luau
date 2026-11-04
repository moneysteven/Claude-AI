-- MobileControls: on-screen driving controls for phones / tablets.
--   left:  big ◀ ▶ steering buttons + a column of car function buttons (menu, camera, lights, horn, cruise, exit)
--   right: gas & brake pedals, handbrake, and +/- shift buttons (manual gearbox only)
-- Multi-touch safe: each button tracks its own InputObject and releases on TouchEnded even if the
-- finger slid off the button.
--
--   local mc = MobileControls.new(touchState, handlers)
--       touchState = { Throttle = 0, Brake = 0, Steer = 0, Handbrake = false } (written by the buttons)
--       handlers[action](pressed) for discrete actions ("CarMenu", "CameraCycle", "Exit", ...)
--   mc:SetManual(bool)  mc:SetVisible(bool)  mc:Destroy()

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local MobileControls = {}
MobileControls.__index = MobileControls

local PRESS_COLOR = Theme.Colors.Accent

function MobileControls.new(touchState: { [string]: any }, handlers: { [string]: (boolean) -> () })
	local self = setmetatable({}, MobileControls)
	self.State = touchState
	self.Handlers = handlers
	self.Conns = {}
	self.Active = {} -- InputObject -> release fn

	local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
	local gui = Kit.new("ScreenGui", {
		Name = "Skyline_DriveTouch",
		ResetOnSpawn = false,
		IgnoreGuiInset = false,
		DisplayOrder = Theme.Layers.HUD + 2,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets,
		Parent = playerGui,
	})
	self.Gui = gui
	local scale = Kit.new("UIScale", { Parent = gui })
	local function rescale()
		local cam = Workspace.CurrentCamera
		if cam then
			local vp = cam.ViewportSize
			scale.Scale = math.clamp(math.min(vp.X / 1000, vp.Y / 560), 0.7, 1.2)
		end
	end
	rescale()
	if Workspace.CurrentCamera then
		table.insert(self.Conns, Workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale))
	end

	-- global release (finger lifted anywhere)
	local function release(input: InputObject)
		local fn = self.Active[input]
		if fn then
			self.Active[input] = nil
			fn()
		end
	end
	table.insert(self.Conns, UserInputService.TouchEnded:Connect(function(input)
		release(input)
	end))
	table.insert(self.Conns, UserInputService.InputEnded:Connect(function(input)
		release(input)
	end))

	local function holdButton(text: string, props: { [string]: any }, onDown: () -> (), onUp: () -> ())
		local base = {
			Text = text,
			Font = Theme.FontBold,
			TextSize = 26,
			TextColor3 = Theme.Colors.Text,
			BackgroundColor3 = Theme.Colors.Surface,
			BackgroundTransparency = 0.25,
			AutoButtonColor = false,
			Parent = gui,
		}
		for k, v in pairs(props) do
			base[k] = v
		end
		local b = Kit.new("TextButton", base)
		Kit.Corner(b, UDim.new(0, 18))
		Kit.Stroke(b, Theme.Colors.Stroke, 2, 0.2)
		local normal = b.BackgroundColor3
		b.InputBegan:Connect(function(input)
			if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
				if self.Active[input] then
					return
				end
				b.BackgroundColor3 = PRESS_COLOR
				onDown()
				self.Active[input] = function()
					b.BackgroundColor3 = normal
					onUp()
				end
			end
		end)
		return b
	end

	local function tapButton(icon: string, label: string, order: number, action: string, hold: boolean?)
		local b = holdButton(icon, {
			Size = UDim2.fromOffset(56, 56),
			TextSize = 24,
			LayoutOrder = order,
			Parent = nil,
		}, function()
			local h = self.Handlers[action]
			if h then
				task.spawn(h, true)
			end
		end, function()
			if hold then
				local h = self.Handlers[action]
				if h then
					task.spawn(h, false)
				end
			end
		end)
		Kit.new("TextLabel", {
			Text = label,
			BackgroundTransparency = 1,
			Size = UDim2.new(1, 0, 0, 12),
			Position = UDim2.new(0, 0, 1, -14),
			TextSize = 10,
			Font = Theme.Font,
			TextColor3 = Theme.Colors.TextDim,
			Parent = b,
		})
		return b
	end

	-- steering ------------------------------------------------------------
	local left = holdButton("◀", {
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 16, 1, -18),
		Size = UDim2.fromOffset(96, 96),
		TextSize = 40,
	}, function()
		self.LeftDown = true
		self:_UpdateSteer()
	end, function()
		self.LeftDown = false
		self:_UpdateSteer()
	end)
	local right = holdButton("▶", {
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 124, 1, -18),
		Size = UDim2.fromOffset(96, 96),
		TextSize = 40,
	}, function()
		self.RightDown = true
		self:_UpdateSteer()
	end, function()
		self.RightDown = false
		self:_UpdateSteer()
	end)
	self.SteerButtons = { left, right }

	-- pedals ----------------------------------------------------------------
	local gas = holdButton("⛽\nGAS", {
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -16, 1, -18),
		Size = UDim2.fromOffset(88, 150),
		TextSize = 18,
		BackgroundColor3 = Color3.fromRGB(30, 70, 46),
	}, function()
		self.State.Throttle = 1
	end, function()
		self.State.Throttle = 0
	end)
	local brake = holdButton("🛑\nBRAKE", {
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -114, 1, -18),
		Size = UDim2.fromOffset(88, 112),
		TextSize = 16,
		BackgroundColor3 = Color3.fromRGB(80, 30, 34),
	}, function()
		self.State.Brake = 1
	end, function()
		self.State.Brake = 0
	end)
	local handbrake = holdButton("HB", {
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -114, 1, -140),
		Size = UDim2.fromOffset(88, 56),
		TextSize = 18,
	}, function()
		self.State.Handbrake = true
	end, function()
		self.State.Handbrake = false
	end)

	-- manual shift ---------------------------------------------------------------
	local shiftUp = holdButton("＋", {
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -16, 1, -178),
		Size = UDim2.fromOffset(88, 52),
		TextSize = 26,
	}, function()
		local h = self.Handlers.ShiftUp
		if h then
			task.spawn(h, true)
		end
	end, function() end)
	local shiftDown = holdButton("－", {
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -16, 1, -236),
		Size = UDim2.fromOffset(88, 52),
		TextSize = 26,
	}, function()
		local h = self.Handlers.ShiftDown
		if h then
			task.spawn(h, true)
		end
	end, function() end)
	self.ShiftButtons = { shiftUp, shiftDown }
	self.Pedals = { gas, brake, handbrake }

	-- function column -----------------------------------------------------------
	local column = Kit.new("Frame", {
		Name = "Functions",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 16, 1, -126),
		Size = UDim2.fromOffset(124, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Parent = gui,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.fromOffset(56, 56),
		CellPadding = UDim2.fromOffset(8, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		Parent = column,
	})
	local buttons = {
		tapButton("🚗", "Car", 1, "CarMenu"),
		tapButton("🎥", "Cam", 2, "CameraCycle"),
		tapButton("💡", "Lights", 3, "Lights"),
		tapButton("📯", "Horn", 4, "Horn", true),
		tapButton("🎯", "Cruise", 5, "Cruise"),
		tapButton("🚪", "Exit", 6, "Exit"),
	}
	for _, b in ipairs(buttons) do
		b.Parent = column
	end

	self:SetManual(false)
	return self
end

function MobileControls:_UpdateSteer()
	local s = 0
	if self.LeftDown then
		s -= 1
	end
	if self.RightDown then
		s += 1
	end
	self.State.Steer = s
end

function MobileControls:SetManual(manual: boolean)
	for _, b in ipairs(self.ShiftButtons) do
		b.Visible = manual
	end
end

function MobileControls:SetVisible(visible: boolean)
	self.Gui.Enabled = visible
	if not visible then
		-- release everything so no pedal stays stuck
		for input, fn in pairs(self.Active) do
			self.Active[input] = nil
			fn()
		end
	end
end

function MobileControls:Destroy()
	for _, c in ipairs(self.Conns) do
		c:Disconnect()
	end
	table.clear(self.Conns)
	for input, fn in pairs(self.Active) do
		self.Active[input] = nil
		pcall(fn)
	end
	self.State.Throttle = 0
	self.State.Brake = 0
	self.State.Steer = 0
	self.State.Handbrake = false
	if self.Gui then
		self.Gui:Destroy()
	end
end

return MobileControls
