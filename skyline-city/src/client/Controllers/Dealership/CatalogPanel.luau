-- CatalogPanel: the "Dealership" window.
--   Browse page  : search, brand + class filters, sort, grid of car cards
--   Detail page  : 3D preview, stat bars, colour + finish, cash / finance calculator, trade-in, plate, Buy / Test drive
--   Loans page   : active car loans with "Pay off" buttons
-- Gamepad: L1/R1 cycle brands (browse) or colours (detail), ButtonY cycles sort, ButtonX cycles classes.
-- PC: [ / ] = previous / next, ; = sort, ' = class.
-- Every number shown is for display only — the server recomputes everything on Buy.

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local DealerCfg = require(Shared.Config.Dealership)

local Client = script:FindFirstAncestor("Client") :: Instance
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))
local ClientData = require(Client:WaitForChild("ClientData"))

local DealerUI = require(script.Parent:WaitForChild("DealerUI"))
local CarPreview = require(script.Parent:WaitForChild("CarPreview"))
local ColorPicker = require(script.Parent:WaitForChild("ColorPicker"))

local CatalogPanel = {}

local ACTION_PREV = "SkylineDealerPrev"
local ACTION_NEXT = "SkylineDealerNext"
local ACTION_SORT = "SkylineDealerSort"
local ACTION_CLASS = "SkylineDealerClass"

local function classIcon(class: string): string
	local c = string.lower(class)
	if c:find("suv") or c:find("offroad") then
		return "🚙"
	elseif c:find("truck") or c:find("pickup") then
		return "🛻"
	elseif c:find("van") or c:find("bus") then
		return "🚐"
	elseif c:find("super") or c:find("hyper") or c:find("sport") then
		return "🏎️"
	elseif c:find("electric") then
		return "⚡"
	elseif c:find("bike") or c:find("moto") then
		return "🏍️"
	end
	return "🚗"
end

local function sortCars(list: { any }, mode: string)
	table.sort(list, function(a, b)
		if mode == "PriceDesc" then
			if a.Price ~= b.Price then
				return a.Price > b.Price
			end
		elseif mode == "Speed" then
			if a.Stats.TopSpeed ~= b.Stats.TopSpeed then
				return a.Stats.TopSpeed > b.Stats.TopSpeed
			end
		elseif mode == "Power" then
			if a.Stats.Horsepower ~= b.Stats.Horsepower then
				return a.Stats.Horsepower > b.Stats.Horsepower
			end
		elseif mode == "Name" then
			if a.Name ~= b.Name then
				return a.Name < b.Name
			end
		else
			if a.Price ~= b.Price then
				return a.Price < b.Price
			end
		end
		return a.Id < b.Id
	end)
end

function CatalogPanel.Build(content: Frame, data: any, ctx)
	local maid = ctx.Maid
	local focus = type(data) == "table" and data.Focus or nil

	local state = {
		catalog = nil :: any,
		brand = "All",
		class = "All",
		sort = "PriceAsc",
		search = "",
		page = "browse",
		car = nil :: any,
		color = DealerUI.Color(DealerCfg.Colors[1].Color),
		finish = "Gloss",
		payMode = "Cash",
		payments = DealerCfg.Finance.DefaultPayments,
		tradeUid = "",
		plate = "",
	}

	local pageHolder = Kit.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Parent = content,
	})
	local pageMaid = { items = {} :: { any } }
	local function clearPage()
		for _, item in ipairs(pageMaid.items) do
			if typeof(item) == "Instance" then
				item:Destroy()
			elseif typeof(item) == "RBXScriptConnection" then
				item:Disconnect()
			elseif type(item) == "table" and type(item.Destroy) == "function" then
				item.Destroy()
			elseif type(item) == "table" and type(item.Disconnect) == "function" then
				item.Disconnect()
			end
		end
		table.clear(pageMaid.items)
		for _, c in ipairs(pageHolder:GetChildren()) do
			c:Destroy()
		end
	end
	local function track(item)
		table.insert(pageMaid.items, item)
		return item
	end
	maid:Give(clearPage)

	local stepActive: ((number) -> ())? = nil
	local sortActive: (() -> ())? = nil
	local classActive: (() -> ())? = nil

	local showBrowse, showDetail, showLoans

	local function fetch(): boolean
		local res = Net.Invoke("Dealership", "GetCatalog", {})
		if not res.ok then
			Router.Notify(res.err or "Couldn't load the catalog.", "error")
			return false
		end
		state.catalog = res
		return true
	end

	local function findCar(id: string): any
		if not state.catalog then
			return nil
		end
		for _, c in ipairs(state.catalog.Cars) do
			if c.Id == id then
				return c
			end
		end
		return nil
	end

	-- top tabs --------------------------------------------------------------
	local function tabBar(parent: Instance, active: string)
		local bar = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Parent = parent })
		Kit.List(bar, 8, true)
		local tabs = {
			{ "browse", "🚘 Showroom" },
			{ "loans", "💳 My loans" },
		}
		for i, t in ipairs(tabs) do
			Kit.Button(t[2], t[1] == active and "primary" or "secondary", function()
				if t[1] == "browse" then
					showBrowse()
				else
					showLoans()
				end
			end, { Size = UDim2.fromOffset(150, 40), LayoutOrder = i, Parent = bar })
		end
		local cash = Kit.Label("", {
			Size = UDim2.new(1, -330, 1, 0),
			AutomaticSize = Enum.AutomaticSize.None,
			TextXAlignment = Enum.TextXAlignment.Right,
			TextColor3 = Theme.Colors.Money,
			Font = Theme.FontBold,
			LayoutOrder = 10,
			Parent = bar,
		})
		local function upd()
			local c = ClientData.Get("Cash") or 0
			local b = ClientData.Get("Bank") or 0
			cash.Text = ("💵 %s  ·  🏦 %s"):format(Format.MoneyShort(c), Format.MoneyShort(b))
		end
		upd()
		track(ClientData.OnChanged("Cash", upd))
		track(ClientData.OnChanged("Bank", upd))
		return bar
	end

	---------------------------------------------------------------------------
	-- Browse
	---------------------------------------------------------------------------
	local gridRefresh: (() -> ())? = nil

	showBrowse = function()
		clearPage()
		state.page = "browse"
		local cat = state.catalog
		local root = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = pageHolder })
		tabBar(root, "browse")

		local top = Kit.new("Frame", {
			Position = UDim2.fromOffset(0, 50),
			Size = UDim2.new(1, 0, 0, 44),
			BackgroundTransparency = 1,
			Parent = root,
		})
		local search = Kit.TextBox("🔎 Search cars…", {
			Text = state.search,
			Size = UDim2.new(0.34, -8, 1, 0),
			Parent = top,
		})
		local sortItems = {}
		for _, o in ipairs(DealerCfg.SortOptions) do
			table.insert(sortItems, { Id = o.Id, Text = o.Name })
		end
		local sortRow = DealerUI.ChipRow(sortItems, state.sort, function(id)
			state.sort = id
			if gridRefresh then
				gridRefresh()
			end
		end, { Position = UDim2.new(0.34, 0, 0, 0), Size = UDim2.new(0.66, 0, 1, 0), Parent = top })

		local brandItems = { { Id = "All", Text = "All brands" } }
		local brandIds = {}
		for id in pairs(cat.Brands or {}) do
			table.insert(brandIds, id)
		end
		table.sort(brandIds, function(a, b)
			return tostring(cat.Brands[a].Name) < tostring(cat.Brands[b].Name)
		end)
		for _, id in ipairs(brandIds) do
			local b = cat.Brands[id]
			table.insert(brandItems, { Id = id, Text = (b.Badge and b.Badge ~= "" and (b.Badge .. " ") or "") .. b.Name })
		end
		local brandRow = DealerUI.ChipRow(brandItems, state.brand, function(id)
			state.brand = id
			if gridRefresh then
				gridRefresh()
			end
		end, { Position = UDim2.fromOffset(0, 100), Parent = root })

		local classItems = { { Id = "All", Text = "All classes" } }
		for _, c in ipairs(cat.Classes or {}) do
			table.insert(classItems, { Id = c, Text = classIcon(c) .. " " .. c })
		end
		local classRow = DealerUI.ChipRow(classItems, state.class, function(id)
			state.class = id
			if gridRefresh then
				gridRefresh()
			end
		end, { Position = UDim2.fromOffset(0, 148), Parent = root })

		local grid = Kit.Grid(UDim2.fromOffset(200, 150), {
			Position = UDim2.fromOffset(0, 198),
			Size = UDim2.new(1, 0, 1, -198),
			Parent = root,
		})
		local layout = grid:FindFirstChildOfClass("UIGridLayout")
		local function fitCells()
			if not layout then
				return
			end
			local w = grid.AbsoluteSize.X - 10
			local cols = math.max(2, math.floor(w / 190))
			local cellW = math.floor((w - (cols - 1) * 8) / cols)
			layout.CellSize = UDim2.fromOffset(cellW, 150)
		end
		track(grid:GetPropertyChangedSignal("AbsoluteSize"):Connect(fitCells))
		task.defer(fitCells)

		local empty = Kit.Label("No cars match those filters.", {
			Position = UDim2.fromOffset(0, 210),
			TextColor3 = Theme.Colors.TextDim,
			TextXAlignment = Enum.TextXAlignment.Center,
			Visible = false,
			Parent = root,
		})

		gridRefresh = function()
			for _, c in ipairs(grid:GetChildren()) do
				if c:IsA("GuiObject") then
					c:Destroy()
				end
			end
			local list = {}
			local q = string.lower(state.search)
			for _, car in ipairs(cat.Cars) do
				local okBrand = state.brand == "All" or car.Brand == state.brand
				local okClass = state.class == "All" or car.Class == state.class
				local okSearch = q == ""
					or string.find(string.lower(car.Name), q, 1, true) ~= nil
					or string.find(string.lower(car.BrandName or ""), q, 1, true) ~= nil
				if okBrand and okClass and okSearch then
					table.insert(list, car)
				end
			end
			sortCars(list, state.sort)
			empty.Visible = #list == 0
			for i, car in ipairs(list) do
				local card = Kit.new("TextButton", {
					Text = "",
					BackgroundColor3 = Theme.Colors.SurfaceAlt,
					AutoButtonColor = true,
					LayoutOrder = i,
					Parent = grid,
				})
				Kit.Corner(card, Theme.CornerSmall)
				Kit.Stroke(card, car.VipOnly and Theme.Colors.VIP or Theme.Colors.Stroke, car.VipOnly and 2 or 1, car.VipOnly and 0.1 or 0.4)
				Kit.Padding(card, 10)
				Kit.Ripple(card)
				Kit.Label(classIcon(car.Class), { TextSize = 34, Size = UDim2.new(1, 0, 0, 40), AutomaticSize = Enum.AutomaticSize.None, Parent = card })
				Kit.Label(("%s %s"):format(car.BrandBadge or "", car.BrandName or ""), {
					Position = UDim2.fromOffset(0, 42),
					Size = UDim2.new(1, 0, 0, 16),
					AutomaticSize = Enum.AutomaticSize.None,
					TextSize = 12,
					TextColor3 = Theme.Colors.TextDim,
					TextTruncate = Enum.TextTruncate.AtEnd,
					Parent = card,
				})
				Kit.Label(car.Name, {
					Position = UDim2.fromOffset(0, 58),
					Size = UDim2.new(1, 0, 0, 22),
					AutomaticSize = Enum.AutomaticSize.None,
					Font = Theme.FontBold,
					TextTruncate = Enum.TextTruncate.AtEnd,
					Parent = card,
				})
				Kit.Label(("⚡ %d hp  ·  🏁 %d mph"):format(car.Stats.Horsepower, car.Stats.TopSpeed), {
					Position = UDim2.fromOffset(0, 82),
					Size = UDim2.new(1, 0, 0, 16),
					AutomaticSize = Enum.AutomaticSize.None,
					TextSize = 12,
					TextColor3 = Theme.Colors.TextDim,
					Parent = card,
				})
				Kit.Label(Format.Money(car.Price), {
					AnchorPoint = Vector2.new(0, 1),
					Position = UDim2.fromScale(0, 1),
					Size = UDim2.new(1, 0, 0, 22),
					AutomaticSize = Enum.AutomaticSize.None,
					Font = Theme.FontBold,
					TextColor3 = Theme.Colors.Money,
					Parent = card,
				})
				if car.VipOnly then
					Kit.Label(car.Locked and "👑 VIP 🔒" or "👑 VIP", {
						AnchorPoint = Vector2.new(1, 0),
						Position = UDim2.fromScale(1, 0),
						Size = UDim2.fromOffset(90, 20),
						AutomaticSize = Enum.AutomaticSize.None,
						TextSize = 12,
						Font = Theme.FontBold,
						TextColor3 = Theme.Colors.VIP,
						TextXAlignment = Enum.TextXAlignment.Right,
						Parent = card,
					})
				end
				card.Activated:Connect(function()
					showDetail(car.Id)
				end)
			end
		end

		track(search:GetPropertyChangedSignal("Text"):Connect(function()
			state.search = search.Text
			if gridRefresh then
				gridRefresh()
			end
		end))
		gridRefresh()

		stepActive = function(dir)
			brandRow.Step(dir)
		end
		sortActive = function()
			sortRow.Step(1)
		end
		classActive = function()
			classRow.Step(1)
		end
	end

	---------------------------------------------------------------------------
	-- Detail
	---------------------------------------------------------------------------
	showDetail = function(modelId: string)
		local car = findCar(modelId)
		if not car then
			showBrowse()
			return
		end
		clearPage()
		gridRefresh = nil
		state.page = "detail"
		if state.car ~= car and type(car.DefaultColor) == "table" then
			state.color = DealerUI.Color(car.DefaultColor)
		end
		state.car = car
		local cat = state.catalog

		local root = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = pageHolder })

		-- header
		local header = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Parent = root })
		Kit.Button("← Back", "secondary", function()
			showBrowse()
		end, { Size = UDim2.fromOffset(100, 40), Parent = header })
		Kit.Label(("%s <b>%s</b>"):format(car.BrandName or "", car.Name), {
			Position = UDim2.fromOffset(112, 0),
			Size = UDim2.new(1, -112, 1, 0),
			AutomaticSize = Enum.AutomaticSize.None,
			TextSize = Theme.TextSize.Heading,
			TextYAlignment = Enum.TextYAlignment.Center,
			TextTruncate = Enum.TextTruncate.AtEnd,
			Parent = header,
		})

		-- left column: preview + stats
		local left = Kit.new("Frame", {
			Position = UDim2.fromOffset(0, 52),
			Size = UDim2.new(0.46, -6, 1, -52),
			BackgroundTransparency = 1,
			Parent = root,
		})
		local preview = track(CarPreview.new(left, { Size = UDim2.new(1, 0, 0.55, 0) }))
		preview.Show(car.Id, car.Class, state.color, state.finish)

		local stats = Kit.new("Frame", {
			Position = UDim2.new(0, 0, 0.55, 8),
			Size = UDim2.new(1, 0, 0.45, -8),
			BackgroundTransparency = 1,
			Parent = left,
		})
		Kit.List(stats, 2)
		local bars = DealerCfg.StatBars
		DealerUI.StatBar("Horsepower", car.Stats.Horsepower, bars.Horsepower, ("%d hp"):format(car.Stats.Horsepower), 1, stats)
		DealerUI.StatBar("Top speed", car.Stats.TopSpeed, bars.TopSpeed, ("%d mph"):format(car.Stats.TopSpeed), 2, stats)
		DealerUI.StatBar("0-60", car.Stats.ZeroToSixty, bars.ZeroToSixty, ("%.1fs"):format(car.Stats.ZeroToSixty), 3, stats, true)
		DealerUI.StatBar("Seats", car.Seats, bars.Seats, tostring(car.Seats), 4, stats)
		local tags = { car.Class }
		if car.Electric then
			table.insert(tags, "⚡ Electric")
		end
		if car.Stats.Drivetrain then
			table.insert(tags, car.Stats.Drivetrain)
		end
		for k, v in pairs(car.Features or {}) do
			if v == true then
				table.insert(tags, k)
			end
		end
		Kit.Label(table.concat(tags, "  ·  "), {
			TextSize = 12,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = 5,
			Parent = stats,
		})

		-- right column: options
		local right = Kit.Scroll({
			Position = UDim2.new(0.46, 6, 0, 52),
			Size = UDim2.new(0.54, -6, 1, -52),
			Parent = root,
		}, 8)

		local order = 0
		local function nextOrder()
			order += 1
			return order
		end

		if car.Description ~= "" then
			Kit.Label(car.Description, { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small + 1, LayoutOrder = nextOrder(), Parent = right })
		end
		if car.VipOnly and car.Locked then
			Kit.Label("👑 This car needs the VIP pass to buy. You can still test drive it!", {
				TextColor3 = Theme.Colors.VIP,
				Font = Theme.FontBold,
				LayoutOrder = nextOrder(),
				Parent = right,
			})
		end

		-- forward declare summary refresh
		local refreshSummary: () -> () = function() end

		-- colour
		DealerUI.Section("🎨 Colour", nextOrder(), right)
		local picker: any = nil
		local swatchList = {}
		for _, sw in ipairs(DealerCfg.Colors) do
			table.insert(swatchList, sw)
		end
		DealerUI.Swatches(swatchList, function(c)
			state.color = c
			preview.SetPaint(state.color, state.finish)
			if picker then
				picker.Set(c, true)
			end
		end, nextOrder(), right)
		local customOrder = nextOrder()
		local pickerOrder = nextOrder()
		local customBtn
		customBtn = Kit.Button("🎨 Custom colour…", "ghost", function()
			if picker then
				picker.Destroy()
				picker = nil
				customBtn.Text = "🎨 Custom colour…"
				return
			end
			customBtn.Text = "Hide colour picker"
			picker = ColorPicker.new(right, state.color, function(c)
				state.color = c
				preview.SetPaint(state.color, state.finish)
			end, pickerOrder)
			track(picker)
		end, { LayoutOrder = customOrder, Parent = right })

		-- finish
		DealerUI.Section("✨ Finish", nextOrder(), right)
		local finishItems = {}
		for _, f in ipairs(cat.Finishes or {}) do
			local extra = (f.Extra or 0) > 0 and (" +" .. Format.MoneyShort(f.Extra)) or ""
			table.insert(finishItems, { Id = f.Id, Text = f.Name .. extra })
		end
		DealerUI.ChipRow(finishItems, state.finish, function(id)
			state.finish = id
			preview.SetPaint(state.color, state.finish)
			refreshSummary()
		end, { LayoutOrder = nextOrder(), Parent = right })

		-- trade-in
		DealerUI.Section("🔁 Trade-in", nextOrder(), right)
		local tradeItems = { { Id = "", Text = "No trade-in" } }
		for _, t in ipairs(cat.TradeIns or {}) do
			if t.Eligible then
				table.insert(tradeItems, { Id = t.Uid, Text = ("%s (+%s)"):format(t.Name, Format.MoneyShort(t.Credit)) })
			end
		end
		if state.tradeUid ~= "" then
			local still = false
			for _, it in ipairs(tradeItems) do
				if it.Id == state.tradeUid then
					still = true
				end
			end
			if not still then
				state.tradeUid = ""
			end
		end
		DealerUI.ChipRow(tradeItems, state.tradeUid, function(id)
			state.tradeUid = id
			refreshSummary()
		end, { LayoutOrder = nextOrder(), Parent = right })
		if #tradeItems == 1 and #(cat.TradeIns or {}) > 0 then
			Kit.Label("Your cars can't be traded in right now (loans above their value, or you're sitting in them).", {
				TextSize = 12,
				TextColor3 = Theme.Colors.TextDim,
				LayoutOrder = nextOrder(),
				Parent = right,
			})
		end

		-- payment
		DealerUI.Section("💳 Payment", nextOrder(), right)
		local fin = cat.Finance or {}
		local canFinance = car.Price >= DealerCfg.Finance.MinCarPrice and DealerCfg.Finance.Enabled
		local payItems = { { Id = "Cash", Text = "💵 Pay in full" } }
		if canFinance then
			table.insert(payItems, { Id = "Finance", Text = "🏦 Finance" })
		else
			state.payMode = "Cash"
		end
		local paymentsRowHolder = Kit.new("Frame", {
			Size = UDim2.new(1, 0, 0, 48),
			BackgroundTransparency = 1,
			LayoutOrder = 0,
			Visible = state.payMode == "Finance",
		})
		DealerUI.ChipRow(payItems, state.payMode, function(id)
			state.payMode = id
			paymentsRowHolder.Visible = id == "Finance"
			refreshSummary()
		end, { LayoutOrder = nextOrder(), Parent = right })
		paymentsRowHolder.LayoutOrder = nextOrder()
		paymentsRowHolder.Parent = right
		local payOpts = {}
		for _, n in ipairs(DealerCfg.Finance.PaymentOptions) do
			table.insert(payOpts, { Id = n, Text = ("%d days"):format(n) })
		end
		DealerUI.ChipRow(payOpts, state.payments, function(n)
			state.payments = n
			refreshSummary()
		end, { Parent = paymentsRowHolder })

		-- plate
		DealerUI.Section("🔤 Plate (optional)", nextOrder(), right)
		local plateBox = Kit.TextBox(("Up to %d letters / numbers"):format(DealerCfg.PlateMaxLength), {
			Text = state.plate,
			LayoutOrder = nextOrder(),
			Font = Theme.FontMono,
			Parent = right,
		})
		track(plateBox:GetPropertyChangedSignal("Text"):Connect(function()
			local t = string.upper(plateBox.Text):gsub("[^A-Z0-9 ]", "")
			t = t:sub(1, DealerCfg.PlateMaxLength)
			if t ~= plateBox.Text then
				plateBox.Text = t
			end
			state.plate = t
		end))

		-- summary card
		local summary = Kit.Card({ LayoutOrder = nextOrder(), BackgroundColor3 = Theme.Colors.Background, Parent = right })
		Kit.List(summary, 2)

		local buyBtn
		refreshSummary = function()
			for _, c in ipairs(summary:GetChildren()) do
				if c:IsA("GuiObject") then
					c:Destroy()
				end
			end
			local extra = 0
			for _, f in ipairs(cat.Finishes or {}) do
				if f.Id == state.finish then
					extra = f.Extra or 0
				end
			end
			local price = car.Price + extra
			local credit = 0
			for _, t in ipairs(cat.TradeIns or {}) do
				if t.Uid == state.tradeUid then
					credit = t.Credit
				end
			end
			DealerUI.KeyValue("Price", Format.Money(price), 1, summary)
			if credit > 0 then
				DealerUI.KeyValue("Trade-in credit", "−" .. Format.Money(credit), 2, summary, Theme.Colors.Success)
			end
			local dueText
			if state.payMode == "Finance" then
				local q = DealerCfg.Quote(price, credit, state.payments)
				if q.Financed <= 0 then
					dueText = Format.Money(math.max(0, price - credit))
					DealerUI.KeyValue("Trade-in covers the car", "No loan needed", 3, summary, Theme.Colors.Success)
				else
					DealerUI.KeyValue(("Down payment (%s)"):format(Format.Percent(DealerCfg.Finance.DownPaymentPct)), Format.Money(q.Down), 3, summary)
					DealerUI.KeyValue("Financed", Format.Money(q.Financed), 4, summary)
					DealerUI.KeyValue(("Interest (%s flat)"):format(Format.Percent(DealerCfg.Finance.InterestPct)), Format.Money(q.TotalOwed - q.Financed), 5, summary)
					DealerUI.KeyValue("Daily payment", ("%s × %d days"):format(Format.Money(q.Payment), q.Payments), 6, summary, Theme.Colors.Warning)
					DealerUI.KeyValue("Total cost", Format.Money(q.Down + q.TotalOwed + credit), 7, summary)
					local avail = fin.Available or 0
					local over = q.TotalOwed > avail
					local slots = (fin.Count or 0) >= (fin.MaxCars or 0)
					DealerUI.KeyValue("Available credit", Format.Money(avail), 8, summary, over and Theme.Colors.Danger or Theme.Colors.TextDim)
					if slots then
						Kit.Label(("You already have %d financed cars (max %d)."):format(fin.Count or 0, fin.MaxCars or 0), {
							TextSize = 12,
							TextColor3 = Theme.Colors.Danger,
							LayoutOrder = 9,
							Parent = summary,
						})
					end
					Kit.Label(("Payments are charged once per in-game day from wallet, then bank. %d missed = repossession."):format(DealerCfg.Finance.MissedLimit), {
						TextSize = 12,
						TextColor3 = Theme.Colors.TextDim,
						LayoutOrder = 10,
						Parent = summary,
					})
					dueText = Format.Money(q.Down)
				end
			else
				local due = price - credit
				if due < 0 then
					dueText = "You receive " .. Format.Money(-due)
				else
					dueText = Format.Money(due)
				end
			end
			DealerUI.KeyValue("<b>Due now</b>", dueText, 20, summary, Theme.Colors.Money)
			if buyBtn then
				local locked = car.Locked == true
				buyBtn.Text = locked and "👑 VIP only" or (state.payMode == "Finance" and "Finance & buy" or "Buy now")
				buyBtn.BackgroundColor3 = locked and Theme.Colors.VIP or Theme.Colors.Success
			end
		end

		-- actions
		local actions = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = nextOrder(), Parent = right })
		buyBtn = Kit.Button("Buy now", "success", function()
			if car.Locked then
				Router.Notify("👑 This car is VIP only. Get VIP in the shop!", "warning")
				return
			end
			local verb = state.payMode == "Finance" and "Finance" or "Buy"
			if not Router.Confirm(("%s %s?"):format(verb, car.Name), "The final price is confirmed by the dealership.", verb) then
				return
			end
			local res = Net.Invoke("Dealership", "Buy", {
				ModelId = car.Id,
				Color = DealerUI.ToTable(state.color),
				Finish = state.finish,
				PayMode = state.payMode,
				Payments = state.payMode == "Finance" and state.payments or nil,
				TradeInUid = state.tradeUid ~= "" and state.tradeUid or nil,
				Plate = state.plate ~= "" and state.plate or nil,
			})
			if Router.Result(res) then
				state.tradeUid = ""
				state.plate = ""
				if fetch() then
					showDetail(car.Id)
				end
			end
		end, { Size = UDim2.new(0.5, -4, 1, 0), Parent = actions })
		local cd = cat.TestDrive and cat.TestDrive.CooldownLeft or 0
		Kit.Button(("🏁 Test drive (%ds)"):format(cat.TestDrive and cat.TestDrive.Seconds or 90), "primary", function()
			local res = Net.Invoke("Dealership", "TestDrive", { ModelId = car.Id })
			if Router.Result(res) then
				ctx.Close()
			end
		end, { Size = UDim2.new(0.5, -4, 1, 0), Position = UDim2.new(0.5, 4, 0, 0), Parent = actions })
		if cd > 0 then
			Kit.Label(("Next test drive in %ds"):format(cd), {
				TextSize = 12,
				TextColor3 = Theme.Colors.TextDim,
				TextXAlignment = Enum.TextXAlignment.Right,
				LayoutOrder = nextOrder(),
				Parent = right,
			})
		end
		Kit.Label(("Garage: %d / %d cars"):format(cat.Owned or 0, cat.MaxOwned or 0), {
			TextSize = 12,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = nextOrder(),
			Parent = right,
		})
		refreshSummary()

		if Kit.IsGamepad() then
			GuiService.SelectedObject = buyBtn
		end

		local colorIdx = 1
		stepActive = function(dir)
			colorIdx = ((colorIdx - 1 + dir) % #DealerCfg.Colors) + 1
			state.color = DealerUI.Color(DealerCfg.Colors[colorIdx].Color)
			preview.SetPaint(state.color, state.finish)
			if picker then
				picker.Set(state.color, true)
			end
		end
		sortActive = nil
		classActive = nil
	end

	---------------------------------------------------------------------------
	-- Loans
	---------------------------------------------------------------------------
	showLoans = function()
		clearPage()
		gridRefresh = nil
		state.page = "loans"
		stepActive, sortActive, classActive = nil, nil, nil
		local root = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = pageHolder })
		tabBar(root, "loans")
		local list = Kit.Scroll({ Position = UDim2.fromOffset(0, 52), Size = UDim2.new(1, 0, 1, -52), Parent = root })
		local loading = Kit.Label("Loading…", { TextColor3 = Theme.Colors.TextDim, Parent = list })
		local res = Net.Invoke("Dealership", "GetFinance", {})
		if not list.Parent then
			return
		end
		loading:Destroy()
		if not res.ok then
			Kit.Label(res.err or "Couldn't load loans.", { TextColor3 = Theme.Colors.Danger, Parent = list })
			return
		end
		local f = res.Finance
		local head = Kit.Card({ LayoutOrder = 1, Parent = list })
		Kit.List(head, 2)
		DealerUI.KeyValue("Credit limit", Format.Money(f.CreditLimit), 1, head)
		DealerUI.KeyValue("Outstanding", Format.Money(f.Outstanding), 2, head, Theme.Colors.Warning)
		DealerUI.KeyValue("Available credit", Format.Money(f.Available), 3, head, Theme.Colors.Success)
		DealerUI.KeyValue("Financed cars", ("%d / %d"):format(f.Count, f.MaxCars), 4, head)
		Kit.Label("Your credit limit grows with your net worth.", { TextSize = 12, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 5, Parent = head })
		if #f.Loans == 0 then
			Kit.Label("No active loans. 🎉", { LayoutOrder = 2, TextColor3 = Theme.Colors.TextDim, Parent = list })
		end
		for i, loan in ipairs(f.Loans) do
			local card = Kit.Card({ LayoutOrder = 10 + i, Parent = list })
			Kit.List(card, 4)
			Kit.Label("🚗 <b>" .. tostring(loan.Name) .. "</b>", { LayoutOrder = 1, Parent = card })
			DealerUI.KeyValue("Remaining", Format.Money(loan.Remaining), 2, card)
			DealerUI.KeyValue("Daily payment", ("%s (%d left)"):format(Format.Money(loan.Payment or 0), loan.PaymentsLeft or 0), 3, card)
			if (loan.Missed or 0) > 0 then
				DealerUI.KeyValue("Missed", ("%d / %d"):format(loan.Missed, f.MissedLimit or 3), 4, card, Theme.Colors.Danger)
			end
			Kit.Button(("Pay off %s"):format(Format.Money(loan.Remaining)), "success", function()
				if not Router.Confirm("Pay off loan?", ("Pay %s now (wallet, then bank)?"):format(Format.Money(loan.Remaining)), "Pay off") then
					return
				end
				local r = Net.Invoke("Dealership", "PayFinanceEarly", { Uid = loan.Uid })
				if Router.Result(r, "Loan paid off! 🎉") then
					fetch()
					showLoans()
				end
			end, { LayoutOrder = 5, Parent = card })
		end
	end

	---------------------------------------------------------------------------
	-- Input
	---------------------------------------------------------------------------
	ContextActionService:BindAction(ACTION_PREV, function(_, st)
		if st == Enum.UserInputState.Begin and stepActive then
			stepActive(-1)
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.ButtonL1, Enum.KeyCode.LeftBracket)
	ContextActionService:BindAction(ACTION_NEXT, function(_, st)
		if st == Enum.UserInputState.Begin and stepActive then
			stepActive(1)
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.ButtonR1, Enum.KeyCode.RightBracket)
	ContextActionService:BindAction(ACTION_SORT, function(_, st)
		if st == Enum.UserInputState.Begin and sortActive then
			sortActive()
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.ButtonY, Enum.KeyCode.Semicolon)
	ContextActionService:BindAction(ACTION_CLASS, function(_, st)
		if st == Enum.UserInputState.Begin and classActive then
			classActive()
			return Enum.ContextActionResult.Sink
		end
		return Enum.ContextActionResult.Pass
	end, false, Enum.KeyCode.ButtonX, Enum.KeyCode.Quote)
	maid:Give(function()
		ContextActionService:UnbindAction(ACTION_PREV)
		ContextActionService:UnbindAction(ACTION_NEXT)
		ContextActionService:UnbindAction(ACTION_SORT)
		ContextActionService:UnbindAction(ACTION_CLASS)
	end)

	-- live refresh when cars are bought / sold / repossessed elsewhere. Vehicles.* also changes for fuel,
	-- mileage and health saves, so only react when the SET of owned cars (or a loan) actually changes.
	local function garageSignature(vehicles: any): string
		if type(vehicles) ~= "table" then
			return ""
		end
		local keys = {}
		for uid, car in pairs(vehicles) do
			local f = type(car) == "table" and car.Finance or nil
			local loan = type(f) == "table" and tostring(f.Remaining) or "-"
			table.insert(keys, tostring(uid) .. ":" .. loan)
		end
		table.sort(keys)
		return table.concat(keys, ",")
	end
	local pending = false
	local lastSignature = garageSignature(ClientData.Get("Vehicles"))
	maid:Give(ClientData.OnChanged("Vehicles", function(vehicles)
		local sig = garageSignature(vehicles)
		if sig == lastSignature then
			return
		end
		lastSignature = sig
		if pending or not state.catalog then
			return
		end
		pending = true
		task.delay(1, function()
			pending = false
			if not pageHolder.Parent or state.page ~= "browse" then
				return
			end
			if fetch() and pageHolder.Parent and state.page == "browse" then
				showBrowse()
			end
		end)
	end))

	-- initial load
	local loading = Kit.Label("Loading showroom…", {
		Position = UDim2.fromOffset(0, 20),
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		Parent = pageHolder,
	})
	task.spawn(function()
		local ok = fetch()
		if not pageHolder.Parent then
			return
		end
		loading:Destroy()
		if not ok then
			Kit.Label("The showroom is unavailable right now.", {
				Position = UDim2.fromOffset(0, 20),
				TextColor3 = Theme.Colors.Danger,
				TextXAlignment = Enum.TextXAlignment.Center,
				Parent = pageHolder,
			})
			return
		end
		if #state.catalog.Cars == 0 then
			Kit.Label("No cars in stock yet. Check back soon!", {
				Position = UDim2.fromOffset(0, 20),
				TextColor3 = Theme.Colors.TextDim,
				TextXAlignment = Enum.TextXAlignment.Center,
				Parent = pageHolder,
			})
			return
		end
		if focus and findCar(focus) then
			showDetail(focus)
		else
			showBrowse()
		end
	end)
end

return CatalogPanel
