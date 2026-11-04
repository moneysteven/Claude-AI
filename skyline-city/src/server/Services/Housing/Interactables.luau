-- Interactables (server helper): server-side ProximityPrompts for doors and lights.
--
--   Interactables.AttachDoor(model, opts) -> cleanup()
--     opts.Style    "Swing" | "SlideUp" | "SlideSide"
--     opts.CanOpen  (player) -> (boolean, string?)   nil = everyone may open
--     opts.LockHost Instance? whose boolean attribute "Locked" is shown on the prompt (and closes doors when locked)
--     opts.OnDenied (player, reason) -> ()
--   Interactables.AttachLight(model, canUse?) -> cleanup()
--
-- Doors move ANCHORED parts with TweenService (engine-driven, no Luau loop). An open door has no collision;
-- closed doors block everyone — locked doors simply refuse to open for players without a key.

local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local HousingConfig = require(Shared.Config.Housing)

local Interactables = {}

local DOOR = HousingConfig.Doors

local function findPanel(model: Instance): BasePart?
	local panel = model:FindFirstChild("Panel", true)
	if panel and panel:IsA("BasePart") then
		return panel
	end
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and d:GetAttribute("DoorPart") then
			return d
		end
	end
	return nil
end

function Interactables.AttachDoor(model: Instance, opts: { [string]: any }?): () -> ()
	local o = opts or {}
	local panel = findPanel(model)
	if not panel then
		return function() end
	end
	local style = o.Style or "Swing"

	local moving: { { part: BasePart, closed: CFrame, collide: boolean } } = {}
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and (d == panel or d:GetAttribute("DoorPart")) then
			table.insert(moving, { part = d, closed = d.CFrame, collide = d.CanCollide })
		end
	end
	local panelClosed = panel.CFrame

	local function openCFrame(closed: CFrame): CFrame
		if style == "SlideUp" then
			return closed + panelClosed.UpVector * (panel.Size.Y * 0.92)
		elseif style == "SlideSide" then
			return closed + panelClosed.RightVector * (panel.Size.X * 0.95)
		end
		local hinge = panelClosed * CFrame.new(-panel.Size.X / 2, 0, 0)
		local rot = CFrame.Angles(0, math.rad(DOOR.SwingAngle), 0)
		return hinge * rot * hinge:Inverse() * closed
	end

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "DoorPrompt"
	prompt.ActionText = "Open"
	prompt.ObjectText = "Door"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = DOOR.PromptDistance
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Style = Enum.ProximityPromptStyle.Default
	prompt.Parent = panel

	local isOpen = false
	local token = 0
	local info = TweenInfo.new(DOOR.OpenSeconds, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local connections: { RBXScriptConnection } = {}

	local function setOpen(open: boolean)
		isOpen = open
		prompt.ActionText = open and "Close" or "Open"
		for _, m in ipairs(moving) do
			if m.part.Parent then
				local target = open and openCFrame(m.closed) or m.closed
				m.part.CanCollide = (not open) and m.collide
				TweenService:Create(m.part, info, { CFrame = target }):Play()
			end
		end
	end

	local function refreshLockText()
		local locked = o.LockHost and o.LockHost:GetAttribute("Locked") == true
		prompt.ObjectText = locked and "Door 🔒" or "Door"
		if locked and isOpen then
			setOpen(false)
		end
	end

	table.insert(
		connections,
		prompt.Triggered:Connect(function(player: Player)
			if o.CanOpen then
				local ok, allowed, reason = pcall(o.CanOpen, player)
				if not ok or not allowed then
					if o.OnDenied then
						task.spawn(o.OnDenied, player, (ok and reason) or "Locked")
					end
					return
				end
			end
			setOpen(not isOpen)
			token += 1
			if isOpen then
				local my = token
				task.delay(DOOR.AutoCloseSeconds, function()
					if token == my and isOpen and panel.Parent then
						setOpen(false)
					end
				end)
			end
		end)
	)

	if o.LockHost then
		refreshLockText()
		table.insert(connections, o.LockHost:GetAttributeChangedSignal("Locked"):Connect(refreshLockText))
	end

	local cleaned = false
	local function cleanup()
		if cleaned then
			return
		end
		cleaned = true
		token += 1
		for _, c in ipairs(connections) do
			c:Disconnect()
		end
		table.clear(connections)
	end
	table.insert(connections, model.Destroying:Connect(cleanup))
	return cleanup
end

function Interactables.AttachLight(model: Instance, canUse: ((Player) -> boolean)?): () -> ()
	local lights: { Light } = {}
	local host: BasePart? = nil
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("Light") then
			table.insert(lights, d)
			if not host and d.Parent and d.Parent:IsA("BasePart") then
				host = d.Parent :: BasePart
			end
		end
	end
	if #lights == 0 or not host then
		return function() end
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "LightPrompt"
	prompt.ActionText = "Turn off"
	prompt.ObjectText = "Light"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = DOOR.PromptDistance
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.F
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonY
	prompt.Parent = host

	local on = true
	local conn = prompt.Triggered:Connect(function(player: Player)
		if canUse then
			local ok, allowed = pcall(canUse, player)
			if not ok or not allowed then
				return
			end
		end
		on = not on
		prompt.ActionText = on and "Turn off" or "Turn on"
		for _, l in ipairs(lights) do
			l.Enabled = on
		end
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") and d.Material == Enum.Material.Neon and d:GetAttribute("LightPart") then
				d.Transparency = on and 0 or 0.6
			end
		end
	end)
	local destroying
	destroying = model.Destroying:Connect(function()
		conn:Disconnect()
		destroying:Disconnect()
	end)
	return function()
		conn:Disconnect()
		destroying:Disconnect()
	end
end

return Interactables
