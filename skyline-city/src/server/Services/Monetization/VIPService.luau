-- VIPService: the VIP perks that need their own runtime (everything else reads MonetizationService:HasPass).
--
--   * Daily VIP cash bonus (Shop.ClaimVipDaily -> VIPService:ClaimDaily), stored in Daily.LastVipClaimDay (UTC day)
--   * VIP doors: every VIPDoor-tagged part is solid on the server; VIPController makes it non-colliding LOCALLY
--     for VIP players (their character physics is client-owned, so they walk through; everyone else is blocked)
--   * VIP areas: every AreaCheckInterval seconds non-VIP players found inside a VIPArea volume are moved outside
--     (anti-exploit for noclip / door glitches)
--   * VIP badge (Config.Monetization.VipBadgeId ~= 0) awarded through BadgeService
--   * Mirrors Settings.HideVipChatTag to the player attribute "HideVipTag" (social renders tags/chat)
--
-- API (server):
--   VIPService:IsVip(player) -> boolean
--   VIPService:ClaimDaily(player) -> { ok, Amount?, err? }
--   VIPService:GetDailyStatus(player) -> { IsVip, Claimable, Amount, NextIn }   (NextIn = seconds to next claim)

local BadgeService = game:GetService("BadgeService")
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Monetization)
local World = require(Shared.Config.World)

local Registry = require(ServerScriptService:WaitForChild("Server").Registry)

local MonUtil = require(script.Parent.MonUtil)

local VIPService = {
	Name = "VIPService",
	Priority = 20,
}

local VIP = Config.VIP
local DOOR_LABEL = "SkylineVipSign"

local DataService
local EconomyService
local NotifyService
local Monetization

local claiming: { [Player]: boolean } = {}
local doorWarned: { [Player]: number } = {}
local ejections: { [Player]: { count: number, since: number } } = {}
local lastEject: { [Player]: number } = {}
local EJECT_COOLDOWN = 3 -- seconds; gives the teleport time to replicate before we check that player again
local doorConns: { [Instance]: RBXScriptConnection } = {}

local function today(): number
	return os.time() // 86400
end

function VIPService:IsVip(player: Player): boolean
	return Monetization ~= nil and Monetization:HasPass(player, "VIP") == true
end

---------------------------------------------------------------------------
-- Daily bonus
---------------------------------------------------------------------------
function VIPService:GetDailyStatus(player: Player)
	local isVip = self:IsVip(player)
	local last = DataService:Get(player, "Daily.LastVipClaimDay") or 0
	local claimable = isVip and DataService:IsLoaded(player) and last < today()
	local nextIn = 0
	if not claimable then
		nextIn = (today() + 1) * 86400 - os.time()
	end
	return { IsVip = isVip, Claimable = claimable, Amount = VIP.DailyCash, NextIn = nextIn }
end

function VIPService:ClaimDaily(player: Player)
	if not self:IsVip(player) then
		return { ok = false, err = "The daily cash bonus is a VIP perk." }
	end
	if not DataService:IsLoaded(player) then
		return { ok = false, err = "Your data is still loading." }
	end
	if claiming[player] then
		return { ok = false, err = "Slow down!" }
	end
	claiming[player] = true
	local day = today()
	local last = DataService:Get(player, "Daily.LastVipClaimDay") or 0
	if last >= day then
		claiming[player] = nil
		return { ok = false, err = "Already claimed today — come back in " .. Format.Duration((day + 1) * 86400 - os.time()) .. "." }
	end
	-- mark first so a failure can never be farmed by repeating the request
	DataService:Set(player, "Daily.LastVipClaimDay", day)
	local paid = EconomyService:AddCash(player, VIP.DailyCash, "Robux:VIPDaily")
	claiming[player] = nil
	if not paid then
		DataService:Set(player, "Daily.LastVipClaimDay", last)
		return { ok = false, err = "Couldn't pay your bonus (wallet full?)." }
	end
	NotifyService:Send(player, ("👑 VIP daily bonus: %s"):format(Format.Money(VIP.DailyCash)), "money", 5)
	return { ok = true, Amount = VIP.DailyCash, Status = self:GetDailyStatus(player) }
end

---------------------------------------------------------------------------
-- Badge
---------------------------------------------------------------------------
local function awardBadge(player: Player)
	local badgeId = Config.VipBadgeId
	if not badgeId or badgeId == 0 then
		return
	end
	task.spawn(function()
		local okHas, has = pcall(function()
			return BadgeService:UserHasBadgeAsync(player.UserId, badgeId)
		end)
		if okHas and has then
			return
		end
		local ok, err = pcall(function()
			return BadgeService:AwardBadge(player.UserId, badgeId)
		end)
		if not ok then
			warn("[VIPService] AwardBadge failed:", err)
		end
	end)
end

---------------------------------------------------------------------------
-- VIP doors
---------------------------------------------------------------------------
local function addDoorSign(part: BasePart)
	if part:FindFirstChild(DOOR_LABEL) then
		return
	end
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		local gui = Instance.new("SurfaceGui")
		gui.Name = DOOR_LABEL
		gui.Face = face
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 40
		gui.LightInfluence = 0
		gui.Brightness = 1.5
		local label = Instance.new("TextLabel")
		label.BackgroundTransparency = 1
		label.AnchorPoint = Vector2.new(0.5, 0.5)
		label.Position = UDim2.fromScale(0.5, 0.3)
		label.Size = UDim2.fromScale(0.9, 0.22)
		label.Font = Enum.Font.GothamBlack
		label.TextScaled = true
		label.Text = "👑 VIP ONLY"
		label.TextColor3 = Color3.fromRGB(255, 210, 80)
		label.TextStrokeTransparency = 0.4
		label.Parent = gui
		gui.Parent = part
	end
end

local function setupDoor(inst: Instance)
	if not inst:IsA("BasePart") or doorConns[inst] then
		return
	end
	local part = inst :: BasePart
	part.CanCollide = true
	addDoorSign(part)
	doorConns[inst] = part.Touched:Connect(function(hit: BasePart)
		local char = hit.Parent
		local player = char and Players:GetPlayerFromCharacter(char)
		if not player or VIPService:IsVip(player) then
			return
		end
		local now = os.clock()
		if doorWarned[player] and now - doorWarned[player] < 6 then
			return
		end
		doorWarned[player] = now
		NotifyService:Send(player, "👑 VIP members only. Open the 🛍️ Shop to join VIP.", "warning", 4)
	end)
end

local function teardownDoor(inst: Instance)
	local c = doorConns[inst]
	if c then
		c:Disconnect()
		doorConns[inst] = nil
	end
end

---------------------------------------------------------------------------
-- VIP areas (anti-exploit sweep)
---------------------------------------------------------------------------
local function insideVolume(part: BasePart, pos: Vector3): (boolean, Vector3)
	local localPos = part.CFrame:PointToObjectSpace(pos)
	local half = part.Size / 2
	local inside = math.abs(localPos.X) <= half.X and math.abs(localPos.Y) <= half.Y and math.abs(localPos.Z) <= half.Z
	return inside, localPos
end

local function ejectCFrame(part: BasePart, localPos: Vector3): CFrame
	-- a designer-placed exit (WorldBuilder sets ExitCFrame on VIPArea volumes) always wins
	local exit = part:GetAttribute("ExitCFrame")
	if typeof(exit) == "CFrame" then
		return exit
	end
	local half = part.Size / 2
	local margin = VIP.AreaEjectMargin
	-- leave through the nearest vertical side wall (X or Z)
	local penX = half.X - math.abs(localPos.X)
	local penZ = half.Z - math.abs(localPos.Z)
	local out: Vector3
	local dir: Vector3
	if penX <= penZ then
		local s = localPos.X >= 0 and 1 or -1
		out = Vector3.new(s * (half.X + margin), localPos.Y, localPos.Z)
		dir = Vector3.new(s, 0, 0)
	else
		local s = localPos.Z >= 0 and 1 or -1
		out = Vector3.new(localPos.X, localPos.Y, s * (half.Z + margin))
		dir = Vector3.new(0, 0, s)
	end
	-- stand on the volume's floor level (volumes normally start at ground level)
	out = Vector3.new(out.X, math.max(-half.Y + 3, math.min(out.Y, half.Y - 1)), out.Z)
	local worldPos = part.CFrame:PointToWorldSpace(out)
	local worldDir = part.CFrame:VectorToWorldSpace(dir)
	return CFrame.lookAt(worldPos, worldPos + Vector3.new(worldDir.X, 0, worldDir.Z))
end

local function noteEjection(player: Player, areaName: string)
	local now = os.clock()
	local e = ejections[player]
	if not e or now - e.since > 60 then
		e = { count = 0, since = now }
		ejections[player] = e
	end
	e.count += 1
	if e.count == 4 then
		local anti = Registry.Find("AntiExploitService")
		if anti and type(anti.Flag) == "function" then
			pcall(anti.Flag, anti, player, "VIPArea", areaName)
		end
	end
end

local function sweep()
	local areas = {}
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.VIPArea)) do
		if inst:IsA("BasePart") and inst:IsDescendantOf(Workspace) then
			table.insert(areas, inst)
		end
	end
	for _, player in ipairs(Players:GetPlayers()) do
		-- settings mirror (cheap; SocialService does the same, the value is identical)
		if DataService:IsLoaded(player) then
			local hide = DataService:Get(player, "Settings.HideVipChatTag") == true
			if player:GetAttribute("HideVipTag") ~= hide then
				player:SetAttribute("HideVipTag", hide)
			end
		end
		local recently = lastEject[player] ~= nil and os.clock() - lastEject[player] < EJECT_COOLDOWN
		if #areas > 0 and not recently and not VIPService:IsVip(player) then
			local root = MonUtil.Root(player)
			if root then
				for _, area in ipairs(areas) do
					local inside, localPos = insideVolume(area, root.Position)
					if inside then
						lastEject[player] = os.clock()
						MonUtil.Teleport(player, ejectCFrame(area, localPos))
						NotifyService:Send(player, VIP.AreaWarnText, "warning", 4)
						noteEjection(player, area:GetFullName())
						break
					end
				end
			end
		end
	end
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function VIPService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	Monetization = Registry.Get("MonetizationService")

	Players.PlayerRemoving:Connect(function(player)
		claiming[player] = nil
		doorWarned[player] = nil
		ejections[player] = nil
		lastEject[player] = nil
	end)
end

function VIPService:Start()
	Monetization.PassGranted:Connect(function(player: Player, key: string)
		if key ~= "VIP" then
			return
		end
		awardBadge(player)
		task.delay(2, function()
			if player.Parent == Players then
				local status = VIPService:GetDailyStatus(player)
				if status.Claimable then
					NotifyService:Send(player, "👑 Your VIP daily bonus is ready — claim it in the 🛍️ Shop!", "info", 6)
				end
			end
		end)
	end)

	local doorTag = World.Tags.VIPDoor
	CollectionService:GetInstanceAddedSignal(doorTag):Connect(setupDoor)
	CollectionService:GetInstanceRemovedSignal(doorTag):Connect(teardownDoor)
	for _, inst in ipairs(CollectionService:GetTagged(doorTag)) do
		setupDoor(inst)
	end

	task.spawn(function()
		while true do
			task.wait(VIP.AreaCheckInterval)
			local ok, err = pcall(sweep)
			if not ok then
				warn("[VIPService] sweep error:", err)
			end
		end
	end)
end

return VIPService
