-- SocialService: name tags, roleplay profile (RP name + bio), family/friend groups, parties, RP seats and poses.
--
-- API (server):
--   SocialService:SetRPName(player, name) -> (ok: boolean, nameOrErr: string?)   ("" resets to DisplayName)
--   SocialService:SetBio(player, bio) -> (ok, bioOrErr)
--   SocialService:GetGroupOf(player) -> { Id, Name, Leader, Online = { Player } }?   (used by PhoneService group chat)
--   SocialService:OnBlocked(player, blockedUserId)                                  (called by ModerationService)
--
-- Player attributes set here: RPName, Bio, GroupName, HideVipTag (mirror of Settings.HideVipChatTag).
-- Character attribute: Pose ("" | "SitGround" | "Lay" | "Sleep" | "Salute").
--
-- Remote domain "Social":
--   SetRPName { Name }  SetBio { Bio }
--   CreateGroup { Name }  InviteToGroup { UserId }  AcceptGroupInvite { GroupId }  DeclineGroupInvite { GroupId }
--   LeaveGroup {}  KickFromGroup { UserId }  GetGroup {} -> { Group }
--   StartParty { Name } -> { Party }   EndParty {}   GetParties {} -> { Parties }
--   Sit { Seat }  Sleep { Seat }        (RPSeat-tagged Seat instance; server seats the humanoid)
--   SetPose { Pose }                    ("" clears)
--   SyncSettings {}                     (client noticed a settings change; server re-reads its own data)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Maid = require(Shared.Util.Maid)
local SocialConfig = require(Shared.Config.Social)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local Helpers = script.Parent:WaitForChild("Social")
local NameTags = require(Helpers:WaitForChild("NameTags"))
local Groups = require(Helpers:WaitForChild("Groups"))
local Parties = require(Helpers:WaitForChild("Parties"))
local Seats = require(Helpers:WaitForChild("Seats"))

local SocialService = {
	Name = "SocialService",
	Priority = 60,
}

local PROFILE = SocialConfig.Profile
local GROUPS = SocialConfig.Groups
local PARTIES = SocialConfig.Parties

local DataService
local NotifyService
local ModerationService

local playerMaids: { [Player]: any } = {}
local characterMaids: { [Player]: any } = {}
local tags: { [Player]: BillboardGui } = {}
local lastProfileEdit: { [Player]: number } = {}
local lastGroupAction: { [Player]: number } = {}

local TAG_ATTRIBUTES = { "RPName", "Bio", "WealthTier", "WealthTitle", "VIP", "JobId", "GroupName" }

---------------------------------------------------------------------------
-- Text helpers
---------------------------------------------------------------------------
local function trim(s: string): string
	return (s:gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s%s+", " "))
end

-- Public text (RP names, bios, group / party names) is shown in rich-text toasts, chat prefixes and labels on
-- every client: strip markup characters so nobody can inject <font size="99"> etc. into other players' UI.
local function stripMarkup(s: string): string
	return (s:gsub("[<>]", ""))
end

-- validate + broadcast-filter player text. Returns (text?, err?)
local function cleanPublic(player: Player, v: any, minChars: number, maxChars: number, allowEmpty: boolean): (string?, string?)
	local s = Guard.String(v, maxChars * 4)
	if s == nil then
		return nil, ("Use at most %d characters"):format(maxChars)
	end
	s = trim(stripMarkup(s))
	local len = utf8.len(s) or 0
	if len == 0 then
		if allowEmpty then
			return "", nil
		end
		return nil, "Type something first"
	end
	if len < minChars then
		return nil, ("Use at least %d characters"):format(minChars)
	end
	if len > maxChars then
		return nil, ("Use at most %d characters"):format(maxChars)
	end
	if not ModerationService then
		return nil, "Text filtering is unavailable"
	end
	local filtered = ModerationService:FilterText(s, player, nil)
	if not filtered then
		return nil, "Couldn't check that text. Try again."
	end
	return filtered, nil
end

local function cooldown(map: { [Player]: number }, player: Player, seconds: number): boolean
	local now = os.clock()
	local last = map[player]
	if last and now - last < seconds then
		return false
	end
	map[player] = now
	return true
end

---------------------------------------------------------------------------
-- Name tags
---------------------------------------------------------------------------
local function refreshTag(player: Player)
	local gui = tags[player]
	if gui and gui.Parent then
		NameTags.Update(gui, player)
	end
end

local function onCharacter(player: Player, character: Model)
	if characterMaids[player] then
		characterMaids[player]:Clean()
	end
	local maid = Maid.new()
	characterMaids[player] = maid
	character:SetAttribute("Pose", "")

	task.spawn(function()
		local hum = character:WaitForChild("Humanoid", 10)
		if hum and hum:IsA("Humanoid") then
			hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
		end
		local head = character:WaitForChild("Head", 10)
		if not head or not head:IsA("BasePart") or character.Parent == nil or characterMaids[player] ~= maid then
			return
		end
		local gui = NameTags.Build(player, head)
		tags[player] = gui
		maid:Give(gui)
	end)
	task.spawn(function()
		local seatMaid = Seats.TrackCharacter(character)
		if characterMaids[player] == maid then
			maid:Give(seatMaid)
		else
			seatMaid:Clean()
		end
	end)
end

---------------------------------------------------------------------------
-- Settings mirror
---------------------------------------------------------------------------
local function syncSettings(player: Player)
	local hide = DataService:Get(player, "Settings.HideVipChatTag") == true
	player:SetAttribute("HideVipTag", hide)
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function SocialService:SetRPName(player: Player, name: string): (boolean, string?)
	if not DataService:IsLoaded(player) then
		return false, "Your data is still loading"
	end
	local filtered, err = cleanPublic(player, name, PROFILE.RPNameMin, PROFILE.RPNameMax, true)
	if filtered == nil then
		return false, err
	end
	-- filtered names that end up mostly hashtags look broken on name tags: reject them
	if filtered ~= "" and filtered:gsub("#", "") == "" then
		return false, "That name isn't allowed"
	end
	DataService:Set(player, "Social.RPName", filtered)
	player:SetAttribute("RPName", filtered)
	return true, filtered
end

function SocialService:SetBio(player: Player, bio: string): (boolean, string?)
	if not DataService:IsLoaded(player) then
		return false, "Your data is still loading"
	end
	local filtered, err = cleanPublic(player, bio, 1, PROFILE.BioMax, true)
	if filtered == nil then
		return false, err
	end
	DataService:Set(player, "Social.Bio", filtered)
	player:SetAttribute("Bio", filtered)
	return true, filtered
end

function SocialService:GetGroupOf(player: Player)
	local group = Groups.GetOf(player)
	if not group then
		return nil
	end
	return { Id = group.Id, Name = group.Name, Leader = group.Leader, Online = Groups.Online(group) }
end

function SocialService:OnBlocked(player: Player, blockedUserId: number)
	local group = Groups.GetOf(player)
	if group and group.Members[blockedUserId] and group.Leader == player.UserId then
		Groups.Kick(player, blockedUserId)
	end
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
local function onDataLoaded(player: Player, data)
	local social = data.Social or {}
	player:SetAttribute("RPName", type(social.RPName) == "string" and stripMarkup(social.RPName) or "")
	player:SetAttribute("Bio", type(social.Bio) == "string" and stripMarkup(social.Bio) or "")
	syncSettings(player)
	Groups.Restore(player)

	-- saved text is re-filtered when shown again (filters improve over time)
	task.spawn(function()
		if not ModerationService then
			return
		end
		for _, key in ipairs({ "RPName", "Bio" }) do
			local saved = DataService:Get(player, "Social." .. key)
			if type(saved) == "string" and saved ~= "" then
				local filtered = ModerationService:FilterText(stripMarkup(saved), player, nil)
				if player.Parent ~= Players then
					return
				end
				if filtered == nil then
					player:SetAttribute(key, "") -- never show text we couldn't check
				elseif filtered ~= saved then
					DataService:Set(player, "Social." .. key, filtered)
					player:SetAttribute(key, filtered)
				end
			end
		end
	end)
end

local function onPlayerAdded(player: Player)
	local maid = Maid.new()
	playerMaids[player] = maid
	for _, attr in ipairs(TAG_ATTRIBUTES) do
		maid:Give(player:GetAttributeChangedSignal(attr):Connect(function()
			refreshTag(player)
		end))
	end
	maid:Give(player.CharacterAdded:Connect(function(character)
		onCharacter(player, character)
	end))
	maid:Give(player.CharacterRemoving:Connect(function()
		tags[player] = nil
		if characterMaids[player] then
			characterMaids[player]:Clean()
			characterMaids[player] = nil
		end
	end))
	if player.Character then
		task.spawn(onCharacter, player, player.Character)
	end
end

local function onPlayerRemoving(player: Player)
	Groups.Leave(player, true)
	if playerMaids[player] then
		playerMaids[player]:Clean()
		playerMaids[player] = nil
	end
	if characterMaids[player] then
		characterMaids[player]:Clean()
		characterMaids[player] = nil
	end
	tags[player] = nil
	lastProfileEdit[player] = nil
	lastGroupAction[player] = nil
end

local function groupGuard(player: Player)
	if not DataService:IsLoaded(player) then
		return { ok = false, err = "Your data is still loading" }
	end
	if not cooldown(lastGroupAction, player, GROUPS.ActionCooldown) then
		return { ok = false, err = "Slow down!" }
	end
	return nil
end

function SocialService:Init()
	DataService = Registry.Get("DataService")
	NotifyService = Registry.Get("NotifyService")
	ModerationService = Registry.Find("ModerationService")

	Groups.Setup({
		DataService = DataService,
		NotifyService = NotifyService,
		Moderation = function()
			return ModerationService
		end,
	})
	Parties.Setup({
		NotifyService = NotifyService,
		Phone = function()
			return Registry.Find("PhoneService")
		end,
	})

	Net.HandleActions("Social", {
		SetRPName = function(player: Player, payload)
			if not cooldown(lastProfileEdit, player, PROFILE.ChangeCooldown) then
				return { ok = false, err = "Wait a moment before editing again" }
			end
			local ok, result = self:SetRPName(player, payload.Name)
			if not ok then
				lastProfileEdit[player] = nil
				return { ok = false, err = result }
			end
			return { ok = true, Name = result }
		end,

		SetBio = function(player: Player, payload)
			if not cooldown(lastProfileEdit, player, PROFILE.ChangeCooldown) then
				return { ok = false, err = "Wait a moment before editing again" }
			end
			local ok, result = self:SetBio(player, payload.Bio)
			if not ok then
				lastProfileEdit[player] = nil
				return { ok = false, err = result }
			end
			return { ok = true, Bio = result }
		end,

		CreateGroup = function(player: Player, payload)
			local blocked = groupGuard(player)
			if blocked then
				return blocked
			end
			local name, err = cleanPublic(player, payload.Name, GROUPS.NameMin, GROUPS.NameMax, false)
			if not name then
				return { ok = false, err = err }
			end
			local ok, gerr = Groups.Create(player, name)
			if not ok then
				return { ok = false, err = gerr }
			end
			return { ok = true, Group = Groups.Info(Groups.GetOf(player), player) }
		end,

		InviteToGroup = function(player: Player, payload)
			local blocked = groupGuard(player)
			if blocked then
				return blocked
			end
			local uid = Guard.Int(payload.UserId, 1, 2 ^ 53)
			local target = uid and Players:GetPlayerByUserId(uid)
			if not target then
				return { ok = false, err = "That player isn't in this server" }
			end
			local ok, err = Groups.Invite(player, target)
			return { ok = ok, err = err }
		end,

		AcceptGroupInvite = function(player: Player, payload)
			local blocked = groupGuard(player)
			if blocked then
				return blocked
			end
			local gid = Guard.Id(payload.GroupId, 32)
			if not gid then
				return { ok = false, err = "Invalid invite" }
			end
			local ok, err = Groups.Accept(player, gid)
			if not ok then
				return { ok = false, err = err }
			end
			return { ok = true, Group = Groups.Info(Groups.GetOf(player), player) }
		end,

		DeclineGroupInvite = function(player: Player, payload)
			local gid = Guard.Id(payload.GroupId, 32)
			if gid then
				Groups.Decline(player, gid)
			end
			return { ok = true }
		end,

		LeaveGroup = function(player: Player)
			local blocked = groupGuard(player)
			if blocked then
				return blocked
			end
			if not Groups.GetOf(player) then
				return { ok = false, err = "You're not in a group" }
			end
			Groups.Leave(player, false)
			return { ok = true }
		end,

		KickFromGroup = function(player: Player, payload)
			local blocked = groupGuard(player)
			if blocked then
				return blocked
			end
			local uid = Guard.Int(payload.UserId, 1, 2 ^ 53)
			if not uid then
				return { ok = false, err = "Invalid player" }
			end
			local ok, err = Groups.Kick(player, uid)
			return { ok = ok, err = err }
		end,

		GetGroup = function(player: Player)
			return { ok = true, Group = Groups.Info(Groups.GetOf(player), player) }
		end,

		StartParty = function(player: Player, payload)
			local name, err = cleanPublic(player, payload.Name, PARTIES.NameMin, PARTIES.NameMax, false)
			if not name then
				return { ok = false, err = err }
			end
			local party, perr = Parties.Start(player, name)
			if not party then
				return { ok = false, err = perr }
			end
			return { ok = true, Party = party }
		end,

		EndParty = function(player: Player)
			Parties.EndFor(player)
			return { ok = true }
		end,

		GetParties = function()
			return { ok = true, Parties = Parties.List() }
		end,

		Sit = function(player: Player, payload)
			local ok, err = Seats.Sit(player, payload.Seat, false)
			return { ok = ok, err = err }
		end,

		Sleep = function(player: Player, payload)
			local ok, err = Seats.Sit(player, payload.Seat, true)
			return { ok = ok, err = err }
		end,

		SetPose = function(player: Player, payload)
			local pose = payload.Pose
			if pose ~= "" then
				pose = Guard.Id(pose, 16)
				if not pose then
					return { ok = false, err = "Unknown pose" }
				end
			end
			local ok, err = Seats.SetPose(player, pose)
			return { ok = ok, err = err }
		end,

		SyncSettings = function(player: Player)
			if DataService:IsLoaded(player) then
				syncSettings(player)
			end
			return { ok = true }
		end,
	}, {
		rate = 6,
		burst = 12,
		perAction = {
			StartParty = { rate = 0.2, burst = 1 },
			SetPose = { rate = 3, burst = 6 },
			SyncSettings = { rate = 1, burst = 3 },
			Sit = { rate = 1, burst = 3 },
			Sleep = { rate = 1, burst = 3 },
		},
	})

	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, p in ipairs(Players:GetPlayers()) do
		task.spawn(onPlayerAdded, p)
	end
	Players.PlayerRemoving:Connect(onPlayerRemoving)
end

function SocialService:Start()
	ModerationService = ModerationService or Registry.Find("ModerationService")
	DataService:OnLoaded(onDataLoaded)
	Seats.Setup()
end

return SocialService
