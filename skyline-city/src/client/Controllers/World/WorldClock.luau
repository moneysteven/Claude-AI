-- WorldClock (client helper): predicted in-game clock between the server's 1 Hz updates.
-- The server publishes Workspace attributes Clock / ClockAt (server time) / ClockRate (hours per second).
--
--   WorldClock.Get() -> number 0..24 (smooth)
--   WorldClock.IsNight(clock?) -> boolean
--   WorldClock.NightAmount(clock?) -> 0..1 (0 = full day, 1 = full night; smooth around dusk/dawn)

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)

local WorldClock = {}

local TIME = World.Time

function WorldClock.Get(): number
	local c = Workspace:GetAttribute("Clock")
	local at = Workspace:GetAttribute("ClockAt")
	local rate = Workspace:GetAttribute("ClockRate")
	if type(c) ~= "number" or type(at) ~= "number" or type(rate) ~= "number" then
		return Lighting.ClockTime
	end
	local elapsed = math.clamp(Workspace:GetServerTimeNow() - at, 0, 5)
	return (c + elapsed * rate) % 24
end

function WorldClock.IsNight(clock: number?): boolean
	local c = clock or WorldClock.Get()
	return c >= TIME.NightStart or c < TIME.NightEnd
end

function WorldClock.NightAmount(clock: number?): number
	local c = clock or WorldClock.Get()
	local fade = 0.75 -- in-game hours of dusk / dawn blending
	if c >= TIME.NightStart or c < TIME.NightEnd then
		return 1
	end
	if c >= TIME.NightStart - fade then
		return (c - (TIME.NightStart - fade)) / fade
	end
	if c < TIME.NightEnd + fade then
		return 1 - (c - TIME.NightEnd) / fade
	end
	return 0
end

return WorldClock
