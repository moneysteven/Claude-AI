-- Messages app (phone). Thread list, new-message picker and the chat view.
--   data = nil                    -> thread list
--   data = { Picker = true }      -> pick an online player to message
--   data = { ThreadId = "u_1" }   -> chat view ("u_<userId>" DM, "g_<groupId>" group, "s_<name>" system)
--   data = { UserId = 123 }       -> chat view with that player
--   data = { Group = true }       -> your group's chat

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextService = game:GetService("TextService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local PhoneConfig = require(Shared.Config.Phone)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local AppKit = require(script.Parent:WaitForChild("AppKit"))
local PhoneState = require(script.Parent:WaitForChild("PhoneState"))

local Messages = {}

local localPlayer = Players.LocalPlayer
local BUBBLE_MAX = 196
local KIND_ICONS = { dm = "💬", group = "👪", system = "🔔" }

---------------------------------------------------------------------------
-- Thread list
---------------------------------------------------------------------------
local function buildList(container: Frame, ctx)
	local body = AppKit.Page(container, "Messages", ctx, {
		RightIcon = "✏️",
		OnRight = function()
			ctx.Open("Messages", { Picker = true })
		end,
	})
	local scroll = AppKit.List(body, 6)

	local function render()
		for _, c in ipairs(scroll:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local order = 0
		local group = PhoneState.Group
		if group then
			order += 1
			local t = PhoneState.Threads["g_" .. group.Id]
			AppKit.Row(scroll, {
				Order = order,
				Icon = "👪",
				Color = Theme.Colors.AccentAlt,
				Title = group.Name,
				Subtitle = t and t.Last and (tostring(t.Last.FromName) .. ": " .. tostring(t.Last.Text)) or "Group chat",
				Right = t and t.Last and AppKit.TimeAgo(t.Last.Time) or "",
				Badge = t and t.Unread or 0,
				OnClick = function()
					ctx.Open("Messages", { Group = true })
				end,
			})
		end
		local threads = PhoneState.SortedThreads()
		for _, t in ipairs(threads) do
			if not (group and t.Id == "g_" .. group.Id) and not (t.Kind == "group" and not group) then
				order += 1
				local online = t.UserId and Players:GetPlayerByUserId(t.UserId)
				local name = online and AppKit.PlayerName(online) or t.Name
				local preview = ""
				if t.Last then
					preview = (t.Last.From == localPlayer.UserId and "You: " or "") .. tostring(t.Last.Text)
				end
				AppKit.Row(scroll, {
					Order = order,
					UserId = t.Kind == "dm" and t.UserId or nil,
					Icon = t.Kind == "dm" and string.upper(string.sub(name, 1, 1)) or KIND_ICONS[t.Kind] or "💬",
					Color = t.Kind == "system" and Theme.Colors.Warning or Theme.Colors.Accent,
					Title = name .. ((t.Kind == "dm" and not online) and "  · offline" or ""),
					Subtitle = preview,
					Right = t.Last and AppKit.TimeAgo(t.Last.Time) or "",
					Badge = t.Unread or 0,
					OnClick = function()
						ctx.Open("Messages", { ThreadId = t.Id })
					end,
				})
			end
		end
		if order == 0 then
			AppKit.Empty(scroll, "No messages yet.\nTap ✏️ to text someone in this server!", 1)
		end
	end

	render()
	ctx.Maid:Give(PhoneState.Changed:Connect(function(kind)
		if kind == "Threads" or kind == "Unread" or kind == "Group" then
			render()
		end
	end))
	task.spawn(function()
		PhoneState.FetchThreads()
	end)
end

---------------------------------------------------------------------------
-- Player picker
---------------------------------------------------------------------------
local function buildPicker(container: Frame, ctx)
	local body = AppKit.Page(container, "New message", ctx)
	local scroll = AppKit.List(body, 6)
	local function render()
		for _, c in ipairs(scroll:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local others = {}
		for _, p in ipairs(Players:GetPlayers()) do
			if p ~= localPlayer and not PhoneState.IsHidden(p.UserId) then
				table.insert(others, p)
			end
		end
		table.sort(others, function(a, b)
			return AppKit.PlayerName(a):lower() < AppKit.PlayerName(b):lower()
		end)
		if PhoneState.Group then
			AppKit.Row(scroll, {
				Order = 0,
				Icon = "👪",
				Color = Theme.Colors.AccentAlt,
				Title = PhoneState.Group.Name,
				Subtitle = "Group chat",
				OnClick = function()
					ctx.Replace("Messages", { Group = true })
				end,
			})
		end
		for i, p in ipairs(others) do
			AppKit.Row(scroll, {
				Order = i,
				UserId = p.UserId,
				Icon = string.upper(string.sub(p.DisplayName, 1, 1)),
				Title = AppKit.PlayerName(p),
				Subtitle = "@" .. p.Name,
				OnClick = function()
					ctx.Replace("Messages", { UserId = p.UserId })
				end,
			})
		end
		if #others == 0 then
			AppKit.Empty(scroll, "Nobody else is in this server right now.", 99)
		end
	end
	render()
	ctx.Maid:Give(Players.PlayerAdded:Connect(render))
	ctx.Maid:Give(Players.PlayerRemoving:Connect(function()
		task.defer(render)
	end))
end

---------------------------------------------------------------------------
-- Chat view
---------------------------------------------------------------------------
local function bubble(parent: Instance, msg, mine: boolean, showName: boolean, order: number)
	local text = tostring(msg.Text)
	local size = TextService:GetTextSize(text, 14, Theme.Font, Vector2.new(BUBBLE_MAX, 10000))
	local holder = Kit.new("Frame", {
		LayoutOrder = order,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, size.Y + 18 + (showName and 16 or 0)),
		Parent = parent,
	})
	if showName then
		Kit.Label(tostring(msg.FromName), {
			TextSize = 11,
			Font = Theme.FontBold,
			TextColor3 = Theme.Colors.TextDim,
			Position = UDim2.fromOffset(mine and 0 or 8, 0),
			Size = UDim2.new(1, -16, 0, 14),
			AutomaticSize = Enum.AutomaticSize.None,
			TextXAlignment = mine and Enum.TextXAlignment.Right or Enum.TextXAlignment.Left,
			RichText = false,
			Parent = holder,
		})
	end
	local b = Kit.new("Frame", {
		AnchorPoint = Vector2.new(mine and 1 or 0, 0),
		Position = UDim2.new(mine and 1 or 0, mine and -4 or 4, 0, showName and 16 or 0),
		Size = UDim2.fromOffset(math.ceil(size.X) + 22, math.ceil(size.Y) + 14),
		BackgroundColor3 = mine and Theme.Colors.Accent or Theme.Colors.SurfaceAlt,
		Parent = holder,
	})
	Kit.Corner(b, UDim.new(0, 14))
	Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(11, 7),
		Size = UDim2.new(1, -22, 1, -14),
		Text = text,
		TextWrapped = true,
		RichText = false,
		TextSize = 14,
		Font = Theme.Font,
		TextColor3 = Theme.Colors.Text,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		Parent = b,
	})
	local s = Kit.new("UIScale", { Scale = 0.85, Parent = b })
	Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
	return holder
end

local function buildChat(container: Frame, data, ctx)
	local threadId: string
	local targetUserId: number? = nil
	local isGroup = false
	if data.Group then
		local group = PhoneState.Group
		if not group then
			local body = AppKit.Page(container, "Group chat", ctx)
			AppKit.Empty(body, "You're not in a group. Create one in the Profile app!", 1)
			return
		end
		threadId = "g_" .. group.Id
		isGroup = true
	elseif type(data.UserId) == "number" then
		targetUserId = data.UserId
		threadId = "u_" .. tostring(data.UserId)
	else
		threadId = tostring(data.ThreadId)
		local uid = threadId:match("^u_(%d+)$")
		if uid then
			targetUserId = tonumber(uid)
		elseif threadId:sub(1, 2) == "g_" then
			isGroup = true
		end
	end

	local thread = PhoneState.Threads[threadId]
	local isSystem = threadId:sub(1, 2) == "s_" or (thread and thread.Kind == "system")
	local targetPlayer = targetUserId and Players:GetPlayerByUserId(targetUserId) or nil
	local title
	if isGroup then
		title = "👪 " .. (PhoneState.Group and PhoneState.Group.Name or (thread and thread.Name) or "Group")
	elseif targetPlayer then
		title = AppKit.PlayerName(targetPlayer)
	else
		title = thread and thread.Name or "Messages"
	end
	local subtitle = nil
	if targetUserId then
		subtitle = targetPlayer and ("@" .. targetPlayer.Name) or "Not in this server"
	elseif isGroup and PhoneState.Group then
		subtitle = ("%d members"):format(#(PhoneState.Group.Members or {}))
	end

	local Phone = ctx.Phone
	local body = AppKit.Page(container, title, ctx, {
		Subtitle = subtitle,
		RightIcon = targetUserId and "⋯" or nil,
		OnRight = targetUserId and function()
			local mod = ctx.Find("ModerationController")
			if mod and mod.OpenPlayer then
				Phone:Close()
				mod:OpenPlayer(targetUserId)
			end
		end or nil,
	})

	local INPUT_H = isSystem and 0 or 56
	local scroll = Kit.Scroll({
		Size = UDim2.new(1, 0, 1, -INPUT_H),
		Parent = body,
	}, 4)
	for _, c in ipairs(scroll:GetChildren()) do
		if c:IsA("UIPadding") then
			c:Destroy()
		end
	end
	Kit.new("UIPadding", {
		PaddingLeft = UDim.new(0, 6),
		PaddingRight = UDim.new(0, 6),
		PaddingTop = UDim.new(0, 8),
		PaddingBottom = UDim.new(0, 8),
		Parent = scroll,
	})

	local rendered: { [number]: boolean } = {}
	local order = 0
	local lastFrom: number? = nil

	local function scrollToBottom()
		task.defer(function()
			if scroll.Parent then
				scroll.CanvasPosition = Vector2.new(0, math.max(0, scroll.AbsoluteCanvasSize.Y - scroll.AbsoluteWindowSize.Y))
			end
		end)
	end

	local function addMessage(msg)
		if rendered[msg.Id] then
			return
		end
		if msg.From ~= localPlayer.UserId and PhoneState.IsHidden(msg.From) then
			return
		end
		rendered[msg.Id] = true
		order += 1
		local mine = msg.From == localPlayer.UserId
		local showName = (isGroup and not mine and lastFrom ~= msg.From)
		lastFrom = msg.From
		bubble(scroll, msg, mine, showName, order)
	end

	local emptyLabel: TextLabel? = nil
	local function renderAll()
		local t = PhoneState.Threads[threadId]
		local msgs = t and t.Messages
		if msgs then
			for _, m in ipairs(msgs) do
				addMessage(m)
			end
		end
		if order == 0 and not emptyLabel then
			emptyLabel = AppKit.Empty(scroll, isSystem and "No notifications yet." or "Say hi! 👋", 0)
		elseif order > 0 and emptyLabel then
			emptyLabel:Destroy()
			emptyLabel = nil
		end
		scrollToBottom()
	end

	PhoneState.SetViewing(threadId)
	ctx.Maid:Give(function()
		PhoneState.SetViewing(nil)
	end)
	renderAll()
	ctx.Maid:Give(PhoneState.Changed:Connect(function(kind, id)
		if kind == "Thread" and id == threadId then
			renderAll()
			PhoneState.MarkRead(threadId)
		end
	end))
	task.spawn(function()
		PhoneState.FetchThread(threadId)
		renderAll()
	end)

	if isSystem then
		return
	end

	-- input bar
	local bar = Kit.new("Frame", {
		Name = "InputBar",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.fromScale(0, 1),
		Size = UDim2.new(1, 0, 0, INPUT_H),
		BackgroundColor3 = Theme.Colors.Background,
		BackgroundTransparency = 0.05,
		Parent = body,
	})
	local canSend = isGroup or targetPlayer ~= nil
	local box = Kit.TextBox(canSend and "Message…" or "They're not in this server", {
		Position = UDim2.fromOffset(8, 6),
		Size = UDim2.new(1, -66, 0, 44),
		TextSize = 14,
		TextEditable = canSend,
		ClearTextOnFocus = false,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = bar,
	})
	local sending = false
	local function send()
		if sending or not canSend then
			return
		end
		local text = box.Text
		if text:gsub("%s", "") == "" then
			return
		end
		if utf8.len(text) and (utf8.len(text) :: number) > PhoneConfig.Messages.MaxLength then
			Router.Notify(("Messages are up to %d characters"):format(PhoneConfig.Messages.MaxLength), "warning")
			return
		end
		sending = true
		local payload = isGroup and { Group = true, Text = text } or { ToUserId = targetUserId, Text = text }
		local res = Net.Invoke("Phone", "SendMessage", payload)
		sending = false
		if res.ok then
			box.Text = ""
			PhoneState.AddOwnMessage(res.Thread, res.Message)
		else
			Router.Notify(res.err or "Couldn't send", "error")
		end
	end
	local sendBtn = Kit.Button("➤", "primary", send, {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -8, 0, 6),
		Size = UDim2.fromOffset(48, 44),
		TextSize = 20,
		Parent = bar,
	})
	if not canSend then
		sendBtn.AutoButtonColor = false
		sendBtn.BackgroundColor3 = Theme.Colors.Stroke
	end
	ctx.Maid:Give(box.FocusLost:Connect(function(enter)
		if enter then
			task.spawn(send)
		end
	end))
end

function Messages.Build(container: Frame, data: any, ctx)
	local d = type(data) == "table" and data or {}
	if d.Picker then
		buildPicker(container, ctx)
	elseif d.ThreadId or d.UserId or d.Group then
		buildChat(container, d, ctx)
	else
		buildList(container, ctx)
	end
	return nil
end

return Messages
