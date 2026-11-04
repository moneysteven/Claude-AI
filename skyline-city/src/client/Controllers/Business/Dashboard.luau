-- Dashboard (client helper): builds the "Business" panel.
--   Dashboard.Build(content, data, ctx)   data = { BizId? , LotId? }  (Router panel Build function)
-- Owners see one tab per business (overview, vault, revenue bars, stock, prices, upgrades, staff, employees,
-- open/close, decorate, sell). Everyone gets a "Start a Business" tab (StartFlow) and, when employed, "My Job".
-- Saved numbers come from ClientData (Businesses.<id>); runtime numbers (customers/min, stations, caps) from
-- Business.GetState, polled while the panel is open.

local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Businesses)
local EconomyConfig = require(Shared.Config.Economy)

local Client = script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))
local Kit = require(Client.UI:WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local W = require(script.Parent.BizWidgets)
local StartFlow = require(script.Parent.StartFlow)

local Dashboard = {}

local player = Players.LocalPlayer
local POLL_SECONDS = 6

local function num(v: any): number
	if type(v) == "number" and v == v then
		return v
	end
	return 0
end

local function ownedList()
	local out = {}
	local all = ClientData.Get("Businesses")
	if type(all) == "table" then
		for id, rec in pairs(all) do
			if type(rec) == "table" and Config.Types[rec.TypeId] then
				table.insert(out, { Id = id, Rec = rec })
			end
		end
	end
	table.sort(out, function(a, b)
		return a.Id < b.Id
	end)
	return out
end

local function setGps(pos: Vector3?, label: string)
	if typeof(pos) ~= "Vector3" then
		Router.Notify("This business has no lot in this server yet", "warning")
		return
	end
	local phone = Registry.Find("PhoneController")
	if phone and type(phone.SetWaypoint) == "function" and pcall(phone.SetWaypoint, phone, pos, label) then
		Router.Notify("📍 GPS set to " .. label, "info", 3)
	else
		Router.Notify("GPS isn't available right now", "warning")
	end
end

local function priceOf(rec, product): number
	local p = type(rec.Prices) == "table" and rec.Prices[product.Id] or nil
	if type(p) == "number" then
		return p
	end
	return product.Price
end

function Dashboard.Build(content: Frame, data: any, ctx)
	local alive = true
	local server: any = nil
	local selected: string? = type(data) == "table" and type(data.BizId) == "string" and data.BizId or nil
	local preselectLot: string? = type(data) == "table" and type(data.LotId) == "string" and data.LotId or nil
	local pendingPrices: { [string]: { [string]: number } } = {}
	local hire = { UserId = nil :: number?, Role = nil :: string?, Wage = nil :: number? }
	local renderQueued = false
	local startRendered = false -- the Start flow keeps its own state; only full-render it when (re)entering the tab
	local pendingSelect: string? = nil -- business just bought; selected as soon as its record reaches ClientData

	if preselectLot then
		selected = "_start"
	end

	local tabs = Kit.new("ScrollingFrame", {
		Size = UDim2.new(1, 0, 0, 50),
		BackgroundTransparency = 1,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.X,
		ScrollingDirection = Enum.ScrollingDirection.X,
		ScrollBarThickness = 2,
		BorderSizePixel = 0,
		Parent = content,
	})
	Kit.List(tabs, 6, true)
	local body = Kit.Scroll({
		Position = UDim2.fromOffset(0, 58),
		Size = UDim2.new(1, 0, 1, -58),
		Parent = content,
	}, 10)

	local render

	local function queueRender()
		if renderQueued then
			return
		end
		renderQueued = true
		task.delay(0.2, function()
			renderQueued = false
			if alive then
				render()
			end
		end)
	end

	local function refresh()
		local res = Net.Invoke("Business", "GetState", {})
		if not alive then
			return
		end
		if res.ok then
			server = res
			queueRender()
		end
	end

	local function invoke(action: string, payload, successText: string?): any
		local res = Net.Invoke("Business", action, payload)
		Router.Result(res, successText)
		task.spawn(refresh)
		return res
	end

	-----------------------------------------------------------------------
	-- Tabs
	-----------------------------------------------------------------------
	local function renderTabs(list)
		W.Clear(tabs)
		local function tab(id: string, text: string, order: number)
			local active = selected == id
			local b = Kit.Button(text, active and "primary" or "secondary", function()
				selected = id
				hire.UserId = nil
				startRendered = false
				render()
			end, {
				Size = UDim2.fromOffset(0, 44),
				AutomaticSize = Enum.AutomaticSize.X,
				TextWrapped = false,
				LayoutOrder = order,
				TextSize = Theme.TextSize.Small + 1,
				Parent = tabs,
			})
			Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14), Parent = b })
		end
		for i, entry in ipairs(list) do
			local t = Config.Types[entry.Rec.TypeId]
			local name = type(entry.Rec.Name) == "string" and entry.Rec.Name or t.Name
			if #name > 18 then
				name = name:sub(1, 17) .. "…"
			end
			tab(entry.Id, ("%s %s"):format(t.Icon, name), i)
		end
		if server and server.Employer then
			tab("_job", "💼 My Job", 50)
		end
		tab("_start", "➕ Start", 60)
	end

	-----------------------------------------------------------------------
	-- My Job (employee) view
	-----------------------------------------------------------------------
	local function renderJob()
		local e = server and server.Employer
		local card = W.Section(body, "💼 My Business Job", 1)
		if not e then
			W.Text(card, "You don't work at a player business. Owners can hire you from their Business panel.", 1, { TextColor3 = Theme.Colors.TextDim })
			return
		end
		local role = Config.Roles[e.Role]
		local t = Config.Types[e.TypeId]
		W.Text(card, ("%s <b>%s</b> · owned by %s"):format(t and t.Icon or "🏪", e.BizName, e.OwnerName), 1)
		W.Text(card, ("Role: %s %s · Wage: <font color=\"#58D678\">%s per task</font> · %s"):format(
			role and role.Icon or "",
			role and role.Name or e.Role,
			Format.Money(num(e.Wage)),
			e.Open and "🟢 Open" or "🔴 Closed"
		), 2)
		if role then
			local names = {}
			for _, fn in ipairs(role.Stations) do
				table.insert(names, Config.FunctionNames[fn] or fn)
			end
			W.Text(card, ("Work at: %s. Use the work button on screen (F / 🎮 Y) when you're next to one."):format(table.concat(names, ", ")), 3, {
				TextColor3 = Theme.Colors.TextDim,
				TextSize = Theme.TextSize.Small + 1,
			})
		end
		local row = W.Flow(card, 4)
		W.Button(row, "📍 GPS", "secondary", function()
			setGps(e.Position, e.BizName)
		end, 120)
		W.Button(row, "Quit job", "danger", function()
			if Router.Confirm("Quit your job?", ("You'll stop working at %s."):format(e.BizName), "Quit") then
				invoke("QuitJob", {}, "You quit your job")
			end
		end, 140)
	end

	-----------------------------------------------------------------------
	-- Business view
	-----------------------------------------------------------------------
	local function renderBusiness(bizId: string, rec)
		local t = Config.Types[rec.TypeId]
		local info = server and server.Businesses and server.Businesses[bizId] or nil
		local order = 0
		local function nextOrder()
			order += 1
			return order
		end

		-- Header ------------------------------------------------------------
		local head = W.Section(body, nil, nextOrder())
		local name = type(rec.Name) == "string" and rec.Name or t.Name
		W.Text(head, ("%s <b>%s</b>"):format(t.Icon, name), 1, { Font = Theme.FontBold, TextSize = Theme.TextSize.Title - 2 })
		local level = math.max(1, math.floor(num(rec.Level)))
		local lvlText = ("%s · Level %d"):format(t.Name, level)
		if info and info.NextLevelAt then
			lvlText ..= (" · next at %s lifetime"):format(Format.MoneyShort(info.NextLevelAt))
		end
		W.Text(head, lvlText, 2, { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small + 1 })
		local headRow = W.Flow(head, 3)
		local isOpen = rec.Open == true
		W.Button(headRow, isOpen and "🟢 Open — tap to close" or "🔴 Closed — tap to open", isOpen and "success" or "secondary", function()
			invoke(isOpen and "Close" or "Open", { BizId = bizId }, isOpen and "Closed for now" or "🎉 Open for business!")
		end, 220)
		W.Button(headRow, "✏️ Rename", "secondary", function()
			local newName = Router.Prompt("Rename business", "Business name", name)
			if newName and newName ~= "" and newName ~= name then
				invoke("Rename", { BizId = bizId, Name = newName }, "Renamed!")
			end
		end, 120)
		W.Button(headRow, "📍 GPS", "secondary", function()
			setGps(info and info.Position, name)
		end, 100)

		if info and not info.Loaded then
			W.Text(head, "⚠️ No free lot for this business in this server right now. It will set up automatically when one frees up.", 4, {
				TextColor3 = Theme.Colors.Warning,
			})
		elseif info and info.Missing and #info.Missing > 0 then
			local parts = {}
			for _, m in ipairs(info.Missing) do
				table.insert(parts, ("%s %d/%d"):format(Config.FunctionNames[m.Function] or m.Function, m.Have, m.Need))
			end
			W.Text(head, "🔨 To open, build: " .. table.concat(parts, ", "), 4, { TextColor3 = Theme.Colors.Warning })
		end

		-- Stats ---------------------------------------------------------------
		local statsCard = W.Section(body, "📊 Overview", nextOrder())
		local stats = type(rec.Stats) == "table" and rec.Stats or {}
		local today = (os.time() + Config.General.StatsDayOffsetHours * 3600) // 86400
		local isToday = num(stats.Day) == today
		local grid = W.ChipGrid(statsCard, 1)
		local vault = math.floor(num(rec.Vault))
		local cap = info and info.VaultCap or 0
		W.Chip(grid, "Vault", Format.Money(vault), Theme.Colors.Money, 1)
		W.Chip(grid, "Revenue today", Format.MoneyShort(isToday and num(stats.Revenue) or 0), Theme.Colors.Text, 2)
		W.Chip(grid, "Customers today", Format.Commas(isToday and num(stats.Customers) or 0), Theme.Colors.Text, 3)
		local cpm = info and (isOpen and info.CPM or info.PreviewCPM) or 0
		W.Chip(grid, isOpen and "Customers / min" or "Est. customers / min", string.format("%.1f", cpm), Theme.Colors.Accent, 4)
		if cap > 0 then
			W.Text(statsCard, ("Vault %s / %s"):format(Format.Money(vault), Format.Money(cap)), 2, {
				TextSize = Theme.TextSize.Small + 1,
				TextColor3 = Theme.Colors.TextDim,
			})
			W.Progress(statsCard, vault / cap, vault >= cap and Theme.Colors.Warning or Theme.Colors.Money, 3)
		end
		local collectRow = W.Flow(statsCard, 4)
		W.Button(collectRow, ("💰 Collect %s"):format(Format.Money(vault)), vault > 0 and "success" or "ghost", function()
			local res = invoke("CollectVault", { BizId = bizId })
			if res.ok then
				Router.Notify(("Collected %s"):format(Format.Money(num(res.Amount))), "money")
			end
		end, 220)
		W.Text(statsCard, "Revenue (last ticks)", 5, { TextSize = Theme.TextSize.Small + 1, TextColor3 = Theme.Colors.TextDim })
		local history = type(stats.History) == "table" and stats.History or {}
		W.Bars(statsCard, history, 6, 80)

		-- Stock ---------------------------------------------------------------
		local stockCard = W.Section(body, "📦 Stock", nextOrder())
		local stock = math.floor(num(rec.Stock))
		local maxStock = info and info.MaxStock or math.max(stock, t.BaseMaxStock)
		W.Text(stockCard, ("%s / %s units · %s per unit"):format(Format.Commas(stock), Format.Commas(maxStock), Format.Money(t.StockUnitCost)), 1, {
			TextSize = Theme.TextSize.Small + 1,
		})
		W.Progress(stockCard, maxStock > 0 and stock / maxStock or 0, stock < maxStock * 0.15 and Theme.Colors.Danger or Theme.Colors.Accent, 2)
		local space = math.max(0, maxStock - stock)
		local stockRow = W.Flow(stockCard, 3)
		local function stockButton(label: string, amount: number)
			amount = math.min(amount, space)
			local cost = math.ceil(amount * t.StockUnitCost)
			W.Button(stockRow, ("%s (%s)"):format(label, Format.MoneyShort(cost)), amount > 0 and "secondary" or "ghost", function()
				if amount <= 0 then
					Router.Notify("Storage is full", "info")
					return
				end
				invoke("BuyStock", { BizId = bizId, Amount = amount }, ("Bought %d stock"):format(amount))
			end, 150)
		end
		stockButton("+25%", math.max(1, math.floor(maxStock * 0.25)))
		stockButton("+50%", math.max(1, math.floor(maxStock * 0.5)))
		stockButton("Fill", space)

		-- Prices --------------------------------------------------------------
		local priceCard = W.Section(body, "🏷️ Prices", nextOrder())
		W.Text(priceCard, "Higher prices earn more per sale but bring fewer customers. Marketing & decor raise what customers accept.", 1, {
			TextSize = Theme.TextSize.Small,
			TextColor3 = Theme.Colors.TextDim,
		})
		pendingPrices[bizId] = pendingPrices[bizId] or {}
		local pend = pendingPrices[bizId]
		for i, product in ipairs(t.Products) do
			local lo, hi = Config.PriceBounds(rec.TypeId, product.Id)
			local current = pend[product.Id] or priceOf(rec, product)
			local row = W.Row(priceCard, 10 + i, 44)
			local cost = (product.Stock or 0) * t.StockUnitCost
			local labelText = ("%s %s  <b>%s</b>"):format(product.Icon, product.Name, Format.Money(current))
			local sub = ("default %s%s%s"):format(Format.Money(product.Price), cost > 0 and (" · cost " .. Format.Money(cost)) or "", product.NpcOnly and " · NPC only" or "")
			local lbl = Kit.Label(labelText .. "\n<font size=\"12\" color=\"#A0A6BA\">" .. sub .. "</font>", {
				Size = UDim2.new(1, -164, 1, 0),
				AutomaticSize = Enum.AutomaticSize.None,
				TextYAlignment = Enum.TextYAlignment.Center,
				TextSize = Theme.TextSize.Small + 1,
				LayoutOrder = 1,
				Parent = row,
			})
			local step = math.max(1, math.floor(product.Price * 0.1 + 0.5))
			local sendToken = 0
			local function change(delta: number)
				local v = math.clamp((pend[product.Id] or priceOf(rec, product)) + delta, lo :: number, hi :: number)
				pend[product.Id] = v
				lbl.Text = ("%s %s  <b>%s</b>"):format(product.Icon, product.Name, Format.Money(v))
					.. "\n<font size=\"12\" color=\"#A0A6BA\">"
					.. sub
					.. "</font>"
				sendToken += 1
				local my = sendToken
				task.delay(0.6, function()
					if my ~= sendToken or not alive then
						return
					end
					local res = Net.Invoke("Business", "SetPrice", { BizId = bizId, ProductId = product.Id, Price = v })
					pend[product.Id] = nil
					if not res.ok then
						Router.Notify(res.err or "Couldn't set price", "error")
					end
					task.spawn(refresh)
				end)
			end
			Kit.IconButton("−", function()
				change(-step)
			end, { Size = UDim2.fromOffset(44, 44), LayoutOrder = 2, Parent = row })
			Kit.IconButton("+", function()
				change(step)
			end, { Size = UDim2.fromOffset(44, 44), LayoutOrder = 3, Parent = row })
			Kit.IconButton("↺", function()
				change(product.Price - (pend[product.Id] or priceOf(rec, product)))
			end, { Size = UDim2.fromOffset(44, 44), LayoutOrder = 4, TextSize = 18, Parent = row })
		end

		-- Upgrades ------------------------------------------------------------
		local upCard = W.Section(body, "⬆️ Upgrades", nextOrder())
		for i, entry in ipairs(Config.UpgradesFor(rec.TypeId)) do
			local def = entry.Def
			local lvl = math.floor(num(type(rec.Upgrades) == "table" and rec.Upgrades[entry.Id] or 0))
			local maxLvl = #def.Prices
			local price = Config.UpgradePrice(rec.TypeId, entry.Id, lvl + 1)
			local row = W.Row(upCard, i, 52)
			local dots = string.rep("●", lvl) .. string.rep("○", maxLvl - lvl)
			Kit.Label(("%s <b>%s</b>  %s\n<font size=\"12\" color=\"#A0A6BA\">%s</font>"):format(def.Icon, def.Name, dots, def.Desc), {
				Size = UDim2.new(1, -150, 1, 0),
				AutomaticSize = Enum.AutomaticSize.None,
				TextYAlignment = Enum.TextYAlignment.Center,
				TextSize = Theme.TextSize.Small + 1,
				LayoutOrder = 1,
				Parent = row,
			})
			if price then
				local cash = ClientData.Get("Cash") or 0
				W.Button(row, Format.MoneyShort(price), cash >= price and "primary" or "ghost", function()
					if Router.Confirm(("Buy %s level %d?"):format(def.Name, lvl + 1), ("Costs %s cash."):format(Format.Money(price)), "Upgrade") then
						invoke("Upgrade", { BizId = bizId, UpgradeId = entry.Id }, ("%s upgraded!"):format(def.Name))
					end
				end, 140, 2)
			else
				W.Button(row, "MAX", "ghost", function() end, 140, 2)
			end
		end

		-- NPC staff -----------------------------------------------------------
		local staffCount = info and info.StaffCount or 0
		local maxStaff = info and info.MaxStaff or Config.LevelInfo(level).MaxStaff
		local staffCard = W.Section(body, ("🧑‍🍳 NPC Staff  %d/%d"):format(staffCount, maxStaff), nextOrder())
		W.Text(staffCard, "NPC staff boost customers while you're open. Wages are paid per in-game hour from the vault.", 1, {
			TextSize = Theme.TextSize.Small,
			TextColor3 = Theme.Colors.TextDim,
		})
		for i, roleId in ipairs(t.StaffRoles) do
			local role = Config.Roles[roleId]
			local have = math.floor(num(type(rec.Staff) == "table" and rec.Staff[roleId] or 0))
			local row = W.Row(staffCard, 10 + i, 52)
			Kit.Label(("%s <b>%s</b> ×%d\n<font size=\"12\" color=\"#A0A6BA\">%s/hr · +%d%% customers</font>"):format(
				role.Icon,
				role.Name,
				have,
				Format.Money(role.WagePerHour),
				math.floor(role.Customers * 100 + 0.5)
			), {
				Size = UDim2.new(1, -236, 1, 0),
				AutomaticSize = Enum.AutomaticSize.None,
				TextYAlignment = Enum.TextYAlignment.Center,
				TextSize = Theme.TextSize.Small + 1,
				LayoutOrder = 1,
				Parent = row,
			})
			W.Button(row, "Hire " .. Format.MoneyShort(role.HireCost), (have < role.MaxPerBusiness and staffCount < maxStaff) and "primary" or "ghost", function()
				invoke("HireNPC", { BizId = bizId, Role = roleId }, ("Hired a %s"):format(role.Name))
			end, 140, 2)
			W.Button(row, "Fire", have > 0 and "danger" or "ghost", function()
				if have > 0 then
					invoke("FireNPC", { BizId = bizId, Role = roleId }, ("Let a %s go"):format(role.Name))
				end
			end, 80, 3)
		end

		-- Player employees ----------------------------------------------------
		local empCard = W.Section(body, ("👥 Player Employees  %d/%d"):format(info and #info.Employees or 0, Config.PlayerWork.MaxEmployees), nextOrder())
		local employees = info and info.Employees or {}
		if #employees == 0 then
			W.Text(empCard, "Hire other players! They work at your stations and you pay a wage per task (vault first, then wallet). Each task also brings in revenue.", 1, {
				TextSize = Theme.TextSize.Small,
				TextColor3 = Theme.Colors.TextDim,
			})
		end
		for i, e in ipairs(employees) do
			local role = Config.Roles[e.Role]
			local row = W.Row(empCard, 10 + i, 44)
			Kit.Label(("%s <b>%s</b> · %s %s · %s/task"):format(e.Online and "🟢" or "⚪", e.Name, role and role.Icon or "", role and role.Name or tostring(e.Role), Format.Money(num(e.Wage))), {
				Size = UDim2.new(1, -96, 1, 0),
				AutomaticSize = Enum.AutomaticSize.None,
				TextYAlignment = Enum.TextYAlignment.Center,
				TextSize = Theme.TextSize.Small + 1,
				TextTruncate = Enum.TextTruncate.AtEnd,
				LayoutOrder = 1,
				Parent = row,
			})
			W.Button(row, "Fire", "danger", function()
				if Router.Confirm(("Fire %s?"):format(e.Name), nil, "Fire") then
					invoke("FireEmployee", { BizId = bizId, UserId = e.UserId }, "Employee let go")
				end
			end, 80, 2)
		end
		if info and info.Loaded and #employees < Config.PlayerWork.MaxEmployees then
			W.Text(empCard, "<b>Hire a player</b>", 50)
			local picker = Kit.new("ScrollingFrame", {
				Size = UDim2.new(1, 0, 0, 50),
				BackgroundTransparency = 1,
				CanvasSize = UDim2.new(),
				AutomaticCanvasSize = Enum.AutomaticSize.X,
				ScrollingDirection = Enum.ScrollingDirection.X,
				ScrollBarThickness = 2,
				BorderSizePixel = 0,
				LayoutOrder = 51,
				Parent = empCard,
			})
			Kit.List(picker, 6, true)
			local others = {}
			for _, p in ipairs(Players:GetPlayers()) do
				if p ~= player then
					local already = false
					for _, e in ipairs(employees) do
						if e.UserId == p.UserId then
							already = true
						end
					end
					if not already then
						table.insert(others, p)
					end
				end
			end
			if #others == 0 then
				W.Text(empCard, "No other players to hire in this server.", 52, { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small })
			else
				for i, p in ipairs(others) do
					local b = Kit.Button(p.DisplayName, hire.UserId == p.UserId and "primary" or "secondary", function()
						hire.UserId = p.UserId
						queueRender()
					end, {
						Size = UDim2.fromOffset(0, 44),
						AutomaticSize = Enum.AutomaticSize.X,
						TextWrapped = false,
						LayoutOrder = i,
						TextSize = Theme.TextSize.Small + 1,
						Parent = picker,
					})
					Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12), Parent = b })
				end
				if not hire.Role or not table.find(t.StaffRoles, hire.Role) then
					hire.Role = t.StaffRoles[1]
					hire.Wage = nil
				end
				local role = Config.Roles[hire.Role :: string]
				hire.Wage = math.clamp(hire.Wage or role.Wage.Default, role.Wage.Min, role.Wage.Max)
				local formRow = W.Flow(empCard, 53)
				W.Button(formRow, ("%s %s ▸"):format(role.Icon, role.Name), "secondary", function()
					local idx = table.find(t.StaffRoles, hire.Role) or 0
					hire.Role = t.StaffRoles[idx % #t.StaffRoles + 1]
					hire.Wage = nil
					queueRender()
				end, 170, 1)
				Kit.IconButton("−", function()
					hire.Wage = math.max(role.Wage.Min, (hire.Wage or role.Wage.Default) - 5)
					queueRender()
				end, { Size = UDim2.fromOffset(44, 44), LayoutOrder = 2, Parent = formRow })
				Kit.Label(("%s/task"):format(Format.Money(hire.Wage :: number)), {
					Size = UDim2.fromOffset(96, 44),
					AutomaticSize = Enum.AutomaticSize.None,
					TextXAlignment = Enum.TextXAlignment.Center,
					TextYAlignment = Enum.TextYAlignment.Center,
					Font = Theme.FontBold,
					LayoutOrder = 3,
					Parent = formRow,
				})
				Kit.IconButton("+", function()
					hire.Wage = math.min(role.Wage.Max, (hire.Wage or role.Wage.Default) + 5)
					queueRender()
				end, { Size = UDim2.fromOffset(44, 44), LayoutOrder = 4, Parent = formRow })
				local sendRow = W.Flow(empCard, 54)
				W.Button(sendRow, "📨 Send job offer", hire.UserId and "success" or "ghost", function()
					if not hire.UserId then
						Router.Notify("Pick a player first", "info")
						return
					end
					local res = invoke("HirePlayer", { BizId = bizId, UserId = hire.UserId, Role = hire.Role, Wage = hire.Wage }, "Job offer sent!")
					if res.ok then
						hire.UserId = nil
					end
				end, 200, 1)
			end
		end

		-- Actions -------------------------------------------------------------
		local actCard = W.Section(body, "⚙️ Manage", nextOrder())
		local actRow = W.Flow(actCard, 1)
		W.Button(actRow, "🔨 Decorate / Build", "primary", function()
			local res = Net.Invoke("Business", "OpenBuildMode", { BizId = bizId })
			if not Router.Result(res) then
				return
			end
			local build = Registry.Find("BuildController")
			if build and type(build.Enter) == "function" and type(res.ContextId) == "string" then
				ctx.Close()
				task.spawn(function()
					build:Enter(res.ContextId)
				end)
			else
				-- the "BuildMode" panel needs a full build session that only BuildController:Enter can create
				Router.Notify("Build mode isn't available right now", "error")
			end
		end, 200, 1)
		local sellValue = info and info.SellValue or 0
		W.Button(actRow, ("Sell (%s)"):format(Format.MoneyShort(sellValue + math.floor(num(rec.Vault)))), "danger", function()
			local ok = Router.Confirm(
				("Sell %s?"):format(name),
				("You get %s (%d%% of its value) plus the vault and part of your unsold stock. Employees lose their jobs. This can't be undone."):format(
					Format.Money(sellValue),
					math.floor(EconomyConfig.ResaleFraction * 100 + 0.5)
				),
				"Sell"
			)
			if ok then
				local res = invoke("SellBusiness", { BizId = bizId })
				if res.ok then
					Router.Notify(("Sold for %s"):format(Format.Money(num(res.Payout))), "money", 5)
					selected = nil
				end
			end
		end, 180, 2)
		W.Text(actCard, ("Build slots: %d · Floors: %d · Decor items: %d"):format(
			info and info.MaxItems or 0,
			info and info.Floors or 1,
			info and info.DecorCount or 0
		), 2, { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim })
	end

	-----------------------------------------------------------------------
	-- Render
	-----------------------------------------------------------------------
	render = function()
		if not alive then
			return
		end
		local list = ownedList()
		if pendingSelect then
			for _, e in ipairs(list) do
				if e.Id == pendingSelect then
					selected = pendingSelect
					pendingSelect = nil
					startRendered = false
					break
				end
			end
		end
		local valid = selected == "_start" or (selected == "_job" and server and server.Employer)
		if not valid then
			for _, e in ipairs(list) do
				if e.Id == selected then
					valid = true
				end
			end
		end
		if not valid then
			selected = list[1] and list[1].Id or "_start"
		end

		-- remember the gamepad-selected button so a data refresh doesn't drop console players' selection
		local selIndex: number? = nil
		local selInTabs = false
		local sel = GuiService.SelectedObject
		if sel and (sel:IsDescendantOf(body) or sel:IsDescendantOf(tabs)) then
			selInTabs = sel:IsDescendantOf(tabs)
			local i = 0
			for _, d in ipairs((selInTabs and tabs or body):GetDescendants()) do
				if d:IsA("GuiButton") then
					i += 1
					if d == sel then
						selIndex = i
						break
					end
				end
			end
		end
		local function restoreSelection()
			if not selIndex then
				return
			end
			task.defer(function()
				if not alive then
					return
				end
				local i = 0
				for _, d in ipairs((selInTabs and tabs or body):GetDescendants()) do
					if d:IsA("GuiButton") then
						i += 1
						if i == selIndex then
							GuiService.SelectedObject = d
							return
						end
					end
				end
			end)
		end

		renderTabs(list)
		if selected == "_start" and startRendered then
			restoreSelection()
			return
		end
		local scroll = body.CanvasPosition
		W.Clear(body)
		if selected == "_start" then
			startRendered = true
			StartFlow.Render(body, {
				PreselectLot = preselectLot,
				Owned = #list,
				Max = server and server.Max or Config.General.MaxPerPlayer,
				Alive = function()
					return alive
				end,
				OnBought = function(bizId: string)
					preselectLot = nil
					if type(bizId) == "string" then
						pendingSelect = bizId
					end
					startRendered = false
					task.delay(0.3, refresh)
				end,
			})
			restoreSelection()
			return
		end
		startRendered = false
		if selected == "_job" then
			renderJob()
		else
			for _, e in ipairs(list) do
				if e.Id == selected then
					renderBusiness(e.Id, e.Rec)
				end
			end
		end
		task.defer(function()
			if alive and body.Parent then
				body.CanvasPosition = scroll
			end
		end)
		restoreSelection()
	end

	render()
	task.spawn(refresh)
	local changed = ClientData.OnChanged("Businesses", function()
		-- on the Start tab this only refreshes the tab strip (and picks up a just-bought business)
		queueRender()
	end)
	ctx.Maid:Give(changed)
	ctx.Maid:Give(task.spawn(function()
		while alive do
			task.wait(POLL_SECONDS)
			if alive and selected ~= "_start" then
				refresh()
			end
		end
	end))

	return function()
		alive = false
	end
end

return Dashboard
