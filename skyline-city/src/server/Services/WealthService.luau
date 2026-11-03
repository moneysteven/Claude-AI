-- WealthService: net worth, wealth tiers, leaderstats and the global net-worth leaderboard.
--
-- Net worth = Cash + Bank + Savings
--           + Σ Housing.Owned[*].Value
--           + Σ (Vehicles[*].Value − Vehicles[*].Finance.Remaining)
--           + Σ Businesses[*].Value
--
-- API (server):
--   WealthService:GetNetWorth(player) -> number
--   WealthService:GetTier(player) -> tierTable        (entry of Config.Economy.WealthTiers)
--   WealthService:MarkDirty(player)                    -- ask for a recompute soon (debounced)
--   WealthService:GetTopList() -> { { Rank, UserId, Name, NetWorth } }
--   WealthService.TierChanged : Signal(player, newTier, oldTier)
--
-- Player attributes: WealthTier (1-6), WealthTitle, NetWorth.
-- leaderstats: StringValue "Net Worth" (short format) + StringValue "Title".
-- Remote domain "Wealth": GetTopList -> { List, You = { Rank?, NetWorth, TierId }, UpdatedAt }

local DataStoreService = game:GetService("DataStoreService")
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
local ProfileStore = require(Server.Lib.ProfileStore)
local WealthBoards = require(script.Parent:WaitForChild("Economy"):WaitForChild("WealthBoards"))

local WealthService = {
	Name = "WealthService",
	Priority = 30,
}

WealthService.TierChanged = Signal.new()

local Cfg = Config.Wealth
local TIERS = table.clone(Config.WealthTiers)
table.sort(TIERS, function(a, b)
	return a.Min < b.Min
end)
local TIER_BY_ID: { [number]: any } = {}
for _, t in ipairs(TIERS) do
	TIER_BY_ID[t.Id] = t
end

local DataService
local EconomyService
local NotifyService

local netWorth: { [Player]: number } = {}
local tierOf: { [Player]: number } = {}
local dirty: { [Player]: boolean } = {}
local lastWritten: { [Player]: number } = {}
local nextWrite: { [Player]: number } = {}
local stats: { [Player]: { worth: StringValue, title: StringValue } } = {}

local orderedStore: OrderedDataStore? = nil
local topList: { any } = {}
local topUpdatedAt = 0
local nameCache: { [number]: string } = {}

---------------------------------------------------------------------------
-- Net worth
---------------------------------------------------------------------------
local function num(v: any): number
	if type(v) ~= "number" or v ~= v or v == math.huge or v == -math.huge then
		return 0
	end
	return v
end

local function compute(data): number
	local total = num(data.Cash) + num(data.Bank) + num(data.Savings)
	local housing = type(data.Housing) == "table" and data.Housing.Owned
	if type(housing) == "table" then
		for _, house in pairs(housing) do
			if type(house) == "table" then
				total += math.max(0, num(house.Value))
			end
		end
	end
	if type(data.Vehicles) == "table" then
		for _, car in pairs(data.Vehicles) do
			if type(car) == "table" then
				local value = math.max(0, num(car.Value))
				if type(car.Finance) == "table" then
					value -= math.max(0, num(car.Finance.Remaining))
				end
				total += value
			end
		end
	end
	if type(data.Businesses) == "table" then
		for _, biz in pairs(data.Businesses) do
			if type(biz) == "table" then
				total += math.max(0, num(biz.Value))
			end
		end
	end
	return math.max(0, math.floor(total))
end

local function tierFor(worth: number)
	local best = TIERS[1]
	for _, t in ipairs(TIERS) do
		if worth >= t.Min then
			best = t
		end
	end
	return best
end

local function color3ToArray(c: Color3): { number }
	return { math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5) }
end

---------------------------------------------------------------------------
-- leaderstats
---------------------------------------------------------------------------
local function ensureLeaderstats(player: Player)
	if stats[player] then
		return stats[player]
	end
	local folder = player:FindFirstChild("leaderstats")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "leaderstats"
		folder.Parent = player
	end
	local worth = folder:FindFirstChild("Net Worth")
	if not worth then
		worth = Instance.new("StringValue")
		worth.Name = "Net Worth"
		worth.Value = "…"
		worth.Parent = folder
	end
	local title = folder:FindFirstChild("Title")
	if not title then
		title = Instance.new("StringValue")
		title.Name = "Title"
		title.Value = "…"
		title.Parent = folder
	end
	stats[player] = { worth = worth :: StringValue, title = title :: StringValue }
	return stats[player]
end

---------------------------------------------------------------------------
-- Tier milestones
---------------------------------------------------------------------------
local function celebrate(player: Player, tier, reward: number)
	NotifyService:Send(
		player,
		("🎉 You're now %s!%s"):format(tier.Name, reward > 0 and (" Bonus: " .. Format.Money(reward)) or ""),
		"success",
		7
	)
	NotifyService:OpenUI(player, "TierUp", {
		TierId = tier.Id,
		Name = tier.Name,
		Reward = reward,
		Color = color3ToArray(tier.Color),
	})
	if tier.Id >= Cfg.AnnounceTierAtOrAbove then
		NotifyService:SendAll(("💎 %s just became %s!"):format(player.DisplayName, tier.Name), "info", 6)
	end
	local phone = Registry.Find("PhoneService")
	if phone and phone.PostToFeed then
		pcall(phone.PostToFeed, phone, nil, ("💎 %s reached the %s wealth tier!"):format(player.DisplayName, tier.Name))
	end
end

local function checkMilestone(player: Player, tier)
	local highest = DataService:Get(player, "Wealth.HighestTier") or 1
	if tier.Id <= highest then
		return
	end
	DataService:Set(player, "Wealth.HighestTier", tier.Id)
	local claimed = DataService:Get(player, "Wealth.Claimed") or {}
	local reward = 0
	for id = highest + 1, tier.Id do
		local key = tostring(id)
		local t = TIER_BY_ID[id]
		if t and not claimed[key] then
			DataService:Set(player, "Wealth.Claimed." .. key, true)
			reward += math.max(0, math.floor(t.Reward or 0))
		end
	end
	if reward > 0 then
		EconomyService:AddCash(player, reward, "Reward:WealthTier" .. tostring(tier.Id))
	end
	celebrate(player, tier, reward)
end

local function update(player: Player)
	local data = DataService:GetData(player)
	if not data then
		return
	end
	dirty[player] = nil
	local worth = compute(data)
	netWorth[player] = worth
	player:SetAttribute("NetWorth", worth)

	local tier = tierFor(worth)
	local s = ensureLeaderstats(player)
	s.worth.Value = Format.MoneyShort(worth)

	local oldId = tierOf[player]
	if oldId ~= tier.Id then
		tierOf[player] = tier.Id
		player:SetAttribute("WealthTier", tier.Id)
		player:SetAttribute("WealthTitle", tier.Name)
		s.title.Value = tier.Name
		if oldId ~= nil then
			WealthService.TierChanged:Fire(player, tier, TIER_BY_ID[oldId])
		end
		checkMilestone(player, tier)
	end
end

---------------------------------------------------------------------------
-- Global leaderboard
---------------------------------------------------------------------------
local function keyFor(userId: number): string
	return "u_" .. tostring(userId)
end

local function writeScore(player: Player, worth: number)
	if not orderedStore then
		return
	end
	local store = orderedStore :: OrderedDataStore
	local key = keyFor(player.UserId)
	local value = math.clamp(math.floor(worth), 0, 2 ^ 53)
	local ok = ProfileStore.Retry(3, Enum.DataStoreRequestType.SetIncrementSortedAsync, function()
		store:SetAsync(key, value)
	end)
	if ok then
		lastWritten[player] = value
	end
end

local function resolveName(userId: number): string
	local cached = nameCache[userId]
	if cached then
		return cached
	end
	local p = Players:GetPlayerByUserId(userId)
	if p then
		nameCache[userId] = p.Name
		return p.Name
	end
	local ok, name = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	if ok and type(name) == "string" then
		nameCache[userId] = name
		return name
	end
	return "Player " .. tostring(userId)
end

local function refreshTopList()
	local merged: { [number]: number } = {}
	if orderedStore then
		local store = orderedStore :: OrderedDataStore
		local ok, pages = ProfileStore.Retry(3, Enum.DataStoreRequestType.GetSortedAsync, function()
			return store:GetSortedAsync(false, Cfg.LeaderboardSize)
		end)
		if ok and pages then
			local okPage, page = pcall(function()
				return pages:GetCurrentPage()
			end)
			if okPage and type(page) == "table" then
				for _, entry in ipairs(page) do
					local userId = tonumber(string.match(tostring(entry.key), "^u_(%d+)$"))
					if userId and type(entry.value) == "number" then
						merged[userId] = entry.value
					end
				end
			end
		end
	end
	-- live values for players in this server are always fresher than the store
	for player, worth in pairs(netWorth) do
		if player.Parent == Players then
			merged[player.UserId] = worth
		end
	end
	local list = {}
	for userId, worth in pairs(merged) do
		table.insert(list, { UserId = userId, NetWorth = worth })
	end
	table.sort(list, function(a, b)
		if a.NetWorth == b.NetWorth then
			return a.UserId < b.UserId
		end
		return a.NetWorth > b.NetWorth
	end)
	while #list > Cfg.LeaderboardSize do
		table.remove(list)
	end
	for i, entry in ipairs(list) do
		entry.Rank = i
		entry.Name = resolveName(entry.UserId)
		local t = tierFor(entry.NetWorth)
		entry.TierId = t.Id
	end
	topList = list
	topUpdatedAt = os.time()
	WealthBoards.Render(list, topUpdatedAt)
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function WealthService:GetNetWorth(player: Player): number
	if dirty[player] then
		update(player)
	end
	return netWorth[player] or 0
end

function WealthService:GetTier(player: Player)
	if dirty[player] then
		update(player)
	end
	return TIER_BY_ID[tierOf[player] or 1] or TIERS[1]
end

function WealthService:MarkDirty(player: Player)
	if DataService:IsLoaded(player) then
		dirty[player] = true
	end
end

function WealthService:GetTopList()
	return topList
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function WealthService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")

	Net.HandleActions("Wealth", {
		GetTopList = function(player: Player, _payload)
			local rank = nil
			for _, entry in ipairs(topList) do
				if entry.UserId == player.UserId then
					rank = entry.Rank
					break
				end
			end
			return {
				ok = true,
				List = topList,
				UpdatedAt = topUpdatedAt,
				You = {
					Rank = rank,
					NetWorth = WealthService:GetNetWorth(player),
					TierId = tierOf[player] or 1,
				},
			}
		end,
	}, { rate = 1, burst = 3 })

	EconomyService.Transaction:Connect(function(player: Player)
		dirty[player] = true
	end)

	Players.PlayerAdded:Connect(ensureLeaderstats)
	for _, p in ipairs(Players:GetPlayers()) do
		ensureLeaderstats(p)
	end

	DataService:OnLoaded(function(player: Player)
		ensureLeaderstats(player)
		update(player)
		-- stagger first leaderboard write across the interval
		nextWrite[player] = os.clock() + math.random(15, math.max(16, Cfg.LeaderboardWriteInterval))
	end)

	Players.PlayerRemoving:Connect(function(player)
		local worth = netWorth[player]
		if worth and orderedStore and lastWritten[player] ~= worth then
			task.spawn(writeScore, player, worth)
		end
		netWorth[player] = nil
		tierOf[player] = nil
		dirty[player] = nil
		nextWrite[player] = nil
		stats[player] = nil
		task.delay(30, function()
			lastWritten[player] = nil
		end)
	end)
end

function WealthService:Start()
	if not ProfileStore.IsMock() then
		local ok, store = pcall(function()
			return DataStoreService:GetOrderedDataStore(Config.LeaderboardStoreName)
		end)
		if ok then
			orderedStore = store
		else
			warn("[WealthService] OrderedDataStore unavailable:", store)
		end
	end

	WealthBoards.Start(World.Tags.Leaderboard, Cfg.BoardRows)

	-- debounced recompute + leaderboard write cadence
	task.spawn(function()
		local sinceFull = 0
		while true do
			task.wait(Cfg.RecomputeInterval)
			sinceFull += Cfg.RecomputeInterval
			local full = sinceFull >= Cfg.FullRecomputeInterval
			if full then
				sinceFull = 0
			end
			local now = os.clock()
			for _, player in ipairs(Players:GetPlayers()) do
				if DataService:IsLoaded(player) then
					if full or dirty[player] then
						local ok, err = pcall(update, player)
						if not ok then
							warn("[WealthService] update failed:", err)
						end
					end
					local due = nextWrite[player]
					if orderedStore and due and now >= due then
						nextWrite[player] = now + Cfg.LeaderboardWriteInterval
						local worth = netWorth[player]
						if worth and worth ~= lastWritten[player] then
							task.spawn(writeScore, player, worth)
						end
					end
				end
			end
		end
	end)

	-- global top list refresh
	task.spawn(function()
		task.wait(5)
		while true do
			local ok, err = pcall(refreshTopList)
			if not ok then
				warn("[WealthService] leaderboard refresh failed:", err)
			end
			task.wait(Cfg.LeaderboardRefreshInterval)
		end
	end)
end

return WealthService
