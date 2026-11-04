-- CarRig: the physics / interaction rig of a car (ARCHITECTURE §9).
--
--   CarRig.CreateModel(name, B) -> (Model, Chassis)       invisible physics box, PrimaryPart, pivot at ground
--   CarRig.Wheels(k, B)                                   Wheels/FL..RR (+ WheelMotor) and Chassis attachments
--   CarRig.Seats(k, B)                                    DriveSeat (VehicleSeat) + Seats/PassengerN + Entry_* attachments
--   CarRig.SetMass(chassis, kg)                           CustomPhysicalProperties so AssemblyMass ≈ kg / KgPerMassUnit
--   CarRig.Finalize(model, chassis)                       collision group, massless visuals, default attributes
--   CarRig.PrepareAsset(model, def, B) -> model           validate / repair a real model from ServerStorage.Assets.Cars
--
-- Mass scale (see Config/Vehicles.Physics): 1 Roblox mass unit ≈ 21.952 kg (1 stud = 0.28 m, density 1 = water).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local VehiclesConfig = require(Shared.Config.Vehicles)

local CarKit = require(script.Parent.CarKit)

local CarRig = {}

local PHYS = VehiclesConfig.Physics
local TYRE = Color3.fromRGB(24, 24, 26)
local INTERIOR = Color3.fromRGB(44, 44, 50)
local WHEELS = { "FL", "FR", "RL", "RR" }

CarRig.DefaultAttributes = {
	Locked = false,
	Engine = false,
	Headlights = 0,
	Indicator = "",
	InteriorLight = false,
	Horn = false,
	RadioStation = "",
	Fuel = 1,
	Health = 100,
	RPM = 0,
	Gear = 0,
	Brake = false,
	Reverse = false,
	Window_FL = 0,
	Window_FR = 0,
	Window_RL = 0,
	Window_RR = 0,
	Door_FL = false,
	Door_FR = false,
	Door_RL = false,
	Door_RR = false,
	Hood = false,
	Trunk = false,
	Sunroof = 0,
	Roof = 0,
	Siren = false,
	IsJobVehicle = false,
	IsTestDrive = false,
}

function CarRig.SetMass(chassis: BasePart, kg: number)
	local units = math.max(1, kg / PHYS.KgPerMassUnit)
	local volume = math.max(0.01, chassis.Size.X * chassis.Size.Y * chassis.Size.Z)
	local density = math.clamp(units / volume, 0.01, 100)
	chassis.CustomPhysicalProperties = PhysicalProperties.new(density, PHYS.Friction, PHYS.Elasticity, 1, 1)
end

function CarRig.CreateModel(name: string, B): (Model, BasePart)
	local model = Instance.new("Model")
	model.Name = name
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	local chassis = Instance.new("Part")
	chassis.Name = "Chassis"
	chassis.Size = B.ChassisSize
	chassis.CFrame = CFrame.new(B.ChassisCenter)
	chassis.Transparency = 1
	chassis.CanCollide = true
	chassis.CanTouch = true
	chassis.CanQuery = true
	chassis.Anchored = true
	chassis.CastShadow = false
	chassis.TopSurface = Enum.SurfaceType.Smooth
	chassis.BottomSurface = Enum.SurfaceType.Smooth
	chassis.RootPriority = 10
	chassis.Parent = model
	CarRig.SetMass(chassis, B.Stats.Mass)
	model.PrimaryPart = chassis
	chassis.PivotOffset = CFrame.new(0, -B.ChassisCenter.Y, 0)
	return model, chassis
end

function CarRig.Wheels(k, B)
	local folder = k:Folder("Wheels")
	local chassis = k.Chassis
	for _, n in ipairs(WHEELS) do
		local side = n:sub(2, 2) == "L" and -1 or 1
		local z = n:sub(1, 1) == "F" and B.ZF or B.ZR
		local x = side * B.WheelX
		local centre = CFrame.new(x, B.R, z)
		local tyre = k:Cylinder(folder, n, B.WW, B.R * 2, centre, TYRE, Enum.Material.SmoothPlastic, { NoWeld = true })
		tyre.CanQuery = false
		tyre:SetAttribute("Radius", B.R)
		tyre:SetAttribute("Side", side)
		if B.Scooter and side > 0 then
			tyre.Transparency = 1 -- coincident twin (single-track vehicle)
			tyre:SetAttribute("Hidden", true)
		end
		-- sidewall detail welded to the tyre
		if not (B.Scooter and side > 0) then
			k:Cylinder(tyre, "Sidewall", B.WW + 0.02, B.R * 1.62, centre, Color3.fromRGB(34, 34, 38), Enum.Material.SmoothPlastic, { WeldTo = tyre, Shadow = false })
		end
		CarKit.Motor("WheelMotor", chassis, tyre, centre, tyre)
		local att = Instance.new("Attachment")
		att.Name = "Wheel" .. n
		att.Position = chassis.CFrame:PointToObjectSpace(Vector3.new(x, B.R + B.RestDrop, z))
		att.Parent = chassis
	end
end

local function seatPart(className: string, name: string, cf: CFrame, parent: Instance, k, scooter: boolean): BasePart
	local seat = Instance.new(className) :: any
	seat.Name = name
	seat.Size = scooter and Vector3.new(1.1, 0.3, 1.6) or Vector3.new(1.5, 0.3, 1.5)
	seat.CFrame = cf
	seat.Color = scooter and Color3.fromRGB(30, 30, 32) or INTERIOR
	seat.Material = Enum.Material.Fabric
	seat.Anchored = false
	seat.CanCollide = false
	seat.CanTouch = false -- no touch-sitting: entry goes through the server prompts (lock checks)
	seat.Massless = true
	seat.TopSurface = Enum.SurfaceType.Smooth
	seat.BottomSurface = Enum.SurfaceType.Smooth
	if className == "VehicleSeat" then
		seat.MaxSpeed = 0
		seat.Torque = 0
		seat.TurnSpeed = 0
		seat.HeadsUpDisplay = false
	end
	seat.Parent = parent
	k:Weld(seat)
	return seat
end

function CarRig.Seats(k, B)
	local seatsFolder = k:Folder("Seats")
	local chassis = k.Chassis
	local entries: { [string]: { number } } = {}
	for i, s in ipairs(B.Seats) do
		local cf = CFrame.new(s.X, B.SeatTop - 0.15, s.Z)
		local seat
		if s.Driver then
			seat = seatPart("VehicleSeat", "DriveSeat", cf, k.Model, k, B.Scooter)
		else
			seat = seatPart("Seat", s.Name, cf, seatsFolder, k, B.Scooter)
		end
		seat:SetAttribute("Door", s.Door)
		seat:SetAttribute("SeatIndex", i)
		if not B.Scooter then
			local floorY = math.min(math.max(B.SeatTop - 1.0, B.Cl + 0.2), B.Belt - 0.6)
			local baseH = (B.SeatTop - 0.3) - floorY
			if baseH > 0.1 then
				k:Box(seat, "SeatBase", Vector3.new(1.2, baseH, 1.2), CFrame.new(s.X, floorY + baseH / 2, s.Z), INTERIOR, Enum.Material.SmoothPlastic, { WeldTo = seat })
			end
			local back = k:Box(seat, "SeatBack", Vector3.new(1.5, 1.7, 0.3), CFrame.new(s.X, B.SeatTop + 0.75, s.Z + 0.78) * CFrame.Angles(math.rad(10), 0, 0), INTERIOR, Enum.Material.Fabric, { WeldTo = seat })
			k:Box(seat, "Headrest", Vector3.new(0.9, 0.5, 0.25), CFrame.new(s.X, B.SeatTop + 1.85, s.Z + 0.96) * CFrame.Angles(math.rad(10), 0, 0), INTERIOR, Enum.Material.Fabric, { WeldTo = back })
		end
		local e = entries[s.Door]
		if not e then
			entries[s.Door] = { s.X, s.Z }
		end
	end
	-- Entry attachments (one per door side used); prompts are created by the VehicleService on spawn
	for door, pos in pairs(entries) do
		local side = (door == "FL" or door == "RL") and -1 or 1
		local x = B.Scooter and side * 1.3 or side * (B.W / 2 + 0.7)
		local att = Instance.new("Attachment")
		att.Name = "Entry_" .. door
		att.Position = chassis.CFrame:PointToObjectSpace(Vector3.new(x, math.min(B.Belt, B.SeatTop + 1), pos[2]))
		att:SetAttribute("Door", door)
		att.Parent = chassis
	end
end

-- Engine / horn / siren sound emitters live on the chassis so every client can play them (they are
-- driven locally by CarVisualsController; ids come from Config/Audio and empty ids are skipped).
local function sounds(chassis: BasePart)
	if chassis:FindFirstChild("SoundEmitter") then
		return
	end
	local att = Instance.new("Attachment")
	att.Name = "SoundEmitter"
	att.Parent = chassis
end

function CarRig.Finalize(model: Model, chassis: BasePart)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			d.CollisionGroup = PHYS.CollisionGroup
			if d ~= chassis then
				d.Massless = true
				d.Anchored = false
				d.EnableFluidForces = false
				if not d:IsA("Seat") and not d:IsA("VehicleSeat") then
					d.CanTouch = false
				end
			end
		end
	end
	chassis.Anchored = true
	sounds(chassis)
	for k, v in pairs(CarRig.DefaultAttributes) do
		if model:GetAttribute(k) == nil then
			model:SetAttribute(k, v)
		end
	end
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
end

---------------------------------------------------------------------------
-- Real models from ServerStorage.Assets.Cars
---------------------------------------------------------------------------
local function hasJoint(part: BasePart): boolean
	return #part:GetJoints() > 0
end

function CarRig.PrepareAsset(model: Model, def: { [string]: any }, B): Model
	local id = def.Id or model.Name
	local missing = {}
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	-- strip scripts that may hide in community models
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("Script") or d:IsA("LocalScript") or (d:IsA("ModuleScript")) then
			warn(("[CarRig] removed %s from asset car %s"):format(d:GetFullName(), id))
			d:Destroy()
		end
	end
	local chassis = model:FindFirstChild("Chassis")
	if not (chassis and chassis:IsA("BasePart")) then
		table.insert(missing, "Chassis")
		local cf, size = model:GetBoundingBox()
		chassis = Instance.new("Part")
		chassis.Name = "Chassis"
		chassis.Size = Vector3.new(size.X * 0.92, math.max(0.8, size.Y * 0.35), size.Z * 0.92)
		chassis.CFrame = cf * CFrame.new(0, -size.Y / 2 + B.Cl + chassis.Size.Y / 2, 0)
		chassis.Transparency = 1
		chassis.CanCollide = true
		chassis.Parent = model
	end
	local root = chassis :: BasePart
	root.Anchored = true
	root.CanTouch = true
	root.RootPriority = 10
	model.PrimaryPart = root
	CarRig.SetMass(root, B.Stats.Mass)

	-- drive seat
	local drive = model:FindFirstChild("DriveSeat", true)
	if not (drive and drive:IsA("VehicleSeat")) then
		drive = model:FindFirstChildWhichIsA("VehicleSeat", true)
		if drive then
			drive.Name = "DriveSeat"
		else
			table.insert(missing, "DriveSeat")
		end
	end
	if drive then
		local d = drive :: VehicleSeat
		d.MaxSpeed = 0
		d.Torque = 0
		d.TurnSpeed = 0
		d.HeadsUpDisplay = false
		d.CanTouch = false
		if d:GetAttribute("Door") == nil then
			d:SetAttribute("Door", "FL")
		end
	end
	for _, s in ipairs(model:GetDescendants()) do
		if s:IsA("Seat") then
			s.CanTouch = false
			if s:GetAttribute("Door") == nil then
				local localPos = root.CFrame:PointToObjectSpace(s.Position)
				s:SetAttribute("Door", localPos.X < 0 and (localPos.Z < 0 and "FL" or "RL") or (localPos.Z < 0 and "FR" or "RR"))
			end
		end
	end

	-- wheels: WheelMotor + attachments
	local wheels = model:FindFirstChild("Wheels")
	if not wheels then
		table.insert(missing, "Wheels")
	else
		for _, n in ipairs(WHEELS) do
			local w = wheels:FindFirstChild(n)
			local part = w and (w:IsA("BasePart") and w or (w:IsA("Model") and (w.PrimaryPart or w:FindFirstChildWhichIsA("BasePart", true))))
			if not part then
				table.insert(missing, "Wheels/" .. n)
			else
				local p = part :: BasePart
				p.CanCollide = false
				p.Massless = true
				if p:GetAttribute("Radius") == nil then
					p:SetAttribute("Radius", math.max(p.Size.Y, p.Size.Z) / 2)
				end
				local motor = p:FindFirstChild("WheelMotor")
				if not (motor and motor:IsA("Motor6D")) then
					-- replace whatever held the wheel with a WheelMotor
					for _, j in ipairs(p:GetJoints()) do
						if j:IsA("JointInstance") or j:IsA("WeldConstraint") then
							local other = (j :: any).Part0 == p and (j :: any).Part1 or (j :: any).Part0
							if other == root or (other and not other:IsDescendantOf(w)) then
								j:Destroy()
							end
						end
					end
					CarKit.Motor("WheelMotor", root, p, CFrame.new(p.Position), p)
				end
				if not root:FindFirstChild("Wheel" .. n) then
					local att = Instance.new("Attachment")
					att.Name = "Wheel" .. n
					att.Position = root.CFrame:PointToObjectSpace(p.Position) + Vector3.new(0, B.RestDrop, 0)
					att.Parent = root
				end
			end
		end
	end
	for _, piece in ipairs({ "Body", "Doors", "Lights", "Mirrors" }) do
		if not model:FindFirstChild(piece) then
			table.insert(missing, piece)
		end
	end
	if not model:FindFirstChild("Hood") then
		table.insert(missing, "Hood")
	end
	if not model:FindFirstChild("Trunk") then
		table.insert(missing, "Trunk")
	end
	if def.Features and def.Features.Sunroof and not model:FindFirstChild("Sunroof") then
		table.insert(missing, "Sunroof")
	end
	if def.Features and def.Features.Convertible and not model:FindFirstChild("Roof") then
		table.insert(missing, "Roof")
	end
	-- entry points if the model has none
	local hasEntry = false
	for _, c in ipairs(root:GetChildren()) do
		if c:IsA("Attachment") and c.Name:sub(1, 6) == "Entry_" then
			hasEntry = true
		end
	end
	if not hasEntry then
		local half = root.Size.X / 2 + 1
		for _, door in ipairs({ "FL", "FR" }) do
			local att = Instance.new("Attachment")
			att.Name = "Entry_" .. door
			att.Position = Vector3.new(door == "FL" and -half or half, root.Size.Y / 2, 0)
			att:SetAttribute("Door", door)
			att.Parent = root
		end
	end
	-- anything left floating gets welded to the chassis so the model never falls apart
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and d ~= root and not hasJoint(d) then
			local w = Instance.new("WeldConstraint")
			w.Part0 = root
			w.Part1 = d
			w.Parent = d
		end
	end
	-- pivot at the bottom centre
	local cf, size = model:GetBoundingBox()
	local bottom = cf * CFrame.new(0, -size.Y / 2, 0)
	root.PivotOffset = root.CFrame:ToObjectSpace(CFrame.new(bottom.Position) * (root.CFrame - root.CFrame.Position))
	model:SetAttribute("IsAsset", true)
	if #missing > 0 then
		warn(("[CarRig] asset car '%s' is missing rig pieces: %s (see docs/ARCHITECTURE.md §9)"):format(id, table.concat(missing, ", ")))
	end
	CarRig.Finalize(model, root)
	return model
end

return CarRig
