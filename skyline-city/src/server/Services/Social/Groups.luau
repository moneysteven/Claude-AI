-- Groups (SocialService helper): family / friend groups.
--
-- Groups are in-server: a group exists while at least one member is in this server. Each member's data keeps
-- Social.GroupId + Social.GroupName, so when they join a new server the group re-forms around whoever is there
-- (the first member to arrive becomes the leader).
--
--   Groups.Setup(deps)                        deps = { DataService, NotifyService, Moderation = () -> service? }
--   Groups.GetOf(player) -> group?            group = { Id, Name, Leader = userId, Members = { [userId] = Player } }
--   Groups.Info(group, viewer?) -> table      public snapshot (sent to clients)
--   Groups.Online(group) -> { Player }
--   Groups.Create(player, name) -> (ok, err)  name must already be filtered
--   Groups.Invite(player, target) -> (ok, err)
--   Groups.Accept(player, groupId) -> (ok, err)
--   Groups.Decline(player, groupId)
--   Groups.Leave(player, keepData?)           keepData = true when they're only leaving the server
--   Groups.Kick(leader, userId) -> (ok, err)
--   Groups.Restore(player)                    after data loads

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local SocialConfig = require(Shared.Config.Social)

local CFG = SocialConfig.Groups

local Groups = {}

local deps: any = nil
local groups: { [string]: any } = {}
local membership: { [Player]: string } = {}
local invites: { [Player]: { [string]: { GroupId: string, From: string, Expires: number } } } = {}

local function displayName(p: Player): string
	local rp = p:GetAttribute("RPName")
	if type(rp) == "string" and rp ~= "" then
		return rp
	end
	return p.DisplayName
end

local function memberCount(group): number
	local n = 0
	for _ in pairs(group.Members) do
		n += 1
	end
	return n
end

function Groups.Setup(d)
	deps = d
end

function Groups.GetOf(player: Player)
	local id = membership[player]
	return id and groups[id] or nil
end

function Groups.Online(group): { Player }
	local out = {}
	for _, p in pairs(group.Members) do
		if p.Parent == Players then
			table.insert(out, p)
		end
	end
	return out
end

function Groups.Info(group, viewer: Player?)
	if not group then
		return nil
	end
	local members = {}
	for uid, p in pairs(group.Members) do
		table.insert(members, { UserId = uid, Name = displayName(p), Username = p.Name, Leader = uid == group.Leader })
	end
	table.sort(members, function(a, b)
		if a.Leader ~= b.Leader then
			return a.Leader
		end
		return a.Name:lower() < b.Name:lower()
	end)
	return {
		Id = group.Id,
		Name = group.Name,
		Leader = group.Leader,
		Members = members,
		Max = CFG.MaxMembers,
		IsLeader = viewer ~= nil and viewer.UserId == group.Leader,
		CanInvite = viewer ~= nil and (viewer.UserId == group.Leader or CFG.MembersCanInvite),
	}
end

local function broadcast(group)
	for _, p in ipairs(Groups.Online(group)) do
		Net.Fire(p, "PhoneEvent", "Group", Groups.Info(group, p))
	end
end

local function setMemberData(player: Player, id: string, name: string)
	if deps.DataService:IsLoaded(player) then
		deps.DataService:Set(player, "Social.GroupId", id)
		deps.DataService:Set(player, "Social.GroupName", name)
	end
	player:SetAttribute("GroupName", name)
end

local function join(player: Player, group)
	group.Members[player.UserId] = player
	membership[player] = group.Id
	setMemberData(player, group.Id, group.Name)
end

local function newId(): string
	return "g" .. HttpService:GenerateGUID(false):gsub("-", ""):sub(1, 12)
end

function Groups.Create(player: Player, name: string): (boolean, string?)
	if Groups.GetOf(player) then
		return false, "Leave your current group first"
	end
	local group = { Id = newId(), Name = name, Leader = player.UserId, Members = {} }
	groups[group.Id] = group
	join(player, group)
	broadcast(group)
	return true, nil
end

function Groups.Invite(player: Player, target: Player): (boolean, string?)
	local group = Groups.GetOf(player)
	if not group then
		return false, "Create a group first"
	end
	if player.UserId ~= group.Leader and not CFG.MembersCanInvite then
		return false, "Only the group leader can invite"
	end
	if target == player then
		return false, "You can't invite yourself"
	end
	if group.Members[target.UserId] then
		return false, "They're already in your group"
	end
	if memberCount(group) >= CFG.MaxMembers then
		return false, "Your group is full"
	end
	local mod = deps.Moderation()
	if mod and mod:IsBlocked(player, target) then
		return false, "You can't invite this player"
	end
	local list = invites[target]
	if not list then
		list = {}
		invites[target] = list
	end
	local existing = list[group.Id]
	if existing and existing.Expires > os.clock() then
		return false, "Invite already sent"
	end
	list[group.Id] = { GroupId = group.Id, From = displayName(player), Expires = os.clock() + CFG.InviteSeconds }
	Net.Fire(target, "PhoneEvent", "GroupInvite", {
		GroupId = group.Id,
		GroupName = group.Name,
		FromUserId = player.UserId,
		FromName = displayName(player),
		ExpiresIn = CFG.InviteSeconds,
	})
	deps.NotifyService:Send(target, ("👪 %s invited you to join \"%s\". Open your phone to accept."):format(displayName(player), group.Name), "info", 6)
	return true, nil
end

function Groups.Decline(player: Player, groupId: string)
	local list = invites[player]
	if list then
		list[groupId] = nil
	end
end

local function removeMember(player: Player, keepData: boolean)
	local id = membership[player]
	membership[player] = nil
	if not keepData then
		if deps.DataService:IsLoaded(player) then
			deps.DataService:Set(player, "Social.GroupId", "")
			deps.DataService:Set(player, "Social.GroupName", "")
		end
		if player.Parent then
			player:SetAttribute("GroupName", "")
		end
	end
	local group = id and groups[id]
	if not group then
		return
	end
	group.Members[player.UserId] = nil
	if next(group.Members) == nil then
		groups[id] = nil
		return
	end
	if group.Leader == player.UserId then
		-- promote the member with the lowest user id (stable, no randomness)
		local best = nil
		for uid in pairs(group.Members) do
			if not best or uid < best then
				best = uid
			end
		end
		group.Leader = best
		local newLeader = group.Members[best]
		if newLeader then
			deps.NotifyService:Send(newLeader, ("👑 You are now the leader of \"%s\"."):format(group.Name), "info")
		end
	end
	broadcast(group)
end

function Groups.Accept(player: Player, groupId: string): (boolean, string?)
	local list = invites[player]
	local invite = list and list[groupId]
	if not invite or invite.Expires < os.clock() then
		if list then
			list[groupId] = nil
		end
		return false, "That invite expired"
	end
	local group = groups[groupId]
	if not group then
		list[groupId] = nil
		return false, "That group no longer exists"
	end
	if memberCount(group) >= CFG.MaxMembers then
		return false, "That group is full"
	end
	list[groupId] = nil
	if Groups.GetOf(player) then
		removeMember(player, false)
		player:SetAttribute("GroupName", "")
	end
	join(player, group)
	for _, p in ipairs(Groups.Online(group)) do
		if p ~= player then
			deps.NotifyService:Send(p, ("👪 %s joined \"%s\"!"):format(displayName(player), group.Name), "success")
		end
	end
	broadcast(group)
	return true, nil
end

function Groups.Leave(player: Player, keepData: boolean?)
	local had = Groups.GetOf(player) ~= nil
	removeMember(player, keepData == true)
	if had and not keepData and player.Parent == Players then
		Net.Fire(player, "PhoneEvent", "Group", nil)
	end
	if keepData then
		invites[player] = nil
	end
end

function Groups.Kick(leader: Player, userId: number): (boolean, string?)
	local group = Groups.GetOf(leader)
	if not group then
		return false, "You're not in a group"
	end
	if group.Leader ~= leader.UserId then
		return false, "Only the leader can remove members"
	end
	if userId == leader.UserId then
		return false, "Use Leave instead"
	end
	local target = group.Members[userId]
	if not target then
		return false, "They're not in your group"
	end
	removeMember(target, false)
	if target.Parent == Players then
		Net.Fire(target, "PhoneEvent", "Group", nil)
		deps.NotifyService:Send(target, ("You were removed from \"%s\"."):format(group.Name), "warning")
	end
	return true, nil
end

function Groups.Restore(player: Player)
	local id = deps.DataService:Get(player, "Social.GroupId")
	local name = deps.DataService:Get(player, "Social.GroupName")
	if type(id) ~= "string" or id == "" then
		player:SetAttribute("GroupName", "")
		return
	end
	if type(name) ~= "string" or name == "" then
		name = "My Group"
	end
	local group = groups[id]
	if group then
		if memberCount(group) >= CFG.MaxMembers then
			-- full in this server: keep their saved membership for next time, but not active here
			player:SetAttribute("GroupName", "")
			return
		end
		join(player, group)
		-- the group's in-server name wins (it might have been renamed by the creator elsewhere)
	else
		group = { Id = id, Name = name, Leader = player.UserId, Members = {} }
		groups[id] = group
		join(player, group)
	end
	broadcast(group)
end

Players.PlayerRemoving:Connect(function(player)
	invites[player] = nil
end)

return Groups
