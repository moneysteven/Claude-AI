-- DailyRewardController: the "DailyReward" popup + the 🎁 HUD button (with a badge when a reward is waiting).
-- The server opens the panel automatically on join if a reward is claimable (NotifyService:OpenUI).
--
-- API (client):
--   DailyRewardController:Open()
--   DailyRewardController:IsClaimable() -> boolean

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)

local Client = script.Parent.Parent
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))
local Confetti = require(script.Parent:WaitForChild("Economy"):WaitForChild("Confetti"))

local DailyRewardController = {
	Name = "DailyRewardController",
	Priority = 60,
}

local status: { [string]: any }? = nil
local statusAt = 0 -- os.clock() when status was fetched
local badge: Frame? = nil

local function setBadge()
	if badge then
		badge.Visible = status ~= nil and status.Claimable == true
	end
end

local function fetch()
	local res = Net.Invoke("Daily", "GetStatus", {})
	if res.ok and type(res.Status) == "table" then
		status = res.Status
		statusAt = os.clock()
		setBadge()
	end
	return status
end

function DailyRewardController:IsClaimable(): boolean
	return status ~= nil and status.Claimable == true
end

function DailyRewardController:Open()
	Router.Open("DailyReward", nil)
end

local function dayCard(parent: Instance, day: number, reward: number, state: string)
	-- state: "claimed" | "today" | "next" | "future"
	local isToday = state == "today"
	local card = Kit.new("Frame", {
		LayoutOrder = day,
		BackgroundColor3 = isToday and Theme.Colors.Accent or Theme.Colors.SurfaceAlt,
		BackgroundTransparency = state == "claimed" and 0.4 or 0,
		Parent = parent,
	})
	Kit.Corner(card, Theme.CornerSmall)
	if isToday or state == "next" then
		Kit.Stroke(card, isToday and Theme.Colors.Money or Theme.Colors.Accent, 2, 0)
	end
	Kit.Label("Day " .. day, {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextColor3 = isToday and Theme.Colors.Text or Theme.Colors.TextDim,
		AutomaticSize = Enum.AutomaticSize.None,
		Position = UDim2.fromOffset(0, 6),
		Size = UDim2.new(1, 0, 0, 16),
		Parent = card,
	})
	Kit.Label(state == "claimed" and "✅" or (day == 7 and "💰" or "🎁"), {
		TextSize = 26,
		TextXAlignment = Enum.TextXAlignment.Center,
		AutomaticSize = Enum.AutomaticSize.None,
		Position = UDim2.new(0, 0, 0.5, -16),
		Size = UDim2.new(1, 0, 0, 32),
		Parent = card,
	})
	local amount = Kit.Label(Format.MoneyShort(reward), {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextColor3 = state == "claimed" and Theme.Colors.TextDim or Theme.Colors.Money,
		TextScaled = true,
		AutomaticSize = Enum.AutomaticSize.None,
		Position = UDim2.new(0, 4, 1, -24),
		Size = UDim2.new(1, -8, 0, 18),
		Parent = card,
	})
	Kit.new("UITextSizeConstraint", { MaxTextSize = Theme.TextSize.Body, MinTextSize = 9, Parent = amount })
	if isToday then
		local s = Kit.new("UIScale", { Parent = card })
		local tween = Kit.Tween(s, { Scale = 1.06 }, TweenInfo.new(0.7, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true))
		card.Destroying:Connect(function()
			tween:Cancel()
		end)
	end
	return card
end

local function build(content: Frame, data: any, ctx)
	local maid = ctx.Maid
	local closed = false
	maid:Give(function()
		closed = true
	end)

	local s = (type(data) == "table" and data.Rewards) and data or status
	if type(data) == "table" and data.Rewards then
		status = data
		statusAt = os.clock()
		setBadge()
	end

	local root = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = content })
	Kit.List(root, 10, false, Enum.HorizontalAlignment.Center)

	local streakLabel = Kit.Label("", {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 1,
		Parent = root,
	})
	local subLabel = Kit.Label("Log in every day to grow your streak. Miss a day and it resets!", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		LayoutOrder = 2,
		Parent = root,
	})
	subLabel.Name = "Sub"

	local grid = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 230),
		BackgroundTransparency = 1,
		LayoutOrder = 3,
		Parent = root,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.25, -8, 0.5, -6),
		CellPadding = UDim2.fromOffset(8, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Parent = grid,
	})

	local claimBtn: TextButton

	local function render(st)
		for _, c in ipairs(grid:GetChildren()) do
			if c:IsA("Frame") then
				c:Destroy()
			end
		end
		if not st then
			streakLabel.Text = "Loading…"
			return
		end
		local rewards = st.Rewards or {}
		streakLabel.Text = st.Streak > 0 and ("🔥 %d day streak"):format(st.Streak) or "🔥 Start your streak!"
		local cycleDay = st.CycleDay or 1
		for day = 1, #rewards do
			local state
			if day < cycleDay then
				state = "claimed"
			elseif day == cycleDay then
				state = st.Claimable and "today" or "next"
			else
				state = "future"
			end
			dayCard(grid, day, rewards[day], state)
		end
		if st.Claimable then
			claimBtn.Text = ("🎁  Claim %s"):format(Format.Money(st.NextReward or 0))
			claimBtn.BackgroundColor3 = Theme.Colors.Success
			claimBtn.AutoButtonColor = true
		else
			claimBtn.BackgroundColor3 = Theme.Colors.SurfaceAlt
			claimBtn.AutoButtonColor = false
		end
	end

	local function claim()
		if not status or not status.Claimable then
			return
		end
		local res = Net.Invoke("Daily", "Claim", {})
		if res.ok then
			status = res.Status
			statusAt = os.clock()
			setBadge()
			if not closed then
				render(status)
				local layer = Router.GetLayer("Modal")
				if layer then
					Confetti.Burst(layer, 70)
				end
			end
		else
			Router.Result(res)
			if type(res.Status) == "table" then
				status = res.Status
				statusAt = os.clock()
				setBadge()
				if not closed then
					render(status)
				end
			end
		end
	end

	claimBtn = Kit.Button("…", "success", claim, {
		Size = UDim2.new(1, 0, 0, 52),
		TextSize = Theme.TextSize.Heading,
		LayoutOrder = 4,
		Parent = root,
	})
	Kit.Label("🎮 Press Y to claim", {
		TextSize = 12,
		TextColor3 = Theme.Colors.TextDim,
		TextXAlignment = Enum.TextXAlignment.Center,
		Visible = Kit.IsGamepad(),
		LayoutOrder = 5,
		Parent = root,
	})
	if Kit.IsGamepad() then
		GuiService.SelectedObject = claimBtn
	end

	ContextActionService:BindAction("SkylineDailyClaim", function(_, state)
		if state == Enum.UserInputState.Begin then
			task.spawn(claim)
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.ButtonY)
	maid:Give(function()
		ContextActionService:UnbindAction("SkylineDailyClaim")
	end)

	render(s)
	if not s then
		task.spawn(function()
			local fresh = fetch()
			if not closed then
				render(fresh)
			end
		end)
	end

	-- live countdown
	task.spawn(function()
		while not closed do
			if status and not status.Claimable then
				local left = math.max(0, (status.SecondsUntilReset or 0) - (os.clock() - statusAt))
				claimBtn.Text = ("⏳  Next reward in %s"):format(Format.Duration(left))
				if left <= 0 then
					local fresh = fetch()
					if not closed then
						render(fresh)
					end
				end
			end
			task.wait(1)
		end
	end)
end

function DailyRewardController:Init()
	Router.Register("DailyReward", {
		Title = "Daily Reward",
		Icon = "🎁",
		Kind = "window",
		Size = Vector2.new(520, 470),
		Build = build,
	})
end

function DailyRewardController:Start()
	local button = Router.AddHudButton("Daily", "🎁", "Daily", 50, function()
		Router.Toggle("DailyReward", nil)
	end)
	local dot = Kit.new("Frame", {
		Name = "Badge",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -4, 0, 4),
		Size = UDim2.fromOffset(14, 14),
		BackgroundColor3 = Theme.Colors.Danger,
		Visible = false,
		ZIndex = 5,
		Parent = button,
	})
	Kit.Corner(dot, UDim.new(1, 0))
	badge = dot
	fetch()

	-- notice the UTC day rollover without spamming the server
	task.spawn(function()
		while true do
			task.wait(30)
			if status and not status.Claimable then
				local left = (status.SecondsUntilReset or 0) - (os.clock() - statusAt)
				if left <= 0 then
					fetch()
				end
			end
		end
	end)
end

return DailyRewardController
