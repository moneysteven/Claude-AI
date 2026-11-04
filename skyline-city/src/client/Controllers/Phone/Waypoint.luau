-- Waypoint (PhoneController helper): the GPS target shown in the world.
--
--   Waypoint.Start()                      call once (PhoneController:Start)
--   Waypoint.Set(position, label)         beam from your character to the target, billboard marker with distance,
--                                          light pillar and a HUD chip (tap ✕ to clear). Clears itself on arrival.
--   Waypoint.Clear()
--   Waypoint.Get() -> { Position, Label }?
--   Waypoint.Changed : Signal(waypoint?)
-- Everything here is client-local (created by this client, never replicated).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Signal = require(Shared.Util.Signal)
local Maid = require(Shared.Util.Maid)
local PhoneConfig = require(Shared.Config.Phone)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local CFG = PhoneConfig.Waypoint

local Waypoint = {}
Waypoint.Changed = Signal.new()

local localPlayer = Players.LocalPlayer
local current: { Position: Vector3, Label: string }? = nil
local maid = Maid.new()
local token = 0
local started = false

local function rootPart(): BasePart?
	local char = localPlayer.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root
	end
	return nil
end

local function formatDistance(studs: number): string
	local m = studs * CFG.MetersPerStud
	if m >= 1000 then
		return ("%.1f km"):format(m / 1000)
	end
	return ("%d m"):format(math.floor(m + 0.5))
end

local function buildWorld(position: Vector3, label: string)
	local folder = Instance.new("Folder")
	folder.Name = "SkylineGPS"

	local target = Instance.new("Part")
	target.Name = "Target"
	target.Anchored = true
	target.CanCollide = false
	target.CanQuery = false
	target.CanTouch = false
	target.CastShadow = false
	target.Transparency = 1
	target.Size = Vector3.new(1, 1, 1)
	target.Position = position + Vector3.new(0, 1.5, 0)
	target.Parent = folder

	local targetAttachment = Instance.new("Attachment")
	targetAttachment.Name = "GPSTarget"
	targetAttachment.Parent = target

	local pillar = Instance.new("Part")
	pillar.Name = "Pillar"
	pillar.Anchored = true
	pillar.CanCollide = false
	pillar.CanQuery = false
	pillar.CanTouch = false
	pillar.CastShadow = false
	pillar.Material = Enum.Material.Neon
	pillar.Color = CFG.BeamColor
	pillar.Transparency = 0.6
	pillar.Shape = Enum.PartType.Cylinder
	pillar.Size = Vector3.new(60, 1.2, 1.2)
	pillar.CFrame = CFrame.new(position + Vector3.new(0, 30, 0)) * CFrame.Angles(0, 0, math.rad(90))
	pillar.Parent = folder

	local ring = Instance.new("Part")
	ring.Name = "Ring"
	ring.Anchored = true
	ring.CanCollide = false
	ring.CanQuery = false
	ring.CanTouch = false
	ring.CastShadow = false
	ring.Material = Enum.Material.Neon
	ring.Color = CFG.BeamColor
	ring.Transparency = 0.5
	ring.Shape = Enum.PartType.Cylinder
	ring.Size = Vector3.new(0.15, CFG.ArriveDistance * 2, CFG.ArriveDistance * 2)
	ring.CFrame = CFrame.new(position + Vector3.new(0, 0.1, 0)) * CFrame.Angles(0, 0, math.rad(90))
	ring.Parent = folder

	local gui = Instance.new("BillboardGui")
	gui.Name = "Marker"
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.Size = UDim2.fromOffset(170, 62)
	gui.StudsOffset = Vector3.new(0, CFG.MarkerHeight, 0)
	gui.Adornee = target
	gui.Parent = target

	local card = Kit.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.15,
		Parent = gui,
	})
	Kit.Corner(card, Theme.CornerSmall)
	Kit.Stroke(card, CFG.BeamColor, 2, 0)
	Kit.new("TextLabel", {
		Name = "Title",
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(6, 4),
		Size = UDim2.new(1, -12, 0, 26),
		Font = Theme.FontBold,
		TextScaled = true,
		TextColor3 = Theme.Colors.Text,
		Text = "📍 " .. label,
		Parent = card,
	})
	Kit.new("TextLabel", {
		Name = "Distance",
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(6, 32),
		Size = UDim2.new(1, -12, 0, 22),
		Font = Theme.Font,
		TextScaled = true,
		TextColor3 = Theme.Colors.TextDim,
		Text = "",
		Parent = card,
	})

	local beam = Instance.new("Beam")
	beam.Name = "GPSBeam"
	beam.Attachment1 = targetAttachment
	beam.Color = ColorSequence.new(CFG.BeamColor)
	beam.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.15),
		NumberSequenceKeypoint.new(0.7, 0.45),
		NumberSequenceKeypoint.new(1, 0.85),
	})
	beam.Width0 = CFG.BeamWidth
	beam.Width1 = CFG.BeamWidth * 0.6
	beam.FaceCamera = true
	beam.LightEmission = 1
	beam.LightInfluence = 0
	beam.Segments = 12
	beam.CurveSize0 = 0
	beam.CurveSize1 = 0
	beam.Parent = target

	folder.Parent = Workspace
	return folder, beam, gui
end

local function buildChip(label: string)
	local hud = Router.GetLayer("HUD")
	if not hud then
		return nil, nil
	end
	local chip = Kit.new("Frame", {
		Name = "GPSChip",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 64),
		Size = UDim2.fromOffset(0, 44),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.1,
		Parent = hud,
	})
	Kit.Corner(chip, UDim.new(1, 0))
	Kit.Stroke(chip, CFG.BeamColor, 2, 0)
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 4), Parent = chip })
	Kit.List(chip, 8, true)
	local text = Kit.new("TextLabel", {
		Name = "Text",
		LayoutOrder = 1,
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(0, 44),
		AutomaticSize = Enum.AutomaticSize.X,
		Font = Theme.FontBold,
		TextSize = 15,
		TextColor3 = Theme.Colors.Text,
		Text = "🧭 " .. label,
		Parent = chip,
	})
	Kit.IconButton("✕", function()
		Waypoint.Clear()
	end, {
		LayoutOrder = 2,
		Size = UDim2.fromOffset(36, 36),
		TextSize = 16,
		Parent = chip,
	})
	local s = Kit.new("UIScale", { Scale = 0.6, Parent = chip })
	Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
	return chip, text
end

local function attachToCharacter(beam: Beam)
	local root = rootPart()
	if not root then
		beam.Attachment0 = nil
		return
	end
	local att = root:FindFirstChild("SkylineGPSAttachment")
	if not att then
		att = Instance.new("Attachment")
		att.Name = "SkylineGPSAttachment"
		att.Position = Vector3.new(0, -1.2, 0)
		att.Parent = root
	end
	beam.Attachment0 = att :: Attachment
end

function Waypoint.Get()
	return current
end

function Waypoint.Clear()
	token += 1
	maid:Clean()
	if current then
		current = nil
		Waypoint.Changed:Fire(nil)
	end
end

function Waypoint.Set(position: Vector3, label: string?)
	if typeof(position) ~= "Vector3" then
		return
	end
	Waypoint.Clear()
	local name = tostring(label or "Waypoint")
	current = { Position = position, Label = name }
	token += 1
	local myToken = token

	local folder, beam, gui = buildWorld(position, name)
	maid:Give(folder)
	local chip, chipText = buildChip(name)
	if chip then
		maid:Give(chip)
	end
	attachToCharacter(beam)
	maid:Give(localPlayer.CharacterAdded:Connect(function(char)
		char:WaitForChild("HumanoidRootPart", 10)
		if token == myToken then
			attachToCharacter(beam)
		end
	end))
	maid:Give(function()
		local root = rootPart()
		local att = root and root:FindFirstChild("SkylineGPSAttachment")
		if att then
			att:Destroy()
		end
	end)

	local distanceLabel = gui:FindFirstChild("Distance", true) :: TextLabel?
	maid:Give(task.spawn(function()
		local interval = 1 / math.max(1, CFG.UpdateHz)
		while token == myToken do
			local root = rootPart()
			if root then
				if beam.Attachment0 == nil or beam.Attachment0.Parent ~= root then
					attachToCharacter(beam)
				end
				local flat = Vector3.new(position.X - root.Position.X, 0, position.Z - root.Position.Z)
				local dist = flat.Magnitude
				local text = formatDistance(dist)
				if distanceLabel then
					distanceLabel.Text = text
				end
				if chipText then
					chipText.Text = ("🧭 %s · %s"):format(name, text)
				end
				if dist <= CFG.ArriveDistance and math.abs(position.Y - root.Position.Y) < 30 then
					Router.Notify(("📍 You arrived: %s"):format(name), "success", 3)
					task.defer(function()
						if token == myToken then
							Waypoint.Clear()
						end
					end)
					return
				end
			end
			task.wait(interval)
		end
	end))

	Waypoint.Changed:Fire(current)
end

function Waypoint.Start()
	if started then
		return
	end
	started = true
	-- clear the GPS when the player leaves (keeps the client tidy in Studio play-tests)
	localPlayer.AncestryChanged:Connect(function(_, parent)
		if parent == nil then
			Waypoint.Clear()
		end
	end)
end

return Waypoint
