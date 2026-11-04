-- DriveController: realistic client-side driving.
-- When the LocalPlayer sits in a car's DriveSeat (model with CarUid / IsJobVehicle / IsTestDrive) the
-- server hands us network ownership and we run the raycast chassis (Drive/Chassis) every Heartbeat:
-- spring-damper suspension, slip-based tyres, torque-curve engine, auto/manual gearbox, ABS brakes,
-- aero drag calibrated to the car's TopSpeed, EV mode, cruise control, damage & fuel effects, crash
-- shake / unbelted ejection. Inputs: Drive/DriveInput (PC, gamepad, mobile). Camera: Drive/VehicleCamera.
-- Rear-view mirror: Drive/Mirrors. Telemetry → server (unreliable, 5 Hz): never used for money.
--
-- API (client):
--   DriveController:IsDriving() -> bool
--   DriveController:GetVehicle() -> Model?           (car we are driving)
--   DriveController:GetSeatVehicle() -> (Model?, isDriver: bool)  (driver OR passenger seat)
--   DriveController:GetDefinition() -> table?        (VehicleStats.Resolve result for the driven car)
--   DriveController:GetChassis() -> Chassis?
--   DriveController:GetTelemetry() -> table?         { Speed, ForwardSpeed (studs/s), Rpm, Idle, Redline, Gear,
--                                                     GearLabel, Throttle, Brake, Reverse, Manual, Electric,
--                                                     Cruise, CruiseSpeed, TopSpeed (studs/s), EngineOn,
--                                                     Handbrake, Skid }
--   DriveController:IsManual() -> bool   DriveController:SetManual(bool)
--   DriveController:ToggleCruise()       DriveController:CycleCamera() -> modeName
--   DriveController:ToggleMirror() -> bool   DriveController:IsMirrorVisible() -> bool
--   DriveController.Entered : Signal(model)   DriveController.Exited : Signal(model)
--   DriveController.ManualChanged : Signal(bool)   DriveController.Crashed : Signal(impactMph)
--   DriveController:GetRPM() -> number                (0 when not driving)
--
-- FINAL KEYBINDS (full list for every system: docs/CONTROLS.md)
--   Driving keys are bound by Drive/DriveInput at ContextActionService priority Config/Driving.ActionPriority
--   (3100) ONLY while the local player sits in a DriveSeat, and are unbound on exit. They Sink, so on-foot
--   keys that share a key (H Homes, L Leaderboard, N Garage, M Business, J job tracker, B emotes/build,
--   D-pad down emotes, D-pad right city events) are inactive while driving.
--     Throttle W/Up/RT · Brake-Reverse S/Down/LT · Steer A,D/Left,Right/left stick · Handbrake Space/X
--     Shift up E/D-pad up · Shift down Q/D-pad down · Manual toggle M/L3 · Cruise C/L1 · Lights L
--     Horn H/A · Indicators Z,X/D-pad left,right · Hazard V · Interior light I · Engine K · Seatbelt G
--     Radio R · Roof U · Windows 1-4, all 5 · Exit F/B · Car menu O/Select (works while a menu is open)
--     Siren N · Camera Y/R1 · Look behind LeftAlt/R3 · Mirror B · Lock J
--   Higher than driving (they win while seated):
--     Job action G / ButtonY (JobController, priority 3150) - only while a job action is available,
--       otherwise it passes and G stays the seatbelt.
--     End test drive Backspace / ButtonY (TestDriveHud, priority 3200) - only during a test drive.
--     Tuning orbit camera (OrbitCamera, priority 3300) sinks W/A/S/D/arrows/Space/RT/LT while tuning.
--   Lower than everything: Phone P / ButtonY (PhoneController, priority Low) - opens only when no
--     contextual ButtonY action (job, business work, daily claim, panel shortcut) sinks it.
--   Camera: VehicleCamera holds Util/CameraOwner id "Drive" (priority 10); the tuning orbit, phone selfie
--     and build camera take over while active and hand the camera back on exit.

local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Maid = require(Shared.Util.Maid)
local Signal = require(Shared.Util.Signal)
local Driving = require(Shared.Config.Driving)
local Units = require(Shared.Vehicle.Units)
local VehicleStats = require(Shared.Vehicle.VehicleStats)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local UI = Client:WaitForChild("UI")
local Router = require(UI:WaitForChild("Router"))
local Theme = require(UI:WaitForChild("Theme"))
local Kit = require(UI:WaitForChild("Kit"))

local Drive = script.Parent:WaitForChild("Drive")
local Chassis = require(Drive:WaitForChild("Chassis"))
local DriveInput = require(Drive:WaitForChild("DriveInput"))
local VehicleCamera = require(Drive:WaitForChild("VehicleCamera"))
local Mirrors = require(Drive:WaitForChild("Mirrors"))
local DriveAudio = require(Drive:WaitForChild("DriveAudio"))
local Upgrades = require(Drive:WaitForChild("Upgrades"))
local Actions = require(Drive:WaitForChild("Actions"))

local E = Driving.Engine
local DMG = Driving.Damage
local CR = Driving.Cruise
local CRASH = Driving.Crash

local DriveController = {
	Name = "DriveController",
	Priority = 60,
}

DriveController.Entered = Signal.new()
DriveController.Exited = Signal.new()
DriveController.ManualChanged = Signal.new()
DriveController.Crashed = Signal.new()

local localPlayer = Players.LocalPlayer
local session: { [string]: any }? = nil
local seatVehicle: Model? = nil
local charMaid = Maid.new()
local mirrorPreference = Driving.Mirror.Enabled

---------------------------------------------------------------------------
-- Settings helpers
---------------------------------------------------------------------------
local function getSetting(key: string): any
	local sc = Registry.Find("SettingsController")
	if sc and type(sc.Get) == "function" then
		local ok, v = pcall(sc.Get, sc, key)
		if ok and v ~= nil then
			return v
		end
	end
	return ClientData.Get("Settings." .. key)
end

local function setSetting(key: string, value: any)
	local sc = Registry.Find("SettingsController")
	if sc and type(sc.Set) == "function" then
		pcall(sc.Set, sc, key, value)
	end
end

local function units(): string
	return getSetting("Units") == "KMH" and "KMH" or "MPH"
end

---------------------------------------------------------------------------
-- Session pieces
---------------------------------------------------------------------------
local function endDrive()
	local s = session
	if not s then
		return
	end
	session = nil
	if s.HornDown then
		Actions.Send("Horn", false)
	end
	s.Maid:Clean()
	DriveController.Exited:Fire(s.Model)
end

local function attrNumber(model: Model, name: string, default: number): number
	local v = model:GetAttribute(name)
	if type(v) ~= "number" or v ~= v then
		return default
	end
	return v
end

local function eject(s)
	s.LastEject = os.clock()
	local hum: Humanoid = s.Humanoid
	Router.Notify("Ouch! You flew out — you weren't wearing a seatbelt. Press G (or the car menu) to buckle up.", "warning", 6)
	Actions.Send("Exit")
	task.delay(0.35, function()
		if hum.Parent and hum.Health > 0 then
			if hum.SeatPart then
				hum.Sit = false
				hum.Jump = true
			end
			hum:ChangeState(Enum.HumanoidStateType.FallingDown)
			task.delay(CRASH.StumbleTime, function()
				if hum.Parent and hum.Health > 0 then
					hum:ChangeState(Enum.HumanoidStateType.GettingUp)
				end
			end)
		end
	end)
end

local function step(s, dt: number)
	local model: Model = s.Model
	local chassis = s.Chassis
	local st = s.Input:GetState()
	local engineOn = model:GetAttribute("Engine") == true
	local fuel = attrNumber(model, "Fuel", 1)
	local health = attrNumber(model, "Health", 100)
	local throttle, brake = st.Throttle, st.Brake

	-- cruise control
	if s.Cruise then
		local cancel = brake > 0.05 or st.Handbrake or not engineOn or chassis.Gear == -1 or fuel <= 0
		if cancel then
			s.Cruise = nil
			Router.Notify("Cruise control off", "info", 2)
		else
			local err = s.Cruise - chassis.ForwardSpeed
			throttle = math.max(throttle, math.clamp(CR.BaseThrottle + err * CR.Gain, 0, 1))
		end
	end

	-- fuel: sputter when nearly empty, nothing when empty
	if fuel <= 0 then
		if throttle > 0.3 and os.clock() - (s.FuelHint or 0) > 8 then
			s.FuelHint = os.clock()
			Router.Notify("Out of fuel! Find a fuel pump ⛽", "warning", 4)
		end
		throttle = 0
	elseif fuel < E.IdleSputterFuel and math.random() < 0.35 then
		throttle *= 0.1
	end

	-- damage
	local powerScale = 1
	if health < DMG.NoStartHealth then
		powerScale = 0
	elseif health < DMG.LowHealth then
		powerScale = DMG.LowHealthPower
	end

	-- engine off: friendly auto start on throttle, otherwise a hint
	if not engineOn and st.Throttle > 0.3 and os.clock() - s.LastStart > E.StartCooldown then
		s.LastStart = os.clock()
		if E.AutoStartOnThrottle then
			if Actions.Engine(model) then
				Router.Notify("Starting engine… (K to start / stop)", "info", 2)
			end
		else
			Router.Notify("The engine is off — press K to start it", "info", 3)
		end
	end

	chassis:Step(dt, {
		Throttle = throttle,
		Brake = brake,
		Steer = st.Steer,
		SteerAnalog = st.SteerAnalog,
		Handbrake = st.Handbrake,
		Manual = s.Manual,
		EngineOn = engineOn,
		PowerScale = powerScale,
	})
	s.Handbrake = st.Handbrake
	s.EngineOn = engineOn

	-- crash feel
	local impact = chassis.Impact
	if impact > CRASH.ShakeImpactMph then
		local strength = (impact - CRASH.ShakeImpactMph) / math.max(1, CRASH.ShakeFullMph - CRASH.ShakeImpactMph)
		s.Camera:Shake(math.clamp(strength, 0.15, 1.2))
		if impact > CRASH.ShakeImpactMph * 1.5 and os.clock() - (s.LastCrash or 0) > 0.5 then
			s.LastCrash = os.clock()
			DriveController.Crashed:Fire(impact)
		end
	end
	if chassis.ImpactHorizontal > CRASH.EjectImpactMph
		and localPlayer:GetAttribute("Seatbelt") ~= true
		and os.clock() - s.LastEject > CRASH.EjectCooldown
	then
		eject(s)
	end
	if chassis.Flipped then
		Router.Notify("Your car was put back on its wheels", "info", 3)
	end
end

local function handlersFor(s)
	local model: Model = s.Model
	local def = s.Def
	local function features()
		return def.Features
	end
	local function shift(up: boolean)
		if def.Electric then
			Router.Notify("Electric cars have a single gear", "info", 2)
			return
		end
		if not s.Manual then
			DriveController:SetManual(true)
		end
		local pt = s.Chassis.Powertrain
		local speed = Units.StudsToMps(s.Chassis.ForwardSpeed)
		local ok, reason
		if up then
			ok, reason = pt:ShiftUp(speed)
		else
			ok, reason = pt:ShiftDown(speed)
		end
		if not ok and reason then
			Router.Notify(reason, "warning", 2)
		end
	end
	local function window(door: string)
		if features().Doors == 2 and (door == "RL" or door == "RR") then
			Router.Notify("This car has no rear windows", "info", 2)
			return
		end
		Actions.ToggleWindow(model, door)
	end
	return {
		ShiftUp = function(pressed)
			if pressed then
				shift(true)
			end
		end,
		ShiftDown = function(pressed)
			if pressed then
				shift(false)
			end
		end,
		ManualToggle = function(pressed)
			if pressed then
				DriveController:SetManual(not s.Manual)
			end
		end,
		Cruise = function(pressed)
			if pressed then
				DriveController:ToggleCruise()
			end
		end,
		Lights = function(pressed)
			if pressed then
				Actions.CycleLights(model)
			end
		end,
		Horn = function(pressed)
			if pressed ~= s.HornDown then
				s.HornDown = pressed
				Actions.Send("Horn", pressed)
			end
		end,
		IndicatorLeft = function(pressed)
			if pressed then
				Actions.Indicator(model, "Left")
			end
		end,
		IndicatorRight = function(pressed)
			if pressed then
				Actions.Indicator(model, "Right")
			end
		end,
		Hazard = function(pressed)
			if pressed then
				Actions.Send("Hazard")
			end
		end,
		InteriorLight = function(pressed)
			if pressed then
				Actions.Send("InteriorLight")
			end
		end,
		Engine = function(pressed)
			if pressed then
				Actions.Engine(model)
			end
		end,
		Seatbelt = function(pressed)
			if pressed then
				Actions.Send("Seatbelt")
			end
		end,
		Radio = function(pressed)
			if pressed then
				Actions.Radio("next")
			end
		end,
		Roof = function(pressed)
			if not pressed then
				return
			end
			if features().Convertible then
				Actions.Send("Roof")
			elseif features().Sunroof then
				Actions.Send("Sunroof")
			else
				Router.Notify("This car has no sunroof or soft top", "info", 2)
			end
		end,
		WindowFL = function(pressed)
			if pressed then
				window("FL")
			end
		end,
		WindowFR = function(pressed)
			if pressed then
				window("FR")
			end
		end,
		WindowRL = function(pressed)
			if pressed then
				window("RL")
			end
		end,
		WindowRR = function(pressed)
			if pressed then
				window("RR")
			end
		end,
		AllWindows = function(pressed)
			if pressed then
				Actions.ToggleAllWindows(model)
			end
		end,
		Exit = function(pressed)
			if not pressed then
				return
			end
			local hum: Humanoid = s.Humanoid
			local seat = s.Seat
			Actions.Send("Exit")
			-- fallback if no server handler unseats us
			task.delay(1.5, function()
				if hum.Parent and hum.SeatPart == seat and session == s then
					hum.Sit = false
					hum.Jump = true
				end
			end)
		end,
		CarMenu = function(pressed)
			if not pressed then
				return
			end
			local dash = Registry.Find("DashboardController")
			if dash and type(dash.ToggleControls) == "function" then
				dash:ToggleControls()
			else
				Router.Toggle("CarControls", { Model = model })
			end
		end,
		Siren = function(pressed)
			if not pressed then
				return
			end
			if features().Siren or model:GetAttribute("Siren") ~= nil then
				Actions.Send("Siren")
			else
				Router.Notify("This vehicle has no siren", "info", 2)
			end
		end,
		CameraCycle = function(pressed)
			if pressed then
				local mode = DriveController:CycleCamera()
				if mode then
					Router.Notify("🎥 " .. (VehicleCamera.ModeNames[mode] or mode), "info", 1.5)
				end
			end
		end,
		LookBehind = function(pressed)
			s.Camera:SetLookBehind(pressed)
		end,
		Mirror = function(pressed)
			if pressed then
				DriveController:ToggleMirror()
			end
		end,
		Lock = function(pressed)
			if pressed then
				Actions.Send("Lock")
			end
		end,
	}
end

local function startDrive(model: Model, seat: VehicleSeat, character: Model, humanoid: Humanoid)
	endDrive()
	local root = model.PrimaryPart or model:FindFirstChild("Chassis")
	if not root or not root:IsA("BasePart") then
		warn("[DriveController] car has no Chassis/PrimaryPart:", model:GetFullName())
		return
	end
	local def = VehicleStats.Resolve(model:GetAttribute("ModelId"))
	local levels = Upgrades.GetLevels(model)
	local ok, chassis = pcall(Chassis.new, model, def, Upgrades.Multipliers(levels), character)
	if not ok then
		warn("[DriveController] chassis failed:", chassis)
		return
	end

	local maid = Maid.new()
	local s = {
		Model = model,
		Seat = seat,
		Humanoid = humanoid,
		Character = character,
		Def = def,
		Chassis = chassis,
		Maid = maid,
		Manual = getSetting("ManualTransmission") == true and not def.Electric,
		Cruise = nil :: number?,
		LastStart = 0,
		LastEject = os.clock(),
		HornDown = false,
		Handbrake = false,
		EngineOn = model:GetAttribute("Engine") == true,
	}
	session = s
	maid:Give(function()
		chassis:Destroy()
	end)

	s.Input = DriveInput.new(handlersFor(s))
	s.Input:SetManual(s.Manual)
	maid:Give(s.Input)

	s.Camera = VehicleCamera.new(model, chassis, character)
	s.Camera:SetShakeEnabled(getSetting("CameraShake") ~= false)
	s.Camera:Start()
	maid:Give(function()
		s.Camera:Stop()
	end)

	local gui = Kit.new("ScreenGui", {
		Name = "Skyline_Drive",
		ResetOnSpawn = false,
		IgnoreGuiInset = false,
		DisplayOrder = Theme.Layers.HUD + 1,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets,
		Parent = localPlayer:WaitForChild("PlayerGui"),
	})
	maid:Give(gui)
	s.Mirrors = Mirrors.new(model, chassis, gui)
	s.Mirrors:SetVisible(mirrorPreference)
	maid:Give(s.Mirrors)

	s.Audio = DriveAudio.new(model, chassis, def.Electric, Registry.Find("CarVisualsController") == nil)
	maid:Give(s.Audio)

	-- the default VehicleSeat speedometer and touch thumbstick are replaced by ours
	pcall(function()
		seat.HeadsUpDisplay = false
	end)
	if UserInputService.TouchEnabled then
		local prev = GuiService.TouchControlsEnabled
		GuiService.TouchControlsEnabled = false
		maid:Give(function()
			GuiService.TouchControlsEnabled = prev
		end)
	end

	maid:Give(RunService.Heartbeat:Connect(function(dt)
		if session == s then
			step(s, dt)
		end
	end))
	maid:Give(RunService.RenderStepped:Connect(function(dt)
		if session ~= s then
			return
		end
		chassis:UpdateVisuals(dt)
		s.Mirrors:Update(dt)
		s.Audio:Update(dt, s.EngineOn)
	end))

	-- telemetry (unreliable, 5 Hz). Runs in its own thread so a missing remote never stalls physics.
	maid:Give(task.spawn(function()
		local interval = 1 / Driving.Telemetry.Rate
		while session == s do
			task.wait(interval)
			if session ~= s then
				break
			end
			Net.SendUnreliable("VehicleTelemetry", {
				rpm = math.floor(chassis.Rpm + 0.5),
				gear = chassis.Gear,
				throttle = math.floor(chassis.Throttle * 100 + 0.5) / 100,
				brake = chassis.BrakeLight,
				reverse = chassis.Reverse,
			})
		end
	end))

	-- end conditions
	maid:Give(model.AncestryChanged:Connect(function()
		if not model:IsDescendantOf(workspace) then
			endDrive()
		end
	end))
	maid:Give(seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		if seat.Occupant ~= humanoid then
			endDrive()
		end
	end))

	-- live upgrades / settings
	maid:Give(Upgrades.Watch(model, function(newLevels)
		if session == s then
			chassis:SetMultipliers(Upgrades.Multipliers(newLevels))
		end
	end))
	local sc = Registry.Find("SettingsController")
	if sc and sc.Changed then
		maid:Give(sc.Changed:Connect(function(key, value)
			if session ~= s then
				return
			end
			if key == "CameraShake" then
				s.Camera:SetShakeEnabled(value ~= false)
			elseif key == "ManualTransmission" and (value == true) ~= s.Manual and not def.Electric then
				s.Manual = value == true
				chassis.Powertrain:SetManual(s.Manual)
				s.Input:SetManual(s.Manual)
				DriveController.ManualChanged:Fire(s.Manual)
			end
		end))
	end
	maid:Give(localPlayer:GetAttributeChangedSignal("LowGraphics"):Connect(function()
		if session == s then
			s.Mirrors:SetVisible(mirrorPreference)
		end
	end))

	DriveController.Entered:Fire(model)
end

local function onSeat(character: Model, humanoid: Humanoid, active: boolean, seat: BasePart?)
	if active and seat then
		local car = Actions.GetCarModel(seat)
		seatVehicle = car
		if car and seat:IsA("VehicleSeat") and seat.Name == "DriveSeat" then
			startDrive(car, seat, character, humanoid)
			return
		end
	else
		seatVehicle = nil
	end
	endDrive()
end

local function hookCharacter(character: Model)
	charMaid:Clean()
	endDrive()
	local humanoid = character:WaitForChild("Humanoid", 15)
	if not humanoid or not humanoid:IsA("Humanoid") then
		return
	end
	charMaid:Give(humanoid.Seated:Connect(function(active, seat)
		onSeat(character, humanoid, active, seat)
	end))
	charMaid:Give(humanoid.Died:Connect(function()
		seatVehicle = nil
		endDrive()
	end))
	if humanoid.SeatPart then
		onSeat(character, humanoid, true, humanoid.SeatPart)
	end
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function DriveController:IsDriving(): boolean
	return session ~= nil
end

function DriveController:GetVehicle(): Model?
	return session and session.Model or nil
end

function DriveController:GetSeatVehicle(): (Model?, boolean)
	if session then
		return session.Model, true
	end
	if seatVehicle and seatVehicle.Parent then
		return seatVehicle, false
	end
	return nil, false
end

function DriveController:GetDefinition()
	if session then
		return session.Def
	end
	local car = seatVehicle
	if car and car.Parent then
		return VehicleStats.Resolve(car:GetAttribute("ModelId"))
	end
	return nil
end

function DriveController:GetChassis()
	return session and session.Chassis or nil
end

function DriveController:GetTelemetry()
	local s = session
	if not s then
		return nil
	end
	local c = s.Chassis
	local pt = c.Powertrain
	return {
		Speed = c.Speed,
		ForwardSpeed = c.ForwardSpeed,
		Rpm = c.Rpm,
		Idle = pt.Idle,
		Redline = pt.Redline,
		Gear = c.Gear,
		GearLabel = pt:GearLabel(s.Manual, s.EngineOn, c.ForwardSpeed),
		Throttle = c.Throttle,
		Brake = c.BrakeLight,
		Reverse = c.Reverse,
		Manual = s.Manual,
		Electric = s.Def.Electric,
		Cruise = s.Cruise ~= nil,
		CruiseSpeed = s.Cruise,
		TopSpeed = Units.MpsToStuds(pt.TopSpeedMps),
		EngineOn = s.EngineOn,
		Handbrake = s.Handbrake,
		Skid = c.Skid,
	}
end

-- Live engine RPM of the car we are driving (0 when not driving). Cheap: no table allocation,
-- used by CarVisualsController / GarageController for gauges and engine sound pitch.
function DriveController:GetRPM(): number
	local s = session
	if not s or not s.Chassis then
		return 0
	end
	return tonumber(s.Chassis.Rpm) or 0
end

function DriveController:IsManual(): boolean
	return session ~= nil and session.Manual == true
end

function DriveController:SetManual(on: boolean)
	local s = session
	if not s then
		return
	end
	if s.Def.Electric then
		Router.Notify("Electric cars have a single-speed gearbox", "info", 2)
		return
	end
	s.Manual = on == true
	s.Chassis.Powertrain:SetManual(s.Manual)
	s.Input:SetManual(s.Manual)
	setSetting("ManualTransmission", s.Manual)
	DriveController.ManualChanged:Fire(s.Manual)
	if s.Manual then
		Router.Notify("Manual gearbox — E / Q (D-pad ↑ ↓) to shift, M for automatic", "info", 3)
	else
		Router.Notify("Automatic gearbox", "info", 2)
	end
end

function DriveController:ToggleCruise()
	local s = session
	if not s then
		return
	end
	if s.Cruise then
		s.Cruise = nil
		Router.Notify("Cruise control off", "info", 2)
		return
	end
	local speed = s.Chassis.ForwardSpeed
	local mph = Units.StudsToMph(speed)
	if mph < CR.MinMph or not s.EngineOn then
		local unit = units()
		local min = unit == "KMH" and math.floor(CR.MinMph * 1.609 + 0.5) or CR.MinMph
		Router.Notify(("Drive faster than %d %s to set cruise control"):format(min, Units.SpeedLabel(unit)), "info", 2)
		return
	end
	s.Cruise = speed
	local unit = units()
	Router.Notify(("🎯 Cruise set: %d %s (brake to cancel)"):format(math.floor(Units.SpeedIn(speed, unit) + 0.5), Units.SpeedLabel(unit)), "success", 2)
end

function DriveController:CycleCamera(): string?
	if not session then
		return nil
	end
	return session.Camera:Cycle()
end

function DriveController:ToggleMirror(): boolean
	mirrorPreference = not mirrorPreference
	if session then
		session.Mirrors:SetVisible(mirrorPreference)
		if mirrorPreference and localPlayer:GetAttribute("LowGraphics") == true then
			Router.Notify("The mirror is hidden in Low graphics mode", "info", 2)
		end
	end
	return mirrorPreference
end

function DriveController:IsMirrorVisible(): boolean
	return session ~= nil and session.Mirrors:IsVisible()
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function DriveController:Init() end

function DriveController:Start()
	localPlayer.CharacterAdded:Connect(hookCharacter)
	localPlayer.CharacterRemoving:Connect(function()
		charMaid:Clean()
		seatVehicle = nil
		endDrive()
	end)
	if localPlayer.Character then
		task.spawn(hookCharacter, localPlayer.Character)
	end
end

return DriveController
