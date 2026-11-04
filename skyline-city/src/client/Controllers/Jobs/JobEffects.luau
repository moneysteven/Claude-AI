-- JobEffects: client-only cosmetics for jobs (hose water spray, sounds, pay popups).
--
--   JobEffects.StartHose(getTarget: () -> Vector3?)   JobEffects.StopHose()
--   JobEffects.Play(soundKey)                          keys of Config.Audio.Jobs / UI
--   JobEffects.PayPopup(parentGui, amount)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Audio = require(Shared.Config.Audio)
local Format = require(Shared.Util.Format)

local UI = script.Parent.Parent.Parent:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local JobEffects = {}

local player = Players.LocalPlayer
local hose: { att: Attachment, emitter: ParticleEmitter, conn: RBXScriptConnection }? = nil
local sounds: { [string]: Sound } = {}

function JobEffects.StopHose()
	if hose then
		hose.conn:Disconnect()
		hose.emitter:Destroy()
		hose.att:Destroy()
		hose = nil
	end
end

function JobEffects.StartHose(getTarget: () -> Vector3?)
	JobEffects.StopHose()
	local char = player.Character
	local hand = char and (char:FindFirstChild("RightHand") or char:FindFirstChild("Right Arm"))
	if not (hand and hand:IsA("BasePart")) then
		return
	end
	local att = Instance.new("Attachment")
	att.Name = "JobHose"
	att.Parent = hand
	local e = Instance.new("ParticleEmitter")
	e.Name = "Water"
	e.Texture = "rbxasset://textures/particles/smoke_main.dds"
	e.Color = ColorSequence.new(Color3.fromRGB(170, 215, 255), Color3.fromRGB(230, 245, 255))
	e.LightEmission = 0.3
	e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(1, 2.4) })
	e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.15), NumberSequenceKeypoint.new(1, 1) })
	e.Lifetime = NumberRange.new(0.5, 0.7)
	e.Speed = NumberRange.new(45, 55)
	e.Acceleration = Vector3.new(0, -40, 0)
	e.SpreadAngle = Vector2.new(4, 4)
	e.Rate = 140
	e.EmissionDirection = Enum.NormalId.Front
	e.Parent = att
	local conn = RunService.RenderStepped:Connect(function()
		if not att.Parent then
			return
		end
		local from = hand.Position
		local target = getTarget()
		local look
		if target and (target - from).Magnitude > 1 then
			look = CFrame.lookAt(from, target + Vector3.new(0, 2, 0))
		else
			local root = char and char:FindFirstChild("HumanoidRootPart")
			look = root and CFrame.lookAt(from, from + (root :: BasePart).CFrame.LookVector * 10) or hand.CFrame
		end
		att.WorldCFrame = look
	end)
	hose = { att = att, emitter = e, conn = conn }
end

function JobEffects.Play(key: string)
	local id = (Audio.Jobs and Audio.Jobs[key]) or (Audio.UI and Audio.UI[key])
	if type(id) ~= "string" or id == "" then
		return
	end
	local s = sounds[key]
	if not s then
		s = Instance.new("Sound")
		s.Name = "Job_" .. key
		s.SoundId = id
		s.Volume = 0.6
		s.Parent = SoundService
		sounds[key] = s
	end
	SoundService:PlayLocalSound(s)
end

function JobEffects.PayPopup(parent: GuiObject?, amount: number)
	if not parent or amount <= 0 then
		return
	end
	local label = Kit.new("TextLabel", {
		Text = "+" .. Format.Money(amount),
		Font = Theme.FontBold,
		TextSize = 30,
		TextColor3 = Theme.Colors.Money,
		TextStrokeTransparency = 0.4,
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 0, -4),
		Size = UDim2.fromOffset(220, 36),
		ZIndex = 10,
		Parent = parent,
	})
	local scale = Kit.new("UIScale", { Scale = 0.5, Parent = label })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)
	Kit.Tween(label, { Position = UDim2.new(0.5, 0, 0, -50), TextTransparency = 1, TextStrokeTransparency = 1 }, TweenInfo.new(1.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In))
	task.delay(1.45, function()
		label:Destroy()
	end)
end

return JobEffects
