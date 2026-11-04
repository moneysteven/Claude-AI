-- Paramedic CPR: tap in time with the pulsing ring (Space / ButtonA / big button).

local RunService = game:GetService("RunService")

local Common = require(script.Parent.Common)
local Kit, Theme = Common.Kit, Common.Theme

local Cpr = {}

function Cpr.Build(body: Frame, data, mg)
	local total = data.Compressions or 15
	local interval = 60 / (data.Bpm or 110)
	local hits, taps = 0, 0
	local startAt = os.clock() + 1.2
	local finished = false

	Common.Heading(body, "❤️ CPR", 1)
	local info = Common.Sub(body, "Tap when the ring meets the heart!", 2)

	local stage = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 170), BackgroundTransparency = 1, LayoutOrder = 3, Parent = body })
	local heart = Kit.new("TextLabel", {
		Text = "❤️",
		TextSize = 64,
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(90, 90),
		ZIndex = 3,
		Parent = stage,
	})
	local ring = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(160, 160),
		BackgroundTransparency = 1,
		Parent = stage,
	})
	Kit.Corner(ring, UDim.new(1, 0))
	local ringStroke = Kit.Stroke(ring, Theme.Colors.Danger, 4, 0)
	local target = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(90, 90),
		BackgroundTransparency = 1,
		Parent = stage,
	})
	Kit.Corner(target, UDim.new(1, 0))
	Kit.Stroke(target, Theme.Colors.Success, 2, 0.3)

	local counter = Kit.Label(("0 / %d compressions"):format(total), {
		TextXAlignment = Enum.TextXAlignment.Center,
		Font = Theme.FontBold,
		LayoutOrder = 4,
		Parent = body,
	})

	local function reset()
		hits, taps = 0, 0
		finished = false
		startAt = os.clock() + 1.2
		counter.Text = ("0 / %d compressions"):format(total)
		info.Text = "Tap when the ring meets the heart!"
	end

	mg.Maid:Give(RunService.RenderStepped:Connect(function()
		local t = os.clock() - startAt
		if t < 0 then
			ring.Size = UDim2.fromOffset(160, 160)
			ringStroke.Transparency = 0.7
			return
		end
		local phase = (t % interval) / interval -- 0 at the beat
		local size = 90 + 70 * (1 - phase)
		ring.Size = UDim2.fromOffset(size, size)
		ringStroke.Transparency = 0
		heart.TextSize = phase < 0.15 and 74 or 64
	end))

	local function tap()
		if finished then
			return
		end
		local t = os.clock() - startAt
		if t < -0.2 then
			return
		end
		taps += 1
		-- distance to the nearest beat, as a fraction of the interval
		local phase = (t % interval) / interval
		local err = math.min(phase, 1 - phase)
		if err <= 0.16 then
			hits += 1
			Common.Feedback(stage, err <= 0.07 and "Perfect!" or "Good", Theme.Colors.Success)
		else
			Common.Feedback(stage, "Off beat", Theme.Colors.Warning)
		end
		counter.Text = ("%d / %d compressions"):format(taps, total)
		if taps >= total then
			finished = true
			local score = hits / total
			info.Text = ("Rhythm: %d%%"):format(math.floor(score * 100))
			task.spawn(function()
				local res = mg.Send({ Score = score })
				if not res.ok and mg.IsOpen() then
					task.wait(0.8)
					reset()
				end
			end)
		end
	end

	local button = Kit.Button("👐 PUSH", "danger", tap, { Size = UDim2.new(1, 0, 0, 64), TextSize = 22, LayoutOrder = 5, Parent = body })
	Common.SelectFirst(button)
	Common.Bind(mg.Maid, "Cpr", function(state)
		if state == Enum.UserInputState.Begin then
			tap()
		end
	end, Enum.KeyCode.Space, Enum.KeyCode.ButtonA, Enum.KeyCode.ButtonR2)
end

return Cpr
