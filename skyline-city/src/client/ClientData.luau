-- ClientData: read-only mirror of the local player's saved data (sent by DataService).
--
--   ClientData.Get("Cash") / ClientData.Get("Vehicles.v_1.Fuel")
--   ClientData.Data                       -- whole table (read only!)
--   ClientData.OnChanged("Cash", fn)      -- fn(newValue) — fires when the path, a parent or a child changes;
--                                            also fires once immediately if data is already loaded
--   ClientData.IsLoaded() / ClientData.WaitForLoad(timeout)
--   ClientData.Loaded : Signal()
--
-- NEVER write to this table to change gameplay — ask the server through Net.Invoke.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Table = require(Shared.Util.Table)

local ClientData = {}
ClientData.Data = {}
ClientData.Loaded = Signal.new()

local loaded = false
local listeners: { { path: string, fn: (any) -> () } } = {}

local function related(a: string, b: string): boolean
	-- true if a == b, a is a parent of b, or b is a parent of a
	if a == b or a == "" or b == "" then
		return true
	end
	if #a < #b then
		return b:sub(1, #a + 1) == a .. "."
	else
		return a:sub(1, #b + 1) == b .. "."
	end
end

local function notify(changedPath: string)
	for _, l in ipairs(table.clone(listeners)) do
		if related(l.path, changedPath) then
			task.spawn(l.fn, Table.GetPath(ClientData.Data, l.path))
		end
	end
end

function ClientData.Get(path: string): any
	return Table.GetPath(ClientData.Data, path)
end

function ClientData.IsLoaded(): boolean
	return loaded
end

function ClientData.WaitForLoad(timeout: number?): boolean
	local t = 0
	local limit = timeout or 30
	while not loaded and t < limit do
		task.wait(0.1)
		t += 0.1
	end
	return loaded
end

function ClientData.OnChanged(path: string, fn: (any) -> ())
	local entry = { path = path, fn = fn }
	table.insert(listeners, entry)
	if loaded then
		task.spawn(fn, ClientData.Get(path))
	end
	return {
		Disconnect = function()
			local i = table.find(listeners, entry)
			if i then
				table.remove(listeners, i)
			end
		end,
	}
end

function ClientData.Start()
	Net.Listen("DataSync", function(kind, a, b)
		if kind == "Full" then
			ClientData.Data = a or {}
			local first = not loaded
			loaded = true
			notify("")
			if first then
				ClientData.Loaded:Fire()
			end
		elseif kind == "Set" then
			if type(a) == "string" then
				Table.SetPath(ClientData.Data, a, b)
				notify(a)
			end
		end
	end)
	-- the server may have sent "Full" before we connected — ask again until loaded
	task.spawn(function()
		local Players = game:GetService("Players")
		local player = Players.LocalPlayer
		for _ = 1, 20 do
			if loaded then
				return
			end
			if player:GetAttribute("DataLoaded") then
				Net.Invoke("Data", "Resync")
			end
			task.wait(3)
		end
	end)
end

return ClientData
