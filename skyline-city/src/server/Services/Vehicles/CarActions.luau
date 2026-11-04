-- CarActions: server handlers for "VehicleAction" (c→s, rate-limited) and "VehicleTelemetry"
-- (c→s, unreliable). Every argument is validated; only attributes from ARCHITECTURE §9 are touched.
--
--   CarActions.Handle(ctx, player, action, a, b)
--   CarActions.Telemetry(ctx, player, payload | rpm, gear, brake, reverse)
--
-- Permissions: the driver controls everything; passengers may roll their own window, open their own door,
-- toggle the interior light / radio, buckle up and exit. The owner (or a keyholder) standing within
-- Config.Vehicles.Interaction.OwnerOutsideRange may lock / unlock and open doors, hood and trunk from outside.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local VehiclesConfig = require(Shared.Config.Vehicles)
local Audio = require(Shared.Config.Audio)
local Units = require(Shared.Vehicle.Units)
local Guard = require(ServerScriptService.Server.Lib.Guard)

local Occupancy = require(script.Parent.Occupancy)

local CarActions = {}

local I = VehiclesConfig.Interaction
local D = VehiclesConfig.Damage
local DOORS = { FL = true, FR = true, RL = true, RR = true }
local DIRS = { Left = true, Right = true }

local function speedMph(info): number
	return Units.StudsToMph(info.Root.AssemblyLinearVelocity.Magnitude)
end

local function hasDoor(info, door: string): boolean
	local doors = info.Model:FindFirstChild("Doors")
	return doors ~= nil and doors:FindFirstChild(door) ~= nil
end

local function hasWindow(info, door: string): boolean
	local doors = info.Model:FindFirstChild("Doors")
	local d = doors and doors:FindFirstChild(door)
	return d ~= nil and d:FindFirstChild("Window", true) ~= nil
end

local function toggle(model: Model, attr: string)
	model:SetAttribute(attr, not (model:GetAttribute(attr) == true))
end

local function stationIds(): { string }
	local ids = {}
	for _, st in ipairs(Audio.Radio or {}) do
		if type(st.Id) == "string" then
			table.insert(ids, st.Id)
		end
	end
	return ids
end

-- The car the player is in, or (for outside actions) their own / keyholder car within range.
local function resolve(ctx, player: Player)
	local seat = Occupancy.SeatOf(player)
	if seat then
		local info = ctx.InfoFromPart(seat)
		if info then
			return info, seat, seat == info.DriveSeat
		end
	end
	return nil, nil, false
end

local function outsideCar(ctx, player: Player)
	local best, bestD = nil, math.huge
	for _, info in pairs(ctx.Cars) do
		if info.Model.Parent and Occupancy.IsKeyholder(ctx, info, player) then
			local pos = Guard.RootPosition(player)
			if pos then
				local d = (info.Root.Position - pos).Magnitude
				if d <= I.OwnerOutsideRange and d < bestD then
					best, bestD = info, d
				end
			end
		end
	end
	return best
end

local function setWindow(model: Model, door: string, value: number)
	model:SetAttribute("Window_" .. door, math.clamp(math.floor(value * 100 + 0.5) / 100, 0, 1))
end

function CarActions.Handle(ctx, player: Player, action: any, a: any, b: any)
	if type(action) ~= "string" or #action > 24 then
		return
	end
	local info, seat, isDriver = resolve(ctx, player)
	local model: Model? = info and info.Model

	-- outside actions (owner / keyholder near the car)
	if not info then
		if action == "Lock" or action == "Door" or action == "Hood" or action == "Trunk" then
			info = outsideCar(ctx, player)
			model = info and info.Model
			if not info or not model then
				return
			end
			if action == "Lock" then
				local want = Guard.Bool(a)
				if want == nil then
					want = not (model:GetAttribute("Locked") == true)
				end
				ctx.SetLocked(info, want, player)
			elseif action == "Door" then
				local door = Guard.OneOf(a, DOORS)
				if door and hasDoor(info, door) and speedMph(info) < I.MaxDoorSpeedMph then
					toggle(model, "Door_" .. door)
				end
			elseif model:FindFirstChild(action) and speedMph(info) < I.MaxDoorSpeedMph then
				toggle(model, action)
			end
		end
		return
	end
	if not model then
		return
	end
	local def = info.Def
	local features = def.Features or {}
	local myDoor = seat and seat:GetAttribute("Door")

	if action == "Exit" then
		Occupancy.ExitSafely(ctx, info, player)
	elseif action == "Seatbelt" then
		player:SetAttribute("Seatbelt", not (player:GetAttribute("Seatbelt") == true))
	elseif action == "InteriorLight" then
		toggle(model, "InteriorLight")
	elseif action == "Radio" then
		local ids = stationIds()
		local current = model:GetAttribute("RadioStation") or ""
		if a == "off" then
			model:SetAttribute("RadioStation", "")
		elseif a == "next" then
			local idx = table.find(ids, current) or 0
			local nextId = ids[idx + 1] or ""
			model:SetAttribute("RadioStation", nextId)
		else
			local id = Guard.Id(a, 40)
			if id and table.find(ids, id) then
				model:SetAttribute("RadioStation", id)
			end
		end
	elseif action == "Window" then
		local door = Guard.OneOf(a, DOORS)
		if not door or not hasWindow(info, door) then
			return
		end
		if not isDriver and myDoor ~= door then
			return
		end
		local value = Guard.Number(b, 0, 1)
		if value == nil then
			value = ((model:GetAttribute("Window_" .. door) or 0) < 0.5) and 1 or 0
		end
		setWindow(model, door, value)
	elseif action == "Door" then
		local door = Guard.OneOf(a, DOORS)
		if not door or not hasDoor(info, door) then
			return
		end
		if not isDriver and myDoor ~= door then
			return
		end
		if speedMph(info) < I.MaxDoorSpeedMph then
			toggle(model, "Door_" .. door)
		end
	elseif not isDriver then
		return -- everything below is driver-only
	elseif action == "Engine" then
		local on = model:GetAttribute("Engine") == true
		if on then
			model:SetAttribute("Engine", false)
		else
			if (info.Fuel or 1) <= 0 then
				ctx.Notify(player, def.Electric and "🔋 The battery is flat." or "⛽ The tank is empty.", "warning", 3)
				return
			end
			if (info.Health or 100) < D.NoStartHealth or model:GetAttribute("EngineDead") == true then
				ctx.Notify(player, "🔧 The engine won't start — the car needs repairs.", "error", 4)
				return
			end
			model:SetAttribute("Engine", true)
		end
	elseif action == "Lights" then
		local h = model:GetAttribute("Headlights") or 0
		model:SetAttribute("Headlights", h == 0 and 1 or 0)
	elseif action == "HighBeam" then
		local h = model:GetAttribute("Headlights") or 0
		model:SetAttribute("Headlights", h == 2 and 1 or 2)
	elseif action == "Indicator" then
		local dir = Guard.OneOf(a, DIRS)
		if dir then
			local cur = model:GetAttribute("Indicator") or ""
			model:SetAttribute("Indicator", cur == dir and "" or dir)
		end
	elseif action == "Hazard" then
		local cur = model:GetAttribute("Indicator") or ""
		model:SetAttribute("Indicator", cur == "Hazard" and "" or "Hazard")
	elseif action == "Horn" then
		local on = Guard.Bool(a)
		if on ~= nil then
			model:SetAttribute("Horn", on)
		end
	elseif action == "AllWindows" then
		local value = Guard.Number(a, 0, 1)
		local sum, n = 0, 0
		for door in pairs(DOORS) do
			if hasWindow(info, door) then
				sum += model:GetAttribute("Window_" .. door) or 0
				n += 1
			end
		end
		if n == 0 then
			return
		end
		if value == nil then
			value = (sum / n < 0.5) and 1 or 0
		end
		for door in pairs(DOORS) do
			if hasWindow(info, door) then
				setWindow(model, door, value)
			end
		end
	elseif action == "Hood" or action == "Trunk" then
		if model:FindFirstChild(action) and speedMph(info) < I.MaxDoorSpeedMph then
			toggle(model, action)
		end
	elseif action == "Sunroof" then
		if features.Sunroof and model:FindFirstChild("Sunroof") then
			local v = model:GetAttribute("Sunroof") or 0
			model:SetAttribute("Sunroof", v < 0.5 and 1 or 0)
		end
	elseif action == "Roof" then
		if features.Convertible and model:FindFirstChild("Roof") and speedMph(info) < I.MaxRoofSpeedMph then
			local v = model:GetAttribute("Roof") or 0
			model:SetAttribute("Roof", v < 0.5 and 1 or 0)
		elseif features.Convertible then
			ctx.Notify(player, "Slow down to move the roof", "info", 2)
		end
	elseif action == "Lock" then
		local want = Guard.Bool(a)
		if want == nil then
			want = not (model:GetAttribute("Locked") == true)
		end
		if info.Kind == "Owned" and not Occupancy.IsKeyholder(ctx, info, player) then
			return
		end
		ctx.SetLocked(info, want, player)
	elseif action == "Siren" then
		if features.Siren then
			toggle(model, "Siren")
		end
	end
end

function CarActions.Telemetry(ctx, player: Player, payload: any, gear: any, brake: any, reverse: any)
	local info, _, isDriver = resolve(ctx, player)
	if not info or not isDriver then
		return
	end
	local now = os.clock()
	if now - (info.TelemetryAt or 0) < 0.18 then
		return -- ≤ ~5 Hz per car
	end
	info.TelemetryAt = now
	local rpm, g, br, rev
	if type(payload) == "table" then
		rpm, g, br, rev = payload.rpm, payload.gear, payload.brake, payload.reverse
	else
		rpm, g, br, rev = payload, gear, brake, reverse
	end
	local model: Model = info.Model
	local stats = info.Def.Stats or {}
	local maxRpm = math.max(2000, (stats.RedlineRPM or 8000) * 1.15)
	if info.Def.Electric then
		maxRpm = 20000
	end
	local r = Guard.Number(rpm, 0, maxRpm)
	if r then
		r = math.floor(r / 25 + 0.5) * 25
		if model:GetAttribute("Engine") ~= true then
			r = 0
		end
		if model:GetAttribute("RPM") ~= r then
			model:SetAttribute("RPM", r)
		end
	end
	local gi = Guard.Int(g, -1, 12)
	if gi and model:GetAttribute("Gear") ~= gi then
		model:SetAttribute("Gear", gi)
	end
	local b = Guard.Bool(br)
	if b ~= nil and model:GetAttribute("Brake") ~= b then
		model:SetAttribute("Brake", b)
	end
	local rv = Guard.Bool(rev)
	if rv ~= nil and model:GetAttribute("Reverse") ~= rv then
		model:SetAttribute("Reverse", rv)
	end
end

return CarActions
