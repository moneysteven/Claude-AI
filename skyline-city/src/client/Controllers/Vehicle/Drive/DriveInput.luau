-- DriveInput: all driver inputs while seated in a DriveSeat.
--   PC:      ContextActionService keybinds from Config/Driving.Keys (bound at high priority so Space =
--            handbrake instead of jumping out; F exits through VehicleAction "Exit").
--   Gamepad: RT throttle, LT brake/reverse, left stick steer + the buttons in Config/Driving.Keys.
--   Mobile:  MobileControls on-screen pedals / steering / function buttons.
--
--   local input = DriveInput.new(handlers)   -- handlers[action](pressed: boolean) for discrete actions
--   input:GetState() -> { Throttle, Brake, Steer, SteerAnalog, Handbrake }
--   input:SetManual(bool)   (shows mobile +/- buttons)
--   input:Destroy()         (unbinds everything)
--
-- Gamepad buttons pass through to the UI while the car menu is open / a GUI object is selected, so
-- ButtonB still closes panels and ButtonA still clicks.

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Driving = require(Shared.Config.Driving)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local UI = Client:WaitForChild("UI")
local Router = require(UI:WaitForChild("Router"))
local Kit = require(UI:WaitForChild("Kit"))

local MobileControls = require(script.Parent.MobileControls)

local DriveInput = {}
DriveInput.__index = DriveInput

local PREFIX = "SkyDrive_"

-- held (analogue-ish) actions: tracked per key, not forwarded to handlers
local HELD = { Throttle = true, Brake = true, SteerLeft = true, SteerRight = true, Handbrake = true }
-- discrete actions that also report their release
local RELEASE = { Horn = true, LookBehind = true }

local function isGamepad(input: InputObject?): boolean
	return input ~= nil and input.UserInputType.Name:sub(1, 7) == "Gamepad"
end

local function deadzone(x: number): number
	local dz = Driving.GamepadDeadzone
	local a = math.abs(x)
	if a < dz then
		return 0
	end
	return math.sign(x) * (a - dz) / (1 - dz)
end

function DriveInput.new(handlers: { [string]: (boolean) -> () })
	local self = setmetatable({}, DriveInput)
	self.Handlers = handlers
	self.Down = {} -- action -> { [KeyCode] = true }
	self.Pad = { Throttle = 0, Brake = 0, Steer = 0 }
	self.Touch = { Throttle = 0, Brake = 0, Steer = 0, Handbrake = false }
	self.Bound = {}
	self.Conns = {}

	local priority = Driving.ActionPriority
	for action, keys in pairs(Driving.Keys) do
		if type(keys) == "table" and #keys > 0 then
			local name = PREFIX .. action
			ContextActionService:BindActionAtPriority(name, function(_, state, input)
				return self:_OnAction(action, state, input)
			end, false, priority, table.unpack(keys))
			table.insert(self.Bound, name)
		end
	end

	-- analogue gamepad
	ContextActionService:BindActionAtPriority(PREFIX .. "PadThrottle", function(_, state, input)
		return self:_OnAnalog("Throttle", state, input)
	end, false, priority, Enum.KeyCode.ButtonR2)
	ContextActionService:BindActionAtPriority(PREFIX .. "PadBrake", function(_, state, input)
		return self:_OnAnalog("Brake", state, input)
	end, false, priority, Enum.KeyCode.ButtonL2)
	ContextActionService:BindActionAtPriority(PREFIX .. "PadSteer", function(_, state, input)
		return self:_OnAnalog("Steer", state, input)
	end, false, priority, Enum.KeyCode.Thumbstick1)
	table.insert(self.Bound, PREFIX .. "PadThrottle")
	table.insert(self.Bound, PREFIX .. "PadBrake")
	table.insert(self.Bound, PREFIX .. "PadSteer")

	-- touch
	if UserInputService.TouchEnabled then
		self.Mobile = MobileControls.new(self.Touch, handlers)
		local function refresh()
			local last = UserInputService:GetLastInputType()
			local touch = last == Enum.UserInputType.Touch or Kit.IsMobile()
			if last.Name:sub(1, 7) == "Gamepad" or last == Enum.UserInputType.Keyboard then
				touch = false
			end
			self.Mobile:SetVisible(touch)
		end
		refresh()
		table.insert(self.Conns, UserInputService.LastInputTypeChanged:Connect(refresh))
	end
	return self
end

-- true while a Router layer (windows / modals) has something on screen
local function layerBusy(name: string): boolean
	local layer = Router.GetLayer(name)
	if not layer or not layer.Enabled then
		return false
	end
	for _, child in ipairs(layer:GetChildren()) do
		if child:IsA("GuiObject") and child.Visible then
			return true
		end
	end
	return false
end

-- Router selects a button when a window opens on gamepad; the car menu also owns the pad while open.
-- `buttons` = discrete face-button actions: these also pass through while ANY window / modal is on screen,
-- so ButtonB closes that window (fuel pump, tuning...) instead of exiting the car. Pedals / steering stay
-- live in that case so an open HUD-style panel can never leave the car undrivable.
function DriveInput:_UiWantsGamepad(buttons: boolean?): boolean
	if GuiService.SelectedObject ~= nil or Router.IsOpen("CarControls") then
		return true
	end
	return buttons == true and (layerBusy("Panels") or layerBusy("Modal"))
end

-- actions that keep working on the gamepad even while a menu is open (they toggle that menu)
local ALWAYS = { CarMenu = true }

function DriveInput:_OnAction(action: string, state: Enum.UserInputState, input: InputObject)
	if UserInputService:GetFocusedTextBox() then
		return Enum.ContextActionResult.Pass
	end
	if isGamepad(input) and not ALWAYS[action] and self:_UiWantsGamepad(not HELD[action]) and state == Enum.UserInputState.Begin then
		return Enum.ContextActionResult.Pass
	end
	local began = state == Enum.UserInputState.Begin
	local ended = state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel
	if HELD[action] then
		local set = self.Down[action]
		if not set then
			set = {}
			self.Down[action] = set
		end
		if began then
			set[input.KeyCode] = true
		elseif ended then
			set[input.KeyCode] = nil
		end
		return Enum.ContextActionResult.Sink
	end
	local handler = self.Handlers[action]
	if handler then
		if began then
			task.spawn(handler, true)
		elseif ended and RELEASE[action] then
			task.spawn(handler, false)
		end
	end
	return Enum.ContextActionResult.Sink
end

function DriveInput:_OnAnalog(kind: string, state: Enum.UserInputState, input: InputObject)
	if self:_UiWantsGamepad() then
		self.Pad[kind] = 0
		return Enum.ContextActionResult.Pass
	end
	local ended = state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel
	if kind == "Steer" then
		self.Pad.Steer = ended and 0 or deadzone(input.Position.X)
	else
		self.Pad[kind] = ended and 0 or math.clamp(input.Position.Z, 0, 1)
	end
	return Enum.ContextActionResult.Sink
end

function DriveInput:_Held(action: string): boolean
	local set = self.Down[action]
	return set ~= nil and next(set) ~= nil
end

function DriveInput:GetState()
	local keyThrottle = self:_Held("Throttle") and 1 or 0
	local keyBrake = self:_Held("Brake") and 1 or 0
	local keySteer = (self:_Held("SteerRight") and 1 or 0) - (self:_Held("SteerLeft") and 1 or 0)
	local steer, analog = keySteer, false
	if math.abs(self.Pad.Steer) > 0.01 then
		steer, analog = self.Pad.Steer, true
	elseif self.Touch.Steer ~= 0 then
		steer = self.Touch.Steer
	end
	return {
		Throttle = math.max(keyThrottle, self.Pad.Throttle, self.Touch.Throttle),
		Brake = math.max(keyBrake, self.Pad.Brake, self.Touch.Brake),
		Steer = steer,
		SteerAnalog = analog,
		Handbrake = self:_Held("Handbrake") or self.Touch.Handbrake == true,
	}
end

function DriveInput:SetManual(manual: boolean)
	if self.Mobile then
		self.Mobile:SetManual(manual)
	end
end

function DriveInput:Destroy()
	for _, name in ipairs(self.Bound) do
		ContextActionService:UnbindAction(name)
	end
	table.clear(self.Bound)
	for _, c in ipairs(self.Conns) do
		c:Disconnect()
	end
	table.clear(self.Conns)
	if self.Mobile then
		self.Mobile:Destroy()
		self.Mobile = nil
	end
	table.clear(self.Down)
	self.Pad.Throttle, self.Pad.Brake, self.Pad.Steer = 0, 0, 0
end

return DriveInput
