-- SettingsController: the "Settings" panel + applying settings on the client.
--
--   * Volumes are applied to SoundService SoundGroups "Music", "SFX", "Radio" (created here if missing —
--     other systems parent / assign their sounds to these groups by name).
--   * LowGraphics sets the LocalPlayer attribute "LowGraphics" (other controllers read it to reduce effects)
--     and turns off heavy Lighting post-effects + shadows locally.
--   * Changes apply instantly (optimistic) and are saved through Net.Invoke("Settings", "Set", ...), debounced.
--
-- API (client):
--   SettingsController:Get(key) -> any
--   SettingsController:Set(key, value)
--   SettingsController.Changed : Signal(key, value)
--   SettingsController:GetSoundGroup(name) -> SoundGroup

local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Template = require(Shared.DataTemplate)

local Client = script.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))
local UIBits = require(script.Parent:WaitForChild("Economy"):WaitForChild("UIBits"))

local SettingsController = {
	Name = "SettingsController",
	Priority = 5, -- early: other controllers read settings in their Start
}

SettingsController.Changed = Signal.new()

local localPlayer = Players.LocalPlayer
local DEFAULTS = Template.Settings
local SEND_DEBOUNCE = 0.4

local GROUPS = {
	Music = "MusicVolume",
	SFX = "SfxVolume",
	Radio = "RadioVolume",
}

local pending: { [string]: any } = {} -- optimistic values not yet confirmed by the server
local sendTokens: { [string]: number } = {}
local soundGroups: { [string]: SoundGroup } = {}
local savedLighting: { [Instance]: boolean } = {}
local savedShadows: boolean? = nil
local lowGraphicsConn: RBXScriptConnection? = nil

---------------------------------------------------------------------------
-- Apply
---------------------------------------------------------------------------
local function ensureGroup(name: string): SoundGroup
	local g = soundGroups[name]
	if g and g.Parent then
		return g
	end
	local existing = SoundService:FindFirstChild(name)
	if existing and existing:IsA("SoundGroup") then
		g = existing
	else
		g = Instance.new("SoundGroup")
		g.Name = name
		g.Volume = 0.5
		g.Parent = SoundService
	end
	soundGroups[name] = g :: SoundGroup
	return g :: SoundGroup
end

local function isHeavyEffect(inst: Instance): boolean
	return inst:IsA("BloomEffect")
		or inst:IsA("SunRaysEffect")
		or inst:IsA("DepthOfFieldEffect")
		or inst:IsA("BlurEffect") and inst.Name ~= "UIBlur"
end

local function setLowGraphics(on: boolean)
	localPlayer:SetAttribute("LowGraphics", on)
	if on then
		if savedShadows == nil then
			savedShadows = Lighting.GlobalShadows
		end
		Lighting.GlobalShadows = false
		for _, inst in ipairs(Lighting:GetDescendants()) do
			if isHeavyEffect(inst) and savedLighting[inst] == nil then
				savedLighting[inst] = (inst :: any).Enabled
				;(inst :: any).Enabled = false
			end
		end
		if not lowGraphicsConn then
			lowGraphicsConn = Lighting.DescendantAdded:Connect(function(inst)
				if isHeavyEffect(inst) then
					task.defer(function()
						if localPlayer:GetAttribute("LowGraphics") and savedLighting[inst] == nil then
							savedLighting[inst] = (inst :: any).Enabled
							;(inst :: any).Enabled = false
						end
					end)
				end
			end)
		end
	else
		if lowGraphicsConn then
			lowGraphicsConn:Disconnect()
			lowGraphicsConn = nil
		end
		if savedShadows ~= nil then
			Lighting.GlobalShadows = savedShadows
			savedShadows = nil
		end
		for inst, enabled in pairs(savedLighting) do
			if inst.Parent then
				(inst :: any).Enabled = enabled
			end
		end
		table.clear(savedLighting)
	end
end

local applied: { [string]: any } = {}

local function apply(key: string, value: any)
	if applied[key] == value then
		return
	end
	applied[key] = value
	for groupName, settingKey in pairs(GROUPS) do
		if settingKey == key and type(value) == "number" then
			ensureGroup(groupName).Volume = math.clamp(value, 0, 1)
		end
	end
	if key == "LowGraphics" then
		setLowGraphics(value == true)
	end
	SettingsController.Changed:Fire(key, value)
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function SettingsController:Get(key: string): any
	if pending[key] ~= nil then
		return pending[key]
	end
	local v = ClientData.Get("Settings." .. key)
	if v == nil then
		return DEFAULTS[key]
	end
	return v
end

function SettingsController:GetSoundGroup(name: string): SoundGroup
	return ensureGroup(name)
end

function SettingsController:Set(key: string, value: any)
	if DEFAULTS[key] == nil then
		return
	end
	pending[key] = value
	apply(key, value)
	local token = (sendTokens[key] or 0) + 1
	sendTokens[key] = token
	task.delay(SEND_DEBOUNCE, function()
		if sendTokens[key] ~= token then
			return -- a newer value is on its way
		end
		local res = Net.Invoke("Settings", "Set", { Key = key, Value = value })
		if sendTokens[key] ~= token then
			return
		end
		pending[key] = nil
		if not res.ok then
			Router.Notify(res.err or "Couldn't save that setting", "error")
			apply(key, SettingsController:Get(key))
		end
	end)
end

---------------------------------------------------------------------------
-- Panel
---------------------------------------------------------------------------
local function row(parent: Instance, order: number, title: string, subtitle: string?)
	local f = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, subtitle and 60 or 48),
		BackgroundColor3 = Theme.Colors.SurfaceAlt,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.Corner(f, Theme.CornerSmall)
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12), Parent = f })
	Kit.Label(title, {
		AutomaticSize = Enum.AutomaticSize.None,
		Position = UDim2.fromOffset(0, subtitle and 8 or 0),
		Size = UDim2.new(0.6, 0, 0, subtitle and 22 or 48),
		TextYAlignment = subtitle and Enum.TextYAlignment.Top or Enum.TextYAlignment.Center,
		Parent = f,
	})
	if subtitle then
		Kit.Label(subtitle, {
			AutomaticSize = Enum.AutomaticSize.None,
			Position = UDim2.fromOffset(0, 30),
			Size = UDim2.new(0.62, 0, 0, 22),
			TextSize = 12,
			TextColor3 = Theme.Colors.TextDim,
			Parent = f,
		})
	end
	return f
end

local function toggleRow(parent, order, title, subtitle, key, maid)
	local f = row(parent, order, title, subtitle)
	local t = Kit.Toggle(SettingsController:Get(key) == true, function(v)
		SettingsController:Set(key, v)
	end, {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, 0, 0.5, 0),
		Size = UDim2.fromOffset(60, 32),
		Parent = f,
	})
	maid:Give(SettingsController.Changed:Connect(function(k, v)
		if k == key and t.Get() ~= (v == true) then
			t.Set(v == true, true)
		end
	end))
	return t
end

local function volumeRow(parent, order, title, key, maid)
	local f = row(parent, order, title, nil)
	f.Size = UDim2.new(1, 0, 0, 52)
	local pct = Kit.Label("", {
		AutomaticSize = Enum.AutomaticSize.None,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 0),
		Size = UDim2.new(0, 48, 1, 0),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = Theme.Colors.TextDim,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = f,
	})
	local initial = tonumber(SettingsController:Get(key)) or 0.5
	pct.Text = ("%d%%"):format(math.floor(initial * 100 + 0.5))
	local slider = UIBits.Slider(initial, function(v)
		pct.Text = ("%d%%"):format(math.floor(v * 100 + 0.5))
		SettingsController:Set(key, v)
	end, maid, {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -52, 0.5, 0),
		Size = UDim2.new(0.55, -52, 0, 44),
		Parent = f,
	})
	return slider
end

local function segmentedRow(parent, order, title, key, options, maid)
	local f = row(parent, order, title, nil)
	local holder = Kit.new("Frame", {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, 0, 0.5, 0),
		Size = UDim2.fromOffset(#options * 72, 36),
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = f,
	})
	Kit.Corner(holder, UDim.new(0, 8))
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(1 / #options, -4, 1, -4),
		CellPadding = UDim2.fromOffset(4, 0),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Center,
		Parent = holder,
	})
	local buttons = {}
	local function paint(value)
		for opt, b in pairs(buttons) do
			b.BackgroundColor3 = opt == value and Theme.Colors.Accent or Theme.Colors.Surface
			b.TextColor3 = opt == value and Theme.Colors.Text or Theme.Colors.TextDim
		end
	end
	for _, opt in ipairs(options) do
		local b = Kit.new("TextButton", {
			Text = opt,
			Font = Theme.FontBold,
			TextSize = Theme.TextSize.Small,
			AutoButtonColor = true,
			Parent = holder,
		})
		Kit.Corner(b, UDim.new(0, 6))
		b.Activated:Connect(function()
			SettingsController:Set(key, opt)
		end)
		buttons[opt] = b
	end
	paint(SettingsController:Get(key))
	maid:Give(SettingsController.Changed:Connect(function(k, v)
		if k == key then
			paint(v)
		end
	end))
end

local function build(content: Frame, _data, ctx)
	local maid = ctx.Maid
	local scroll = Kit.Scroll({ Parent = content }, 8)

	UIBits.Section(scroll, "🔊 AUDIO", 1)
	volumeRow(scroll, 2, "Music", "MusicVolume", maid)
	volumeRow(scroll, 3, "Sound effects", "SfxVolume", maid)
	volumeRow(scroll, 4, "Car radio", "RadioVolume", maid)

	UIBits.Section(scroll, "🚗 DRIVING", 10)
	segmentedRow(scroll, 11, "Speed units", "Units", { "MPH", "KMH" }, maid)
	toggleRow(scroll, 12, "Manual transmission", "Shift gears yourself (Q / E, L1 / R1)", "ManualTransmission", maid)
	toggleRow(scroll, 13, "Camera shake", "Shake on bumps, crashes and high speed", "CameraShake", maid)

	UIBits.Section(scroll, "🖥️ DISPLAY", 20)
	toggleRow(scroll, 21, "Low graphics", "Fewer effects and shadows for smoother play", "LowGraphics", maid)
	toggleRow(scroll, 22, "Show name tags", nil, "ShowNameTags", maid)
	toggleRow(scroll, 23, "Hide VIP chat tag", nil, "HideVipChatTag", maid)

	Kit.Button("Reset to defaults", "ghost", function()
		if Router.Confirm("Reset settings?", "All settings go back to their default values.", "Reset") then
			for key, value in pairs(DEFAULTS) do
				SettingsController:Set(key, value)
			end
			ctx.Refresh(nil)
		end
	end, { LayoutOrder = 100, Parent = scroll })
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function SettingsController:Init()
	for name in pairs(GROUPS) do
		ensureGroup(name)
	end
	localPlayer:SetAttribute("LowGraphics", DEFAULTS.LowGraphics == true)
	Router.Register("Settings", {
		Title = "Settings",
		Icon = "⚙️",
		Kind = "window",
		Size = Vector2.new(520, 600),
		Build = build,
	})
end

function SettingsController:Start()
	Router.AddHudButton("Settings", "⚙️", "Settings", 90, function()
		Router.Toggle("Settings", nil)
	end)
	ClientData.OnChanged("Settings", function(settings)
		local t = type(settings) == "table" and settings or {}
		for key, default in pairs(DEFAULTS) do
			local v = t[key]
			if v == nil then
				v = default
			end
			if pending[key] == nil then
				apply(key, v)
			end
		end
	end)
end

return SettingsController
