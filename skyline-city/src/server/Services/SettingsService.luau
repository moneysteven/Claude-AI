-- SettingsService: validated per-player settings (stored in data.Settings, see DataTemplate.Settings).
--
-- Remote domain "Settings":
--   Set { Key, Value } -> { Key, Value }   (only whitelisted keys; type + range checked; numbers rounded)
--
-- API (server):
--   SettingsService:Get(player, key) -> any

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Template = require(Shared.DataTemplate)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local SettingsService = {
	Name = "SettingsService",
	Priority = 40,
}

local DataService

-- Whitelist. Every key must exist in DataTemplate.Settings.
--   kind = "volume" (0..1 number, rounded to 0.01) | "bool" | "enum" (Options set)
local SCHEMA: { [string]: { kind: string, options: { [string]: boolean }? } } = {
	MusicVolume = { kind = "volume" },
	SfxVolume = { kind = "volume" },
	RadioVolume = { kind = "volume" },
	ShowNameTags = { kind = "bool" },
	LowGraphics = { kind = "bool" },
	CameraShake = { kind = "bool" },
	Units = { kind = "enum", options = { MPH = true, KMH = true } },
	ManualTransmission = { kind = "bool" },
	HideVipChatTag = { kind = "bool" },
}

local function validate(key: string, value: any): (boolean, any)
	local spec = SCHEMA[key]
	if not spec then
		return false, nil
	end
	if spec.kind == "volume" then
		local n = Guard.Number(value, 0, 1)
		if n == nil then
			return false, nil
		end
		return true, math.floor(n * 100 + 0.5) / 100
	elseif spec.kind == "bool" then
		local b = Guard.Bool(value)
		if b == nil then
			return false, nil
		end
		return true, b
	elseif spec.kind == "enum" then
		local s = Guard.Id(value, 16)
		if not s or not (spec.options :: { [string]: boolean })[s] then
			return false, nil
		end
		return true, s
	end
	return false, nil
end

function SettingsService:Get(player: Player, key: string): any
	if not SCHEMA[key] then
		return nil
	end
	local v = DataService:Get(player, "Settings." .. key)
	if v == nil then
		return Template.Settings[key]
	end
	return v
end

function SettingsService:Init()
	DataService = Registry.Get("DataService")

	for key in pairs(SCHEMA) do
		if Template.Settings[key] == nil then
			warn("[SettingsService] schema key missing from DataTemplate.Settings: " .. key)
		end
	end

	Net.HandleActions("Settings", {
		Set = function(player: Player, payload)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			local key = Guard.Id(payload.Key, 32)
			if not key or not SCHEMA[key] then
				return { ok = false, err = "Unknown setting" }
			end
			local valid, value = validate(key, payload.Value)
			if not valid then
				return { ok = false, err = "Invalid value" }
			end
			if DataService:Get(player, "Settings." .. key) ~= value then
				DataService:Set(player, "Settings." .. key, value)
			end
			return { ok = true, Key = key, Value = value }
		end,
	}, { rate = 6, burst = 20 })
end

return SettingsService
