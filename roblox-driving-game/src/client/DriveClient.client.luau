--!strict
-- Client side of the driving game:
--   * drives your car's wheel motors and steering every frame (the client
--     owns the car's physics, so this feels instant)
--   * builds the HUD: speedometer, lap timer, spawn/flip/brake buttons
--
-- Controls: W/S or Up/Down = throttle/brake, A/D or Left/Right = steer,
-- Shift = handbrake, R = flip car, C = spawn car, Space = get out.
-- Gamepad and touch work too (VehicleSeat maps thumbsticks automatically).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage:WaitForChild("DrivingShared"):WaitForChild("Config"))
local remotes = ReplicatedStorage:WaitForChild("DrivingRemotes")
local spawnCarRemote = remotes:WaitForChild("SpawnCar") :: RemoteEvent
local raceUpdateRemote = remotes:WaitForChild("RaceUpdate") :: RemoteEvent
local notifyRemote = remotes:WaitForChild("Notify") :: RemoteEvent

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local carConfig = Config.Car

local DEFAULT_FOV = 70
local FLIP_COOLDOWN = 2

-- HUD ------------------------------------------------------------------------

local gui = Instance.new("ScreenGui")
gui.Name = "DrivingHUD"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local function makeLabel(props: { [string]: any }, parent: Instance): TextLabel
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBold
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0.5
	for key, value in props do
		(label :: any)[key] = value
	end
	label.Parent = parent
	return label
end

local function makeButton(text: string, position: UDim2, color: Color3): TextButton
	local button = Instance.new("TextButton")
	button.Size = UDim2.fromOffset(150, 48)
	button.Position = position
	button.AnchorPoint = Vector2.new(0, 1)
	button.BackgroundColor3 = color
	button.Font = Enum.Font.GothamBold
	button.TextSize = 18
	button.TextColor3 = Color3.new(1, 1, 1)
	button.Text = text
	button.AutoButtonColor = true
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 10)
	corner.Parent = button
	button.Parent = gui
	return button
end

-- Lap panel (top center)
local lapPanel = Instance.new("Frame")
lapPanel.Size = UDim2.fromOffset(300, 128)
lapPanel.Position = UDim2.new(0.5, 0, 0, 52)
lapPanel.AnchorPoint = Vector2.new(0.5, 0)
lapPanel.BackgroundColor3 = Color3.new(0, 0, 0)
lapPanel.BackgroundTransparency = 0.45
lapPanel.Parent = gui
local panelCorner = Instance.new("UICorner")
panelCorner.CornerRadius = UDim.new(0, 12)
panelCorner.Parent = lapPanel

local lapLabel = makeLabel({
	Size = UDim2.new(1, 0, 0, 34),
	Position = UDim2.fromOffset(0, 6),
	TextSize = 26,
	Text = "LAP 1/3",
}, lapPanel)
local timeLabel = makeLabel({
	Size = UDim2.new(1, 0, 0, 30),
	Position = UDim2.fromOffset(0, 38),
	TextSize = 24,
	Font = Enum.Font.Code,
	Text = "Cross the line to start",
}, lapPanel)
local statsLabel = makeLabel({
	Size = UDim2.new(1, -20, 0, 54),
	Position = UDim2.fromOffset(10, 70),
	TextSize = 15,
	Font = Enum.Font.Gotham,
	TextYAlignment = Enum.TextYAlignment.Top,
	Text = "",
}, lapPanel)

-- Speedometer (bottom right)
local speedLabel = makeLabel({
	Size = UDim2.fromOffset(220, 80),
	Position = UDim2.new(1, -24, 1, -60),
	AnchorPoint = Vector2.new(1, 1),
	TextSize = 72,
	Font = Enum.Font.GothamBlack,
	TextXAlignment = Enum.TextXAlignment.Right,
	Text = "0",
	Visible = false,
}, gui)
local unitLabel = makeLabel({
	Size = UDim2.fromOffset(220, 30),
	Position = UDim2.new(1, -24, 1, -30),
	AnchorPoint = Vector2.new(1, 1),
	TextSize = 20,
	TextXAlignment = Enum.TextXAlignment.Right,
	Text = "km/h",
	Visible = false,
}, gui)

-- Buttons (bottom left)
local spawnButton = makeButton("Spawn Car [C]", UDim2.new(0, 20, 1, -20), Color3.fromRGB(46, 160, 90))
local flipButton = makeButton("Flip [R]", UDim2.new(0, 180, 1, -20), Color3.fromRGB(60, 110, 200))
local brakeButton = makeButton("Handbrake [Shift]", UDim2.new(0, 20, 1, -78), Color3.fromRGB(200, 70, 60))
brakeButton.Size = UDim2.fromOffset(310, 48)
flipButton.Visible = false
brakeButton.Visible = false

-- Notifications (center)
local notifyLabel = makeLabel({
	Size = UDim2.new(0.8, 0, 0, 40),
	Position = UDim2.new(0.5, 0, 0, 190),
	AnchorPoint = Vector2.new(0.5, 0),
	TextSize = 28,
	Font = Enum.Font.GothamBlack,
	TextColor3 = Color3.fromRGB(255, 220, 80),
	Text = "",
}, gui)

local notifyToken = 0
local function showNotification(text: string)
	notifyToken += 1
	local token = notifyToken
	notifyLabel.Text = text
	task.delay(4, function()
		if notifyToken == token then
			notifyLabel.Text = ""
		end
	end)
end

notifyRemote.OnClientEvent:Connect(showNotification)

-- Race state from the server -------------------------------------------------

local raceState: { [string]: any } = {}

local function formatTime(seconds: number?): string
	if not seconds then
		return "--:--.--"
	end
	return string.format("%d:%05.2f", seconds // 60, seconds % 60)
end

local function refreshStats()
	local lines = {
		string.format("Checkpoints %d/%d", raceState.Checkpoint or 0, raceState.CheckpointCount or 0),
		string.format("Last %s   Best %s", formatTime(raceState.LastLap), formatTime(raceState.BestLap)),
	}
	if raceState.RecordTime then
		table.insert(lines, string.format("Record %s (%s)", formatTime(raceState.RecordTime), raceState.RecordHolder))
	end
	statsLabel.Text = table.concat(lines, "\n")
	lapLabel.Text = string.format("LAP %d/%d", raceState.Lap or 1, raceState.TotalLaps or Config.Race.TotalLaps)
end

raceUpdateRemote.OnClientEvent:Connect(function(state)
	raceState = state
	refreshStats()
end)

-- Car control ----------------------------------------------------------------

type CarRig = {
	Model: Model,
	Seat: VehicleSeat,
	Chassis: BasePart,
	Motors: { HingeConstraint },
	SteerJoints: { CylindricalConstraint },
}

local currentRig: CarRig? = nil
local steerValue = 0
local handbrakeKeyDown = false
local handbrakeTouchDown = false
local lastFlip = 0

local function buildRig(seat: VehicleSeat): CarRig?
	local model = seat.Parent
	if not model or not model:IsA("Model") or not model.PrimaryPart then
		return nil
	end
	local motors = {}
	local steerJoints = {}
	for _, descendant in model:GetDescendants() do
		if descendant:IsA("HingeConstraint") and descendant.Name == "WheelMotor" then
			table.insert(motors, descendant)
		elseif descendant:IsA("CylindricalConstraint") and descendant:GetAttribute("IsFront") then
			table.insert(steerJoints, descendant)
		end
	end
	return {
		Model = model,
		Seat = seat,
		Chassis = model.PrimaryPart,
		Motors = motors,
		SteerJoints = steerJoints,
	}
end

local function getDrivingSeat(): VehicleSeat?
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local seat = humanoid and humanoid.SeatPart
	if seat and seat:IsA("VehicleSeat") and seat:GetAttribute("IsDrivingCar") then
		return seat
	end
	return nil
end

local function releaseRig(rig: CarRig)
	-- Leave the parked car with its wheels gently braked.
	for _, motor in rig.Motors do
		motor.AngularVelocity = 0
		motor.MotorMaxTorque = rig.Chassis.AssemblyMass * carConfig.CoastDeceleration * carConfig.WheelRadius
	end
	for _, joint in rig.SteerJoints do
		joint.TargetAngle = 0
	end
end

local function flipCar()
	local rig = currentRig
	if not rig or os.clock() - lastFlip < FLIP_COOLDOWN then
		return
	end
	lastFlip = os.clock()

	local cf = rig.Chassis.CFrame
	local flatLook = Vector3.new(cf.LookVector.X, 0, cf.LookVector.Z)
	if flatLook.Magnitude < 0.1 then
		flatLook = Vector3.new(0, 0, -1)
	end
	local position = cf.Position + Vector3.new(0, 5, 0)
	rig.Model:PivotTo(CFrame.lookAt(position, position + flatLook.Unit))
	for _, part in rig.Model:GetDescendants() do
		if part:IsA("BasePart") then
			part.AssemblyLinearVelocity = Vector3.zero
			part.AssemblyAngularVelocity = Vector3.zero
		end
	end
end

local function updateCar(rig: CarRig, dt: number)
	local seat = rig.Seat
	local chassis = rig.Chassis
	local throttle = seat.ThrottleFloat
	local steerInput = seat.SteerFloat
	local handbrake = handbrakeKeyDown or handbrakeTouchDown

	local forwardSpeed = chassis.AssemblyLinearVelocity:Dot(chassis.CFrame.LookVector)
	local speedRatio = math.clamp(math.abs(forwardSpeed) / carConfig.MaxSpeed, 0, 1)

	-- Wheels and struts are separate assemblies, so add their mass back in.
	local mass = chassis.AssemblyMass + ((rig.Model:GetAttribute("UnsprungMass") :: number?) or 0)
	local radius = carConfig.WheelRadius
	local function torqueFor(deceleration: number): number
		-- Split across four wheels, with a little extra to spin up the wheels themselves.
		return mass * deceleration * radius / 4 * 1.3
	end

	local targetSpeed = 0
	local torque
	if throttle > 0.05 then
		if forwardSpeed < -3 then
			torque = torqueFor(carConfig.BrakeDeceleration)
		else
			targetSpeed = throttle * carConfig.MaxSpeed
			torque = torqueFor(carConfig.Acceleration)
		end
	elseif throttle < -0.05 then
		if forwardSpeed > 3 then
			torque = torqueFor(carConfig.BrakeDeceleration)
		else
			targetSpeed = throttle * carConfig.ReverseSpeed
			torque = torqueFor(carConfig.Acceleration)
		end
	else
		torque = torqueFor(carConfig.CoastDeceleration)
	end

	for _, motor in rig.Motors do
		if handbrake and not motor:GetAttribute("IsFront") then
			-- Lock the rear wheels so the back end can slide.
			motor.AngularVelocity = 0
			motor.MotorMaxTorque = torqueFor(carConfig.HandbrakeDeceleration)
		elseif handbrake then
			motor.AngularVelocity = 0
			motor.MotorMaxTorque = torqueFor(carConfig.CoastDeceleration)
		else
			-- Wheel axles point along +X, so a negative spin rolls the car forward (-Z).
			motor.AngularVelocity = -targetSpeed / radius
			motor.MotorMaxTorque = torque
		end
	end

	-- Ease the steering toward the input and reduce the lock at high speed.
	steerValue += (steerInput - steerValue) * math.min(1, dt * carConfig.SteerSpeed)
	local maxAngle = carConfig.MaxSteerAngle + (carConfig.MinSteerAngle - carConfig.MaxSteerAngle) * speedRatio
	for _, joint in rig.SteerJoints do
		-- A positive angle turns left, and SteerFloat is positive for right.
		joint.TargetAngle = -steerValue * maxAngle
	end

	speedLabel.Text = tostring(math.floor(math.abs(forwardSpeed) + 0.5))
	camera.FieldOfView = DEFAULT_FOV + speedRatio * 15
end

local function setDrivingUi(driving: boolean)
	speedLabel.Visible = driving
	unitLabel.Visible = driving
	flipButton.Visible = driving
	brakeButton.Visible = driving
	if not driving then
		camera.FieldOfView = DEFAULT_FOV
	end
end

RunService.Heartbeat:Connect(function(dt)
	local seat = getDrivingSeat()
	if currentRig and currentRig.Seat ~= seat then
		if currentRig.Model.Parent then
			releaseRig(currentRig)
		end
		currentRig = nil
		setDrivingUi(false)
	end
	if seat and not currentRig then
		currentRig = buildRig(seat)
		steerValue = 0
		setDrivingUi(currentRig ~= nil)
	end
	if currentRig then
		updateCar(currentRig, dt)
	end

	if raceState.LapStart then
		timeLabel.Text = formatTime(workspace:GetServerTimeNow() - raceState.LapStart)
	else
		timeLabel.Text = "Cross the line to start"
	end
end)

-- Input ----------------------------------------------------------------------

local function requestSpawn()
	spawnCarRemote:FireServer()
end

local function isHandbrakeKey(key: Enum.KeyCode): boolean
	return key == Enum.KeyCode.LeftShift or key == Enum.KeyCode.RightShift or key == Enum.KeyCode.ButtonX
end

UserInputService.InputBegan:Connect(function(input, processed)
	local key = input.KeyCode
	-- Shift can be claimed by the camera's shift-lock, so check it before `processed`.
	if isHandbrakeKey(key) then
		handbrakeKeyDown = true
		return
	end
	if processed then
		return
	end
	if key == Enum.KeyCode.R or key == Enum.KeyCode.ButtonY then
		flipCar()
	elseif key == Enum.KeyCode.C or key == Enum.KeyCode.ButtonB then
		requestSpawn()
	end
end)

UserInputService.InputEnded:Connect(function(input)
	if isHandbrakeKey(input.KeyCode) then
		handbrakeKeyDown = false
	end
end)

spawnButton.Activated:Connect(requestSpawn)
flipButton.Activated:Connect(flipCar)
brakeButton.MouseButton1Down:Connect(function()
	handbrakeTouchDown = true
end)
brakeButton.MouseButton1Up:Connect(function()
	handbrakeTouchDown = false
end)
brakeButton.MouseLeave:Connect(function()
	handbrakeTouchDown = false
end)

refreshStats()
showNotification("Press C or tap Spawn Car to start driving!")
