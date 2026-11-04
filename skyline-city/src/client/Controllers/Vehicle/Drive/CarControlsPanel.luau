-- CarControlsPanel: the "CarControls" Router window — a button for every car function.
-- Every button sends Net.Send("VehicleAction", ...) through Drive/Actions; labels update live from the
-- car's attributes. PC shows keybind hints. Works for passengers too (driving options hidden; the
-- server decides what a passenger may change).
--
--   CarControlsPanel.Build(content, data, ctx)   -- data = { Model = carModel? }

local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Audio = require(Shared.Config.Audio)
local VehicleStats = require(Shared.Vehicle.VehicleStats)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local Actions = require(script.Parent.Actions)

local CarControlsPanel = {}

local localPlayer = Players.LocalPlayer

local function onOff(v: any): string
	return v and "On" or "Off"
end

function CarControlsPanel.Build(content: Frame, data: any, ctx: any)
	local drive = Registry.Find("DriveController")
	local model: Model? = type(data) == "table" and data.Model or nil
	local isDriver = false
	if drive then
		local m, driver = drive:GetSeatVehicle()
		if not model then
			model = m
		end
		isDriver = driver == true and m == model
	end
	if not model or not model.Parent then
		Kit.Label("Get in a vehicle to use the car controls.", {
			TextColor3 = Theme.Colors.TextDim,
			Parent = content,
		})
		return
	end
	local car = model :: Model
	local def = (drive and isDriver and drive:GetDefinition()) or VehicleStats.Resolve(car:GetAttribute("ModelId"))
	local features = def.Features
	local showKeys = not Kit.IsMobile() and not Kit.IsGamepad()
	local function key(k: string): string
		return showKeys and ("  <font color=\"#8a90a8\">[" .. k .. "]</font>") or ""
	end

	local scroll = Kit.Scroll({ Parent = content }, 10)
	local refreshers: { () -> () } = {}
	local firstButton: GuiObject? = nil
	local columns = (content.AbsoluteSize.X >= 460) and 3 or 2

	local order = 0
	local function section(title: string)
		order += 1
		Kit.Label(title, {
			Font = Theme.FontBold,
			TextSize = Theme.TextSize.Body,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = order,
			Parent = scroll,
		})
		order += 1
		local grid = Kit.new("Frame", {
			Size = UDim2.new(1, 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundTransparency = 1,
			LayoutOrder = order,
			Parent = scroll,
		})
		Kit.new("UIGridLayout", {
			CellSize = UDim2.new(1 / columns, -8, 0, 48),
			CellPadding = UDim2.fromOffset(8, 8),
			SortOrder = Enum.SortOrder.LayoutOrder,
			Parent = grid,
		})
		return grid
	end

	-- button whose text/style come from `label()` -> (text, active?)
	local function button(grid: Instance, label: () -> (string, boolean?), onClick: () -> ())
		local b = Kit.Button("", "secondary", onClick, {
			RichText = true,
			TextSize = 14,
			LayoutOrder = #grid:GetChildren(),
			Parent = grid,
		})
		local function refresh()
			local text, active = label()
			b.Text = text
			b.BackgroundColor3 = active and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
		end
		refresh()
		table.insert(refreshers, refresh)
		if not firstButton then
			firstButton = b
		end
		return b
	end

	local function attr(name: string): any
		return car:GetAttribute(name)
	end

	-- Engine & safety ----------------------------------------------------------
	local g = section("🔑  Engine & safety")
	button(g, function()
		return "🔑 Engine: " .. onOff(attr("Engine") == true) .. key("K"), attr("Engine") == true
	end, function()
		Actions.Engine(car)
	end)
	button(g, function()
		local on = localPlayer:GetAttribute("Seatbelt") == true
		return "🔗 Seatbelt: " .. onOff(on) .. key("G"), on
	end, function()
		Actions.Send("Seatbelt")
	end)
	button(g, function()
		local locked = attr("Locked") == true
		return (locked and "🔒 Locked" or "🔓 Unlocked") .. key("J"), locked
	end, function()
		Actions.Send("Lock", not (attr("Locked") == true))
	end)
	button(g, function()
		return "🚪 Exit vehicle" .. key("F"), false
	end, function()
		ctx.Close()
		Actions.Send("Exit")
	end)

	-- Lights ---------------------------------------------------------------------
	g = section("💡  Lights")
	button(g, function()
		local l = attr("Headlights") or 0
		local names = { [0] = "Off", [1] = "Low", [2] = "High" }
		return "💡 Headlights: " .. (names[l] or "Off") .. key("L"), l > 0
	end, function()
		Actions.CycleLights(car)
	end)
	button(g, function()
		return "🔆 High beam", (attr("Headlights") or 0) >= 2
	end, function()
		Actions.Send("HighBeam")
	end)
	button(g, function()
		return "◀ Left indicator" .. key("Z"), attr("Indicator") == "Left"
	end, function()
		Actions.Indicator(car, "Left")
	end)
	button(g, function()
		return "▶ Right indicator" .. key("X"), attr("Indicator") == "Right"
	end, function()
		Actions.Indicator(car, "Right")
	end)
	button(g, function()
		return "⚠️ Hazards" .. key("V"), attr("Indicator") == "Hazard"
	end, function()
		Actions.Send("Hazard")
	end)
	button(g, function()
		return "🔦 Interior light" .. key("I"), attr("InteriorLight") == true
	end, function()
		Actions.Send("InteriorLight")
	end)
	if features.Siren or attr("Siren") ~= nil then
		button(g, function()
			return "🚨 Siren" .. key("N"), attr("Siren") == true
		end, function()
			Actions.Send("Siren")
		end)
	end

	-- Windows ------------------------------------------------------------------------
	local doors = (features.Doors == 2) and { "FL", "FR" } or Actions.Doors
	local winKeys = { FL = "1", FR = "2", RL = "3", RR = "4" }
	g = section("🪟  Windows")
	for _, d in ipairs(doors) do
		button(g, function()
			local v = attr("Window_" .. d) or 0
			return ("🪟 %s: %s"):format(Actions.DoorNames[d], v >= 0.5 and "Down ▼" or "Up ▲") .. key(winKeys[d]), v >= 0.5
		end, function()
			Actions.ToggleWindow(car, d)
		end)
	end
	button(g, function()
		return "⬆ All windows up", false
	end, function()
		Actions.Send("AllWindows", 0)
	end)
	button(g, function()
		return "⬇ All windows down" .. key("5"), false
	end, function()
		Actions.Send("AllWindows", 1)
	end)

	-- Doors & body -----------------------------------------------------------------------
	g = section("🚪  Doors, hood & trunk")
	for _, d in ipairs(doors) do
		button(g, function()
			local open = attr("Door_" .. d) == true
			return ("🚪 %s door: %s"):format(Actions.DoorNames[d], open and "Open" or "Closed"), open
		end, function()
			Actions.Send("Door", d)
		end)
	end
	button(g, function()
		local open = attr("Hood") == true
		return "🔧 Hood: " .. (open and "Open" or "Closed"), open
	end, function()
		Actions.Send("Hood")
	end)
	button(g, function()
		local open = attr("Trunk") == true
		return "🧳 Trunk: " .. (open and "Open" or "Closed"), open
	end, function()
		Actions.Send("Trunk")
	end)
	if features.Sunroof or attr("Sunroof") ~= nil then
		button(g, function()
			local v = attr("Sunroof") or 0
			return "☀️ Sunroof: " .. (v >= 0.5 and "Open" or "Closed") .. key("U"), v >= 0.5
		end, function()
			Actions.Send("Sunroof")
		end)
	end
	if features.Convertible or attr("Roof") ~= nil then
		button(g, function()
			local v = attr("Roof") or 0
			return "🏎️ Soft top: " .. (v >= 0.5 and "Down" or "Up") .. key("U"), v >= 0.5
		end, function()
			Actions.Send("Roof")
		end)
	end

	-- Radio ---------------------------------------------------------------------------------
	g = section("📻  Radio")
	button(g, function()
		local cur = attr("RadioStation")
		return "🔇 Off", cur == nil or cur == "" or cur == "off"
	end, function()
		Actions.Radio("off")
	end)
	for _, st in ipairs(Audio.Radio or {}) do
		button(g, function()
			return ("📻 %s <font color=\"#a0a6ba\">%s</font>"):format(st.Name, st.Genre or ""), attr("RadioStation") == st.Id
		end, function()
			Actions.Radio(st.Id)
		end)
	end
	button(g, function()
		return "⏭ Next station" .. key("R"), false
	end, function()
		Actions.Radio("next")
	end)

	-- Driving (driver only) ----------------------------------------------------------------
	if isDriver and drive then
		g = section("🏁  Driving")
		if not def.Electric then
			button(g, function()
				local manual = drive:IsManual()
				return "⚙ Gearbox: " .. (manual and "Manual" or "Automatic") .. key("M"), manual
			end, function()
				drive:SetManual(not drive:IsManual())
			end)
		end
		button(g, function()
			local t = drive:GetTelemetry()
			local on = t ~= nil and t.Cruise == true
			return "🎯 Cruise control" .. key("C"), on
		end, function()
			drive:ToggleCruise()
		end)
		button(g, function()
			return "🎥 Camera view" .. key("Y"), false
		end, function()
			drive:CycleCamera()
		end)
		button(g, function()
			local on = drive:IsMirrorVisible()
			return "🪞 Rear mirror: " .. onOff(on) .. key("B"), on
		end, function()
			drive:ToggleMirror()
		end)
	end

	-- live updates -------------------------------------------------------------------------------
	local pending = false
	local function refreshAll()
		if pending then
			return
		end
		pending = true
		task.defer(function()
			pending = false
			for _, r in ipairs(refreshers) do
				pcall(r)
			end
		end)
	end
	ctx.Maid:Give(car.AttributeChanged:Connect(refreshAll))
	ctx.Maid:Give(localPlayer:GetAttributeChangedSignal("Seatbelt"):Connect(refreshAll))
	ctx.Maid:Give(task.spawn(function()
		-- cruise / gearbox / mirror state lives on the client; refresh slowly while open
		while true do
			task.wait(0.5)
			refreshAll()
		end
	end))
	ctx.Maid:Give(car.AncestryChanged:Connect(function()
		if not car:IsDescendantOf(workspace) then
			ctx.Close()
		end
	end))

	if Kit.IsGamepad() and firstButton then
		GuiService.SelectedObject = firstButton
	end
	return nil
end

return CarControlsPanel
