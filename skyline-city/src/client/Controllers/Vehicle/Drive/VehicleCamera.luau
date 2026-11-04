-- VehicleCamera: driving camera with three modes (cycle with Y / gamepad R1 / 🎥 button):
--   "Chase"    spring chase cam, speed-based FOV, drift-follow, mouse/stick/touch orbit that recentres,
--              mouse-wheel zoom, occlusion pull-in, look-behind (LeftAlt / R3 hold)
--   "Hood"     bonnet cam
--   "Interior" first-person from the driver's head with free look
-- Camera shake from crashes (respects Settings.CameraShake). The default camera is restored on Stop.
--
--   local cam = VehicleCamera.new(model, chassis, character)
--   cam:Start()  cam:Stop()  cam:Cycle() -> modeName  cam:SetMode(name)
--   cam:SetLookBehind(bool)  cam:Shake(amount 0..1+)  cam:SetShakeEnabled(bool)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Driving = require(Shared.Config.Driving)
local Units = require(Shared.Vehicle.Units)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local CameraOwner = require(Client:WaitForChild("Util"):WaitForChild("CameraOwner"))

local C = Driving.Camera
local OWNER_ID = "Drive" -- CameraOwner id; tuning orbit / selfie / build camera take over while they run

local VehicleCamera = {}
VehicleCamera.__index = VehicleCamera

VehicleCamera.Modes = { "Chase", "Hood", "Interior" }
VehicleCamera.ModeNames = { Chase = "Chase cam", Hood = "Hood cam", Interior = "Interior cam" }

local RENDER_NAME = "SkylineVehicleCamera"
local lastMode = "Chase" -- remembered between drives

local function yawOf(v: Vector3): number
	return math.atan2(-v.X, -v.Z)
end

local function angleDelta(a: number, b: number): number
	local d = (b - a) % (math.pi * 2)
	if d > math.pi then
		d -= math.pi * 2
	end
	return d
end

local function expAlpha(sharpness: number, dt: number): number
	return 1 - math.exp(-sharpness * dt)
end

function VehicleCamera.new(model: Model, chassis: any, character: Model?)
	local self = setmetatable({}, VehicleCamera)
	self.Model = model
	self.Chassis = chassis
	self.Character = character
	self.Mode = lastMode
	self.OrbitYaw = 0
	self.OrbitPitch = 0
	self.LookYaw = 0
	self.LookPitch = 0
	self.LastOrbit = 0
	self.Zoom = 1
	self.LookBehind = false
	self.ShakeAmount = 0
	self.ShakeEnabled = true
	self.Conns = {}
	self.Hidden = {}
	self.Running = false

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.RespectCanCollide = true
	params.FilterDescendantsInstances = character and { model, character } or { model }
	self.RayParams = params
	return self
end

function VehicleCamera:Start()
	if self.Running then
		return
	end
	self.Running = true
	local cam = Workspace.CurrentCamera
	self.SavedFov = cam.FieldOfView
	CameraOwner.Acquire(OWNER_ID, CameraOwner.Priority.Drive)
	if CameraOwner.IsMine(OWNER_ID) then
		cam.CameraType = Enum.CameraType.Scriptable
	end
	local basis = self.Chassis:GetBasis()
	self.CamYaw = yawOf(basis.LookVector)
	self.Focus = basis.Position
	self.CamPos = cam.CFrame.Position

	RunService:BindToRenderStep(RENDER_NAME, Enum.RenderPriority.Camera.Value + 1, function(dt)
		self:_Update(dt)
	end)

	local rotating = false
	local dragTouch: InputObject? = nil
	table.insert(self.Conns, UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton2 then
			rotating = true
			UserInputService.MouseBehavior = Enum.MouseBehavior.LockCurrentPosition
		elseif input.UserInputType == Enum.UserInputType.Touch and not dragTouch then
			dragTouch = input
		end
	end))
	table.insert(self.Conns, UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton2 then
			rotating = false
			UserInputService.MouseBehavior = Enum.MouseBehavior.Default
		elseif input == dragTouch then
			dragTouch = nil
		elseif input.KeyCode == Enum.KeyCode.Thumbstick2 then
			self.Stick = nil
		end
	end))
	table.insert(self.Conns, UserInputService.InputChanged:Connect(function(input, processed)
		if input.UserInputType == Enum.UserInputType.MouseMovement and rotating then
			self:_Orbit(input.Delta.X * C.MouseSensitivity, input.Delta.Y * C.MouseSensitivity)
		elseif input == dragTouch then
			self:_Orbit(input.Delta.X * C.TouchSensitivity, input.Delta.Y * C.TouchSensitivity)
		elseif input.UserInputType == Enum.UserInputType.MouseWheel and not processed then
			self.Zoom = math.clamp(self.Zoom - input.Position.Z * 0.1, C.ZoomMin, C.ZoomMax)
		elseif input.KeyCode == Enum.KeyCode.Thumbstick2 then
			self.Stick = input.Position
		end
	end))
end

function VehicleCamera:_Orbit(dxDeg: number, dyDeg: number)
	self.LastOrbit = os.clock()
	if self.Mode == "Chase" then
		self.OrbitYaw -= math.rad(dxDeg)
		self.OrbitPitch = math.clamp(self.OrbitPitch - math.rad(dyDeg), math.rad(-35), math.rad(40))
	else
		self.LookYaw = math.clamp(self.LookYaw - math.rad(dxDeg), math.rad(-120), math.rad(120))
		self.LookPitch = math.clamp(self.LookPitch - math.rad(dyDeg), math.rad(-50), math.rad(50))
	end
end

function VehicleCamera:SetMode(mode: string)
	if not table.find(VehicleCamera.Modes, mode) then
		return
	end
	self.Mode = mode
	lastMode = mode
	self.LookYaw, self.LookPitch = 0, 0
	self.OrbitYaw, self.OrbitPitch = 0, 0
	if mode ~= "Interior" then
		self:_ShowCharacter()
	end
end

function VehicleCamera:Cycle(): string
	local i = table.find(VehicleCamera.Modes, self.Mode) or 1
	local nextMode = VehicleCamera.Modes[(i % #VehicleCamera.Modes) + 1]
	self:SetMode(nextMode)
	return nextMode
end

function VehicleCamera:SetLookBehind(on: boolean)
	self.LookBehind = on
end

function VehicleCamera:SetShakeEnabled(on: boolean)
	self.ShakeEnabled = on
end

function VehicleCamera:Shake(amount: number)
	if not self.ShakeEnabled then
		return
	end
	self.ShakeAmount = math.min(1.5, math.max(self.ShakeAmount, amount))
end

function VehicleCamera:_HideCharacter()
	local char = self.Character
	if not char then
		return
	end
	-- re-scan the character only every 0.5 s (accessories can load late), but re-apply the modifier every
	-- frame so the default TransparencyController can't flicker the head back in
	local now = os.clock()
	if now - (self.HiddenAt or 0) >= 0.5 then
		self.HiddenAt = now
		for _, d in ipairs(char:GetDescendants()) do
			if d:IsA("BasePart") then
				local isHead = d.Name == "Head" or (d.Parent and d.Parent:IsA("Accessory"))
				if isHead then
					self.Hidden[d] = true
				end
			end
		end
	end
	for part in pairs(self.Hidden) do
		if part.Parent then
			part.LocalTransparencyModifier = 1
		else
			self.Hidden[part] = nil
		end
	end
end

function VehicleCamera:_ShowCharacter()
	for part in pairs(self.Hidden) do
		if part.Parent then
			part.LocalTransparencyModifier = 0
		end
	end
	table.clear(self.Hidden)
	self.HiddenAt = nil
end

function VehicleCamera:_ShakeOffset(dt: number): CFrame
	if self.ShakeAmount <= 0.001 then
		self.ShakeAmount = 0
		return CFrame.identity
	end
	local t = os.clock() * 25
	local a = self.ShakeAmount
	self.ShakeAmount = math.max(0, a - C.ShakeDecay * dt * math.max(0.3, a))
	return CFrame.new(math.noise(t, 0.3) * a * 0.6, math.noise(t, 1.7) * a * 0.6, 0)
		* CFrame.Angles(math.noise(t, 4.1) * a * 0.04, math.noise(t, 7.9) * a * 0.04, math.noise(t, 9.3) * a * 0.03)
end

function VehicleCamera:_Update(dt: number)
	local cam = Workspace.CurrentCamera
	local chassis = self.Chassis
	local root = chassis.Root
	if not root.Parent then
		return
	end
	if not CameraOwner.IsMine(OWNER_ID) then
		-- another system (tuning orbit, selfie, build) owns the camera right now
		return
	end
	if cam.CameraType ~= Enum.CameraType.Scriptable then
		cam.CameraType = Enum.CameraType.Scriptable
	end
	local geo = chassis.Geo
	local basis = chassis:GetBasis()
	local vel = root.AssemblyLinearVelocity
	local speed = vel.Magnitude
	local topStuds = Units.MpsToStuds(chassis.Powertrain.TopSpeedMps)
	local speedFrac = math.clamp(speed / math.max(1, topStuds), 0, 1)

	-- gamepad right stick orbit / free look
	local stick = self.Stick
	if stick and stick.Magnitude > Driving.GamepadDeadzone then
		self:_Orbit(stick.X * C.StickSensitivity * dt, -stick.Y * C.StickSensitivity * dt)
	end
	-- recentre after the player stops orbiting
	if os.clock() - self.LastOrbit > C.OrbitReturnDelay then
		local k = expAlpha(C.OrbitReturnSpeed, dt)
		self.OrbitYaw -= self.OrbitYaw * k
		self.OrbitPitch -= self.OrbitPitch * k
		self.LookYaw -= self.LookYaw * k
		self.LookPitch -= self.LookPitch * k
	end

	-- small rumble near top speed
	if self.ShakeEnabled and speedFrac > 0.75 and chassis.Grounded > 0 then
		self.ShakeAmount = math.max(self.ShakeAmount, C.HighSpeedRumble * (speedFrac - 0.75) * 4)
	end
	local shake = self:_ShakeOffset(dt)
	local behind = self.LookBehind and math.pi or 0
	local fov = C.BaseFov

	if self.Mode == "Chase" then
		self:_ShowCharacter()
		-- yaw follows heading, blended toward velocity while sliding forward
		local heading = Vector3.new(basis.LookVector.X, 0, basis.LookVector.Z)
		if heading.Magnitude < 0.05 then
			heading = Vector3.new(-basis.UpVector.X, 0, -basis.UpVector.Z)
		end
		heading = heading.Magnitude > 0.01 and heading.Unit or Vector3.new(0, 0, -1)
		local flatVel = Vector3.new(vel.X, 0, vel.Z)
		local dir = heading
		if flatVel.Magnitude > 20 and flatVel.Unit:Dot(heading) > 0.2 then
			dir = heading:Lerp(flatVel.Unit, C.DriftLook)
		end
		local desiredYaw = yawOf(dir)
		self.CamYaw += angleDelta(self.CamYaw, desiredYaw) * expAlpha(C.YawSharpness, dt)

		local yaw = self.CamYaw + self.OrbitYaw + behind
		local pitch = math.rad(C.Pitch) + self.OrbitPitch
		local dist = (geo.Length * C.DistanceMultiplier + C.DistanceExtra) * self.Zoom + C.SpeedPullback * speedFrac
		local height = geo.Height * C.HeightMultiplier + C.HeightExtra

		local focusTarget = root.Position + Vector3.yAxis * (geo.Height * 0.5 + 0.8)
		self.Focus = self.Focus:Lerp(focusTarget, expAlpha(C.FollowSharpness, dt))
		-- keep the car from drifting out of frame at high speed
		if (self.Focus - focusTarget).Magnitude > 6 then
			self.Focus = focusTarget + (self.Focus - focusTarget).Unit * 6
		end
		local look = CFrame.fromEulerAnglesYXZ(pitch, yaw, 0).LookVector
		local desiredPos = self.Focus - look * dist + Vector3.yAxis * (height * 0.35)

		-- occlusion
		local toCam = desiredPos - self.Focus
		local hit = Workspace:Raycast(self.Focus, toCam, self.RayParams)
		if hit then
			desiredPos = hit.Position - toCam.Unit * 0.6
		end
		self.CamPos = desiredPos
		cam.CFrame = CFrame.lookAt(desiredPos, self.Focus + Vector3.yAxis * 1.2) * shake
		fov = C.BaseFov + C.SpeedFov * speedFrac
	elseif self.Mode == "Hood" then
		self:_ShowCharacter()
		local offset = CFrame.new(0, geo.Height * 0.5 + 0.35, -geo.Length * 0.22)
		local view = basis * offset * CFrame.fromEulerAnglesYXZ(self.LookPitch, self.LookYaw + behind, 0)
		cam.CFrame = view * shake
		fov = C.HoodFov + C.SpeedFov * 0.6 * speedFrac
	else -- Interior
		self:_HideCharacter()
		local head = self.Character and self.Character:FindFirstChild("Head")
		local seat = self.Model:FindFirstChild("DriveSeat")
		local pos
		if head and head:IsA("BasePart") then
			pos = head.Position + basis.LookVector * 0.25 + basis.UpVector * 0.15
		elseif seat and seat:IsA("BasePart") then
			pos = seat.Position + basis.UpVector * 2.6
		else
			pos = basis.Position + basis.UpVector * (geo.Height * 0.3)
		end
		local rot = basis.Rotation * CFrame.fromEulerAnglesYXZ(self.LookPitch - math.rad(4), self.LookYaw + behind, 0)
		cam.CFrame = CFrame.new(pos) * rot * shake
		fov = C.InteriorFov + C.SpeedFov * 0.5 * speedFrac
	end
	cam.FieldOfView += (fov - cam.FieldOfView) * expAlpha(6, dt)
end

function VehicleCamera:Stop()
	if not self.Running then
		return
	end
	self.Running = false
	pcall(function()
		RunService:UnbindFromRenderStep(RENDER_NAME)
	end)
	for _, c in ipairs(self.Conns) do
		c:Disconnect()
	end
	table.clear(self.Conns)
	self:_ShowCharacter()
	UserInputService.MouseBehavior = Enum.MouseBehavior.Default
	local cam = Workspace.CurrentCamera
	local wasMine = CameraOwner.IsMine(OWNER_ID)
	-- Release restores the default camera (Custom + Humanoid subject) only when nobody else holds it
	CameraOwner.Release(OWNER_ID)
	if wasMine then
		cam.FieldOfView = self.SavedFov or C.BaseFov
	end
end

VehicleCamera.Destroy = VehicleCamera.Stop

return VehicleCamera
