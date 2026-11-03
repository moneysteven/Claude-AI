-- ProfileStore: session-locked DataStore profiles (ProfileService-style).
--
-- Guarantees:
--   * Only ONE server owns a player's profile at a time (session lock stored inside the record).
--   * A server that lost its lock (another server stole it after a crash) will NEVER overwrite data.
--   * Every DataStore call retries with exponential backoff and respects request budgets.
--   * In Studio without API access, falls back to an in-memory mock store (with a warning).
--
-- Record layout in the DataStore:
--   { Data = <player data>, Meta = { Lock = { Session = guid, Time = os.time() } | nil,
--                                    SaveCount = n, LastSave = os.time(), Created = os.time() } }
--
-- API
--   local store = ProfileStore.new(storeName)
--   local profile = store:LoadAsync(key, isStillWanted?)  -- nil on failure; isStillWanted() lets you abort if the player left
--   profile.Data               -- mutate freely, then SaveAsync
--   profile:SaveAsync()        -> boolean
--   profile:ReleaseAsync()     -> boolean (saves + clears lock; profile becomes inactive)
--   profile:IsActive()         -> boolean
--   profile.OnLockLost         -- set to a function; called if another session took the lock

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local MessagingService = game:GetService("MessagingService")
local RunService = game:GetService("RunService")

local ProfileStore = {}
ProfileStore.__index = ProfileStore

local Profile = {}
Profile.__index = Profile

local SESSION_ID = HttpService:GenerateGUID(false)
local LOCK_STALE_SECONDS = 15 * 60 -- a lock not refreshed for 15 min is considered dead (autosave refreshes every 2 min)
local LOAD_ATTEMPTS = 8
local RELEASE_TOPIC = "SkylineProfileRelease"

ProfileStore.SessionId = SESSION_ID

---------------------------------------------------------------------------
-- Mock store for Studio without API access
---------------------------------------------------------------------------
local MockStore = {}
MockStore.__index = MockStore
local mockData: { [string]: { [string]: any } } = {}

function MockStore.new(name)
	mockData[name] = mockData[name] or {}
	return setmetatable({ _d = mockData[name] }, MockStore)
end

function MockStore:UpdateAsync(key, fn)
	local current = self._d[key]
	local copy = current and HttpService:JSONDecode(HttpService:JSONEncode(current)) or nil
	local result = fn(copy)
	if result ~= nil then
		self._d[key] = HttpService:JSONDecode(HttpService:JSONEncode(result))
	end
	return result
end

function MockStore:GetAsync(key)
	return self._d[key]
end

local useMock: boolean? = nil
local function shouldUseMock(): boolean
	if useMock ~= nil then
		return useMock
	end
	if not RunService:IsStudio() then
		useMock = false
		return false
	end
	local ok, err = pcall(function()
		DataStoreService:GetDataStore("__SkylineProbe"):GetAsync("probe")
	end)
	useMock = not ok
	if useMock then
		warn(
			"[ProfileStore] DataStores unavailable in Studio ("
				.. tostring(err)
				.. "). Using an in-memory MOCK store — data will NOT persist. "
				.. "Enable Game Settings > Security > 'Enable Studio Access to API Services' to test saving."
		)
	end
	return useMock
end

---------------------------------------------------------------------------
-- Retry helper
---------------------------------------------------------------------------
local function waitForBudget(requestType: Enum.DataStoreRequestType)
	if useMock then
		return
	end
	local waited = 0
	while DataStoreService:GetRequestBudgetForRequestType(requestType) < 1 and waited < 30 do
		task.wait(1)
		waited += 1
	end
end

-- Calls fn() up to `attempts` times with exponential backoff (1,2,4,8,16s capped).
local function retry(attempts: number, requestType: Enum.DataStoreRequestType, fn: () -> any): (boolean, any)
	local lastErr
	for attempt = 1, attempts do
		waitForBudget(requestType)
		local ok, result = pcall(fn)
		if ok then
			return true, result
		end
		lastErr = result
		warn(("[ProfileStore] attempt %d/%d failed: %s"):format(attempt, attempts, tostring(result)))
		if attempt < attempts then
			task.wait(math.min(16, 2 ^ (attempt - 1)))
		end
	end
	return false, lastErr
end

---------------------------------------------------------------------------
-- Cross-server release requests: when a player joins server B while server A still
-- holds their lock (they just left A), B asks A to save and release immediately.
---------------------------------------------------------------------------
local activeProfiles: { [string]: any } = {} -- key -> Profile (owned by this server)
local releaseListenerStarted = false

local function startReleaseListener()
	if releaseListenerStarted or shouldUseMock() then
		return
	end
	releaseListenerStarted = true
	task.spawn(function()
		local ok, err = pcall(function()
			MessagingService:SubscribeAsync(RELEASE_TOPIC, function(message)
				local data = message.Data
				if type(data) ~= "table" or data.Session == SESSION_ID then
					return
				end
				local profile = activeProfiles[data.Key]
				if profile and profile:IsActive() then
					-- another server wants this profile: the player must have left us / joined there
					if profile.OnReleaseRequested then
						task.spawn(profile.OnReleaseRequested)
					else
						profile:ReleaseAsync()
					end
				end
			end)
		end)
		if not ok then
			warn("[ProfileStore] MessagingService subscribe failed:", err)
		end
	end)
end

local function requestRelease(key: string)
	if shouldUseMock() then
		return
	end
	pcall(function()
		MessagingService:PublishAsync(RELEASE_TOPIC, { Key = key, Session = SESSION_ID })
	end)
end

---------------------------------------------------------------------------
-- ProfileStore
---------------------------------------------------------------------------
function ProfileStore.new(name: string)
	local self = setmetatable({}, ProfileStore)
	self.Name = name
	if shouldUseMock() then
		self._ds = MockStore.new(name)
	else
		self._ds = DataStoreService:GetDataStore(name)
	end
	startReleaseListener()
	return self
end

function ProfileStore:LoadAsync(key: string, isStillWanted: (() -> boolean)?)
	local ds = self._ds
	for attempt = 1, LOAD_ATTEMPTS do
		if isStillWanted and not isStillWanted() then
			return nil
		end
		local lockedBy: string? = nil
		local loadedRecord = nil
		local now = os.time()
		-- on the final attempt, steal the lock (owner ignored release requests: crashed or hung)
		local forceSteal = attempt >= LOAD_ATTEMPTS

		local ok, err = retry(5, Enum.DataStoreRequestType.UpdateAsync, function()
			return ds:UpdateAsync(key, function(record)
				lockedBy = nil
				loadedRecord = nil
				record = record or { Data = nil, Meta = { SaveCount = 0, Created = now } }
				record.Meta = record.Meta or { SaveCount = 0, Created = now }
				local lock = record.Meta.Lock
				if lock and lock.Session ~= SESSION_ID then
					local age = now - (lock.Time or 0)
					if age < LOCK_STALE_SECONDS and not forceSteal then
						lockedBy = lock.Session
						return nil -- abort write, keep their lock
					end
				end
				record.Meta.Lock = { Session = SESSION_ID, Time = now }
				loadedRecord = record
				return record
			end)
		end)

		if not ok then
			warn(("[ProfileStore] could not load %s: %s"):format(key, tostring(err)))
			return nil
		end

		if loadedRecord then
			local profile = setmetatable({
				Key = key,
				Data = loadedRecord.Data, -- may be nil for new players; caller fills from template
				Meta = loadedRecord.Meta,
				_store = self,
				_active = true,
				_saving = false,
				OnLockLost = nil,
				OnReleaseRequested = nil,
			}, Profile)
			activeProfiles[key] = profile
			return profile
		end

		if lockedBy then
			-- ask the owning server to let go, then wait and retry
			requestRelease(key)
			task.wait(math.min(10, 2 + attempt * 1.5))
		end
	end
	return nil
end

---------------------------------------------------------------------------
-- Profile
---------------------------------------------------------------------------
function Profile:IsActive(): boolean
	return self._active
end

local function writeProfile(profile, release: boolean): boolean
	if not profile._active then
		return false
	end
	-- serialise concurrent saves
	local guard = 0
	while profile._saving and guard < 60 do
		task.wait(0.5)
		guard += 1
	end
	if not profile._active then
		return false
	end
	profile._saving = true
	local lostLock = false
	local data = profile.Data
	local ok, err = retry(release and 6 or 4, Enum.DataStoreRequestType.UpdateAsync, function()
		return profile._store._ds:UpdateAsync(profile.Key, function(record)
			lostLock = false
			record = record or { Meta = { SaveCount = 0, Created = os.time() } }
			record.Meta = record.Meta or { SaveCount = 0, Created = os.time() }
			local lock = record.Meta.Lock
			if lock and lock.Session ~= SESSION_ID then
				lostLock = true
				return nil -- someone else owns it now; never overwrite their data
			end
			record.Data = data
			record.Meta.SaveCount = (record.Meta.SaveCount or 0) + 1
			record.Meta.LastSave = os.time()
			if release then
				record.Meta.Lock = nil
			else
				record.Meta.Lock = { Session = SESSION_ID, Time = os.time() }
			end
			return record
		end)
	end)
	profile._saving = false

	if lostLock then
		profile._active = false
		activeProfiles[profile.Key] = nil
		warn(("[ProfileStore] lock for %s was taken by another session; this copy is now read-only"):format(profile.Key))
		if profile.OnLockLost then
			task.spawn(profile.OnLockLost)
		end
		return false
	end
	if not ok then
		warn(("[ProfileStore] save failed for %s: %s"):format(profile.Key, tostring(err)))
		return false
	end
	if release then
		profile._active = false
		activeProfiles[profile.Key] = nil
	end
	return true
end

function Profile:SaveAsync(): boolean
	return writeProfile(self, false)
end

function Profile:ReleaseAsync(): boolean
	return writeProfile(self, true)
end

---------------------------------------------------------------------------
-- Generic (non-player) store helper with retries, e.g. leaderboards / global feed
---------------------------------------------------------------------------
function ProfileStore.Retry(attempts: number, requestType: Enum.DataStoreRequestType, fn: () -> any): (boolean, any)
	shouldUseMock()
	return retry(attempts, requestType, fn)
end

function ProfileStore.IsMock(): boolean
	return shouldUseMock()
end

return ProfileStore
