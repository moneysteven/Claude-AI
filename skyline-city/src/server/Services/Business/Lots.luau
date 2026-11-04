-- Lots (server helper): business lots — discovery, procedural fallback lots, signs and allocation.
--
--   Lots.Start(onLotAdded)            discover BusinessLot-tagged parts (and later ones); creates fallback lots if the
--                                     world has none after Config.Lots.WaitForWorld seconds. Yields until lots exist.
--   Lots.Ready() -> boolean
--   Lots.Find(lotId) -> lot?
--   Lots.Allows(lot, typeId) -> boolean   type allowed + lot big enough
--   Lots.FindFree(typeId, preferredId?) -> lot?
--   Lots.Root(lot) -> Folder         Workspace.SkylineBusinesses.<LotId>  (holds Build folder + sign)
--   Lots.UpdateSign(lot)             redraws the SurfaceGui sign (for sale / business name + owner + open/closed)
--   Lots.SetPromptHandler(fn)        fn(player, lot) when someone triggers the lot sign prompt
--   Lots.List() -> { lot }
--
-- Lot attributes written for clients (on the lot part): Occupied, OwnerUserId, OwnerName, BizId, BizName, BizType,
--   Open, CustomersPerMinute, DoorOffset (Vector3, lot space), EntranceOffset (Vector3, lot space), LotPrice.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Format = require(Shared.Util.Format)

local BizState = require(script.Parent.BizState)
local Shell = require(script.Parent.Shell)

local Config = BizState.Config
local TAG = World.Tags.BusinessLot

local Lots = {}

local rootFolder: Folder? = nil
local ready = false
local promptHandler: ((Player, any) -> ())? = nil
local onAdded: ((any) -> ())? = nil

local function getRoot(): Folder
	if rootFolder and rootFolder.Parent then
		return rootFolder
	end
	local f = Workspace:FindFirstChild("SkylineBusinesses")
	if not f then
		f = Instance.new("Folder")
		f.Name = "SkylineBusinesses"
		f.Parent = Workspace
	end
	rootFolder = f :: Folder
	return rootFolder :: Folder
end

local function parseAllowed(text: any): ({ [string]: boolean }?, string)
	if type(text) ~= "string" or text == "" or text == "*" then
		return nil, "*"
	end
	local set = {}
	for id in text:gmatch("[^,%s]+") do
		if Config.Types[id] then
			set[id] = true
		end
	end
	if next(set) == nil then
		return nil, "*"
	end
	return set, text
end

local function lotOrigin(part: BasePart): CFrame
	-- top centre of the part, yaw only
	local cf = part.CFrame
	local _, yaw = cf:ToOrientation()
	local top = cf * Vector3.new(0, part.Size.Y / 2, 0)
	return CFrame.new(top) * CFrame.Angles(0, yaw, 0)
end

local function minLotPrice(lot): number
	local best = math.huge
	for id, t in pairs(Config.Types) do
		if Lots.Allows(lot, id) then
			best = math.min(best, t.LotPrice)
		end
	end
	return best == math.huge and 0 or best
end

---------------------------------------------------------------------------
-- Sign
---------------------------------------------------------------------------
local function makePart(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CastShadow = false
	p.Parent = parent
	return p
end

local function label(parent: Instance, name: string, pos: UDim2, size: UDim2, textSize: number, font: Enum.Font, color: Color3): TextLabel
	local l = Instance.new("TextLabel")
	l.Name = name
	l.BackgroundTransparency = 1
	l.Position = pos
	l.Size = size
	l.Font = font
	l.TextScaled = true
	l.TextColor3 = color
	l.Text = ""
	l.RichText = true
	local c = Instance.new("UITextSizeConstraint")
	c.MaxTextSize = textSize
	c.Parent = l
	l.Parent = parent
	return l
end

local function buildSign(lot)
	local root = Lots.Root(lot)
	local old = root:FindFirstChild("Sign")
	if old then
		old:Destroy()
	end
	local model = Instance.new("Model")
	model.Name = "Sign"
	local s = Config.Lots.EntranceSide >= 0 and 1 or -1
	local base = lot.Origin * CFrame.new(-lot.Size.X / 2 + 7, 0, s * (lot.Size.Z / 2 - 1.5))
	-- board faces the street: a part's Front face is -Z, so turn it toward +s*Z
	local facing = s == 1 and CFrame.Angles(0, math.pi, 0) or CFrame.new()
	local post = Color3.fromRGB(60, 62, 70)
	makePart(model, "PostL", Vector3.new(0.6, 9, 0.6), base * CFrame.new(-5, 4.5, 0), post, Enum.Material.Metal)
	makePart(model, "PostR", Vector3.new(0.6, 9, 0.6), base * CFrame.new(5, 4.5, 0), post, Enum.Material.Metal)
	local board = makePart(model, "Board", Vector3.new(12, 4.6, 0.5), base * CFrame.new(0, 7.6, 0) * facing, Color3.fromRGB(28, 30, 40), Enum.Material.SmoothPlastic)
	local trim = makePart(model, "Trim", Vector3.new(12.2, 0.25, 0.6), base * CFrame.new(0, 5.2, 0) * facing, Color3.fromRGB(64, 156, 255), Enum.Material.Neon)
	trim.CanCollide = false

	local gui = Instance.new("SurfaceGui")
	gui.Name = "SignGui"
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.LightInfluence = 0
	gui.Brightness = 1.6
	gui.MaxDistance = 220
	gui.Parent = board
	local title = label(gui, "Title", UDim2.fromScale(0.04, 0.06), UDim2.fromScale(0.92, 0.4), 80, Enum.Font.GothamBlack, Color3.new(1, 1, 1))
	local sub = label(gui, "Sub", UDim2.fromScale(0.04, 0.48), UDim2.fromScale(0.92, 0.22), 44, Enum.Font.GothamMedium, Color3.fromRGB(190, 196, 214))
	local status = label(gui, "Status", UDim2.fromScale(0.04, 0.73), UDim2.fromScale(0.92, 0.22), 50, Enum.Font.GothamBold, Color3.fromRGB(88, 214, 120))
	local back = gui:Clone()
	back.Name = "SignGuiBack"
	back.Face = Enum.NormalId.Back
	back.Parent = board

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "LotPrompt"
	prompt.ActionText = "View lot"
	prompt.ObjectText = "Business Lot"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = Config.General.PromptDistance + 4
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = board
	prompt.Triggered:Connect(function(player)
		if promptHandler then
			promptHandler(player, lot)
		end
	end)

	model.PrimaryPart = board
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	model.Parent = root
	lot.Sign = board
	lot.SignGui = { Title = title, Sub = sub, Status = status, Back = back }
	lot.Prompt = prompt
end

function Lots.UpdateSign(lot)
	if not lot.Sign or not lot.Sign.Parent then
		buildSign(lot)
	end
	local g = lot.SignGui
	local biz = lot.Biz
	if biz then
		local rec = BizState.RecOf(biz)
		local t = Config.Types[biz.TypeId]
		local isOpen = rec and rec.Open == true
		g.Title.Text = BizState.DisplayName(rec, biz.Owner)
		g.Sub.Text = ("%s %s · by %s"):format(t and t.Icon or "🏪", t and t.Name or "Business", biz.Owner.DisplayName)
		g.Status.Text = isOpen and "● OPEN" or "● CLOSED"
		g.Status.TextColor3 = isOpen and Color3.fromRGB(88, 214, 120) or Color3.fromRGB(255, 82, 92)
		lot.Prompt.ActionText = "Business info"
		lot.Prompt.ObjectText = g.Title.Text
	else
		g.Title.Text = "🏪 BUSINESS LOT"
		local icons = {}
		for _, id in ipairs(Config.TypeOrder) do
			if Lots.Allows(lot, id) then
				table.insert(icons, Config.Types[id].Icon)
			end
		end
		g.Sub.Text = table.concat(icons, " ")
		g.Status.Text = "FOR SALE · from " .. Format.MoneyShort(minLotPrice(lot))
		g.Status.TextColor3 = Color3.fromRGB(255, 196, 40)
		lot.Prompt.ActionText = "View lot"
		lot.Prompt.ObjectText = "Business Lot " .. lot.Id
	end
	-- mirror to the back face
	local back = g.Back
	if back then
		for _, name in ipairs({ "Title", "Sub", "Status" }) do
			local l = back:FindFirstChild(name)
			if l and l:IsA("TextLabel") then
				l.Text = g[name].Text
				l.TextColor3 = g[name].TextColor3
			end
		end
	end
end

---------------------------------------------------------------------------
-- Lot registry
---------------------------------------------------------------------------
local function addLot(part: Instance, fallback: boolean?)
	if not part:IsA("BasePart") then
		return
	end
	local id = part:GetAttribute("LotId")
	if type(id) ~= "string" or id == "" or id:find("[^%w_%-]") then
		warn("[Business] BusinessLot without a valid LotId attribute:", part:GetFullName())
		return
	end
	if BizState.Lots[id] then
		return
	end
	local sizeAttr = part:GetAttribute("Size")
	local size: Vector3
	if typeof(sizeAttr) == "Vector3" then
		size = Vector3.new(math.max(16, sizeAttr.X), 12, math.max(16, sizeAttr.Z))
	else
		size = Vector3.new(math.max(16, part.Size.X), 12, math.max(16, part.Size.Z))
	end
	local allowed, allowedText = parseAllowed(part:GetAttribute("AllowedTypes"))
	local lot = {
		Id = id,
		Part = part,
		Origin = lotOrigin(part),
		Size = size,
		Allowed = allowed,
		AllowedText = allowedText,
		Biz = nil,
		Fallback = fallback == true,
	}
	BizState.Lots[id] = lot
	part:SetAttribute("Occupied", false)
	part:SetAttribute("Open", false)
	part:SetAttribute("CustomersPerMinute", 0)
	part:SetAttribute("DoorOffset", Shell.DoorOffset(size))
	part:SetAttribute("EntranceOffset", Shell.EntranceOffset(size))
	part:SetAttribute("LotPrice", minLotPrice(lot))
	buildSign(lot)
	Lots.UpdateSign(lot)
	if onAdded then
		task.spawn(onAdded, lot)
	end
end

local function areaFree(center: Vector3, size: Vector3): boolean
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	local exclude = {}
	local base = Workspace:FindFirstChild("Baseplate")
	if base then
		table.insert(exclude, base)
	end
	local terrain = Workspace:FindFirstChildOfClass("Terrain")
	if terrain then
		table.insert(exclude, terrain)
	end
	params.FilterDescendantsInstances = exclude
	local parts = Workspace:GetPartBoundsInBox(CFrame.new(center + Vector3.new(0, 12, 0)), Vector3.new(size.X + 8, 22, size.Z + 8), params)
	return #parts == 0
end

local function createFallbackLots()
	local L = Config.Lots
	local folder = Instance.new("Folder")
	folder.Name = "FallbackLots"
	folder.Parent = getRoot()
	local made = 0
	local columns = 4
	for k = 0, L.FallbackCount * 12 - 1 do
		if made >= L.FallbackCount then
			break
		end
		local col, row = k % columns, k // columns
		local center = L.FallbackOrigin + Vector3.new(col * L.FallbackSpacing, 0, -row * L.FallbackSpacing)
		if areaFree(center, L.FallbackSize) then
			made += 1
			local p = Instance.new("Part")
			p.Name = "BusinessLot_fb" .. made
			p.Anchored = true
			p.Size = Vector3.new(L.FallbackSize.X, 0.4, L.FallbackSize.Z)
			p.CFrame = CFrame.new(center.X, 0.2, center.Z)
			p.Color = L.FallbackColor
			p.Material = Enum.Material.Concrete
			p.TopSurface = Enum.SurfaceType.Smooth
			p.BottomSurface = Enum.SurfaceType.Smooth
			p:SetAttribute("LotId", "fb" .. made)
			p:SetAttribute("Size", L.FallbackSize)
			p:SetAttribute("AllowedTypes", "*")
			-- kerb lines
			local s = L.EntranceSide >= 0 and 1 or -1
			local kerb = Instance.new("Part")
			kerb.Name = "Kerb"
			kerb.Anchored = true
			kerb.CanCollide = false
			kerb.Size = Vector3.new(L.FallbackSize.X, 0.1, 1)
			kerb.CFrame = CFrame.new(center.X, 0.45, center.Z + s * (L.FallbackSize.Z / 2 - 0.5))
			kerb.Color = Color3.fromRGB(255, 196, 40)
			kerb.Material = Enum.Material.SmoothPlastic
			kerb.Parent = p
			p.Parent = folder
			CollectionService:AddTag(p, TAG)
		end
	end
	if made == 0 then
		warn("[Business] could not find empty space for fallback business lots")
	end
end

function Lots.Root(lot): Folder
	local root = getRoot()
	local f = root:FindFirstChild(lot.Id)
	if not f then
		f = Instance.new("Folder")
		f.Name = lot.Id
		f.Parent = root
	end
	return f :: Folder
end

function Lots.SetPromptHandler(fn)
	promptHandler = fn
end

function Lots.Ready(): boolean
	return ready
end

function Lots.Find(lotId: any)
	if type(lotId) ~= "string" then
		return nil
	end
	return BizState.Lots[lotId]
end

function Lots.List()
	local out = {}
	for _, lot in pairs(BizState.Lots) do
		table.insert(out, lot)
	end
	table.sort(out, function(a, b)
		return a.Id < b.Id
	end)
	return out
end

function Lots.Allows(lot, typeId: string): boolean
	local t = Config.Types[typeId]
	if not t then
		return false
	end
	if lot.Allowed and not lot.Allowed[typeId] then
		return false
	end
	local min = t.MinLotSize
	if min and (lot.Size.X < min.X or lot.Size.Z < min.Y) then
		return false
	end
	return true
end

function Lots.FindFree(typeId: string, preferredId: string?)
	local pref = preferredId and BizState.Lots[preferredId]
	if pref and not pref.Biz and not pref.Reserved and Lots.Allows(pref, typeId) then
		return pref
	end
	-- prefer the biggest compatible lot
	local best = nil
	for _, lot in ipairs(Lots.List()) do
		if not lot.Biz and not lot.Reserved and Lots.Allows(lot, typeId) then
			if not best or lot.Size.X * lot.Size.Z > best.Size.X * best.Size.Z then
				best = lot
			end
		end
	end
	return best
end

function Lots.Start(lotAdded: (any) -> ())
	onAdded = lotAdded
	getRoot()
	for _, part in ipairs(CollectionService:GetTagged(TAG)) do
		addLot(part)
	end
	CollectionService:GetInstanceAddedSignal(TAG):Connect(function(part)
		addLot(part)
	end)
	local waited = 0
	while next(BizState.Lots) == nil and waited < Config.Lots.WaitForWorld do
		task.wait(0.5)
		waited += 0.5
	end
	if next(BizState.Lots) == nil then
		createFallbackLots()
	end
	ready = true
end

return Lots
