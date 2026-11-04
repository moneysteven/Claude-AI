-- Net: the ONLY way client and server talk to each other.
--
-- Remotes are created lazily on the server the first time a handler is registered,
-- so there is no central list to keep in sync. The client waits for them.
--
-- SERVER
--   Net.Handle(name, handler, opts)            RemoteFunction. handler(player, action, payload) -> table
--   Net.HandleActions(name, actions, opts)     RemoteFunction dispatching on `action`:
--                                              actions[action](player, payload) -> table
--   Net.On(name, handler, opts)                RemoteEvent client->server. handler(player, ...)
--   Net.Fire(player, name, ...)                RemoteEvent server->client
--   Net.FireAll(name, ...)
--   Net.FireList(players, name, ...)
--   Net.FireUnreliable(player, name, ...) / Net.FireAllUnreliable(name, ...)
--   opts = { rate = 10, burst = 20, perAction = { Deposit = {rate=2, burst=4} } }
--
-- CLIENT
--   Net.Invoke(name, action, payload) -> table  ({ ok = false, err = "..." } on failure)
--   Net.Send(name, ...)                         fire a RemoteEvent to the server
--   Net.SendUnreliable(name, ...)
--   Net.Listen(name, fn)                        server->client events, returns connection
--
-- Every RemoteFunction response is a table with at least `ok: boolean`.
-- Handlers that error are caught and reported as { ok = false, err = "Server error" }.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local IS_SERVER = RunService:IsServer()

local Signal = require(script.Parent:WaitForChild("Util"):WaitForChild("Signal"))

local Net = {}

local FOLDER_NAME = "Remotes"
local folder: Folder? = nil

local function getFolder(): Folder
	if folder then
		return folder
	end
	if IS_SERVER then
		local f = ReplicatedStorage:FindFirstChild(FOLDER_NAME)
		if not f then
			f = Instance.new("Folder")
			f.Name = FOLDER_NAME
			f.Parent = ReplicatedStorage
		end
		folder = f :: Folder
	else
		folder = ReplicatedStorage:WaitForChild(FOLDER_NAME) :: Folder
	end
	return folder :: Folder
end

-- Class prefixes keep RemoteEvent/RemoteFunction names from colliding.
local PREFIX = {
	RemoteFunction = "F_",
	RemoteEvent = "E_",
	UnreliableRemoteEvent = "U_",
}

local function getRemote(name: string, className: string): Instance?
	local f = getFolder()
	local fullName = PREFIX[className] .. name
	local existing = f:FindFirstChild(fullName)
	if existing then
		return existing
	end
	if IS_SERVER then
		local r = Instance.new(className)
		r.Name = fullName
		r.Parent = f
		return r
	end
	local r = f:WaitForChild(fullName, 20)
	if not r then
		warn(("[Net] remote %s was not created by the server within 20s"):format(fullName))
	end
	return r
end

---------------------------------------------------------------------------
-- Rate limiting (server)
---------------------------------------------------------------------------
-- token bucket per player per key
local buckets: { [Player]: { [string]: { tokens: number, last: number } } } = {}

local function allow(player: Player, key: string, rate: number, burst: number): boolean
	local pb = buckets[player]
	if not pb then
		pb = {}
		buckets[player] = pb
	end
	local now = os.clock()
	local b = pb[key]
	if not b then
		b = { tokens = burst, last = now }
		pb[key] = b
	end
	b.tokens = math.min(burst, b.tokens + (now - b.last) * rate)
	b.last = now
	if b.tokens >= 1 then
		b.tokens -= 1
		return true
	end
	return false
end

if IS_SERVER then
	Players.PlayerRemoving:Connect(function(player)
		buckets[player] = nil
	end)
end

-- Spam listeners. Net.OnRateLimited is the single legacy hook (owned by AntiExploitService);
-- any other system can subscribe to Net.RateLimited : Signal(player, remoteName) instead.
Net.OnRateLimited = nil :: ((player: Player, remoteName: string) -> ())?
Net.RateLimited = Signal.new()

local function rateLimited(player: Player, name: string)
	local hook = Net.OnRateLimited
	if hook then
		task.spawn(hook, player, name)
	end
	task.spawn(function()
		Net.RateLimited:Fire(player, name)
	end)
end

---------------------------------------------------------------------------
-- Server API
---------------------------------------------------------------------------
function Net.Handle(name: string, handler: (Player, string, any) -> any, opts: { [string]: any }?)
	assert(IS_SERVER, "Net.Handle is server-only")
	local o = opts or {}
	local rate = o.rate or 8
	local burst = o.burst or (rate * 2)
	local perAction = o.perAction or {}
	local remote = getRemote(name, "RemoteFunction") :: RemoteFunction

	remote.OnServerInvoke = function(player: Player, action: any, payload: any)
		if type(action) ~= "string" or #action > 40 then
			return { ok = false, err = "Bad request" }
		end
		if payload ~= nil and type(payload) ~= "table" then
			return { ok = false, err = "Bad request" }
		end
		if not allow(player, name, rate, burst) then
			rateLimited(player, name)
			return { ok = false, err = "Slow down!" }
		end
		local pa = perAction[action]
		if pa and not allow(player, name .. ":" .. action, pa.rate, pa.burst or pa.rate) then
			rateLimited(player, name .. ":" .. action)
			return { ok = false, err = "Slow down!" }
		end
		local ok, result = pcall(handler, player, action, payload or {})
		if not ok then
			warn(("[Net] %s.%s error for %s: %s"):format(name, action, player.Name, tostring(result)))
			return { ok = false, err = "Server error" }
		end
		if type(result) ~= "table" then
			return { ok = result ~= false }
		end
		if result.ok == nil then
			result.ok = true
		end
		return result
	end
	return remote
end

function Net.HandleActions(name: string, actions: { [string]: (Player, any) -> any }, opts: { [string]: any }?)
	return Net.Handle(name, function(player, action, payload)
		local fn = actions[action]
		if not fn then
			return { ok = false, err = "Unknown action" }
		end
		return fn(player, payload)
	end, opts)
end

function Net.On(name: string, handler: (Player, ...any) -> (), opts: { [string]: any }?)
	assert(IS_SERVER, "Net.On is server-only")
	local o = opts or {}
	local rate = o.rate or 10
	local burst = o.burst or (rate * 2)
	local className = o.unreliable and "UnreliableRemoteEvent" or "RemoteEvent"
	local remote = getRemote(name, className) :: RemoteEvent
	return remote.OnServerEvent:Connect(function(player, ...)
		if not allow(player, "E:" .. name, rate, burst) then
			rateLimited(player, name)
			return
		end
		local ok, err = pcall(handler, player, ...)
		if not ok then
			warn(("[Net] event %s error for %s: %s"):format(name, player.Name, tostring(err)))
		end
	end)
end

-- Make sure a server->client event exists before clients start waiting for it.
function Net.Declare(name: string, unreliable: boolean?)
	getRemote(name, unreliable and "UnreliableRemoteEvent" or "RemoteEvent")
end

function Net.Fire(player: Player, name: string, ...)
	local remote = getRemote(name, "RemoteEvent") :: RemoteEvent
	remote:FireClient(player, ...)
end

function Net.FireAll(name: string, ...)
	local remote = getRemote(name, "RemoteEvent") :: RemoteEvent
	remote:FireAllClients(...)
end

function Net.FireList(players: { Player }, name: string, ...)
	local remote = getRemote(name, "RemoteEvent") :: RemoteEvent
	for _, p in ipairs(players) do
		remote:FireClient(p, ...)
	end
end

function Net.FireUnreliable(player: Player, name: string, ...)
	local remote = getRemote(name, "UnreliableRemoteEvent") :: UnreliableRemoteEvent
	remote:FireClient(player, ...)
end

function Net.FireAllUnreliable(name: string, ...)
	local remote = getRemote(name, "UnreliableRemoteEvent") :: UnreliableRemoteEvent
	remote:FireAllClients(...)
end

---------------------------------------------------------------------------
-- Client API
---------------------------------------------------------------------------
function Net.Invoke(name: string, action: string, payload: { [string]: any }?): { [string]: any }
	assert(not IS_SERVER, "Net.Invoke is client-only")
	local remote = getRemote(name, "RemoteFunction") :: RemoteFunction?
	if not remote then
		return { ok = false, err = "Service unavailable" }
	end
	local ok, result = pcall(function()
		return (remote :: RemoteFunction):InvokeServer(action, payload)
	end)
	if not ok then
		return { ok = false, err = "Connection error" }
	end
	if type(result) ~= "table" then
		return { ok = false, err = "Bad response" }
	end
	return result
end

function Net.Send(name: string, ...)
	assert(not IS_SERVER, "Net.Send is client-only")
	local remote = getRemote(name, "RemoteEvent") :: RemoteEvent?
	if remote then
		(remote :: RemoteEvent):FireServer(...)
	end
end

function Net.SendUnreliable(name: string, ...)
	assert(not IS_SERVER, "Net.SendUnreliable is client-only")
	local remote = getRemote(name, "UnreliableRemoteEvent") :: UnreliableRemoteEvent?
	if remote then
		(remote :: UnreliableRemoteEvent):FireServer(...)
	end
end

function Net.Listen(name: string, fn: (...any) -> (), unreliable: boolean?): RBXScriptConnection?
	assert(not IS_SERVER, "Net.Listen is client-only")
	local remote = getRemote(name, unreliable and "UnreliableRemoteEvent" or "RemoteEvent") :: RemoteEvent?
	if not remote then
		return nil
	end
	return (remote :: RemoteEvent).OnClientEvent:Connect(fn)
end

return Net
