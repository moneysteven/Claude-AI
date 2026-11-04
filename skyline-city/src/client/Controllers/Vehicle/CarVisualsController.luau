-- CarVisualsController: makes every car in view come alive from its replicated attributes (ARCHITECTURE §9).
--
--   * doors, windows, hood, trunk, sunroof slide and convertible roof fold (Motor6D.Transform, smooth)
--   * headlights off / low / high, taillights, brake + reverse lights, indicators & hazards (1.5 Hz, in sync),
--     interior light (also on while a door is open), underglow, siren light bar
--   * engine sound pitched by RPM (the local driver uses DriveController telemetry), horn, siren, door / lock /
--     indicator one-shots, wheel spin for cars driven by other players
--   * in-car radio for the local occupant (Config/Audio.Radio, SoundGroup "Radio")
--   * only cars within Config.Vehicles.Visuals.Range of the camera are animated (LowGraphics: shorter range,
--     no dynamic lights on sirens / underglow, no wheel spin)
--   * StreamingEnabled-safe: cars are discovered with CollectionService (tag Config.Vehicles.Tag) and dropped
--     when they stream out.
--
-- API (client):
--   CarVisualsController:GetRPM(model) -> number    the RPM the visuals use for a car (attribute or local telemetry)

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Maid = require(Shared.Util.Maid)
local VehiclesConfig = require(Shared.Config.Vehicles)
local VehicleStats = require(Shared.Vehicle.VehicleStats)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))

local VisualsFolder = script.Parent:WaitForChild("Visuals")
local CarAnimator = require(VisualsFolder:WaitForChild("CarAnimator"))
local CarLights = require(VisualsFolder:WaitForChild("CarLights"))
local CarSounds = require(VisualsFolder:WaitForChild("CarSounds"))
local Radio = require(VisualsFolder:WaitForChild("Radio"))

local CarVisualsController = {
	Name = "CarVisualsController",
	Priority = 70,
}

local V = VehiclesConfig.Visuals
local TAG = VehiclesConfig.Tag
local DOORS = { "FL", "FR", "RL", "RR" }

local localPlayer = Players.LocalPlayer
local entries: { [Model]: any } = {}

local function driveController()
	return Registry.Find("DriveController")
end

-- the car the local player sits in (any seat)
local function localSeatCar(): (Model?, boolean)
	local dc = driveController()
	if dc and type(dc.GetSeatVehicle) == "function" then
		local ok, model, isDriver = pcall(dc.GetSeatVehicle, dc)
		if ok and model then
			return model, isDriver == true
		end
	end
	local char = localPlayer.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	local node = seat and seat.Parent
	while node and node ~= Workspace do
		if entries[node :: any] then
			return node :: Model, seat.Name == "DriveSeat"
		end
		node = node.Parent
	end
	return nil, false
end

local function localTelemetry(model: Model)
	local dc = driveController()
	if not dc then
		return nil
	end
	if type(dc.GetVehicle) == "function" and dc:GetVehicle() ~= model then
		return nil
	end
	-- full telemetry first (Rpm + Throttle + Brake + Gear feed the sounds / lights); GetRPM is the cheap fallback
	if type(dc.GetTelemetry) == "function" then
		local ok, t = pcall(dc.GetTelemetry, dc)
		if ok and type(t) == "table" then
			return t
		end
	end
	if type(dc.GetRPM) == "function" then
		local ok, rpm = pcall(dc.GetRPM, dc)
		if ok and type(rpm) == "number" then
			return { Rpm = rpm }
		end
	end
	return nil
end

local function snapshotAttributes(model: Model): { [string]: any }
	return model:GetAttributes()
end

local function ensureObjects(e)
	if e.Anim then
		return
	end
	local model = e.Model
	e.Anim = CarAnimator.new(model)
	e.Lights = CarLights.new(model)
	e.Sounds = CarSounds.new(model)
	e.Maid:Give(function()
		e.Anim:Destroy()
		e.Lights:Destroy()
		e.Sounds:Destroy()
	end)
end

local function addCar(model: Instance)
	if not model:IsA("Model") or entries[model] then
		return
	end
	local maid = Maid.new()
	local resolved = VehicleStats.Resolve(model:GetAttribute("ModelId"))
	local e = {
		Model = model,
		Maid = maid,
		Attr = snapshotAttributes(model),
		InRange = false,
		Idle = resolved.Stats.IdleRPM,
		Redline = resolved.Stats.RedlineRPM,
		Electric = resolved.Electric,
		LastBlink = false,
	}
	entries[model] = e
	maid:Give(model.AttributeChanged:Connect(function(name)
		local old = e.Attr[name]
		local new = model:GetAttribute(name)
		e.Attr[name] = new
		if not e.InRange or not e.Sounds then
			return
		end
		if name:sub(1, 5) == "Door_" or name == "Hood" or name == "Trunk" then
			e.Sounds:OneShot(new == true and "DoorOpen" or "DoorClose")
		elseif name == "Locked" and old ~= nil then
			e.Sounds:OneShot("LockBeep")
		elseif name == "Engine" and new == true and old == false then
			e.Sounds:OneShot("EngineStart")
		elseif name:sub(1, 7) == "Window_" and e.LocalOccupant then
			e.Sounds:OneShot("WindowMotor")
		elseif name == "ModelId" then
			local r = VehicleStats.Resolve(new)
			e.Idle, e.Redline, e.Electric = r.Stats.IdleRPM, r.Stats.RedlineRPM, r.Electric
		end
	end))
end

local function removeCar(model: Instance)
	local e = entries[model :: any]
	if not e then
		return
	end
	entries[model :: any] = nil
	e.Maid:Clean()
end

function CarVisualsController:GetRPM(model: Model): number
	local t = localTelemetry(model)
	if t and type(t.Rpm) == "number" then
		return t.Rpm
	end
	local e = entries[model]
	local rpm = e and e.Attr.RPM or model:GetAttribute("RPM")
	return type(rpm) == "number" and rpm or 0
end

local function anyDoorOpen(attr): boolean
	for _, d in ipairs(DOORS) do
		if attr["Door_" .. d] == true then
			return true
		end
	end
	return false
end

local function step(dt: number)
	local camera = Workspace.CurrentCamera
	if not camera then
		return
	end
	local camPos = camera.CFrame.Position
	local low = localPlayer:GetAttribute("LowGraphics") == true
	local range = low and V.LowGraphicsRange or V.Range
	local now = os.clock()
	local seatCar, isDriver = localSeatCar()

	-- radio follows the car we sit in
	if seatCar and entries[seatCar] then
		local st = entries[seatCar].Attr.RadioStation
		Radio.SetStation(type(st) == "string" and st or "")
	elseif Radio.Current() ~= "" then
		Radio.Stop()
	end

	for model, e in pairs(entries) do
		local root = model.PrimaryPart
		if not model.Parent or not root then
			if not model.Parent then
				removeCar(model)
			end
			continue
		end
		local dist = (root.Position - camPos).Magnitude
		local occupant = model == seatCar
		if dist > range and not occupant then
			if e.InRange then
				e.InRange = false
				e.Lights:Reset()
				e.Sounds:Silence()
			end
			continue
		end
		ensureObjects(e)
		if not e.InRange then
			e.InRange = true
			e.Anim:Reset()
		end
		e.LocalOccupant = occupant
		local localDriving = occupant and isDriver
		e.Anim:SetLocalDriver(localDriving)
		local a = e.Attr
		local rpm = a.RPM
		local throttle = 0
		local brake = a.Brake
		if localDriving then
			-- the local driver sees its own engine / brake state instantly (attributes arrive a few frames later)
			local t = localTelemetry(model)
			if t then
				rpm = t.Rpm or rpm
				throttle = t.Throttle or 0
				if t.Brake ~= nil then
					brake = t.Brake
				end
			end
		end
		e.Anim:Update(dt, { SpinWheels = (not low) and dist <= V.WheelSpinRange })
		e.Lights:Update(now, {
			Headlights = a.Headlights,
			Brake = brake,
			Reverse = a.Reverse,
			Indicator = a.Indicator,
			Siren = a.Siren,
			Interior = a.InteriorLight == true or anyDoorOpen(a),
			Underglow = a.Underglow,
			Engine = a.Engine,
			LowGraphics = low,
		})
		-- indicator tick for the people inside
		if occupant and a.Indicator ~= nil and a.Indicator ~= "" then
			local phase = e.Lights.BlinkPhase
			if phase ~= e.LastBlink then
				e.LastBlink = phase
				e.Sounds:OneShot("Indicator")
			end
		end
		e.Sounds:Update(dt, {
			Engine = a.Engine,
			Rpm = type(rpm) == "number" and rpm or e.Idle,
			Idle = e.Idle,
			Redline = e.Redline,
			Electric = e.Electric,
			Horn = a.Horn,
			Siren = a.Siren,
			Throttle = throttle,
			Near = dist <= V.EngineSoundRange or occupant,
		})
	end
end

function CarVisualsController:Init() end

function CarVisualsController:Start()
	for _, m in ipairs(CollectionService:GetTagged(TAG)) do
		addCar(m)
	end
	CollectionService:GetInstanceAddedSignal(TAG):Connect(addCar)
	CollectionService:GetInstanceRemovedSignal(TAG):Connect(removeCar)
	local lastWarn = 0
	RunService.RenderStepped:Connect(function(dt)
		local ok, err = pcall(step, dt)
		if not ok and os.clock() - lastWarn > 5 then
			lastWarn = os.clock()
			warn("[CarVisuals] step error:", err)
		end
	end)
	localPlayer.CharacterRemoving:Connect(function()
		Radio.Stop()
	end)
end

return CarVisualsController
