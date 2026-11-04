-- Profile app (phone): RP name + bio, wealth title, family / friend group (create, invite, chat, leave),
-- pending group invites, and hosting a party at your location.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local SocialConfig = require(Shared.Config.Social)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local AppKit = require(script.Parent:WaitForChild("AppKit"))
local PhoneState = require(script.Parent:WaitForChild("PhoneState"))

local ProfileApp = {}

local localPlayer = Players.LocalPlayer

local function fieldRow(parent: Instance, order: number, placeholder: string, value: string, maxChars: number, onSave: (string) -> ())
	local row = Kit.new("Frame", {
		LayoutOrder = order,
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	local box = Kit.TextBox(placeholder, {
		Text = value,
		Size = UDim2.new(1, -78, 1, 0),
		TextSize = 14,
		ClearTextOnFocus = false,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = row,
	})
	box:GetPropertyChangedSignal("Text"):Connect(function()
		local n = utf8.len(box.Text) or #box.Text
		if n > maxChars then
			box.TextColor3 = Theme.Colors.Danger
		else
			box.TextColor3 = Theme.Colors.Text
		end
	end)
	Kit.Button("Save", "primary", function()
		onSave(box.Text)
	end, {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.fromOffset(70, 44),
		TextSize = 14,
		Parent = row,
	})
	return box
end

local function pickPlayer(ctx, title: string, filter: (Player) -> boolean): Player?
	-- simple modal list built on Router.Confirm-like overlay
	local layer = Router.GetLayer("Modal")
	local done = false
	local chosen: Player? = nil
	local overlay = Kit.new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Colors.Overlay,
		BackgroundTransparency = 0.45,
		Parent = layer,
	})
	local box = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.9, 0, 0.7, 0),
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = overlay,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(380, 480), Parent = box })
	Kit.Corner(box)
	Kit.Stroke(box)
	Kit.Label(title, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		Position = UDim2.fromOffset(16, 12),
		Size = UDim2.new(1, -32, 0, 28),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		RichText = false,
		Parent = box,
	})
	local list = Kit.Scroll({ Position = UDim2.fromOffset(12, 48), Size = UDim2.new(1, -24, 1, -112), Parent = box }, 6)
	local count = 0
	for _, p in ipairs(Players:GetPlayers()) do
		if p ~= localPlayer and filter(p) then
			count += 1
			AppKit.Row(list, {
				Order = count,
				UserId = p.UserId,
				Icon = string.upper(string.sub(p.DisplayName, 1, 1)),
				Title = AppKit.PlayerName(p),
				Subtitle = "@" .. p.Name,
				OnClick = function()
					chosen = p
					done = true
				end,
			})
		end
	end
	if count == 0 then
		AppKit.Empty(list, "Nobody to pick right now.", 1)
	end
	Kit.Button("Cancel", "secondary", function()
		done = true
	end, {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -12),
		Size = UDim2.new(1, -24, 0, 44),
		Parent = box,
	})
	ctx.Maid:Give(overlay)
	local s = Kit.new("UIScale", { Scale = 0.85, Parent = box })
	Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
	while not done and overlay.Parent do
		task.wait()
	end
	if overlay.Parent then
		overlay:Destroy()
	end
	return chosen
end

function ProfileApp.Build(container: Frame, _data: any, ctx)
	local body = AppKit.Page(container, "Profile", ctx)
	local scroll = AppKit.List(body, 8)

	-- identity card
	local card = Kit.new("Frame", {
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 0, 84),
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = scroll,
	})
	Kit.Corner(card, Theme.CornerSmall)
	local av = AppKit.Avatar(card, localPlayer.UserId, string.upper(string.sub(localPlayer.DisplayName, 1, 1)), Theme.Colors.Accent, 64)
	av.Position = UDim2.fromOffset(10, 10)
	local nameLabel = Kit.Label("", {
		Font = Theme.FontBold,
		TextSize = 16,
		Position = UDim2.fromOffset(84, 12),
		Size = UDim2.new(1, -94, 0, 22),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		RichText = false,
		Parent = card,
	})
	Kit.Label("@" .. localPlayer.Name, {
		TextSize = 12,
		TextColor3 = Theme.Colors.TextDim,
		Position = UDim2.fromOffset(84, 34),
		Size = UDim2.new(1, -94, 0, 16),
		AutomaticSize = Enum.AutomaticSize.None,
		RichText = false,
		Parent = card,
	})
	local chip = Kit.new("TextLabel", {
		Position = UDim2.fromOffset(84, 54),
		Size = UDim2.fromOffset(0, 22),
		AutomaticSize = Enum.AutomaticSize.X,
		Font = Theme.FontBold,
		TextSize = 12,
		Text = "",
		Parent = card,
	})
	Kit.Corner(chip, UDim.new(1, 0))
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), Parent = chip })
	local function refreshCard()
		nameLabel.Text = AppKit.PlayerName(localPlayer)
		local title = localPlayer:GetAttribute("WealthTitle")
		local tier = localPlayer:GetAttribute("WealthTier")
		chip.Text = (localPlayer:GetAttribute("VIP") == true and "⭐ VIP · " or "") .. ((type(title) == "string" and title ~= "") and title or "Citizen")
		local color = AppKit.TierColor(tier)
		chip.BackgroundColor3 = color
		chip.TextColor3 = (color.R * 0.299 + color.G * 0.587 + color.B * 0.114) > 0.6 and Color3.fromRGB(25, 25, 30) or Color3.new(1, 1, 1)
	end
	refreshCard()
	for _, attr in ipairs({ "RPName", "WealthTitle", "WealthTier", "VIP" }) do
		ctx.Maid:Give(localPlayer:GetAttributeChangedSignal(attr):Connect(refreshCard))
	end

	-- RP name + bio
	AppKit.Section(scroll, "Roleplay name", 2)
	fieldRow(scroll, 3, ("Your RP name (max %d)"):format(SocialConfig.Profile.RPNameMax), tostring(ClientData.Get("Social.RPName") or ""), SocialConfig.Profile.RPNameMax, function(text)
		local res = Net.Invoke("Social", "SetRPName", { Name = text })
		Router.Result(res, res.Name == "" and "RP name cleared" or "🪪 RP name saved")
	end)
	AppKit.Section(scroll, "Bio", 4)
	fieldRow(scroll, 5, ("Short bio (max %d)"):format(SocialConfig.Profile.BioMax), tostring(ClientData.Get("Social.Bio") or ""), SocialConfig.Profile.BioMax, function(text)
		local res = Net.Invoke("Social", "SetBio", { Bio = text })
		Router.Result(res, "📝 Bio saved")
	end)

	-- group + invites + party (re-rendered)
	local dynamic = Kit.new("Frame", {
		LayoutOrder = 10,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Parent = scroll,
	})
	Kit.List(dynamic, 8)

	local function render()
		for _, c in ipairs(dynamic:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local order = 0
		local function nextOrder()
			order += 1
			return order
		end

		-- invites
		local invites = {}
		for _, inv in pairs(PhoneState.Invites) do
			table.insert(invites, inv)
		end
		if #invites > 0 then
			AppKit.Section(dynamic, "Group invites", nextOrder())
			for _, inv in ipairs(invites) do
				local row = AppKit.Row(dynamic, {
					Order = nextOrder(),
					Icon = "👪",
					Color = Theme.Colors.AccentAlt,
					Title = tostring(inv.GroupName),
					Subtitle = "From " .. tostring(inv.FromName),
					RightWidth = 2 * 46,
				})
				local holder = Kit.new("Frame", {
					AnchorPoint = Vector2.new(1, 0.5),
					Position = UDim2.new(1, -6, 0.5, 0),
					Size = UDim2.fromOffset(92, 44),
					BackgroundTransparency = 1,
					Parent = row,
				})
				Kit.List(holder, 4, true, Enum.HorizontalAlignment.Right)
				AppKit.SmallButton("✓", "success", function()
					local res = Net.Invoke("Social", "AcceptGroupInvite", { GroupId = inv.GroupId })
					PhoneState.RemoveInvite(inv.GroupId)
					if Router.Result(res, "👪 Joined " .. AppKit.Escape(tostring(inv.GroupName))) and res.Group then
						PhoneState.Group = res.Group
						PhoneState.Changed:Fire("Group")
					end
				end, { LayoutOrder = 1, Parent = holder })
				AppKit.SmallButton("✕", "danger", function()
					Net.Invoke("Social", "DeclineGroupInvite", { GroupId = inv.GroupId })
					PhoneState.RemoveInvite(inv.GroupId)
				end, { LayoutOrder = 2, Parent = holder })
			end
		end

		-- group
		AppKit.Section(dynamic, "Family / friend group", nextOrder())
		local group = PhoneState.Group
		if group then
			AppKit.Row(dynamic, {
				Order = nextOrder(),
				Icon = "👪",
				Color = Theme.Colors.AccentAlt,
				Title = tostring(group.Name),
				Subtitle = ("%d / %d members"):format(#(group.Members or {}), tonumber(group.Max) or 8),
			})
			for _, m in ipairs(group.Members or {}) do
				local row = AppKit.Row(dynamic, {
					Order = nextOrder(),
					UserId = m.UserId,
					Icon = string.upper(string.sub(tostring(m.Name), 1, 1)),
					Title = (m.Leader and "👑 " or "") .. tostring(m.Name),
					Subtitle = "@" .. tostring(m.Username),
					Height = 52,
					RightWidth = group.IsLeader and 50 or 0,
				})
				if group.IsLeader and m.UserId ~= localPlayer.UserId then
					AppKit.SmallButton("✕", "ghost", function()
						if Router.Confirm("Remove member?", ("Remove %s from the group?"):format(AppKit.Escape(tostring(m.Name))), "Remove") then
							Router.Result(Net.Invoke("Social", "KickFromGroup", { UserId = m.UserId }), "Removed from group")
						end
					end, {
						AnchorPoint = Vector2.new(1, 0.5),
						Position = UDim2.new(1, -4, 0.5, 0),
						Parent = row,
					})
				end
			end
			local buttons = Kit.new("Frame", {
				LayoutOrder = nextOrder(),
				Size = UDim2.new(1, 0, 0, 44),
				BackgroundTransparency = 1,
				Parent = dynamic,
			})
			Kit.Button("💬 Chat", "primary", function()
				ctx.Open("Messages", { Group = true })
			end, { Size = UDim2.new(0.5, -4, 1, 0), TextSize = 14, Parent = buttons })
			Kit.Button("➕ Invite", "secondary", function()
				if not group.CanInvite then
					Router.Notify("Only the group leader can invite", "warning")
					return
				end
				local memberIds = {}
				for _, m in ipairs(group.Members or {}) do
					memberIds[m.UserId] = true
				end
				local p = pickPlayer(ctx, "Invite to " .. tostring(group.Name), function(pl)
					return not memberIds[pl.UserId] and not PhoneState.IsHidden(pl.UserId)
				end)
				if p then
					Router.Result(Net.Invoke("Social", "InviteToGroup", { UserId = p.UserId }), "Invite sent to " .. AppKit.Escape(AppKit.PlayerName(p)))
				end
			end, { Size = UDim2.new(0.5, -4, 1, 0), Position = UDim2.new(0.5, 4, 0, 0), TextSize = 14, Parent = buttons })
			Kit.Button("Leave group", "danger", function()
				if Router.Confirm("Leave group?", ("Leave \"%s\"?"):format(AppKit.Escape(tostring(group.Name))), "Leave") then
					local res = Net.Invoke("Social", "LeaveGroup", {})
					if Router.Result(res, "You left the group") then
						PhoneState.Group = nil
						PhoneState.Changed:Fire("Group")
					end
				end
			end, { LayoutOrder = nextOrder(), TextSize = 14, Parent = dynamic })
		else
			local row = Kit.new("Frame", {
				LayoutOrder = nextOrder(),
				Size = UDim2.new(1, 0, 0, 44),
				BackgroundTransparency = 1,
				Parent = dynamic,
			})
			local box = Kit.TextBox(("Group name (e.g. The %s Family)"):format(localPlayer.DisplayName), {
				Size = UDim2.new(1, -86, 1, 0),
				TextSize = 14,
				Parent = row,
			})
			Kit.Button("Create", "success", function()
				local res = Net.Invoke("Social", "CreateGroup", { Name = box.Text })
				if Router.Result(res, "👪 Group created!") and res.Group then
					PhoneState.Group = res.Group
					PhoneState.Changed:Fire("Group")
				end
			end, {
				AnchorPoint = Vector2.new(1, 0),
				Position = UDim2.fromScale(1, 0),
				Size = UDim2.fromOffset(80, 44),
				TextSize = 14,
				Parent = row,
			})
		end

		-- parties
		AppKit.Section(dynamic, "Parties", nextOrder())
		local mine = nil
		local list = {}
		for _, party in pairs(PhoneState.Parties) do
			table.insert(list, party)
			if party.HostUserId == localPlayer.UserId then
				mine = party
			end
		end
		table.sort(list, function(a, b)
			return (a.EndsAt or 0) < (b.EndsAt or 0)
		end)
		for _, party in ipairs(list) do
			local left = math.max(0, (party.EndsAt or os.time()) - os.time())
			AppKit.Row(dynamic, {
				Order = nextOrder(),
				Icon = "🎉",
				Color = Color3.fromRGB(150, 50, 140),
				Title = tostring(party.Name),
				Subtitle = ("%s · %d min left"):format(tostring(party.HostName), math.ceil(left / 60)),
				Right = "GPS ›",
				OnClick = function()
					if typeof(party.Position) == "Vector3" then
						ctx.Phone:SetWaypoint(party.Position, "🎉 " .. tostring(party.Name))
						Router.Notify("🧭 GPS set to the party", "success", 2)
					end
				end,
			})
		end
		if mine then
			Kit.Button("End my party", "danger", function()
				Router.Result(Net.Invoke("Social", "EndParty", {}), "Party ended")
			end, { LayoutOrder = nextOrder(), TextSize = 14, Parent = dynamic })
		else
			local row = Kit.new("Frame", {
				LayoutOrder = nextOrder(),
				Size = UDim2.new(1, 0, 0, 44),
				BackgroundTransparency = 1,
				Parent = dynamic,
			})
			local box = Kit.TextBox("Party name", { Size = UDim2.new(1, -86, 1, 0), TextSize = 14, Parent = row })
			Kit.Button("🎉 Host", "vip", function()
				if not Router.Confirm("Host a party here?", ("Everyone in the server will see it on the map for %d minutes."):format(SocialConfig.Parties.DurationMinutes), "Start party") then
					return
				end
				local res = Net.Invoke("Social", "StartParty", { Name = box.Text })
				if Router.Result(res, "🎉 Your party has started!") and type(res.Party) == "table" then
					PhoneState.Parties[res.Party.Id] = res.Party
					PhoneState.Changed:Fire("Parties")
				end
			end, {
				AnchorPoint = Vector2.new(1, 0),
				Position = UDim2.fromScale(1, 0),
				Size = UDim2.fromOffset(80, 44),
				TextSize = 14,
				Parent = row,
			})
		end
	end

	local pending = false
	local function queue()
		if not pending then
			pending = true
			task.defer(function()
				pending = false
				if dynamic.Parent then
					render()
				end
			end)
		end
	end
	render()
	ctx.Maid:Give(PhoneState.Changed:Connect(function(kind)
		if kind == "Group" or kind == "Invites" or kind == "Parties" then
			queue()
		end
	end))
	task.spawn(function()
		PhoneState.FetchGroup()
		PhoneState.FetchParties()
	end)
	return nil
end

return ProfileApp
