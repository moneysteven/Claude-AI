-- DataService: owns every player's saved data.
--
--   * Loads with session locking (Lib/ProfileStore), reconciles with DataTemplate
--   * Auto-saves every Config.Economy.AutoSaveInterval seconds (staggered)
--   * Saves + releases on leave and on BindToClose
--   * Replicates data to the OWNING client only ("DataSync" event); keys in SERVER_ONLY are not sent
--
-- API (server):
--   DataService:GetData(player) -> table?         -- live table. READ freely; WRITE only via Set/Update/Increment
--   DataService:Get(player, "Path.To.Value")
--   DataService:Set(player, "Path.To.Value", value)
--   DataService:Update(player, "Path", function(old) return new end)
--   DataService:Increment(player, "Path", delta) -> newValue
--   DataService:IsLoaded(player) -> boolean
--   DataService:WaitForData(player, timeout?) -> table?
--   DataService:OnLoaded(function(player, data) end)   -- also fires for players already loaded
--   DataService:SaveNow(player) -> boolean            -- used by ProcessReceipt
--   DataService.Loaded      : Signal(player, data)
--   DataService.Releasing   : Signal(player, data)   -- last chance to write session state into data (sync handlers only!)
--
-- Path rules: dot separated, keys are strings without dots.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Table = require(Shared.Util.Table)
local Template = require(Shared.DataTemplate)
local Economy = require(Shared.Config.Economy)
local ProfileStore = require(ServerScriptService.Server.Lib.ProfileStore)

local DataService = {
	Name = "DataService",
	Priority = 0, -- init first
}

DataService.Loaded = Signal.new()
DataService.Releasing = Signal.new()

local SERVER_ONLY = { Purchases = true }

-- Migrations: [fromVersion] = function(data) ... end (bump Template.Version when adding one)
local MIGRATIONS: { [number]: (any) -> () } = {
	-- [1] = function(data) data.NewThing = ... end,
}

local store
local profiles: { [Player]: any } = {}
local releasing: { [number]: boolean } = {} -- userId -> release in progress (handles fast rejoin)
local loadedSignalFired: { [Player]: boolean } = {}

local function keyFor(userId: number): string
	return "Player_" .. tostring(userId)
end

local function replicableSnapshot(data)
	local out = {}
	for k, v in pairs(data) do
		if not SERVER_ONLY[k] then
			out[k] = v
		end
	end
	return out
end

local function isServerOnlyPath(path: string): boolean
	local first = path:match("^[^%.]+")
	return first ~= nil and SERVER_ONLY[first] == true
end

local function migrate(data)
	local v = data.Version or 1
	while MIGRATIONS[v] do
		MIGRATIONS[v](data)
		v += 1
	end
	data.Version = math.max(v, Template.Version)
end

local function loadPlayer(player: Player)
	local userId = player.UserId
	-- fast rejoin to the same server: wait for the previous release to finish
	local waited = 0
	while releasing[userId] and waited < 30 do
		task.wait(0.5)
		waited += 0.5
	end

	local profile = store:LoadAsync(keyFor(userId), function()
		return player.Parent == Players
	end)

	if not profile then
		if player.Parent == Players then
			player:Kick("SKYLINE CITY couldn't load your save safely. Please rejoin in a moment — your data is safe.")
		end
		return
	end

	if player.Parent ~= Players then
		profile:ReleaseAsync()
		return
	end

	local isNew = profile.Data == nil
	if isNew then
		profile.Data = Table.DeepCopy(Template)
		profile.Data.Stats.FirstJoin = os.time()
	else
		Table.Reconcile(profile.Data, Template)
		migrate(profile.Data)
	end
	profile.Data.Stats.Joins += 1

	profile.OnLockLost = function()
		if player.Parent == Players then
			player:Kick("Your data was opened in another server. Please rejoin.")
		end
	end
	profile.OnReleaseRequested = function()
		-- another server is waiting for this profile; the player is joining there
		if player.Parent == Players then
			player:Kick("You joined another SKYLINE CITY server.")
		end
	end

	profiles[player] = profile
	player:SetAttribute("DataLoaded", true)
	player:SetAttribute("IsNewPlayer", isNew)
	Net.Fire(player, "DataSync", "Full", replicableSnapshot(profile.Data))
	loadedSignalFired[player] = true
	DataService.Loaded:Fire(player, profile.Data)
end

local function releasePlayer(player: Player)
	local profile = profiles[player]
	loadedSignalFired[player] = nil
	if not profile then
		return
	end
	-- let services write their session state synchronously
	for _, conn in ipairs(DataService.Releasing._handlers) do
		if conn.Connected then
			local ok, err = pcall(conn._fn, player, profile.Data)
			if not ok then
				warn("[DataService] Releasing handler error:", err)
			end
		end
	end
	profiles[player] = nil
	releasing[player.UserId] = true
	profile:ReleaseAsync()
	releasing[player.UserId] = nil
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function DataService:GetData(player: Player)
	local p = profiles[player]
	return p and p.Data or nil
end

function DataService:IsLoaded(player: Player): boolean
	return profiles[player] ~= nil
end

function DataService:Get(player: Player, path: string): any
	local data = self:GetData(player)
	if not data then
		return nil
	end
	return Table.GetPath(data, path)
end

function DataService:Set(player: Player, path: string, value: any)
	local data = self:GetData(player)
	if not data then
		warn(("[DataService] Set(%s) before data loaded for %s"):format(path, player.Name))
		return false
	end
	Table.SetPath(data, path, value)
	if not isServerOnlyPath(path) then
		Net.Fire(player, "DataSync", "Set", path, value)
	end
	return true
end

function DataService:Update(player: Player, path: string, fn: (any) -> any)
	local data = self:GetData(player)
	if not data then
		return nil
	end
	local new = fn(Table.GetPath(data, path))
	self:Set(player, path, new)
	return new
end

function DataService:Increment(player: Player, path: string, delta: number): number?
	return self:Update(player, path, function(old)
		return (old or 0) + delta
	end)
end

-- Re-send a whole sub-tree (use after mutating nested tables in place).
function DataService:Replicate(player: Player, path: string)
	local data = self:GetData(player)
	if not data or isServerOnlyPath(path) then
		return
	end
	Net.Fire(player, "DataSync", "Set", path, Table.GetPath(data, path))
end

function DataService:WaitForData(player: Player, timeout: number?)
	local limit = timeout or 30
	local t = 0
	while not profiles[player] and player.Parent == Players and t < limit do
		task.wait(0.1)
		t += 0.1
	end
	return self:GetData(player)
end

function DataService:OnLoaded(fn: (Player, any) -> ())
	for player, profile in pairs(profiles) do
		if loadedSignalFired[player] then
			task.spawn(fn, player, profile.Data)
		end
	end
	return DataService.Loaded:Connect(fn)
end

function DataService:SaveNow(player: Player): boolean
	local profile = profiles[player]
	if not profile then
		return false
	end
	return profile:SaveAsync()
end

function DataService:GetPlayers(): { Player }
	local out = {}
	for player in pairs(profiles) do
		table.insert(out, player)
	end
	return out
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function DataService:Init()
	store = ProfileStore.new(Economy.DataStoreName)
	Net.Declare("DataSync")
	Net.Declare("Notify")
	Net.Declare("UI")

	-- client can ask for a full resync (e.g. after its UI reloads)
	Net.Handle("Data", function(player, action)
		if action == "Resync" then
			local data = self:GetData(player)
			if data then
				Net.Fire(player, "DataSync", "Full", replicableSnapshot(data))
			end
			return { ok = data ~= nil }
		end
		return { ok = false, err = "Unknown action" }
	end, { rate = 0.2, burst = 2 })

	Players.PlayerAdded:Connect(function(player)
		loadPlayer(player)
	end)
	for _, player in ipairs(Players:GetPlayers()) do
		task.spawn(loadPlayer, player)
	end
	Players.PlayerRemoving:Connect(releasePlayer)

	game:BindToClose(function()
		if RunService:IsStudio() and ProfileStore.IsMock() then
			return
		end
		local pending = 0
		for _, player in ipairs(Players:GetPlayers()) do
			if profiles[player] then
				pending += 1
				task.spawn(function()
					releasePlayer(player)
					pending -= 1
				end)
			end
		end
		local t = 0
		while pending > 0 and t < 25 do
			task.wait(0.25)
			t += 0.25
		end
	end)
end

function DataService:Start()
	-- playtime tracking (once per 10s, cheap)
	task.spawn(function()
		while true do
			task.wait(10)
			for player, profile in pairs(profiles) do
				if profile:IsActive() then
					profile.Data.Stats.PlaytimeSeconds += 10
				end
			end
		end
	end)

	-- staggered autosave
	task.spawn(function()
		while true do
			task.wait(Economy.AutoSaveInterval)
			local list = {}
			for player, profile in pairs(profiles) do
				table.insert(list, { player, profile })
			end
			local gap = math.clamp(Economy.AutoSaveInterval * 0.5 / math.max(1, #list), 0.1, 5)
			for _, entry in ipairs(list) do
				local player, profile = entry[1], entry[2]
				if profiles[player] == profile and profile:IsActive() then
					task.spawn(function()
						profile:SaveAsync()
					end)
				end
				task.wait(gap)
			end
		end
	end)
end

return DataService
