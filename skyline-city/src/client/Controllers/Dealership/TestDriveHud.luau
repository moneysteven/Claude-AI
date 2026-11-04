-- TestDriveHud: the "TestDrive" countdown pill (custom panel on the HUD layer).
-- Opened by the server (NotifyService:OpenUI(player, "TestDrive", { ModelId, Name, Seconds, EndsAt })) and
-- closed with CloseUI when the drive ends. EndsAt is server time (Workspace:GetServerTimeNow()).

local ContextActionService = game:GetService("ContextActionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)

local Client = script:FindFirstAncestor("Client") :: Instance
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))

local TestDriveHud = {}

function TestDriveHud.Build(root: Frame, data: any, ctx)
	local info = type(data) == "table" and data or {}
	local total = type(info.Seconds) == "number" and info.Seconds or 90
	local endsAt = type(info.EndsAt) == "number" and info.EndsAt or (Workspace:GetServerTimeNow() + total)

	local pill = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 70),
		Size = UDim2.fromOffset(360, 64),
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.08,
		Parent = root,
	})
	Kit.Corner(pill, UDim.new(0, 18))
	Kit.Stroke(pill, Theme.Colors.Accent, 2, 0.1)
	local scale = Kit.new("UIScale", { Scale = 0.6, Parent = pill })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)

	Kit.Label("🏁 TEST DRIVE", {
		Position = UDim2.fromOffset(16, 8),
		Size = UDim2.new(1, -120, 0, 18),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = 12,
		Font = Theme.FontBold,
		TextColor3 = Theme.Colors.Accent,
		Parent = pill,
	})
	Kit.Label(tostring(info.Name or "Car"), {
		Position = UDim2.fromOffset(16, 26),
		Size = UDim2.new(1, -200, 0, 22),
		AutomaticSize = Enum.AutomaticSize.None,
		Font = Theme.FontBold,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = pill,
	})
	local timer = Kit.Label("1:30", {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -96, 0, 10),
		Size = UDim2.fromOffset(80, 44),
		AutomaticSize = Enum.AutomaticSize.None,
		Font = Theme.FontMono,
		TextSize = 28,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = pill,
	})
	local ending = false
	local function endDrive()
		if ending then
			return
		end
		ending = true
		local res = Net.Invoke("Dealership", "EndTestDrive", {})
		if not res.ok then
			ctx.Close()
		end
		ending = false
	end
	Kit.Button(Kit.IsGamepad() and "End (Y)" or "End", "danger", endDrive, {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.fromOffset(74, 44),
		Parent = pill,
	})
	local bar = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 16, 1, -6),
		Size = UDim2.new(1, -112, 0, 4),
		BackgroundColor3 = Theme.Colors.Background,
		Parent = pill,
	})
	Kit.Corner(bar, UDim.new(1, 0))
	local fill = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Theme.Colors.Accent, Parent = bar })
	Kit.Corner(fill, UDim.new(1, 0))

	local lastShown = -1
	local warned = false
	local conn: RBXScriptConnection
	conn = RunService.Heartbeat:Connect(function()
		local left = math.max(0, endsAt - Workspace:GetServerTimeNow())
		local secs = math.ceil(left)
		if secs ~= lastShown then
			lastShown = secs
			timer.Text = string.format("%d:%02d", secs // 60, secs % 60)
			local frac = math.clamp(left / math.max(1, total), 0, 1)
			Kit.Tween(fill, { Size = UDim2.fromScale(frac, 1) }, Theme.Tween.Fast)
			if secs <= 10 then
				timer.TextColor3 = Theme.Colors.Danger
				fill.BackgroundColor3 = Theme.Colors.Danger
				if not warned then
					warned = true
					Router.Notify("10 seconds left on your test drive!", "warning", 3)
				end
			end
		end
		if left <= 0 then
			-- server ends it; close our HUD a little later in case the close event is lost
			task.delay(4, function()
				if Router.IsOpen("TestDrive") then
					ctx.Close()
				end
			end)
			conn:Disconnect()
		end
	end)
	ctx.Maid:Give(conn)

	-- gamepad / keyboard: ButtonY or Backspace ends the drive (the End button is hard to reach while driving).
	-- Bound above the driving controls (3100); D-pad down is the gearbox (shift down) while seated, so the
	-- free face button Y is used instead (the phone is not needed during a test drive). See docs/CONTROLS.md.
	local ACTION = "SkylineEndTestDrive"
	ContextActionService:BindActionAtPriority(ACTION, function(_, st)
		if st == Enum.UserInputState.Begin then
			task.spawn(endDrive)
		end
		return Enum.ContextActionResult.Sink
	end, false, 3200, Enum.KeyCode.ButtonY, Enum.KeyCode.Backspace)
	ctx.Maid:Give(function()
		ContextActionService:UnbindAction(ACTION)
	end)
end

return TestDriveHud
