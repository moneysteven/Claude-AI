-- ClothingController: the "Clothing" panel (Wardrobe / Store / Exclusives) and the 👗 Wardrobe HUD button.
--
--   Wardrobe   owned items filtered by slot; tap to wear / take off
--   Store      cash items with prices; buying needs you to be at a ClothingStore (server checks distance)
--   Exclusives Robux items; owned ones can be worn, others link to the Shop
--
-- Panel data: { Tab = "Wardrobe"|"Store"|"Exclusives" }? (the server opens Tab = "Store" from store prompts)
-- Keys: F3 toggles (Config.Clothing.UI.WardrobeKey) · L1/R1 or Q/E switch tabs · B closes.
--
-- API (client):
--   ClothingController:Open(tab?)

local ContextActionService = game:GetService("ContextActionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Clothing = require(Shared.Config.Clothing)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local ShopWidgets = require(script.Parent:WaitForChild("ShopWidgets"))
local ItemPreview = require(script.Parent:WaitForChild("ItemPreview"))

local ClothingController = {
	Name = "ClothingController",
	Priority = 72,
}

local PANEL = "Clothing"

local TABS = {
	{ Id = "Wardrobe", Text = "👗 Wardrobe" },
	{ Id = "Store", Text = "🛒 Store" },
	{ Id = "Exclusives", Text = "💎 Exclusives" },
}

local catalog: { [string]: any }? = nil

---------------------------------------------------------------------------
-- State helpers (ClientData is live; catalog adds prices + store proximity)
---------------------------------------------------------------------------
local function owns(item): boolean
	if item.Starter then
		return true
	end
	return ClientData.Get("Clothing.Owned." .. item.Id) == true
end

local function equippedIn(slot: string): string?
	local v = ClientData.Get("Clothing.Equipped." .. slot)
	return type(v) == "string" and v or nil
end

local function isEquipped(item): boolean
	return equippedIn(item.Slot) == item.Id
end

local function fetch()
	local res = Net.Invoke("Clothing", "GetCatalog", {})
	if res.ok then
		catalog = res
	end
	return catalog
end

function ClothingController:Open(tab: string?)
	Router.Open(PANEL, { Tab = tab })
end

---------------------------------------------------------------------------
-- Actions
---------------------------------------------------------------------------
local function wear(item)
	local res = Net.Invoke("Clothing", "Equip", { ItemId = item.Id })
	Router.Result(res)
end

local function takeOff(slot: string)
	local res = Net.Invoke("Clothing", "Unequip", { Slot = slot })
	Router.Result(res)
end

local function buy(item, price: number)
	local ok = Router.Confirm(
		("Buy %s?"):format(item.Name),
		("%s will be taken from your wallet and you'll wear it right away."):format(Format.Money(price)),
		"Buy " .. Format.Money(price)
	)
	if not ok then
		return
	end
	local res = Net.Invoke("Clothing", "Buy", { ItemId = item.Id, Equip = true })
	if Router.Result(res) then
		fetch()
	end
end

---------------------------------------------------------------------------
-- Cells
---------------------------------------------------------------------------
local function itemCell(parent: Instance, item, order: number, footer: (Frame) -> ())
	local rarityColor = Clothing.RarityColors[item.Rarity or ""]
	local wearing = owns(item) and isEquipped(item)
	local cell = Kit.new("Frame", { BackgroundColor3 = Theme.Colors.SurfaceAlt, LayoutOrder = order, Parent = parent })
	Kit.Corner(cell, Theme.CornerSmall)
	Kit.Stroke(cell, wearing and Theme.Colors.Success or (rarityColor or Theme.Colors.Stroke), wearing and 3 or 1, wearing and 0 or 0.3)
	local stage = Kit.new("Frame", {
		Size = UDim2.new(1, -12, 0, 100),
		Position = UDim2.fromOffset(6, 6),
		BackgroundColor3 = (rarityColor or Theme.Colors.Accent):Lerp(Theme.Colors.Background, 0.8),
		Parent = cell,
	})
	Kit.Corner(stage, Theme.CornerSmall)
	ItemPreview.Create(item, { Parent = stage })
	if wearing then
		ShopWidgets.Chip("WEARING", Theme.Colors.Success, { Position = UDim2.fromOffset(6, 6), Size = UDim2.fromOffset(0, 20), Parent = stage })
	elseif item.Rarity then
		ShopWidgets.Chip(item.Rarity, rarityColor or Theme.Colors.AccentAlt, { Position = UDim2.fromOffset(6, 6), Size = UDim2.fromOffset(0, 20), Parent = stage })
	end
	Kit.Label((item.Icon or "") .. " " .. item.Name, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small + 1,
		Position = UDim2.fromOffset(8, 110),
		Size = UDim2.new(1, -16, 0, 34),
		AutomaticSize = Enum.AutomaticSize.None,
		Parent = cell,
	})
	footer(cell)
	return cell
end

local function footerButton(cell: Frame, text: string, style: string, onClick: () -> ())
	return Kit.Button(text, style, onClick, {
		Position = UDim2.new(0, 8, 1, -52),
		Size = UDim2.new(1, -16, 0, 44),
		TextSize = Theme.TextSize.Small + 1,
		Parent = cell,
	})
end

local function footerNote(cell: Frame, text: string, color: Color3?)
	Kit.Label(text, {
		TextSize = Theme.TextSize.Small,
		TextColor3 = color or Theme.Colors.TextDim,
		Position = UDim2.fromOffset(8, 146),
		Size = UDim2.new(1, -16, 0, 18),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextWrapped = false,
		Parent = cell,
	})
end

local function wearFooter(item)
	return function(cell: Frame)
		local slotInfo = Clothing.SlotInfo[item.Slot]
		footerNote(cell, (slotInfo and (slotInfo.Icon .. " " .. slotInfo.Name)) or item.Slot)
		if isEquipped(item) then
			footerButton(cell, "Take off", "secondary", function()
				takeOff(item.Slot)
			end)
		else
			footerButton(cell, "Wear", "primary", function()
				wear(item)
			end)
		end
	end
end

local CELL = UDim2.fromOffset(160, 226)

---------------------------------------------------------------------------
-- Tabs
---------------------------------------------------------------------------
local function buildWardrobe(body: Frame, state)
	-- slot filter row
	local filter = Kit.new("ScrollingFrame", {
		Size = UDim2.new(1, 0, 0, 48),
		BackgroundTransparency = 1,
		ScrollingDirection = Enum.ScrollingDirection.X,
		AutomaticCanvasSize = Enum.AutomaticSize.X,
		CanvasSize = UDim2.new(),
		ScrollBarThickness = 3,
		BorderSizePixel = 0,
		Parent = body,
	})
	Kit.List(filter, 6, true)
	local options = { { Id = "All", Text = "✨ All" } }
	for _, slot in ipairs(Clothing.Slots) do
		local info = Clothing.SlotInfo[slot]
		table.insert(options, { Id = slot, Text = (info and (info.Icon .. " " .. info.Name)) or slot })
	end
	for i, opt in ipairs(options) do
		local on = state.slot == opt.Id
		Kit.Button(opt.Text, on and "primary" or "secondary", function()
			state.slot = opt.Id
			state.redraw()
		end, {
			Size = UDim2.fromOffset(112, 44),
			TextSize = Theme.TextSize.Small,
			LayoutOrder = i,
			Parent = filter,
		})
	end

	local grid = Kit.Grid(CELL, { Position = UDim2.fromOffset(0, 56), Size = UDim2.new(1, 0, 1, -56), Parent = body })
	local n = 0
	for _, item in ipairs(Clothing.Items) do
		if owns(item) and (state.slot == "All" or item.Slot == state.slot) then
			n += 1
			itemCell(grid, item, (isEquipped(item) and 0 or 1000) + item.Order, wearFooter(item))
		end
	end
	if n == 0 then
		Kit.Label("Nothing here yet — visit a 👕 Clothing Store or check the 💎 Exclusives tab.", {
			TextColor3 = Theme.Colors.TextDim,
			Size = UDim2.new(1, 0, 0, 40),
			Parent = grid,
		})
	end
end

local function buildStore(body: Frame, _state)
	local near = catalog ~= nil and catalog.NearStore == true
	local banner = Kit.Card({
		Size = UDim2.new(1, 0, 0, 44),
		AutomaticSize = Enum.AutomaticSize.None,
		BackgroundColor3 = near and Theme.Colors.Success or Theme.Colors.SurfaceAlt,
		Parent = body,
	})
	Kit.Label(near and "🛒 You're at a clothing store — tap an item to buy it." or "📍 Browse here, then visit a 👕 Clothing Store in the city to buy.", {
		TextSize = Theme.TextSize.Small,
		TextYAlignment = Enum.TextYAlignment.Center,
		Size = UDim2.fromScale(1, 1),
		AutomaticSize = Enum.AutomaticSize.None,
		Parent = banner,
	})
	local grid = Kit.Grid(CELL, { Position = UDim2.fromOffset(0, 52), Size = UDim2.new(1, 0, 1, -52), Parent = body })
	for _, item in ipairs(Clothing.Items) do
		if not item.ProductKey and not item.Starter then
			local price = (catalog and catalog.Prices and catalog.Prices[item.Id]) or item.Price or 0
			itemCell(grid, item, item.Order, function(cell)
				if owns(item) then
					footerNote(cell, "✅ Owned", Theme.Colors.Success)
					if isEquipped(item) then
						footerButton(cell, "Take off", "secondary", function()
							takeOff(item.Slot)
						end)
					else
						footerButton(cell, "Wear", "primary", function()
							wear(item)
						end)
					end
				else
					footerNote(cell, Format.Money(price), Theme.Colors.Money)
					footerButton(cell, near and ("Buy " .. Format.MoneyShort(price)) or "Visit a store", near and "success" or "ghost", function()
						if not near then
							Router.Notify("Head to a 👕 Clothing Store to buy this.", "info")
							return
						end
						buy(item, price)
					end)
				end
			end)
		end
	end
end

local function buildExclusives(body: Frame, _state)
	Kit.Label("Designer outfits, chains, watches, shades & limited sneakers. 100% style, zero stats.", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		Size = UDim2.new(1, 0, 0, 36),
		AutomaticSize = Enum.AutomaticSize.None,
		Parent = body,
	})
	local grid = Kit.Grid(CELL, { Position = UDim2.fromOffset(0, 40), Size = UDim2.new(1, 0, 1, -40), Parent = body })
	for _, item in ipairs(Clothing.Items) do
		if item.ProductKey then
			if owns(item) then
				itemCell(grid, item, item.Order, wearFooter(item))
			else
				itemCell(grid, item, 1000 + item.Order, function(cell)
					footerNote(cell, "💎 Robux exclusive", Theme.Colors.VIP)
					footerButton(cell, "View in Shop", "vip", function()
						Router.Open("Shop", { Tab = "Clothing" })
					end)
				end)
			end
		end
	end
end

local BUILDERS = {
	Wardrobe = buildWardrobe,
	Store = buildStore,
	Exclusives = buildExclusives,
}

---------------------------------------------------------------------------
-- Panel
---------------------------------------------------------------------------
local function buildPanel(content: Frame, data: any, ctx)
	local state = { tab = "Wardrobe", slot = "All", redraw = function() end }
	if type(data) == "table" and type(data.Tab) == "string" and BUILDERS[data.Tab] then
		state.tab = data.Tab
	end

	local body = Kit.new("Frame", {
		Name = "Body",
		Position = UDim2.fromOffset(0, 54),
		Size = UDim2.new(1, 0, 1, -54),
		BackgroundTransparency = 1,
		Parent = content,
	})

	local pending = false
	local function render()
		pending = false
		for _, c in ipairs(body:GetChildren()) do
			c:Destroy()
		end
		local ok, err = pcall(BUILDERS[state.tab], body, state)
		if not ok then
			warn("[ClothingController] tab build failed:", err)
		end
	end
	state.redraw = render

	-- coalesce bursts of data changes (equip sends a couple of updates)
	local function scheduleRender()
		if pending then
			return
		end
		pending = true
		task.delay(0.1, function()
			if pending and Router.IsOpen(PANEL) then
				render()
			end
		end)
	end

	local tabs = ShopWidgets.Tabs(content, TABS, function(id)
		state.tab = id
		render()
		if id == "Store" then
			task.spawn(function()
				fetch()
				if Router.IsOpen(PANEL) and state.tab == "Store" then
					scheduleRender()
				end
			end)
		end
	end, ctx.Maid)

	local alive = true
	ctx.Maid:Give(function()
		alive = false
	end)
	ctx.Maid:Give(ClientData.OnChanged("Clothing", function()
		if alive then
			scheduleRender()
		end
	end))

	task.spawn(function()
		fetch()
		if alive then
			scheduleRender()
		end
	end)
	tabs.SelectId(state.tab)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function ClothingController:Init()
	Router.Register(PANEL, {
		Title = "Wardrobe",
		Icon = "👗",
		Kind = "window",
		Size = Vector2.new(740, 600),
		Build = buildPanel,
	})
end

function ClothingController:Start()
	Router.AddHudButton("Wardrobe", "👗", "Wardrobe", Clothing.UI.HudOrder, function()
		Router.Toggle(PANEL, nil)
	end)
	ContextActionService:BindAction("SkylineWardrobeToggle", function(_, state)
		if state == Enum.UserInputState.Begin then
			Router.Toggle(PANEL, nil)
			return Enum.ContextActionResult.Sink
		end
		return Enum.ContextActionResult.Pass
	end, false, Clothing.UI.WardrobeKey)
end

return ClothingController
