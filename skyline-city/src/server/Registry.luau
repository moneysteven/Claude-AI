-- Service registry. Services are ModuleScripts in Server/Services that return a table:
--
--   local MyService = { Name = "MyService" }
--   function MyService:Init() end   -- runs first for every service (no cross-service calls that need Start)
--   function MyService:Start() end  -- runs after ALL services have Init'd (safe to call other services)
--   return MyService
--
-- Access other services ONLY inside Init/Start/handlers (never at require time):
--   local Registry = require(ServerScriptService.Server.Registry)
--   local Economy = Registry.Get("EconomyService")
--
-- Registry.Find(name) returns nil instead of erroring (for optional integrations).

local Registry = {}

local services: { [string]: any } = {}
local started = false

function Registry.Register(name: string, service: any)
	assert(services[name] == nil, "Duplicate service: " .. name)
	services[name] = service
end

function Registry.Get(name: string): any
	local s = services[name]
	if not s then
		error(("[Registry] service '%s' does not exist"):format(name), 2)
	end
	return s
end

function Registry.Find(name: string): any?
	return services[name]
end

function Registry.All(): { [string]: any }
	return services
end

function Registry.IsStarted(): boolean
	return started
end

function Registry._markStarted()
	started = true
end

return Registry
