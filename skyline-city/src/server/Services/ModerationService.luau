-- ModerationService: text filtering, blocking, reports and the admin "/kick" chat command.
--
-- API (server):
--   ModerationService:FilterText(text, fromPlayer, toPlayer?) -> string?
--       TextService:FilterStringAsync. With `toPlayer` -> GetChatForUserAsync(to) (private chat),
--       without -> GetNonChatStringForBroadcastAsync (name tags, feed posts). nil on failure: NEVER show unfiltered text.
--   ModerationService:IsBlocked(a, b) -> boolean      -- true if either player blocked the other (a/b: Player or userId)
--   ModerationService:IsAdmin(player) -> boolean
--
-- Remote domain "Moderation":
--   Report  { UserId, Category, Text }  -> {}       (1 per Config.Social.Moderation.ReportCooldown s per reporter)
--   Block   { UserId }                  -> {}       (saved in Social.Blocked)
--   Unblock { UserId }                  -> {}
--   Mute is client-local (ModerationController) and has no server action.
--
-- Chat: blocked players never receive each other's chat messages (TextChannel.ShouldDeliverCallback).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local TextService = game:GetService("TextService")
local TextChatService = game:GetService("TextChatService")
local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local SocialConfig = require(Shared.Config.Social)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)
local ProfileStore = require(Server.Lib.ProfileStore)

local ModerationService = {
	Name = "ModerationService",
	Priority = 30,
}

local CFG = SocialConfig.Moderation

local DataService
local NotifyService

local lastReport: { [number]: number } = {} -- reporter userId -> os.clock()
local adminSet: { [number]: boolean } = {}
local categorySet: { [string]: boolean } = {}
for _, c in ipairs(CFG.ReportCategories) do
	categorySet[c] = true
end

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function userIdOf(v: any): number?
	if typeof(v) == "Instance" and v:IsA("Player") then
		return v.UserId
	elseif type(v) == "number" then
		return v
	end
	return nil
end

local function playerOf(v: any): Player?
	if typeof(v) == "Instance" and v:IsA("Player") then
		return v
	elseif type(v) == "number" then
		return Players:GetPlayerByUserId(v)
	end
	return nil
end

local function hasBlocked(owner: Player?, otherId: number?): boolean
	if not owner or not otherId then
		return false
	end
	local blocked = DataService and DataService:Get(owner, "Social.Blocked")
	return type(blocked) == "table" and blocked[tostring(otherId)] == true
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function ModerationService:FilterText(text: string, fromPlayer: Player, toPlayer: Player?): string?
	if type(text) ~= "string" or typeof(fromPlayer) ~= "Instance" then
		return nil
	end
	if text == "" then
		return ""
	end
	local context = toPlayer and Enum.TextFilterContext.PrivateChat or Enum.TextFilterContext.PublicChat
	local ok, result = pcall(function()
		return TextService:FilterStringAsync(text, fromPlayer.UserId, context)
	end)
	if not ok or not result then
		warn("[ModerationService] FilterStringAsync failed:", result)
		return nil
	end
	local ok2, filtered = pcall(function()
		if toPlayer then
			return (result :: TextFilterResult):GetChatForUserAsync(toPlayer.UserId)
		end
		return (result :: TextFilterResult):GetNonChatStringForBroadcastAsync()
	end)
	if not ok2 or type(filtered) ~= "string" then
		warn("[ModerationService] filter result failed:", filtered)
		return nil
	end
	return filtered
end

function ModerationService:IsBlocked(a: any, b: any): boolean
	local pa, pb = playerOf(a), playerOf(b)
	local ia, ib = userIdOf(a), userIdOf(b)
	if not ia or not ib or ia == ib then
		return false
	end
	return hasBlocked(pa, ib) or hasBlocked(pb, ia)
end

function ModerationService:IsAdmin(player: Player): boolean
	return adminSet[player.UserId] == true
end

---------------------------------------------------------------------------
-- Reports
---------------------------------------------------------------------------
local reportStore: DataStore? = nil

local function getReportStore(): DataStore?
	if reportStore then
		return reportStore
	end
	if ProfileStore.IsMock() then
		return nil
	end
	local ok, store = pcall(function()
		return DataStoreService:GetDataStore(CFG.ReportStore)
	end)
	if ok then
		reportStore = store
	end
	return reportStore
end

local function saveReport(record: { [string]: any })
	local store = getReportStore()
	local key = ("r_%d_%d_%s"):format(os.time(), record.ReporterId, HttpService:GenerateGUID(false):sub(1, 8))
	if not store then
		print("[ModerationService] (mock DataStore) report:", HttpService:JSONEncode(record))
		return
	end
	local ok, err = ProfileStore.Retry(4, Enum.DataStoreRequestType.SetIncrementAsync, function()
		return (store :: DataStore):SetAsync(key, record)
	end)
	if not ok then
		warn("[ModerationService] failed to save report:", err)
	end
end

local function targetUserId(payload): number?
	return Guard.Int(payload.UserId, 1, 2 ^ 53)
end

---------------------------------------------------------------------------
-- Chat
---------------------------------------------------------------------------
local function setupChatDelivery()
	local channels = TextChatService:WaitForChild("TextChannels", 20)
	if not channels then
		return
	end
	local function hook(channel: Instance)
		if not channel:IsA("TextChannel") then
			return
		end
		channel.ShouldDeliverCallback = function(message: TextChatMessage, textSource: TextSource)
			local src = message.TextSource
			if not src or not textSource then
				return true
			end
			return not ModerationService:IsBlocked(src.UserId, textSource.UserId)
		end
	end
	-- RBXGeneral plus every channel created later (RBXWhisper:<a>_<b> channels are made on demand)
	channels.ChildAdded:Connect(hook)
	for _, ch in ipairs(channels:GetChildren()) do
		hook(ch)
	end
end

local function findPlayerByName(fragment: string): Player?
	local needle = fragment:lower()
	local exact, partial = nil, nil
	for _, p in ipairs(Players:GetPlayers()) do
		local n, d = p.Name:lower(), p.DisplayName:lower()
		if n == needle or d == needle then
			exact = p
			break
		end
		if not partial and (n:sub(1, #needle) == needle or d:sub(1, #needle) == needle) then
			partial = p
		end
	end
	return exact or partial
end

local function setupKickCommand()
	local commands = TextChatService:FindFirstChild("SkylineCommands")
	if not commands then
		commands = Instance.new("Folder")
		commands.Name = "SkylineCommands"
		commands.Parent = TextChatService
	end
	local cmd = Instance.new("TextChatCommand")
	cmd.Name = "SkylineKick"
	cmd.PrimaryAlias = "/kick"
	cmd.SecondaryAlias = "/skick"
	cmd.Parent = commands
	cmd.Triggered:Connect(function(source: TextSource, text: string)
		local admin = source and Players:GetPlayerByUserId(source.UserId)
		if not admin or not ModerationService:IsAdmin(admin) then
			return
		end
		local name, reason = text:match("^%S+%s+(%S+)%s*(.*)$")
		if not name then
			NotifyService:Send(admin, "Usage: /kick <name> [reason]", "warning")
			return
		end
		local target = findPlayerByName(name)
		if not target then
			NotifyService:Send(admin, ("No player matching '%s'."):format(name), "error")
			return
		end
		if ModerationService:IsAdmin(target) then
			NotifyService:Send(admin, "You can't kick another admin.", "error")
			return
		end
		local msg = CFG.KickMessage
		if reason and reason ~= "" then
			local filtered = ModerationService:FilterText(reason:sub(1, 120), admin, nil)
			if filtered and filtered ~= "" then
				msg ..= "\nReason: " .. filtered
			end
		end
		print(("[ModerationService] %s kicked %s (%d)"):format(admin.Name, target.Name, target.UserId))
		target:Kick(msg)
		NotifyService:Send(admin, ("Kicked %s."):format(target.DisplayName), "success")
	end)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function ModerationService:Init()
	DataService = Registry.Get("DataService")
	NotifyService = Registry.Get("NotifyService")

	for _, id in ipairs(CFG.AdminUserIds) do
		if type(id) == "number" then
			adminSet[id] = true
		end
	end
	if CFG.CreatorIsAdmin and game.CreatorType == Enum.CreatorType.User and game.CreatorId > 0 then
		adminSet[game.CreatorId] = true
	end

	Net.HandleActions("Moderation", {
		Report = function(player: Player, payload)
			local uid = targetUserId(payload)
			if not uid or uid == player.UserId then
				return { ok = false, err = "Pick a player to report" }
			end
			local category = Guard.Id(payload.Category, 24)
			if not category or not categorySet[category] then
				return { ok = false, err = "Pick a category" }
			end
			local text = Guard.String(payload.Text or "", CFG.ReportTextMax * 4) or ""
			if utf8.len(text) and (utf8.len(text) :: number) > CFG.ReportTextMax then
				return { ok = false, err = ("Keep it under %d characters"):format(CFG.ReportTextMax) }
			end
			local now = os.clock()
			local last = lastReport[player.UserId]
			if last and now - last < CFG.ReportCooldown then
				return { ok = false, err = ("You can report again in %ds"):format(math.ceil(CFG.ReportCooldown - (now - last))) }
			end
			lastReport[player.UserId] = now
			local target = Players:GetPlayerByUserId(uid)
			local record = {
				Time = os.time(),
				ReporterId = player.UserId,
				ReporterName = player.Name,
				TargetId = uid,
				TargetName = target and target.Name or "",
				TargetRPName = target and tostring(target:GetAttribute("RPName") or "") or "",
				Category = category,
				Text = text,
				JobId = game.JobId,
				PlaceId = game.PlaceId,
				PlaceVersion = game.PlaceVersion,
			}
			task.spawn(saveReport, record)
			return { ok = true }
		end,

		Block = function(player: Player, payload)
			local uid = targetUserId(payload)
			if not uid or uid == player.UserId then
				return { ok = false, err = "Invalid player" }
			end
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			local blocked = DataService:Get(player, "Social.Blocked") or {}
			local count = 0
			for _ in pairs(blocked) do
				count += 1
			end
			if count >= CFG.MaxBlocked and not blocked[tostring(uid)] then
				return { ok = false, err = "Your block list is full" }
			end
			DataService:Set(player, "Social.Blocked." .. tostring(uid), true)
			-- break social links (group membership) with the blocked player if possible
			local social = Registry.Find("SocialService")
			if social and social.OnBlocked then
				pcall(social.OnBlocked, social, player, uid)
			end
			return { ok = true }
		end,

		Unblock = function(player: Player, payload)
			local uid = targetUserId(payload)
			if not uid then
				return { ok = false, err = "Invalid player" }
			end
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			DataService:Set(player, "Social.Blocked." .. tostring(uid), nil)
			return { ok = true }
		end,
	}, {
		rate = 2,
		burst = 6,
	})

	Players.PlayerRemoving:Connect(function(player)
		-- keep the cooldown across a quick rejoin for a while, then forget
		local uid = player.UserId
		task.delay(CFG.ReportCooldown, function()
			if not Players:GetPlayerByUserId(uid) then
				lastReport[uid] = nil
			end
		end)
	end)
end

function ModerationService:Start()
	task.spawn(setupChatDelivery)
	local ok, err = pcall(setupKickCommand)
	if not ok then
		warn("[ModerationService] could not create /kick command:", err)
	end
end

return ModerationService
