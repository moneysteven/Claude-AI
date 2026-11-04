-- GarageController: registers the vehicle panels and their entry points (client).
--
--   * "Garage"   — owned cars (phone Cars app, HUD side-bar button "Garage" (order 25), PC key N)
--   * "FuelPump" — opened by the server at FuelPump-tagged pumps
--   * "Repair"   — opened by the server at MechanicBay-tagged repair bays
--
-- API (client):
--   GarageController:Open()   GarageController:Close()   GarageController:Toggle()

local ContextActionService = game:GetService("ContextActionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local VehiclesConfig = require(Shared.Config.Vehicles)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))

local GarageFolder = script.Parent:WaitForChild("Garage")
local GaragePanel = require(GarageFolder:WaitForChild("GaragePanel"))
local FuelPanel = require(GarageFolder:WaitForChild("FuelPanel"))
local RepairPanel = require(GarageFolder:WaitForChild("RepairPanel"))

local GarageController = {
	Name = "GarageController",
	Priority = 80,
}

local UIC = VehiclesConfig.UI

function GarageController:Open()
	Router.Open("Garage")
end

function GarageController:Close()
	Router.Close("Garage")
end

function GarageController:Toggle()
	Router.Toggle("Garage")
end

function GarageController:Init()
	Router.Register("Garage", {
		Title = "Garage",
		Icon = "🚗",
		Kind = "window",
		Size = Vector2.new(640, 660),
		Build = function(content, data, ctx)
			GaragePanel.Build(content, data, ctx)
		end,
	})
	Router.Register("FuelPump", {
		Title = "Fuel & Charging",
		Icon = "⛽",
		Kind = "window",
		Size = Vector2.new(460, 560),
		Build = function(content, data, ctx)
			FuelPanel.Build(content, data, ctx)
		end,
	})
	Router.Register("Repair", {
		Title = "Repair Bay",
		Icon = "🔧",
		Kind = "window",
		Size = Vector2.new(440, 470),
		Build = function(content, data, ctx)
			RepairPanel.Build(content, data, ctx)
		end,
	})
end

function GarageController:Start()
	Router.AddHudButton("Garage", "🚗", "Garage", UIC.HudOrder, function()
		GarageController:Toggle()
	end)
	ContextActionService:BindAction("SkylineGarage", function(_, state)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		if UserInputService:GetFocusedTextBox() then
			return Enum.ContextActionResult.Pass
		end
		local dc = Registry.Find("DriveController")
		if dc and type(dc.IsDriving) == "function" and dc:IsDriving() then
			return Enum.ContextActionResult.Pass -- the driving keys own the keyboard while driving
		end
		GarageController:Toggle()
		return Enum.ContextActionResult.Sink
	end, false, UIC.GarageKey)
end

return GarageController
