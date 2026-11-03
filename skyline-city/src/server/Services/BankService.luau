-- BankService: wallet <-> bank <-> savings, player-to-player bank transfers, statements and savings interest.
--
-- Remote domain "Bank" (client: Net.Invoke("Bank", action, payload)):
--   Deposit        { Amount }                 wallet -> bank      (ATM / Bank counter / phone)
--   Withdraw       { Amount }                 bank   -> wallet    (ATM / Bank counter ONLY — never from the phone)
--   DepositSavings { Amount }                 bank   -> savings   (anywhere)
--   WithdrawSavings{ Amount }                 savings-> bank      (anywhere, minus Config fee)
--   SendMoney      { UserId, Amount }         your bank -> another player's bank in this server (anywhere)
--   GetStatement   {}                         recent transactions + balances + limits
--   Every payload may carry ViaPhone = true. The flag only changes error messages: location rules are decided by
--   the ACTION, so a spoofed flag can never unlock cash withdrawals away from an ATM.
--
-- API (server):
--   BankService:GetBalances(player) -> { Cash, Bank, Savings }
--   BankService:GetStatement(player) -> { entries }  (newest first)
--   BankService.BalanceChanged : Signal(player)
--
-- Server-side ProximityPrompts are created on every ATM / Bank tagged part and open the "Bank" panel.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Economy)
local World = require(Shared.Config.World)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local BankService = {
	Name = "BankService",
	Priority = 20,
}

BankService.BalanceChanged = Signal.new()

local BankCfg = Config.Bank
local PROMPT_NAME = "SkylineBankPrompt"
local INTEREST_LOOP_SECONDS = 10 -- how often accrued playtime is processed (payment still every InterestTickSeconds)

local DataService
local EconomyService
local NotifyService

-- session state
local statements: { [Player]: { any } } = {}
local carry: { [Player]: number } = {} -- playtime seconds not yet paid interest
local owedFraction: { [Player]: number } = {} -- fractional dollars of interest not yet paid
local interestSummary: { [Player]: number } = {} -- interest paid since last summary
local lastSend: { [Player]: number } = {}

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function balances(player: Player)
	return {
		Cash = DataService:Get(player, "Cash") or 0,
		Bank = DataService:Get(player, "Bank") or 0,
		Savings = DataService:Get(player, "Savings") or 0,
	}
end

local function record(player: Player, delta: number, reason: string, account: string)
	local list = statements[player]
	if not list then
		list = {}
		statements[player] = list
	end
	table.insert(list, 1, {
		Delta = delta,
		Reason = reason,
		Account = account,
		Time = os.time(),
	})
	while #list > BankCfg.StatementSize do
		table.remove(list)
	end
end

local function changed(player: Player)
	BankService.BalanceChanged:Fire(player)
	local wealth = Registry.Find("WealthService")
	if wealth and wealth.MarkDirty then
		wealth:MarkDirty(player)
	end
end

local function fail(err: string)
	return { ok = false, err = err }
end

local function okResult(player: Player, extra: { [string]: any }?)
	local res = { ok = true, Balances = balances(player) }
	if extra then
		for k, v in pairs(extra) do
			res[k] = v
		end
	end
	return res
end

local function atBankLocation(player: Player): boolean
	local dist = BankCfg.AtmUseDistance
	if Guard.NearTagged(player, World.Tags.ATM, dist) then
		return true
	end
	return Guard.NearTagged(player, World.Tags.Bank, dist) ~= nil
end

local function phoneMessage(player: Player, text: string)
	local phone = Registry.Find("PhoneService")
	if phone and phone.SendSystemMessage then
		local ok, err = pcall(phone.SendSystemMessage, phone, player, "Skyline Bank", text)
		if not ok then
			warn("[BankService] PhoneService:SendSystemMessage failed:", err)
		end
	end
end

local function amountFrom(payload: any, max: number): number?
	return Guard.Money(payload.Amount, max)
end

-- Moves money between the wallet and the bank account. Prefers an EconomyService primitive if the core
-- provides one; otherwise writes through DataService with the same guards EconomyService uses.
local function walletToBank(player: Player, amount: number): (boolean, string?)
	local cash = DataService:Get(player, "Cash") or 0
	local bank = DataService:Get(player, "Bank") or 0
	if cash < amount then
		return false, "You don't have that much cash"
	end
	if bank + amount > Config.MaxBank then
		return false, "Bank account limit reached"
	end
	if EconomyService.MoveCashToBank then
		if not EconomyService:MoveCashToBank(player, amount) then
			return false, "Transaction failed"
		end
		return true
	end
	DataService:Set(player, "Cash", cash - amount)
	DataService:Set(player, "Bank", bank + amount)
	return true
end

local function bankToWallet(player: Player, amount: number): (boolean, string?)
	local cash = DataService:Get(player, "Cash") or 0
	local bank = DataService:Get(player, "Bank") or 0
	if bank < amount then
		return false, "Not enough money in your bank account"
	end
	if cash + amount > Config.MaxCash then
		return false, "Your wallet can't hold that much"
	end
	if EconomyService.MoveBankToCash then
		if not EconomyService:MoveBankToCash(player, amount) then
			return false, "Transaction failed"
		end
		return true
	end
	DataService:Set(player, "Bank", bank - amount)
	DataService:Set(player, "Cash", cash + amount)
	return true
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function BankService:GetBalances(player: Player)
	return balances(player)
end

function BankService:GetStatement(player: Player)
	return table.clone(statements[player] or {})
end

---------------------------------------------------------------------------
-- Actions
---------------------------------------------------------------------------
local function sendLimitInfo(player: Player)
	local today = os.time() // 86400
	local sent = 0
	if DataService:Get(player, "Daily.SendDay") == today then
		sent = DataService:Get(player, "Daily.SentToday") or 0
	end
	return {
		Max = BankCfg.SendMoneyDailyLimit,
		Remaining = math.max(0, BankCfg.SendMoneyDailyLimit - sent),
		MinPerSend = BankCfg.SendMoneyMin,
		MaxPerSend = BankCfg.SendMoneyMaxPerAction,
	}
end

local Actions = {}

function Actions.Deposit(player: Player, payload)
	if not DataService:IsLoaded(player) then
		return fail("Your data is still loading")
	end
	local amount = amountFrom(payload, BankCfg.MaxDepositPerAction)
	if not amount then
		return fail("Enter a valid amount")
	end
	-- Deposits are phone-safe (they only move money AWAY from the wallet), so no location check.
	local ok, err = walletToBank(player, amount)
	if not ok then
		return fail(err or "Deposit failed")
	end
	record(player, amount, "Deposit", "Bank")
	changed(player)
	local tutorial = Registry.Find("TutorialService")
	if tutorial and tutorial.Advance then
		task.spawn(tutorial.Advance, tutorial, player, "Deposit")
	end
	return okResult(player)
end

function Actions.Withdraw(player: Player, payload)
	if not DataService:IsLoaded(player) then
		return fail("Your data is still loading")
	end
	local amount = amountFrom(payload, BankCfg.MaxDepositPerAction)
	if not amount then
		return fail("Enter a valid amount")
	end
	-- Cash withdrawal ALWAYS needs a physical ATM / Bank counter, regardless of any client flag.
	if not atBankLocation(player) then
		if payload.ViaPhone then
			return fail("Cash withdrawals need an ATM — find one on your map")
		end
		return fail("You need to be at an ATM or the bank")
	end
	local ok, err = bankToWallet(player, amount)
	if not ok then
		return fail(err or "Withdrawal failed")
	end
	record(player, -amount, "Withdraw", "Bank")
	changed(player)
	return okResult(player)
end

function Actions.DepositSavings(player: Player, payload)
	if not DataService:IsLoaded(player) then
		return fail("Your data is still loading")
	end
	local amount = amountFrom(payload, Config.MaxSingleTransaction)
	if not amount then
		return fail("Enter a valid amount")
	end
	local bank = DataService:Get(player, "Bank") or 0
	local savings = DataService:Get(player, "Savings") or 0
	if bank < amount then
		return fail("Not enough money in your bank account")
	end
	if savings + amount > Config.MaxBank then
		return fail("Savings account limit reached")
	end
	DataService:Set(player, "Bank", bank - amount)
	DataService:Set(player, "Savings", savings + amount)
	record(player, amount, "To Savings", "Savings")
	changed(player)
	return okResult(player)
end

function Actions.WithdrawSavings(player: Player, payload)
	if not DataService:IsLoaded(player) then
		return fail("Your data is still loading")
	end
	local amount = amountFrom(payload, Config.MaxSingleTransaction)
	if not amount then
		return fail("Enter a valid amount")
	end
	local fee = math.max(0, math.floor(BankCfg.WithdrawSavingsFee or 0))
	local bank = DataService:Get(player, "Bank") or 0
	local savings = DataService:Get(player, "Savings") or 0
	if savings < amount then
		return fail("Not enough money in savings")
	end
	if amount <= fee then
		return fail(("Amount must be more than the %s fee"):format(Format.Money(fee)))
	end
	local received = amount - fee
	if bank + received > Config.MaxBank then
		return fail("Bank account limit reached")
	end
	DataService:Set(player, "Savings", savings - amount)
	DataService:Set(player, "Bank", bank + received)
	record(player, -amount, fee > 0 and ("From Savings (fee " .. Format.Money(fee) .. ")") or "From Savings", "Savings")
	if fee > 0 then
		DataService:Increment(player, "Stats.TotalSpent", fee)
	end
	changed(player)
	return okResult(player)
end

function Actions.SendMoney(player: Player, payload)
	if not DataService:IsLoaded(player) then
		return fail("Your data is still loading")
	end
	local targetId = Guard.Int(payload.UserId, 1, 2 ^ 52)
	if not targetId then
		return fail("Pick a player to send money to")
	end
	if targetId == player.UserId then
		return fail("You can't send money to yourself")
	end
	local amount = Guard.Money(payload.Amount, BankCfg.SendMoneyMaxPerAction)
	if not amount then
		return fail(("You can send up to %s at a time"):format(Format.Money(BankCfg.SendMoneyMaxPerAction)))
	end
	if amount < BankCfg.SendMoneyMin then
		return fail(("Minimum transfer is %s"):format(Format.Money(BankCfg.SendMoneyMin)))
	end
	local target = Players:GetPlayerByUserId(targetId)
	if not target or not DataService:IsLoaded(target) then
		return fail("That player isn't in this server")
	end
	local now = os.clock()
	if lastSend[player] and now - lastSend[player] < BankCfg.SendMoneyCooldown then
		return fail("Please wait a moment before sending again")
	end
	local playtime = DataService:Get(player, "Stats.PlaytimeSeconds") or 0
	if playtime < BankCfg.SendMoneyMinPlaytimeMinutes * 60 then
		return fail(("Transfers unlock after %d minutes of play"):format(BankCfg.SendMoneyMinPlaytimeMinutes))
	end
	local moderation = Registry.Find("ModerationService")
	if moderation and moderation.IsBlocked then
		local okB, blocked = pcall(moderation.IsBlocked, moderation, target, player)
		local okC, blockedOther = pcall(moderation.IsBlocked, moderation, player, target)
		if (okB and blocked) or (okC and blockedOther) then
			return fail("You can't send money to this player")
		end
	end

	local limit = sendLimitInfo(player)
	if amount > limit.Remaining then
		return fail(("Daily send limit: %s left today"):format(Format.Money(limit.Remaining)))
	end
	local bank = DataService:Get(player, "Bank") or 0
	if bank < amount then
		return fail("Not enough money in your bank account")
	end
	local targetBank = DataService:Get(target, "Bank") or 0
	if targetBank + amount > Config.MaxBank then
		return fail("Their bank account can't receive that much")
	end

	-- all checks passed: no yields between here and the writes (atomic on the server)
	local today = os.time() // 86400
	local sentToday = (DataService:Get(player, "Daily.SendDay") == today) and (DataService:Get(player, "Daily.SentToday") or 0) or 0
	DataService:Set(player, "Bank", bank - amount)
	DataService:Set(target, "Bank", targetBank + amount)
	DataService:Set(player, "Daily.SendDay", today)
	DataService:Set(player, "Daily.SentToday", sentToday + amount)
	lastSend[player] = now

	record(player, -amount, "Sent to " .. target.DisplayName, "Bank")
	record(target, amount, "From " .. player.DisplayName, "Bank")
	changed(player)
	changed(target)

	warn(("[BankService] transfer %s (%d) -> %s (%d): %s"):format(player.Name, player.UserId, target.Name, target.UserId, Format.Money(amount)))
	NotifyService:Send(target, ("🏦 %s sent you %s (bank)"):format(player.DisplayName, Format.Money(amount)), "money", 6)
	task.spawn(phoneMessage, target, ("You received %s from %s. It's in your bank account."):format(Format.Money(amount), player.DisplayName))
	return okResult(player, { SendLimit = sendLimitInfo(player) })
end

function Actions.GetStatement(player: Player, _payload)
	if not DataService:IsLoaded(player) then
		return fail("Your data is still loading")
	end
	return okResult(player, {
		Entries = statements[player] or {},
		SendLimit = sendLimitInfo(player),
		AtBank = atBankLocation(player),
		Interest = {
			PerHour = BankCfg.SavingsInterestPerHour,
			CapPerHour = BankCfg.SavingsInterestCapPerHour,
			MaxBalance = BankCfg.SavingsMaxBalanceForInterest,
			WithdrawFee = BankCfg.WithdrawSavingsFee,
		},
	})
end

---------------------------------------------------------------------------
-- Savings interest
---------------------------------------------------------------------------
local function interestPerTick(savings: number): number
	local base = math.min(savings, BankCfg.SavingsMaxBalanceForInterest)
	local perHour = math.min(base * BankCfg.SavingsInterestPerHour, BankCfg.SavingsInterestCapPerHour)
	return math.max(0, perHour * BankCfg.InterestTickSeconds / 3600)
end

local function accrue(player: Player, seconds: number)
	if not DataService:IsLoaded(player) then
		return
	end
	if not BankCfg.InterestWhileAFK and player:GetAttribute("AFK") == true then
		return
	end
	local c = (carry[player] or 0) + seconds
	local tick = BankCfg.InterestTickSeconds
	local paidTotal = 0
	while c >= tick do
		c -= tick
		local savings = DataService:Get(player, "Savings") or 0
		local owed = (owedFraction[player] or 0) + interestPerTick(savings)
		local whole = math.floor(owed)
		if whole >= 1 then
			local room = Config.MaxBank - savings
			local pay = math.max(0, math.min(whole, room))
			if pay > 0 then
				DataService:Set(player, "Savings", savings + pay)
				DataService:Increment(player, "Stats.TotalEarned", pay)
				paidTotal += pay
			end
			owed -= whole
		end
		owedFraction[player] = owed
	end
	carry[player] = c
	if paidTotal > 0 then
		record(player, paidTotal, "Savings interest", "Savings")
		interestSummary[player] = (interestSummary[player] or 0) + paidTotal
		changed(player)
	end
end

local function sendInterestSummaries()
	for player, amount in pairs(interestSummary) do
		if amount > 0 and player.Parent == Players then
			local text = ("Your savings earned %s in interest. Keep saving!"):format(Format.Money(amount))
			NotifyService:Send(player, "🐷 Savings interest +" .. Format.Money(amount), "money", 5)
			task.spawn(phoneMessage, player, text)
		end
		interestSummary[player] = 0
	end
end

---------------------------------------------------------------------------
-- ATM / Bank prompts
---------------------------------------------------------------------------
local function promptParent(inst: Instance): BasePart?
	if inst:IsA("BasePart") then
		return inst
	end
	if inst:IsA("Model") then
		return inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	return nil
end

local function attachPrompt(inst: Instance, kind: string)
	local part = promptParent(inst)
	if not part or part:FindFirstChild(PROMPT_NAME) then
		return
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = PROMPT_NAME
	prompt.ActionText = kind == "Bank" and "Bank Teller" or "Use ATM"
	prompt.ObjectText = kind == "Bank" and "Skyline Bank" or "ATM"
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.HoldDuration = BankCfg.PromptHoldDuration or 0
	-- a little shorter than the server distance re-check so the panel always works once opened
	prompt.MaxActivationDistance = math.max(4, BankCfg.AtmUseDistance * 0.75)
	prompt.RequiresLineOfSight = false
	prompt.Style = Enum.ProximityPromptStyle.Default
	prompt.Triggered:Connect(function(player: Player)
		if not DataService:IsLoaded(player) then
			return
		end
		NotifyService:OpenUI(player, "Bank", {
			ViaPhone = false,
			Place = kind,
			Balances = balances(player),
		})
	end)
	prompt.Parent = part
end

local function watchTag(tag: string, kind: string)
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		task.spawn(attachPrompt, inst, kind)
	end
	CollectionService:GetInstanceAddedSignal(tag):Connect(function(inst)
		-- models may still be assembling; give them a frame
		task.defer(attachPrompt, inst, kind)
	end)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function BankService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")

	Net.HandleActions("Bank", Actions, {
		rate = 4,
		burst = 10,
		perAction = {
			SendMoney = { rate = 0.5, burst = 2 },
			GetStatement = { rate = 1, burst = 4 },
		},
	})

	-- wallet activity from every other system goes onto the statement
	EconomyService.Transaction:Connect(function(player: Player, delta: number, reason: string, _kind: string)
		if player.Parent == Players then
			record(player, delta, reason, "Wallet")
		end
	end)

	DataService:OnLoaded(function(player: Player, data)
		carry[player] = math.clamp(tonumber(data.SavingsInterestCarry) or 0, 0, BankCfg.InterestTickSeconds)
		owedFraction[player] = 0
		interestSummary[player] = 0
	end)

	-- synchronous: persist the unpaid playtime so interest carries across sessions
	DataService.Releasing:Connect(function(player: Player, _data)
		local c = carry[player]
		if c then
			DataService:Set(player, "SavingsInterestCarry", math.clamp(c, 0, BankCfg.InterestTickSeconds))
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		-- defer so Releasing (fired from DataService's PlayerRemoving) reads carry first
		task.defer(function()
			statements[player] = nil
			carry[player] = nil
			owedFraction[player] = nil
			interestSummary[player] = nil
			lastSend[player] = nil
		end)
	end)
end

function BankService:Start()
	watchTag(World.Tags.ATM, "ATM")
	watchTag(World.Tags.Bank, "Bank")

	-- interest accrual on real playtime
	task.spawn(function()
		local last = os.clock()
		while true do
			task.wait(INTEREST_LOOP_SECONDS)
			local now = os.clock()
			local elapsed = math.min(now - last, INTEREST_LOOP_SECONDS * 3)
			last = now
			for player in pairs(carry) do
				if player.Parent == Players then
					accrue(player, elapsed)
				end
			end
		end
	end)

	-- interest summary once per in-game day (or a fallback timer)
	local world = Registry.Find("WorldService")
	if world and world.DayChanged and world.DayChanged.Connect then
		world.DayChanged:Connect(function()
			sendInterestSummaries()
		end)
	else
		task.spawn(function()
			while true do
				task.wait(math.max(60, BankCfg.InterestSummaryMinutes * 60))
				sendInterestSummaries()
			end
		end)
	end
end

return BankService
