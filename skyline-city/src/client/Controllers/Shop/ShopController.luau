-- ShopController: the Robux "Shop" panel (VIP & Passes, Exclusive Clothing, Cosmetics), the gold 🛍️ HUD button,
-- the VIP daily-bonus claim and the purchase celebration ("ShopCelebrate", opened by the server).
--
-- Panels: "Shop" (window; data = { Tab = "Passes"|"Clothing"|"Cosmetics" }?), "ShopCelebrate" (custom, Modal layer)
-- Keys: F2 toggles the Shop (Config.Monetization.UI.ShopKey) · L1/R1 or Q/E switch tabs · B closes.
--
-- API (client):
--   ShopController:Open(tab?)
--   ShopController:Refresh()            re-fetch the catalog (owned state) and redraw if open

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Monetization = require(Shared.Config.Monetization)
local Clothing = require(Shared.Config.Clothing)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local ShopWidgets = require(script.Parent:WaitForChild("ShopWidgets"))
local ItemPreview = require(script.Parent:WaitForChild("ItemPreview"))

local ShopController = {
	Name = "ShopController",
	Priority = 70,
}

local PANEL = "Shop"
local CELEBRATE = "ShopCelebrate"
local GOLD_TEXT = Color3.fromRGB(30, 24, 8)

local localPlayer = Players.LocalPlayer

local catalog: { [string]: any }? = nil
local redraw: (() -> ())? = nil
local hudBadge: Frame? = nil

local TABS = {
	{ Id = "Passes", Text = "👑 VIP & Passes" },
	{ Id = "Clothing", Text = "👕 Exclusive Style" },
	{ Id = "Cosmetics", Text = "🎆 Cosmetics" },
}

---------------------------------------------------------------------------
-- Data
---------------------------------------------------------------------------
local function updateBadge()
	if hudBadge then
		hudBadge.Visible = catalog ~= nil and catalog.Vip ~= nil and catalog.Vip.Claimable == true
	end
end

local function fetch(): { [string]: any }?
	local res = Net.Invoke("Shop", "GetCatalog", {})
	if res.ok and type(res.Catalog) == "table" then
		catalog = res.Catalog
		updateBadge()
	end
	return catalog
end

function ShopController:Refresh()
	task.spawn(function()
		fetch()
		if redraw and Router.IsOpen(PANEL) then
			redraw()
		end
	end)
end

function ShopController:Open(tab: string?)
	Router.Open(PANEL, { Tab = tab })
end

local function passState(key: string)
	local p = catalog and catalog.Passes and catalog.Passes[key]
	return p or { Owned = localPlayer:GetAttribute("Pass_" .. key) == true, Configured = false }
end

local function productState(key: string)
	local p = catalog and catalog.Products and catalog.Products[key]
	return p or { Owned = false, Configured = false }
end

local function canSimulate(): boolean
	return catalog ~= nil and catalog.CanSimulate == true
end

---------------------------------------------------------------------------
-- Actions
---------------------------------------------------------------------------
local function buyPass(key: string)
	local res = Net.Invoke("Shop", "PromptPass", { Key = key })
	if not res.ok then
		Router.Notify(res.err or "Couldn't open the purchase.", "error")
	end
end

local function buyProduct(key: string)
	local res = Net.Invoke("Shop", "PromptProduct", { Key = key })
	if not res.ok then
		Router.Notify(res.err or "Couldn't open the purchase.", "error")
	end
end

local function simulate(kind: string, key: string)
	local res = Net.Invoke("Shop", "SimulatePurchase", { Kind = kind, Key = key })
	if Router.Result(res) then
		ShopController:Refresh()
	end
end

local function claimDaily()
	local res = Net.Invoke("Shop", "ClaimVipDaily", {})
	if Router.Result(res) then
		ShopController:Refresh()
	end
end

---------------------------------------------------------------------------
-- Building blocks
---------------------------------------------------------------------------
local function buyButton(owned: boolean, configured: boolean, priceRobux: number, onBuy: () -> (), props: { [string]: any })
	if owned then
		local b = Kit.Button("✅ Owned", "success", nil, props)
		b.AutoButtonColor = false
		b.BackgroundTransparency = 0.25
		return b
	end
	if not configured then
		local b = Kit.Button("Not configured", "ghost", function()
			Router.Notify("This item isn't on sale yet. (Developer: paste the id into Config/Monetization.)", "info")
		end, props)
		return b
	end
	return Kit.Button(("Buy  R$ %s"):format(Format.Commas(priceRobux)), "vip", onBuy, props)
end

local function simulateButton(kind: string, key: string, order: number, parent: Instance)
	if not canSimulate() then
		return
	end
	Kit.Button("🧪 Simulate purchase (Studio)", "secondary", function()
		simulate(kind, key)
	end, { LayoutOrder = order, TextSize = Theme.TextSize.Small, Parent = parent })
end

local function vipBanner(parent: Instance, order: number)
	local vip = catalog and catalog.Vip
	local isVip = vip and vip.IsVip or localPlayer:GetAttribute("VIP") == true
	local amount = (vip and vip.Amount) or Monetization.VIP.DailyCash
	local card = Kit.Card({
		LayoutOrder = order,
		BackgroundColor3 = Theme.Colors.VIP,
		Parent = parent,
	})
	Kit.new("UIGradient", {
		Color = ColorSequence.new(Color3.fromRGB(255, 220, 110), Color3.fromRGB(255, 170, 30)),
		Rotation = 20,
		Parent = card,
	})
	Kit.List(card, 6)
	Kit.Label(isVip and "👑 VIP Daily Bonus" or "👑 VIP members get a daily cash bonus", {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		TextColor3 = GOLD_TEXT,
		LayoutOrder = 1,
		Parent = card,
	})
	if isVip then
		local claimable = vip and vip.Claimable == true
		Kit.Label(
			claimable and ("Your %s bonus is ready!"):format(Format.Money(amount))
				or ("Claimed today. Next bonus in %s."):format(Format.Duration((vip and vip.NextIn) or 0)),
			{ TextColor3 = GOLD_TEXT, LayoutOrder = 2, Parent = card }
		)
		local b = Kit.Button(claimable and (("Claim %s"):format(Format.Money(amount)) .. (Kit.IsGamepad() and "  (Y)" or "")) or "Come back tomorrow", claimable and "success" or "ghost", function()
			if claimable then
				claimDaily()
			end
		end, { LayoutOrder = 3, Parent = card })
		if claimable and Kit.IsGamepad() then
			GuiService.SelectedObject = b
		end
	else
		Kit.Label(("Join VIP to collect %s every day, plus 2x paychecks and more."):format(Format.Money(amount)), {
			TextColor3 = GOLD_TEXT,
			LayoutOrder = 2,
			Parent = card,
		})
	end
end

local function passCard(parent: Instance, pass, order: number)
	local state = passState(pass.Key)
	local color: Color3 = pass.Color or Theme.Colors.Accent
	local card = Kit.Card({ LayoutOrder = order, Parent = parent })
	Kit.Stroke(card, color, 2, state.Owned and 0 or 0.25)
	Kit.new("UIGradient", {
		Color = ColorSequence.new(color:Lerp(Theme.Colors.SurfaceAlt, 0.72), Theme.Colors.SurfaceAlt),
		Rotation = 90,
		Parent = card,
	})
	Kit.List(card, 8)

	local head = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 64), BackgroundTransparency = 1, LayoutOrder = 1, Parent = card })
	local badge = Kit.new("Frame", {
		Size = UDim2.fromOffset(64, 64),
		BackgroundColor3 = color,
		Parent = head,
	})
	Kit.Corner(badge, UDim.new(0, 16))
	Kit.Label(pass.Icon or "⭐", {
		TextSize = 36,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextYAlignment = Enum.TextYAlignment.Center,
		Size = UDim2.fromScale(1, 1),
		AutomaticSize = Enum.AutomaticSize.None,
		Parent = badge,
	})
	Kit.Label(pass.Name, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		Position = UDim2.fromOffset(76, 4),
		Size = UDim2.new(1, -170, 0, 24),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextWrapped = false,
		Parent = head,
	})
	local chipHolder = Kit.new("Frame", {
		Position = UDim2.fromOffset(76, 34),
		Size = UDim2.new(1, -76, 0, 24),
		BackgroundTransparency = 1,
		Parent = head,
	})
	Kit.List(chipHolder, 6, true)
	ShopWidgets.Chip(("R$ %d"):format(pass.PriceRobux), Theme.Colors.VIP, { LayoutOrder = 1, Parent = chipHolder })
	if state.Owned then
		ShopWidgets.Chip("✅ OWNED", Theme.Colors.Success, { LayoutOrder = 2, Parent = chipHolder })
	elseif not state.Configured then
		ShopWidgets.Chip("Not configured", Theme.Colors.Stroke, { LayoutOrder = 2, Parent = chipHolder })
	end

	Kit.Label(pass.Description, { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small, LayoutOrder = 2, Parent = card })

	local perks = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = 3,
		Parent = card,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.5, -4, 0, 24),
		CellPadding = UDim2.fromOffset(8, 2),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = perks,
	})
	for i, perk in ipairs(pass.Perks or {}) do
		Kit.Label(perk, {
			TextSize = Theme.TextSize.Small,
			AutomaticSize = Enum.AutomaticSize.None,
			TextTruncate = Enum.TextTruncate.AtEnd,
			TextWrapped = false,
			LayoutOrder = i,
			Parent = perks,
		})
	end

	buyButton(state.Owned, state.Configured, pass.PriceRobux, function()
		buyPass(pass.Key)
	end, { LayoutOrder = 4, Parent = card })
	if not state.Owned then
		simulateButton("Pass", pass.Key, 5, card)
	end
end

local function productsFor(tab: string)
	local list = {}
	for _, product in ipairs(Monetization.Products) do
		if product.Tab == tab then
			table.insert(list, product)
		end
	end
	return list
end

---------------------------------------------------------------------------
-- Tabs
---------------------------------------------------------------------------
local function buildPasses(body: Frame)
	local scroll = Kit.Scroll({ Parent = body }, 12)
	vipBanner(scroll, 1)
	local passes = table.clone(Monetization.Passes)
	table.sort(passes, function(a, b)
		return (a.Order or 0) < (b.Order or 0)
	end)
	for i, pass in ipairs(passes) do
		passCard(scroll, pass, 10 + i)
	end
	Kit.Label("Robux buys perks & style — everything important in SKYLINE CITY can be earned with cash. 💙", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 100,
		Parent = scroll,
	})
end

local function buildClothing(body: Frame)
	local grid = Kit.Grid(UDim2.fromOffset(172, 272), { Parent = body })
	Kit.new("UIPadding", { PaddingRight = UDim.new(0, 6), PaddingBottom = UDim.new(0, 8), Parent = grid })
	for i, product in ipairs(productsFor("Clothing")) do
		local item = Clothing.ById[product.ItemId]
		if item then
			local state = productState(product.Key)
			local owned = state.Owned or ClientData.Get("Clothing.Owned." .. item.Id) == true
			local rarityColor = Clothing.RarityColors[item.Rarity or ""] or Theme.Colors.AccentAlt
			local cell = Kit.new("Frame", { BackgroundColor3 = Theme.Colors.SurfaceAlt, LayoutOrder = i, Parent = grid })
			Kit.Corner(cell, Theme.CornerSmall)
			Kit.Stroke(cell, rarityColor, 2, owned and 0 or 0.35)
			local stage = Kit.new("Frame", {
				Size = UDim2.new(1, -12, 0, 112),
				Position = UDim2.fromOffset(6, 6),
				BackgroundColor3 = rarityColor:Lerp(Theme.Colors.Background, 0.75),
				Parent = cell,
			})
			Kit.Corner(stage, Theme.CornerSmall)
			ItemPreview.Create(item, { Parent = stage })
			ShopWidgets.Chip(item.Rarity or "Exclusive", rarityColor, {
				Position = UDim2.fromOffset(6, 6),
				Size = UDim2.fromOffset(0, 20),
				Parent = stage,
			})
			Kit.Label(item.Name, {
				Font = Theme.FontBold,
				TextSize = Theme.TextSize.Small + 1,
				Position = UDim2.fromOffset(8, 122),
				Size = UDim2.new(1, -16, 0, 34),
				AutomaticSize = Enum.AutomaticSize.None,
				Parent = cell,
			})
			local slotInfo = Clothing.SlotInfo[item.Slot]
			Kit.Label(("%s %s  ·  R$ %d"):format(slotInfo and slotInfo.Icon or "", slotInfo and slotInfo.Name or item.Slot, product.PriceRobux), {
				TextSize = Theme.TextSize.Small,
				TextColor3 = Theme.Colors.TextDim,
				Position = UDim2.fromOffset(8, 158),
				Size = UDim2.new(1, -16, 0, 18),
				AutomaticSize = Enum.AutomaticSize.None,
				Parent = cell,
			})
			buyButton(owned, state.Configured, product.PriceRobux, function()
				buyProduct(product.Key)
			end, {
				Position = UDim2.new(0, 8, 1, canSimulate() and not owned and -88 or -52),
				Size = UDim2.new(1, -16, 0, 44),
				Parent = cell,
			})
			if canSimulate() and not owned then
				Kit.Button("🧪 Simulate", "secondary", function()
					simulate("Product", product.Key)
				end, {
					Position = UDim2.new(0, 8, 1, -40),
					Size = UDim2.new(1, -16, 0, 34),
					TextSize = Theme.TextSize.Small,
					Parent = cell,
				})
			end
		end
	end
end

local function buildCosmetics(body: Frame)
	local scroll = Kit.Scroll({ Parent = body }, 10)
	Kit.Label("One-time cosmetic effects you can buy again and again. Visual only — no cash, no stats.", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		LayoutOrder = 0,
		Parent = scroll,
	})
	for i, product in ipairs(productsFor("Cosmetics")) do
		local state = productState(product.Key)
		local card = Kit.Card({ LayoutOrder = i, Parent = scroll })
		Kit.Stroke(card, Theme.Colors.AccentAlt, 2, 0.3)
		Kit.List(card, 8)
		local row = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 56), BackgroundTransparency = 1, LayoutOrder = 1, Parent = card })
		Kit.Label(product.Icon or "✨", {
			TextSize = 40,
			Size = UDim2.fromOffset(56, 56),
			AutomaticSize = Enum.AutomaticSize.None,
			TextXAlignment = Enum.TextXAlignment.Center,
			TextYAlignment = Enum.TextYAlignment.Center,
			Parent = row,
		})
		Kit.Label(product.Name or product.Key, {
			Font = Theme.FontBold,
			TextSize = Theme.TextSize.Heading,
			Position = UDim2.fromOffset(66, 2),
			Size = UDim2.new(1, -66, 0, 24),
			AutomaticSize = Enum.AutomaticSize.None,
			Parent = row,
		})
		ShopWidgets.Chip(("R$ %d"):format(product.PriceRobux), Theme.Colors.VIP, { Position = UDim2.fromOffset(66, 30), Parent = row })
		Kit.Label(product.Description or "", { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small, LayoutOrder = 2, Parent = card })
		buyButton(false, state.Configured, product.PriceRobux, function()
			buyProduct(product.Key)
		end, { LayoutOrder = 3, Parent = card })
		simulateButton("Product", product.Key, 4, card)
	end
end

local BUILDERS = {
	Passes = buildPasses,
	Clothing = buildClothing,
	Cosmetics = buildCosmetics,
}

---------------------------------------------------------------------------
-- Panel
---------------------------------------------------------------------------
local function buildPanel(content: Frame, data: any, ctx)
	local current = "Passes"
	if type(data) == "table" and type(data.Tab) == "string" and BUILDERS[data.Tab] then
		current = data.Tab
	end

	local body = Kit.new("Frame", {
		Name = "Body",
		Position = UDim2.fromOffset(0, 54),
		Size = UDim2.new(1, 0, 1, -54),
		BackgroundTransparency = 1,
		Parent = content,
	})

	local function render()
		for _, c in ipairs(body:GetChildren()) do
			c:Destroy()
		end
		if not catalog then
			Kit.Label("Loading the shop…", {
				TextXAlignment = Enum.TextXAlignment.Center,
				TextColor3 = Theme.Colors.TextDim,
				Position = UDim2.fromScale(0, 0.4),
				Parent = body,
			})
			return
		end
		local builder = BUILDERS[current]
		local ok, err = pcall(builder, body)
		if not ok then
			warn("[ShopController] tab build failed:", err)
		end
	end

	local tabs = ShopWidgets.Tabs(content, TABS, function(id)
		current = id
		render()
	end, ctx.Maid)
	redraw = render
	ctx.Maid:Give(function()
		if redraw == render then
			redraw = nil
		end
	end)

	tabs.SelectId(current)
	if not catalog then
		task.spawn(function()
			fetch()
			if Router.IsOpen(PANEL) and redraw == render then
				render()
			end
		end)
	else
		ShopController:Refresh()
	end

	-- gamepad Y claims the VIP daily bonus while the shop is open
	ContextActionService:BindAction("SkylineShopClaim", function(_, state)
		if state == Enum.UserInputState.Begin and catalog and catalog.Vip and catalog.Vip.Claimable then
			task.spawn(claimDaily)
			return Enum.ContextActionResult.Sink
		end
		return Enum.ContextActionResult.Pass
	end, false, Enum.KeyCode.ButtonY)
	ctx.Maid:Give(function()
		ContextActionService:UnbindAction("SkylineShopClaim")
	end)

	-- live updates when a pass or item arrives
	ctx.Maid:Give(localPlayer.AttributeChanged:Connect(function(attr)
		-- (VIP itself is handled by the always-on listener in Start)
		if attr:sub(1, 5) == "Pass_" and attr ~= "Pass_VIP" then
			ShopController:Refresh()
		end
	end))
	-- (OnChanged also fires once right away; the panel was just built, so skip that first call)
	local primed = false
	ctx.Maid:Give(ClientData.OnChanged("Clothing.Owned", function()
		if not primed then
			primed = true
			return
		end
		if current == "Clothing" then
			ShopController:Refresh()
		end
	end))
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function ShopController:Init()
	Router.Register(PANEL, {
		Title = "Skyline Shop",
		Icon = "🛍️",
		Kind = "window",
		Size = Vector2.new(780, 620),
		Build = buildPanel,
	})
	Router.Register(CELEBRATE, {
		Kind = "custom",
		Layer = "Modal",
		Build = function(root, data, ctx)
			ShopWidgets.Celebrate(root, data, ctx)
		end,
	})
end

function ShopController:Start()
	local button = Router.AddHudButton("Shop", "🛍️", "Shop", Monetization.UI.HudOrder, function()
		Router.Toggle(PANEL, nil)
	end)
	if button then
		button.BackgroundColor3 = Theme.Colors.VIP
		button.BackgroundTransparency = 0.05
		for _, child in ipairs(button:GetChildren()) do
			if child:IsA("TextLabel") then
				child.TextColor3 = GOLD_TEXT
			end
		end
		local stroke = button:FindFirstChildOfClass("UIStroke")
		if stroke then
			stroke.Color = Color3.fromRGB(255, 230, 150)
			stroke.Transparency = 0
		end
		local dot = Kit.new("Frame", {
			Name = "Badge",
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, 2, 0, -2),
			Size = UDim2.fromOffset(16, 16),
			BackgroundColor3 = Theme.Colors.Danger,
			Visible = false,
			Parent = button,
		})
		Kit.Corner(dot, UDim.new(1, 0))
		Kit.Stroke(dot, Color3.new(1, 1, 1), 2, 0)
		hudBadge = dot
	end

	ContextActionService:BindAction("SkylineShopToggle", function(_, state)
		if state == Enum.UserInputState.Begin then
			Router.Toggle(PANEL, nil)
			return Enum.ContextActionResult.Sink
		end
		return Enum.ContextActionResult.Pass
	end, false, Monetization.UI.ShopKey)

	-- keep the claim badge fresh
	localPlayer.AttributeChanged:Connect(function(attr)
		if attr == "VIP" then
			ShopController:Refresh()
		end
	end)
	task.spawn(function()
		fetch()
		while true do
			task.wait(300)
			if not Router.IsOpen(PANEL) then
				fetch()
			end
		end
	end)
end

return ShopController
