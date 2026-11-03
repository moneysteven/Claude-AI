-- ECONOMY CONFIG — change numbers here, no code changes needed.

return {
	StartingCash = 5000,
	StartingBank = 0,

	-- Hard sanity caps (anything above these is treated as an exploit / bug and rejected)
	MaxCash = 100_000_000_000, -- $100B wallet cap
	MaxBank = 1_000_000_000_000, -- $1T bank cap
	MaxSingleTransaction = 2_000_000_000, -- largest single add/remove allowed

	-- Earning-rate watchdog: if a player earns more than this per minute from
	-- non-purchase sources they are flagged in the server log (not auto-banned).
	MaxEarnPerMinute = 250_000,

	-- Saving
	AutoSaveInterval = 120, -- seconds
	DataStoreName = "SkylineCity_PlayerData_v1",
	LeaderboardStoreName = "SkylineCity_NetWorth_v1",
	MaxStoredPurchaseIds = 200,

	-- Bank
	Bank = {
		MaxDepositPerAction = 1_000_000_000,
		-- Savings interest: % of savings balance per REAL hour played
		SavingsInterestPerHour = 0.01, -- 1% per hour
		SavingsInterestCapPerHour = 25_000, -- never more than $25k / hour
		SavingsMaxBalanceForInterest = 5_000_000, -- interest only on first $5M
		WithdrawSavingsFee = 0, -- flat fee (0 = free)
		AtmUseDistance = 12,

		-- Bank prompts on ATM / Bank tagged parts (server-side ProximityPrompts)
		PromptHoldDuration = 0, -- seconds to hold E / ButtonX (0 = tap)

		-- Savings interest accrual (paid every InterestTickSeconds of playtime)
		InterestTickSeconds = 60, -- playtime seconds per interest payment
		InterestWhileAFK = false, -- false = players flagged AFK earn no interest
		InterestSummaryMinutes = 24, -- fallback summary cadence if WorldService has no DayChanged

		-- Statement (kept in server memory per session)
		StatementSize = 30, -- last N transactions shown in the bank app

		-- Player-to-player bank transfers ("Send Money")
		SendMoneyMin = 10, -- smallest transfer
		SendMoneyMaxPerAction = 500_000, -- largest single transfer
		SendMoneyDailyLimit = 1_000_000, -- total a player may SEND per UTC day
		SendMoneyMinPlaytimeMinutes = 30, -- sender must have played this long (stops alt-account funnels)
		SendMoneyCooldown = 5, -- seconds between transfers from the same player

		-- Quick-amount buttons in the bank UI (client display only; server validates everything)
		QuickAmounts = { 100, 1_000, 10_000, 100_000 },
	},

	-- Daily login reward (streak days 1..7, loops after 7)
	DailyRewards = { 500, 750, 1000, 1500, 2000, 3000, 5000 },

	-- Wealth tiers are based on NET WORTH (cash + bank + savings + asset values)
	WealthTiers = {
		{ Id = 1, Name = "Broke", Min = 0, Color = Color3.fromRGB(150, 150, 150), Reward = 0 },
		{ Id = 2, Name = "Getting By", Min = 25_000, Color = Color3.fromRGB(120, 200, 120), Reward = 1_000 },
		{ Id = 3, Name = "Comfortable", Min = 150_000, Color = Color3.fromRGB(80, 170, 255), Reward = 5_000 },
		{ Id = 4, Name = "Rich", Min = 500_000, Color = Color3.fromRGB(190, 110, 255), Reward = 15_000 },
		{ Id = 5, Name = "Millionaire", Min = 1_000_000, Color = Color3.fromRGB(255, 200, 60), Reward = 50_000 },
		{ Id = 6, Name = "Billionaire", Min = 1_000_000_000, Color = Color3.fromRGB(255, 90, 90), Reward = 1_000_000 },
	},

	-- Wealth / leaderboards
	Wealth = {
		RecomputeInterval = 5, -- seconds between net-worth recomputes for "dirty" players
		FullRecomputeInterval = 30, -- seconds between full recomputes (catches asset value changes)
		LeaderboardWriteInterval = 120, -- seconds between global leaderboard writes per player
		LeaderboardRefreshInterval = 60, -- seconds between global top-list reads / board redraws
		LeaderboardSize = 50, -- entries fetched from the global board
		BoardRows = 10, -- rows rendered on in-world "Leaderboard" boards
		AnnounceTierAtOrAbove = 4, -- server-wide shout-out when someone reaches this tier id
		CelebrationSeconds = 5, -- how long the tier-up celebration stays on screen
	},

	-- Daily reward extras
	Daily = {
		AutoOpenDelay = 8, -- seconds after data loads before the Daily popup opens (lets loading screen finish)
	},

	-- Asset resale: selling an owned house/car back to the game returns this fraction of value
	ResaleFraction = 0.7,
}
