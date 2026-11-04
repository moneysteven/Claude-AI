-- Chef recipe: pick the next step from the recipe card, then stop the timing bar in the green.

local Common = require(script.Parent.Common)
local Kit, Theme = Common.Kit, Common.Theme

local Recipe = {}

function Recipe.Build(body: Frame, data, mg)
	local steps = data.Steps or {}
	local options = data.Options or {}
	local defs = {}
	for _, o in ipairs(options) do
		defs[o.Id] = o
	end
	local index = 1
	local chosen = {}
	local qualities = {}
	local mistakes = 0
	local phase = "pick" -- "pick" | "time" | "done"

	Common.Heading(body, ("%s %s"):format(data.Icon or "🍳", data.Dish or "Order"), 1)

	local cardRow = Common.Row(body, 50, 2)
	local cells = {}
	for i, id in ipairs(steps) do
		local d = defs[id] or { Icon = "?", Name = id }
		local cell = Kit.new("TextLabel", {
			Text = ("%s\n%s"):format(d.Icon, d.Name),
			TextSize = Theme.TextSize.Small,
			Font = Theme.FontBold,
			TextColor3 = Theme.Colors.Text,
			BackgroundColor3 = Theme.Colors.SurfaceAlt,
			Size = UDim2.fromOffset(64, 48),
			LayoutOrder = i,
			Parent = cardRow,
		})
		Kit.Corner(cell, Theme.CornerSmall)
		cells[i] = cell
	end

	local status = Common.Sub(body, "Pick step 1 from the recipe card.", 3)
	local bar = Common.TimingBar(body, { Speed = 0.9, ZoneSize = 0.22, LayoutOrder = 4 })
	bar.Instance.Visible = false

	local grid = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 5, Parent = body })
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.25, -6, 0, 52),
		CellPadding = UDim2.fromOffset(8, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = grid,
	})

	local stopButton

	local function refresh()
		for i, cell in ipairs(cells) do
			cell.BackgroundColor3 = i < index and Theme.Colors.Success or (i == index and Theme.Colors.Accent or Theme.Colors.SurfaceAlt)
		end
	end
	refresh()

	local function submit()
		phase = "done"
		local sum = 0
		for _, q in ipairs(qualities) do
			sum += q
		end
		local avg = #qualities > 0 and sum / #qualities or 0
		status.Text = "Plating up..."
		local res = mg.Send({ Steps = chosen, Quality = avg, Mistakes = mistakes })
		if not res.ok and mg.IsOpen() then
			index, chosen, qualities, phase = 1, {}, {}, "pick"
			status.Text = "Start over — pick step 1."
			grid.Visible = true
			refresh()
		end
	end

	local function stopTiming()
		if phase ~= "time" then
			return
		end
		local q = bar.Stop()
		table.insert(qualities, q)
		local text, color = Common.QualityText(q)
		Common.Feedback(body, text, color)
		index += 1
		refresh()
		bar.Instance.Visible = false
		stopButton.Visible = false
		if index > #steps then
			submit()
		else
			phase = "pick"
			grid.Visible = true
			status.Text = ("Pick step %d."):format(index)
		end
	end

	local first
	for i, o in ipairs(options) do
		local b = Kit.Button(("%s\n%s"):format(o.Icon, o.Name), "secondary", function()
			if phase ~= "pick" then
				return
			end
			if steps[index] ~= o.Id then
				mistakes += 1
				Common.Shake(grid)
				Common.Feedback(body, "Wrong step!", Theme.Colors.Danger)
				return
			end
			table.insert(chosen, o.Id)
			phase = "time"
			grid.Visible = false
			status.Text = ("%s %s — stop in the green!"):format(o.Icon, o.Name)
			bar.Instance.Visible = true
			stopButton.Visible = true
			bar.SetSpeed(0.8 + index * 0.15)
			bar.Start()
			Common.SelectFirst(stopButton)
		end, { LayoutOrder = i, TextSize = Theme.TextSize.Small, Parent = grid })
		first = first or b
	end
	Common.SelectFirst(first)

	stopButton = Kit.Button("⏹ STOP", "primary", stopTiming, { LayoutOrder = 6, Visible = false, Parent = body })
	Common.Bind(mg.Maid, "RecipeStop", function(state)
		if state == Enum.UserInputState.Begin then
			stopTiming()
		end
	end, Enum.KeyCode.Space, Enum.KeyCode.ButtonR2)
	mg.Maid:Give(function()
		bar.Destroy()
	end)
end

return Recipe
