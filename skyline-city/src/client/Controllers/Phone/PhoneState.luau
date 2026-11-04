-- PhoneState (PhoneController helper): client cache of threads, feed, group, invites and parties.
--
--   PhoneState.Changed : Signal(kind, extra)   kinds: "Threads", "Thread" (threadId), "Feed", "Group", "Invites",
--                                               "Parties", "Unread"
--   PhoneState.FetchThreads() / FetchThread(id) -> thread? / FetchFeed() / FetchGroup() / FetchParties()
--   PhoneState.HandleEvent(kind, data) -> banner info?     (wired to the "PhoneEvent" remote by PhoneController)
--   PhoneState.AddOwnMessage(threadSummary, message)
--   PhoneState.SetViewing(threadId?)  PhoneState.MarkRead(threadId)  PhoneState.TotalUnread() -> number
--   PhoneState.IsHidden(userId) -> boolean     blocked (saved) or muted (ModerationController, local)
--   PhoneState.SortedThreads() -> { thread }
--   PhoneState.Threads / Feed / Group / Invites / Parties / FeedUnseen

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Registry = require(Client:WaitForChild("Registry"))

local PhoneState = {}
PhoneState.Changed = Signal.new()
PhoneState.Threads = {} :: { [string]: any }
PhoneState.ThreadsLoaded = false
PhoneState.Feed = {} :: { any }
PhoneState.FeedLoaded = false
PhoneState.FeedUnseen = 0
PhoneState.Group = nil :: any
PhoneState.Invites = {} :: { [string]: any }
PhoneState.Parties = {} :: { [string]: any }

local viewing: string? = nil
local feedOpen = false
local MAX_PER_THREAD = 50

function PhoneState.IsHidden(userId: number?): boolean
	if not userId or userId <= 0 then
		return false
	end
	local blocked = ClientData.Get("Social.Blocked")
	if type(blocked) == "table" and blocked[tostring(userId)] == true then
		return true
	end
	local mod = Registry.Find("ModerationController")
	if mod and mod.IsMuted then
		local ok, muted = pcall(mod.IsMuted, mod, userId)
		return ok and muted == true
	end
	return false
end

local function mergeSummary(s)
	local t = PhoneState.Threads[s.Id]
	if not t then
		t = { Id = s.Id, Messages = nil, Unread = 0 }
		PhoneState.Threads[s.Id] = t
	end
	t.Name = s.Name
	t.Kind = s.Kind
	t.UserId = s.UserId
	t.LastTime = s.LastTime
	t.Last = s.Last
	return t
end

local function appendMessage(t, msg)
	if t.Messages then
		for i = #t.Messages, math.max(1, #t.Messages - 5), -1 do
			if t.Messages[i].Id == msg.Id then
				return false -- duplicate
			end
		end
		table.insert(t.Messages, msg)
		while #t.Messages > MAX_PER_THREAD do
			table.remove(t.Messages, 1)
		end
	end
	t.Last = msg
	t.LastTime = msg.Time
	return true
end

function PhoneState.SortedThreads()
	local list = {}
	for _, t in pairs(PhoneState.Threads) do
		if not (t.Kind == "dm" and PhoneState.IsHidden(t.UserId)) then
			table.insert(list, t)
		end
	end
	table.sort(list, function(a, b)
		return (a.LastTime or 0) > (b.LastTime or 0)
	end)
	return list
end

function PhoneState.TotalUnread(): number
	local n = 0
	for _, t in pairs(PhoneState.Threads) do
		if not (t.Kind == "dm" and PhoneState.IsHidden(t.UserId)) then
			n += t.Unread or 0
		end
	end
	return n
end

function PhoneState.MarkRead(id: string)
	local t = PhoneState.Threads[id]
	if t and (t.Unread or 0) > 0 then
		t.Unread = 0
		PhoneState.Changed:Fire("Unread")
	end
end

function PhoneState.SetViewing(id: string?)
	viewing = id
	if id then
		PhoneState.MarkRead(id)
	end
end

function PhoneState.SetFeedOpen(open: boolean)
	feedOpen = open
	if open and PhoneState.FeedUnseen > 0 then
		PhoneState.FeedUnseen = 0
		PhoneState.Changed:Fire("Unread")
	end
end

function PhoneState.FetchThreads()
	local res = Net.Invoke("Phone", "GetThreads", {})
	if res.ok and type(res.Threads) == "table" then
		for _, s in ipairs(res.Threads) do
			mergeSummary(s)
		end
		PhoneState.ThreadsLoaded = true
		PhoneState.Changed:Fire("Threads")
	end
	return res.ok
end

function PhoneState.FetchThread(id: string)
	local res = Net.Invoke("Phone", "GetThread", { ThreadId = id })
	if res.ok and type(res.Thread) == "table" then
		local t = mergeSummary(res.Thread)
		t.Messages = res.Thread.Messages or {}
		PhoneState.Changed:Fire("Thread", id)
		return t
	end
	return PhoneState.Threads[id]
end

function PhoneState.AddOwnMessage(summary, msg)
	if type(summary) ~= "table" or type(msg) ~= "table" then
		return
	end
	local t = mergeSummary(summary)
	appendMessage(t, msg)
	PhoneState.Changed:Fire("Thread", t.Id)
	PhoneState.Changed:Fire("Threads")
end

function PhoneState.FetchFeed()
	local res = Net.Invoke("Phone", "GetFeed", {})
	if res.ok and type(res.Posts) == "table" then
		PhoneState.Feed = res.Posts
		PhoneState.FeedLoaded = true
		PhoneState.Changed:Fire("Feed")
	end
	return res.ok
end

function PhoneState.SetPostLiked(id: number, liked: boolean, likes: number)
	for _, post in ipairs(PhoneState.Feed) do
		if post.Id == id then
			post.Liked = liked
			post.Likes = likes
		end
	end
	PhoneState.Changed:Fire("Feed")
end

function PhoneState.FetchGroup()
	local res = Net.Invoke("Social", "GetGroup", {})
	if res.ok then
		PhoneState.Group = res.Group
		PhoneState.Changed:Fire("Group")
	end
	return res.ok
end

function PhoneState.FetchParties()
	local res = Net.Invoke("Social", "GetParties", {})
	if res.ok and type(res.Parties) == "table" then
		table.clear(PhoneState.Parties)
		for _, p in ipairs(res.Parties) do
			PhoneState.Parties[p.Id] = p
		end
		PhoneState.Changed:Fire("Parties")
	end
	return res.ok
end

function PhoneState.RemoveInvite(groupId: string)
	PhoneState.Invites[groupId] = nil
	PhoneState.Changed:Fire("Invites")
end

-- Returns a banner description { Icon, Title, Text, App, Data } or nil.
function PhoneState.HandleEvent(kind: string, data: any)
	if kind == "Message" and type(data) == "table" and type(data.Thread) == "table" and type(data.Message) == "table" then
		local msg = data.Message
		local t = mergeSummary(data.Thread)
		if not appendMessage(t, msg) then
			return nil
		end
		local hidden = PhoneState.IsHidden(msg.From)
		if viewing ~= t.Id and not hidden then
			t.Unread = (t.Unread or 0) + 1
			PhoneState.Changed:Fire("Unread")
		end
		PhoneState.Changed:Fire("Thread", t.Id)
		PhoneState.Changed:Fire("Threads")
		if hidden or viewing == t.Id then
			return nil
		end
		local icon = t.Kind == "system" and "🔔" or (t.Kind == "group" and "👪" or "💬")
		local title = t.Kind == "group" and (t.Name .. " · " .. tostring(msg.FromName)) or t.Name
		return { Icon = icon, Title = title, Text = msg.Text, App = "Messages", Data = { ThreadId = t.Id } }
	elseif kind == "Feed" and type(data) == "table" then
		for _, post in ipairs(PhoneState.Feed) do
			if post.Id == data.Id then
				return nil
			end
		end
		table.insert(PhoneState.Feed, 1, data)
		while #PhoneState.Feed > 50 do
			table.remove(PhoneState.Feed)
		end
		local hidden = PhoneState.IsHidden(data.AuthorId)
		if not feedOpen and not hidden then
			PhoneState.FeedUnseen += 1
			PhoneState.Changed:Fire("Unread")
		end
		PhoneState.Changed:Fire("Feed")
		return nil -- feed posts don't pop banners (too noisy); the icon gets a badge
	elseif kind == "FeedLike" and type(data) == "table" then
		for _, post in ipairs(PhoneState.Feed) do
			if post.Id == data.Id then
				post.Likes = data.Likes
			end
		end
		PhoneState.Changed:Fire("Feed")
		return nil
	elseif kind == "Ping" and type(data) == "table" then
		if PhoneState.IsHidden(data.FromUserId) then
			return nil
		end
		return {
			Icon = "📞",
			Title = tostring(data.FromName),
			Text = "is calling you… tap to message back",
			App = "Messages",
			Data = { UserId = data.FromUserId },
		}
	elseif kind == "GroupInvite" and type(data) == "table" and type(data.GroupId) == "string" then
		if PhoneState.IsHidden(data.FromUserId) then
			return nil
		end
		data.ReceivedAt = os.clock()
		PhoneState.Invites[data.GroupId] = data
		PhoneState.Changed:Fire("Invites")
		local gid = data.GroupId
		task.delay(tonumber(data.ExpiresIn) or 60, function()
			local inv = PhoneState.Invites[gid]
			if inv == data then
				PhoneState.RemoveInvite(gid)
			end
		end)
		return {
			Icon = "👪",
			Title = "Group invite",
			Text = ("%s invited you to \"%s\""):format(tostring(data.FromName), tostring(data.GroupName)),
			App = "Profile",
			Data = nil,
		}
	elseif kind == "Group" then
		PhoneState.Group = type(data) == "table" and data or nil
		PhoneState.Changed:Fire("Group")
		return nil
	elseif kind == "Party" and type(data) == "table" and type(data.Id) == "string" then
		PhoneState.Parties[data.Id] = data
		PhoneState.Changed:Fire("Parties")
		return nil
	elseif kind == "PartyEnded" and type(data) == "table" and type(data.Id) == "string" then
		PhoneState.Parties[data.Id] = nil
		PhoneState.Changed:Fire("Parties")
		return nil
	end
	return nil
end

return PhoneState
