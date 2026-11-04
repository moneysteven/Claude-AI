-- NameTags (SocialService helper): builds the BillboardGui above every character's head from player attributes.
--
--   NameTags.Build(player, head) -> BillboardGui      (parented to the head)
--   NameTags.Update(gui, player)                      (re-reads RPName, Bio, WealthTier/Title, VIP, JobId, GroupName)
--
-- The gui is named "SkylineNameTag" so clients can find it (SocialController hides others' tags when
-- Settings.ShowNameTags is off, and hides your own tag unless Config.Social.NameTags.ShowOwnTag).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Economy = require(Shared.Config.Economy)
local SocialConfig = require(Shared.Config.Social)

local CFG = SocialConfig.NameTags

local NameTags = {}
NameTags.GuiName = "SkylineNameTag"

-- Config.Jobs is optional (written by the jobs system); read icons from it when present.
local jobsConfig: any = nil
local jobsLoaded = false
local function getJobs(): any
	if jobsLoaded then
		return jobsConfig
	end
	jobsLoaded = true
	local module = Shared:FindFirstChild("Config") and Shared.Config:FindFirstChild("Jobs")
	if module and module:IsA("ModuleScript") then
		local ok, result = pcall(require, module)
		if ok and type(result) == "table" then
			jobsConfig = result
		end
	end
	return jobsConfig
end

local function jobDisplay(jobId: string): string
	local jobs = getJobs()
	local def = jobs and type(jobs.Jobs) == "table" and jobs.Jobs[jobId]
	if type(def) == "table" then
		local icon = type(def.Icon) == "string" and def.Icon or ""
		local name = type(def.Name) == "string" and def.Name or jobId
		return icon ~= "" and (icon .. " " .. name) or name
	end
	return "💼 " .. jobId
end

local function tierFor(tierId: any)
	for _, t in ipairs(Economy.WealthTiers) do
		if t.Id == tierId then
			return t
		end
	end
	return Economy.WealthTiers[1]
end

local function label(props: { [string]: any }): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.TextScaled = true
	l.Font = Enum.Font.GothamBold
	l.TextColor3 = Color3.new(1, 1, 1)
	l.TextStrokeTransparency = 0.45
	l.TextStrokeColor3 = Color3.new(0, 0, 0)
	for k, v in pairs(props) do
		(l :: any)[k] = v
	end
	return l
end

local function chip(name: string, order: number, width: number, color: Color3, parent: Instance): TextLabel
	local c = label({
		Name = name,
		LayoutOrder = order,
		Size = UDim2.fromScale(width, 1),
		BackgroundTransparency = 0.15,
		BackgroundColor3 = color,
		TextStrokeTransparency = 0.7,
		Font = Enum.Font.GothamBlack,
	})
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.5, 0)
	corner.Parent = c
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0.04, 0)
	pad.PaddingRight = UDim.new(0.04, 0)
	pad.PaddingTop = UDim.new(0.08, 0)
	pad.PaddingBottom = UDim.new(0.08, 0)
	pad.Parent = c
	c.Parent = parent
	return c
end

function NameTags.Build(player: Player, head: BasePart): BillboardGui
	local old = head:FindFirstChild(NameTags.GuiName)
	if old then
		old:Destroy()
	end
	local gui = Instance.new("BillboardGui")
	gui.Name = NameTags.GuiName
	gui.Adornee = head
	gui.AlwaysOnTop = false
	gui.MaxDistance = CFG.MaxDistance
	gui.LightInfluence = 0
	gui.Size = UDim2.fromScale(CFG.SizeStuds.X, CFG.SizeStuds.Y)
	gui.StudsOffset = CFG.StudsOffset
	gui:SetAttribute("UserId", player.UserId)

	local list = Instance.new("UIListLayout")
	list.FillDirection = Enum.FillDirection.Vertical
	list.HorizontalAlignment = Enum.HorizontalAlignment.Center
	list.VerticalAlignment = Enum.VerticalAlignment.Bottom
	list.SortOrder = Enum.SortOrder.LayoutOrder
	list.Padding = UDim.new(0.02, 0)
	list.Parent = gui

	local chips = Instance.new("Frame")
	chips.Name = "Chips"
	chips.LayoutOrder = 1
	chips.BackgroundTransparency = 1
	chips.Size = UDim2.fromScale(1, 0.2)
	chips.Parent = gui
	local row = Instance.new("UIListLayout")
	row.FillDirection = Enum.FillDirection.Horizontal
	row.HorizontalAlignment = Enum.HorizontalAlignment.Center
	row.VerticalAlignment = Enum.VerticalAlignment.Center
	row.SortOrder = Enum.SortOrder.LayoutOrder
	row.Padding = UDim.new(0.015, 0)
	row.Parent = chips

	chip("Vip", 1, 0.16, CFG.VipColor, chips).Text = "⭐ VIP"
	chip("Title", 2, 0.36, Economy.WealthTiers[1].Color, chips)
	chip("Job", 3, 0.36, Color3.fromRGB(40, 44, 60), chips)

	label({
		Name = "PlayerName",
		LayoutOrder = 2,
		Size = UDim2.fromScale(1, 0.34),
		TextColor3 = CFG.NameColor,
		Text = player.DisplayName,
		Parent = gui,
	})
	label({
		Name = "Bio",
		LayoutOrder = 3,
		Size = UDim2.fromScale(1, 0.18),
		Font = Enum.Font.GothamMedium,
		TextColor3 = CFG.BioColor,
		Text = "",
		Parent = gui,
	})
	label({
		Name = "Group",
		LayoutOrder = 4,
		Size = UDim2.fromScale(1, 0.17),
		Font = Enum.Font.GothamBold,
		TextColor3 = CFG.GroupColor,
		Text = "",
		Parent = gui,
	})

	NameTags.Update(gui, player)
	gui.Parent = head
	return gui
end

function NameTags.Update(gui: BillboardGui, player: Player)
	if not gui then
		return
	end
	local chips = gui:FindFirstChild("Chips")
	local nameLabel = gui:FindFirstChild("PlayerName") :: TextLabel?
	local bioLabel = gui:FindFirstChild("Bio") :: TextLabel?
	local groupLabel = gui:FindFirstChild("Group") :: TextLabel?
	if not (chips and nameLabel and bioLabel and groupLabel) then
		return
	end

	local rp = player:GetAttribute("RPName")
	nameLabel.Text = (type(rp) == "string" and rp ~= "") and rp or player.DisplayName

	local bio = player:GetAttribute("Bio")
	bioLabel.Text = type(bio) == "string" and bio or ""
	bioLabel.Visible = bioLabel.Text ~= ""

	local group = player:GetAttribute("GroupName")
	groupLabel.Text = (type(group) == "string" and group ~= "") and ("👪 " .. group) or ""
	groupLabel.Visible = groupLabel.Text ~= ""

	local vipChip = chips:FindFirstChild("Vip") :: TextLabel?
	if vipChip then
		vipChip.Visible = player:GetAttribute("VIP") == true
	end

	local titleChip = chips:FindFirstChild("Title") :: TextLabel?
	if titleChip then
		local tier = tierFor(player:GetAttribute("WealthTier"))
		local title = player:GetAttribute("WealthTitle")
		titleChip.Text = (type(title) == "string" and title ~= "") and title or tier.Name
		titleChip.BackgroundColor3 = tier.Color
		titleChip.TextColor3 = (tier.Color.R * 0.299 + tier.Color.G * 0.587 + tier.Color.B * 0.114) > 0.6
				and Color3.fromRGB(25, 25, 30)
			or Color3.new(1, 1, 1)
		titleChip.Visible = true
	end

	local jobChip = chips:FindFirstChild("Job") :: TextLabel?
	if jobChip then
		local jobId = player:GetAttribute("JobId")
		if type(jobId) == "string" and jobId ~= "" then
			jobChip.Text = jobDisplay(jobId)
			jobChip.Visible = true
		else
			jobChip.Visible = false
		end
	end
end

return NameTags
