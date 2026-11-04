-- TuningPanel: the "Tuning" side sheet (custom panel so the car stays visible).
--   * categories: Paint, Wheels, Body, Glass & Lights, Plate, Performance
--   * every choice goes into a cart and is previewed LOCALLY on the car (LookPreview), with an orbit camera
--   * Confirm → Net.Invoke("Tuning", "Apply") (server re-prices everything); Close / Revert restores the car
-- Gamepad: L1 / R1 switch category, ButtonY confirms, ButtonB closes. PC: [ / ] switch category, Enter confirms.

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Tuning = require(Shared.Config.Tuning)

local Client = script:FindFirstAncestor("Client") :: Instance
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))
local ClientData = require(Client:WaitForChild("ClientData"))

local DealerUI = require(script.Parent:WaitForChild("DealerUI"))
local ColorPicker = require(script.Parent:WaitForChild("ColorPicker"))
local LookPreview = require(script.Parent:WaitForChild("LookPreview"))
local OrbitCamera = require(script.Parent:WaitForChild("OrbitCamera"))

local TuningPanel = {}

local player = Players.LocalPlayer

local CATEGORIES = {
	{ Id = "Paint", Text = "🎨 Paint" },
	{ Id = "Wheels", Text = "🛞 Wheels" },
	{ Id = "Body", Text = "🏁 Body" },
	{ Id = "Lights", Text = "💡 Glass & Lights" },
	{ Id = "Plate", Text = "🔤 Plate" },
	{ Id = "Performance", Text = "⚙️ Performance" },
}

local ACTION_PREV = "SkylineTuningPrev"
local ACTION_NEXT = "SkylineTuningNext"
local ACTION_CONFIRM = "SkylineTuningConfirm"
local ACTION_CLOSE = "SkylineTuningClose"

-- Find the local player's spawned car model by uid (seat first, then nearby search).
function TuningPanel.FindCarModel(uid: string): Model?
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	if seat then
		local m = seat:FindFirstAncestorWhichIsA("Model")
		while m do
			if m:GetAttribute("CarUid") == uid then
				return m
			end
			m = m.Parent and m.Parent:FindFirstAncestorWhichIsA("Model")
		end
	end
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		local params = OverlapParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { char }
		for _, part in ipairs(Workspace:GetPartBoundsInRadius(root.Position, 60, params)) do
			local m = part:FindFirstAncestorWhichIsA("Model")
			while m do
				if m:GetAttribute("CarUid") == uid and m:GetAttribute("OwnerUserId") == player.UserId then
					return m
				end
				m = m.Parent and m.Parent:FindFirstAncestorWhichIsA("Model")
			end
		end
	end
	return nil
end

local function same(a: any, b: any): boolean
	if type(a) == "table" and type(b) == "table" then
		return a[1] == b[1] and a[2] == b[2] and a[3] == b[3]
	end
	return a == b
end

function TuningPanel.Build(root: Frame, data: any, ctx)
	local maid = ctx.Maid
	local uid = type(data) == "table" and type(data.Uid) == "string" and data.Uid or nil

	-- layout: right side sheet on wide screens, bottom sheet on narrow ones -----------
	local sheet = Kit.new("Frame", {
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.04,
		Parent = root,
	})
	Kit.Corner(sheet)
	Kit.Stroke(sheet)
	local function layout()
		local cam = Workspace.CurrentCamera
		local vp = cam and cam.ViewportSize or Vector2.new(1280, 720)
		if vp.X >= vp.Y * 1.25 and vp.X >= 700 then
			sheet.AnchorPoint = Vector2.new(1, 0.5)
			sheet.Position = UDim2.new(1, -12, 0.5, 0)
			sheet.Size = UDim2.new(0, 420, 1, -24)
		else
			sheet.AnchorPoint = Vector2.new(0.5, 1)
			sheet.Position = UDim2.new(0.5, 0, 1, -8)
			sheet.Size = UDim2.new(1, -16, 0.56, 0)
		end
	end
	layout()
	if Workspace.CurrentCamera then
		maid:Give(Workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(layout))
	end
	local scale = Kit.new("UIScale", { Scale = 0.9, Parent = sheet })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)

	local header = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 52), BackgroundTransparency = 1, Parent = sheet })
	local title = Kit.Label("🔧 Skyline Customs", {
		Position = UDim2.fromOffset(16, 0),
		Size = UDim2.new(1, -80, 1, 0),
		AutomaticSize = Enum.AutomaticSize.None,
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		TextYAlignment = Enum.TextYAlignment.Center,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = header,
	})
	local closeBtn = Kit.IconButton("✕", function()
		ctx.Close()
	end, { Size = UDim2.fromOffset(40, 40), Position = UDim2.new(1, -52, 0.5, -20), TextSize = 18, Parent = header })

	local body = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 52),
		Size = UDim2.new(1, 0, 1, -52),
		BackgroundTransparency = 1,
		Parent = sheet,
	})
	Kit.new("UIPadding", {
		PaddingLeft = UDim.new(0, 14),
		PaddingRight = UDim.new(0, 14),
		PaddingBottom = UDim.new(0, 14),
		Parent = body,
	})
	local status = Kit.Label("Checking your car…", { TextColor3 = Theme.Colors.TextDim, Parent = body })

	-- state -----------------------------------------------------------------
	local options: any = nil
	local cart: { [string]: any } = {}
	local category = "Paint"
	local model: Model? = nil
	local preview: any = nil
	local pickers: { any } = {}
	local applying = false

	local function cur(field: string): any
		return options and options.Current and options.Current[field]
	end

	local function refreshPreview()
		if not preview then
			return
		end
		local look = {}
		if cart.Paint then
			if cart.Paint.Exclusive then
				local row = Tuning.ExclusiveById[cart.Paint.Exclusive]
				if row then
					look.Paint = { Color = row.Color, Finish = row.Finish }
				end
			else
				look.Paint = cart.Paint
			end
		end
		look.RimColor = cart.RimColor
		look.Tint = cart.Tint
		look.Underglow = cart.Underglow
		look.Spoiler = cart.Spoiler
		look.BodyKit = cart.BodyKit
		look.Plate = cart.Plate
		preview.Apply(look)
	end

	-- cart pricing (display only; server re-prices) ------------------------------
	local function cartLines(): ({ { any } }, number)
		local lines = {}
		local total = 0
		if not options then
			return lines, 0
		end
		local P = options.Prices
		local function add(label, price)
			table.insert(lines, { label, price })
			total += price
		end
		local curPaint = cur("Paint") or {}
		if cart.Paint then
			if cart.Paint.Exclusive then
				if curPaint.Exclusive ~= cart.Paint.Exclusive then
					local row = Tuning.ExclusiveById[cart.Paint.Exclusive]
					add("Paint: " .. (row and row.Name or "?"), P.Exclusive[cart.Paint.Exclusive] or 0)
				end
			else
				local colorChanged = not same(cart.Paint.Color, curPaint.Color) or curPaint.Exclusive ~= nil
				local finishChanged = cart.Paint.Finish ~= curPaint.Finish or curPaint.Exclusive ~= nil
				if colorChanged or finishChanged then
					local price = P.Paint + (finishChanged and (P.Finish[cart.Paint.Finish] or 0) or 0)
					add(("Paint (%s)"):format(cart.Paint.Finish), price)
				end
			end
		end
		if cart.Rims and cart.Rims ~= (cur("Rims") or "Stock") then
			local row = Tuning.RimsById[cart.Rims]
			add("Rims: " .. (row and row.Name or cart.Rims), P.Rims[cart.Rims] or 0)
		end
		if cart.RimColor and not same(cart.RimColor, cur("RimColor") or Tuning.DefaultRimColor) then
			add("Rim colour", P.RimColor)
		end
		if cart.Tint ~= nil and math.abs(cart.Tint - (cur("Tint") or 0)) > 0.001 then
			for i, row in ipairs(Tuning.Tint) do
				if math.abs(row.Level - cart.Tint) < 0.001 then
					add("Tint: " .. row.Name, P.Tint[i] or 0)
				end
			end
		end
		if cart.BodyKit and cart.BodyKit ~= (cur("BodyKit") or "Stock") then
			local row = Tuning.BodyKitsById[cart.BodyKit]
			add("Body kit: " .. (row and row.Name or cart.BodyKit), P.BodyKits[cart.BodyKit] or 0)
		end
		if cart.Spoiler and cart.Spoiler ~= (cur("Spoiler") or "None") then
			local row = Tuning.SpoilersById[cart.Spoiler]
			add("Spoiler: " .. (row and row.Name or cart.Spoiler), P.Spoilers[cart.Spoiler] or 0)
		end
		if cart.Underglow ~= nil then
			if cart.Underglow == false then
				if cur("Underglow") then
					add("Remove underglow", 0)
				end
			elseif not same(cart.Underglow, cur("Underglow")) then
				add("Underglow", P.Underglow)
			end
		end
		if cart.Plate and cart.Plate ~= cur("Plate") then
			add("Plate: " .. cart.Plate, P.Plate)
		end
		if cart.Upgrades then
			local have = cur("Upgrades") or {}
			for _, catId in ipairs(Tuning.UpgradeOrder) do
				local target = cart.Upgrades[catId]
				local h = have[catId] or 0
				if target and target > h then
					local cost = 0
					for l = h + 1, target do
						cost += (P.Upgrades[catId] and P.Upgrades[catId][l]) or 0
					end
					add(("%s Stage %d"):format(Tuning.UpgradeInfo[catId].Name, target), cost)
				end
			end
		end
		return lines, total
	end

	-- containers created once options load
	local catRow: any = nil
	local scroll: ScrollingFrame? = nil
	local footer: Frame? = nil
	local totalLabel: TextLabel? = nil
	local cartLabel: TextLabel? = nil
	local confirmBtn: TextButton? = nil

	local function refreshFooter()
		if not totalLabel or not cartLabel or not confirmBtn then
			return
		end
		local lines, total = cartLines()
		local parts = {}
		for _, l in ipairs(lines) do
			table.insert(parts, ("%s  <font color=\"#58D678\">%s</font>"):format(l[1], Format.Money(l[2])))
		end
		cartLabel.Text = #parts > 0 and table.concat(parts, "\n") or "<i>Pick something to see it on your car.</i>"
		local cash = ClientData.Get("Cash") or 0
		totalLabel.Text = ("Total <b>%s</b>   ·   💵 %s"):format(Format.Money(total), Format.MoneyShort(cash))
		totalLabel.TextColor3 = total > cash and Theme.Colors.Danger or Theme.Colors.Text
		confirmBtn.Text = #lines == 0 and "Nothing to apply" or ("Confirm  " .. Format.Money(total))
		confirmBtn.AutoButtonColor = #lines > 0
		confirmBtn.BackgroundColor3 = #lines == 0 and Theme.Colors.SurfaceAlt or Theme.Colors.Success
	end

	local function changed()
		refreshPreview()
		refreshFooter()
	end

	local showCategory: (string) -> ()

	local function clearScroll()
		for _, p in ipairs(pickers) do
			p.Destroy()
		end
		table.clear(pickers)
		if scroll then
			for _, c in ipairs(scroll:GetChildren()) do
				if c:IsA("GuiObject") then
					c:Destroy()
				end
			end
			scroll.CanvasPosition = Vector2.zero
		end
	end

	local function colorPickerToggle(parent: Instance, order: number, label: string, initial: Color3, onColor: (Color3) -> ())
		local pickerOrder = order + 1
		local picker: any = nil
		local btn
		btn = Kit.Button("🎨 " .. label, "ghost", function()
			if picker then
				picker.Destroy()
				local i = table.find(pickers, picker)
				if i then
					table.remove(pickers, i)
				end
				picker = nil
				btn.Text = "🎨 " .. label
				return
			end
			btn.Text = "Hide picker"
			picker = ColorPicker.new(parent, initial, function(c)
				initial = c
				onColor(c)
			end, pickerOrder)
			table.insert(pickers, picker)
		end, { LayoutOrder = order, Parent = parent })
		return btn
	end

	local function optionChips(parent: Instance, order: number, rows: { any }, getPrice: (any) -> number, selected: any, onPick: (any) -> (), allowed: ((any) -> boolean)?)
		local items = {}
		for _, row in ipairs(rows) do
			local ok = not allowed or allowed(row)
			local price = getPrice(row)
			local text = row.Name .. (price > 0 and ("  " .. Format.MoneyShort(price)) or "")
			if not ok then
				text = "🔒 " .. row.Name
			end
			table.insert(items, { Id = row.Id, Text = text, Locked = not ok })
		end
		local lockedIds = {}
		for _, it in ipairs(items) do
			if it.Locked then
				lockedIds[it.Id] = true
			end
		end
		local api
		api = DealerUI.ChipRow(items, selected, function(id)
			if lockedIds[id] then
				Router.Notify("That option doesn't fit this car.", "warning")
				api.Set(selected, true)
				return
			end
			selected = id
			onPick(id)
		end, { LayoutOrder = order, Parent = parent })
		return api
	end

	-- category pages ---------------------------------------------------------------
	local pages = {}

	pages.Paint = function(s: ScrollingFrame)
		local P = options.Prices
		local curPaint = cart.Paint or cur("Paint") or { Color = { 200, 200, 205 }, Finish = "Gloss" }
		local colorNow = DealerUI.Color(curPaint.Color)
		local finishNow = curPaint.Finish or "Gloss"
		if cart.Paint and cart.Paint.Exclusive then
			local row = Tuning.ExclusiveById[cart.Paint.Exclusive]
			if row then
				colorNow = DealerUI.Color(row.Color)
				finishNow = row.Finish
			end
		end
		local function setPaint(c: Color3?, finish: string?)
			colorNow = c or colorNow
			finishNow = finish or finishNow
			cart.Paint = { Color = DealerUI.ToTable(colorNow), Finish = finishNow }
			changed()
		end
		DealerUI.Section(("Respray %s + finish"):format(Format.MoneyShort(P.Paint)), 1, s)
		local finishRows = {}
		for _, id in ipairs(Tuning.FinishOrder) do
			local row = Tuning.Finishes[id]
			table.insert(finishRows, { Id = id, Name = row.Name })
		end
		optionChips(s, 2, finishRows, function(row)
			return P.Finish[row.Id] or 0
		end, finishNow, function(id)
			setPaint(nil, id)
		end)
		DealerUI.Section("Colours", 3, s)
		DealerUI.Swatches(Tuning.Colors, function(c)
			setPaint(c, nil)
		end, 4, s)
		colorPickerToggle(s, 5, "Custom colour…", colorNow, function(c)
			setPaint(c, nil)
		end)

		DealerUI.Section("✨ Exclusive paints", 10, s)
		local passes = options.Passes or {}
		for i, row in ipairs(Tuning.ExclusivePaints) do
			local unlocked = passes[row.Pass] == true
			local tag = row.Pass == "VIP" and "👑 VIP" or "💎 Premium Car Park"
			local b = Kit.Button("", "secondary", function()
				if not unlocked then
					Router.Notify(("%s needs the %s pass."):format(row.Name, tag), "warning")
					return
				end
				cart.Paint = { Exclusive = row.Id }
				changed()
			end, { LayoutOrder = 10 + i, Parent = s })
			b.Text = ("%s %s  ·  %s  %s"):format(unlocked and "" or "🔒", row.Name, tag, Format.MoneyShort(P.Exclusive[row.Id] or 0))
			b.TextXAlignment = Enum.TextXAlignment.Left
			Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 54), Parent = b })
			local dot = Kit.new("Frame", {
				Size = UDim2.fromOffset(30, 30),
				Position = UDim2.new(0, -42, 0.5, -15),
				BackgroundColor3 = DealerUI.Color(row.Color),
				Parent = b,
			})
			Kit.Corner(dot, UDim.new(1, 0))
			Kit.Stroke(dot, Color3.new(1, 1, 1), 2, 0.4)
		end
	end

	pages.Wheels = function(s: ScrollingFrame)
		local P = options.Prices
		DealerUI.Section("Rim style", 1, s)
		local grid = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 2, Parent = s })
		Kit.new("UIGridLayout", { CellSize = UDim2.new(0.5, -4, 0, 48), CellPadding = UDim2.fromOffset(8, 8), SortOrder = Enum.SortOrder.LayoutOrder, Parent = grid })
		local selected = cart.Rims or cur("Rims") or "Stock"
		local buttons = {}
		local function paintButtons()
			for id, b in pairs(buttons) do
				b.BackgroundColor3 = id == selected and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
			end
		end
		for i, row in ipairs(Tuning.Rims) do
			local price = P.Rims[row.Id] or 0
			local b = Kit.Button(("%s\n%s"):format(row.Name, price > 0 and Format.MoneyShort(price) or "Free"), "secondary", function()
				selected = row.Id
				cart.Rims = row.Id
				paintButtons()
				changed()
			end, { LayoutOrder = i, TextSize = Theme.TextSize.Small, Parent = grid })
			buttons[row.Id] = b
		end
		paintButtons()
		DealerUI.Section(("Rim colour  %s"):format(Format.MoneyShort(P.RimColor)), 30, s)
		DealerUI.Swatches(Tuning.Colors, function(c)
			cart.RimColor = DealerUI.ToTable(c)
			changed()
		end, 31, s)
		colorPickerToggle(s, 32, "Custom rim colour…", DealerUI.Color(cart.RimColor or cur("RimColor") or Tuning.DefaultRimColor), function(c)
			cart.RimColor = DealerUI.ToTable(c)
			changed()
		end)
	end

	pages.Body = function(s: ScrollingFrame)
		local P = options.Prices
		DealerUI.Section("Body kit", 1, s)
		optionChips(s, 2, Tuning.BodyKits, function(row)
			return P.BodyKits[row.Id] or 0
		end, cart.BodyKit or cur("BodyKit") or "Stock", function(id)
			cart.BodyKit = id
			changed()
		end, function(row)
			return P.BodyKitAllowed[row.Id] == true
		end)
		Kit.Label(("Kits that fit a %s are unlocked."):format(options.Class ~= "" and options.Class or "car like this"), {
			TextSize = 12,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = 3,
			Parent = s,
		})
		DealerUI.Section("Spoiler", 4, s)
		optionChips(s, 5, Tuning.Spoilers, function(row)
			return P.Spoilers[row.Id] or 0
		end, cart.Spoiler or cur("Spoiler") or "None", function(id)
			cart.Spoiler = id
			changed()
		end)
	end

	pages.Lights = function(s: ScrollingFrame)
		local P = options.Prices
		DealerUI.Section("Window tint", 1, s)
		local tintRows = {}
		for i, row in ipairs(Tuning.Tint) do
			table.insert(tintRows, { Id = row.Level, Name = row.Name, Index = i })
		end
		optionChips(s, 2, tintRows, function(row)
			return P.Tint[row.Index] or 0
		end, if cart.Tint ~= nil then cart.Tint else (cur("Tint") or 0), function(level)
			cart.Tint = level
			changed()
		end)
		DealerUI.Section(("Underglow  %s"):format(Format.MoneyShort(P.Underglow)), 3, s)
		Kit.Button("No underglow", "secondary", function()
			cart.Underglow = false
			changed()
		end, { LayoutOrder = 4, Parent = s })
		DealerUI.Swatches(Tuning.UnderglowColors, function(c)
			cart.Underglow = DealerUI.ToTable(c)
			changed()
		end, 5, s)
		local ug = cart.Underglow or cur("Underglow")
		colorPickerToggle(s, 6, "Custom underglow…", type(ug) == "table" and DealerUI.Color(ug) or Color3.fromRGB(120, 220, 255), function(c)
			cart.Underglow = DealerUI.ToTable(c)
			changed()
		end)
	end

	pages.Plate = function(s: ScrollingFrame)
		local P = options.Prices
		DealerUI.Section(("Custom plate  %s"):format(Format.MoneyShort(P.Plate)), 1, s)
		local plateCard = Kit.new("Frame", {
			Size = UDim2.new(1, 0, 0, 70),
			BackgroundColor3 = Color3.fromRGB(240, 240, 232),
			LayoutOrder = 2,
			Parent = s,
		})
		Kit.Corner(plateCard, Theme.CornerSmall)
		Kit.Stroke(plateCard, Color3.fromRGB(30, 60, 140), 3, 0)
		local plateText = Kit.Label(cart.Plate or cur("Plate") or "SKY 000", {
			Size = UDim2.fromScale(1, 1),
			AutomaticSize = Enum.AutomaticSize.None,
			Font = Theme.FontMono,
			TextSize = 34,
			TextColor3 = Color3.fromRGB(20, 30, 70),
			TextXAlignment = Enum.TextXAlignment.Center,
			TextYAlignment = Enum.TextYAlignment.Center,
			Parent = plateCard,
		})
		local box = Kit.TextBox(("1-%d letters, numbers, spaces"):format(Tuning.PlateMaxLength), {
			Text = cart.Plate or "",
			Font = Theme.FontMono,
			LayoutOrder = 3,
			Parent = s,
		})
		box:GetPropertyChangedSignal("Text"):Connect(function()
			local t = string.upper(box.Text):gsub("[^A-Z0-9 ]", "")
			t = t:sub(1, Tuning.PlateMaxLength)
			if t ~= box.Text then
				box.Text = t
				return
			end
			local trimmed = t:gsub("^%s+", ""):gsub("%s+$", "")
			if trimmed == "" then
				cart.Plate = nil
				plateText.Text = cur("Plate") or "SKY 000"
			else
				cart.Plate = trimmed
				plateText.Text = trimmed
			end
			changed()
		end)
		Kit.Label("Plates are checked by the Roblox text filter when you confirm.", {
			TextSize = 12,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = 4,
			Parent = s,
		})
	end

	pages.Performance = function(s: ScrollingFrame)
		local P = options.Prices
		local have = cur("Upgrades") or {}
		cart.Upgrades = cart.Upgrades or {}
		for i, catId in ipairs(Tuning.UpgradeOrder) do
			local info = Tuning.UpgradeInfo[catId]
			local card = Kit.Card({ LayoutOrder = i, Parent = s })
			Kit.List(card, 6)
			Kit.Label(("%s <b>%s</b>"):format(info.Icon, info.Name), { LayoutOrder = 1, Parent = card })
			Kit.Label(info.Blurb, { TextSize = 12, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 2, Parent = card })
			local pips = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 12), BackgroundTransparency = 1, LayoutOrder = 3, Parent = card })
			Kit.List(pips, 6, true)
			local pipFrames = {}
			for l = 1, Tuning.MaxUpgradeLevel do
				local pip = Kit.new("Frame", { Size = UDim2.new(1 / Tuning.MaxUpgradeLevel, -6, 1, 0), BackgroundColor3 = Theme.Colors.Background, LayoutOrder = l, Parent = pips })
				Kit.Corner(pip, UDim.new(1, 0))
				pipFrames[l] = pip
			end
			local row = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 4, Parent = card })
			local addBtn
			local resetBtn
			local function redraw()
				local h = have[catId] or 0
				local target = cart.Upgrades[catId] or h
				for l, pip in ipairs(pipFrames) do
					local color = Theme.Colors.Background
					if l <= h then
						color = Theme.Colors.Success
					elseif l <= target then
						color = Theme.Colors.Warning
					end
					Kit.Tween(pip, { BackgroundColor3 = color }, Theme.Tween.Fast)
				end
				if target >= Tuning.MaxUpgradeLevel then
					addBtn.Text = target > h and "Max stage in cart" or "✅ Maxed out"
					addBtn.AutoButtonColor = false
					addBtn.BackgroundColor3 = Theme.Colors.SurfaceAlt
				else
					local nextLvl = target + 1
					addBtn.Text = ("Add Stage %d  %s"):format(nextLvl, Format.MoneyShort((P.Upgrades[catId] and P.Upgrades[catId][nextLvl]) or 0))
					addBtn.AutoButtonColor = true
					addBtn.BackgroundColor3 = Theme.Colors.Accent
				end
				resetBtn.Visible = target > h
			end
			addBtn = Kit.Button("", "primary", function()
				local h = have[catId] or 0
				local target = cart.Upgrades[catId] or h
				if target >= Tuning.MaxUpgradeLevel then
					return
				end
				cart.Upgrades[catId] = target + 1
				redraw()
				changed()
			end, { Size = UDim2.new(0.68, -4, 1, 0), Parent = row })
			resetBtn = Kit.Button("Undo", "secondary", function()
				cart.Upgrades[catId] = nil
				redraw()
				changed()
			end, { Size = UDim2.new(0.32, -4, 1, 0), Position = UDim2.new(0.68, 4, 0, 0), Parent = row })
			redraw()
		end
		Kit.Label("Stages are installed in order. Performance upgrades add 50% of their price to your car's value.", {
			TextSize = 12,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = 50,
			Parent = s,
		})
	end

	showCategory = function(id: string)
		category = id
		clearScroll()
		if scroll and pages[id] then
			pages[id](scroll)
		end
	end

	-- confirm ------------------------------------------------------------------------
	local function buildChanges(): { [string]: any }?
		local lines = cartLines()
		if #lines == 0 then
			return nil
		end
		local ch = {}
		for k, v in pairs(cart) do
			if k == "Upgrades" then
				local any = false
				local ups = {}
				for catId, lvl in pairs(v) do
					if lvl > ((cur("Upgrades") or {})[catId] or 0) then
						ups[catId] = lvl
						any = true
					end
				end
				if any then
					ch.Upgrades = ups
				end
			else
				ch[k] = v
			end
		end
		return ch
	end

	local loadOptions: () -> ()

	local function confirm()
		-- `applying` is held through the confirm dialog too, so ButtonY / Enter spam can't stack dialogs
		if applying or not options then
			return
		end
		local changes = buildChanges()
		if not changes then
			Router.Notify("Pick something first.", "info")
			return
		end
		local _, total = cartLines()
		applying = true
		local yes = Router.Confirm("Apply changes?", ("Total %s (from your wallet)."):format(Format.Money(total)), "Apply")
		if not yes or not sheet.Parent then
			applying = false
			return
		end
		if preview then
			preview.Revert()
		end
		local res = Net.Invoke("Tuning", "Apply", { Uid = options.Uid, Changes = changes })
		applying = false
		if res.ok then
			table.clear(cart)
			loadOptions()
		else
			Router.Notify(res.err or "Couldn't apply changes.", "error")
			refreshPreview()
		end
	end

	-- load -----------------------------------------------------------------------
	loadOptions = function()
		local res = Net.Invoke("Tuning", "GetOptions", { Uid = uid })
		if not sheet.Parent then
			return
		end
		if not res.ok then
			status.Text = "⚠️ " .. tostring(res.err or "Bring your car into the tuning shop.")
			status.TextColor3 = Theme.Colors.Warning
			return
		end
		options = res
		uid = res.Uid
		title.Text = "🔧 " .. tostring(res.Name)
		status.Visible = false

		local found = TuningPanel.FindCarModel(res.Uid)
		if found ~= model then
			if preview then
				preview.Revert()
			end
			model = found
			preview = found and LookPreview.new(found) or nil
			if found then
				OrbitCamera.Start(found)
			end
		end

		if not scroll then
			catRow = DealerUI.ChipRow(CATEGORIES, category, function(id)
				showCategory(id)
			end, { Parent = body })
			scroll = Kit.Scroll({
				Position = UDim2.fromOffset(0, 50),
				Size = UDim2.new(1, 0, 1, -50 - 168),
				Parent = body,
			}, 8)
			footer = Kit.new("Frame", {
				AnchorPoint = Vector2.new(0, 1),
				Position = UDim2.fromScale(0, 1),
				Size = UDim2.new(1, 0, 0, 160),
				BackgroundColor3 = Theme.Colors.Background,
				Parent = body,
			})
			Kit.Corner(footer :: Frame, Theme.CornerSmall)
			Kit.Padding(footer :: Frame, 10)
			local cartScroll = Kit.new("ScrollingFrame", {
				Size = UDim2.new(1, 0, 1, -82),
				BackgroundTransparency = 1,
				CanvasSize = UDim2.new(),
				AutomaticCanvasSize = Enum.AutomaticSize.Y,
				ScrollBarThickness = 3,
				BorderSizePixel = 0,
				Parent = footer,
			})
			cartLabel = Kit.Label("", { TextSize = Theme.TextSize.Small, Parent = cartScroll })
			totalLabel = Kit.Label("", {
				Position = UDim2.new(0, 0, 1, -78),
				Size = UDim2.new(1, 0, 0, 26),
				AutomaticSize = Enum.AutomaticSize.None,
				Parent = footer,
			})
			local row = Kit.new("Frame", {
				AnchorPoint = Vector2.new(0, 1),
				Position = UDim2.fromScale(0, 1),
				Size = UDim2.new(1, 0, 0, 46),
				BackgroundTransparency = 1,
				Parent = footer,
			})
			Kit.Button("↺ Revert", "secondary", function()
				table.clear(cart)
				if preview then
					preview.Revert()
				end
				showCategory(category)
				refreshFooter()
			end, { Size = UDim2.new(0.34, -4, 1, 0), Parent = row })
			confirmBtn = Kit.Button("Confirm", "success", confirm, {
				Size = UDim2.new(0.66, -4, 1, 0),
				Position = UDim2.new(0.34, 4, 0, 0),
				Parent = row,
			})
			maid:Give(ClientData.OnChanged("Cash", refreshFooter))
			if Kit.IsGamepad() then
				GuiService.SelectedObject = confirmBtn
			end
		end
		showCategory(category)
		refreshFooter()
	end

	-- input --------------------------------------------------------------------
	ContextActionService:BindActionAtPriority(ACTION_PREV, function(_, st)
		if st == Enum.UserInputState.Begin and catRow then
			catRow.Step(-1)
		end
		return Enum.ContextActionResult.Sink
	end, false, 3300, Enum.KeyCode.ButtonL1, Enum.KeyCode.LeftBracket)
	ContextActionService:BindActionAtPriority(ACTION_NEXT, function(_, st)
		if st == Enum.UserInputState.Begin and catRow then
			catRow.Step(1)
		end
		return Enum.ContextActionResult.Sink
	end, false, 3300, Enum.KeyCode.ButtonR1, Enum.KeyCode.RightBracket)
	ContextActionService:BindActionAtPriority(ACTION_CONFIRM, function(_, st)
		if st == Enum.UserInputState.Begin then
			task.spawn(confirm)
		end
		return Enum.ContextActionResult.Sink
	end, false, 3300, Enum.KeyCode.ButtonY, Enum.KeyCode.Return)
	ContextActionService:BindActionAtPriority(ACTION_CLOSE, function(_, st)
		if st == Enum.UserInputState.Begin then
			ctx.Close()
		end
		return Enum.ContextActionResult.Sink
	end, false, 3300, Enum.KeyCode.ButtonB)

	maid:Give(function()
		ContextActionService:UnbindAction(ACTION_PREV)
		ContextActionService:UnbindAction(ACTION_NEXT)
		ContextActionService:UnbindAction(ACTION_CONFIRM)
		ContextActionService:UnbindAction(ACTION_CLOSE)
		for _, p in ipairs(pickers) do
			p.Destroy()
		end
		table.clear(pickers)
		if preview then
			preview.Revert()
			preview = nil
		end
		OrbitCamera.Stop()
	end)

	-- if the car disappears (despawned / destroyed) close the shop
	maid:Give(task.spawn(function()
		while sheet.Parent do
			task.wait(1)
			if model and not model.Parent then
				task.defer(ctx.Close)
				return
			end
		end
	end))

	if Kit.IsGamepad() then
		GuiService.SelectedObject = closeBtn
	end
	task.spawn(loadOptions)
end

return TuningPanel
