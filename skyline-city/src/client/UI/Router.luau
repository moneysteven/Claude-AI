-- Router: owns the root ScreenGuis, opens/closes panels, shows toasts, confirm dialogs and the HUD side bar.
--
-- PANELS
--   Router.Register("Bank", {
--     Title = "Bank", Icon = "🏦",
--     Kind = "window",                 -- "window" (one at a time, centered, closes others) | "custom" (you own the layout)
--     Size = Vector2.new(560, 520),    -- max size in px for windows (scaled down to fit phones)
--     Build = function(content: Frame, data: any, ctx) -> (() -> ())?
--         -- ctx.Close()  ctx.Maid  ctx.Refresh(newData)  ctx.Root (ScreenGui)
--         -- return an optional cleanup function
--   })
--   Router.Open(name, data?)  Router.Close(name)  Router.Toggle(name, data?)  Router.IsOpen(name)  Router.CloseAll()
--   Router.Opened / Router.Closed : Signal(name)
--   The server can open panels with NotifyService:OpenUI(player, name, data).
--
-- FEEDBACK
--   Router.Notify(text, kind?, duration?)      kind: info|success|error|money|warning
--   Router.Confirm(title, body, yesText?) -> boolean   (yields)
--   Router.Prompt(title, placeholder, default?) -> string?  (yields)
--   Router.Result(res, successText?)   -- shows res.err as error toast or successText as success; returns res.ok
--
-- HUD SIDE BAR (right edge, vertical; mobile friendly)
--   Router.AddHudButton(id, icon, label, order, onClick)  Router.SetHudButtonVisible(id, visible)
--   Router.SetHudVisible(visible)   -- hide all HUD (build mode / camera mode)
--   Router.GetLayer(name) -> ScreenGui  ("HUD", "Panels", "Phone", "Modal", "Toast", "Tutorial")

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")
local ContextActionService = game:GetService("ContextActionService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Maid = require(Shared.Util.Maid)

local Theme = require(script.Parent.Theme)
local Kit = require(script.Parent.Kit)

local Router = {}
Router.Opened = Signal.new()
Router.Closed = Signal.new()

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local layers: { [string]: ScreenGui } = {}
local panels: { [string]: any } = {}
local open: { [string]: { frame: Instance, maid: any, cleanup: (() -> ())? } } = {}
local currentWindow: string? = nil
local hudButtons: { [string]: GuiButton } = {}
local hudBar: Frame
local toastHolder: Frame

local function makeLayer(name: string, order: number): ScreenGui
	local existing = playerGui:FindFirstChild("Skyline_" .. name)
	if existing then
		existing:Destroy()
	end
	local gui = Kit.new("ScreenGui", {
		Name = "Skyline_" .. name,
		ResetOnSpawn = false,
		IgnoreGuiInset = false,
		DisplayOrder = order,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets,
		Parent = playerGui,
	})
	-- global UI scale: shrink on small screens, never upscale past 1.15
	local scale = Kit.new("UIScale", { Parent = gui })
	local function rescale()
		local cam = Workspace.CurrentCamera
		if not cam then
			return
		end
		local vp = cam.ViewportSize
		local s = math.min(vp.X / 1100, vp.Y / 700)
		scale.Scale = math.clamp(s, 0.62, 1.15)
	end
	rescale()
	if Workspace.CurrentCamera then
		Workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)
	end
	return gui
end

function Router.GetLayer(name: string): ScreenGui
	return layers[name]
end

---------------------------------------------------------------------------
-- Panels
---------------------------------------------------------------------------
function Router.Register(name: string, def: { [string]: any })
	if panels[name] then
		warn("[Router] panel re-registered: " .. name)
	end
	def.Kind = def.Kind or "window"
	panels[name] = def
end

function Router.IsOpen(name: string): boolean
	return open[name] ~= nil
end

function Router.Close(name: string)
	local o = open[name]
	if not o then
		return
	end
	open[name] = nil
	if currentWindow == name then
		currentWindow = nil
		ContextActionService:UnbindAction("SkylineClosePanel")
	end
	if o.cleanup then
		pcall(o.cleanup)
	end
	o.maid:Clean()
	local frame = o.frame
	if frame:IsA("GuiObject") then
		local s = frame:FindFirstChildOfClass("UIScale")
		if s then
			Kit.Tween(s, { Scale = 0.9 }, Theme.Tween.Fast)
		end
		Kit.Tween(frame, { BackgroundTransparency = 1 }, Theme.Tween.Fast)
		task.delay(0.15, function()
			frame:Destroy()
		end)
	else
		frame:Destroy()
	end
	Router.Closed:Fire(name)
end

function Router.CloseAll()
	for name in pairs(open) do
		Router.Close(name)
	end
end

local function buildWindow(name: string, def, data)
	local layer = layers.Panels
	local maxSize = def.Size or Vector2.new(560, 520)

	local window = Kit.new("Frame", {
		Name = name,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.52),
		Size = UDim2.fromScale(0.94, 0.86),
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.02,
		Parent = layer,
	})
	Kit.new("UISizeConstraint", { MaxSize = maxSize, Parent = window })
	Kit.Corner(window)
	Kit.Stroke(window)
	local scale = Kit.new("UIScale", { Scale = 0.85, Parent = window })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)

	local header = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 56),
		BackgroundTransparency = 1,
		Parent = window,
	})
	Kit.Label(((def.Icon and (def.Icon .. "  ")) or "") .. (def.Title or name), {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		Position = UDim2.fromOffset(18, 0),
		Size = UDim2.new(1, -80, 1, 0),
		AutomaticSize = Enum.AutomaticSize.None,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = header,
	})
	local closeBtn = Kit.IconButton("✕", function()
		Router.Close(name)
	end, {
		Size = UDim2.fromOffset(38, 38),
		Position = UDim2.new(1, -50, 0.5, -19),
		TextSize = 18,
		Parent = header,
	})

	local content = Kit.new("Frame", {
		Name = "Content",
		Position = UDim2.fromOffset(0, 56),
		Size = UDim2.new(1, 0, 1, -56),
		BackgroundTransparency = 1,
		ClipsDescendants = true,
		Parent = window,
	})
	Kit.new("UIPadding", {
		PaddingLeft = UDim.new(0, 16),
		PaddingRight = UDim.new(0, 16),
		PaddingBottom = UDim.new(0, 16),
		Parent = content,
	})

	-- gamepad: select close button by default, B closes
	if GuiService:IsTenFootInterface() or Kit.IsGamepad() then
		GuiService.SelectedObject = closeBtn
	end
	ContextActionService:BindAction("SkylineClosePanel", function(_, state)
		if state == Enum.UserInputState.Begin then
			Router.Close(name)
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.ButtonB)

	return window, content
end

function Router.Open(name: string, data: any?)
	local def = panels[name]
	if not def then
		warn("[Router] no panel registered named " .. tostring(name))
		return
	end
	if open[name] then
		Router.Close(name)
	end
	local maid = Maid.new()
	local frame, content
	if def.Kind == "window" then
		if currentWindow then
			Router.Close(currentWindow)
		end
		frame, content = buildWindow(name, def, data)
		currentWindow = name
	else
		frame = Kit.new("Frame", {
			Name = name,
			Size = UDim2.fromScale(1, 1),
			BackgroundTransparency = 1,
			Parent = layers[def.Layer or "Panels"],
		})
		content = frame
	end
	local entry = { frame = frame, maid = maid, cleanup = nil }
	open[name] = entry

	local ctx = {
		Maid = maid,
		Root = layers[def.Layer or "Panels"],
		Close = function()
			Router.Close(name)
		end,
		Refresh = function(newData)
			Router.Open(name, newData)
		end,
	}
	local ok, cleanup = pcall(def.Build, content, data, ctx)
	if not ok then
		warn(("[Router] panel %s failed to build: %s"):format(name, tostring(cleanup)))
		Router.Close(name)
		return
	end
	if type(cleanup) == "function" then
		entry.cleanup = cleanup
	end
	Router.Opened:Fire(name)
end

function Router.Toggle(name: string, data: any?)
	if open[name] then
		Router.Close(name)
	else
		Router.Open(name, data)
	end
end

---------------------------------------------------------------------------
-- Toasts
---------------------------------------------------------------------------
local KIND_COLORS = {
	info = Theme.Colors.Accent,
	success = Theme.Colors.Success,
	error = Theme.Colors.Danger,
	warning = Theme.Colors.Warning,
	money = Theme.Colors.Money,
}
local KIND_ICONS = { info = "ℹ️", success = "✅", error = "⛔", warning = "⚠️", money = "💵" }

function Router.Notify(text: string, kind: string?, duration: number?)
	if not toastHolder then
		return
	end
	local k = kind or "info"
	local toast = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.05,
		Parent = toastHolder,
	})
	Kit.Corner(toast, Theme.CornerSmall)
	Kit.Stroke(toast, KIND_COLORS[k] or Theme.Colors.Accent, 2, 0)
	Kit.Padding(toast, 10)
	Kit.Label((KIND_ICONS[k] or "") .. "  " .. text, { TextSize = Theme.TextSize.Body, Parent = toast })
	local scale = Kit.new("UIScale", { Scale = 0.6, Parent = toast })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)
	task.delay(duration or 4, function()
		if toast.Parent then
			Kit.Tween(scale, { Scale = 0.01 }, Theme.Tween.Fast)
			task.wait(0.16)
			toast:Destroy()
		end
	end)
	-- cap visible toasts
	local count = 0
	for _, c in ipairs(toastHolder:GetChildren()) do
		if c:IsA("Frame") then
			count += 1
		end
	end
	if count > 4 then
		for _, c in ipairs(toastHolder:GetChildren()) do
			if c:IsA("Frame") then
				c:Destroy()
				break
			end
		end
	end
end

function Router.Result(res: { [string]: any }, successText: string?): boolean
	if res and res.ok then
		if successText then
			Router.Notify(successText, "success")
		end
		return true
	end
	Router.Notify((res and res.err) or "Something went wrong", "error")
	return false
end

---------------------------------------------------------------------------
-- Modal dialogs
---------------------------------------------------------------------------
local function modalShell(title: string, body: string?)
	local overlay = Kit.new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Colors.Overlay,
		BackgroundTransparency = 0.45,
		Parent = layers.Modal,
	})
	local box = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.9, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = overlay,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(420, 600), Parent = box })
	Kit.Corner(box)
	Kit.Stroke(box)
	Kit.Padding(box, 18)
	Kit.List(box, 12)
	Kit.Label(title, { Font = Theme.FontBold, TextSize = Theme.TextSize.Heading, LayoutOrder = 1, Parent = box })
	if body then
		Kit.Label(body, { TextColor3 = Theme.Colors.TextDim, LayoutOrder = 2, Parent = box })
	end
	local s = Kit.new("UIScale", { Scale = 0.85, Parent = box })
	Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
	return overlay, box
end

function Router.Confirm(title: string, body: string?, yesText: string?): boolean
	local overlay, box = modalShell(title, body)
	local result: boolean? = nil
	local row = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 10, Parent = box })
	Kit.Button("Cancel", "secondary", function()
		result = false
	end, { Size = UDim2.new(0.5, -6, 1, 0), Parent = row })
	local yes = Kit.Button(yesText or "Confirm", "primary", function()
		result = true
	end, { Size = UDim2.new(0.5, -6, 1, 0), Position = UDim2.new(0.5, 6, 0, 0), Parent = row })
	if Kit.IsGamepad() then
		GuiService.SelectedObject = yes
	end
	while result == nil and overlay.Parent do
		task.wait()
	end
	overlay:Destroy()
	return result == true
end

function Router.Prompt(title: string, placeholder: string?, default: string?): string?
	local overlay, box = modalShell(title, nil)
	local input = Kit.TextBox(placeholder or "", { Text = default or "", LayoutOrder = 5, Parent = box })
	local result: string? = nil
	local done = false
	local row = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 10, Parent = box })
	Kit.Button("Cancel", "secondary", function()
		done = true
	end, { Size = UDim2.new(0.5, -6, 1, 0), Parent = row })
	Kit.Button("OK", "primary", function()
		result = input.Text
		done = true
	end, { Size = UDim2.new(0.5, -6, 1, 0), Position = UDim2.new(0.5, 6, 0, 0), Parent = row })
	input:CaptureFocus()
	while not done and overlay.Parent do
		task.wait()
	end
	overlay:Destroy()
	return result
end

---------------------------------------------------------------------------
-- HUD side bar
---------------------------------------------------------------------------
function Router.AddHudButton(id: string, icon: string, label: string, order: number, onClick: () -> ())
	if hudButtons[id] then
		hudButtons[id]:Destroy()
	end
	local holder = Kit.new("TextButton", {
		Name = id,
		Text = "",
		LayoutOrder = order,
		Size = UDim2.fromOffset(58, 58),
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.1,
		AutoButtonColor = true,
		Parent = hudBar,
	})
	Kit.Corner(holder, UDim.new(0, 16))
	Kit.Stroke(holder)
	Kit.Ripple(holder)
	Kit.new("TextLabel", {
		Text = icon,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 34),
		Position = UDim2.fromOffset(0, 4),
		TextSize = 24,
		Font = Theme.FontBold,
		TextColor3 = Theme.Colors.Text,
		Parent = holder,
	})
	Kit.new("TextLabel", {
		Text = label,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 14),
		Position = UDim2.new(0, 0, 1, -18),
		TextSize = 11,
		Font = Theme.Font,
		TextColor3 = Theme.Colors.TextDim,
		Parent = holder,
	})
	holder.Activated:Connect(function()
		task.spawn(onClick)
	end)
	hudButtons[id] = holder
	return holder
end

function Router.SetHudButtonVisible(id: string, visible: boolean)
	local b = hudButtons[id]
	if b then
		b.Visible = visible
	end
end

function Router.SetHudVisible(visible: boolean)
	if layers.HUD then
		layers.HUD.Enabled = visible
	end
end

---------------------------------------------------------------------------
-- Start
---------------------------------------------------------------------------
function Router.Start()
	for name, order in pairs(Theme.Layers) do
		layers[name] = makeLayer(name, order)
	end

	hudBar = Kit.new("Frame", {
		Name = "HudBar",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.45, 0),
		Size = UDim2.fromOffset(58, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Parent = layers.HUD,
	})
	Kit.List(hudBar, 8, false, Enum.HorizontalAlignment.Center)

	toastHolder = Kit.new("Frame", {
		Name = "Toasts",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 12),
		Size = UDim2.new(0.9, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Parent = layers.Toast,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(440, 1000), Parent = toastHolder })
	Kit.List(toastHolder, 6, false, Enum.HorizontalAlignment.Center)

	Net.Listen("Notify", function(payload)
		if type(payload) == "table" then
			Router.Notify(tostring(payload.Text or ""), payload.Kind, payload.Duration)
		end
	end)
	Net.Listen("UI", function(action, name, data)
		if action == "Open" then
			Router.Open(name, data)
		elseif action == "Close" then
			Router.Close(name)
		end
	end)
end

return Router
