-- Object pool: reuse instances instead of creating/destroying them every time.
--   local pool = Pool.new(function() return template:Clone() end, 20)
--   local obj = pool:Get()      -- parent it yourself
--   pool:Release(obj)           -- unparents and stores for reuse

local Pool = {}
Pool.__index = Pool

function Pool.new(factory: () -> Instance, prewarm: number?, maxSize: number?)
	local self = setmetatable({ _factory = factory, _free = {}, _max = maxSize or 200 }, Pool)
	for _ = 1, prewarm or 0 do
		table.insert(self._free, factory())
	end
	return self
end

function Pool:Get(): Instance
	local obj = table.remove(self._free)
	if obj then
		return obj
	end
	return self._factory()
end

function Pool:Release(obj: Instance)
	if not obj then
		return
	end
	obj.Parent = nil
	if #self._free < self._max then
		table.insert(self._free, obj)
	else
		obj:Destroy()
	end
end

function Pool:Size(): number
	return #self._free
end

function Pool:Clear()
	for _, obj in ipairs(self._free) do
		obj:Destroy()
	end
	table.clear(self._free)
end

return Pool
