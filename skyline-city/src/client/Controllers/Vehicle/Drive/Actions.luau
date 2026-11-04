-- Actions: every car function the driver / passengers can trigger, sent to the server as
-- Net.Send("VehicleAction", action, ...) (ARCHITECTURE §9). The server validates & sets attributes;
-- CarVisualsController animates them. Used by DriveInput keybinds, the dashboard and the CarControls panel.
--
--   Actions.Send(action, ...)                 non-yielding fire-and-forget
--   Actions.CycleLights(model)                off → low → high → off
--   Actions.Indicator(model, "Left"|"Right")  toggles
--   Actions.ToggleWindow(model, door)         FL/FR/RL/RR, rolls down if mostly up and vice-versa
--   Actions.SetWindow(door, value 0..1)
--   Actions.ToggleAllWindows(model)
--   Actions.Engine(model)                     start / stop with damage + fuel checks
--   Actions.Radio(stationId | "off" | "next")
--   Actions.StationName(id) -> string
--   Actions.GetCarModel(seatPart) -> Model?   finds the car model a seat belongs to

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Audio = require(Shared.Config.Audio)
local Driving = require(Shared.Config.Driving)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))

local Actions = {}

Actions.Doors = { "FL", "FR", "RL", "RR" }
Actions.DoorNames = { FL = "Front left", FR = "Front right", RL = "Rear left", RR = "Rear right" }

function Actions.Send(action: string, ...)
	local args = table.pack(...)
	task.spawn(function()
		Net.Send("VehicleAction", action, table.unpack(args, 1, args.n))
	end)
end

function Actions.IsCar(model: Instance?): boolean
	if not model or not model:IsA("Model") then
		return false
	end
	return model:GetAttribute("CarUid") ~= nil
		or model:GetAttribute("IsJobVehicle") == true
		or model:GetAttribute("IsTestDrive") == true
end

function Actions.GetCarModel(seat: Instance?): Model?
	local node = seat and seat.Parent
	while node and node ~= workspace do
		if Actions.IsCar(node) then
			return node :: Model
		end
		node = node.Parent
	end
	return nil
end

function Actions.CycleLights(model: Model)
	local level = model:GetAttribute("Headlights") or 0
	if level == 0 then
		Actions.Send("Lights") -- off → low
	elseif level == 1 then
		Actions.Send("HighBeam") -- low → high
	else
		Actions.Send("Lights") -- high → off
	end
end

function Actions.Indicator(model: Model, dir: string)
	Actions.Send("Indicator", dir)
end

function Actions.SetWindow(door: string, value: number)
	Actions.Send("Window", door, math.clamp(value, 0, 1))
end

function Actions.ToggleWindow(model: Model, door: string)
	local v = model:GetAttribute("Window_" .. door) or 0
	Actions.Send("Window", door, (v < 0.5) and 1 or 0)
end

function Actions.ToggleAllWindows(model: Model)
	local sum = 0
	for _, d in ipairs(Actions.Doors) do
		sum += model:GetAttribute("Window_" .. d) or 0
	end
	Actions.Send("AllWindows", (sum / 4 < 0.5) and 1 or 0)
end

-- Returns false (and tells the player why) if the engine can't start.
function Actions.Engine(model: Model): boolean
	local running = model:GetAttribute("Engine") == true
	if not running then
		local health = model:GetAttribute("Health") or 100
		if health < Driving.Damage.NoStartHealth then
			Router.Notify("The engine won't start — the car is too damaged. Visit a mechanic.", "error")
			return false
		end
		local fuel = model:GetAttribute("Fuel") or 1
		if fuel <= 0 then
			Router.Notify("Out of fuel! Find a fuel pump.", "warning")
			return false
		end
	end
	Actions.Send("Engine")
	return true
end

function Actions.Radio(station: string)
	Actions.Send("Radio", station)
end

function Actions.StationName(id: any): string
	if type(id) ~= "string" or id == "" or id == "off" then
		return "Off"
	end
	for _, st in ipairs(Audio.Radio or {}) do
		if st.Id == id then
			return st.Name
		end
	end
	return id
end

return Actions
