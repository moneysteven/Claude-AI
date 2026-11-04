-- Contacts app (phone): everyone in this server + your saved contacts (Social.Contacts, with nicknames).
-- Row buttons: 💬 message · 📞 call (ping) · ⋯ player actions (profile, add contact, invite, block, report…)
-- Contacts.SaveContact(userId, currentNick?) is also used by the PlayerActions panel.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local PhoneConfig = require(Shared.Config.Phone)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))

local AppKit = require(script.Parent:WaitForChild("AppKit"))
local PhoneState = require(script.Parent:WaitForChild("PhoneState"))

local Contacts = {}

local localPlayer = Players.LocalPlayer

function Contacts.SaveContact(userId: number, current: string?)
	local nick = Router.Prompt("Contact nickname", "Nickname (optional)", current or "")
	if nick == nil then
		return
	end
	if utf8.len(nick) and (utf8.len(nick) :: number) > PhoneConfig.Contacts.MaxNicknameLength then
		Router.Notify(("Nicknames are up to %d characters"):format(PhoneConfig.Contacts.MaxNicknameLength), "warning")
		return
	end
	local res = Net.Invoke("Phone", "SaveContact", { UserId = userId, Nickname = nick })
	Router.Result(res, "⭐ Contact saved")
end

local function ping(userId: number)
	local res = Net.Invoke("Phone", "Ping", { UserId = userId })
	Router.Result(res, "📞 Calling…")
end

local function actionButtons(row: Frame, buttons: { { string } }, handlers: { [string]: () -> () })
	local holder = Kit.new("Frame", {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -6, 0.5, 0),
		Size = UDim2.fromOffset(#buttons * 46, 44),
		BackgroundTransparency = 1,
		Parent = row,
	})
	Kit.List(holder, 2, true, Enum.HorizontalAlignment.Right)
	for i, b in ipairs(buttons) do
		local id, icon = b[1], b[2]
		AppKit.SmallButton(icon, "ghost", handlers[id], {
			LayoutOrder = i,
			Size = UDim2.fromOffset(44, 44),
			TextSize = 17,
			Parent = holder,
		})
	end
end

function Contacts.Build(container: Frame, _data: any, ctx)
	local body = AppKit.Page(container, "Contacts", ctx)
	local scroll = AppKit.List(body, 6)

	local function openActions(userId: number)
		local mod = ctx.Find("ModerationController")
		if mod and mod.OpenPlayer then
			ctx.Phone:Close()
			mod:OpenPlayer(userId)
		else
			Router.Notify("Player actions aren't available", "error")
		end
	end

	local function render()
		for _, c in ipairs(scroll:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local saved = ClientData.Get("Social.Contacts")
		if type(saved) ~= "table" then
			saved = {}
		end

		local order = 1
		AppKit.Section(scroll, "In this server", order)
		local others = {}
		for _, p in ipairs(Players:GetPlayers()) do
			if p ~= localPlayer and not PhoneState.IsHidden(p.UserId) then
				table.insert(others, p)
			end
		end
		table.sort(others, function(a, b)
			return AppKit.PlayerName(a):lower() < AppKit.PlayerName(b):lower()
		end)
		for _, p in ipairs(others) do
			order += 1
			local nick = saved[tostring(p.UserId)]
			local title = nick and ("⭐ " .. tostring(nick)) or AppKit.PlayerName(p)
			local row = AppKit.Row(scroll, {
				Order = order,
				UserId = p.UserId,
				Icon = string.upper(string.sub(p.DisplayName, 1, 1)),
				Title = title,
				Subtitle = "@" .. p.Name,
				RightWidth = 3 * 46,
				Height = 60,
			})
			local uid = p.UserId
			actionButtons(row, { { "msg", "💬" }, { "call", "📞" }, { "more", "⋯" } }, {
				msg = function()
					ctx.Open("Messages", { UserId = uid })
				end,
				call = function()
					ping(uid)
				end,
				more = function()
					openActions(uid)
				end,
			})
		end
		if #others == 0 then
			order += 1
			AppKit.Empty(scroll, "Nobody else is in this server right now.", order)
		end

		order += 1
		AppKit.Section(scroll, "Saved contacts", order)
		local offline = {}
		for key, nick in pairs(saved) do
			local uid = tonumber(key)
			if uid and not Players:GetPlayerByUserId(uid) then
				table.insert(offline, { UserId = uid, Nick = tostring(nick) })
			end
		end
		table.sort(offline, function(a, b)
			return a.Nick:lower() < b.Nick:lower()
		end)
		for _, c in ipairs(offline) do
			order += 1
			local row = AppKit.Row(scroll, {
				Order = order,
				UserId = c.UserId,
				Icon = string.upper(string.sub(c.Nick, 1, 1)),
				Title = c.Nick,
				Subtitle = "Not in this server",
				RightWidth = 2 * 46,
				Height = 60,
			})
			actionButtons(row, { { "rename", "✏️" }, { "remove", "🗑️" } }, {
				rename = function()
					Contacts.SaveContact(c.UserId, c.Nick)
				end,
				remove = function()
					if Router.Confirm("Remove contact?", ("Remove %s from your contacts?"):format(AppKit.Escape(c.Nick)), "Remove") then
						Router.Result(Net.Invoke("Phone", "RemoveContact", { UserId = c.UserId }), "Contact removed")
					end
				end,
			})
		end
		if #offline == 0 then
			order += 1
			AppKit.Empty(scroll, "Saved contacts who aren't online show up here.", order)
		end
	end

	render()
	ctx.Maid:Give(ClientData.OnChanged("Social.Contacts", function()
		render()
	end))
	ctx.Maid:Give(ClientData.OnChanged("Social.Blocked", function()
		render()
	end))
	ctx.Maid:Give(Players.PlayerAdded:Connect(render))
	ctx.Maid:Give(Players.PlayerRemoving:Connect(function()
		task.defer(render)
	end))
	return nil
end

return Contacts
