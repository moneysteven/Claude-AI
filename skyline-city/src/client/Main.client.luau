-- SKYLINE CITY — client bootstrap.
-- Loads ClientData, the UI kit and every controller in Client/Controllers (and one level of sub-folders).

local Players = game:GetService("Players")

local Client = script.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))

ClientData.Start()
Router.Start()

local loaded = {}

local function load(module: ModuleScript)
	local ok, c = pcall(require, module)
	if not ok then
		warn(("[Client] failed to require %s: %s"):format(module:GetFullName(), tostring(c)))
		return
	end
	if type(c) ~= "table" then
		return
	end
	local name = c.Name or module.Name
	if not name:match("Controller$") then
		return
	end
	c.Name = name
	Registry.Register(name, c)
	table.insert(loaded, c)
end

local folder = Client:WaitForChild("Controllers")
for _, child in ipairs(folder:GetChildren()) do
	if child:IsA("ModuleScript") then
		load(child)
	elseif child:IsA("Folder") then
		for _, sub in ipairs(child:GetChildren()) do
			if sub:IsA("ModuleScript") then
				load(sub)
			end
		end
	end
end

table.sort(loaded, function(a, b)
	local pa, pb = a.Priority or 100, b.Priority or 100
	if pa == pb then
		return a.Name < b.Name
	end
	return pa < pb
end)

for _, c in ipairs(loaded) do
	if type(c.Init) == "function" then
		local ok, err = pcall(c.Init, c)
		if not ok then
			warn(("[Client] %s:Init failed: %s"):format(c.Name, tostring(err)))
		end
	end
end

-- Most controllers need data; wait for the first full sync (bounded).
ClientData.WaitForLoad(30)

for _, c in ipairs(loaded) do
	if type(c.Start) == "function" then
		task.spawn(function()
			local ok, err = pcall(c.Start, c)
			if not ok then
				warn(("[Client] %s:Start failed: %s"):format(c.Name, tostring(err)))
			end
		end)
	end
end

print(("[SKYLINE CITY] client started with %d controllers for %s"):format(#loaded, Players.LocalPlayer.Name))
