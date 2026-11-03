-- SKYLINE CITY — server bootstrap.
-- Loads every ModuleScript in Server/Services (and one level of sub-folders),
-- calls :Init() on all of them (ordered by `Priority`, lower first), then :Start().

local ServerScriptService = game:GetService("ServerScriptService")

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server:WaitForChild("Registry"))

local servicesFolder = Server:WaitForChild("Services")

local loaded = {}

local function loadModule(module: ModuleScript)
	local ok, service = pcall(require, module)
	if not ok then
		warn(("[Main] failed to require %s: %s"):format(module:GetFullName(), tostring(service)))
		return
	end
	if type(service) ~= "table" then
		return -- helper module, not a service
	end
	local name = service.Name or module.Name
	if not name:match("Service$") then
		return -- only *Service modules are services; others are helpers living next to them
	end
	service.Name = name
	Registry.Register(name, service)
	table.insert(loaded, service)
end

for _, child in ipairs(servicesFolder:GetChildren()) do
	if child:IsA("ModuleScript") then
		loadModule(child)
	elseif child:IsA("Folder") then
		for _, sub in ipairs(child:GetChildren()) do
			if sub:IsA("ModuleScript") and sub.Name:match("Service$") then
				loadModule(sub)
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

for _, service in ipairs(loaded) do
	if type(service.Init) == "function" then
		local t = os.clock()
		local ok, err = pcall(service.Init, service)
		if not ok then
			warn(("[Main] %s:Init failed: %s"):format(service.Name, tostring(err)))
		elseif os.clock() - t > 1 then
			warn(("[Main] %s:Init took %.2fs"):format(service.Name, os.clock() - t))
		end
	end
end

for _, service in ipairs(loaded) do
	if type(service.Start) == "function" then
		task.spawn(function()
			local ok, err = pcall(service.Start, service)
			if not ok then
				warn(("[Main] %s:Start failed: %s"):format(service.Name, tostring(err)))
			end
		end)
	end
end

Registry._markStarted()
print(("[SKYLINE CITY] server started with %d services"):format(#loaded))
