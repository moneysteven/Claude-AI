-- BuildUI (client helper): the "BuildMode" panel layout (Kit-built, mobile-first).
--   toolbar (tools, undo/redo, grid, free placement) · floor selector + item counter · budget card with
--   Confirm / Cancel · catalog drawer (categories, search, prices incl. VIP) · selection card ·
--   big on-screen buttons for touch (rotate / place / delete / cancel).
--
--   local ui = BuildUI.Create(root, ctxDescriptor, callbacks)
--   ui.SetTool(tool) · ui.SetBudget({ Cost, Refund, Cash, Error?, Exact }) · ui.SetFloor(f, max) · ui.SetCount(n, max)
--   ui.SetGrid(enabled, size) · ui.SetFree(bool) · ui.SetUndoRedo(canUndo, canRedo) · ui.SetHint(text)
--   ui.SetSelection(info?) · ui.SetActiveItem(itemId?) · ui.ToggleCatalog(open?) · ui.Destroy()

local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Furniture = require(Shared.Config.Furniture)
local HousingConfig = require(Shared.Config.Housing)
local Format = require(Shared.Util.Format)
local Maid = require(Shared.Util.Maid)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local BuildUI = {}

local TOOLS = {
	{ Id = "Select", Icon = "👆", Label = "Select" },
	{ Id = "Place", Icon = "➕", Label = "Place" },
	{ Id = "Wall", Icon = "🧱", Label = "Walls" },
	{ Id = "Move", Icon = "✋", Label = "Move" },
	{ Id = "Rotate", Icon = "🔄", Label = "Rotate" },
	{ Id = "Delete", Icon = "🗑️", Label = "Delete" },
	{ Id = "Paint", Icon = "🎨", Label = "Paint" },
}
BuildUI.Tools = TOOLS

local function surfaceFrame(props)
	local f = Kit.new("Frame", props)
	f.BackgroundColor3 = Theme.Colors.Surface
	f.BackgroundTransparency = 0.08
	f.Active = true
	Kit.Corner(f, Theme.CornerSmall)
	Kit.Stroke(f)
	return f
end

local function toolButton(parent, icon: string, label: string, order: number, onClick)
	local b = Kit.new("TextButton", {
		Name = label,
		Text = "",
		LayoutOrder = order,
		Size = UDim2.fromOffset(54, 54),
		BackgroundColor3 = Theme.Colors.SurfaceAlt,
		AutoButtonColor = true,
		Parent = parent,
	})
	Kit.Corner(b, Theme.CornerSmall)
	Kit.Ripple(b)
	Kit.new("TextLabel", {
		Text = icon,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 30),
		Position = UDim2.fromOffset(0, 4),
		TextSize = 22,
		Font = Theme.FontBold,
		TextColor3 = Theme.Colors.Text,
		Parent = b,
	})
	local l = Kit.new("TextLabel", {
		Name = "Label",
		Text = label,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 14),
		Position = UDim2.new(0, 0, 1, -17),
		TextSize = 11,
		Font = Theme.Font,
		TextColor3 = Theme.Colors.TextDim,
		Parent = b,
	})
	b.Activated:Connect(function()
		task.spawn(onClick)
	end)
	return b, l
end

function BuildUI.Create(root: Frame, ctx, cb)
	local maid = Maid.new()
	local player = Players.LocalPlayer
	local isVip = player:GetAttribute("VIP") == true
	local vipFactor = HousingConfig.Build.VipDisplayDiscount
	local touch = UserInputService.TouchEnabled
	local api = {}

	-- full-screen container compensating the layer's UIScale
	local holder = Kit.new("Frame", {
		Name = "BuildModeRoot",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Parent = root,
	})
	local layerScale = root:FindFirstAncestorOfClass("ScreenGui")
	local uiScale = layerScale and layerScale:FindFirstChildOfClass("UIScale")
	local function fit()
		local s = uiScale and uiScale.Scale or 1
		holder.Size = UDim2.fromScale(1 / s, 1 / s)
	end
	fit()
	if uiScale then
		maid:Give(uiScale:GetPropertyChangedSignal("Scale"):Connect(fit))
	end

	---------------------------------------------------------------------------
	-- Toolbar
	---------------------------------------------------------------------------
	local bar = surfaceFrame({
		Name = "Toolbar",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 8),
		Size = UDim2.new(0.98, 0, 0, 70),
		Parent = holder,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(900, 70), Parent = bar })
	local barScroll = Kit.new("ScrollingFrame", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -16, 1, 0),
		Position = UDim2.fromOffset(8, 0),
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.X,
		ScrollingDirection = Enum.ScrollingDirection.X,
		ScrollBarThickness = 3,
		BorderSizePixel = 0,
		Parent = bar,
	})
	Kit.List(barScroll, 6, true)

	local toolButtons = {}
	local wallDef = Furniture.ById[HousingConfig.Build.WallItems[8] or "wall_8"]
	local wallsAllowed = wallDef ~= nil and wallDef.CatalogSet[ctx.Catalog or "House"] == true
	for i, t in ipairs(TOOLS) do
		-- apartments are furniture & paint only: no wall-drawing tool there
		if t.Id ~= "Wall" or wallsAllowed then
			local b = toolButton(barScroll, t.Icon, t.Label, i, function()
				cb.OnTool(t.Id)
			end)
			toolButtons[t.Id] = b
		end
	end
	local sep = Kit.new("Frame", { Size = UDim2.fromOffset(2, 40), BackgroundColor3 = Theme.Colors.Stroke, LayoutOrder = 20, Parent = barScroll })
	sep.BorderSizePixel = 0
	local undoBtn = toolButton(barScroll, "↩️", "Undo", 21, cb.OnUndo)
	local redoBtn = toolButton(barScroll, "↪️", "Redo", 22, cb.OnRedo)
	local gridBtn, gridLabel = toolButton(barScroll, "#️⃣", "Grid 1", 23, cb.OnGridToggle)
	local _, gridSizeLabel = toolButton(barScroll, "📏", "Size", 24, cb.OnGridSize)
	local freeBtn = toolButton(barScroll, "🎯", "Free", 25, cb.OnFree)
	toolButton(barScroll, "📦", "Catalog", 26, function()
		api.ToggleCatalog()
	end)

	local hint = Kit.Label("", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 84),
		Size = UDim2.new(0.9, 0, 0, 20),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.Text,
		TextStrokeTransparency = 0.5,
		Parent = holder,
	})

	---------------------------------------------------------------------------
	-- Left: floors + count
	---------------------------------------------------------------------------
	local left = surfaceFrame({
		Name = "Floors",
		Position = UDim2.new(0, 10, 0, 110),
		Size = UDim2.fromOffset(120, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Parent = holder,
	})
	Kit.Padding(left, 8)
	Kit.List(left, 6, false, Enum.HorizontalAlignment.Center)
	Kit.Button("▲", "secondary", function()
		cb.OnFloor(1)
	end, { Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 1, Parent = left })
	local floorLabel = Kit.Label("Floor 1", {
		Font = Theme.FontBold,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 2,
		Parent = left,
	})
	Kit.Button("▼", "secondary", function()
		cb.OnFloor(-1)
	end, { Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 3, Parent = left })
	local countLabel = Kit.Label("0/0", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 4,
		Parent = left,
	})

	---------------------------------------------------------------------------
	-- Right: budget + confirm / cancel / exit
	---------------------------------------------------------------------------
	local budget = surfaceFrame({
		Name = "Budget",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 110),
		Size = UDim2.fromOffset(210, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Parent = holder,
	})
	Kit.Padding(budget, 10)
	Kit.List(budget, 4)
	Kit.Label("🧾 Budget", { Font = Theme.FontBold, LayoutOrder = 1, Parent = budget })
	local costLabel = Kit.Label("Changes: $0", { TextSize = Theme.TextSize.Small, LayoutOrder = 2, Parent = budget })
	local refundLabel = Kit.Label("Sell-back: $0", { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.Money, LayoutOrder = 3, Parent = budget })
	local cashLabel = Kit.Label("Cash: $0", { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 4, Parent = budget })
	local afterLabel = Kit.Label("After: $0", { TextSize = Theme.TextSize.Small, Font = Theme.FontBold, LayoutOrder = 5, Parent = budget })
	local errLabel = Kit.Label("", { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.Danger, LayoutOrder = 6, Visible = false, Parent = budget })
	local confirmBtn = Kit.Button("✅ Confirm", "success", cb.OnConfirm, { LayoutOrder = 7, Parent = budget })
	Kit.Button("✖ Discard", "secondary", cb.OnCancel, { LayoutOrder = 8, Parent = budget })
	Kit.Button("🚪 Exit build", "danger", cb.OnExit, { LayoutOrder = 9, Parent = budget })

	---------------------------------------------------------------------------
	-- Selection card
	---------------------------------------------------------------------------
	local selCard = surfaceFrame({
		Name = "Selection",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -236),
		Size = UDim2.new(0.9, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Visible = false,
		Parent = holder,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(520, 400), Parent = selCard })
	Kit.Padding(selCard, 8)
	Kit.List(selCard, 6)
	local selTitle = Kit.Label("", { Font = Theme.FontBold, LayoutOrder = 1, Parent = selCard })
	local selRow = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 2, Parent = selCard })
	Kit.List(selRow, 6, true)
	local function selAction(text, style, action, order)
		return Kit.Button(text, style, function()
			cb.OnSelectionAction(action)
		end, { Size = UDim2.new(0.25, -5, 1, 0), LayoutOrder = order, TextSize = Theme.TextSize.Small, Parent = selRow })
	end
	selAction("✋ Move", "secondary", "Move", 1)
	selAction("🔄 Rotate", "secondary", "Rotate", 2)
	local selPaint = selAction("🎨 Paint", "secondary", "Paint", 3)
	selAction("🗑️ Delete", "danger", "Delete", 4)

	-- wallpaper row (apartments) shown with the paint tool
	local wallRow = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 3, Visible = false, Parent = selCard })
	Kit.List(wallRow, 6, true)
	Kit.Button("🧱 Paint all walls", "primary", function()
		cb.OnWallpaper("Walls")
	end, { Size = UDim2.new(0.5, -3, 1, 0), TextSize = Theme.TextSize.Small, Parent = wallRow })
	Kit.Button("🟫 Paint floor", "primary", function()
		cb.OnWallpaper("Floor")
	end, { Size = UDim2.new(0.5, -3, 1, 0), TextSize = Theme.TextSize.Small, Parent = wallRow })

	---------------------------------------------------------------------------
	-- Mobile action cluster
	---------------------------------------------------------------------------
	local mobile = Kit.new("Frame", {
		Name = "MobileActions",
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -10, 1, -236),
		Size = UDim2.fromOffset(132, 132),
		BackgroundTransparency = 1,
		Visible = touch,
		Parent = holder,
	})
	local function bigButton(icon, pos, color, fn)
		local b = Kit.IconButton(icon, fn, {
			Size = UDim2.fromOffset(60, 60),
			Position = pos,
			TextSize = 26,
			BackgroundColor3 = color,
			Parent = mobile,
		})
		Kit.Stroke(b)
		return b
	end
	bigButton("✔", UDim2.fromOffset(72, 72), Theme.Colors.Success, cb.OnPlaceHere)
	bigButton("⟳", UDim2.fromOffset(0, 72), Theme.Colors.SurfaceAlt, cb.OnRotate)
	bigButton("🗑", UDim2.fromOffset(72, 0), Theme.Colors.Danger, cb.OnDeleteSelected)
	bigButton("✖", UDim2.fromOffset(0, 0), Theme.Colors.SurfaceAlt, cb.OnCancelAction)

	---------------------------------------------------------------------------
	-- Catalog drawer
	---------------------------------------------------------------------------
	local drawer = surfaceFrame({
		Name = "Catalog",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -8),
		Size = UDim2.new(0.98, 0, 0, 218),
		Parent = holder,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(1100, 218), Parent = drawer })
	local tabs = Kit.new("ScrollingFrame", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(8, 6),
		Size = UDim2.new(1, -200, 0, 46),
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.X,
		ScrollingDirection = Enum.ScrollingDirection.X,
		ScrollBarThickness = 3,
		BorderSizePixel = 0,
		Parent = drawer,
	})
	Kit.List(tabs, 6, true)
	local search = Kit.TextBox("🔎 Search", {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -8, 0, 6),
		Size = UDim2.fromOffset(180, 44),
		Parent = drawer,
	})
	local grid = Kit.new("ScrollingFrame", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(8, 58),
		Size = UDim2.new(1, -16, 1, -64),
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.X,
		ScrollingDirection = Enum.ScrollingDirection.X,
		ScrollBarThickness = 4,
		BorderSizePixel = 0,
		Parent = drawer,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.fromOffset(118, 72),
		CellPadding = UDim2.fromOffset(6, 6),
		FillDirection = Enum.FillDirection.Vertical,
		FillDirectionMaxCells = 2,
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = grid,
	})

	local catalog = ctx.Catalog or "House"
	local categories = {}
	for _, c in ipairs(Furniture.Categories) do
		for _, def in ipairs(Furniture.Items) do
			if def.Category == c.Id and def.CatalogSet[catalog] then
				table.insert(categories, c)
				break
			end
		end
	end
	local currentCategory = categories[1] and categories[1].Id or "LivingRoom"
	for _, c in ipairs(categories) do
		if c.Id == "LivingRoom" then
			currentCategory = c.Id
		end
	end
	local activeItem: string? = nil
	local tabButtons = {}
	local cards = {}

	local function priceText(def): string
		if isVip and def.Price > 0 then
			return "👑 " .. Format.MoneyShort(math.floor(def.Price * vipFactor + 0.5))
		end
		return Format.MoneyShort(def.Price)
	end

	local function renderItems()
		for _, c in ipairs(cards) do
			c:Destroy()
		end
		table.clear(cards)
		local query = string.lower(search.Text or "")
		local order = 0
		for _, def in ipairs(Furniture.Items) do
			local match
			if query ~= "" then
				match = def.CatalogSet[catalog] and string.find(string.lower(def.Name), query, 1, true) ~= nil
			else
				match = def.CatalogSet[catalog] and def.Category == currentCategory
			end
			if match then
				order += 1
				local selected = def.Id == activeItem
				local card = Kit.new("TextButton", {
					Name = def.Id,
					Text = "",
					LayoutOrder = order,
					BackgroundColor3 = selected and Theme.Colors.Accent or Theme.Colors.SurfaceAlt,
					AutoButtonColor = true,
					Parent = grid,
				})
				Kit.Corner(card, Theme.CornerSmall)
				if def.VipOnly then
					Kit.Stroke(card, Theme.Colors.VIP, 2, 0)
				end
				local icon = def.Icon or "📦"
				if def.Kind == "Paint" then
					local sw = Kit.new("Frame", {
						Size = UDim2.fromOffset(26, 26),
						Position = UDim2.fromOffset(6, 6),
						BackgroundColor3 = def.Color,
						Parent = card,
					})
					Kit.Corner(sw, UDim.new(1, 0))
					icon = ""
				end
				Kit.new("TextLabel", {
					Text = icon,
					BackgroundTransparency = 1,
					Size = UDim2.fromOffset(32, 32),
					Position = UDim2.fromOffset(4, 4),
					TextSize = 22,
					Font = Theme.FontBold,
					TextColor3 = Theme.Colors.Text,
					Parent = card,
				})
				Kit.new("TextLabel", {
					Text = def.Name,
					BackgroundTransparency = 1,
					Size = UDim2.new(1, -40, 0, 34),
					Position = UDim2.fromOffset(38, 2),
					TextSize = 12,
					TextWrapped = true,
					TextXAlignment = Enum.TextXAlignment.Left,
					Font = Theme.Font,
					TextColor3 = Theme.Colors.Text,
					Parent = card,
				})
				Kit.new("TextLabel", {
					Text = priceText(def) .. (def.VipOnly and "  VIP" or ""),
					BackgroundTransparency = 1,
					Size = UDim2.new(1, -10, 0, 20),
					Position = UDim2.new(0, 6, 1, -24),
					TextSize = 13,
					TextXAlignment = Enum.TextXAlignment.Left,
					Font = Theme.FontBold,
					TextColor3 = def.VipOnly and Theme.Colors.VIP or Theme.Colors.Money,
					Parent = card,
				})
				card.Activated:Connect(function()
					task.spawn(cb.OnItem, def.Id)
				end)
				table.insert(cards, card)
			end
		end
		if order == 0 then
			local empty = Kit.Label("Nothing found", { Size = UDim2.fromOffset(200, 30), TextColor3 = Theme.Colors.TextDim, Parent = grid })
			table.insert(cards, empty)
		end
	end

	local function renderTabs()
		for _, b in pairs(tabButtons) do
			b:Destroy()
		end
		table.clear(tabButtons)
		for i, c in ipairs(categories) do
			local b = Kit.Button(c.Icon .. " " .. c.Name, c.Id == currentCategory and "primary" or "secondary", function()
				currentCategory = c.Id
				search.Text = ""
				renderTabs()
				renderItems()
			end, {
				Size = UDim2.fromOffset(0, 40),
				AutomaticSize = Enum.AutomaticSize.X,
				LayoutOrder = i,
				TextSize = Theme.TextSize.Small,
				Parent = tabs,
			})
			Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), Parent = b })
			tabButtons[c.Id] = b
		end
	end
	renderTabs()
	renderItems()
	maid:Give(search:GetPropertyChangedSignal("Text"):Connect(renderItems))

	local catalogOpen = true
	function api.ToggleCatalog(open: boolean?)
		if open == nil then
			catalogOpen = not catalogOpen
		else
			catalogOpen = open
		end
		local target = catalogOpen and UDim2.new(0.5, 0, 1, -8) or UDim2.new(0.5, 0, 1, 200)
		Kit.Tween(drawer, { Position = target }, Theme.Tween.Normal)
		local y = catalogOpen and -236 or -36
		Kit.Tween(selCard, { Position = UDim2.new(0.5, 0, 1, y) }, Theme.Tween.Normal)
		Kit.Tween(mobile, { Position = UDim2.new(1, -10, 1, y) }, Theme.Tween.Normal)
		if catalogOpen and Kit.IsGamepad() and cards[1] then
			GuiService.SelectedObject = cards[1]
		elseif not catalogOpen and GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(drawer) then
			GuiService.SelectedObject = nil
		end
	end

	function api.ShowCategory(categoryId: string)
		currentCategory = categoryId
		search.Text = ""
		renderTabs()
		renderItems()
		api.ToggleCatalog(true)
	end

	function api.SetActiveItem(itemId: string?)
		activeItem = itemId
		for _, card in ipairs(cards) do
			if card:IsA("TextButton") then
				card.BackgroundColor3 = (card.Name == itemId) and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
			end
		end
	end

	---------------------------------------------------------------------------
	-- API
	---------------------------------------------------------------------------
	function api.SetTool(tool: string)
		for id, b in pairs(toolButtons) do
			b.BackgroundColor3 = id == tool and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
		end
		wallRow.Visible = tool == "Paint" and ctx.CanWallpaper == true
		if wallRow.Visible then
			selCard.Visible = true
		end
	end

	function api.SetBudget(info)
		local cost = info.Cost or 0
		local refund = info.Refund or 0
		local cash = info.Cash or 0
		local net = info.IsOwner and (cost - refund) or cost
		costLabel.Text = ("Changes: %s%s"):format(Format.Money(cost), info.Exact and "" or " (est.)")
		refundLabel.Text = info.IsOwner and ("Sell-back: +%s"):format(Format.Money(refund)) or ("Sell-back to owner: %s"):format(Format.Money(refund))
		cashLabel.Text = ("Cash: %s"):format(Format.Money(cash))
		local after = cash - net
		afterLabel.Text = ("After: %s"):format(Format.Money(after))
		afterLabel.TextColor3 = after < 0 and Theme.Colors.Danger or Theme.Colors.Text
		errLabel.Visible = info.Error ~= nil
		errLabel.Text = info.Error or ""
		local canConfirm = info.HasChanges and after >= 0 and info.Error == nil
		confirmBtn.BackgroundColor3 = canConfirm and Theme.Colors.Success or Theme.Colors.Stroke
	end

	function api.SetFloor(f: number, max: number)
		floorLabel.Text = ("Floor %d/%d"):format(f, max)
	end

	function api.SetCount(n: number, max: number)
		countLabel.Text = ("Items %d/%d"):format(n, max)
		countLabel.TextColor3 = n >= max and Theme.Colors.Danger or Theme.Colors.TextDim
	end

	function api.SetGrid(enabled: boolean, size: number)
		gridBtn.BackgroundColor3 = enabled and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
		gridLabel.Text = enabled and ("Grid " .. tostring(size)) or "Grid off"
		gridSizeLabel.Text = ("Size %s"):format(tostring(size))
	end

	function api.SetFree(free: boolean)
		freeBtn.BackgroundColor3 = free and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
	end

	function api.SetUndoRedo(canUndo: boolean, canRedo: boolean)
		undoBtn.BackgroundTransparency = canUndo and 0 or 0.6
		redoBtn.BackgroundTransparency = canRedo and 0 or 0.6
	end

	function api.SetHint(text: string)
		hint.Text = text
	end

	function api.SetSelection(info)
		if not info then
			selCard.Visible = wallRow.Visible
			selTitle.Text = wallRow.Visible and "🎨 Pick a paint, then tap an item — or paint the whole room:" or ""
			selRow.Visible = false
			return
		end
		selCard.Visible = true
		selRow.Visible = true
		selTitle.Text = info.Title
		selPaint.Visible = info.Paintable == true
	end

	function api.Destroy()
		maid:Clean()
		holder:Destroy()
	end

	api.Root = holder
	return api
end

return BuildUI
