-- Showcase (VehicleService helper): the two parking perks sold by gamepasses.
--
--   VIP "free premium parking spot"
--     Every VIP online is assigned one reserved bay in the gated VIP Car Park (Downtown; marker parts tagged
--     Config/Vehicles.VipParking.BayTag, attribute Bay). Remote action Vehicle.ParkVip {Uid} delivers that car
--     into the bay for free (no call cooldown). The bay shows a "Reserved · <name>" plate while assigned.
--
--   Premium Car Park "showroom display"
--     Pass owners choose ONE car (saved as Vehicles.<uid>.Showcase = true). While they are online an anchored
--     copy (VehicleService:BuildDisplay, with their paint / rims / kit / plate) stands on a showroom pad at the
--     AutoStrip Meet Lot (parts tagged Config/Vehicles.Showcase.PadTag, attribute Pad) with a name plate.
--     Remote action Vehicle.SetShowcase {Uid?} (no Uid = take it down). If every pad is taken, the player waits
--     and gets the next pad that frees up.
--
--   Showcase.Init(deps)       deps = { Data = DataService, HasPass = fn(player, key) -> bool,
--                                      BuildDisplay = fn(modelId, cframe, look) -> Model,
--                                      SpawnAt = fn(player, uid, cframe) -> (Model?, err?),
--                                      ActiveInfo = fn(player) -> info?, Notify = fn(player, text, kind?, dur?) }
--   Showcase.ParkVip(player, uid) -> result      { ok, err?, Position?, Bay? }
--   Showcase.SetShowcase(player, uid?) -> result { ok, err?, Uid? }
--   Showcase.Refresh(player)                     rebuild / remove the player's display (car sold, retuned, pass granted)
--   Showcase.PlayerRemoving(player)              frees the bay and the pad
--   Showcase.Info(player) -> { Vip, Premium, VipBay?, ShowcaseUid, ShowcaseLive }

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Cars = require(Shared.Config.Cars)
local VehiclesConfig = require(Shared.Config.Vehicles)
local Looks = require(Shared.Vehicle.Looks)

local Showcase = {}

local VCFG = VehiclesConfig.VipParking or { BayTag = "VipParkingBay", Cooldown = 10 }
local SCFG = VehiclesConfig.Showcase or { PadTag = "PremiumShowcasePad", HeightOffset = 0.05, LabelMaxDistance = 140, Cooldown = 5 }

local GOLD = Color3.fromRGB(255, 196, 40)
local BLUE = Color3.fromRGB(110, 180, 255)

local deps: any = nil

local bayOf: { [Player]: BasePart } = {}
local bayOwner: { [BasePart]: Player } = {}
local padOf: { [Player]: BasePart } = {}
local padOwner: { [BasePart]: Player } = {}
local displayOf: { [Player]: Model } = {}
local waiting: { [Player]: boolean } = {}
local readyAt: { [Player]: number } = {} -- VIP-spot deliveries
local showReadyAt: { [Player]: number } = {} -- showcase changes

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function sortedTagged(tag: string, attr: string): { BasePart }
	local list = {}
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		if inst:IsA("BasePart") and inst:IsDescendantOf(Workspace) then
			table.insert(list, inst)
		end
	end
	table.sort(list, function(a, b)
		return (tonumber(a:GetAttribute(attr)) or 0) < (tonumber(b:GetAttribute(attr)) or 0)
	end)
	return list
end

-- top centre of a marker / pad, yaw-only, facing its LookVector
local function topCFrame(part: BasePart, extra: number): CFrame
	local top = (part.CFrame * CFrame.new(0, part.Size.Y / 2 + extra, 0)).Position
	local look = part.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 0.01 then
		flat = Vector3.new(0, 0, -1)
	end
	return CFrame.lookAt(top, top + flat.Unit)
end

local function plate(part: BasePart, text: string?, color: Color3, maxDistance: number, offsetY: number)
	local gui = part:FindFirstChild("ShowcaseLabel")
	if not text then
		if gui then
			gui:Destroy()
		end
		return
	end
	local label: TextLabel
	if gui and gui:IsA("BillboardGui") then
		label = gui:FindFirstChildOfClass("TextLabel") :: TextLabel
	else
		local bb = Instance.new("BillboardGui")
		bb.Name = "ShowcaseLabel"
		bb.Size = UDim2.fromOffset(220, 44)
		bb.StudsOffsetWorldSpace = Vector3.new(0, offsetY, 0)
		bb.MaxDistance = maxDistance
		bb.LightInfluence = 0
		label = Instance.new("TextLabel")
		label.Size = UDim2.fromScale(1, 1)
		label.BackgroundColor3 = Color3.fromRGB(18, 20, 28)
		label.BackgroundTransparency = 0.2
		label.TextScaled = true
		label.Font = Enum.Font.GothamBold
		label.Parent = bb
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0, 10)
		corner.Parent = label
		local pad = Instance.new("UIPadding")
		pad.PaddingLeft = UDim.new(0, 8)
		pad.PaddingRight = UDim.new(0, 8)
		pad.PaddingTop = UDim.new(0, 4)
		pad.PaddingBottom = UDim.new(0, 4)
		pad.Parent = label
		bb.Parent = part
	end
	if label then
		label.Text = text
		label.TextColor3 = color
	end
end

local function vehicles(player: Player)
	local v = deps.Data:Get(player, "Vehicles")
	return type(v) == "table" and v or nil
end

local function entryOf(player: Player, uid: string)
	local v = vehicles(player)
	local e = v and v[uid]
	if type(e) == "table" and type(e.ModelId) == "string" and Cars[e.ModelId] then
		return e
	end
	return nil
end

local function showcaseUid(player: Player): string?
	local v = vehicles(player)
	if not v then
		return nil
	end
	for uid, e in pairs(v) do
		if type(e) == "table" and e.Showcase == true and Cars[e.ModelId] then
			return uid
		end
	end
	return nil
end

---------------------------------------------------------------------------
-- VIP bays
---------------------------------------------------------------------------
local function releaseBay(player: Player)
	local bay = bayOf[player]
	if bay then
		bayOf[player] = nil
		bayOwner[bay] = nil
		if bay.Parent then
			plate(bay, nil, GOLD, 0, 0)
		end
	end
end

local function assignBay(player: Player): BasePart?
	local bay = bayOf[player]
	if bay and bay.Parent then
		return bay
	end
	releaseBay(player)
	for _, b in ipairs(sortedTagged(VCFG.BayTag, "Bay")) do
		local owner = bayOwner[b]
		if owner == nil or owner.Parent == nil then
			bayOwner[b] = player
			bayOf[player] = b
			plate(b, ("👑 Reserved · %s"):format(player.DisplayName), GOLD, 80, 3)
			return b
		end
	end
	return nil
end

function Showcase.ParkVip(player: Player, uid: string)
	if not deps.HasPass(player, "VIP") then
		return { ok = false, err = "👑 Reserved VIP parking needs the VIP pass" }
	end
	if not entryOf(player, uid) then
		return { ok = false, err = "You don't own that car" }
	end
	local now = os.clock()
	if (readyAt[player] or 0) > now then
		return { ok = false, err = ("Wait %ds"):format(math.ceil(readyAt[player] - now)) }
	end
	local active = deps.ActiveInfo(player)
	if active and active.Uid == uid and next(active.Occupants) ~= nil then
		return { ok = false, err = "Someone is in your car" }
	end
	local bay = assignBay(player)
	if not bay then
		return { ok = false, err = "Every VIP bay is taken right now — try again soon" }
	end
	readyAt[player] = now + (VCFG.Cooldown or 10)
	local model, err = deps.SpawnAt(player, uid, topCFrame(bay, -bay.Size.Y))
	if not model then
		readyAt[player] = 0
		return { ok = false, err = err or "Couldn't park your car" }
	end
	return { ok = true, Position = model:GetPivot().Position, Bay = bay:GetAttribute("Bay") }
end

---------------------------------------------------------------------------
-- Premium showroom pads
---------------------------------------------------------------------------
local function removeDisplay(player: Player)
	local m = displayOf[player]
	displayOf[player] = nil
	if m then
		m:Destroy()
	end
end

local refreshWaiting: () -> ()

local function releasePad(player: Player)
	removeDisplay(player)
	local pad = padOf[player]
	if pad then
		padOf[player] = nil
		padOwner[pad] = nil
		if pad.Parent then
			plate(pad, nil, BLUE, 0, 0)
		end
		task.defer(refreshWaiting)
	end
end

local function claimPad(player: Player): BasePart?
	local pad = padOf[player]
	if pad and pad.Parent then
		return pad
	end
	for _, p in ipairs(sortedTagged(SCFG.PadTag, "Pad")) do
		local owner = padOwner[p]
		if owner == nil or owner.Parent == nil then
			padOwner[p] = player
			padOf[player] = p
			return p
		end
	end
	return nil
end

function Showcase.Refresh(player: Player)
	if not deps or player.Parent == nil or not deps.Data:IsLoaded(player) then
		return
	end
	local uid = showcaseUid(player)
	if not uid or not deps.HasPass(player, "PremiumCarPark") then
		waiting[player] = nil
		releasePad(player)
		return
	end
	local entry = entryOf(player, uid)
	local def = entry and Cars[entry.ModelId]
	if not (entry and def) then
		releasePad(player)
		return
	end
	local pad = claimPad(player)
	if not pad then
		waiting[player] = true
		removeDisplay(player)
		return
	end
	waiting[player] = nil
	removeDisplay(player)
	local look = Looks.Resolve(entry, def)
	if type(entry.Plate) == "string" and entry.Plate ~= "" then
		look.Plate = entry.Plate
	end
	local ok, model = pcall(deps.BuildDisplay, entry.ModelId, topCFrame(pad, SCFG.HeightOffset or 0.05), look)
	if not ok or typeof(model) ~= "Instance" then
		warn("[Showcase] display build failed:", model)
		return
	end
	model.Name = "Showcase_" .. player.UserId
	model:SetAttribute("ShowcaseOwner", player.UserId)
	model:SetAttribute("OwnerUserId", player.UserId)
	displayOf[player] = model
	plate(pad, ("⭐ %s's %s"):format(player.DisplayName, def.Name), BLUE, SCFG.LabelMaxDistance or 140, 9)
end

refreshWaiting = function()
	for player in pairs(waiting) do
		if player.Parent == nil then
			waiting[player] = nil
		elseif not padOf[player] then
			Showcase.Refresh(player)
		end
	end
end

function Showcase.SetShowcase(player: Player, uid: string?)
	local now = os.clock()
	if (showReadyAt[player] or 0) > now then
		return { ok = false, err = "Slow down!" }
	end
	if uid ~= nil then
		if not deps.HasPass(player, "PremiumCarPark") then
			return { ok = false, err = "💎 The showroom display needs the Premium Car Park pass" }
		end
		if not entryOf(player, uid) then
			return { ok = false, err = "You don't own that car" }
		end
	end
	showReadyAt[player] = now + (SCFG.Cooldown or 5)
	local v = vehicles(player)
	if v then
		for id, e in pairs(v) do
			if type(e) == "table" and e.Showcase == true and id ~= uid then
				deps.Data:Set(player, "Vehicles." .. id .. ".Showcase", false)
			end
		end
	end
	if uid then
		deps.Data:Set(player, "Vehicles." .. uid .. ".Showcase", true)
	end
	Showcase.Refresh(player)
	if uid and waiting[player] then
		deps.Notify(player, "✨ All showroom pads are taken — your car goes on display as soon as one frees up", "info", 5)
	elseif uid then
		deps.Notify(player, "✨ Your car is now on display at the AutoStrip Meet Lot showroom", "success", 4)
	end
	return { ok = true, Uid = uid or "" }
end

function Showcase.Info(player: Player)
	local bay = bayOf[player]
	return {
		Vip = deps.HasPass(player, "VIP"),
		Premium = deps.HasPass(player, "PremiumCarPark"),
		VipBay = bay and bay:GetAttribute("Bay") or nil,
		ShowcaseUid = showcaseUid(player) or "",
		ShowcaseLive = displayOf[player] ~= nil,
	}
end

function Showcase.PlayerRemoving(player: Player)
	waiting[player] = nil
	readyAt[player] = nil
	showReadyAt[player] = nil
	releaseBay(player)
	releasePad(player)
end

function Showcase.Init(d)
	deps = d
end

return Showcase
