-- Upgrades: performance-upgrade levels for the car being driven + the physics multipliers they give.
--
--   Upgrades.GetLevels(model) -> { Engine, Turbo, Brakes, Suspension, Transmission }  (0..3)
--   Upgrades.Multipliers(levels) -> { Power, TurboPower, Grip, Brake, Stiffness, ShiftSpeed, TopSpeed }
--   Upgrades.Watch(model, fn) -> connection-like { Disconnect }  (fn(levels) when data changes)
--
-- Levels come from ClientData Vehicles[uid].Upgrades when the local player owns the car, otherwise
-- from model attributes "Up_Engine", "Up_Turbo", ... (set by the server for other people's cars).
-- Multipliers come from Config/Tuning (Tuning.Upgrades[cat][level]); if Tuning is missing the
-- fallback table in Config/Driving is used. Everything defaults to 1.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Driving = require(Shared.Config.Driving)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))

local Upgrades = {}

Upgrades.Categories = { "Engine", "Turbo", "Brakes", "Suspension", "Transmission" }

local tuningCache: any = nil
local tuningTried = false

local function getTuning(): any
	if tuningTried then
		return tuningCache
	end
	tuningTried = true
	local module = Shared:FindFirstChild("Config") and Shared.Config:FindFirstChild("Tuning")
	if module and module:IsA("ModuleScript") then
		local ok, t = pcall(require, module)
		if ok and type(t) == "table" and type(t.Upgrades) == "table" then
			tuningCache = t.Upgrades
		end
	end
	return tuningCache
end

local function level(v: any): number
	if type(v) ~= "number" then
		return 0
	end
	return math.clamp(math.floor(v), 0, 3)
end

function Upgrades.GetLevels(model: Model): { [string]: number }
	local out = {}
	local uid = model:GetAttribute("CarUid")
	local owner = model:GetAttribute("OwnerUserId")
	local data = nil
	if type(uid) == "string" and owner == Players.LocalPlayer.UserId then
		data = ClientData.Get("Vehicles." .. uid .. ".Upgrades")
	end
	for _, cat in ipairs(Upgrades.Categories) do
		if type(data) == "table" and data[cat] ~= nil then
			out[cat] = level(data[cat])
		else
			out[cat] = level(model:GetAttribute("Up_" .. cat))
		end
	end
	return out
end

-- Find the entry for a level in a category table that may be 0-indexed, 1-indexed (levels 1..3)
-- or 1-indexed including level 0 (4 entries).
local function entryFor(catTable: any, lvl: number): any
	if type(catTable) ~= "table" then
		return nil
	end
	if catTable[0] ~= nil then
		return catTable[lvl]
	end
	if catTable[tostring(lvl)] ~= nil then
		return catTable[tostring(lvl)]
	end
	local n = #catTable
	if n >= 4 then
		return catTable[lvl + 1]
	end
	if lvl == 0 then
		return nil
	end
	return catTable[lvl]
end

-- Field names a Tuning entry may use for each of our multiplier keys, in priority order. Only the FIRST
-- present alias counts, so an entry that lists both Power and Torque (Config/Tuning does) is not
-- applied twice (torque x power would double-count the same engine gain).
local FIELD_ALIASES = {
	Power = { "Power", "Horsepower", "Torque", "Acceleration", "Boost" },
	Grip = { "Grip", "Handling", "Traction" },
	Brake = { "Brake", "Brakes", "BrakeForce", "Braking" },
	Stiffness = { "Stiffness", "Suspension" },
	TopSpeed = { "TopSpeed", "MaxSpeed" },
}

-- `Multiplier` field (single number) maps to the category's main stat
local CATEGORY_MAIN = {
	Engine = "Power",
	Turbo = "Power",
	Brakes = "Brake",
	Suspension = "Grip",
	Transmission = "ShiftSpeed",
}

local function validMult(v: any): boolean
	return type(v) == "number" and v == v and v > 0 and v < 20
end

local function apply(m: { [string]: number }, cat: string, key: string, value: number)
	if key == "Power" and cat == "Turbo" then
		m.TurboPower *= value
	else
		m[key] *= value
	end
end

function Upgrades.Multipliers(levels: { [string]: number }): { [string]: number }
	local m = { Power = 1, TurboPower = 1, Grip = 1, Brake = 1, Stiffness = 1, ShiftSpeed = 1, TopSpeed = 1 }
	local tuning = getTuning() or Driving.FallbackUpgrades
	for _, cat in ipairs(Upgrades.Categories) do
		local lvl = levels[cat] or 0
		local entry = entryFor(tuning[cat], lvl)
		if type(entry) == "table" then
			for key, aliases in pairs(FIELD_ALIASES) do
				for _, field in ipairs(aliases) do
					local value = entry[field]
					if validMult(value) then
						apply(m, cat, key, value)
						break
					end
				end
			end
			-- gearbox: ShiftTime (< 1 = faster) or ShiftSpeed (> 1 = faster)
			if validMult(entry.ShiftTime) then
				m.ShiftSpeed *= 1 / entry.ShiftTime
			elseif validMult(entry.ShiftSpeed) then
				m.ShiftSpeed *= entry.ShiftSpeed
			end
			if validMult(entry.Multiplier) then
				apply(m, cat, CATEGORY_MAIN[cat], entry.Multiplier)
			end
		elseif validMult(entry) then
			apply(m, cat, CATEGORY_MAIN[cat], entry :: number)
		end
	end
	return m
end

function Upgrades.Watch(model: Model, fn: ({ [string]: number }) -> ())
	local conns = {}
	local uid = model:GetAttribute("CarUid")
	if type(uid) == "string" and model:GetAttribute("OwnerUserId") == Players.LocalPlayer.UserId then
		table.insert(conns, ClientData.OnChanged("Vehicles." .. uid .. ".Upgrades", function()
			fn(Upgrades.GetLevels(model))
		end))
	end
	for _, cat in ipairs(Upgrades.Categories) do
		table.insert(conns, model:GetAttributeChangedSignal("Up_" .. cat):Connect(function()
			fn(Upgrades.GetLevels(model))
		end))
	end
	return {
		Disconnect = function()
			for _, c in ipairs(conns) do
				c:Disconnect()
			end
			table.clear(conns)
		end,
	}
end

return Upgrades
