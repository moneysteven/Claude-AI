-- Police cuff QTE: press the arrow sequence before the suspect breaks free.
-- Keys: WASD / arrow keys / D-pad / on-screen arrows.

local Common = require(script.Parent.Common)
local Kit, Theme = Common.Kit, Common.Theme

local Cuff = {}

local ICON = { Up = "⬆️", Down = "⬇️", Left = "⬅️", Right = "➡️" }

function Cuff.Build(body: Frame, data, mg)
	local seq = data.Sequence or {}
	local window = data.Window or 8
	local index = 1
	local done = false
	local started = os.clock()

	Common.Heading(body, "🔗 Cuff the suspect!", 1)
	Common.Sub(body, "Match the arrows quickly — one mistake resets the hold.", 2)

	local seqRow = Common.Row(body, 64, 3)
	local cells = {}
	for i, dir in ipairs(seq) do
		local cell = Kit.new("TextLabel", {
			Text = ICON[dir] or "?",
			TextSize = 30,
			Font = Theme.FontBold,
			TextColor3 = Theme.Colors.Text,
			BackgroundColor3 = Theme.Colors.SurfaceAlt,
			Size = UDim2.fromOffset(56, 56),
			LayoutOrder = i,
			Parent = seqRow,
		})
		Kit.Corner(cell, Theme.CornerSmall)
		cells[i] = cell
	end

	local timer = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 10), BackgroundColor3 = Theme.Colors.Background, LayoutOrder = 4, Parent = body })
	Kit.Corner(timer, UDim.new(1, 0))
	local fill = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Theme.Colors.Warning, Parent = timer })
	Kit.Corner(fill, UDim.new(1, 0))
	Kit.Tween(fill, { Size = UDim2.fromScale(0, 1) }, TweenInfo.new(window, Enum.EasingStyle.Linear))

	local function refresh()
		for i, cell in ipairs(cells) do
			if i < index then
				cell.BackgroundColor3 = Theme.Colors.Success
			elseif i == index then
				cell.BackgroundColor3 = Theme.Colors.Accent
			else
				cell.BackgroundColor3 = Theme.Colors.SurfaceAlt
			end
		end
	end
	refresh()

	local function finish(sequence)
		if done then
			return
		end
		done = true
		task.spawn(function()
			local res = mg.Send({ Sequence = sequence })
			if not res.ok and mg.IsOpen() then
				-- retry allowed: reset
				done = false
				index = 1
				started = os.clock()
				fill.Size = UDim2.fromScale(1, 1)
				Kit.Tween(fill, { Size = UDim2.fromScale(0, 1) }, TweenInfo.new(window, Enum.EasingStyle.Linear))
				refresh()
			end
		end)
	end

	local function press(dir: string)
		if done then
			return
		end
		if seq[index] == dir then
			index += 1
			refresh()
			if index > #seq then
				Common.Feedback(body, "CUFFED!", Theme.Colors.Success)
				finish(table.clone(seq))
			end
		else
			index = 1
			refresh()
			Common.Shake(seqRow)
			Common.Feedback(body, "Struggle!", Theme.Colors.Danger)
		end
	end

	local pad = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 120), BackgroundTransparency = 1, LayoutOrder = 6, Parent = body })
	local function arrow(dir: string, pos: UDim2)
		local b = Kit.Button(ICON[dir], "secondary", function()
			press(dir)
		end, { Size = UDim2.fromOffset(56, 56), Position = pos, AnchorPoint = Vector2.new(0.5, 0.5), TextSize = 26, Parent = pad })
		return b
	end
	local up = arrow("Up", UDim2.new(0.5, 0, 0, 28))
	arrow("Left", UDim2.new(0.5, -62, 0, 90))
	arrow("Down", UDim2.new(0.5, 0, 0, 90))
	arrow("Right", UDim2.new(0.5, 62, 0, 90))
	Common.SelectFirst(up)

	local function bind(dir: string, ...)
		Common.Bind(mg.Maid, "Cuff" .. dir, function(state)
			if state == Enum.UserInputState.Begin then
				press(dir)
			end
		end, ...)
	end
	bind("Up", Enum.KeyCode.W, Enum.KeyCode.Up, Enum.KeyCode.DPadUp)
	bind("Down", Enum.KeyCode.S, Enum.KeyCode.Down, Enum.KeyCode.DPadDown)
	bind("Left", Enum.KeyCode.A, Enum.KeyCode.Left, Enum.KeyCode.DPadLeft)
	bind("Right", Enum.KeyCode.D, Enum.KeyCode.Right, Enum.KeyCode.DPadRight)

	-- local timeout -> tell the server (it decides)
	mg.Maid:Give(task.spawn(function()
		while mg.IsOpen() do
			task.wait(0.2)
			if not done and os.clock() - started > window then
				finish({})
			end
		end
	end))
end

return Cuff
