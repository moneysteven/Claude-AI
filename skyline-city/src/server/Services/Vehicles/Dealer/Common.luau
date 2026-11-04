-- Common: small server helpers shared by DealershipService and TuningService.
-- Every peer service is looked up with Registry.Find so a missing peer never crashes us.

local Players = game:GetService("Players")
local ServerScriptService = game:GetService("ServerScriptService")
local TextService = game:GetService("TextService")

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)

local Common = {}

---------------------------------------------------------------------------
-- Passes / wealth
---------------------------------------------------------------------------
function Common.HasPass(player: Player, key: string): boolean
	local mon = Registry.Find("MonetizationService")
	if mon and type(mon.HasPass) == "function" then
		local ok, has = pcall(mon.HasPass, mon, player, key)
		if ok then
			return has == true
		end
	end
	-- attributes are server-set (MonetizationService contract §6), safe to read as a fallback
	if key == "VIP" and player:GetAttribute("VIP") == true then
		return true
	end
	return player:GetAttribute("Pass_" .. key) == true
end

function Common.NetWorth(player: Player): number
	local wealth = Registry.Find("WealthService")
	if wealth and type(wealth.GetNetWorth) == "function" then
		local ok, n = pcall(wealth.GetNetWorth, wealth, player)
		if ok and type(n) == "number" and n == n then
			return math.max(0, n)
		end
	end
	local data = Registry.Get("DataService")
	local cash = data:Get(player, "Cash") or 0
	local bank = data:Get(player, "Bank") or 0
	local savings = data:Get(player, "Savings") or 0
	return math.max(0, cash + bank + savings)
end

function Common.Notify(player: Player, text: string, kind: string?, duration: number?)
	local notify = Registry.Find("NotifyService")
	if notify then
		notify:Send(player, text, kind, duration)
	end
end

function Common.PhoneMessage(player: Player, from: string, text: string)
	local phone = Registry.Find("PhoneService")
	if phone and type(phone.SendSystemMessage) == "function" then
		local ok, err = pcall(phone.SendSystemMessage, phone, player, from, text)
		if not ok then
			warn("[Dealership] PhoneService:SendSystemMessage failed:", err)
		end
	end
end

function Common.Tutorial(player: Player, step: string)
	local tut = Registry.Find("TutorialService")
	if tut and type(tut.Advance) == "function" then
		pcall(tut.Advance, tut, player, step)
	end
end

---------------------------------------------------------------------------
-- Vehicles
---------------------------------------------------------------------------
function Common.VehicleService(): any
	return Registry.Find("VehicleService")
end

function Common.GetCarData(player: Player, uid: string): { [string]: any }?
	local data = Registry.Get("DataService"):GetData(player)
	if not data or type(data.Vehicles) ~= "table" then
		return nil
	end
	local car = data.Vehicles[uid]
	if type(car) ~= "table" then
		return nil
	end
	return car
end

function Common.CountCars(player: Player): number
	local data = Registry.Get("DataService"):GetData(player)
	local n = 0
	if data and type(data.Vehicles) == "table" then
		for _ in pairs(data.Vehicles) do
			n += 1
		end
	end
	return n
end

function Common.CarValue(player: Player, uid: string): number
	local vs = Common.VehicleService()
	if vs and type(vs.GetCarValue) == "function" then
		local ok, v = pcall(vs.GetCarValue, vs, player, uid)
		if ok and type(v) == "number" and v == v then
			return math.max(0, math.floor(v))
		end
	end
	local car = Common.GetCarData(player, uid)
	if car and type(car.Value) == "number" then
		return math.max(0, math.floor(car.Value))
	end
	return 0
end

-- The player's spawned personal car model (or nil).
function Common.ActiveModel(player: Player): Model?
	local vs = Common.VehicleService()
	if vs and type(vs.GetActiveVehicle) == "function" then
		local ok, m = pcall(vs.GetActiveVehicle, vs, player)
		if ok and typeof(m) == "Instance" and m:IsA("Model") and m.Parent then
			return m
		end
	end
	return nil
end

-- The car the player is sitting in (any car) and the seat.
function Common.OccupiedModel(player: Player): (Model?, Instance?)
	local vs = Common.VehicleService()
	if vs and type(vs.GetOccupiedVehicle) == "function" then
		local ok, m, seat = pcall(vs.GetOccupiedVehicle, vs, player)
		if ok and typeof(m) == "Instance" and m:IsA("Model") and m.Parent then
			return m, seat
		end
	end
	-- fallback: humanoid seat part
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	if seat then
		local model = seat:FindFirstAncestorWhichIsA("Model")
		while model and model:GetAttribute("CarUid") == nil and model.Parent do
			model = model.Parent:FindFirstAncestorWhichIsA("Model")
		end
		if model and model:GetAttribute("CarUid") ~= nil then
			return model, seat
		end
	end
	return nil, nil
end

function Common.RefreshLook(player: Player, uid: string)
	local vs = Common.VehicleService()
	if vs and type(vs.RefreshLook) == "function" then
		local ok, err = pcall(vs.RefreshLook, vs, player, uid)
		if not ok then
			warn("[Dealership] VehicleService:RefreshLook failed:", err)
		end
	end
end

---------------------------------------------------------------------------
-- Plates
---------------------------------------------------------------------------
-- Uppercase and validate plate text: A-Z 0-9 and single spaces, 1..maxLen chars. Returns nil if invalid.
function Common.CleanPlate(text: any, maxLen: number): string?
	if type(text) ~= "string" or #text > 32 then
		return nil
	end
	local s = string.upper(text)
	s = s:gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s+", " ")
	if #s == 0 or #s > maxLen then
		return nil
	end
	if s:find("[^A-Z0-9 ]") then
		return nil
	end
	return s
end

-- Run plate text through Roblox text filtering. Returns the plate if it passed unchanged, else nil.
-- (Yields.)
function Common.FilterPlate(player: Player, plate: string): string?
	local filtered: string? = nil
	local mod = Registry.Find("ModerationService")
	if mod and type(mod.FilterText) == "function" then
		local ok, res = pcall(mod.FilterText, mod, plate, player)
		if ok and type(res) == "string" then
			filtered = res
		end
	else
		local ok, result = pcall(function()
			return TextService:FilterStringAsync(plate, player.UserId, Enum.TextFilterContext.PublicChat)
		end)
		if ok and result then
			local ok2, s = pcall(function()
				return (result :: TextFilterResult):GetNonChatStringForBroadcastAsync()
			end)
			if ok2 and type(s) == "string" then
				filtered = s
			end
		end
	end
	if not filtered or filtered ~= plate then
		return nil
	end
	return plate
end

local rng = Random.new()
function Common.RandomPlate(prefix: string): string
	return ("%s %03d"):format(string.upper(prefix):sub(1, 4), rng:NextInteger(0, 999))
end

---------------------------------------------------------------------------
-- Misc
---------------------------------------------------------------------------
function Common.IsPlaying(player: Player): boolean
	return player.Parent == Players
end

function Common.Root(player: Player): BasePart?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root
	end
	return nil
end

function Common.ColorToTable(c: Color3): { number }
	return { math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5) }
end

return Common
