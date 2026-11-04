-- Skyline Feed app (phone): server-wide text posts with likes + system posts (new millionaires, parties…).
-- Posts are filtered by the server; posts from blocked / muted players are hidden locally.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local PhoneConfig = require(Shared.Config.Phone)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local AppKit = require(script.Parent:WaitForChild("AppKit"))
local PhoneState = require(script.Parent:WaitForChild("PhoneState"))

local FeedApp = {}

local MAX = PhoneConfig.Feed.MaxLength

local function postCard(parent: Instance, post, order: number)
	local system = post.System == true
	local card = Kit.new("Frame", {
		LayoutOrder = order,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = system and Color3.fromRGB(34, 40, 66) or Theme.Colors.Surface,
		BackgroundTransparency = 0.05,
		Parent = parent,
	})
	Kit.Corner(card, Theme.CornerSmall)
	if system then
		Kit.Stroke(card, Theme.Colors.Accent, 1.5, 0.2)
	end
	Kit.new("UIPadding", {
		PaddingTop = UDim.new(0, 10),
		PaddingBottom = UDim.new(0, 6),
		PaddingLeft = UDim.new(0, 10),
		PaddingRight = UDim.new(0, 10),
		Parent = card,
	})
	Kit.List(card, 4)

	local head = Kit.new("Frame", { LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 32), BackgroundTransparency = 1, Parent = card })
	local name = tostring(post.AuthorName or "?")
	local av = AppKit.Avatar(head, (not system) and post.AuthorId or nil, system and "📣" or string.upper(string.sub(name, 1, 1)), system and Theme.Colors.Accent or Theme.Colors.AccentAlt, 32)
	av.Position = UDim2.fromOffset(0, 0)
	Kit.Label(name, {
		Font = Theme.FontBold,
		TextSize = 14,
		Position = UDim2.fromOffset(40, 0),
		Size = UDim2.new(1, -90, 0, 32),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextWrapped = false,
		RichText = false,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = head,
	})
	Kit.Label(AppKit.TimeAgo(post.Time), {
		TextSize = 12,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Right,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.fromOffset(46, 32),
		AutomaticSize = Enum.AutomaticSize.None,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = head,
	})

	Kit.Label(tostring(post.Text or ""), {
		LayoutOrder = 2,
		TextSize = 14,
		RichText = false,
		Parent = card,
	})

	local foot = Kit.new("Frame", { LayoutOrder = 3, Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Parent = card })
	local likeBtn = Kit.new("TextButton", {
		Size = UDim2.fromOffset(84, 44),
		BackgroundTransparency = 1,
		Text = ("%s %d"):format(post.Liked and "❤️" or "🤍", post.Likes or 0),
		TextSize = 15,
		Font = Theme.FontBold,
		TextColor3 = post.Liked and Theme.Colors.Danger or Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = foot,
	})
	Kit.Ripple(likeBtn)
	local busy = false
	likeBtn.Activated:Connect(function()
		if busy then
			return
		end
		busy = true
		local res = Net.Invoke("Phone", "LikePost", { Id = post.Id })
		busy = false
		if res.ok then
			PhoneState.SetPostLiked(post.Id, res.Liked == true, tonumber(res.Likes) or 0)
		else
			Router.Notify(res.err or "Couldn't like that", "error")
		end
	end)
	return card
end

function FeedApp.Build(container: Frame, _data: any, ctx)
	local body = AppKit.Page(container, "Skyline Feed", ctx, {
		RightIcon = "🔄",
		OnRight = function()
			PhoneState.FetchFeed()
		end,
	})
	PhoneState.SetFeedOpen(true)
	ctx.Maid:Give(function()
		PhoneState.SetFeedOpen(false)
	end)

	local scroll = AppKit.List(body, 8)

	-- composer
	local composer = Kit.new("Frame", {
		LayoutOrder = 0,
		Size = UDim2.new(1, 0, 0, 110),
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = scroll,
	})
	Kit.Corner(composer, Theme.CornerSmall)
	local box = Kit.TextBox("What's happening in Skyline City?", {
		Position = UDim2.fromOffset(8, 8),
		Size = UDim2.new(1, -16, 0, 44),
		TextSize = 14,
		MultiLine = false,
		TextWrapped = true,
		ClearTextOnFocus = false,
		Parent = composer,
	})
	local counter = Kit.Label(("0/%d"):format(MAX), {
		TextSize = 12,
		TextColor3 = Theme.Colors.TextDim,
		Position = UDim2.new(0, 10, 1, -46),
		Size = UDim2.fromOffset(80, 36),
		AutomaticSize = Enum.AutomaticSize.None,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = composer,
	})
	ctx.Maid:Give(box:GetPropertyChangedSignal("Text"):Connect(function()
		local n = utf8.len(box.Text) or #box.Text
		counter.Text = ("%d/%d"):format(n, MAX)
		counter.TextColor3 = n > MAX and Theme.Colors.Danger or Theme.Colors.TextDim
	end))
	local function post()
		local text = box.Text
		if text:gsub("%s", "") == "" then
			return
		end
		if (utf8.len(text) or #text) > MAX then
			Router.Notify(("Posts are up to %d characters"):format(MAX), "warning")
			return
		end
		local res = Net.Invoke("Phone", "PostFeed", { Text = text })
		if res.ok then
			box.Text = ""
			Router.Notify("📰 Posted to Skyline Feed!", "success", 2)
		else
			Router.Notify(res.err or "Couldn't post", "error")
		end
	end
	Kit.Button("Post", "primary", post, {
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -8, 1, -8),
		Size = UDim2.fromOffset(90, 44),
		Parent = composer,
	})

	local listHolder = Kit.new("Frame", {
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Parent = scroll,
	})
	Kit.List(listHolder, 8)

	local pending = false
	local function render()
		pending = false
		for _, c in ipairs(listHolder:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local shown = 0
		for i, p in ipairs(PhoneState.Feed) do
			if p.System or not PhoneState.IsHidden(p.AuthorId) then
				shown += 1
				postCard(listHolder, p, i)
			end
		end
		if shown == 0 then
			AppKit.Empty(listHolder, PhoneState.FeedLoaded and "No posts yet. Be the first!" or "Loading…", 1)
		end
	end
	local function queueRender()
		if not pending then
			pending = true
			task.defer(render)
		end
	end
	render()
	ctx.Maid:Give(PhoneState.Changed:Connect(function(kind)
		if kind == "Feed" then
			queueRender()
		end
	end))
	task.spawn(PhoneState.FetchFeed)
	return nil
end

return FeedApp
