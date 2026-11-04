-- JobTracker: on-screen job card (current task, timer, progress, shift earnings, XP, Clock Out)
-- plus the big contextual action button and PvP context buttons (cuff / offer repair).
--
--   local tr = JobTracker.new(handlers)   handlers = { OnAction(began: boolean), OnClockOut(), OnContext(id) }
--   tr:SetState(state?)  tr:SetTask(view?)  tr:SetNextAt(t?)  tr:SetActionVisible(bool, text?)
--   tr:SetContext({ {Id, Text, Style} })  tr:Tick()  tr:Toggle()  tr:PaidPopup(amount)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Jobs)

local UI = script.Parent.Parent.Parent:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))

local JobEffects = require(script.Parent.JobEffects)

local JobTracker = {}
JobTracker.__index = JobTracker

local function now(): number
	return Workspace:GetServerTimeNow()
end

local function clock(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d"):format(seconds // 60, seconds % 60)
end

function JobTracker.new(handlers)
	local self = setmetatable({}, JobTracker)
	self.Handlers = handlers
	self.State = nil
	self.Task = nil
	self.Collapsed = false
	self.ContextButtons = {}

	local hud = Router.GetLayer("HUD")
	local card = Kit.new("Frame", {
		Name = "JobTracker",
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 10, 0.42, 0),
		Size = UDim2.fromOffset(270, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.08,
		Visible = false,
		Parent = hud,
	})
	Kit.Corner(card)
	self.Stroke = Kit.Stroke(card, Theme.Colors.Accent, 2, 0.2)
	Kit.Padding(card, 10)
	Kit.List(card, 6)
	self.Card = card
	self.Scale = Kit.new("UIScale", { Scale = 1, Parent = card })

	-- header (tap to collapse)
	local header = Kit.new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 36),
		LayoutOrder = 1,
		Parent = card,
	})
	self.Icon = Kit.new("TextLabel", {
		Text = "💼",
		TextSize = 24,
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(34, 36),
		Parent = header,
	})
	self.JobName = Kit.Label("", {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Body,
		Position = UDim2.fromOffset(40, 0),
		Size = UDim2.new(1, -70, 0, 18),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = header,
	})
	self.Level = Kit.Label("", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		Position = UDim2.fromOffset(40, 18),
		Size = UDim2.new(1, -70, 0, 16),
		AutomaticSize = Enum.AutomaticSize.None,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = header,
	})
	self.Chevron = Kit.new("TextLabel", {
		Text = "▾",
		TextSize = 18,
		TextColor3 = Theme.Colors.TextDim,
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 0),
		Size = UDim2.fromOffset(26, 36),
		Parent = header,
	})
	header.Activated:Connect(function()
		self:Toggle()
	end)

	-- XP bar
	local xpBar = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 6), BackgroundColor3 = Theme.Colors.Background, LayoutOrder = 2, Parent = card })
	Kit.Corner(xpBar, UDim.new(1, 0))
	self.XPFill = Kit.new("Frame", { Size = UDim2.fromScale(0, 1), BackgroundColor3 = Theme.Colors.AccentAlt, Parent = xpBar })
	Kit.Corner(self.XPFill, UDim.new(1, 0))

	-- body (collapsible)
	local body = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 3, Parent = card })
	Kit.List(body, 5)
	self.Body = body

	self.TaskTitle = Kit.Label("", { Font = Theme.FontBold, TextSize = Theme.TextSize.Body, LayoutOrder = 1, Parent = body })
	self.TaskHint = Kit.Label("", { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small, LayoutOrder = 2, Parent = body })
	self.Timer = Kit.Label("", { TextSize = Theme.TextSize.Small, Font = Theme.FontMono, LayoutOrder = 3, Parent = body })
	self.Extra = Kit.Label("", { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.Warning, LayoutOrder = 4, Parent = body })

	local prog = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 8), BackgroundColor3 = Theme.Colors.Background, LayoutOrder = 5, Visible = false, Parent = body })
	Kit.Corner(prog, UDim.new(1, 0))
	self.ProgBar = prog
	self.ProgFill = Kit.new("Frame", { Size = UDim2.fromScale(0, 1), BackgroundColor3 = Theme.Colors.Success, Parent = prog })
	Kit.Corner(self.ProgFill, UDim.new(1, 0))
	self.ProgText = Kit.Label("", { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 6, Visible = false, Parent = body })

	self.Earnings = Kit.Label("", { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.Money, Font = Theme.FontBold, LayoutOrder = 7, Parent = body })

	local contextHolder = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 8, Parent = body })
	Kit.List(contextHolder, 4)
	self.ContextHolder = contextHolder

	Kit.Button("⏹ Clock Out", "danger", function()
		if Router.Confirm("Clock out?", "You'll stop receiving tasks for this job.", "Clock Out") then
			self.Handlers.OnClockOut()
		end
	end, { Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 9, TextSize = Theme.TextSize.Small + 1, Parent = body })

	-- big action button (bottom centre; thumb-friendly on phones)
	local actionHolder = Kit.new("Frame", {
		Name = "JobAction",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -96),
		Size = UDim2.fromOffset(240, 60),
		BackgroundTransparency = 1,
		Visible = false,
		Parent = hud,
	})
	local action = Kit.new("TextButton", {
		Text = "",
		Font = Theme.FontBold,
		TextSize = 20,
		TextColor3 = Theme.Colors.Text,
		BackgroundColor3 = Theme.Colors.Accent,
		Size = UDim2.fromScale(1, 1),
		AutoButtonColor = true,
		Parent = actionHolder,
	})
	Kit.Corner(action, UDim.new(1, 0))
	Kit.Stroke(action, Color3.new(1, 1, 1), 2, 0.4)
	local actionScale = Kit.new("UIScale", { Scale = 1, Parent = action })
	action.InputBegan:Connect(function(input)
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch then
			Kit.Tween(actionScale, { Scale = 0.94 }, Theme.Tween.Fast)
			self.Handlers.OnAction(true)
		end
	end)
	action.InputEnded:Connect(function(input)
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch then
			Kit.Tween(actionScale, { Scale = 1 }, Theme.Tween.Spring)
			self.Handlers.OnAction(false)
		end
	end)
	self.ActionHolder = actionHolder
	self.ActionButton = action
	self.ActionText = ""

	-- floating "+$123" pay popups (separate holder: the card itself is a list layout)
	self.PopupHolder = Kit.new("Frame", {
		Name = "JobPayPopups",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -170),
		Size = UDim2.fromOffset(240, 40),
		BackgroundTransparency = 1,
		Parent = hud,
	})

	-- small hint for the key
	self.KeyHint = Kit.new("TextLabel", {
		Text = "",
		Font = Theme.FontBold,
		TextSize = 12,
		TextColor3 = Theme.Colors.TextDim,
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 1, 2),
		Size = UDim2.new(1, 0, 0, 14),
		Parent = actionHolder,
	})
	return self
end

function JobTracker:_keyHint(): string
	if Kit.IsGamepad() then
		return "[" .. (Config.Keybinds.ActionGamepad:gsub("Button", "")) .. "]"
	elseif UserInputService.KeyboardEnabled and not Kit.IsMobile() then
		return "[" .. Config.Keybinds.Action .. "]"
	end
	return ""
end

function JobTracker:SetState(state)
	self.State = state
	if not state then
		self.Card.Visible = false
		self.ActionHolder.Visible = false
		self.Task = nil
		return
	end
	local cfg = Config.Jobs[state.JobId]
	if not self.Card.Visible then
		self.Card.Visible = true
		self.Scale.Scale = 0.8
		Kit.Tween(self.Scale, { Scale = 1 }, Theme.Tween.Spring)
	end
	self.Icon.Text = cfg and cfg.Icon or "💼"
	self.JobName.Text = cfg and cfg.Name or state.JobId
	self.Stroke.Color = cfg and cfg.UniformColor or Theme.Colors.Accent
	self:SetProgress(state)
	self.Earnings.Text = ("💵 %s this shift  •  %d task%s"):format(Format.Money(state.Earned or 0), state.Tasks or 0, state.Tasks == 1 and "" or "s")
	self:SetTask(state.Task)
end

function JobTracker:SetProgress(info)
	local level = info.Level or 1
	self.Level.Text = ("Lv %d %s"):format(level, info.Title or "")
	local need = info.XPNext or 0
	local xp = info.LevelXP or info.XP or 0
	local frac = need > 0 and math.clamp(xp / need, 0, 1) or 1
	Kit.Tween(self.XPFill, { Size = UDim2.fromScale(frac, 1) })
	if self.State then
		self.State.Level = level
		self.State.XP = xp
		self.State.XPNext = need
		if info.Earned then
			self.State.Earned = info.Earned
		end
		if info.Tasks then
			self.State.Tasks = info.Tasks
		end
		self.Earnings.Text = ("💵 %s this shift  •  %d task%s"):format(Format.Money(self.State.Earned or 0), self.State.Tasks or 0, self.State.Tasks == 1 and "" or "s")
	end
end

function JobTracker:SetTask(view)
	self.Task = view
	if not view then
		self.TaskTitle.Text = "⏳ Waiting for the next task..."
		self.TaskHint.Text = ""
		self.Extra.Text = ""
		self.ProgBar.Visible = false
		self.ProgText.Visible = false
		self:SetActionVisible(false)
		self:Tick()
		return
	end
	self.TaskTitle.Text = view.Title or ""
	self.TaskHint.Text = view.Hint or ""
	self:SetProgressBar(view.Progress, view.ProgressText)
	self:Tick()
end

function JobTracker:SetProgressBar(progress: number?, text: string?)
	if progress then
		self.ProgBar.Visible = true
		Kit.Tween(self.ProgFill, { Size = UDim2.fromScale(math.clamp(progress, 0, 1), 1) }, Theme.Tween.Fast)
	else
		self.ProgBar.Visible = false
	end
	self.ProgText.Visible = text ~= nil and text ~= ""
	self.ProgText.Text = text or ""
end

function JobTracker:SetNextAt(t: number?)
	self.NextAt = t
	self:Tick()
end

function JobTracker:Tick()
	if not self.State then
		return
	end
	local t = now()
	local view = self.Task
	if view then
		if view.Deadline then
			local left = view.Deadline - t
			self.Timer.Text = ("⏱ %s"):format(clock(left))
			self.Timer.TextColor3 = left < 20 and Theme.Colors.Danger or Theme.Colors.Text
		else
			self.Timer.Text = ""
		end
		local extra = view.Extra or {}
		if extra.HotUntil then
			local left = extra.HotUntil - t
			self.Extra.Text = left > 0 and ("🔥 Tip window %s"):format(clock(left)) or "🥶 Pizza's cold — no tip"
		elseif extra.TransportUntil then
			local left = extra.TransportUntil - t
			self.Extra.Text = left > 0 and ("🚑 Bonus window %s"):format(clock(left)) or "No transport bonus"
		elseif extra.Limit and extra.BoardAt then
			local left = extra.BoardAt + extra.Limit - t
			self.Extra.Text = left > 0 and ("⭐ 5-star time %s  •  ~%s fare"):format(clock(left), Format.Money(extra.FareEstimate or 0)) or "Running late..."
		elseif extra.SiteProgress then
			self.Extra.Text = ("🏗️ Site %d%% built"):format(math.floor(extra.SiteProgress))
		elseif extra.Wish then
			self.Extra.Text = ("🧳 Client wants: %s"):format(extra.Wish)
		else
			self.Extra.Text = ""
		end
		if view.NeedsVehicle and not Players.LocalPlayer:GetAttribute("InVehicle") then
			self.Extra.Text = (self.Extra.Text ~= "" and (self.Extra.Text .. "\n") or "") .. "🚗 You need a car for this"
		end
	else
		local wait = self.NextAt and (self.NextAt - t) or 0
		self.Timer.Text = wait > 0 and ("Next task in %s"):format(clock(wait)) or ""
	end
end

function JobTracker:SetActionVisible(visible: boolean, text: string?, hold: boolean?)
	local holder = self.ActionHolder
	if visible then
		local label = (text or "Interact")
		if self.ActionText ~= label or not holder.Visible then
			self.ActionText = label
			self.ActionButton.Text = label
			self.ActionButton.BackgroundColor3 = hold and Theme.Colors.AccentAlt or Theme.Colors.Accent
			local hint = self:_keyHint()
			self.KeyHint.Text = hint ~= "" and (hint .. (hold and " hold" or "")) or (hold and "hold" or "")
		end
		if not holder.Visible then
			holder.Visible = true
			local s = self.ActionButton:FindFirstChildOfClass("UIScale")
			if s then
				s.Scale = 0.6
				Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
			end
		end
	else
		holder.Visible = false
	end
end

function JobTracker:SetContext(list: { { [string]: any } })
	local key = ""
	for _, c in ipairs(list) do
		key ..= c.Id .. "|" .. c.Text .. ";"
	end
	if key == self.ContextKey then
		return
	end
	self.ContextKey = key
	for _, b in ipairs(self.ContextButtons) do
		b:Destroy()
	end
	self.ContextButtons = {}
	for i, c in ipairs(list) do
		local b = Kit.Button(c.Text, c.Style or "primary", function()
			self.Handlers.OnContext(c.Id, c)
		end, { Size = UDim2.new(1, 0, 0, 44), LayoutOrder = i, TextSize = Theme.TextSize.Small + 1, Parent = self.ContextHolder })
		table.insert(self.ContextButtons, b)
	end
end

function JobTracker:Toggle()
	self.Collapsed = not self.Collapsed
	self.Body.Visible = not self.Collapsed
	self.Chevron.Text = self.Collapsed and "▸" or "▾"
end

function JobTracker:PaidPopup(amount: number)
	JobEffects.PayPopup(self.PopupHolder, amount)
end

return JobTracker
