-- VehicleStats: reads a car's definition from Config/Cars defensively and fills every missing field
-- with Config/Driving.DefaultStats, so the chassis never indexes nil.
--
--   local def = VehicleStats.Resolve(modelId)   -- { Id, Name, Class, Electric, Features = {...}, Stats = {...} }
--   VehicleStats.GetCars() -> table?             -- the raw Config/Cars table (nil if not installed)

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Driving = require(ReplicatedStorage.Shared.Config.Driving)

local VehicleStats = {}

local carsCache: any = nil
local carsTried = false

function VehicleStats.GetCars(): any
	if carsTried then
		return carsCache
	end
	carsTried = true
	local configFolder = ReplicatedStorage.Shared:FindFirstChild("Config")
	local module = configFolder and configFolder:FindFirstChild("Cars")
	if module and module:IsA("ModuleScript") then
		local ok, result = pcall(require, module)
		if ok and type(result) == "table" then
			carsCache = result
		else
			warn("[VehicleStats] Config/Cars failed to load:", result)
		end
	end
	return carsCache
end

local function num(v: any, default: number, min: number?, max: number?): number
	if type(v) ~= "number" or v ~= v then
		return default
	end
	if min and v < min then
		return min
	end
	if max and v > max then
		return max
	end
	return v
end

local function findDef(cars: any, modelId: string?): any
	if type(cars) ~= "table" or type(modelId) ~= "string" then
		return nil
	end
	local def = cars[modelId]
	if type(def) == "table" then
		return def
	end
	-- some configs keep cars in a `List` / `Cars` array
	for _, key in ipairs({ "List", "Cars", "All" }) do
		local list = cars[key]
		if type(list) == "table" then
			if type(list[modelId]) == "table" then
				return list[modelId]
			end
			for _, d in ipairs(list) do
				if type(d) == "table" and d.Id == modelId then
					return d
				end
			end
		end
	end
	return nil
end

function VehicleStats.Resolve(modelId: string?): { [string]: any }
	local D = Driving.DefaultStats
	local def = findDef(VehicleStats.GetCars(), modelId) or {}
	local s = type(def.Stats) == "table" and def.Stats or {}
	local features = type(def.Features) == "table" and def.Features or {}

	local idle = num(s.IdleRPM, D.IdleRPM, 300, 3000)
	local redline = num(s.RedlineRPM, D.RedlineRPM, idle + 1500, 20000)

	local gears = {}
	if type(s.Gears) == "table" then
		for _, g in ipairs(s.Gears) do
			if type(g) == "number" and g > 0 then
				table.insert(gears, g)
			end
		end
	end
	if #gears == 0 then
		gears = table.clone(D.Gears)
	end
	-- gears must be descending
	table.sort(gears, function(a, b)
		return a > b
	end)

	local drivetrain = s.Drivetrain
	if drivetrain ~= "RWD" and drivetrain ~= "FWD" and drivetrain ~= "AWD" then
		drivetrain = D.Drivetrain
	end

	local stats = {
		Mass = num(s.Mass, D.Mass, 80, 40000),
		Horsepower = num(s.Horsepower, D.Horsepower, 5, 3000),
		PeakTorque = num(s.PeakTorque, D.PeakTorque, 5, 5000),
		IdleRPM = idle,
		RedlineRPM = redline,
		TorqueCurve = s.TorqueCurve,
		Gears = gears,
		ReverseGear = num(s.ReverseGear, D.ReverseGear, 0.5, 10),
		FinalDrive = num(s.FinalDrive, D.FinalDrive, 0.5, 15),
		TopSpeed = num(s.TopSpeed, D.TopSpeed, 10, 400),
		Drivetrain = drivetrain,
		BrakeForce = num(s.BrakeForce, D.BrakeForce, 0.05, 2),
		SteerAngle = num(s.SteerAngle, D.SteerAngle, 5, 60),
		SuspensionStiffness = num(s.SuspensionStiffness, D.SuspensionStiffness, 0, 1e9),
		SuspensionDamping = num(s.SuspensionDamping, D.SuspensionDamping, 0, 1e9),
		RideHeight = num(s.RideHeight, D.RideHeight, 0.2, 20),
		SuspensionTravel = num(s.SuspensionTravel, D.SuspensionTravel, 0.2, 6),
		Grip = num(s.Grip, D.Grip, 0.2, 3),
		DriftGrip = num(s.DriftGrip, D.DriftGrip, 0.05, 1.5),
		FuelCapacity = num(s.FuelCapacity, D.FuelCapacity, 1, 1000),
		FuelEconomy = num(s.FuelEconomy, D.FuelEconomy, 0, 200),
		WheelRadius = type(s.WheelRadius) == "number" and s.WheelRadius > 0 and s.WheelRadius or nil,
		Wheelbase = num(s.Wheelbase, D.Wheelbase, 1, 60),
		TrackWidth = num(s.TrackWidth, D.TrackWidth, 0.5, 30),
		Downforce = type(s.Downforce) == "number" and s.Downforce or nil,
	}

	return {
		Id = def.Id or modelId or "unknown",
		Brand = type(def.Brand) == "string" and def.Brand or "",
		Name = type(def.Name) == "string" and def.Name or (modelId or "Car"),
		Class = type(def.Class) == "string" and def.Class or "Sedan",
		Electric = def.Electric == true or s.Electric == true,
		Seats = num(def.Seats, 4, 1, 16),
		Features = {
			Sunroof = features.Sunroof == true,
			Convertible = features.Convertible == true,
			Doors = (features.Doors == 2 or features.Doors == 0) and features.Doors or 4,
			Siren = features.Siren == true,
		},
		Stats = stats,
	}
end

-- Normalise a "relative" suspension value: numbers in 0..10 are multipliers around 1; anything outside
-- that range (absolute physical units from another tool) is ignored and treated as 1.
function VehicleStats.Relative(v: number?, min: number, max: number): number
	if type(v) ~= "number" or v <= 0 or v > 10 then
		return 1
	end
	return math.clamp(v, min, max)
end

return VehicleStats
