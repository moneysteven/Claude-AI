-- AppKit (PhoneController helper): small widgets shared by the phone apps.
--
--   AppKit.Page(container, title, ctx, opts?) -> body: Frame      header with back button (+ optional right button)
--        opts = { RightIcon = "✏️", OnRight = fn, Subtitle = "..." }
--   AppKit.Row(parent, opts) -> TextButton     opts = { Icon, Title, Subtitle, Right, Badge, Order, OnClick, Color, UserId }
--   AppKit.Avatar(parent, userId?, fallback, color?, size?) -> Frame
--   AppKit.Section(parent, text, order) -> TextLabel
--   AppKit.Empty(parent, text, order?) -> TextLabel
--   AppKit.Badge(parent, count) -> Frame?          red unread dot in the top-right corner
--   AppKit.SmallButton(text, style, onClick, props?) -> TextButton   (44px tall)
--   AppKit.PlayerName(player) -> string             RP name or DisplayName
--   AppKit.Escape(text) -> string                   escape for RichText
--   AppKit.TimeAgo(unix) -> string
--   AppKit.TierColor(tierId) -> Color3

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Economy = require(Shared.Config.Economy)

local Client = script.Parent.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local AppKit = {}

AppKit.HeaderHeight = 48
AppKit.TextSize = 15
AppKit.SmallText = 12

function AppKit.Escape(text: string): string
	return (
		tostring(text)
			:gsub("&", "&amp;")
			:gsub("<", "&lt;")
			:gsub(">", "&gt;")
			:gsub('"', "&quot;")
			:gsub("'", "&apos;")
	)
end

function AppKit.PlayerName(p: Player?): string
	if not p then
		return "Unknown"
	end
	local rp = p:GetAttribute("RPName")
	if type(rp) == "string" and rp ~= "" then
		return rp
	end
	return p.DisplayName
end

function AppKit.TierColor(tierId: any): Color3
	for _, t in ipairs(Economy.WealthTiers) do
		if t.Id == tierId then
			return t.Color
		end
	end
	return Economy.WealthTiers[1].Color
end

function AppKit.TimeAgo(unix: number?): string
	if type(unix) ~= "number" then
		return ""
	end
	local d = math.max(0, os.time() - unix)
	if d < 45 then
		return "now"
	elseif d < 3600 then
		return ("%dm"):format(math.max(1, d // 60))
	elseif d < 86400 then
		return ("%dh"):format(d // 3600)
	end
	return ("%dd"):format(d // 86400)
end

function AppKit.Section(parent: Instance, text: string, order: number): TextLabel
	return Kit.Label(text:upper(), {
		LayoutOrder = order,
		Font = Theme.FontBold,
		TextSize = AppKit.SmallText,
		TextColor3 = Theme.Colors.TextDim,
		Size = UDim2.new(1, 0, 0, 18),
		Parent = parent,
	})
end

function AppKit.Empty(parent: Instance, text: string, order: number?): TextLabel
	return Kit.Label(text, {
		LayoutOrder = order or 999,
		TextSize = AppKit.TextSize - 1,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 40),
		Parent = parent,
	})
end

function AppKit.Badge(parent: GuiObject, count: number): Frame?
	local old = parent:FindFirstChild("Badge")
	if old then
		old:Destroy()
	end
	if not count or count <= 0 then
		return nil
	end
	local badge = Kit.new("Frame", {
		Name = "Badge",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(1, -4, 0, 4),
		Size = UDim2.fromOffset(20, 20),
		BackgroundColor3 = Theme.Colors.Danger,
		ZIndex = 5,
		Parent = parent,
	})
	Kit.Corner(badge, UDim.new(1, 0))
	Kit.Stroke(badge, Color3.new(1, 1, 1), 1.5, 0)
	Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Text = count > 99 and "99+" or tostring(count),
		TextSize = 11,
		Font = Theme.FontBold,
		TextColor3 = Color3.new(1, 1, 1),
		ZIndex = 6,
		Parent = badge,
	})
	local s = Kit.new("UIScale", { Scale = 0.4, Parent = badge })
	Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
	return badge
end

function AppKit.Avatar(parent: Instance, userId: number?, fallback: string, color: Color3?, size: number?): Frame
	local px = size or 40
	local frame = Kit.new("Frame", {
		Name = "Avatar",
		Size = UDim2.fromOffset(px, px),
		BackgroundColor3 = color or Theme.Colors.Accent,
		Parent = parent,
	})
	Kit.Corner(frame, UDim.new(1, 0))
	Kit.new("TextLabel", {
		Name = "Fallback",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Text = fallback,
		TextScaled = true,
		Font = Theme.FontBold,
		TextColor3 = Color3.new(1, 1, 1),
		Parent = frame,
	})
	Kit.new("UIPadding", {
		PaddingTop = UDim.new(0.18, 0),
		PaddingBottom = UDim.new(0.18, 0),
		PaddingLeft = UDim.new(0.18, 0),
		PaddingRight = UDim.new(0.18, 0),
		Parent = frame:FindFirstChild("Fallback"),
	})
	if userId and userId > 0 then
		task.spawn(function()
			local ok, content = pcall(function()
				return Players:GetUserThumbnailAsync(userId, Enum.ThumbnailType.HeadShot, Enum.ThumbnailSize.Size100x100)
			end)
			if ok and type(content) == "string" and frame.Parent then
				local img = Kit.new("ImageLabel", {
					BackgroundTransparency = 1,
					Size = UDim2.fromScale(1, 1),
					Image = content,
					ImageTransparency = 1,
					Parent = frame,
				})
				Kit.Corner(img, UDim.new(1, 0))
				Kit.Tween(img, { ImageTransparency = 0 }, Theme.Tween.Normal)
				local fb = frame:FindFirstChild("Fallback")
				if fb then
					(fb :: TextLabel).TextTransparency = 1
				end
			end
		end)
	end
	return frame
end

function AppKit.SmallButton(text: string, style: string?, onClick: (() -> ())?, props: { [string]: any }?)
	local base = {
		Size = UDim2.fromOffset(44, 44),
		TextSize = 18,
	}
	if props then
		for k, v in pairs(props) do
			base[k] = v
		end
	end
	return Kit.Button(text, style or "secondary", onClick, base)
end

function AppKit.Row(parent: Instance, opts: { [string]: any }): TextButton
	local row = Kit.new("TextButton", {
		Name = opts.Name or "Row",
		Text = "",
		AutoButtonColor = opts.OnClick ~= nil,
		LayoutOrder = opts.Order or 0,
		Size = UDim2.new(1, 0, 0, opts.Height or 58),
		BackgroundColor3 = opts.Background or Theme.Colors.Surface,
		BackgroundTransparency = opts.BackgroundTransparency or 0.15,
		Selectable = opts.OnClick ~= nil,
		Parent = parent,
	})
	Kit.Corner(row, Theme.CornerSmall)
	local rightWidth = opts.RightWidth or 0
	if opts.UserId ~= nil or opts.Icon then
		local av = AppKit.Avatar(row, opts.UserId, opts.Icon or "?", opts.Color, 40)
		av.Position = UDim2.new(0, 8, 0.5, -20)
	end
	local textX = (opts.UserId ~= nil or opts.Icon) and 56 or 12
	Kit.Label(opts.Title or "", {
		Name = "Title",
		Font = Theme.FontBold,
		TextSize = AppKit.TextSize,
		Position = UDim2.fromOffset(textX, opts.Subtitle and 9 or 0),
		Size = UDim2.new(1, -(textX + 10 + rightWidth), 0, opts.Subtitle and 20 or (opts.Height or 58)),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextWrapped = false,
		RichText = opts.RichTitle == true,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = row,
	})
	if opts.Subtitle then
		Kit.Label(opts.Subtitle, {
			Name = "Subtitle",
			TextSize = AppKit.SmallText,
			TextColor3 = Theme.Colors.TextDim,
			Position = UDim2.fromOffset(textX, 30),
			Size = UDim2.new(1, -(textX + 10 + rightWidth), 0, 18),
			AutomaticSize = Enum.AutomaticSize.None,
			TextTruncate = Enum.TextTruncate.AtEnd,
			TextWrapped = false,
			RichText = false,
			Parent = row,
		})
	end
	if opts.Right then
		Kit.Label(opts.Right, {
			Name = "Right",
			RichText = false,
			TextSize = AppKit.SmallText,
			TextColor3 = Theme.Colors.TextDim,
			TextXAlignment = Enum.TextXAlignment.Right,
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, -10, 0, 8),
			Size = UDim2.fromOffset(60, 18),
			AutomaticSize = Enum.AutomaticSize.None,
			Parent = row,
		})
	end
	if opts.Badge and opts.Badge > 0 then
		local holder = Kit.new("Frame", {
			BackgroundTransparency = 1,
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, -2, 0, 22),
			Size = UDim2.fromOffset(24, 24),
			Parent = row,
		})
		AppKit.Badge(holder, opts.Badge)
	end
	if opts.OnClick then
		Kit.Ripple(row)
		row.Activated:Connect(function()
			task.spawn(opts.OnClick)
		end)
	end
	return row
end

-- Standard app page: header (back + title + optional right button) and a body frame filling the rest.
function AppKit.Page(container: Frame, title: string, ctx, opts: { [string]: any }?): Frame
	local o = opts or {}
	local header = Kit.new("Frame", {
		Name = "Header",
		Size = UDim2.new(1, 0, 0, AppKit.HeaderHeight),
		BackgroundColor3 = Theme.Colors.Background,
		BackgroundTransparency = 0.05,
		ZIndex = 3,
		Parent = container,
	})
	local back = Kit.IconButton("‹", function()
		ctx.Back()
	end, {
		Name = "Back",
		Size = UDim2.fromOffset(44, 44),
		Position = UDim2.new(0, 2, 0.5, -22),
		BackgroundTransparency = 1,
		TextSize = 30,
		ZIndex = 4,
		Parent = header,
	})
	back.Font = Theme.FontBold
	Kit.Label(title, {
		Name = "Title",
		Font = Theme.FontBold,
		TextSize = 17,
		TextXAlignment = Enum.TextXAlignment.Center,
		Position = UDim2.fromOffset(48, o.Subtitle and 4 or 0),
		Size = UDim2.new(1, -96, 0, o.Subtitle and 24 or AppKit.HeaderHeight),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextWrapped = false,
		RichText = false, -- titles carry player-written names
		TextYAlignment = Enum.TextYAlignment.Center,
		ZIndex = 4,
		Parent = header,
	})
	if o.Subtitle then
		Kit.Label(o.Subtitle, {
			Name = "Subtitle",
			TextSize = 11,
			TextColor3 = Theme.Colors.TextDim,
			TextXAlignment = Enum.TextXAlignment.Center,
			Position = UDim2.fromOffset(48, 27),
			Size = UDim2.new(1, -96, 0, 16),
			AutomaticSize = Enum.AutomaticSize.None,
			RichText = false,
			ZIndex = 4,
			Parent = header,
		})
	end
	if o.RightIcon and o.OnRight then
		Kit.IconButton(o.RightIcon, o.OnRight, {
			Name = "RightButton",
			Size = UDim2.fromOffset(44, 44),
			Position = UDim2.new(1, -46, 0.5, -22),
			BackgroundTransparency = 1,
			TextSize = 20,
			ZIndex = 4,
			Parent = header,
		})
	end
	local body = Kit.new("Frame", {
		Name = "Body",
		Position = UDim2.fromOffset(0, AppKit.HeaderHeight),
		Size = UDim2.new(1, 0, 1, -AppKit.HeaderHeight),
		BackgroundTransparency = 1,
		ClipsDescendants = true,
		Parent = container,
	})
	return body
end

-- Scrolling list inside a page body with phone-sized padding.
function AppKit.List(body: Instance, padding: number?): ScrollingFrame
	local scroll = Kit.Scroll({ Parent = body }, padding or 6)
	Kit.new("UIPadding", {
		PaddingLeft = UDim.new(0, 10),
		PaddingRight = UDim.new(0, 10),
		PaddingTop = UDim.new(0, 8),
		PaddingBottom = UDim.new(0, 12),
		Parent = scroll,
	})
	-- Kit.Scroll adds its own UIPadding; keep only ours
	for _, c in ipairs(scroll:GetChildren()) do
		if c:IsA("UIPadding") and c.PaddingLeft.Offset ~= 10 then
			c:Destroy()
		end
	end
	return scroll
end

return AppKit
