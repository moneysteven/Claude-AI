-- Camera app (phone): photo mode with a selfie camera, zoom, colour filters and a pose button.
--   CameraApp.Register()   registers the custom Router panel "PhoneCamera" (Layer "Phone")
--   CameraApp.Enter()      closes the phone and opens photo mode
-- Photo mode hides the HUD (Router.SetHudVisible(false)); exiting restores the camera, FOV, filters and HUD.
-- Selfie = Scriptable camera in front of your face, looking back at you, following your head every frame.
-- Controls: ✕ exit (ButtonB) · 🔄 selfie/rear (ButtonX) · ◀ ▶ filters (DPad) · ＋ － zoom (L1/R1, mouse wheel)
--           🕺 pose (ButtonY) · 📸 shutter (ButtonA) — the controls hide for a moment so you can screenshot.

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local PhoneConfig = require(Shared.Config.Phone)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))
local Registry = require(Client:WaitForChild("Registry"))
local CameraOwner = require(Client:WaitForChild("Util"):WaitForChild("CameraOwner"))
local OWNER_ID = "Selfie"

local CameraApp = {}

local CFG = PhoneConfig.Camera
local PANEL = "PhoneCamera"
local RENDER_STEP = "SkylineSelfieCamera"
local localPlayer = Players.LocalPlayer

local function build(content: Frame, _data: any, ctx)
	local camera = Workspace.CurrentCamera
	local saved = {
		-- restore the camera type that was active (a stale Scriptable camera is restored as Custom)
		Type = camera.CameraType == Enum.CameraType.Scriptable and Enum.CameraType.Custom or camera.CameraType,
		FOV = camera.FieldOfView,
		Subject = camera.CameraSubject,
	}
	local mode = "rear"
	local selfieDist = CFG.SelfieDistance.Default
	local fov = math.clamp(saved.FOV, CFG.FieldOfView.Min, CFG.FieldOfView.Max)
	local filterIndex = 1
	local poseIndex = 0

	Router.SetHudVisible(false)

	local effect = Instance.new("ColorCorrectionEffect")
	effect.Name = "SkylinePhotoFilter"
	effect.Parent = camera

	local function applyFilter()
		local f = CFG.Filters[filterIndex]
		effect.Brightness = f.Brightness or 0
		effect.Contrast = f.Contrast or 0
		effect.Saturation = f.Saturation or 0
		effect.TintColor = f.TintColor or Color3.new(1, 1, 1)
	end
	applyFilter()

	-- UI ----------------------------------------------------------------------
	local ui = Kit.new("Frame", {
		Name = "Controls",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Parent = content,
	})
	local flash = Kit.new("Frame", {
		Name = "Flash",
		BackgroundColor3 = Color3.new(1, 1, 1),
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 20,
		Parent = content,
	})

	local top = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 12),
		Size = UDim2.fromOffset(300, 44),
		BackgroundColor3 = Theme.Colors.Background,
		BackgroundTransparency = 0.35,
		Parent = ui,
	})
	Kit.Corner(top, UDim.new(1, 0))
	local filterLabel = Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(48, 0),
		Size = UDim2.new(1, -96, 1, 0),
		Font = Theme.FontBold,
		TextSize = 16,
		TextColor3 = Theme.Colors.Text,
		Text = "",
		Parent = top,
	})
	local function refreshLabel()
		filterLabel.Text = ("%s  ·  %s"):format(CFG.Filters[filterIndex].Name, mode == "selfie" and "Selfie" or "Camera")
	end
	local function stepFilter(dir: number)
		filterIndex = ((filterIndex - 1 + dir) % #CFG.Filters) + 1
		applyFilter()
		refreshLabel()
	end
	Kit.IconButton("◀", function()
		stepFilter(-1)
	end, { Size = UDim2.fromOffset(44, 44), BackgroundTransparency = 1, Parent = top })
	Kit.IconButton("▶", function()
		stepFilter(1)
	end, { Size = UDim2.fromOffset(44, 44), Position = UDim2.new(1, -44, 0, 0), BackgroundTransparency = 1, Parent = top })

	local bottom = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -16),
		Size = UDim2.fromOffset(440, 84),
		BackgroundTransparency = 1,
		Parent = ui,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(440, 84), Parent = bottom })
	Kit.List(bottom, 10, true, Enum.HorizontalAlignment.Center)

	local function exit()
		ctx.Close()
	end

	local function setMode(m: string)
		mode = m
		if m == "selfie" then
			CameraOwner.Acquire(OWNER_ID, CameraOwner.Priority.Selfie)
			if CameraOwner.IsMine(OWNER_ID) then
				camera.CameraType = Enum.CameraType.Scriptable
			end
		elseif CameraOwner.IsHeld(OWNER_ID) then
			-- back to the rear camera: the default camera, or the drive / build camera if one is active
			CameraOwner.Release(OWNER_ID)
		end
		refreshLabel()
	end

	local function zoom(dir: number)
		if mode == "selfie" then
			selfieDist = math.clamp(selfieDist - dir * CFG.ZoomStep, CFG.SelfieDistance.Min, CFG.SelfieDistance.Max)
		else
			fov = math.clamp(fov - dir * CFG.ZoomStep * 10, CFG.FieldOfView.Min, CFG.FieldOfView.Max)
			Kit.Tween(camera, { FieldOfView = fov }, Theme.Tween.Fast)
		end
	end

	local function pose()
		local emotes = Registry.Find("EmoteController")
		if not emotes or not emotes.Play then
			Router.Notify("Emotes aren't available", "error")
			return
		end
		poseIndex = (poseIndex % #CFG.Poses) + 1
		emotes:Play(CFG.Poses[poseIndex])
	end

	local shutterBusy = false
	local function shutter()
		if shutterBusy then
			return
		end
		shutterBusy = true
		flash.BackgroundTransparency = 0.1
		Kit.Tween(flash, { BackgroundTransparency = 1 }, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out))
		ui.Visible = false
		task.delay(CFG.ShutterHideSeconds, function()
			if ui.Parent then
				ui.Visible = true
			end
			shutterBusy = false
		end)
	end

	local function btn(order: number, icon: string, label: string, onClick: () -> (), big: boolean?)
		local size = big and 76 or 56
		local holder = Kit.new("Frame", {
			LayoutOrder = order,
			Size = UDim2.fromOffset(size, 84),
			BackgroundTransparency = 1,
			Parent = bottom,
		})
		local b = Kit.IconButton(icon, onClick, {
			Size = UDim2.fromOffset(size, size),
			Position = UDim2.new(0.5, -size / 2, 0, big and 0 or 10),
			TextSize = big and 34 or 24,
			BackgroundColor3 = big and Color3.new(1, 1, 1) or Theme.Colors.Surface,
			BackgroundTransparency = big and 0 or 0.2,
			Parent = holder,
		})
		if not big then
			Kit.new("TextLabel", {
				BackgroundTransparency = 1,
				Position = UDim2.new(0, -10, 1, -14),
				Size = UDim2.new(1, 20, 0, 14),
				Text = label,
				TextSize = 11,
				Font = Theme.FontBold,
				TextColor3 = Color3.new(1, 1, 1),
				TextStrokeTransparency = 0.5,
				Parent = holder,
			})
		end
		return b
	end
	btn(1, "✕", "Exit", exit)
	btn(2, "🔄", "Selfie", function()
		setMode(mode == "selfie" and "rear" or "selfie")
	end)
	btn(3, "－", "Zoom out", function()
		zoom(-1)
	end)
	local shutterBtn = btn(4, "📸", "", shutter, true)
	btn(5, "＋", "Zoom in", function()
		zoom(1)
	end)
	btn(6, "🕺", "Pose", pose)

	refreshLabel()
	if Kit.IsGamepad() then
		GuiService.SelectedObject = shutterBtn
	end

	-- selfie camera follows the head every frame
	RunService:BindToRenderStep(RENDER_STEP, Enum.RenderPriority.Camera.Value + 1, function()
		if mode ~= "selfie" or not CameraOwner.IsMine(OWNER_ID) then
			return
		end
		local char = localPlayer.Character
		local head = char and char:FindFirstChild("Head")
		if not head or not head:IsA("BasePart") then
			return
		end
		local root = char:FindFirstChild("HumanoidRootPart")
		local facing = (root and root:IsA("BasePart")) and root.CFrame.LookVector or head.CFrame.LookVector
		local flat = Vector3.new(facing.X, 0, facing.Z)
		if flat.Magnitude < 0.01 then
			flat = Vector3.new(0, 0, -1)
		end
		flat = flat.Unit
		local eye = head.Position + flat * selfieDist + Vector3.new(0, CFG.SelfieHeight, 0)
		camera.CFrame = CFrame.lookAt(eye, head.Position + Vector3.new(0, 0.1, 0))
		camera.FieldOfView = fov
	end)

	-- input: gamepad + mouse wheel (selfie)
	ContextActionService:BindActionAtPriority("SkylinePhotoMode", function(_, state, input)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		local k = input.KeyCode
		if k == Enum.KeyCode.ButtonB then
			exit()
		elseif k == Enum.KeyCode.ButtonX then
			setMode(mode == "selfie" and "rear" or "selfie")
		elseif k == Enum.KeyCode.ButtonL1 then
			zoom(-1)
		elseif k == Enum.KeyCode.ButtonR1 then
			zoom(1)
		elseif k == Enum.KeyCode.DPadLeft then
			stepFilter(-1)
		elseif k == Enum.KeyCode.DPadRight then
			stepFilter(1)
		elseif k == Enum.KeyCode.ButtonY then
			pose()
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.ContextActionPriority.High.Value, Enum.KeyCode.ButtonB, Enum.KeyCode.ButtonX, Enum.KeyCode.ButtonL1, Enum.KeyCode.ButtonR1, Enum.KeyCode.DPadLeft, Enum.KeyCode.DPadRight, Enum.KeyCode.ButtonY)
	ctx.Maid:Give(UserInputService.InputChanged:Connect(function(input, processed)
		if mode == "selfie" and not processed and input.UserInputType == Enum.UserInputType.MouseWheel then
			zoom(input.Position.Z > 0 and 1 or -1)
		end
	end))

	-- leave photo mode if the character dies / respawns
	local function watchCharacter(char: Model?)
		if not char then
			return
		end
		local hum = char:FindFirstChildOfClass("Humanoid") or char:WaitForChild("Humanoid", 5)
		if hum and hum:IsA("Humanoid") then
			ctx.Maid:Give(hum.Died:Connect(exit))
		end
	end
	task.spawn(watchCharacter, localPlayer.Character)
	ctx.Maid:Give(localPlayer.CharacterAdded:Connect(function()
		exit()
	end))

	return function()
		RunService:UnbindFromRenderStep(RENDER_STEP)
		ContextActionService:UnbindAction("SkylinePhotoMode")
		effect:Destroy()
		if CameraOwner.IsHeld(OWNER_ID) then
			CameraOwner.Release(OWNER_ID)
		end
		camera.FieldOfView = saved.FOV
		Router.SetHudVisible(true)
		if GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(content) then
			GuiService.SelectedObject = nil
		end
	end
end

function CameraApp.Register()
	Router.Register(PANEL, {
		Title = "Camera",
		Icon = "📷",
		Kind = "custom",
		Layer = "Phone",
		Build = build,
	})
end

function CameraApp.Enter()
	Router.Close("Phone")
	task.defer(function()
		Router.Open(PANEL)
	end)
end

function CameraApp.IsActive(): boolean
	return Router.IsOpen(PANEL)
end

return CameraApp
