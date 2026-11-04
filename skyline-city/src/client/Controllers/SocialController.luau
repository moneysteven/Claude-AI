-- SocialController: chat tags, name-tag visibility, voice hangout chip.
--
--   * TextChatService.OnIncomingMessage (this is the ONLY system that sets it):
--       [VIP] in gold (sender attribute VIP, unless their attribute HideVipTag is true) · wealth title in the
--       tier colour · RP name (escaped) instead of the display name. Messages from players you blocked
--       (ClientData Social.Blocked) or muted (ModerationController) are replaced by a dim "hidden" line
--       (the server also stops blocked players' messages from being delivered at all).
--   * Name tags ("SkylineNameTag" BillboardGuis built by SocialService): other players' tags follow
--     Settings.ShowNameTags; your own tag is hidden unless Config.Social.NameTags.ShowOwnTag.
--   * Mirrors Settings.HideVipChatTag to the server (Social.SyncSettings) so the attribute stays correct.
--   * Starts the VoiceZone chip.
--
-- API (client):
--   SocialController:RefreshNameTags()
--   SocialController:FormatPrefix(player) -> string     (rich-text chat prefix, without the trailing colon)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Economy = require(Shared.Config.Economy)
local SocialConfig = require(Shared.Config.Social)

local Client = script.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Registry = require(Client:WaitForChild("Registry"))
local Theme = require(Client:WaitForChild("UI"):WaitForChild("Theme"))

local SocialFolder = script.Parent:WaitForChild("Social")
local VoiceZones = require(SocialFolder:WaitForChild("VoiceZones"))

local SocialController = {
	Name = "SocialController",
	Priority = 40,
}

local localPlayer = Players.LocalPlayer
local TAG_NAME = "SkylineNameTag"

---------------------------------------------------------------------------
-- Chat
---------------------------------------------------------------------------
local function escape(text: string): string
	return (
		tostring(text)
			:gsub("&", "&amp;")
			:gsub("<", "&lt;")
			:gsub(">", "&gt;")
			:gsub('"', "&quot;")
			:gsub("'", "&apos;")
	)
end

local function hex(c: Color3): string
	return string.format("#%02X%02X%02X", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5))
end

local function tierFor(id: any)
	for _, t in ipairs(Economy.WealthTiers) do
		if t.Id == id then
			return t
		end
	end
	return nil
end

local function isBlocked(userId: number): boolean
	local blocked = ClientData.Get("Social.Blocked")
	return type(blocked) == "table" and blocked[tostring(userId)] == true
end

local function isMuted(userId: number): boolean
	local mod = Registry.Find("ModerationController")
	if mod and mod.IsMuted then
		local ok, v = pcall(mod.IsMuted, mod, userId)
		return ok and v == true
	end
	return false
end

-- tags only (VIP + title), with trailing space when non-empty
local function tagsFor(player: Player): string
	local out = ""
	if player:GetAttribute("VIP") == true and player:GetAttribute("HideVipTag") ~= true then
		out ..= ('<font color="%s"><b>[VIP]</b></font> '):format(hex(Theme.Colors.VIP))
	end
	local tier = tierFor(player:GetAttribute("WealthTier"))
	local title = player:GetAttribute("WealthTitle")
	if tier and tier.Id > 1 then
		local text = (type(title) == "string" and title ~= "") and title or tier.Name
		out ..= ('<font color="%s">[%s]</font> '):format(hex(tier.Color), escape(text))
	end
	return out
end

function SocialController:FormatPrefix(player: Player): string
	local rp = player:GetAttribute("RPName")
	local name = (type(rp) == "string" and rp ~= "") and rp or player.DisplayName
	return tagsFor(player) .. escape(name)
end

local function onIncoming(message: TextChatMessage)
	local props = Instance.new("TextChatMessageProperties")
	local source = message.TextSource
	if not source then
		return props
	end
	local uid = source.UserId
	if uid ~= localPlayer.UserId and (isBlocked(uid) or isMuted(uid)) then
		props.PrefixText = '<font color="#7A7F92">•</font>'
		props.Text = ('<font color="#7A7F92"><i>%s</i></font>'):format(isBlocked(uid) and "message hidden (blocked)" or "message hidden (muted)")
		return props
	end
	local player = Players:GetPlayerByUserId(uid)
	if not player then
		return props
	end
	local tags = tagsFor(player)
	local rp = player:GetAttribute("RPName")
	if type(rp) == "string" and rp ~= "" then
		props.PrefixText = tags .. escape(rp) .. ":"
	elseif tags ~= "" then
		props.PrefixText = tags .. message.PrefixText
	end
	return props
end

---------------------------------------------------------------------------
-- Name tags
---------------------------------------------------------------------------
local function tagVisible(owner: Player?): boolean
	if owner == localPlayer then
		return SocialConfig.NameTags.ShowOwnTag == true
	end
	return ClientData.Get("Settings.ShowNameTags") ~= false
end

local function applyTag(gui: Instance, owner: Player?)
	if gui:IsA("BillboardGui") and gui.Name == TAG_NAME then
		gui.Enabled = tagVisible(owner)
	end
end

function SocialController:RefreshNameTags()
	for _, p in ipairs(Players:GetPlayers()) do
		local char = p.Character
		if char then
			for _, d in ipairs(char:GetDescendants()) do
				if d.Name == TAG_NAME then
					applyTag(d, p)
				end
			end
		end
	end
end

local function watchCharacter(player: Player, char: Model)
	for _, d in ipairs(char:GetDescendants()) do
		if d.Name == TAG_NAME then
			applyTag(d, player)
		end
	end
	-- StreamingEnabled: the head / tag may arrive later
	local conn
	conn = char.DescendantAdded:Connect(function(d)
		if d.Name == TAG_NAME then
			applyTag(d, player)
		end
	end)
	char.AncestryChanged:Connect(function(_, parent)
		if parent == nil and conn then
			conn:Disconnect()
		end
	end)
end

local function watchPlayer(player: Player)
	if player.Character then
		task.spawn(watchCharacter, player, player.Character)
	end
	player.CharacterAdded:Connect(function(char)
		watchCharacter(player, char)
	end)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function SocialController:Init()
	TextChatService.OnIncomingMessage = onIncoming
end

function SocialController:Start()
	for _, p in ipairs(Players:GetPlayers()) do
		watchPlayer(p)
	end
	Players.PlayerAdded:Connect(watchPlayer)

	ClientData.OnChanged("Settings.ShowNameTags", function()
		self:RefreshNameTags()
	end)

	local lastHide: any = nil
	ClientData.OnChanged("Settings.HideVipChatTag", function(v)
		if v == lastHide then
			return
		end
		local first = lastHide == nil
		lastHide = v
		if first and (v == true) == (localPlayer:GetAttribute("HideVipTag") == true) then
			return
		end
		Net.Invoke("Social", "SyncSettings", {})
	end)

	VoiceZones.Start()
end

return SocialController
