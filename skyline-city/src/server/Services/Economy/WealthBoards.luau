-- WealthBoards (helper for WealthService): renders the global net-worth top list on every part tagged
-- "Leaderboard" as a server-built SurfaceGui (replicates to clients, works with StreamingEnabled).
--
--   WealthBoards.Start(tag, rows)        attach to existing + future tagged parts
--   WealthBoards.Render(list, updatedAt) list = { { Rank, Name, NetWorth, TierColor? } }
--
-- Part attributes (optional): Face = "Front"|"Back"|"Left"|"Right"|"Top"|"Bottom" (default Front),
--                             BoardTitle = string (default "SKYLINE RICH LIST").

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Format = require(ReplicatedStorage:WaitForChild("Shared").Util.Format)

local WealthBoards = {}

local GUI_NAME = "SkylineWealthBoard"
local BG = Color3.fromRGB(16, 18, 26)
local ROW_A = Color3.fromRGB(28, 31, 44)
local ROW_B = Color3.fromRGB(34, 38, 54)
local TEXT = Color3.fromRGB(240, 242, 248)
local DIM = Color3.fromRGB(160, 166, 186)
local GOLD = Color3.fromRGB(255, 200, 60)
local SILVER = Color3.fromRGB(200, 205, 215)
local BRONZE = Color3.fromRGB(215, 140, 80)
local MONEY = Color3.fromRGB(88, 214, 120)

local boards: { [Instance]: { gui: SurfaceGui, rows: { any }, footer: TextLabel } } = {}
local rowCount = 10
local lastList: { any } = {}
local lastUpdated = 0

local function new(className: string, props: { [string]: any }): any
	local inst = Instance.new(className)
	local parent = props.Parent
	props.Parent = nil
	for k, v in pairs(props) do
		(inst :: any)[k] = v
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

local function label(parent: Instance, text: string, props: { [string]: any }): TextLabel
	local l = new("TextLabel", {
		BackgroundTransparency = 1,
		Text = text,
		TextColor3 = TEXT,
		Font = Enum.Font.GothamBold,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = parent,
	})
	for k, v in pairs(props) do
		(l :: any)[k] = v
	end
	new("UITextSizeConstraint", { MaxTextSize = 64, MinTextSize = 8, Parent = l })
	return l
end

local function boardPart(inst: Instance): BasePart?
	if inst:IsA("BasePart") then
		return inst
	end
	if inst:IsA("Model") then
		return inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	return nil
end

local function faceFor(part: BasePart): Enum.NormalId
	local attr = part:GetAttribute("Face")
	if type(attr) == "string" then
		local ok, face = pcall(function()
			return (Enum.NormalId :: any)[attr]
		end)
		if ok and face then
			return face
		end
	end
	return Enum.NormalId.Front
end

local function paintRow(row, entry)
	if entry then
		local rankColor = entry.Rank == 1 and GOLD or entry.Rank == 2 and SILVER or entry.Rank == 3 and BRONZE or DIM
		row.rank.Text = "#" .. tostring(entry.Rank)
		row.rank.TextColor3 = rankColor
		row.name.Text = tostring(entry.Name or "?")
		row.worth.Text = Format.MoneyShort(entry.NetWorth or 0)
		row.frame.Visible = true
	else
		row.rank.Text = ""
		row.name.Text = ""
		row.worth.Text = ""
		row.frame.Visible = true
	end
end

local function build(inst: Instance)
	local part = boardPart(inst)
	if not part or boards[inst] then
		return
	end
	local old = part:FindFirstChild(GUI_NAME)
	if old then
		old:Destroy()
	end
	local gui = new("SurfaceGui", {
		Name = GUI_NAME,
		Face = faceFor(part),
		SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud,
		PixelsPerStud = 40,
		LightInfluence = 0,
		Brightness = 1.4,
		MaxDistance = 220,
		ResetOnSpawn = false,
		ClipsDescendants = true,
		Parent = part,
	})
	local root = new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = BG,
		BorderSizePixel = 0,
		Parent = gui,
	})
	new("UIPadding", {
		PaddingTop = UDim.new(0.03, 0),
		PaddingBottom = UDim.new(0.03, 0),
		PaddingLeft = UDim.new(0.04, 0),
		PaddingRight = UDim.new(0.04, 0),
		Parent = root,
	})
	local title = part:GetAttribute("BoardTitle")
	label(root, "🏆  " .. (type(title) == "string" and title or "SKYLINE RICH LIST"), {
		Size = UDim2.fromScale(1, 0.12),
		TextColor3 = GOLD,
		TextXAlignment = Enum.TextXAlignment.Center,
	})
	local list = new("Frame", {
		Position = UDim2.fromScale(0, 0.14),
		Size = UDim2.fromScale(1, 0.78),
		BackgroundTransparency = 1,
		Parent = root,
	})
	new("UIListLayout", {
		Padding = UDim.new(0.006, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = list,
	})
	local rows = {}
	local h = 1 / rowCount - 0.007
	for i = 1, rowCount do
		local frame = new("Frame", {
			LayoutOrder = i,
			Size = UDim2.fromScale(1, h),
			BackgroundColor3 = (i % 2 == 0) and ROW_B or ROW_A,
			BorderSizePixel = 0,
			Parent = list,
		})
		new("UICorner", { CornerRadius = UDim.new(0.2, 0), Parent = frame })
		local rank = label(frame, "", { Position = UDim2.fromScale(0.02, 0.12), Size = UDim2.fromScale(0.13, 0.76) })
		local name = label(frame, "", {
			Position = UDim2.fromScale(0.16, 0.12),
			Size = UDim2.fromScale(0.5, 0.76),
			Font = Enum.Font.GothamMedium,
		})
		local worth = label(frame, "", {
			Position = UDim2.fromScale(0.66, 0.12),
			Size = UDim2.fromScale(0.32, 0.76),
			TextColor3 = MONEY,
			TextXAlignment = Enum.TextXAlignment.Right,
		})
		rows[i] = { frame = frame, rank = rank, name = name, worth = worth }
	end
	local footer = label(root, "Loading…", {
		Position = UDim2.fromScale(0, 0.94),
		Size = UDim2.fromScale(1, 0.05),
		TextColor3 = DIM,
		Font = Enum.Font.GothamMedium,
		TextXAlignment = Enum.TextXAlignment.Center,
	})
	boards[inst] = { gui = gui, rows = rows, footer = footer }
	-- paint whatever we already have
	for i, row in ipairs(rows) do
		paintRow(row, lastList[i])
	end
	if lastUpdated > 0 then
		footer.Text = "Global top net worth · updates every minute"
	end
end

function WealthBoards.Start(tag: string, rows: number?)
	rowCount = math.clamp(rows or 10, 3, 20)
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		task.spawn(build, inst)
	end
	CollectionService:GetInstanceAddedSignal(tag):Connect(function(inst)
		task.defer(build, inst)
	end)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(function(inst)
		local b = boards[inst]
		if b then
			boards[inst] = nil
			if b.gui.Parent then
				b.gui:Destroy()
			end
		end
	end)
end

function WealthBoards.Render(list: { any }, updatedAt: number)
	lastList = list
	lastUpdated = updatedAt
	for inst, b in pairs(boards) do
		if not inst.Parent or not b.gui.Parent then
			boards[inst] = nil
		else
			for i, row in ipairs(b.rows) do
				paintRow(row, list[i])
			end
			b.footer.Text = #list > 0 and "Global top net worth · updates every minute" or "No entries yet — go make some money!"
		end
	end
end

return WealthBoards
