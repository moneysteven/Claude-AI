-- Lightweight Signal implementation (no BindableEvents, no instance churn).
-- Usage:
--   local s = Signal.new()
--   local conn = s:Connect(function(a, b) end)
--   s:Fire(1, 2)
--   conn:Disconnect()

local Signal = {}
Signal.__index = Signal

local Connection = {}
Connection.__index = Connection

function Connection:Disconnect()
	if not self.Connected then
		return
	end
	self.Connected = false
	local list = self._signal._handlers
	for i, c in ipairs(list) do
		if c == self then
			table.remove(list, i)
			break
		end
	end
end

function Signal.new()
	return setmetatable({ _handlers = {} }, Signal)
end

function Signal:Connect(fn)
	local conn = setmetatable({ Connected = true, _fn = fn, _signal = self }, Connection)
	table.insert(self._handlers, conn)
	return conn
end

function Signal:Once(fn)
	local conn
	conn = self:Connect(function(...)
		conn:Disconnect()
		fn(...)
	end)
	return conn
end

function Signal:Fire(...)
	-- copy so handlers can disconnect while firing
	local snapshot = table.clone(self._handlers)
	for _, conn in ipairs(snapshot) do
		if conn.Connected then
			task.spawn(conn._fn, ...)
		end
	end
end

function Signal:Wait()
	local thread = coroutine.running()
	self:Once(function(...)
		task.spawn(thread, ...)
	end)
	return coroutine.yield()
end

function Signal:DisconnectAll()
	for _, conn in ipairs(self._handlers) do
		conn.Connected = false
	end
	table.clear(self._handlers)
end

return Signal
