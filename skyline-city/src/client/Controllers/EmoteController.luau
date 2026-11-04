-- EmoteController: the emote wheel (custom Router panel "Emotes") + playing emotes / poses.
--
--   * HUD button "Emotes" (order 60), key B / gamepad D-pad down, keys 1-0 pick while the wheel is open, gamepad: D-pad / stick to
--     select, A to play, B to close.
--   * Built-in R15 emotes via Humanoid:PlayEmote ("wave","point","dance","dance2","dance3","laugh","cheer").
--   * Poses (sit on ground, lay down, salute) are procedural: the server sets the character attribute Pose and
--     every client renders it (Social/PoseRenderer). Near an RPSeat, "Sit" / "Lay Down" use the seat instead.
--   * Moving or jumping stops the current pose.
--
-- API (client):
--   EmoteController:Play(emoteId) -> boolean     ids from Config.Social.Emotes
--   EmoteController:Stop()
--   EmoteController:OpenWheel() / :CloseWheel()

local CollectionService = game:GetService("CollectionService")
local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local World = require(Shared.Config.World)
local SocialConfig = require(Shared.Config.Social)

local Client = script.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local PoseRenderer = require(script.Parent:WaitForChild("Social"):WaitForChild("PoseRenderer"))

local EmoteController = {
	Name = "EmoteController",
	Priority = 50,
}

local PANEL = "Emotes"
local localPlayer = Players.LocalPlayer

local emotesById: { [string]: any } = {}
for _, e in ipairs(SocialConfig.Emotes) do
	emotesById[e.Id] = e
end

local poseActive = false
local poseToken = 0
local stopConn: RBXScriptConnection? = nil

local NUMBER_KEYS = {
	Enum.KeyCode.One,
	Enum.KeyCode.Two,
	Enum.KeyCode.Three,
	Enum.KeyCode.Four,
	Enum.KeyCode.Five,
	Enum.KeyCode.Six,
	Enum.KeyCode.Seven,
	Enum.KeyCode.Eight,
	Enum.KeyCode.Nine,
	Enum.KeyCode.Zero,
}

---------------------------------------------------------------------------
-- Playing
---------------------------------------------------------------------------
local function humanoid(): Humanoid?
	local char = localPlayer.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum and hum.Health > 0 then
		return hum
	end
	return nil
end

local function nearestSeat(sleep: boolean): Seat?
	local char = localPlayer.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return nil
	end
	local best, bestDist = nil, SocialConfig.Seats.UseDistance - 1
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.Seat)) do
		if inst:IsA("Seat") and inst.Occupant == nil and not inst.Disabled then
			local isBed = inst:GetAttribute("Pose") == "Sleep"
			if isBed == sleep then
				local d = (inst.Position - root.Position).Magnitude
				if d < bestDist then
					best, bestDist = inst, d
				end
			end
		end
	end
	return best
end

local function watchForMovement()
	if stopConn then
		stopConn:Disconnect()
	end
	local hum = humanoid()
	if not hum then
		return
	end
	local grace = os.clock() + 0.6 -- ignore the input that opened the wheel
	stopConn = RunService.Heartbeat:Connect(function()
		if os.clock() < grace then
			return
		end
		local h = humanoid()
		if not h or not poseActive then
			if stopConn then
				stopConn:Disconnect()
				stopConn = nil
			end
			return
		end
		if h.SeatPart == nil and (h.MoveDirection.Magnitude > 0.1 or h.Jump) then
			EmoteController:Stop()
		end
	end)
end

function EmoteController:Stop()
	poseToken += 1
	if stopConn then
		stopConn:Disconnect()
		stopConn = nil
	end
	if poseActive then
		poseActive = false
		task.spawn(function()
			Net.Invoke("Social", "SetPose", { Pose = "" })
		end)
	end
end

function EmoteController:Play(emoteId: string): boolean
	local e = emotesById[emoteId]
	local hum = humanoid()
	if not e or not hum then
		return false
	end
	if localPlayer:GetAttribute("InVehicle") == true then
		Router.Notify("You can't emote while driving", "warning", 2)
		return false
	end
	if e.Kind == "Emote" then
		if poseActive then
			self:Stop()
		end
		local ok, played = pcall(function()
			return hum:PlayEmote(e.Emote)
		end)
		if not ok or played == false then
			Router.Notify("That emote can't play right now", "warning", 2)
			return false
		end
		return true
	end

	-- poses
	if e.Pose == "SitGround" or e.Pose == "Lay" then
		local seat = nearestSeat(e.Pose == "Lay")
		if seat then
			local res = Net.Invoke("Social", e.Pose == "Lay" and "Sleep" or "Sit", { Seat = seat })
			if res.ok then
				return true
			end
		end
	end
	if hum.SeatPart then
		Router.Notify("Stand up first (jump)", "warning", 2)
		return false
	end
	local res = Net.Invoke("Social", "SetPose", { Pose = e.Pose })
	if not res.ok then
		Router.Notify(res.err or "Can't do that right now", "warning", 2)
		return false
	end
	poseActive = true
	poseToken += 1
	local myToken = poseToken
	watchForMovement()
	if type(e.Seconds) == "number" and e.Seconds > 0 then
		task.delay(e.Seconds, function()
			if poseToken == myToken and poseActive then
				EmoteController:Stop()
			end
		end)
	end
	return true
end

---------------------------------------------------------------------------
-- Wheel
---------------------------------------------------------------------------
local function buildWheel(content: Frame, _data: any, ctx)
	local overlay = Kit.new("TextButton", {
		Name = "Overlay",
		Text = "",
		AutoButtonColor = false,
		Selectable = false,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Colors.Overlay,
		BackgroundTransparency = 1,
		Parent = content,
	})
	Kit.Tween(overlay, { BackgroundTransparency = 0.55 }, Theme.Tween.Fast)
	overlay.Activated:Connect(function()
		ctx.Close()
	end)

	local wheel = Kit.new("Frame", {
		Name = "Wheel",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(360, 360),
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.12,
		Active = true,
		Parent = content,
	})
	Kit.Corner(wheel, UDim.new(1, 0))
	Kit.Stroke(wheel, Theme.Colors.Accent, 2, 0.3)
	local scale = Kit.new("UIScale", { Scale = 0.6, Parent = wheel })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)

	local hint = Kit.new("TextLabel", {
		Name = "Hint",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.62),
		Size = UDim2.fromOffset(120, 22),
		BackgroundTransparency = 1,
		Font = Theme.FontBold,
		TextSize = 14,
		TextColor3 = Theme.Colors.TextDim,
		Text = "Emotes",
		Parent = wheel,
	})

	local emotes = SocialConfig.Emotes
	local n = #emotes
	local radius = 128
	local firstButton: GuiObject? = nil
	for i, e in ipairs(emotes) do
		local angle = (i - 1) / n * math.pi * 2 - math.pi / 2
		local x, y = math.cos(angle) * radius, math.sin(angle) * radius
		local b = Kit.new("TextButton", {
			Name = e.Id,
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(0.5, x, 0.5, y),
			Size = UDim2.fromOffset(66, 66),
			BackgroundColor3 = Theme.Colors.SurfaceAlt,
			Text = e.Icon,
			TextSize = 30,
			Font = Theme.FontBold,
			TextColor3 = Theme.Colors.Text,
			AutoButtonColor = true,
			Parent = wheel,
		})
		Kit.Corner(b, UDim.new(1, 0))
		Kit.Stroke(b, Theme.Colors.Stroke, 1, 0.3)
		Kit.Ripple(b)
		Kit.new("TextLabel", {
			BackgroundTransparency = 1,
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 1, 0),
			Size = UDim2.fromOffset(90, 16),
			Text = (i <= 10 and ("%d · "):format(i % 10) or "") .. e.Name,
			TextSize = 11,
			Font = Theme.FontBold,
			TextColor3 = Theme.Colors.Text,
			TextStrokeTransparency = 0.5,
			Parent = b,
		})
		local function show()
			hint.Text = e.Name
		end
		b.MouseEnter:Connect(show)
		b.SelectionGained:Connect(show)
		b.Activated:Connect(function()
			ctx.Close()
			task.spawn(function()
				EmoteController:Play(e.Id)
			end)
		end)
		if not firstButton then
			firstButton = b
		end
	end

	local stop = Kit.Button("Stop", "secondary", function()
		EmoteController:Stop()
		local hum = humanoid()
		if hum then
			-- PlayEmote animations stop when the humanoid moves; nudge it by re-playing idle
			for _, track in ipairs(hum:GetPlayingAnimationTracks()) do
				if track.Priority == Enum.AnimationPriority.Action then
					track:Stop(0.2)
				end
			end
		end
		ctx.Close()
	end, {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.46),
		Size = UDim2.fromOffset(96, 44),
		Parent = wheel,
	})
	local corner = stop:FindFirstChildOfClass("UICorner")
	if corner then
		corner.CornerRadius = UDim.new(1, 0)
	end

	if Kit.IsGamepad() and firstButton then
		GuiService.SelectedObject = firstButton
	end

	ContextActionService:BindActionAtPriority("SkylineEmoteWheel", function(_, state, input)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		if input.KeyCode == Enum.KeyCode.ButtonB then
			ctx.Close()
			return Enum.ContextActionResult.Sink
		end
		local idx = table.find(NUMBER_KEYS, input.KeyCode)
		if idx and emotes[idx] then
			ctx.Close()
			task.spawn(function()
				EmoteController:Play(emotes[idx].Id)
			end)
			return Enum.ContextActionResult.Sink
		end
		return Enum.ContextActionResult.Pass
	end, false, Enum.ContextActionPriority.High.Value, Enum.KeyCode.ButtonB, table.unpack(NUMBER_KEYS))

	return function()
		ContextActionService:UnbindAction("SkylineEmoteWheel")
		if GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(content) then
			GuiService.SelectedObject = nil
		end
	end
end

function EmoteController:OpenWheel()
	Router.Open(PANEL)
end

function EmoteController:CloseWheel()
	Router.Close(PANEL)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function EmoteController:Init()
	Router.Register(PANEL, {
		Title = "Emotes",
		Icon = "💃",
		Kind = "custom",
		Layer = "Panels",
		Build = buildWheel,
	})
end

function EmoteController:Start()
	PoseRenderer.Start()

	Router.AddHudButton("Emotes", "💃", "Emotes", SocialConfig.EmoteHudOrder, function()
		Router.Toggle(PANEL)
	end)
	-- PC key B, gamepad D-pad down (on foot only: in a car B / D-pad are driving controls, and while the
	-- gamepad is navigating another menu the D-pad belongs to that menu)
	ContextActionService:BindAction("SkylineEmoteToggle", function(_, state, input)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		local open = Router.IsOpen(PANEL)
		if not open and localPlayer:GetAttribute("InVehicle") == true then
			return Enum.ContextActionResult.Pass
		end
		if input.KeyCode == SocialConfig.EmoteGamepadKey and (open or GuiService.SelectedObject ~= nil) then
			return Enum.ContextActionResult.Pass -- D-pad navigates the open wheel (B closes it)
		end
		Router.Toggle(PANEL)
		return Enum.ContextActionResult.Pass
	end, false, SocialConfig.EmoteKey, SocialConfig.EmoteGamepadKey)

	localPlayer.CharacterAdded:Connect(function()
		poseActive = false
		poseToken += 1
		if stopConn then
			stopConn:Disconnect()
			stopConn = nil
		end
	end)
end

return EmoteController
