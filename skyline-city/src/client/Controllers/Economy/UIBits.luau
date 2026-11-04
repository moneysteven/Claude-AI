-- UIBits (client helper for the economy controllers): reusable widgets built on Kit.
--
--   UIBits.ParseAmount("1.5k") -> 1500?            accepts 1000 / 1,000 / $1000 / 5k / 2.5m / 1b
--   UIBits.AmountPicker(parent, quick, getMax, maid, layoutOrder?) -> { Get(), Set(n), Box }
--   UIBits.Tabs(parent, names, onSelect, maid, layoutOrder?) -> { Select(name), Current() }   (L1/R1 on gamepad)
--   UIBits.Slider(initial, onChange, maid, props?) -> { Instance, Set(v), Get() }  (drag / tap / DPad on gamepad)
--   UIBits.ReasonText(reason) -> "💼 Pizza job"
--   UIBits.TimeAgo(unixTime) -> "3m ago"
--   UIBits.Section(parent, text, order) -> TextLabel

local ContextActionService = game:GetService("ContextActionService")
local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Format = require(ReplicatedStorage:WaitForChild("Shared").Util.Format)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local UIBits = {}

local actionCounter = 0
local function uniqueAction(prefix: string): string
	actionCounter += 1
	return ("%s_%d"):format(prefix, actionCounter)
end

---------------------------------------------------------------------------
-- Amount parsing
---------------------------------------------------------------------------
local SUFFIX = { k = 1e3, m = 1e6, b = 1e9, t = 1e12 }

function UIBits.ParseAmount(text: string?): number?
	if type(text) ~= "string" then
		return nil
	end
	local s = string.lower(text):gsub("[%s,%$]", "")
	local numPart, suffix = s:match("^(%d+%.?%d*)([kmbt]?)$")
	if not numPart then
		return nil
	end
	local n = tonumber(numPart)
	if not n then
		return nil
	end
	if suffix ~= "" then
		n *= SUFFIX[suffix]
	end
	n = math.floor(n)
	if n <= 0 or n ~= n or n == math.huge then
		return nil
	end
	return n
end

function UIBits.Section(parent: Instance, text: string, order: number?)
	return Kit.Label(text, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		LayoutOrder = order or 0,
		Parent = parent,
	})
end

---------------------------------------------------------------------------
-- Amount picker: quick buttons + custom box
---------------------------------------------------------------------------
function UIBits.AmountPicker(parent: Instance, quick: { number }, getMax: () -> number, maid: any, layoutOrder: number?)
	local holder = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = layoutOrder or 0,
		Parent = parent,
	})
	Kit.List(holder, 8)

	local row = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundTransparency = 1,
		LayoutOrder = 1,
		Parent = holder,
	})
	local count = #quick + 1
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(1 / count, -6, 1, 0),
		CellPadding = UDim2.fromOffset(6, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = row,
	})

	local box = Kit.TextBox("Custom amount (e.g. 2500 or 5k)", {
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, 44),
		Parent = holder,
	})
	local hint = Kit.Label("", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		LayoutOrder = 3,
		Parent = holder,
	})

	local api = {}
	api.Box = box

	local function refreshHint()
		local n = UIBits.ParseAmount(box.Text)
		if box.Text == "" then
			hint.Text = ("Available: %s"):format(Format.Money(getMax()))
			hint.TextColor3 = Theme.Colors.TextDim
		elseif not n then
			hint.Text = "Enter a whole number like 2500, 5k or 1.2m"
			hint.TextColor3 = Theme.Colors.Danger
		elseif n > getMax() then
			hint.Text = ("%s — more than you have (%s)"):format(Format.Money(n), Format.Money(getMax()))
			hint.TextColor3 = Theme.Colors.Warning
		else
			hint.Text = Format.Money(n)
			hint.TextColor3 = Theme.Colors.Money
		end
	end

	function api.Set(n: number)
		box.Text = tostring(math.max(0, math.floor(n)))
		refreshHint()
	end

	function api.Get(): number?
		return UIBits.ParseAmount(box.Text)
	end

	function api.Refresh()
		refreshHint()
	end

	for i, amount in ipairs(quick) do
		Kit.Button(Format.MoneyShort(amount), "secondary", function()
			api.Set(amount)
		end, { LayoutOrder = i, TextSize = Theme.TextSize.Small, Parent = row })
	end
	Kit.Button("All", "secondary", function()
		api.Set(getMax())
	end, { LayoutOrder = count, TextSize = Theme.TextSize.Small, Parent = row })

	maid:Give(box:GetPropertyChangedSignal("Text"):Connect(refreshHint))
	refreshHint()
	return api
end

---------------------------------------------------------------------------
-- Tabs (+ L1/R1 on gamepad)
---------------------------------------------------------------------------
function UIBits.Tabs(parent: Instance, names: { string }, onSelect: (string) -> (), maid: any, layoutOrder: number?)
	local row = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundColor3 = Theme.Colors.SurfaceAlt,
		LayoutOrder = layoutOrder or 0,
		Parent = parent,
	})
	Kit.Corner(row, Theme.CornerSmall)
	Kit.new("UIPadding", {
		PaddingLeft = UDim.new(0, 4),
		PaddingRight = UDim.new(0, 4),
		PaddingTop = UDim.new(0, 4),
		PaddingBottom = UDim.new(0, 4),
		Parent = row,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(1 / #names, -4, 1, 0),
		CellPadding = UDim2.fromOffset(4, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = row,
	})
	local buttons: { [string]: TextButton } = {}
	local current: string? = nil
	local api = {}

	function api.Select(name: string)
		if current == name or not buttons[name] then
			return
		end
		current = name
		for n, b in pairs(buttons) do
			local on = n == name
			Kit.Tween(b, {
				BackgroundColor3 = on and Theme.Colors.Accent or Theme.Colors.SurfaceAlt,
				TextColor3 = on and Theme.Colors.Text or Theme.Colors.TextDim,
			}, Theme.Tween.Fast)
		end
		task.spawn(onSelect, name)
	end

	function api.Current(): string?
		return current
	end

	for i, name in ipairs(names) do
		local b = Kit.new("TextButton", {
			Text = name,
			Font = Theme.FontBold,
			TextSize = Theme.TextSize.Small,
			TextColor3 = Theme.Colors.TextDim,
			BackgroundColor3 = Theme.Colors.SurfaceAlt,
			AutoButtonColor = true,
			LayoutOrder = i,
			Parent = row,
		})
		Kit.Corner(b, UDim.new(0, 6))
		b.Activated:Connect(function()
			api.Select(name)
		end)
		buttons[name] = b
	end

	local action = uniqueAction("SkylineTabs")
	ContextActionService:BindAction(action, function(_, state, input)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		local idx = table.find(names, current or names[1]) or 1
		if input.KeyCode == Enum.KeyCode.ButtonL1 then
			idx = idx - 1
			if idx < 1 then
				idx = #names
			end
		else
			idx = idx + 1
			if idx > #names then
				idx = 1
			end
		end
		api.Select(names[idx])
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.ButtonL1, Enum.KeyCode.ButtonR1)
	maid:Give(function()
		ContextActionService:UnbindAction(action)
	end)

	api.Instance = row
	return api
end

---------------------------------------------------------------------------
-- Slider (no global connections while idle; DPad left/right when selected)
---------------------------------------------------------------------------
function UIBits.Slider(initial: number, onChange: (number) -> (), maid: any, props: { [string]: any }?)
	local value = math.clamp(initial, 0, 1)
	local base = {
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundTransparency = 1,
		Text = "",
		AutoButtonColor = false,
		Selectable = true,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	local hit = Kit.new("TextButton", base)
	local bar = Kit.new("Frame", {
		Size = UDim2.new(1, -24, 0, 8),
		Position = UDim2.new(0, 12, 0.5, -4),
		BackgroundColor3 = Theme.Colors.Stroke,
		Parent = hit,
	})
	Kit.Corner(bar, UDim.new(1, 0))
	local fill = Kit.new("Frame", { Size = UDim2.fromScale(value, 1), BackgroundColor3 = Theme.Colors.Accent, Parent = bar })
	Kit.Corner(fill, UDim.new(1, 0))
	local knob = Kit.new("Frame", {
		Size = UDim2.fromOffset(24, 24),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(value, 0, 0.5, 0),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = bar,
	})
	Kit.Corner(knob, UDim.new(1, 0))
	local knobStroke = Kit.Stroke(knob, Theme.Colors.Accent, 2, 1)

	local api = { Instance = hit }

	local function render()
		fill.Size = UDim2.fromScale(value, 1)
		knob.Position = UDim2.new(value, 0, 0.5, 0)
	end

	function api.Set(v: number, silent: boolean?)
		value = math.clamp(v, 0, 1)
		render()
		if not silent then
			task.spawn(onChange, value)
		end
	end

	function api.Get(): number
		return value
	end

	local function setFromX(x: number)
		local rel = (x - bar.AbsolutePosition.X) / math.max(1, bar.AbsoluteSize.X)
		api.Set(math.floor(math.clamp(rel, 0, 1) * 100 + 0.5) / 100)
	end

	local dragMaid: { RBXScriptConnection } = {}
	local function stopDrag()
		for _, c in ipairs(dragMaid) do
			c:Disconnect()
		end
		table.clear(dragMaid)
	end
	maid:Give(stopDrag)

	hit.InputBegan:Connect(function(input)
		local t = input.UserInputType
		if t ~= Enum.UserInputType.MouseButton1 and t ~= Enum.UserInputType.Touch then
			return
		end
		stopDrag()
		setFromX(input.Position.X)
		table.insert(dragMaid, UserInputService.InputChanged:Connect(function(move)
			if move.UserInputType == Enum.UserInputType.MouseMovement or move.UserInputType == Enum.UserInputType.Touch then
				setFromX(move.Position.X)
			end
		end))
		table.insert(dragMaid, UserInputService.InputEnded:Connect(function(ended)
			if ended.UserInputType == Enum.UserInputType.MouseButton1 or ended.UserInputType == Enum.UserInputType.Touch then
				stopDrag()
			end
		end))
	end)

	-- gamepad: while selected, DPad / left stick nudges the value instead of moving selection
	local action = uniqueAction("SkylineSlider")
	local bound = false
	local function unbind()
		if bound then
			bound = false
			ContextActionService:UnbindAction(action)
		end
	end
	hit.SelectionGained:Connect(function()
		knobStroke.Transparency = 0
		if bound then
			return
		end
		bound = true
		ContextActionService:BindActionAtPriority(action, function(_, state, input)
			if state ~= Enum.UserInputState.Begin then
				return Enum.ContextActionResult.Sink
			end
			local step = (input.KeyCode == Enum.KeyCode.DPadLeft) and -0.05 or 0.05
			api.Set(math.floor((value + step) * 100 + 0.5) / 100)
			return Enum.ContextActionResult.Sink
		end, false, Enum.ContextActionPriority.High.Value, Enum.KeyCode.DPadLeft, Enum.KeyCode.DPadRight)
	end)
	hit.SelectionLost:Connect(function()
		knobStroke.Transparency = 1
		unbind()
	end)
	maid:Give(unbind)

	return api
end

---------------------------------------------------------------------------
-- Text helpers
---------------------------------------------------------------------------
local REASON_PREFIX = {
	{ "Job:", "💼", "job pay" },
	{ "Wage:", "💼", "wage" },
	{ "Business:", "🏪", "business income" },
	{ "Buy:", "🛒", "purchase" },
	{ "Robux:", "💎", "Robux purchase" },
	{ "Rent", "🏠", "rent" },
	{ "Fuel", "⛽", "fuel" },
	{ "Repair", "🔧", "repair" },
	{ "Tuning", "🎨", "tuning" },
	{ "Finance", "🚗", "car finance" },
}

local EXACT = {
	["Reward:Daily"] = "🎁 Daily reward",
	["Reward:Tutorial"] = "🎓 Tutorial reward",
	Deposit = "🏦 Deposit to bank",
	Withdraw = "🏧 Cash withdrawal",
	["To Savings"] = "🐷 Moved to savings",
	["From Savings"] = "🐷 Moved from savings",
	["Savings interest"] = "📈 Savings interest",
	Transfer = "🤝 Transfer",
}

function UIBits.ReasonText(reason: string?): string
	local r = tostring(reason or "?")
	if EXACT[r] then
		return EXACT[r]
	end
	if r:sub(1, 17) == "Reward:WealthTier" then
		return "🏆 Wealth tier bonus"
	end
	if r:sub(1, 8) == "Sent to " then
		return "📤 " .. r
	end
	if r:sub(1, 5) == "From " then
		return "📥 " .. r
	end
	for _, entry in ipairs(REASON_PREFIX) do
		local prefix = entry[1]
		if r:sub(1, #prefix) == prefix then
			local rest = r:sub(#prefix + 1):gsub("^:", ""):gsub(":", " · ")
			if rest ~= "" then
				return ("%s %s %s"):format(entry[2], rest, entry[3])
			end
			return entry[2] .. " " .. entry[3]:sub(1, 1):upper() .. entry[3]:sub(2)
		end
	end
	return "💲 " .. r:gsub(":", " · ")
end

function UIBits.TimeAgo(t: number?): string
	if type(t) ~= "number" then
		return ""
	end
	local d = math.max(0, os.time() - t)
	if d < 60 then
		return "just now"
	elseif d < 3600 then
		return ("%dm ago"):format(d // 60)
	elseif d < 86400 then
		return ("%dh ago"):format(d // 3600)
	end
	return ("%dd ago"):format(d // 86400)
end

return UIBits
