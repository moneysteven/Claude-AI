-- Construction hammer: stop the swing meter in the green for strong hits. Each hit is sent to the
-- server (which rate-limits it and adds shared site progress).

local Common = require(script.Parent.Common)
local Kit, Theme = Common.Kit, Common.Theme

local Hammer = {}

function Hammer.Build(body: Frame, data, mg)
	local need = data.Hits or 4
	local done = data.Done or 0
	local interval = (data.Interval or 0.4) + 0.05
	local lastHit = 0
	local busy = false

	Common.Heading(body, "🔨 Hammer time!", 1)
	local status = Common.Sub(body, ("Hits: %d / %d"):format(done, need), 2)

	local siteBar = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 14), BackgroundColor3 = Theme.Colors.Background, LayoutOrder = 3, Parent = body })
	Kit.Corner(siteBar, UDim.new(1, 0))
	local siteFill = Kit.new("Frame", { Size = UDim2.fromScale(math.clamp((data.SiteProgress or 0) / 100, 0, 1), 1), BackgroundColor3 = Theme.Colors.Warning, Parent = siteBar })
	Kit.Corner(siteFill, UDim.new(1, 0))
	local siteLabel = Kit.Label(("🏗️ Site progress %d%%"):format(math.floor(data.SiteProgress or 0)), {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 4,
		Parent = body,
	})

	local bar = Common.TimingBar(body, { Speed = 1.2, ZoneSize = 0.2, LayoutOrder = 5 })
	bar.Start()
	mg.Maid:Give(function()
		bar.Destroy()
	end)

	local function hit()
		if busy or os.clock() - lastHit < interval then
			return
		end
		busy = true
		lastHit = os.clock()
		local q = bar.Stop()
		local text, color = Common.QualityText(q)
		Common.Feedback(body, text, color)
		local res = mg.Send({ Quality = q }, { KeepOpen = true })
		if res.ok then
			done = res.Hits or (done + 1)
			status.Text = ("Hits: %d / %d"):format(done, need)
			if res.SiteProgress then
				Kit.Tween(siteFill, { Size = UDim2.fromScale(math.clamp(res.SiteProgress / 100, 0, 1), 1) })
				siteLabel.Text = ("🏗️ Site progress %d%%"):format(math.floor(res.SiteProgress))
			end
		end
		busy = false
		if mg.IsOpen() and not res.Done then
			task.wait(0.15)
			if mg.IsOpen() then
				bar.Start()
			end
		end
	end

	local button = Kit.Button("🔨 HIT", "primary", hit, { Size = UDim2.new(1, 0, 0, 60), TextSize = 22, LayoutOrder = 6, Parent = body })
	Common.SelectFirst(button)
	Common.Bind(mg.Maid, "Hammer", function(state)
		if state == Enum.UserInputState.Begin then
			task.spawn(hit)
		end
	end, Enum.KeyCode.Space, Enum.KeyCode.ButtonA, Enum.KeyCode.ButtonR2)
end

return Hammer
