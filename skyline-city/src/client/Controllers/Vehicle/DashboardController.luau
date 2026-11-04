-- DashboardController: the in-car instrument cluster + the "CarControls" panel.
--   * Bottom-centre dashboard while driving (Drive/DashboardUI): speedometer (MPH/KMH per Settings.Units)
--     and tachometer with smooth needles + redline, gear (P/R/N/D3 or 1-6 / M), fuel, damage, indicator
--     arrows synced to the Indicator attribute, headlights low/high, seatbelt warning (player attribute
--     Seatbelt), cruise, engine light, handbrake, odometer (Vehicles[uid].Mileage), radio station.
--   * "CarControls" Router window (Drive/CarControlsPanel) with a button for every car function.
--   * A 🚗 HUD side-bar button while seated in any car (driver or passenger) opens the panel.
--
-- API (client):
--   DashboardController:OpenControls()    DashboardController:ToggleControls()
--   DashboardController:IsVisible() -> bool

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Maid = require(Shared.Util.Maid)
local Driving = require(Shared.Config.Driving)
local Units = require(Shared.Vehicle.Units)
local Format = require(Shared.Util.Format)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local UI = Client:WaitForChild("UI")
local Router = require(UI:WaitForChild("Router"))
local Theme = require(UI:WaitForChild("Theme"))
local Kit = require(UI:WaitForChild("Kit"))

local Drive = script.Parent:WaitForChild("Drive")
local DashboardUI = require(Drive:WaitForChild("DashboardUI"))
local CarControlsPanel = require(Drive:WaitForChild("CarControlsPanel"))
local Actions = require(Drive:WaitForChild("Actions"))

local DashboardController = {
	Name = "DashboardController",
	Priority = 70,
}

local PANEL = "CarControls"
local localPlayer = Players.LocalPlayer

local drive: any = nil
local gui: ScreenGui? = nil
local scale: UIScale? = nil
local current: { [string]: any }? = nil

local function getUnit(): string
	local sc = Registry.Find("SettingsController")
	local v = nil
	if sc and type(sc.Get) == "function" then
		local ok, r = pcall(sc.Get, sc, "Units")
		if ok then
			v = r
		end
	end
	if v == nil then
		v = ClientData.Get("Settings.Units")
	end
	return v == "KMH" and "KMH" or "MPH"
end

local function ensureGui(): ScreenGui
	if gui and gui.Parent then
		return gui
	end
	local g = Kit.new("ScreenGui", {
		Name = "Skyline_Dashboard",
		ResetOnSpawn = false,
		IgnoreGuiInset = false,
		DisplayOrder = Theme.Layers.HUD + 1,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets,
		Parent = localPlayer:WaitForChild("PlayerGui"),
	})
	local s = Kit.new("UIScale", { Parent = g })
	local function rescale()
		local cam = workspace.CurrentCamera
		if cam then
			local vp = cam.ViewportSize
			s.Scale = math.clamp(math.min(vp.X / 1100, vp.Y / 700), 0.62, 1.15)
		end
	end
	rescale()
	if workspace.CurrentCamera then
		workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)
	end
	gui = g
	scale = s
	return g
end

local function odometerText(model: Model, unit: string): string
	local uid = model:GetAttribute("CarUid")
	if type(uid) ~= "string" or model:GetAttribute("OwnerUserId") ~= localPlayer.UserId then
		return ""
	end
	local miles = ClientData.Get("Vehicles." .. uid .. ".Mileage")
	if type(miles) ~= "number" then
		return ""
	end
	local d = Units.Distance(miles, Driving.Odometer.SourceUnit, unit)
	local whole = math.floor(d)
	local tenth = math.floor((d - whole) * 10)
	return ("ODO %s.%d %s"):format(Format.Commas(whole), tenth, Units.DistanceLabel(unit))
end

local function hide()
	local c = current
	if not c then
		return
	end
	current = nil
	c.Maid:Clean()
	if Router.IsOpen(PANEL) then
		Router.Close(PANEL)
	end
end

local function show(model: Model)
	hide()
	if not drive then
		return
	end
	local telemetry = drive:GetTelemetry()
	local def = drive:GetDefinition()
	if not telemetry or not def then
		return
	end
	local unit = getUnit()
	local maid = Maid.new()
	local isPc = not Kit.IsMobile() and not Kit.IsGamepad()
	local dash = DashboardUI.new(ensureGui(), {
		TopSpeed = telemetry.TopSpeed,
		Redline = telemetry.Redline,
		Electric = def.Electric,
		Unit = unit,
		ShowHints = isPc,
	})
	maid:Give(dash)
	local c = { Model = model, Dash = dash, Maid = maid, Unit = unit, Odo = odometerText(model, unit), OdoAt = 0 }
	current = c

	maid:Give(RunService.RenderStepped:Connect(function(dt)
		if current ~= c then
			return
		end
		local t = drive:GetTelemetry()
		if not t then
			return
		end
		local now = os.clock()
		if now - c.OdoAt > 1 then
			c.OdoAt = now
			c.Odo = odometerText(model, c.Unit)
		end
		dash:Update(dt, t, {
			Indicator = model:GetAttribute("Indicator"),
			Headlights = model:GetAttribute("Headlights"),
			Seatbelt = localPlayer:GetAttribute("Seatbelt"),
			Health = model:GetAttribute("Health"),
			Fuel = model:GetAttribute("Fuel"),
			Odometer = c.Odo,
			Radio = Actions.StationName(model:GetAttribute("RadioStation")),
		})
	end))

	-- rebuild when the unit setting changes (gauge scale differs)
	local sc = Registry.Find("SettingsController")
	if sc and sc.Changed then
		maid:Give(sc.Changed:Connect(function(key)
			if key == "Units" and current == c and drive:IsDriving() then
				task.defer(show, model)
			end
		end))
	end
end

---------------------------------------------------------------------------
-- API
---------------------------------------------------------------------------
function DashboardController:OpenControls()
	local model = drive and drive:GetSeatVehicle() or nil
	Router.Open(PANEL, { Model = model })
end

function DashboardController:ToggleControls()
	if Router.IsOpen(PANEL) then
		Router.Close(PANEL)
	else
		self:OpenControls()
	end
end

function DashboardController:IsVisible(): boolean
	return current ~= nil
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function DashboardController:Init()
	Router.Register(PANEL, {
		Title = "Car Controls",
		Icon = "🚗",
		Kind = "window",
		Size = Vector2.new(640, 580),
		Build = function(content, data, ctx)
			return CarControlsPanel.Build(content, data, ctx)
		end,
	})
end

function DashboardController:Start()
	drive = Registry.Find("DriveController")
	if not drive then
		warn("[DashboardController] DriveController missing — dashboard disabled")
		return
	end
	drive.Entered:Connect(function(model)
		show(model)
	end)
	drive.Exited:Connect(function()
		hide()
	end)
	if drive:IsDriving() then
		local m = drive:GetVehicle()
		if m then
			show(m)
		end
	end

	-- HUD button while seated in any car (driver or passenger)
	Router.AddHudButton(PANEL, "🚗", "Car", 15, function()
		DashboardController:ToggleControls()
	end)
	Router.SetHudButtonVisible(PANEL, false)
	task.spawn(function()
		local shown = false
		while true do
			task.wait(0.5)
			local m = drive:GetSeatVehicle()
			local want = m ~= nil
			if want ~= shown then
				shown = want
				Router.SetHudButtonVisible(PANEL, want)
				if not want and Router.IsOpen(PANEL) then
					Router.Close(PANEL)
				end
			end
		end
	end)
end

return DashboardController
