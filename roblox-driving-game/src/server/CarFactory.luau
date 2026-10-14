--!strict
-- Builds a drivable buggy out of parts and physics constraints.
--
-- Each wheel hangs off the chassis like this:
--   chassis --CylindricalConstraint (slides up/down, servo turns it to steer)--> strut
--   chassis --SpringConstraint (suspension)--> strut
--   strut   --HingeConstraint (motor spins the wheel)--> wheel
--
-- The DriveClient LocalScript finds these constraints by name and drives them.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("DrivingShared"):WaitForChild("Config"))

local CarFactory = {}

local CHASSIS_SIZE = Vector3.new(6, 1.2, 11)
local WHEEL_OFFSET_X = 3.7
local WHEEL_OFFSET_Y = -0.9
local WHEEL_OFFSET_Z = 3.6
local SPRING_HEIGHT = 2

local WHEELS = {
	{ Name = "FL", Position = Vector3.new(-WHEEL_OFFSET_X, WHEEL_OFFSET_Y, -WHEEL_OFFSET_Z), Front = true },
	{ Name = "FR", Position = Vector3.new(WHEEL_OFFSET_X, WHEEL_OFFSET_Y, -WHEEL_OFFSET_Z), Front = true },
	{ Name = "RL", Position = Vector3.new(-WHEEL_OFFSET_X, WHEEL_OFFSET_Y, WHEEL_OFFSET_Z), Front = false },
	{ Name = "RR", Position = Vector3.new(WHEEL_OFFSET_X, WHEEL_OFFSET_Y, WHEEL_OFFSET_Z), Front = false },
}

-- An attachment frame whose primary axis (X) points straight up.
local function verticalAxisFrame(position: Vector3): CFrame
	return CFrame.fromMatrix(position, Vector3.yAxis, -Vector3.xAxis)
end

local function attach(parent: BasePart, name: string, frame: CFrame): Attachment
	local attachment = Instance.new("Attachment")
	attachment.Name = name
	attachment.CFrame = frame
	attachment.Parent = parent
	return attachment
end

local function weld(part: BasePart, to: BasePart)
	local constraint = Instance.new("WeldConstraint")
	constraint.Part0 = to
	constraint.Part1 = part
	constraint.Parent = part
end

-- Creates a decorative part welded to the chassis.
local function addBodyPart(model: Model, chassis: BasePart, props: { [string]: any }, localCFrame: CFrame): BasePart
	local part = Instance.new("Part")
	for key, value in props do
		(part :: any)[key] = value
	end
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.CanCollide = false
	part.Massless = true
	part.CFrame = chassis.CFrame * localCFrame
	part.Parent = model
	weld(part, chassis)
	return part
end

local function buildWheel(model: Model, chassis: BasePart, info: { Name: string, Position: Vector3, Front: boolean }): number
	local carConfig = Config.Car
	local radius = carConfig.WheelRadius
	local width = carConfig.WheelWidth
	local worldCFrame = chassis.CFrame * CFrame.new(info.Position)

	-- Strut: invisible link between the chassis and the spinning wheel.
	local strut = Instance.new("Part")
	strut.Name = "Strut_" .. info.Name
	strut.Size = Vector3.new(0.5, 0.5, 0.5)
	strut.Transparency = 1
	strut.CanCollide = false
	strut.CanQuery = false
	strut.CanTouch = false
	strut.CustomPhysicalProperties = PhysicalProperties.new(5, 0, 0)
	strut.CFrame = worldCFrame
	strut.Parent = model

	local slide = Instance.new("CylindricalConstraint")
	slide.Name = "Steer_" .. info.Name
	slide.Attachment0 = attach(chassis, "Slide_" .. info.Name, verticalAxisFrame(info.Position))
	slide.Attachment1 = attach(strut, "Slide", verticalAxisFrame(Vector3.zero))
	slide.InclinationAngle = 0
	slide.LimitsEnabled = true
	slide.LowerLimit = -carConfig.SuspensionTravel
	slide.UpperLimit = carConfig.SuspensionTravel
	slide.Restitution = 0
	slide.AngularActuatorType = Enum.ActuatorType.Servo
	slide.ServoMaxTorque = 1e6
	slide.AngularSpeed = 12
	slide.TargetAngle = 0
	slide:SetAttribute("IsFront", info.Front)
	slide.Parent = strut

	local spring = Instance.new("SpringConstraint")
	spring.Name = "Spring_" .. info.Name
	spring.Attachment0 = attach(chassis, "SpringTop_" .. info.Name, CFrame.new(info.Position + Vector3.new(0, SPRING_HEIGHT, 0)))
	spring.Attachment1 = attach(strut, "SpringBottom", CFrame.identity)
	spring.FreeLength = SPRING_HEIGHT + carConfig.SuspensionSag
	spring.Visible = false
	spring.Parent = strut

	-- Wheel: a cylinder whose axis (local X) points sideways out of the car.
	local wheel = Instance.new("Part")
	wheel.Name = "Wheel_" .. info.Name
	wheel.Shape = Enum.PartType.Cylinder
	wheel.Size = Vector3.new(width, radius * 2, radius * 2)
	wheel.Color = Color3.fromRGB(25, 25, 25)
	wheel.Material = Enum.Material.SmoothPlastic
	wheel.CustomPhysicalProperties = PhysicalProperties.new(0.9, carConfig.WheelFriction, 0, 100, 1)
	wheel.CFrame = worldCFrame
	wheel.Parent = model

	local spoke = Instance.new("Part")
	spoke.Name = "Spoke"
	spoke.Size = Vector3.new(width + 0.1, 0.4, radius * 1.5)
	spoke.Color = Color3.fromRGB(190, 190, 200)
	spoke.Material = Enum.Material.Metal
	spoke.CanCollide = false
	spoke.CanQuery = false
	spoke.Massless = true
	spoke.CFrame = worldCFrame
	spoke.Parent = model
	weld(spoke, wheel)

	local motor = Instance.new("HingeConstraint")
	motor.Name = "WheelMotor"
	motor.Attachment0 = attach(strut, "Axle", CFrame.identity)
	motor.Attachment1 = attach(wheel, "Axle", CFrame.identity)
	motor.ActuatorType = Enum.ActuatorType.Motor
	motor.MotorMaxTorque = 0
	motor.MotorMaxAcceleration = math.huge
	motor.AngularVelocity = 0
	motor:SetAttribute("IsFront", info.Front)
	motor.Parent = strut

	local noCollide = Instance.new("NoCollisionConstraint")
	noCollide.Part0 = chassis
	noCollide.Part1 = wheel
	noCollide.Parent = wheel

	return wheel:GetMass() + strut:GetMass()
end

-- Tunes the springs so the car rests with the configured sag.
local function tuneSuspension(model: Model, sprungMass: number)
	local carConfig = Config.Car
	local cornerMass = sprungMass / 4
	local stiffness = cornerMass * workspace.Gravity / carConfig.SuspensionSag
	local damping = carConfig.SuspensionDamping * 2 * math.sqrt(stiffness * cornerMass)

	for _, descendant in model:GetDescendants() do
		if descendant:IsA("SpringConstraint") then
			descendant.Stiffness = stiffness
			descendant.Damping = damping
		end
	end
end

function CarFactory.Build(owner: Player, spawnCFrame: CFrame, color: Color3): Model
	local model = Instance.new("Model")
	model.Name = owner.Name .. "'s Car"
	model:SetAttribute("OwnerUserId", owner.UserId)

	local chassis = Instance.new("Part")
	chassis.Name = "Chassis"
	chassis.Size = CHASSIS_SIZE
	chassis.Color = color
	chassis.Material = Enum.Material.SmoothPlastic
	chassis.TopSurface = Enum.SurfaceType.Smooth
	chassis.BottomSurface = Enum.SurfaceType.Smooth
	chassis.CFrame = spawnCFrame
	chassis.Parent = model
	model.PrimaryPart = chassis

	local seat = Instance.new("VehicleSeat")
	seat.Name = "DriverSeat"
	seat.Size = Vector3.new(2, 1, 2)
	seat.Color = Color3.fromRGB(30, 30, 30)
	seat.TopSurface = Enum.SurfaceType.Smooth
	seat.BottomSurface = Enum.SurfaceType.Smooth
	-- We drive the constraints ourselves, so disable the seat's legacy behaviour.
	seat.MaxSpeed = 0
	seat.Torque = 0
	seat.TurnSpeed = 0
	seat.HeadsUpDisplay = false
	seat.CFrame = chassis.CFrame * CFrame.new(0, 1.1, 0.8)
	seat:SetAttribute("IsDrivingCar", true)
	seat.Parent = model
	weld(seat, chassis)

	local darkTrim = Color3.fromRGB(35, 35, 40)
	addBodyPart(model, chassis, {
		Name = "Hood",
		Size = Vector3.new(5.6, 0.6, 3.6),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
	}, CFrame.new(0, 0.9, -3.5))

	for _, side in { -1, 1 } do
		addBodyPart(model, chassis, {
			Name = "RollBarPost",
			Size = Vector3.new(0.4, 3, 0.4),
			Color = darkTrim,
			Material = Enum.Material.Metal,
		}, CFrame.new(side * 2.1, 2.1, 2.4))
		addBodyPart(model, chassis, {
			Name = "SpoilerPost",
			Size = Vector3.new(0.3, 1.4, 0.3),
			Color = darkTrim,
			Material = Enum.Material.Metal,
		}, CFrame.new(side * 2.2, 1.3, 5))
		addBodyPart(model, chassis, {
			Name = "Headlight",
			Size = Vector3.new(1.2, 0.5, 0.2),
			Color = Color3.fromRGB(255, 250, 220),
			Material = Enum.Material.Neon,
		}, CFrame.new(side * 2.2, 0.2, -5.55))
		addBodyPart(model, chassis, {
			Name = "Taillight",
			Size = Vector3.new(1.2, 0.5, 0.2),
			Color = Color3.fromRGB(255, 30, 30),
			Material = Enum.Material.Neon,
		}, CFrame.new(side * 2.2, 0.2, 5.55))
	end

	local rollBar = addBodyPart(model, chassis, {
		Name = "RollBarTop",
		Size = Vector3.new(4.6, 0.4, 0.4),
		Color = darkTrim,
		Material = Enum.Material.Metal,
	}, CFrame.new(0, 3.6, 2.4))

	addBodyPart(model, chassis, {
		Name = "Spoiler",
		Size = Vector3.new(6, 0.3, 1.4),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
	}, CFrame.new(0, 2.1, 5))

	-- Name tag above the car
	local tag = Instance.new("BillboardGui")
	tag.Size = UDim2.fromOffset(200, 40)
	tag.StudsOffset = Vector3.new(0, 3, 0)
	tag.MaxDistance = 150
	tag.Parent = rollBar
	local tagLabel = Instance.new("TextLabel")
	tagLabel.Size = UDim2.fromScale(1, 1)
	tagLabel.BackgroundTransparency = 1
	tagLabel.Text = owner.DisplayName
	tagLabel.TextScaled = true
	tagLabel.Font = Enum.Font.GothamBold
	tagLabel.TextColor3 = Color3.new(1, 1, 1)
	tagLabel.TextStrokeTransparency = 0.4
	tagLabel.Parent = tag

	local unsprungMass = 0
	for _, info in WHEELS do
		unsprungMass += buildWheel(model, chassis, info)
	end
	model:SetAttribute("UnsprungMass", unsprungMass)

	local sprungMass = chassis:GetMass() + seat:GetMass()
	tuneSuspension(model, sprungMass)

	return model
end

return CarFactory
