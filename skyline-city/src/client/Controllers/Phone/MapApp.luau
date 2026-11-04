-- Maps / GPS app (phone). Draws Shared/Config/CityLayout (districts, roads, POIs) into a pannable, zoomable map.
--   * drag / touch to pan, mouse wheel / pinch / ＋ － to zoom, ◎ re-centres and follows you
--   * gamepad: right stick pans, L1 / R1 zoom
--   * tap a POI (or a 🎉 party) -> info card -> "Set GPS" (PhoneController:SetWaypoint)
-- CityLayout is written by the world system; if it isn't there (yet) the app shows a "Map loading" state.

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local PhoneConfig = require(Shared.Config.Phone)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local AppKit = require(script.Parent:WaitForChild("AppKit"))
local PhoneState = require(script.Parent:WaitForChild("PhoneState"))

local MapApp = {}

local CFG = PhoneConfig.Map
local localPlayer = Players.LocalPlayer

local savedZoom = CFG.DefaultZoom

---------------------------------------------------------------------------
-- Layout loading (world-owned module; may be missing)
---------------------------------------------------------------------------
local function validLayout(t: any): boolean
	return type(t) == "table"
		and type(t.Bounds) == "table"
		and typeof(t.Bounds.Min) == "Vector2"
		and typeof(t.Bounds.Max) == "Vector2"
		and t.Bounds.Max.X > t.Bounds.Min.X
		and t.Bounds.Max.Y > t.Bounds.Min.Y
end

function MapApp.LoadLayout(): any
	local config = Shared:FindFirstChild("Config")
	local module = config and config:FindFirstChild("CityLayout")
	if module and module:IsA("ModuleScript") then
		local ok, result = pcall(require, module)
		if ok and validLayout(result) then
			return result
		end
	end
	return nil
end

---------------------------------------------------------------------------
-- Map view
---------------------------------------------------------------------------
local function buildMap(body: Frame, layout, ctx)
	local Phone = ctx.Phone
	local minB: Vector2 = layout.Bounds.Min
	local maxB: Vector2 = layout.Bounds.Max
	local W, H = maxB.X - minB.X, maxB.Y - minB.Y

	local zoom = math.clamp(savedZoom, CFG.MinZoom, CFG.MaxZoom)
	local center = Vector2.new((minB.X + maxB.X) / 2, (minB.Y + maxB.Y) / 2)
	local follow = true

	local function toScale(x: number, z: number): (number, number)
		return (x - minB.X) / W, (z - minB.Y) / H
	end

	local viewport = Kit.new("TextButton", {
		Name = "Viewport",
		Text = "",
		AutoButtonColor = false,
		Selectable = false,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = CFG.BackgroundColor,
		ClipsDescendants = true,
		Parent = body,
	})
	local canvas = Kit.new("Frame", {
		Name = "Canvas",
		BackgroundTransparency = 1,
		Position = UDim2.fromScale(0.5, 0.5),
		Parent = viewport,
	})
	local function layer(name: string, z: number): Frame
		return Kit.new("Frame", {
			Name = name,
			BackgroundTransparency = 1,
			Size = UDim2.fromScale(1, 1),
			ZIndex = z,
			Parent = canvas,
		})
	end
	local districtLayer = layer("Districts", 1)
	local roadLayer = layer("Roads", 2)
	local poiLayer = layer("POIs", 3)
	local liveLayer = layer("Live", 4)

	local function apply()
		center = Vector2.new(math.clamp(center.X, minB.X, maxB.X), math.clamp(center.Y, minB.Y, maxB.Y))
		canvas.Size = UDim2.fromOffset(W * zoom, H * zoom)
		local u, v = toScale(center.X, center.Y)
		canvas.AnchorPoint = Vector2.new(u, v)
	end

	-- districts
	for _, d in ipairs(layout.Districts or {}) do
		if typeof(d.Center) == "Vector3" and typeof(d.Size) == "Vector2" then
			local u, v = toScale(d.Center.X - d.Size.X / 2, d.Center.Z - d.Size.Y / 2)
			local f = Kit.new("Frame", {
				Position = UDim2.fromScale(u, v),
				Size = UDim2.fromScale(d.Size.X / W, d.Size.Y / H),
				BackgroundColor3 = typeof(d.Color) == "Color3" and d.Color or Theme.Colors.SurfaceAlt,
				BackgroundTransparency = CFG.DistrictTransparency,
				Parent = districtLayer,
			})
			Kit.Corner(f, UDim.new(0, 6))
			Kit.new("TextLabel", {
				BackgroundTransparency = 1,
				Size = UDim2.fromScale(1, 1),
				Text = tostring(d.Name or ""),
				TextSize = 12,
				Font = Theme.FontBold,
				TextColor3 = Color3.new(1, 1, 1),
				TextTransparency = 0.25,
				TextStrokeTransparency = 0.6,
				TextWrapped = true,
				Parent = f,
			})
		end
	end

	-- roads (sizes in canvas scale so they stay correct while zooming)
	for _, r in ipairs(layout.Roads or {}) do
		if typeof(r.From) == "Vector3" and typeof(r.To) == "Vector3" then
			local dx, dz = r.To.X - r.From.X, r.To.Z - r.From.Z
			local len = math.sqrt(dx * dx + dz * dz)
			if len > 0 then
				local cu, cv = toScale((r.From.X + r.To.X) / 2, (r.From.Z + r.To.Z) / 2)
				local width = tonumber(r.Width) or 20
				Kit.new("Frame", {
					AnchorPoint = Vector2.new(0.5, 0.5),
					Position = UDim2.fromScale(cu, cv),
					Size = UDim2.new((len + width) / W, 0, width / H, 0),
					Rotation = math.deg(math.atan2(dz, dx)),
					BackgroundColor3 = CFG.RoadColor,
					BorderSizePixel = 0,
					Parent = roadLayer,
				})
			end
		end
	end

	-- info card
	local card = Kit.new("Frame", {
		Name = "InfoCard",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -10),
		Size = UDim2.new(1, -20, 0, 96),
		BackgroundColor3 = Theme.Colors.Surface,
		Visible = false,
		ZIndex = 10,
		Parent = body,
	})
	Kit.Corner(card, Theme.CornerSmall)
	Kit.Stroke(card)
	local cardTitle = Kit.Label("", {
		Font = Theme.FontBold,
		TextSize = 15,
		Position = UDim2.fromOffset(12, 8),
		Size = UDim2.new(1, -60, 0, 20),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		RichText = false,
		ZIndex = 11,
		Parent = card,
	})
	local cardSub = Kit.Label("", {
		TextSize = 12,
		TextColor3 = Theme.Colors.TextDim,
		Position = UDim2.fromOffset(12, 28),
		Size = UDim2.new(1, -60, 0, 16),
		AutomaticSize = Enum.AutomaticSize.None,
		RichText = false,
		ZIndex = 11,
		Parent = card,
	})
	Kit.IconButton("✕", function()
		card.Visible = false
	end, {
		Size = UDim2.fromOffset(36, 36),
		Position = UDim2.new(1, -44, 0, 6),
		TextSize = 14,
		ZIndex = 11,
		Parent = card,
	})
	local selected: { Position: Vector3, Name: string }? = nil
	Kit.Button("📍 Set GPS", "primary", function()
		if selected then
			Phone:SetWaypoint(selected.Position, selected.Name)
			Router.Notify(("🧭 GPS set: %s"):format(AppKit.Escape(selected.Name)), "success", 2)
			card.Visible = false
		end
	end, {
		Position = UDim2.new(0, 10, 1, -50),
		Size = UDim2.new(1, -20, 0, 44),
		ZIndex = 11,
		Parent = card,
	})

	local function showCard(name: string, sub: string, pos: Vector3)
		selected = { Position = pos, Name = name }
		cardTitle.Text = name
		cardSub.Text = sub
		card.Visible = true
		local s = card:FindFirstChildOfClass("UIScale") or Kit.new("UIScale", { Parent = card })
		s.Scale = 0.85
		Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
	end

	local function poiButton(parent: Instance, icon: string, pos: Vector3, onClick: () -> ())
		local u, v = toScale(pos.X, pos.Z)
		local b = Kit.new("TextButton", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(u, v),
			Size = UDim2.fromOffset(CFG.PoiSize, CFG.PoiSize),
			BackgroundColor3 = Theme.Colors.Surface,
			BackgroundTransparency = 0.1,
			Text = icon,
			TextSize = math.floor(CFG.PoiSize * 0.6),
			Font = Theme.FontBold,
			TextColor3 = Theme.Colors.Text,
			AutoButtonColor = true,
			Parent = parent,
		})
		Kit.Corner(b, UDim.new(1, 0))
		Kit.Stroke(b, Color3.new(1, 1, 1), 1, 0.4)
		b.Activated:Connect(function()
			follow = false
			task.spawn(onClick)
		end)
		return b
	end

	for _, poi in ipairs(layout.POIs or {}) do
		if typeof(poi.Position) == "Vector3" then
			local icon = (type(poi.Icon) == "string" and poi.Icon ~= "" and poi.Icon) or CFG.CategoryIcons[poi.Category] or "📍"
			local name = tostring(poi.Name or poi.Id or "Place")
			poiButton(poiLayer, icon, poi.Position, function()
				showCard(icon .. " " .. name, tostring(poi.Category or ""), poi.Position)
			end)
		end
	end

	-- live markers: parties, waypoint, me
	local partyHolder = Kit.new("Frame", { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Parent = liveLayer })
	local function renderParties()
		for _, c in ipairs(partyHolder:GetChildren()) do
			c:Destroy()
		end
		for _, party in pairs(PhoneState.Parties) do
			if typeof(party.Position) == "Vector3" then
				local b = poiButton(partyHolder, "🎉", party.Position, function()
					local left = math.max(0, (party.EndsAt or os.time()) - os.time())
					showCard("🎉 " .. tostring(party.Name), ("Hosted by %s · ends in %d min"):format(tostring(party.HostName), math.ceil(left / 60)), party.Position)
				end)
				b.BackgroundColor3 = Color3.fromRGB(120, 40, 110)
			end
		end
	end
	renderParties()
	ctx.Maid:Give(PhoneState.Changed:Connect(function(kind)
		if kind == "Parties" then
			renderParties()
		end
	end))
	task.spawn(PhoneState.FetchParties)

	local wpMarker = Kit.new("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 1),
		Size = UDim2.fromOffset(30, 30),
		BackgroundTransparency = 1,
		Text = "📍",
		TextSize = 26,
		Visible = false,
		Parent = liveLayer,
	})
	local function renderWaypoint()
		local wp = Phone:GetWaypoint()
		if wp then
			local u, v = toScale(wp.Position.X, wp.Position.Z)
			wpMarker.Position = UDim2.fromScale(u, v)
			wpMarker.Visible = true
		else
			wpMarker.Visible = false
		end
	end
	renderWaypoint()
	ctx.Maid:Give(Phone.WaypointChanged:Connect(function()
		renderWaypoint()
	end))

	local me = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Size = UDim2.fromOffset(26, 26),
		BackgroundColor3 = Theme.Colors.Accent,
		Parent = liveLayer,
	})
	Kit.Corner(me, UDim.new(1, 0))
	Kit.Stroke(me, Color3.new(1, 1, 1), 2, 0)
	local arrow = Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Text = "▲",
		TextSize = 14,
		Font = Theme.FontBold,
		TextColor3 = Color3.new(1, 1, 1),
		Parent = me,
	})

	-- controls
	local controls = Kit.new("Frame", {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -8, 0, 8),
		Size = UDim2.fromOffset(44, 3 * 44 + 2 * 6),
		BackgroundTransparency = 1,
		ZIndex = 8,
		Parent = body,
	})
	Kit.List(controls, 6)
	local function setZoom(z: number)
		zoom = math.clamp(z, CFG.MinZoom, CFG.MaxZoom)
		savedZoom = zoom
		apply()
	end
	Kit.IconButton("＋", function()
		setZoom(zoom * CFG.ZoomStep)
	end, { LayoutOrder = 1, Size = UDim2.fromOffset(44, 44), ZIndex = 8, Parent = controls })
	Kit.IconButton("－", function()
		setZoom(zoom / CFG.ZoomStep)
	end, { LayoutOrder = 2, Size = UDim2.fromOffset(44, 44), ZIndex = 8, Parent = controls })
	Kit.IconButton("◎", function()
		follow = true
	end, { LayoutOrder = 3, Size = UDim2.fromOffset(44, 44), ZIndex = 8, Parent = controls })

	-- panning
	local dragging = false
	local lastPos: Vector2? = nil
	local function pxPerStud(): number
		return math.max(0.0001, canvas.AbsoluteSize.X / W)
	end
	ctx.Maid:Give(viewport.InputBegan:Connect(function(input)
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch then
			dragging = true
			lastPos = Vector2.new(input.Position.X, input.Position.Y)
		end
	end))
	ctx.Maid:Give(viewport.InputChanged:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseWheel then
			setZoom(input.Position.Z > 0 and zoom * CFG.ZoomStep or zoom / CFG.ZoomStep)
		end
	end))
	ctx.Maid:Give(UserInputService.InputChanged:Connect(function(input)
		if not dragging or not lastPos then
			return
		end
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseMovement or t == Enum.UserInputType.Touch then
			local pos = Vector2.new(input.Position.X, input.Position.Y)
			local delta = pos - lastPos
			lastPos = pos
			if delta.Magnitude > 0 then
				follow = false
				center -= delta / pxPerStud()
				apply()
			end
		end
	end))
	ctx.Maid:Give(UserInputService.InputEnded:Connect(function(input)
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch then
			dragging = false
			lastPos = nil
		end
	end))
	local pinchStart = zoom
	ctx.Maid:Give(UserInputService.TouchPinch:Connect(function(_positions, scale, _velocity, state)
		if state == Enum.UserInputState.Begin then
			pinchStart = zoom
		elseif state == Enum.UserInputState.Change then
			setZoom(pinchStart * scale)
		end
	end))

	-- gamepad
	local stick = Vector2.zero
	ContextActionService:BindActionAtPriority("SkylineMapPan", function(_, state, input)
		if state == Enum.UserInputState.Cancel or state == Enum.UserInputState.End then
			stick = Vector2.zero
		else
			local v = Vector2.new(input.Position.X, -input.Position.Y)
			stick = v.Magnitude > 0.15 and v or Vector2.zero
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.ContextActionPriority.High.Value, Enum.KeyCode.Thumbstick2)
	ContextActionService:BindActionAtPriority("SkylineMapZoom", function(_, state, input)
		if state == Enum.UserInputState.Begin then
			if input.KeyCode == Enum.KeyCode.ButtonR1 then
				setZoom(zoom * CFG.ZoomStep)
			else
				setZoom(zoom / CFG.ZoomStep)
			end
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.ContextActionPriority.High.Value, Enum.KeyCode.ButtonR1, Enum.KeyCode.ButtonL1)
	ctx.Maid:Give(function()
		ContextActionService:UnbindAction("SkylineMapPan")
		ContextActionService:UnbindAction("SkylineMapZoom")
	end)

	-- live update (10 Hz for markers, per-frame only for gamepad panning)
	local acc = 0
	ctx.Maid:Give(RunService.Heartbeat:Connect(function(dt)
		if stick.Magnitude > 0 then
			follow = false
			center += stick * (420 * dt) / pxPerStud()
			apply()
		end
		acc += dt
		if acc < 0.1 then
			return
		end
		acc = 0
		local char = localPlayer.Character
		local root = char and char:FindFirstChild("HumanoidRootPart")
		if root and root:IsA("BasePart") then
			local p = root.Position
			local u, v = toScale(p.X, p.Z)
			me.Position = UDim2.fromScale(u, v)
			local look = root.CFrame.LookVector
			arrow.Rotation = math.deg(math.atan2(look.X, -look.Z))
			if follow then
				center = Vector2.new(p.X, p.Z)
				apply()
			end
		end
	end))

	apply()
end

function MapApp.Build(container: Frame, _data: any, ctx)
	local district = localPlayer:GetAttribute("District")
	local body = AppKit.Page(container, "Maps", ctx, {
		Subtitle = (type(district) == "string" and district ~= "") and ("📍 " .. district) or nil,
	})
	local layout = MapApp.LoadLayout()
	if layout then
		buildMap(body, layout, ctx)
		return nil
	end

	-- "Map loading" state: the world module may still be on its way (or not installed)
	local holder = Kit.new("Frame", {
		BackgroundColor3 = CFG.BackgroundColor,
		Size = UDim2.fromScale(1, 1),
		Parent = body,
	})
	local icon = Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.42),
		Size = UDim2.fromOffset(80, 80),
		Text = "🗺️",
		TextSize = 56,
		Parent = holder,
	})
	local status = Kit.Label("Map loading…", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.fromScale(0.5, 0.55),
		Size = UDim2.new(1, -40, 0, 40),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextColor3 = Theme.Colors.Text,
		Parent = holder,
	})
	local alive = true
	ctx.Maid:Give(function()
		alive = false
	end)
	task.spawn(function()
		local tries = 0
		while alive do
			Kit.Tween(icon, { Rotation = (tries % 2 == 0) and 8 or -8 }, Theme.Tween.Normal)
			task.wait(1)
			tries += 1
			if not alive then
				return
			end
			local l = MapApp.LoadLayout()
			if l then
				holder:Destroy()
				buildMap(body, l, ctx)
				return
			end
			if tries >= 20 then
				status.Text = "The city map isn't available yet.\nTry again in a moment."
				Kit.Tween(icon, { Rotation = 0 }, Theme.Tween.Normal)
				return
			end
		end
	end)
	return nil
end

return MapApp
