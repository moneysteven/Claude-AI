-- Client controller registry. Controllers are ModuleScripts in Client/Controllers returning:
--   local C = { Name = "HUDController", Priority = 100 }
--   function C:Init() end   -- register UI panels, read config
--   function C:Start() end  -- connect events, call other controllers
--   return C
-- Access peers inside Init/Start only:  Registry.Get("PhoneController")

local Registry = {}
local controllers: { [string]: any } = {}

function Registry.Register(name: string, c: any)
	assert(controllers[name] == nil, "Duplicate controller: " .. name)
	controllers[name] = c
end

function Registry.Get(name: string): any
	local c = controllers[name]
	if not c then
		error(("[Registry] controller '%s' does not exist"):format(name), 2)
	end
	return c
end

function Registry.Find(name: string): any?
	return controllers[name]
end

return Registry
