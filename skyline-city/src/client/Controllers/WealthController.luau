-- WealthController: "Leaderboard" panel (global top net worth + your rank) and the "TierUp" celebration
-- (opened by WealthService with NotifyService:OpenUI(player, "TierUp", { TierId, Name, Reward, Color })).
--
-- Keybinds: L toggles the leaderboard (PC). The HUD wealth chip opens it on touch / gamepad.
--
-- API (client):
--   WealthController:OpenLeaderboard()
--   WealthController:Celebrate(data)   -- play the tier-up celebration locally
--   WealthController:GetTier() -> tierTable (from player attributes)

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Economy = require(Shared.Config.Economy)

local Client = script.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))
local Confetti = require(script.Parent:WaitForChild("Economy"):WaitForChild("Confetti"))

local WealthController = {
	Name = "WealthController",
	Priority = 60,
}

local localPlayer = Players.LocalPlayer
local GOLD = Color3.fromRGB(255, 200, 60)
local SILVER = Color3.fromRGB(200, 205, 215)
local BRONZE = Color3.fromRGB(215, 140, 80)

local function tierById(id: number?)
	for _, t in ipairs(Economy.WealthTiers) do
		if t.Id == id then
			return t
		end
	end
	return Economy.WealthTiers[1]
end

function WealthController:GetTier()
	local id = localPlayer:GetAttribute("WealthTier")
	return tierById(type(id) == "number" and id or 1)
end

function WealthController:OpenLeaderboard()
	Router.Open("Leaderboard", nil)
end

function WealthController:Celebrate(data)
	Router.Open("TierUp", data)
end

---------------------------------------------------------------------------
-- Leaderboard panel
---------------------------------------------------------------------------
local function leaderboardRow(parent: Instance, entry, isYou: boolean, order: number)
	local rank = entry.Rank or 0
	local rowFrame = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 46),
		BackgroundColor3 = isYou and Theme.Colors.Accent or Theme.Colors.SurfaceAlt,
		BackgroundTransparency = isYou and 0.25 or 0,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.Corner(rowFrame, Theme.CornerSmall)
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 12), Parent = rowFrame })
	local medal = rank == 1 and "🥇" or rank == 2 and "🥈" or rank == 3 and "🥉" or ("#" .. rank)
	Kit.Label(medal, {
		Font = Theme.FontBold,
		TextColor3 = rank == 1 and GOLD or rank == 2 and SILVER or rank == 3 and BRONZE or Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		AutomaticSize = Enum.AutomaticSize.None,
		Size = UDim2.new(0, 44, 1, 0),
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = rowFrame,
	})
	local tier = tierById(entry.TierId)
	local dot = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 50, 0.5, 0),
		Size = UDim2.fromOffset(10, 10),
		BackgroundColor3 = tier.Color,
		Parent = rowFrame,
	})
	Kit.Corner(dot, UDim.new(1, 0))
	Kit.Label(tostring(entry.Name or "?") .. (isYou and "  (you)" or ""), {
		AutomaticSize = Enum.AutomaticSize.None,
		Position = UDim2.fromOffset(68, 0),
		Size = UDim2.new(0.6, -68, 1, 0),
		TextYAlignment = Enum.TextYAlignment.Center,
		TextTruncate = Enum.TextTruncate.AtEnd,
		TextWrapped = false,
		Parent = rowFrame,
	})
	Kit.Label(Format.MoneyShort(entry.NetWorth or 0), {
		Font = Theme.FontBold,
		TextColor3 = Theme.Colors.Money,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextYAlignment = Enum.TextYAlignment.Center,
		AutomaticSize = Enum.AutomaticSize.None,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.new(0.4, 0, 1, 0),
		Parent = rowFrame,
	})
end

local function buildLeaderboard(content: Frame, _data, ctx)
	local closed = false
	ctx.Maid:Give(function()
		closed = true
	end)

	local you = Kit.Card({
		Size = UDim2.new(1, 0, 0, 64),
		AutomaticSize = Enum.AutomaticSize.None,
		Parent = content,
	})
	local youTitle = Kit.Label("Your rank: …", {
		Font = Theme.FontBold,
		AutomaticSize = Enum.AutomaticSize.None,
		Size = UDim2.new(0.7, 0, 0, 22),
		Parent = you,
	})
	local youSub = Kit.Label("", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		AutomaticSize = Enum.AutomaticSize.None,
		Position = UDim2.fromOffset(0, 24),
		Size = UDim2.new(0.7, 0, 0, 18),
		Parent = you,
	})
	local refresh = Kit.Button("🔄", "secondary", nil, {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, 0, 0.5, 0),
		Size = UDim2.fromOffset(44, 44),
		Parent = you,
	})

	local list = Kit.Scroll({
		Position = UDim2.fromOffset(0, 74),
		Size = UDim2.new(1, 0, 1, -74),
		Parent = content,
	}, 6)

	local loading = false
	local function load()
		if loading then
			return
		end
		loading = true
		for _, c in ipairs(list:GetChildren()) do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local hint = Kit.Label("Loading the rich list…", { TextColor3 = Theme.Colors.TextDim, Parent = list })
		local res = Net.Invoke("Wealth", "GetTopList", {})
		loading = false
		if closed then
			return
		end
		hint:Destroy()
		if not res.ok then
			Kit.Label(res.err or "Couldn't load the leaderboard", { TextColor3 = Theme.Colors.Danger, Parent = list })
			return
		end
		local me = res.You or {}
		local tier = tierById(me.TierId)
		youTitle.Text = me.Rank and ("Your rank: #%d"):format(me.Rank) or ("Your rank: %d+"):format(Economy.Wealth.LeaderboardSize)
		youSub.Text = ("%s · %s"):format(Format.Money(me.NetWorth or 0), tier.Name)
		youSub.TextColor3 = tier.Color
		local entries = res.List or {}
		if #entries == 0 then
			Kit.Label("No one is on the board yet — be the first!", { TextColor3 = Theme.Colors.TextDim, Parent = list })
			return
		end
		for i, entry in ipairs(entries) do
			leaderboardRow(list, entry, entry.UserId == localPlayer.UserId, i)
		end
		Kit.Label("Net worth = cash + bank + savings + homes + cars + businesses. Updates every few minutes.", {
			TextSize = 12,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = #entries + 1,
			Parent = list,
		})
	end

	refresh.Activated:Connect(function()
		task.spawn(load)
	end)
	task.spawn(load)
end

---------------------------------------------------------------------------
-- Tier-up celebration
---------------------------------------------------------------------------
local celebrationToken = 0

local function buildTierUp(root: Frame, data, ctx)
	data = type(data) == "table" and data or {}
	celebrationToken += 1
	local token = celebrationToken
	local tier = tierById(tonumber(data.TierId))
	local color = tier.Color
	if type(data.Color) == "table" and #data.Color == 3 then
		color = Color3.fromRGB(data.Color[1], data.Color[2], data.Color[3])
	end

	local overlay = Kit.new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Colors.Overlay,
		BackgroundTransparency = 1,
		Parent = root,
	})
	Kit.Tween(overlay, { BackgroundTransparency = 0.55 }, Theme.Tween.Normal)
	overlay.Activated:Connect(function()
		ctx.Close()
	end)

	local banner = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.45),
		Size = UDim2.new(0.86, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = overlay,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(440, 400), Parent = banner })
	Kit.Corner(banner)
	Kit.Stroke(banner, color, 3, 0)
	Kit.Padding(banner, 20)
	Kit.List(banner, 8, false, Enum.HorizontalAlignment.Center)
	local scale = Kit.new("UIScale", { Scale = 0.4, Parent = banner })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)

	Kit.Label("NEW WEALTH TIER", {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 1,
		Parent = banner,
	})
	Kit.Label("💎 " .. tostring(data.Name or tier.Name), {
		Font = Theme.FontBold,
		TextSize = 34,
		TextColor3 = color,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 2,
		Parent = banner,
	})
	local reward = tonumber(data.Reward) or 0
	if reward > 0 then
		Kit.Label(("Bonus: <b>%s</b>"):format(Format.Money(reward)), {
			TextColor3 = Theme.Colors.Money,
			TextXAlignment = Enum.TextXAlignment.Center,
			LayoutOrder = 3,
			Parent = banner,
		})
	end
	Kit.Label("Tap anywhere to continue", {
		TextSize = 12,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 4,
		Parent = banner,
	})

	Confetti.Burst(root, 120, { color, GOLD, Color3.new(1, 1, 1), Theme.Colors.Accent, Theme.Colors.Money })
	task.delay(0.6, function()
		if token == celebrationToken and Router.IsOpen("TierUp") then
			Confetti.Burst(root, 60, { color, GOLD, Color3.new(1, 1, 1) })
		end
	end)
	task.delay(Economy.Wealth.CelebrationSeconds, function()
		if token == celebrationToken and Router.IsOpen("TierUp") then
			ctx.Close()
		end
	end)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function WealthController:Init()
	Router.Register("Leaderboard", {
		Title = "Rich List",
		Icon = "🏆",
		Kind = "window",
		Size = Vector2.new(520, 620),
		Build = buildLeaderboard,
	})
	Router.Register("TierUp", {
		Kind = "custom",
		Layer = "Modal",
		Build = buildTierUp,
	})
end

function WealthController:Start()
	ContextActionService:BindAction("SkylineLeaderboard", function(_, state)
		if state == Enum.UserInputState.Begin then
			Router.Toggle("Leaderboard", nil)
		end
		return Enum.ContextActionResult.Pass
	end, false, Enum.KeyCode.L)
end

return WealthController
