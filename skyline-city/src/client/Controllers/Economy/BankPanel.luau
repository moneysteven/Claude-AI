-- BankPanel (client helper for BankController): builds the "Bank" window.
--   BankPanel.Build(content, data, ctx)
--   data = { ViaPhone = bool, Place = "ATM"|"Bank"?, Tab = "Wallet"|"Bank"|"Savings"|"Send"|"History"?, TargetUserId = number? }
-- Tabs: Wallet (deposit) · Bank (withdraw / to savings) · Savings (to bank) · Send (to a player) · History.
-- Everything is validated again on the server; the client only formats and pre-checks for nicer errors.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Maid = require(Shared.Util.Maid)
local Economy = require(Shared.Config.Economy)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))
local UIBits = require(script.Parent:WaitForChild("UIBits"))

local BankPanel = {}

local TABS = { "Wallet", "Bank", "Savings", "Send", "History" }
local QUICK = Economy.Bank.QuickAmounts or { 100, 1000, 10000, 100000 }

local localPlayer = Players.LocalPlayer

local function balanceChip(parent: Instance, icon: string, title: string, order: number)
	local chip = Kit.new("Frame", {
		BackgroundColor3 = Theme.Colors.SurfaceAlt,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.Corner(chip, Theme.CornerSmall)
	Kit.new("UIPadding", {
		PaddingLeft = UDim.new(0, 10),
		PaddingRight = UDim.new(0, 6),
		PaddingTop = UDim.new(0, 6),
		PaddingBottom = UDim.new(0, 6),
		Parent = chip,
	})
	Kit.Label(icon .. " " .. title, {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		AutomaticSize = Enum.AutomaticSize.None,
		Size = UDim2.new(1, 0, 0, 16),
		Parent = chip,
	})
	local value = Kit.Label("$0", {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Body,
		TextColor3 = Theme.Colors.Money,
		TextScaled = true,
		AutomaticSize = Enum.AutomaticSize.None,
		Position = UDim2.fromOffset(0, 18),
		Size = UDim2.new(1, 0, 0, 24),
		Parent = chip,
	})
	Kit.new("UITextSizeConstraint", { MaxTextSize = Theme.TextSize.Heading, MinTextSize = 10, Parent = value })
	return value
end

local function num(path: string): number
	local v = ClientData.Get(path)
	return type(v) == "number" and v or 0
end

function BankPanel.Build(content: Frame, data: any, ctx)
	data = type(data) == "table" and data or {}
	local viaPhone = data.ViaPhone == true
	local maid = ctx.Maid
	local info = nil -- latest GetStatement response
	local closed = false
	maid:Give(function()
		closed = true
	end)

	-- balances
	local balances = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 56),
		BackgroundTransparency = 1,
		Parent = content,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(1 / 3, -6, 1, 0),
		CellPadding = UDim2.fromOffset(8, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = balances,
	})
	local cashLabel = balanceChip(balances, "👛", "Wallet", 1)
	local bankLabel = balanceChip(balances, "🏦", "Bank", 2)
	local savingsLabel = balanceChip(balances, "🐷", "Savings", 3)
	maid:Give(ClientData.OnChanged("Cash", function(v)
		cashLabel.Text = Format.Money(type(v) == "number" and v or 0)
	end))
	maid:Give(ClientData.OnChanged("Bank", function(v)
		bankLabel.Text = Format.Money(type(v) == "number" and v or 0)
	end))
	maid:Give(ClientData.OnChanged("Savings", function(v)
		savingsLabel.Text = Format.Money(type(v) == "number" and v or 0)
	end))
	cashLabel.Text = Format.Money(num("Cash"))
	bankLabel.Text = Format.Money(num("Bank"))
	savingsLabel.Text = Format.Money(num("Savings"))

	local tabsHolder = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 64),
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundTransparency = 1,
		Parent = content,
	})
	local where = Kit.Label(viaPhone and "📱 Mobile banking" or (data.Place == "Bank" and "🏛️ Skyline Bank counter" or "🏧 ATM"), {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Right,
		AutomaticSize = Enum.AutomaticSize.None,
		Position = UDim2.new(0, 0, 0, 112),
		Size = UDim2.new(1, 0, 0, 16),
		Parent = content,
	})
	where.ZIndex = 2

	local body = Kit.Scroll({
		Position = UDim2.fromOffset(0, 132),
		Size = UDim2.new(1, 0, 1, -132),
		Parent = content,
	}, 10)

	local pageMaid = nil

	local function clearBody()
		if closed then
			return
		end
		if pageMaid then
			pageMaid:Clean()
		end
		pageMaid = Maid.new()
		for _, child in ipairs(body:GetChildren()) do
			if child:IsA("GuiObject") then
				child:Destroy()
			end
		end
	end
	maid:Give(function()
		if pageMaid then
			pageMaid:Clean()
		end
	end)

	local function invoke(action: string, payload: { [string]: any }, success: string?)
		payload.ViaPhone = viaPhone
		local res = Net.Invoke("Bank", action, payload)
		Router.Result(res, success)
		return res
	end

	local function fetchInfo()
		local res = Net.Invoke("Bank", "GetStatement", { ViaPhone = viaPhone })
		if res.ok then
			info = res
		end
		return info
	end

	local tabs
	local showTab: (string) -> ()

	-------------------------------------------------------------------
	-- Pages
	-------------------------------------------------------------------
	local function walletPage()
		UIBits.Section(body, "DEPOSIT CASH INTO YOUR BANK ACCOUNT", 1)
		Kit.Label("Money in the bank is safe and counts towards your net worth. Bills are paid from the bank if your wallet is short.", {
			TextSize = Theme.TextSize.Small,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = 2,
			Parent = body,
		})
		local picker = UIBits.AmountPicker(body, QUICK, function()
			return num("Cash")
		end, pageMaid, 3)
		pageMaid:Give(ClientData.OnChanged("Cash", function()
			picker.Refresh()
		end))
		Kit.Button("🏦  Deposit", "success", function()
			local amount = picker.Get()
			if not amount then
				Router.Notify("Enter an amount to deposit", "warning")
				return
			end
			local res = invoke("Deposit", { Amount = amount }, "Deposited " .. Format.Money(amount))
			if res.ok then
				picker.Set(0)
				picker.Box.Text = ""
			end
		end, { LayoutOrder = 4, Parent = body })
	end

	local function bankPage()
		UIBits.Section(body, "WITHDRAW CASH", 1)
		local picker = UIBits.AmountPicker(body, QUICK, function()
			return num("Bank")
		end, pageMaid, 2)
		pageMaid:Give(ClientData.OnChanged("Bank", function()
			picker.Refresh()
		end))
		local canWithdraw = (not viaPhone) or (info and info.AtBank == true)
		local withdraw = Kit.Button(canWithdraw and "🏧  Withdraw to wallet" or "🏧  Withdraw (ATM only)", canWithdraw and "primary" or "ghost", function()
			if not canWithdraw then
				Router.Notify("Cash withdrawals need an ATM — check your map for the nearest one", "warning")
				return
			end
			local amount = picker.Get()
			if not amount then
				Router.Notify("Enter an amount to withdraw", "warning")
				return
			end
			if invoke("Withdraw", { Amount = amount }, "Withdrew " .. Format.Money(amount)).ok then
				picker.Box.Text = ""
			end
		end, { LayoutOrder = 3, Parent = body })
		withdraw.AutoButtonColor = canWithdraw
		if not canWithdraw then
			Kit.Label("📱 Phone banking can move money between your accounts and send money, but cash must be withdrawn at an ATM.", {
				TextSize = Theme.TextSize.Small,
				TextColor3 = Theme.Colors.Warning,
				LayoutOrder = 4,
				Parent = body,
			})
		end
		Kit.Button("🐷  Move to savings", "secondary", function()
			local amount = picker.Get()
			if not amount then
				Router.Notify("Enter an amount to move", "warning")
				return
			end
			if invoke("DepositSavings", { Amount = amount }, "Moved " .. Format.Money(amount) .. " to savings").ok then
				picker.Box.Text = ""
			end
		end, { LayoutOrder = 5, Parent = body })
	end

	local function savingsPage()
		UIBits.Section(body, "SAVINGS ACCOUNT", 1)
		local i = info and info.Interest
		local rate = i and i.PerHour or Economy.Bank.SavingsInterestPerHour
		local cap = i and i.CapPerHour or Economy.Bank.SavingsInterestCapPerHour
		local maxBal = i and i.MaxBalance or Economy.Bank.SavingsMaxBalanceForInterest
		local fee = i and i.WithdrawFee or Economy.Bank.WithdrawSavingsFee
		local card = Kit.Card({ LayoutOrder = 2, Parent = body })
		Kit.List(card, 4)
		Kit.Label(("📈 Earns <b>%s</b> per hour you play"):format(Format.Percent(rate)), { LayoutOrder = 1, Parent = card })
		Kit.Label(("Up to %s per hour · interest on the first %s"):format(Format.Money(cap), Format.MoneyShort(maxBal)), {
			TextSize = Theme.TextSize.Small,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = 2,
			Parent = card,
		})
		local savings = num("Savings")
		local perHour = math.min(math.min(savings, maxBal) * rate, cap)
		local est = Kit.Label(("Right now: about <font color=\"#58D678\">%s</font> / hour"):format(Format.Money(perHour)), {
			TextSize = Theme.TextSize.Small,
			LayoutOrder = 3,
			Parent = card,
		})
		pageMaid:Give(ClientData.OnChanged("Savings", function(v)
			local s = type(v) == "number" and v or 0
			est.Text = ("Right now: about <font color=\"#58D678\">%s</font> / hour"):format(Format.Money(math.min(math.min(s, maxBal) * rate, cap)))
		end))

		UIBits.Section(body, "MOVE SAVINGS TO BANK", 3)
		local picker = UIBits.AmountPicker(body, QUICK, function()
			return num("Savings")
		end, pageMaid, 4)
		pageMaid:Give(ClientData.OnChanged("Savings", function()
			picker.Refresh()
		end))
		Kit.Button(fee > 0 and ("🏦  Move to bank (fee " .. Format.Money(fee) .. ")") or "🏦  Move to bank", "primary", function()
			local amount = picker.Get()
			if not amount then
				Router.Notify("Enter an amount to move", "warning")
				return
			end
			if invoke("WithdrawSavings", { Amount = amount }, "Moved " .. Format.Money(amount) .. " to your bank").ok then
				picker.Box.Text = ""
			end
		end, { LayoutOrder = 5, Parent = body })
	end

	local function sendPage()
		UIBits.Section(body, "SEND MONEY FROM YOUR BANK", 1)
		local limitLabel = Kit.Label("", {
			TextSize = Theme.TextSize.Small,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = 2,
			Parent = body,
		})
		local function renderLimit()
			local l = info and info.SendLimit
			if l then
				limitLabel.Text = ("Daily limit: %s left of %s · %s–%s per transfer"):format(
					Format.Money(l.Remaining),
					Format.Money(l.Max),
					Format.Money(l.MinPerSend),
					Format.MoneyShort(l.MaxPerSend)
				)
			else
				limitLabel.Text = "Loading limits…"
			end
		end
		renderLimit()

		local selected: number? = tonumber(data.TargetUserId)
		local list = Kit.new("Frame", {
			Size = UDim2.new(1, 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundTransparency = 1,
			LayoutOrder = 3,
			Parent = body,
		})
		Kit.List(list, 6)
		local rows: { [number]: TextButton } = {}

		local function paintSelection()
			for uid, b in pairs(rows) do
				local on = uid == selected
				b.BackgroundColor3 = on and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
			end
		end

		local function rebuild()
			for _, b in pairs(rows) do
				b:Destroy()
			end
			table.clear(rows)
			local others = {}
			for _, p in ipairs(Players:GetPlayers()) do
				if p ~= localPlayer then
					table.insert(others, p)
				end
			end
			table.sort(others, function(a, b)
				return a.DisplayName:lower() < b.DisplayName:lower()
			end)
			if #others == 0 then
				local empty = Kit.Label("Nobody else is in this server right now.", {
					TextColor3 = Theme.Colors.TextDim,
					Parent = list,
				})
				rows[-1] = empty :: any
			end
			for i, p in ipairs(others) do
				local rp = p:GetAttribute("RPName")
				local display = (type(rp) == "string" and rp ~= "") and (rp .. "  (@" .. p.Name .. ")") or (p.DisplayName .. "  (@" .. p.Name .. ")")
				local b = Kit.Button(display, "secondary", function()
					selected = p.UserId
					paintSelection()
				end, {
					LayoutOrder = i,
					TextXAlignment = Enum.TextXAlignment.Left,
					TextSize = Theme.TextSize.Small,
					Parent = list,
				})
				Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 12), Parent = b })
				rows[p.UserId] = b
			end
			if selected and not Players:GetPlayerByUserId(selected) then
				selected = nil
			end
			paintSelection()
		end
		rebuild()
		pageMaid:Give(Players.PlayerAdded:Connect(rebuild))
		pageMaid:Give(Players.PlayerRemoving:Connect(function()
			task.defer(rebuild)
		end))

		local picker = UIBits.AmountPicker(body, { 100, 1000, 10000 }, function()
			local l = info and info.SendLimit
			local bank = num("Bank")
			if l then
				return math.min(bank, l.Remaining, l.MaxPerSend)
			end
			return bank
		end, pageMaid, 4)
		pageMaid:Give(ClientData.OnChanged("Bank", function()
			picker.Refresh()
		end))

		Kit.Button("📤  Send money", "success", function()
			if not selected then
				Router.Notify("Pick a player first", "warning")
				return
			end
			local target = Players:GetPlayerByUserId(selected)
			if not target then
				Router.Notify("That player left the server", "warning")
				return
			end
			local amount = picker.Get()
			if not amount then
				Router.Notify("Enter an amount to send", "warning")
				return
			end
			local yes = Router.Confirm(
				"Send " .. Format.Money(amount) .. "?",
				("This moves %s from your bank to %s. Transfers can't be undone."):format(Format.Money(amount), target.DisplayName),
				"Send"
			)
			if not yes then
				return
			end
			local res = invoke("SendMoney", { UserId = selected, Amount = amount }, ("Sent %s to %s"):format(Format.Money(amount), target.DisplayName))
			if res.ok then
				picker.Box.Text = ""
				if info and res.SendLimit then
					info.SendLimit = res.SendLimit
				end
				renderLimit()
			end
		end, { LayoutOrder = 5, Parent = body })

		task.spawn(function()
			fetchInfo()
			if not closed and limitLabel.Parent then
				renderLimit()
			end
		end)
	end

	local function historyPage()
		UIBits.Section(body, "RECENT TRANSACTIONS (THIS SESSION)", 1)
		local holder = Kit.new("Frame", {
			Size = UDim2.new(1, 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundTransparency = 1,
			LayoutOrder = 2,
			Parent = body,
		})
		Kit.List(holder, 6)
		local loading = Kit.Label("Loading…", { TextColor3 = Theme.Colors.TextDim, Parent = holder })
		local current = pageMaid
		task.spawn(function()
			local res = fetchInfo()
			if closed or current ~= pageMaid or not holder.Parent then
				return
			end
			loading:Destroy()
			local entries = res and res.Entries or {}
			if #entries == 0 then
				Kit.Label("No transactions yet. Get a job and start earning!", {
					TextColor3 = Theme.Colors.TextDim,
					Parent = holder,
				})
				return
			end
			for i, e in ipairs(entries) do
				local row = Kit.new("Frame", {
					Size = UDim2.new(1, 0, 0, 48),
					BackgroundColor3 = Theme.Colors.SurfaceAlt,
					LayoutOrder = i,
					Parent = holder,
				})
				Kit.Corner(row, Theme.CornerSmall)
				Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), Parent = row })
				Kit.Label(UIBits.ReasonText(e.Reason), {
					AutomaticSize = Enum.AutomaticSize.None,
					TextTruncate = Enum.TextTruncate.AtEnd,
					TextWrapped = false,
					Position = UDim2.fromOffset(0, 5),
					Size = UDim2.new(0.68, 0, 0, 20),
					TextSize = Theme.TextSize.Small,
					Parent = row,
				})
				Kit.Label(("%s · %s"):format(tostring(e.Account or ""), UIBits.TimeAgo(e.Time)), {
					AutomaticSize = Enum.AutomaticSize.None,
					Position = UDim2.fromOffset(0, 25),
					Size = UDim2.new(0.68, 0, 0, 16),
					TextSize = 12,
					TextColor3 = Theme.Colors.TextDim,
					Parent = row,
				})
				local delta = tonumber(e.Delta) or 0
				Kit.Label((delta >= 0 and "+" or "") .. Format.Money(delta), {
					AutomaticSize = Enum.AutomaticSize.None,
					Font = Theme.FontBold,
					TextXAlignment = Enum.TextXAlignment.Right,
					TextColor3 = delta >= 0 and Theme.Colors.Money or Theme.Colors.Danger,
					Position = UDim2.fromScale(0.68, 0),
					Size = UDim2.new(0.32, 0, 1, 0),
					Parent = row,
				})
			end
		end)
	end

	local PAGES = {
		Wallet = walletPage,
		Bank = bankPage,
		Savings = savingsPage,
		Send = sendPage,
		History = historyPage,
	}

	showTab = function(name: string)
		if closed then
			return
		end
		clearBody()
		body.CanvasPosition = Vector2.zero
		local fn = PAGES[name]
		if fn then
			fn()
		end
	end

	tabs = UIBits.Tabs(tabsHolder, TABS, showTab, maid)
	tabs.Instance.Size = UDim2.fromScale(1, 1)

	local first = (type(data.Tab) == "string" and PAGES[data.Tab]) and data.Tab or (data.TargetUserId and "Send" or "Wallet")
	-- statement info (limits, interest, whether we're at an ATM) loads in the background
	task.spawn(function()
		fetchInfo()
		local cur = tabs.Current()
		if not closed and (cur == "Bank" or cur == "Savings") then
			showTab(cur)
		end
	end)
	tabs.Select(first)
end

return BankPanel
