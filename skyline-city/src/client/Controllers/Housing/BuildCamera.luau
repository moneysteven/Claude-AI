-- BuildCamera (client helper): orbit / pan / zoom camera for build mode.
--   PC:       right-drag orbit · middle-drag pan · wheel zoom · WASD / arrows pan · Q / E turn
--   Mobile:   one-finger drag orbit · two-finger drag pan · pinch zoom
--   Gamepad:  left stick pan · right stick orbit · L2 / R2 zoom
--
--   BuildCamera.Start(origin: CFrame, size: Vector3, floorY: number)
--   BuildCamera.Stop()
--   BuildCamera.SetFloorY(y)          relative height the camera focuses on
--   BuildCamera.IsGesturing() -> bool true while a touch drag / pinch is moving the camera (suppresses taps)

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local HousingConfig = require(Shared.Config.Housing)
local Maid = require(Shared.Util.Maid)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent
local CameraOwner = require(Client:WaitForChild("Util"):WaitForChild("CameraOwner"))
local OWNER_ID = "Build"

local BuildCamera = {}

local CFG = HousingConfig.Build
local RENDER_NAME = "SkylineBuildCamera"
local ACTION_KEYS = "SkylineBuildCameraKeys"

local maid = Maid.new()
local active = false
local origin = CFrame.new()
local area = Vector3.new(40, 12, 40)
local focus = Vector3.zero -- relative to origin
local yaw = 0
local pitch = math.rad(55)
local dist = 60
local targetDist = 60
local floorY = 0

local keys: { [Enum.KeyCode]: boolean } = {}
local stick1 = Vector2.zero
local stick2 = Vector2.zero
local triggerL, triggerR = 0, 0
local rmb, mmb = false, false
local gesturing = false
local gestureTime = 0
local lastPan: Vector2? = nil
local pinchStart = 60

local function clampFocus()
	local mx = area.X / 2 + 10
	local mz = area.Z / 2 + 10
	focus = Vector3.new(math.clamp(focus.X, -mx, mx), floorY, math.clamp(focus.Z, -mz, mz))
end

local function panBy(dx: number, dz: number)
	-- dx right, dz forward in camera-yaw space
	local forward = Vector3.new(-math.sin(yaw), 0, -math.cos(yaw))
	local right = Vector3.new(math.cos(yaw), 0, -math.sin(yaw))
	focus += right * dx + forward * dz
	clampFocus()
end

local function orbitBy(dx: number, dy: number)
	yaw -= dx
	pitch = math.clamp(pitch + dy, math.rad(18), math.rad(86))
end

local function zoomBy(factor: number)
	targetDist = math.clamp(targetDist * factor, CFG.CameraMinDistance, CFG.CameraMaxDistance)
end

local function deadzone(v: Vector2): Vector2
	if v.Magnitude < 0.15 then
		return Vector2.zero
	end
	return v
end

local function step(dt: number)
	local cam = Workspace.CurrentCamera
	if not cam or not CameraOwner.IsMine(OWNER_ID) then
		return
	end
	if cam.CameraType ~= Enum.CameraType.Scriptable then
		cam.CameraType = Enum.CameraType.Scriptable
	end
	if not UserInputService:GetFocusedTextBox() then
		local kx, kz = 0, 0
		if keys[Enum.KeyCode.W] or keys[Enum.KeyCode.Up] then
			kz += 1
		end
		if keys[Enum.KeyCode.S] or keys[Enum.KeyCode.Down] then
			kz -= 1
		end
		if keys[Enum.KeyCode.D] or keys[Enum.KeyCode.Right] then
			kx += 1
		end
		if keys[Enum.KeyCode.A] or keys[Enum.KeyCode.Left] then
			kx -= 1
		end
		local speed = math.max(20, dist * 1.1)
		if kx ~= 0 or kz ~= 0 then
			panBy(kx * speed * dt, kz * speed * dt)
		end
		if keys[Enum.KeyCode.Q] then
			yaw += 1.6 * dt
		end
		if keys[Enum.KeyCode.E] then
			yaw -= 1.6 * dt
		end
	end
	local s1 = deadzone(stick1)
	if s1 ~= Vector2.zero then
		local speed = math.max(20, dist * 1.1)
		panBy(s1.X * speed * dt, s1.Y * speed * dt)
	end
	local s2 = deadzone(stick2)
	if s2 ~= Vector2.zero then
		orbitBy(s2.X * 2.2 * dt, -s2.Y * 1.6 * dt)
	end
	if triggerL > 0.1 then
		zoomBy(1 + triggerL * dt * 1.5)
	end
	if triggerR > 0.1 then
		zoomBy(1 - triggerR * dt * 1.2)
	end
	dist += (targetDist - dist) * math.clamp(dt * 12, 0, 1)
	local worldFocus = origin:PointToWorldSpace(focus)
	local rot = (origin - origin.Position) * CFrame.Angles(0, yaw, 0) * CFrame.Angles(-pitch, 0, 0)
	cam.CFrame = CFrame.new(worldFocus) * rot * CFrame.new(0, 0, dist)
	cam.Focus = CFrame.new(worldFocus)
	if gesturing and os.clock() - gestureTime > 0.25 then
		gesturing = false
	end
end

function BuildCamera.IsGesturing(): boolean
	return gesturing
end

function BuildCamera.SetFloorY(y: number)
	floorY = y
	clampFocus()
end

function BuildCamera.Start(o: CFrame, size: Vector3, fy: number)
	if active then
		BuildCamera.Stop()
	end
	active = true
	origin = o
	area = size
	floorY = fy or 0
	focus = Vector3.new(0, floorY, 0)
	yaw = 0
	pitch = math.rad(55)
	targetDist = math.clamp(math.max(size.X, size.Z) * 1.0, CFG.CameraMinDistance + 10, CFG.CameraMaxDistance)
	dist = targetDist
	table.clear(keys)

	CameraOwner.Acquire(OWNER_ID, CameraOwner.Priority.Build)
	local cam = Workspace.CurrentCamera
	if cam and CameraOwner.IsMine(OWNER_ID) then
		cam.CameraType = Enum.CameraType.Scriptable
	end

	RunService:BindToRenderStep(RENDER_NAME, Enum.RenderPriority.Camera.Value + 1, step)
	maid:Give(function()
		RunService:UnbindFromRenderStep(RENDER_NAME)
	end)

	-- sink movement keys so the character / other systems don't react while building
	local keyList = {
		Enum.KeyCode.W,
		Enum.KeyCode.A,
		Enum.KeyCode.S,
		Enum.KeyCode.D,
		Enum.KeyCode.Up,
		Enum.KeyCode.Down,
		Enum.KeyCode.Left,
		Enum.KeyCode.Right,
		Enum.KeyCode.Q,
		Enum.KeyCode.E,
		Enum.KeyCode.Space,
		Enum.KeyCode.Thumbstick1,
		Enum.KeyCode.Thumbstick2,
		Enum.KeyCode.ButtonL2,
		Enum.KeyCode.ButtonR2,
	}
	ContextActionService:BindActionAtPriority(ACTION_KEYS, function(_, state, input)
		if UserInputService:GetFocusedTextBox() then
			return Enum.ContextActionResult.Pass
		end
		local kc = input.KeyCode
		if kc == Enum.KeyCode.Thumbstick1 then
			stick1 = Vector2.new(input.Position.X, input.Position.Y)
			if state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
				stick1 = Vector2.zero
			end
		elseif kc == Enum.KeyCode.Thumbstick2 then
			stick2 = Vector2.new(input.Position.X, input.Position.Y)
			if state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
				stick2 = Vector2.zero
			end
		elseif kc == Enum.KeyCode.ButtonL2 then
			triggerL = (state == Enum.UserInputState.End) and 0 or input.Position.Z
		elseif kc == Enum.KeyCode.ButtonR2 then
			triggerR = (state == Enum.UserInputState.End) and 0 or input.Position.Z
		else
			keys[kc] = state == Enum.UserInputState.Begin or state == Enum.UserInputState.Change
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.ContextActionPriority.High.Value + 10, table.unpack(keyList))
	maid:Give(function()
		ContextActionService:UnbindAction(ACTION_KEYS)
	end)

	maid:Give(UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton2 then
			rmb = true
			UserInputService.MouseBehavior = Enum.MouseBehavior.LockCurrentPosition
		elseif input.UserInputType == Enum.UserInputType.MouseButton3 then
			mmb = true
		end
	end))
	maid:Give(UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton2 then
			rmb = false
			UserInputService.MouseBehavior = Enum.MouseBehavior.Default
		elseif input.UserInputType == Enum.UserInputType.MouseButton3 then
			mmb = false
		end
	end))
	maid:Give(UserInputService.InputChanged:Connect(function(input, processed)
		if input.UserInputType == Enum.UserInputType.MouseMovement then
			if rmb then
				orbitBy(input.Delta.X * 0.006, -input.Delta.Y * 0.005)
			elseif mmb then
				local k = dist * 0.0025
				panBy(-input.Delta.X * k, input.Delta.Y * k)
			end
		elseif input.UserInputType == Enum.UserInputType.MouseWheel and not processed then
			zoomBy(input.Position.Z > 0 and 0.88 or 1.14)
		end
	end))

	-- touch gestures
	maid:Give(UserInputService.TouchPan:Connect(function(positions, translation, _, state, processed)
		if processed then
			return
		end
		if state == Enum.UserInputState.Begin then
			lastPan = translation
			return
		end
		local last = lastPan or translation
		local delta = translation - last
		lastPan = translation
		if state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
			lastPan = nil
		end
		if delta.Magnitude < 0.5 then
			return
		end
		gesturing = true
		gestureTime = os.clock()
		if #positions >= 2 then
			local k = dist * 0.003
			panBy(-delta.X * k, delta.Y * k)
		else
			orbitBy(delta.X * 0.008, -delta.Y * 0.006)
		end
	end))
	maid:Give(UserInputService.TouchPinch:Connect(function(_, scale, _, state, processed)
		if processed then
			return
		end
		if state == Enum.UserInputState.Begin then
			pinchStart = targetDist
			return
		end
		gesturing = true
		gestureTime = os.clock()
		if scale > 0 then
			targetDist = math.clamp(pinchStart / scale, CFG.CameraMinDistance, CFG.CameraMaxDistance)
		end
	end))
end

function BuildCamera.Stop()
	if not active then
		return
	end
	active = false
	maid:Clean()
	table.clear(keys)
	stick1, stick2 = Vector2.zero, Vector2.zero
	triggerL, triggerR = 0, 0
	rmb, mmb = false, false
	UserInputService.MouseBehavior = Enum.MouseBehavior.Default
	-- hands the camera back (default Custom camera, or the drive camera if the player is still seated)
	CameraOwner.Release(OWNER_ID)
end

return BuildCamera
