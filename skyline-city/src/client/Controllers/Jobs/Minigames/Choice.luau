-- Generic dialogue / multiple-choice minigame (police tickets, car sales pitches).

local Common = require(script.Parent.Common)
local Kit, Theme = Common.Kit, Common.Theme

local Choice = {}

function Choice.Build(body: Frame, data, mg)
	Common.Heading(body, data.Title or "Choose", 1)
	if data.Round and data.Rounds then
		local dots = {}
		for i = 1, data.Rounds do
			dots[i] = i < data.Round and "●" or (i == data.Round and "◉" or "○")
		end
		Common.Sub(body, table.concat(dots, "  "), 2)
	end
	local card = Kit.Card({ LayoutOrder = 3, Parent = body })
	Kit.Label(data.Prompt or "", { TextSize = Theme.TextSize.Body + 1, Font = Theme.FontBold, Parent = card })
	if data.Price then
		Common.Sub(body, ("Sticker price: $%s"):format(tostring(data.Price)), 4)
	end
	if data.Question then
		Kit.Label(data.Question, { TextColor3 = Theme.Colors.TextDim, LayoutOrder = 5, Parent = body })
	end

	local busy = false
	local buttons = {}
	for i, text in ipairs(data.Options or {}) do
		local b = Kit.Button(("%d.  %s"):format(i, text), "secondary", function()
			if busy then
				return
			end
			busy = true
			for _, other in ipairs(buttons) do
				other.AutoButtonColor = false
				other.BackgroundTransparency = 0.4
			end
			mg.Send({ Choice = i })
			busy = false
			for _, other in ipairs(buttons) do
				if other.Parent then
					other.AutoButtonColor = true
					other.BackgroundTransparency = 0
				end
			end
		end, {
			LayoutOrder = 10 + i,
			Size = UDim2.new(1, 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			TextXAlignment = Enum.TextXAlignment.Left,
			Parent = body,
		})
		Kit.Padding(b, 12)
		buttons[i] = b
	end
	Common.SelectFirst(buttons[1])

	-- number keys 1..n on PC
	local keys = { Enum.KeyCode.One, Enum.KeyCode.Two, Enum.KeyCode.Three, Enum.KeyCode.Four, Enum.KeyCode.Five }
	for i = 1, math.min(#buttons, #keys) do
		Common.Bind(mg.Maid, "Choice" .. i, function(state)
			if state == Enum.UserInputState.Begin and not busy and buttons[i].Parent then
				busy = true
				mg.Send({ Choice = i })
				busy = false
			end
		end, keys[i])
	end
end

return Choice
