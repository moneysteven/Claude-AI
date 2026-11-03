-- Maid: collects connections / instances / cleanup functions and destroys them together.
--   local maid = Maid.new()
--   maid:Give(part.Touched:Connect(...))
--   maid:Give(function() print("cleanup") end)
--   maid:Clean()

local Maid = {}
Maid.__index = Maid

function Maid.new()
	return setmetatable({ _tasks = {} }, Maid)
end

function Maid:Give(task_)
	if task_ == nil then
		return nil
	end
	table.insert(self._tasks, task_)
	return task_
end

local function cleanup(t)
	local kind = typeof(t)
	if kind == "function" then
		t()
	elseif kind == "RBXScriptConnection" then
		t:Disconnect()
	elseif kind == "Instance" then
		t:Destroy()
	elseif kind == "thread" then
		pcall(task.cancel, t)
	elseif kind == "table" then
		if type(t.Destroy) == "function" then
			t:Destroy()
		elseif type(t.Disconnect) == "function" then
			t:Disconnect()
		elseif type(t.Clean) == "function" then
			t:Clean()
		end
	end
end

function Maid:Clean()
	local tasks = self._tasks
	self._tasks = {}
	for i = #tasks, 1, -1 do
		local ok, err = pcall(cleanup, tasks[i])
		if not ok then
			warn("[Maid] cleanup error:", err)
		end
	end
end

Maid.Destroy = Maid.Clean

return Maid
