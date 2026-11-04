-- TuningController: registers the "Tuning" panel and auto-opens it when the player DRIVES their own car
-- into a TuningShop zone (zones are found by tag; streaming-safe — only zones streamed in are checked).
-- The server also opens it from the zone's ProximityPrompt. Leaving the zone in the car closes it.
--
-- API (client):
--   TuningController:Open(uid?)

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Tuning = require(Shared.Config.Tuning)

local Client = script:FindFirstAncestor("Client") :: Instance
local UI = Client:WaitForChild("UI")
local Router = require(UI:WaitForChild("Router"))

local TuningPanel = require(script.Parent:WaitForChild("TuningPanel"))

local TuningController = {
	Name = "TuningController",
	Priority = 60,
}

local player = Players.LocalPlayer

local function inZone(pos: Vector3): BasePart?
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.TuningShop)) do
		if inst:IsA("BasePart") and inst.Parent then
			local rel = inst.CFrame:PointToObjectSpace(pos)
			local half = inst.Size / 2
			local halfY = math.max(half.Y, Tuning.ZoneHeight / 2)
			local relY = rel.Y
			if inst.Size.Y < Tuning.ZoneHeight then
				relY = rel.Y + half.Y - halfY
			end
			-- slightly tighter than the server margin so an auto-opened panel always validates
			local m = Tuning.ZoneMargin * 0.5
			if math.abs(rel.X) <= half.X + m and math.abs(rel.Z) <= half.Z + m and math.abs(relY) <= halfY + m then
				return inst
			end
		end
	end
	return nil
end

-- The car the local player is driving, if it is their own personal car.
local function drivenOwnCar(): Model?
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	if not seat or not seat:IsA("VehicleSeat") then
		return nil
	end
	local m = seat:FindFirstAncestorWhichIsA("Model")
	while m do
		if m:GetAttribute("CarUid") ~= nil then
			break
		end
		m = m.Parent and m.Parent:FindFirstAncestorWhichIsA("Model")
	end
	if not m then
		return nil
	end
	if m:GetAttribute("OwnerUserId") ~= player.UserId then
		return nil
	end
	if m:GetAttribute("IsTestDrive") == true or m:GetAttribute("IsJobVehicle") == true then
		return nil
	end
	return m
end

function TuningController:Open(uid: string?)
	Router.Open("Tuning", { Uid = uid })
end

function TuningController:Init()
	Router.Register("Tuning", {
		Title = "Tuning",
		Icon = "🔧",
		Kind = "custom",
		Layer = "Panels",
		Build = function(root, data, ctx)
			TuningPanel.Build(root, data, ctx)
		end,
	})
end

function TuningController:Start()
	local wasInside = false
	local autoOpened = false
	local lastAutoOpen = -math.huge
	task.spawn(function()
		while true do
			task.wait(0.25)
			local car = drivenOwnCar()
			local inside = false
			if car then
				local ok, pivot = pcall(function()
					return car:GetPivot()
				end)
				inside = ok and inZone(pivot.Position) ~= nil
			end
			if inside and not wasInside then
				local now = os.clock()
				if not Router.IsOpen("Tuning") and now - lastAutoOpen >= Tuning.AutoOpenCooldown and car then
					lastAutoOpen = now
					autoOpened = true
					Router.Open("Tuning", { Uid = car:GetAttribute("CarUid") })
				end
			elseif not inside and wasInside then
				-- drove out (or got out): close only a panel we auto-opened while driving
				if autoOpened and car and Router.IsOpen("Tuning") then
					Router.Close("Tuning")
				end
				autoOpened = false
			end
			wasInside = inside
		end
	end)
end

return TuningController
