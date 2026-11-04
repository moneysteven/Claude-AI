-- PhoneService: in-server text messages, the "Skyline Feed", contacts and phone "calls".
--
-- Messages live in server memory only (per player inbox, each copy filtered for its reader).
--
-- API (server):
--   PhoneService:SendSystemMessage(player, fromName, text)    -- bank alerts, rent reminders, job offers (trusted text)
--   PhoneService:PostToFeed(player?, text) -> postId?          -- nil player = system post. Text is TRUSTED: callers
--                                                                 must filter any player-written parts first.
--
-- Remote domain "Phone":
--   SendMessage   { ToUserId, Text } | { Group = true, Text }  -> { Message, Thread }
--   GetThreads    {}                     -> { Threads = { summary... } }       (summary has Last = last message)
--   GetThread     { ThreadId }           -> { Thread = { ..., Messages } }
--   PostFeed      { Text }               -> { Post }
--   LikePost      { Id }                 -> { Id, Likes, Liked }
--   GetFeed       {}                     -> { Posts }
--   SaveContact   { UserId, Nickname }   -> { Nickname }
--   RemoveContact { UserId }             -> {}
--   Ping          { UserId }             -> {}   ("call" someone: rings their phone)
--   Opened        {}                     -> {}   (tutorial "OpenPhone")
--
-- Server -> client "PhoneEvent"(kind, data):
--   "Message"  { Thread = summary, Message }      "Feed" post      "FeedLike" { Id, Likes }
--   "Ping"     { FromUserId, FromName }
--   (SocialService also uses it for "GroupInvite", "Group", "Party")

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local PhoneConfig = require(Shared.Config.Phone)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local PhoneService = {
	Name = "PhoneService",
	Priority = 60,
}

local MSG = PhoneConfig.Messages
local FEED = PhoneConfig.Feed
local CONTACTS = PhoneConfig.Contacts

local DataService
local NotifyService
local ModerationService

type Message = { Id: number, From: number, FromName: string, Text: string, Time: number }
type Thread = {
	Id: string,
	Name: string,
	Kind: string, -- "dm" | "group" | "system"
	UserId: number?,
	Messages: { Message },
	LastTime: number,
}

local inboxes: { [Player]: { [string]: Thread } } = {}
local nextMessageId = 0

local feed: { any } = {} -- newest first
local likedBy: { [number]: { [number]: boolean } } = {}
local nextPostId = 0
local lastPost: { [Player]: number } = {}
local lastPing: { [string]: number } = {}

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function displayName(p: Player): string
	local rp = p:GetAttribute("RPName")
	if type(rp) == "string" and rp ~= "" then
		return rp
	end
	return p.DisplayName
end

local function trim(s: string): string
	return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- validate player-typed text: returns trimmed text or nil, err
local function cleanText(v: any, maxChars: number): (string?, string?)
	local s = Guard.String(v, maxChars * 4)
	if not s then
		return nil, "Message is too long"
	end
	s = trim(s)
	if s == "" then
		return nil, "Type something first"
	end
	local len = utf8.len(s)
	if not len or len > maxChars then
		return nil, ("Keep it under %d characters"):format(maxChars)
	end
	return s, nil
end

local function summary(t: Thread)
	return {
		Id = t.Id,
		Name = t.Name,
		Kind = t.Kind,
		UserId = t.UserId,
		LastTime = t.LastTime,
		Last = t.Messages[#t.Messages],
		Count = #t.Messages,
	}
end

local function getInbox(p: Player): { [string]: Thread }?
	if p.Parent ~= Players then
		return nil
	end
	local box = inboxes[p]
	if not box then
		box = {}
		inboxes[p] = box
	end
	return box
end

local function evictOldThreads(box: { [string]: Thread })
	local list = {}
	for _, t in pairs(box) do
		table.insert(list, t)
	end
	if #list <= MSG.MaxThreads then
		return
	end
	table.sort(list, function(a, b)
		return a.LastTime < b.LastTime
	end)
	for i = 1, #list - MSG.MaxThreads do
		box[list[i].Id] = nil
	end
end

local function getThread(p: Player, id: string, name: string, kind: string, userId: number?): Thread?
	local box = getInbox(p)
	if not box then
		return nil
	end
	local t = box[id]
	if not t then
		t = { Id = id, Name = name, Kind = kind, UserId = userId, Messages = {}, LastTime = os.time() }
		box[id] = t
		evictOldThreads(box)
	else
		t.Name = name
	end
	return t
end

local function newMessage(fromId: number, fromName: string, text: string): Message
	nextMessageId += 1
	return { Id = nextMessageId, From = fromId, FromName = fromName, Text = text, Time = os.time() }
end

-- append a message to `p`'s thread and (optionally) push it to their client
local function deliver(p: Player, thread: Thread, msg: Message, push: boolean)
	table.insert(thread.Messages, msg)
	while #thread.Messages > MSG.MaxPerThread do
		table.remove(thread.Messages, 1)
	end
	thread.LastTime = msg.Time
	if push then
		Net.Fire(p, "PhoneEvent", "Message", { Thread = summary(thread), Message = msg })
	end
end

local function systemThreadId(fromName: string): string
	local key = fromName:gsub("[^%w]", "")
	if key == "" then
		key = "System"
	end
	return "s_" .. key:sub(1, 32)
end

local function publicPost(post, viewer: Player?)
	return {
		Id = post.Id,
		AuthorId = post.AuthorId,
		AuthorName = post.AuthorName,
		Text = post.Text,
		Time = post.Time,
		Likes = post.Likes,
		System = post.System,
		Liked = viewer ~= nil and likedBy[post.Id] ~= nil and likedBy[post.Id][viewer.UserId] == true or false,
	}
end

local function addPost(author: Player?, text: string)
	nextPostId += 1
	local post = {
		Id = nextPostId,
		AuthorId = author and author.UserId or 0,
		AuthorName = author and displayName(author) or "Skyline City",
		Text = text,
		Time = os.time(),
		Likes = 0,
		System = author == nil,
	}
	table.insert(feed, 1, post)
	likedBy[post.Id] = {}
	while #feed > FEED.MaxPosts do
		local old = table.remove(feed)
		if old then
			likedBy[old.Id] = nil
		end
	end
	Net.FireAll("PhoneEvent", "Feed", publicPost(post, nil))
	return post
end

local function findPost(id: number)
	for _, post in ipairs(feed) do
		if post.Id == id then
			return post
		end
	end
	return nil
end

local function getSocial()
	return Registry.Find("SocialService")
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function PhoneService:SendSystemMessage(player: Player, fromName: string, text: string)
	if typeof(player) ~= "Instance" or not player:IsA("Player") then
		return
	end
	local name = tostring(fromName or "Skyline City"):sub(1, 40)
	local thread = getThread(player, systemThreadId(name), name, "system", nil)
	if not thread then
		return
	end
	deliver(player, thread, newMessage(0, name, tostring(text):sub(1, 400)), true)
end

function PhoneService:PostToFeed(player: Player?, text: string): number?
	if type(text) ~= "string" or text == "" then
		return nil
	end
	local author = (typeof(player) == "Instance" and (player :: Player):IsA("Player")) and player or nil
	return addPost(author, text:sub(1, 300)).Id
end

---------------------------------------------------------------------------
-- Remote handlers
---------------------------------------------------------------------------
local function sendDirect(player: Player, toUserId: number, text: string)
	local target = Players:GetPlayerByUserId(toUserId)
	if not target or target == player then
		return { ok = false, err = "That player isn't in this server" }
	end
	if ModerationService and ModerationService:IsBlocked(player, target) then
		return { ok = false, err = "You can't message this player" }
	end
	local forTarget = ModerationService and ModerationService:FilterText(text, player, target)
	local forSelf = ModerationService and ModerationService:FilterText(text, player, player)
	if not forTarget or not forSelf then
		return { ok = false, err = "Your message couldn't be sent. Try again." }
	end
	if target.Parent ~= Players or player.Parent ~= Players then
		return { ok = false, err = "That player left" }
	end
	local myThread = getThread(player, "u_" .. target.UserId, displayName(target), "dm", target.UserId)
	local theirThread = getThread(target, "u_" .. player.UserId, displayName(player), "dm", player.UserId)
	if not myThread or not theirThread then
		return { ok = false, err = "Couldn't send" }
	end
	local mine = newMessage(player.UserId, displayName(player), forSelf)
	local theirs = newMessage(player.UserId, displayName(player), forTarget)
	theirs.Id = mine.Id -- same logical message
	deliver(player, myThread, mine, false)
	deliver(target, theirThread, theirs, true)
	return { ok = true, Message = mine, Thread = summary(myThread) }
end

local function sendGroup(player: Player, text: string)
	local social = getSocial()
	local group = social and social.GetGroupOf and social:GetGroupOf(player)
	if not group then
		return { ok = false, err = "You're not in a group" }
	end
	local threadId = "g_" .. group.Id
	local base = newMessage(player.UserId, displayName(player), "")
	local myThread
	local myMsg
	for _, member in ipairs(group.Online) do
		local filtered = ModerationService and ModerationService:FilterText(text, player, member)
		if filtered and member.Parent == Players then
			local t = getThread(member, threadId, "👪 " .. group.Name, "group", nil)
			if t then
				local m = { Id = base.Id, From = base.From, FromName = base.FromName, Text = filtered, Time = base.Time }
				local isMe = member == player
				deliver(member, t, m, not isMe)
				if isMe then
					myThread, myMsg = t, m
				end
			end
		end
	end
	if not myThread then
		return { ok = false, err = "Your message couldn't be sent. Try again." }
	end
	return { ok = true, Message = myMsg, Thread = summary(myThread) }
end

function PhoneService:Init()
	DataService = Registry.Get("DataService")
	NotifyService = Registry.Get("NotifyService")
	ModerationService = Registry.Find("ModerationService")
	Net.Declare("PhoneEvent")

	Net.HandleActions("Phone", {
		SendMessage = function(player: Player, payload)
			local text, err = cleanText(payload.Text, MSG.MaxLength)
			if not text then
				return { ok = false, err = err }
			end
			if payload.Group == true then
				return sendGroup(player, text)
			end
			local uid = Guard.Int(payload.ToUserId, 1, 2 ^ 53)
			if not uid then
				return { ok = false, err = "Pick someone to message" }
			end
			return sendDirect(player, uid, text)
		end,

		GetThreads = function(player: Player)
			local box = getInbox(player) or {}
			local list = {}
			for _, t in pairs(box) do
				table.insert(list, summary(t))
			end
			table.sort(list, function(a, b)
				return a.LastTime > b.LastTime
			end)
			return { ok = true, Threads = list }
		end,

		GetThread = function(player: Player, payload)
			local id = Guard.Id(payload.ThreadId, 48)
			if not id then
				return { ok = false, err = "Bad thread" }
			end
			local box = getInbox(player)
			local t = box and box[id]
			if not t then
				return { ok = true, Thread = nil }
			end
			local s = summary(t)
			s.Messages = t.Messages
			return { ok = true, Thread = s }
		end,

		PostFeed = function(player: Player, payload)
			local text, err = cleanText(payload.Text, FEED.MaxLength)
			if not text then
				return { ok = false, err = err }
			end
			local now = os.clock()
			local last = lastPost[player]
			if last and now - last < FEED.PostCooldown then
				return { ok = false, err = ("You can post again in %ds"):format(math.ceil(FEED.PostCooldown - (now - last))) }
			end
			local filtered = ModerationService and ModerationService:FilterText(text, player, nil)
			if not filtered then
				return { ok = false, err = "Your post couldn't be published. Try again." }
			end
			lastPost[player] = now
			local post = addPost(player, filtered)
			return { ok = true, Post = publicPost(post, player) }
		end,

		LikePost = function(player: Player, payload)
			local id = Guard.Int(payload.Id, 1, 2 ^ 40)
			local post = id and findPost(id)
			if not post then
				return { ok = false, err = "That post is gone" }
			end
			local set = likedBy[post.Id]
			local liked
			if set[player.UserId] then
				set[player.UserId] = nil
				post.Likes = math.max(0, post.Likes - 1)
				liked = false
			else
				set[player.UserId] = true
				post.Likes += 1
				liked = true
			end
			Net.FireAll("PhoneEvent", "FeedLike", { Id = post.Id, Likes = post.Likes })
			return { ok = true, Id = post.Id, Likes = post.Likes, Liked = liked }
		end,

		GetFeed = function(player: Player)
			local list = {}
			for _, post in ipairs(feed) do
				table.insert(list, publicPost(post, player))
			end
			return { ok = true, Posts = list }
		end,

		SaveContact = function(player: Player, payload)
			local uid = Guard.Int(payload.UserId, 1, 2 ^ 53)
			if not uid or uid == player.UserId then
				return { ok = false, err = "Invalid contact" }
			end
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			local contacts = DataService:Get(player, "Social.Contacts") or {}
			local key = tostring(uid)
			if contacts[key] == nil then
				local n = 0
				for _ in pairs(contacts) do
					n += 1
				end
				if n >= CONTACTS.MaxContacts then
					return { ok = false, err = "Your contact list is full" }
				end
			end
			local raw = Guard.String(payload.Nickname or "", CONTACTS.MaxNicknameLength * 4)
			if raw == nil then
				return { ok = false, err = "Nickname is too long" }
			end
			raw = trim(raw)
			local len = utf8.len(raw) or 0
			if len > CONTACTS.MaxNicknameLength then
				return { ok = false, err = ("Nicknames are up to %d characters"):format(CONTACTS.MaxNicknameLength) }
			end
			local nickname
			if raw == "" then
				local target = Players:GetPlayerByUserId(uid)
				nickname = target and target.DisplayName or ("Contact " .. key)
			else
				nickname = ModerationService and ModerationService:FilterText(raw, player, player)
				if not nickname then
					return { ok = false, err = "Couldn't save that nickname" }
				end
			end
			DataService:Set(player, "Social.Contacts." .. key, nickname)
			return { ok = true, Nickname = nickname }
		end,

		RemoveContact = function(player: Player, payload)
			local uid = Guard.Int(payload.UserId, 1, 2 ^ 53)
			if not uid then
				return { ok = false, err = "Invalid contact" }
			end
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			DataService:Set(player, "Social.Contacts." .. tostring(uid), nil)
			return { ok = true }
		end,

		Ping = function(player: Player, payload)
			local uid = Guard.Int(payload.UserId, 1, 2 ^ 53)
			local target = uid and Players:GetPlayerByUserId(uid)
			if not target or target == player then
				return { ok = false, err = "That player isn't in this server" }
			end
			if ModerationService and ModerationService:IsBlocked(player, target) then
				return { ok = false, err = "You can't call this player" }
			end
			local key = player.UserId .. ":" .. target.UserId
			local now = os.clock()
			if lastPing[key] and now - lastPing[key] < MSG.PingCooldown then
				return { ok = false, err = "They're still ringing…" }
			end
			lastPing[key] = now
			local name = displayName(player)
			Net.Fire(target, "PhoneEvent", "Ping", { FromUserId = player.UserId, FromName = name })
			NotifyService:Send(target, ("📞 %s is calling you!"):format(name), "info", 5)
			return { ok = true }
		end,

		Opened = function(player: Player)
			local tutorial = Registry.Find("TutorialService")
			if tutorial and tutorial.Advance then
				pcall(tutorial.Advance, tutorial, player, "OpenPhone")
			end
			return { ok = true }
		end,
	}, {
		rate = 8,
		burst = 16,
		perAction = {
			SendMessage = { rate = MSG.SendRate, burst = MSG.SendBurst },
			LikePost = { rate = FEED.LikeRate, burst = FEED.LikeRate * 2 },
			PostFeed = { rate = 0.5, burst = 2 },
			Ping = { rate = 0.5, burst = 2 },
			SaveContact = { rate = 1, burst = 4 },
			Opened = { rate = 0.5, burst = 2 },
		},
	})

	Players.PlayerRemoving:Connect(function(player)
		inboxes[player] = nil
		lastPost[player] = nil
		local prefix = player.UserId .. ":"
		for key in pairs(lastPing) do
			if key:sub(1, #prefix) == prefix then
				lastPing[key] = nil
			end
		end
	end)
end

function PhoneService:Start()
	ModerationService = ModerationService or Registry.Find("ModerationService")
	if not ModerationService then
		warn("[PhoneService] ModerationService missing: messages and posts can't be filtered, so they are disabled")
	end
end

return PhoneService
