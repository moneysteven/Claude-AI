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

	-- Asset resale: selling an owned house/car back to the game returns this fraction of value
	ResaleFraction = 0.7,
}
