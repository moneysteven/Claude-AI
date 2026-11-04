-- Cashier register: scan every item, then key in the correct change (keypad, number keys or gamepad).

local UserInputService = game:GetService("UserInputService")

local Common = require(script.Parent.Common)
local Kit, Theme = Common.Kit, Common.Theme

local Register = {}

local function money(cents: number): string
	return ("$%d.%02d"):format(cents // 100, cents % 100)
end

local DIGIT_KEYS = {
	[Enum.KeyCode.Zero] = 0,
	[Enum.KeyCode.One] = 1,
	[Enum.KeyCode.Two] = 2,
	[Enum.KeyCode.Three] = 3,
	[Enum.KeyCode.Four] = 4,
	[Enum.KeyCode.Five] = 5,
	[Enum.KeyCode.Six] = 6,
	[Enum.KeyCode.Seven] = 7,
	[Enum.KeyCode.Eight] = 8,
	[Enum.KeyCode.Nine] = 9,
	[Enum.KeyCode.KeypadZero] = 0,
	[Enum.KeyCode.KeypadOne] = 1,
	[Enum.KeyCode.KeypadTwo] = 2,
	[Enum.KeyCode.KeypadThree] = 3,
	[Enum.KeyCode.KeypadFour] = 4,
	[Enum.KeyCode.KeypadFive] = 5,
	[Enum.KeyCode.KeypadSix] = 6,
	[Enum.KeyCode.KeypadSeven] = 7,
	[Enum.KeyCode.KeypadEight] = 8,
	[Enum.KeyCode.KeypadNine] = 9,
}

function Register.Build(body: Frame, data, mg)
	local items = data.Items or {}
	local scanned = 0
	local running = 0
	local entry = 0
	local phase = "scan"

	Common.Heading(body, "🛒 Checkout", 1)
	local status = Common.Sub(body, "Tap each item to scan it.", 2)

	local list = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 3, Parent = body })
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.5, -5, 0, 46),
		CellPadding = UDim2.fromOffset(10, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = list,
	})
	local totalLabel = Kit.Label("Total: $0.00", { Font = Theme.FontBold, TextXAlignment = Enum.TextXAlignment.Center, LayoutOrder = 4, Parent = body })

	local payPanel = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Visible = false, LayoutOrder = 5, Parent = body })
	Kit.List(payPanel, 6)
	local paidLabel = Kit.Label("", { TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Theme.Colors.Money, Font = Theme.FontBold, LayoutOrder = 1, Parent = payPanel })
	local display = Kit.new("TextLabel", {
		Text = "Change: $0.00",
		Font = Theme.FontMono,
		TextSize = 26,
		TextColor3 = Theme.Colors.Text,
		BackgroundColor3 = Theme.Colors.Background,
		Size = UDim2.new(1, 0, 0, 48),
		LayoutOrder = 2,
		Parent = payPanel,
	})
	Kit.Corner(display, Theme.CornerSmall)
	local attempts = Kit.Label(("Attempts left: %d"):format(data.AttemptsLeft or 3), { TextColor3 = Theme.Colors.TextDim, TextXAlignment = Enum.TextXAlignment.Center, TextSize = Theme.TextSize.Small, LayoutOrder = 3, Parent = payPanel })

	local function refreshEntry()
		display.Text = "Change: " .. money(entry)
	end

	local function addDigit(d: number)
		if phase ~= "pay" then
			return
		end
		if entry < 1_000_000 then
			entry = entry * 10 + d
			refreshEntry()
		end
	end
	local function backspace()
		entry = entry // 10
		refreshEntry()
	end

	local function doSubmit()
		if phase ~= "pay" then
			return
		end
		local res = mg.Send({ Change = entry })
		if not res.ok then
			entry = 0
			refreshEntry()
			Common.Shake(display)
			if res.AttemptsLeft then
				attempts.Text = ("Attempts left: %d"):format(res.AttemptsLeft)
			end
		end
	end

	local keypad = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 4, Parent = payPanel })
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(1 / 3, -6, 0, 44),
		CellPadding = UDim2.fromOffset(8, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = keypad,
	})
	local keys = { "1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "00" }
	local firstKey
	for i, k in ipairs(keys) do
		local b = Kit.Button(k, "secondary", function()
			if k == "⌫" then
				backspace()
			elseif k == "00" then
				addDigit(0)
				addDigit(0)
			else
				addDigit(tonumber(k) :: number)
			end
		end, { LayoutOrder = i, Parent = keypad })
		firstKey = firstKey or b
	end
	Kit.Button("✅ Give Change", "success", doSubmit, { LayoutOrder = 5, Parent = payPanel })

	local function startPay()
		phase = "pay"
		status.Text = "Count the change for the customer."
		paidLabel.Text = ("Customer paid %s"):format(money(data.Paid or 0))
		payPanel.Visible = true
		Common.SelectFirst(firstKey)
	end

	local firstItem
	for i, it in ipairs(items) do
		local b
		b = Kit.Button(("%s %s  %s"):format(it.Icon or "", it.Name, money(it.Price)), "secondary", function()
			if b:GetAttribute("Scanned") then
				return
			end
			b:SetAttribute("Scanned", true)
			b.BackgroundColor3 = Theme.Colors.Success
			b.Text = ("✓ %s  %s"):format(it.Name, money(it.Price))
			scanned += 1
			running += it.Price
			totalLabel.Text = "Total: " .. money(running)
			if scanned >= #items then
				totalLabel.Text = "Total: " .. money(data.Total or running)
				startPay()
			end
		end, { LayoutOrder = i, TextSize = Theme.TextSize.Small + 1, Parent = list })
		firstItem = firstItem or b
	end
	Common.SelectFirst(firstItem)

	-- PC number keys
	mg.Maid:Give(UserInputService.InputBegan:Connect(function(input, processed)
		if processed or phase ~= "pay" then
			return
		end
		local d = DIGIT_KEYS[input.KeyCode]
		if d then
			addDigit(d)
		elseif input.KeyCode == Enum.KeyCode.Backspace then
			backspace()
		elseif input.KeyCode == Enum.KeyCode.Return or input.KeyCode == Enum.KeyCode.KeypadEnter then
			doSubmit()
		end
	end))
end

return Register
