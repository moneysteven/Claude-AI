-- DailyRewardService: daily login reward with a streak counted in UTC days.
--
-- Remote domain "Daily":
--   GetStatus {} -> { Claimable, Streak, NextStreak, NextReward, Rewards, SecondsUntilReset }
--   Claim     {} -> { Reward, Streak, Status }
--
-- Rules: day = os.time() // 86400 (UTC). Claiming on the day after the last claim continues the streak;
-- missing a day resets it to 1. Rewards come from Config.Economy.DailyRewards and loop after the last entry.
-- The "DailyReward" panel opens automatically on join when a reward is claimable.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Economy)

local Registry = require(ServerScriptService:WaitForChild("Server").Registry)

local DailyRewardService = {
	Name = "DailyRewardService",
	Priority = 40,
}

local DataService
local EconomyService
local NotifyService

local REWARDS = Config.DailyRewards

local function today(): number
	return os.time() // 86400
end

local function rewardForStreak(streak: number): number
	local n = #REWARDS
	if n == 0 then
		return 0
	end
	local index = ((math.max(1, streak) - 1) % n) + 1
	return math.max(0, math.floor(REWARDS[index]))
end

local function status(player: Player)
	local day = today()
	local last = DataService:Get(player, "Daily.LastClaimDay") or 0
	local streak = DataService:Get(player, "Daily.Streak") or 0
	-- a streak is only "alive" if the last claim was today or yesterday
	local alive = last >= day - 1
	local currentStreak = alive and streak or 0
	local claimable = last < day
	local nextStreak = claimable and (alive and streak + 1 or 1) or streak + 1
	return {
		Claimable = claimable,
		Streak = currentStreak,
		NextStreak = nextStreak,
		NextReward = rewardForStreak(nextStreak),
		Rewards = REWARDS,
		CycleDay = ((math.max(1, nextStreak) - 1) % math.max(1, #REWARDS)) + 1,
		SecondsUntilReset = (day + 1) * 86400 - os.time(),
	}
end

local function claim(player: Player)
	if not DataService:IsLoaded(player) then
		return { ok = false, err = "Your data is still loading" }
	end
	local s = status(player)
	if not s.Claimable then
		return { ok = false, err = ("Come back in %s"):format(Format.Duration(s.SecondsUntilReset)), Status = s }
	end
	local streak = s.NextStreak
	local reward = rewardForStreak(streak)
	-- write the claim BEFORE paying (no yields in between, so double-claims are impossible)
	DataService:Set(player, "Daily.LastClaimDay", today())
	DataService:Set(player, "Daily.Streak", streak)
	if reward > 0 then
		EconomyService:AddCash(player, reward, "Reward:Daily")
	end
	NotifyService:Send(player, ("🎁 Day %d reward: %s"):format(streak, Format.Money(reward)), "money", 5)
	return { ok = true, Reward = reward, Streak = streak, Status = status(player) }
end

function DailyRewardService:GetStatus(player: Player)
	return status(player)
end

function DailyRewardService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")

	Net.HandleActions("Daily", {
		GetStatus = function(player: Player, _payload)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			return { ok = true, Status = status(player) }
		end,
		Claim = function(player: Player, _payload)
			return claim(player)
		end,
	}, { rate = 2, burst = 4, perAction = { Claim = { rate = 0.5, burst = 2 } } })

	DataService:OnLoaded(function(player: Player)
		task.delay(Config.Daily.AutoOpenDelay, function()
			if player.Parent ~= Players or not DataService:IsLoaded(player) then
				return
			end
			local s = status(player)
			if s.Claimable then
				NotifyService:OpenUI(player, "DailyReward", s)
			end
		end)
	end)
end

return DailyRewardService
