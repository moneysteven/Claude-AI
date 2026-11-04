-- OrbitCamera: orbit the camera around a car while tuning.
--   PC: drag with left/right mouse (outside the UI), wheel to zoom, Z / X to rotate.
--   Touch: drag outside the UI, pinch to zoom.   Gamepad: right thumbstick rotates / tilts, L2 / R2 zoom.
-- While active, driving keys are sunk (higher ContextActionService priority) so the car stays parked.
--
--   OrbitCamera.Start(model)   OrbitCamera.Stop()   OrbitCamera.IsActive()

local ContextActionService = game:GetService("ContextActionService")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent
local CameraOwner = require(Client:WaitForChild("Util"):WaitForChild("CameraOwner"))
local OWNER_ID = "Orbit"

local OrbitCamera = {}

local BIND = "SkylineTuningOrbit"
local SINK = "SkylineTuningSinkDrive"
local ROTATE = "SkylineTuningRotate"
local PRIORITY = 3300 -- above DriveInput (3100)

local active = false
local target: Model? = nil
local yaw, pitch, dist = 0, math.rad(16), 22
local minDist, maxDist = 10, 45
local conns: { RBXScriptConnection } = {}
local saved: { [string]: any } = {}
local rotateDir = 0
local dragging = false
local lastPos: Vector3? = nil

local function center(): Vector3?
	if not target or not target.Parent then
		return nil
	end
	local ok, cf, size = pcall(function()
		return target:GetBoundingBox()
	end)
	if ok then
		return cf.Position + Vector3.new(0, size.Y * 0.1, 0)
	end
	return nil
end

local function stick(): Vector3?
	for _, state in ipairs(UserInputService:GetGamepadState(Enum.UserInputType.Gamepad1)) do
		if state.KeyCode == Enum.KeyCode.Thumbstick2 then
			return state.Position
		end
	end
	return nil
end

local function trigger(code: Enum.KeyCode): number
	for _, state in ipairs(UserInputService:GetGamepadState(Enum.UserInputType.Gamepad1)) do
		if state.KeyCode == code then
			return state.Position.Z
		end
	end
	return 0
end

function OrbitCamera.IsActive(): boolean
	return active
end

function OrbitCamera.Start(model: Model)
	if active then
		OrbitCamera.Stop()
	end
	local cam = Workspace.CurrentCamera
	if not cam then
		return
	end
	active = true
	target = model
	saved = { Type = cam.CameraType, Subject = cam.CameraSubject, CFrame = cam.CFrame }
	CameraOwner.Acquire(OWNER_ID, CameraOwner.Priority.Orbit)
	if CameraOwner.IsMine(OWNER_ID) then
		cam.CameraType = Enum.CameraType.Scriptable
	end

	-- start behind-and-left of the car, at a size-based distance
	local ok, cf, size = pcall(function()
		return model:GetBoundingBox()
	end)
	if ok then
		local look = cf.LookVector
		yaw = math.atan2(-look.X, -look.Z) + math.rad(140)
		dist = math.clamp(size.Magnitude * 1.1, 12, 34)
		minDist = math.max(6, size.Magnitude * 0.55)
		maxDist = math.max(minDist + 10, size.Magnitude * 2.4)
	end

	table.insert(conns, UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.MouseButton2 or t == Enum.UserInputType.Touch then
			dragging = true
			lastPos = input.Position
		end
	end))
	table.insert(conns, UserInputService.InputEnded:Connect(function(input)
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.MouseButton2 or t == Enum.UserInputType.Touch then
			dragging = false
			lastPos = nil
		end
	end))
	table.insert(conns, UserInputService.InputChanged:Connect(function(input, processed)
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseWheel and not processed then
			dist = math.clamp(dist - input.Position.Z * 2.5, minDist, maxDist)
		elseif dragging and (t == Enum.UserInputType.MouseMovement or t == Enum.UserInputType.Touch) then
			local p = input.Position
			if lastPos then
				local d = p - lastPos
				yaw -= d.X * 0.008
				pitch = math.clamp(pitch + d.Y * 0.006, math.rad(2), math.rad(70))
			end
			lastPos = p
		end
	end))
	table.insert(conns, UserInputService.TouchPinch:Connect(function(_, scale, _, state, processed)
		if processed then
			return
		end
		if state == Enum.UserInputState.Change and scale > 0 then
			dist = math.clamp(dist / (1 + (scale - 1) * 0.08), minDist, maxDist)
		end
	end))

	-- keep the car parked: sink throttle / brake / steer / handbrake keys while tuning
	ContextActionService:BindActionAtPriority(SINK, function()
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.W, Enum.KeyCode.S, Enum.KeyCode.A, Enum.KeyCode.D, Enum.KeyCode.Up, Enum.KeyCode.Down, Enum.KeyCode.Left, Enum.KeyCode.Right, Enum.KeyCode.Space, Enum.KeyCode.ButtonR2, Enum.KeyCode.ButtonL2)
	ContextActionService:BindActionAtPriority(ROTATE, function(_, state, input)
		if state == Enum.UserInputState.Begin then
			rotateDir = input.KeyCode == Enum.KeyCode.Z and 1 or -1
		elseif state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
			rotateDir = 0
		end
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.Z, Enum.KeyCode.X)

	RunService:BindToRenderStep(BIND, Enum.RenderPriority.Last.Value, function(dt)
		local c = center()
		local camera = Workspace.CurrentCamera
		if not c or not camera or not CameraOwner.IsMine(OWNER_ID) then
			return
		end
		if camera.CameraType ~= Enum.CameraType.Scriptable then
			camera.CameraType = Enum.CameraType.Scriptable
		end
		yaw += rotateDir * dt * 1.4
		local s = stick()
		if s and s.Magnitude > 0.15 then
			yaw -= s.X * dt * 2
			pitch = math.clamp(pitch + s.Y * dt * 1.2, math.rad(2), math.rad(70))
		end
		local zoom = trigger(Enum.KeyCode.ButtonR2) - trigger(Enum.KeyCode.ButtonL2)
		if math.abs(zoom) > 0.1 then
			dist = math.clamp(dist - zoom * dt * 20, minDist, maxDist)
		end
		local offset = CFrame.Angles(0, yaw, 0) * CFrame.Angles(-pitch, 0, 0) * Vector3.new(0, 0, dist)
		local goal = CFrame.lookAt(c + offset, c)
		camera.CFrame = camera.CFrame:Lerp(goal, math.clamp(dt * 10, 0, 1))
	end)
end

function OrbitCamera.Stop()
	if not active then
		return
	end
	active = false
	target = nil
	rotateDir = 0
	dragging = false
	for _, c in ipairs(conns) do
		c:Disconnect()
	end
	table.clear(conns)
	pcall(function()
		RunService:UnbindFromRenderStep(BIND)
	end)
	ContextActionService:UnbindAction(SINK)
	ContextActionService:UnbindAction(ROTATE)
	-- CameraOwner restores the default camera (or lets the drive camera resume when the player is seated);
	-- restoring the saved CameraType here could leave a stale Scriptable camera behind.
	CameraOwner.Release(OWNER_ID)
	saved = {}
end

return OrbitCamera
