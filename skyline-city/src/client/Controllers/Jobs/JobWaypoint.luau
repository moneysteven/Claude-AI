-- JobWaypoint: local-only GPS beam + marker column + distance billboard to a world position.
-- Works with StreamingEnabled because it only needs a Vector3 (the target part may not be streamed in).
--
--   local wp = JobWaypoint.new()
--   wp:Set(position, label, icon?, color?)   wp:Clear()   wp:Update()   wp:Destroy()

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local JobWaypoint = {}
JobWaypoint.__index = JobWaypoint

local player = Players.LocalPlayer

function JobWaypoint.new()
	local self = setmetatable({}, JobWaypoint)
	local folder = Instance.new("Folder")
	folder.Name = "JobWaypointLocal"
	folder.Parent = Workspace
	self.Folder = folder

	local anchor = Instance.new("Part")
	anchor.Name = "Anchor"
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanQuery = false
	anchor.CanTouch = false
	anchor.CastShadow = false
	anchor.Transparency = 1
	anchor.Size = Vector3.new(1, 1, 1)
	anchor.Parent = folder
	self.Anchor = anchor

	local column = Instance.new("Part")
	column.Name = "Column"
	column.Anchored = true
	column.CanCollide = false
	column.CanQuery = false
	column.CanTouch = false
	column.CastShadow = false
	column.Material = Enum.Material.Neon
	column.Shape = Enum.PartType.Cylinder
	column.Size = Vector3.new(60, 3, 3)
	column.Transparency = 0.65
	column.Parent = folder
	self.Column = column

	local att = Instance.new("Attachment")
	att.Name = "WaypointEnd"
	att.Position = Vector3.new(0, 2, 0)
	att.Parent = anchor
	self.EndAttachment = att

	local beam = Instance.new("Beam")
	beam.Name = "GPS"
	beam.FaceCamera = true
	beam.Width0 = 0.5
	beam.Width1 = 0.5
	beam.Segments = 12
	beam.LightEmission = 0.8
	beam.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.2), NumberSequenceKeypoint.new(1, 0.7) })
	beam.Attachment1 = att
	beam.Enabled = false
	beam.Parent = anchor
	self.Beam = beam

	local gui = Instance.new("BillboardGui")
	gui.Name = "Marker"
	gui.AlwaysOnTop = true
	gui.Size = UDim2.fromOffset(170, 52)
	gui.StudsOffsetWorldSpace = Vector3.new(0, 7, 0)
	gui.LightInfluence = 0
	gui.MaxDistance = 100000
	gui.Adornee = anchor
	gui.Enabled = false
	gui.Parent = anchor
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = Color3.fromRGB(16, 18, 26)
	label.BackgroundTransparency = 0.25
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextScaled = true
	label.RichText = true
	label.Font = Enum.Font.GothamBold
	label.Text = ""
	label.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 10)
	corner.Parent = label
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 6)
	pad.PaddingRight = UDim.new(0, 6)
	pad.PaddingTop = UDim.new(0, 3)
	pad.PaddingBottom = UDim.new(0, 3)
	pad.Parent = label
	self.Gui = gui
	self.Label = label

	self.Position = nil
	self.Text = ""
	self.Icon = "📍"
	self:Clear()
	return self
end

function JobWaypoint:_rootAttachment(): Attachment?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if not root then
		return nil
	end
	local att = root:FindFirstChild("JobWaypointStart")
	if not att then
		att = Instance.new("Attachment")
		att.Name = "JobWaypointStart"
		att.Parent = root
	end
	return att :: Attachment
end

function JobWaypoint:Set(position: Vector3, text: string?, icon: string?, color: Color3?)
	self.Position = position
	self.Text = text or "Destination"
	self.Icon = icon or "📍"
	local c = color or Color3.fromRGB(64, 156, 255)
	self.Anchor.CFrame = CFrame.new(position)
	self.Column.CFrame = CFrame.new(position + Vector3.new(0, 30, 0)) * CFrame.Angles(0, 0, math.rad(90))
	self.Column.Color = c
	self.Column.Transparency = 0.65
	self.Beam.Color = ColorSequence.new(c)
	self.Gui.Enabled = true
	self:Update()
end

function JobWaypoint:Clear()
	self.Position = nil
	self.Beam.Enabled = false
	self.Gui.Enabled = false
	self.Column.Transparency = 1
end

function JobWaypoint:Update()
	if not self.Position then
		return
	end
	local att = self:_rootAttachment()
	if att then
		self.Beam.Attachment0 = att
		local dist = (att.WorldPosition - self.Position).Magnitude
		-- hide the beam when you're basically there
		self.Beam.Enabled = dist > 12
		self.Label.Text = ("%s %s  <font color=\"#A0A6BA\">%dm</font>"):format(self.Icon, self.Text, math.floor(dist / 3.57 + 0.5))
	else
		self.Beam.Enabled = false
		self.Label.Text = ("%s %s"):format(self.Icon, self.Text)
	end
end

function JobWaypoint:Distance(): number?
	if not self.Position then
		return nil
	end
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return (root.Position - self.Position).Magnitude
	end
	return nil
end

function JobWaypoint:Destroy()
	self.Folder:Destroy()
end

return JobWaypoint
