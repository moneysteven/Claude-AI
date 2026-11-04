-- PlayerActionsPanel (ModerationController helper): the "PlayerActions" window for another player.
--   data = { UserId = number }
-- Shows their profile (RP name, @username, bio, wealth title, VIP, job, group) and actions:
--   💬 Message · 📞 Call · ⭐ Add / edit contact · 👪 Invite to group · 🔇 Mute (local) · 🚫 Block · 🚩 Report
--
--   PlayerActionsPanel.Build(content, data, ctx, moderation) -> cleanup?

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local SocialConfig = require(Shared.Config.Social)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Registry = require(Client:WaitForChild("Registry"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local PhoneFolder = script.Parent.Parent:WaitForChild("Phone")
local AppKit = require(PhoneFolder:WaitForChild("AppKit"))
local Contacts = require(PhoneFolder:WaitForChild("Contacts"))

local PlayerActionsPanel = {}

local CATEGORIES = SocialConfig.Moderation.ReportCategories
local CATEGORY_ICONS = {
	Bullying = "😠",
	Scamming = "💸",
	Exploiting = "🛠️",
	Inappropriate = "🔞",
	Other = "❓",
}

-- Config.Jobs is optional (jobs system); used for the job chip icon.
local function jobText(jobId: string): string
	local config = Shared:FindFirstChild("Config")
	local module = config and config:FindFirstChild("Jobs")
	if module and module:IsA("ModuleScript") then
		local ok, jobs = pcall(require, module)
		local def = ok and type(jobs) == "table" and type(jobs.Jobs) == "table" and jobs.Jobs[jobId]
		if type(def) == "table" then
			return ("%s %s"):format(tostring(def.Icon or "💼"), tostring(def.Name or jobId))
		end
	end
	return "💼 " .. jobId
end

local function chip(parent: Instance, text: string, color: Color3, order: number)
	local c = Kit.new("TextLabel", {
		LayoutOrder = order,
		Size = UDim2.fromOffset(0, 24),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = color,
		Font = Theme.FontBold,
		TextSize = 12,
		Text = text,
		TextColor3 = (color.R * 0.299 + color.G * 0.587 + color.B * 0.114) > 0.6 and Color3.fromRGB(25, 25, 30) or Color3.new(1, 1, 1),
		Parent = parent,
	})
	Kit.Corner(c, UDim.new(1, 0))
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), Parent = c })
	return c
end

local function buildReport(content: Frame, userId: number, name: string, ctx, onBack: () -> ())
	local scroll = Kit.Scroll({ Parent = content }, 10)
	Kit.Label(("Report %s"):format(name), {
		LayoutOrder = 1,
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		RichText = false,
		Parent = scroll,
	})
	Kit.Label("Reports go to the SKYLINE CITY moderators. You can also use Roblox's own Report button in the menu.", {
		LayoutOrder = 2,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		Parent = scroll,
	})
	local grid = Kit.new("Frame", {
		LayoutOrder = 3,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Parent = scroll,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.5, -5, 0, 44),
		CellPadding = UDim2.fromOffset(10, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = grid,
	})
	local selected: string? = nil
	local buttons: { [string]: TextButton } = {}
	local function paint()
		for cat, b in pairs(buttons) do
			b.BackgroundColor3 = cat == selected and Theme.Colors.Danger or Theme.Colors.SurfaceAlt
		end
	end
	for i, cat in ipairs(CATEGORIES) do
		buttons[cat] = Kit.Button(("%s %s"):format(CATEGORY_ICONS[cat] or "•", cat), "secondary", function()
			selected = cat
			paint()
		end, { LayoutOrder = i, TextSize = 14, Parent = grid })
	end
	local box = Kit.TextBox(("What happened? (optional, max %d)"):format(SocialConfig.Moderation.ReportTextMax), {
		LayoutOrder = 4,
		Size = UDim2.new(1, 0, 0, 88),
		MultiLine = true,
		TextWrapped = true,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextSize = 14,
		Parent = scroll,
	})
	local row = Kit.new("Frame", { LayoutOrder = 5, Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Parent = scroll })
	Kit.Button("Back", "secondary", onBack, { Size = UDim2.new(0.4, -5, 1, 0), Parent = row })
	Kit.Button("🚩 Send report", "danger", function()
		if not selected then
			Router.Notify("Pick a category first", "warning")
			return
		end
		local text = box.Text
		if (utf8.len(text) or #text) > SocialConfig.Moderation.ReportTextMax then
			Router.Notify("That's too long", "warning")
			return
		end
		local res = Net.Invoke("Moderation", "Report", { UserId = userId, Category = selected, Text = text })
		if Router.Result(res, "Thanks — your report was sent.") then
			ctx.Close()
		end
	end, { Size = UDim2.new(0.6, -5, 1, 0), Position = UDim2.new(0.4, 5, 0, 0), Parent = row })
end

function PlayerActionsPanel.Build(content: Frame, data: any, ctx, moderation)
	local userId = type(data) == "table" and tonumber(data.UserId) or nil
	if not userId then
		Kit.Label("No player selected.", { Parent = content })
		return nil
	end

	local main: Frame
	local function showMain()
		for _, c in ipairs(content:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local player = Players:GetPlayerByUserId(userId)
		local name = player and AppKit.PlayerName(player) or "Player"
		local safeName = AppKit.Escape(name) -- for rich-text toasts / dialogs
		main = Kit.Scroll({ Parent = content }, 10)

		-- profile card
		local card = Kit.new("Frame", {
			LayoutOrder = 1,
			Size = UDim2.new(1, 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundColor3 = Theme.Colors.SurfaceAlt,
			Parent = main,
		})
		Kit.Corner(card, Theme.CornerSmall)
		Kit.Padding(card, 12)
		local head = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 76), BackgroundTransparency = 1, Parent = card })
		AppKit.Avatar(head, userId, string.upper(string.sub(name, 1, 1)), Theme.Colors.Accent, 72)
		Kit.Label(name, {
			Font = Theme.FontBold,
			TextSize = Theme.TextSize.Heading,
			Position = UDim2.fromOffset(84, 6),
			Size = UDim2.new(1, -84, 0, 24),
			AutomaticSize = Enum.AutomaticSize.None,
			TextTruncate = Enum.TextTruncate.AtEnd,
			RichText = false,
			Parent = head,
		})
		Kit.Label(player and ("@%s · %s"):format(player.Name, player.DisplayName) or "Not in this server", {
			TextSize = Theme.TextSize.Small,
			TextColor3 = Theme.Colors.TextDim,
			Position = UDim2.fromOffset(84, 32),
			Size = UDim2.new(1, -84, 0, 18),
			AutomaticSize = Enum.AutomaticSize.None,
			TextTruncate = Enum.TextTruncate.AtEnd,
			RichText = false,
			Parent = head,
		})
		local bio = player and player:GetAttribute("Bio")
		Kit.Label((type(bio) == "string" and bio ~= "") and ("“" .. bio .. "”") or "No bio yet.", {
			TextSize = Theme.TextSize.Small,
			TextColor3 = Theme.Colors.TextDim,
			Position = UDim2.fromOffset(84, 52),
			Size = UDim2.new(1, -84, 0, 18),
			AutomaticSize = Enum.AutomaticSize.None,
			TextTruncate = Enum.TextTruncate.AtEnd,
			RichText = false,
			Parent = head,
		})
		if player then
			local chips = Kit.new("Frame", {
				Position = UDim2.fromOffset(0, 84),
				Size = UDim2.new(1, 0, 0, 24),
				BackgroundTransparency = 1,
				Parent = card,
			})
			Kit.List(chips, 6, true)
			local order = 0
			if player:GetAttribute("VIP") == true then
				order += 1
				chip(chips, "⭐ VIP", Theme.Colors.VIP, order)
			end
			local title = player:GetAttribute("WealthTitle")
			order += 1
			chip(chips, (type(title) == "string" and title ~= "") and title or "Citizen", AppKit.TierColor(player:GetAttribute("WealthTier")), order)
			local job = player:GetAttribute("JobId")
			if type(job) == "string" and job ~= "" then
				order += 1
				chip(chips, jobText(job), Theme.Colors.Stroke, order)
			end
			local group = player:GetAttribute("GroupName")
			if type(group) == "string" and group ~= "" then
				order += 1
				chip(chips, "👪 " .. group, Theme.Colors.AccentAlt, order)
			end
			-- spacer so the card's automatic size includes the chips row
			Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 112), BackgroundTransparency = 1, Parent = card })
		end

		-- actions
		local grid = Kit.new("Frame", {
			LayoutOrder = 2,
			Size = UDim2.new(1, 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundTransparency = 1,
			Parent = main,
		})
		Kit.new("UIGridLayout", {
			CellSize = UDim2.new(0.5, -5, 0, 48),
			CellPadding = UDim2.fromOffset(10, 8),
			SortOrder = Enum.SortOrder.LayoutOrder,
			Parent = grid,
		})
		local order = 0
		local function action(text: string, style: string, fn: () -> ())
			order += 1
			return Kit.Button(text, style, fn, { LayoutOrder = order, TextSize = 15, Parent = grid })
		end

		local blocked = ClientData.Get("Social.Blocked")
		local isBlocked = type(blocked) == "table" and blocked[tostring(userId)] == true
		local contacts = ClientData.Get("Social.Contacts")
		local nick = type(contacts) == "table" and contacts[tostring(userId)] or nil

		if player and not isBlocked then
			action("💬 Message", "primary", function()
				ctx.Close()
				local phone = Registry.Find("PhoneController")
				if phone and phone.OpenThread then
					phone:OpenThread(userId)
				end
			end)
			action("📞 Call", "secondary", function()
				Router.Result(Net.Invoke("Phone", "Ping", { UserId = userId }), "📞 Calling…")
			end)
			action(nick and "✏️ Edit contact" or "⭐ Add contact", "secondary", function()
				Contacts.SaveContact(userId, nick and tostring(nick) or name)
			end)
			action("👪 Invite to group", "secondary", function()
				Router.Result(Net.Invoke("Social", "InviteToGroup", { UserId = userId }), "👪 Invite sent")
			end)
		end
		local muted = moderation:IsMuted(userId)
		action(muted and "🔊 Unmute" or "🔇 Mute", "secondary", function()
			moderation:SetMuted(userId, not muted)
			Router.Notify(muted and ("Unmuted %s"):format(safeName) or ("Muted %s (only for you)"):format(safeName), "info", 3)
			showMain()
		end)
		action(isBlocked and "✅ Unblock" or "🚫 Block", isBlocked and "success" or "danger", function()
			if isBlocked then
				Router.Result(Net.Invoke("Moderation", "Unblock", { UserId = userId }), ("Unblocked %s"):format(safeName))
			else
				if not Router.Confirm(("Block %s?"):format(safeName), "They won't be able to message, call, trade with or invite you, and you won't see their chat.", "Block") then
					return
				end
				Router.Result(Net.Invoke("Moderation", "Block", { UserId = userId }), ("Blocked %s"):format(safeName))
			end
			task.wait(0.2)
			if content.Parent then
				showMain()
			end
		end)
		action("🚩 Report", "ghost", function()
			for _, c in ipairs(content:GetChildren()) do
				if c:IsA("GuiObject") then
					c:Destroy()
				end
			end
			buildReport(content, userId, name, ctx, showMain)
		end)
	end

	showMain()
	ctx.Maid:Give(Players.PlayerRemoving:Connect(function(p)
		if p.UserId == userId and content.Parent and main and main.Parent then
			task.defer(showMain)
		end
	end))
	return nil
end

return PlayerActionsPanel
