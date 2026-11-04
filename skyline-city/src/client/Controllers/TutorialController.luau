-- TutorialController: a small, non-intrusive coach-mark card (Tutorial layer) that walks new players through
-- the steps in Shared/Config/Tutorial. The server decides progress (TutorialService); this only shows it.
--
--   * Updates whenever data.Tutorial changes (replicated by DataService).
--   * GPS hint: if the step has a target, calls PhoneController:SetWaypoint(position, label) when that
--     controller exists (optional peer).
--   * "OpenPhone" is reported from the client when the Router opens the phone panel.
--
-- API (client):
--   TutorialController:GetState() -> table?
--   TutorialController:Refresh()

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)

local Client = script.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local Kit = require(Client:WaitForChild("UI"):WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))
local Router = require(Client.UI:WaitForChild("Router"))
local Confetti = require(script.Parent:WaitForChild("Economy"):WaitForChild("Confetti"))

local TutorialController = {
	Name = "TutorialController",
	Priority = 90,
}

local localPlayer = Players.LocalPlayer

local state: { [string]: any }? = nil
local card: Frame? = nil
local cardScale: UIScale? = nil
local shownStepKey: string? = nil
local waypointSet = false
local fetching = false
local refetchQueued = false
local sessionStartedIncomplete = false
local skipped = false -- set before asking the server to skip, so the "complete + reward" card never shows

local CARD_X = 10
local CARD_Y_DESKTOP = 196
local CARD_Y_MOBILE = 160

local function phoneController()
	local pc = Registry.Find("PhoneController")
	return pc
end

local function clearWaypoint()
	if not waypointSet then
		return
	end
	waypointSet = false
	local pc = phoneController()
	if pc and type(pc.ClearWaypoint) == "function" then
		pcall(pc.ClearWaypoint, pc)
	end
end

local function setWaypoint(target)
	if not target or typeof(target.Position) ~= "Vector3" then
		return false
	end
	local pc = phoneController()
	if pc and type(pc.SetWaypoint) == "function" then
		local ok = pcall(pc.SetWaypoint, pc, target.Position, tostring(target.Label or "Tutorial"))
		waypointSet = ok
		return ok
	end
	return false
end

local function hideCard()
	local c = card
	if not c then
		return
	end
	card = nil
	Kit.Tween(c, { Position = UDim2.fromOffset(-360, c.Position.Y.Offset) }, Theme.Tween.Normal)
	task.delay(0.3, function()
		c:Destroy()
	end)
end

local function invoke(action: string, payload: { [string]: any }?)
	local res = Net.Invoke("Tutorial", action, payload or {})
	if res.ok and type(res.State) == "table" then
		state = res.State
	end
	return res
end

local render: () -> ()

local function buildCard(s)
	local compact = Kit.IsMobile()
	local y = compact and CARD_Y_MOBILE or CARD_Y_DESKTOP
	local layer = Router.GetLayer("Tutorial")
	local c = Kit.new("Frame", {
		Name = "TutorialCard",
		Position = UDim2.fromOffset(-360, y),
		Size = UDim2.fromOffset(compact and 236 or 300, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.05,
		Parent = layer,
	})
	Kit.Corner(c)
	Kit.Stroke(c, Theme.Colors.Accent, 2, 0.1)
	Kit.Padding(c, compact and 10 or 12)
	Kit.List(c, 6)
	cardScale = Kit.new("UIScale", { Parent = c })

	local total = math.max(1, (s.Total or 1) - 1) -- "Done" is not a real step
	local stepNo = math.min(s.Step or 1, total)
	Kit.Label(("TUTORIAL · STEP %d / %d"):format(stepNo, total), {
		Font = Theme.FontBold,
		TextSize = 11,
		TextColor3 = Theme.Colors.Accent,
		LayoutOrder = 1,
		Parent = c,
	})

	-- progress bar
	local bar = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 4),
		BackgroundColor3 = Theme.Colors.SurfaceAlt,
		LayoutOrder = 2,
		Parent = c,
	})
	Kit.Corner(bar, UDim.new(1, 0))
	local fill = Kit.new("Frame", {
		Size = UDim2.fromScale(math.clamp((stepNo - 1) / total, 0, 1), 1),
		BackgroundColor3 = Theme.Colors.Accent,
		Parent = bar,
	})
	Kit.Corner(fill, UDim.new(1, 0))
	Kit.Tween(fill, { Size = UDim2.fromScale(math.clamp(stepNo / total, 0, 1), 1) }, TweenInfo.new(0.8, Enum.EasingStyle.Quint))

	Kit.Label(("%s  <b>%s</b>"):format(tostring(s.Icon or "⭐"), tostring(s.Title or "")), {
		Font = Theme.FontBold,
		TextSize = compact and 15 or 17,
		LayoutOrder = 3,
		Parent = c,
	})
	Kit.Label(tostring(s.Text or ""), {
		TextSize = compact and 12 or 14,
		TextColor3 = Theme.Colors.TextDim,
		LayoutOrder = 4,
		Parent = c,
	})

	local buttons = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundTransparency = 1,
		LayoutOrder = 5,
		Parent = c,
	})
	Kit.List(buttons, 6, true)

	local hasPrimary = false
	if s.Manual then
		hasPrimary = true
		Kit.Button("Let's go!", "primary", function()
			local res = invoke("Continue", { Step = s.Id })
			if res.ok then
				render()
			else
				Router.Result(res)
			end
		end, { Size = UDim2.new(0.6, -6, 1, 0), LayoutOrder = 1, Parent = buttons })
	elseif s.Target then
		hasPrimary = true
		Kit.Button("📍 Show on GPS", "secondary", function()
			if not setWaypoint(s.Target) then
				Router.Notify(("Head to the nearest %s — check your map."):format(tostring(s.Target.Label or "marker")), "info")
			else
				Router.Notify("Waypoint set!", "success", 2)
			end
		end, { Size = UDim2.new(0.6, -6, 1, 0), TextSize = Theme.TextSize.Small, LayoutOrder = 1, Parent = buttons })
	end
	Kit.Button("Skip tutorial", "ghost", function()
		if Router.Confirm("Skip the tutorial?", ("You'll miss the %s completion reward."):format(Format.Money(s.Reward or 0)), "Skip") then
			skipped = true
			local res = invoke("Skip", nil)
			if res.ok then
				clearWaypoint()
				hideCard()
			else
				skipped = false
				Router.Result(res)
			end
		end
	end, {
		Size = hasPrimary and UDim2.new(0.4, 0, 1, 0) or UDim2.new(1, 0, 1, 0),
		TextSize = Theme.TextSize.Small,
		LayoutOrder = 2,
		Parent = buttons,
	})

	Kit.Tween(c, { Position = UDim2.fromOffset(CARD_X, y) }, Theme.Tween.Spring)
	return c
end

local function showCompleted(s)
	local compact = Kit.IsMobile()
	local layer = Router.GetLayer("Tutorial")
	local c = Kit.new("Frame", {
		Position = UDim2.fromOffset(-360, compact and CARD_Y_MOBILE or CARD_Y_DESKTOP),
		Size = UDim2.fromOffset(compact and 236 or 300, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = layer,
	})
	Kit.Corner(c)
	Kit.Stroke(c, Theme.Colors.Success, 2, 0)
	Kit.Padding(c, 12)
	Kit.List(c, 4)
	Kit.Label("🎉 <b>Tutorial complete!</b>", { TextSize = 17, LayoutOrder = 1, Parent = c })
	Kit.Label(
		(s.Reward and s.Reward > 0) and ("You earned %s. Have fun in Skyline City!"):format(Format.Money(s.Reward)) or "Have fun in Skyline City!",
		{ TextSize = 14, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 2, Parent = c }
	)
	Kit.Tween(c, { Position = UDim2.fromOffset(CARD_X, c.Position.Y.Offset) }, Theme.Tween.Spring)
	Confetti.Burst(layer, 80)
	task.delay(6, function()
		Kit.Tween(c, { Position = UDim2.fromOffset(-360, c.Position.Y.Offset) }, Theme.Tween.Normal)
		task.wait(0.3)
		c:Destroy()
	end)
end

render = function()
	local s = state
	if not s then
		return
	end
	if s.Done then
		clearWaypoint()
		if card then
			hideCard()
			if sessionStartedIncomplete and not skipped then
				sessionStartedIncomplete = false
				showCompleted(s)
			end
		end
		shownStepKey = nil
		return
	end
	local key = tostring(s.Id) .. ":" .. tostring(s.Step)
	if key == shownStepKey and card then
		return
	end
	local isAdvance = shownStepKey ~= nil
	shownStepKey = key
	clearWaypoint()
	if card then
		local old = card
		card = nil
		old:Destroy()
	end
	card = buildCard(s)
	if s.Target then
		setWaypoint(s.Target)
	end
	if isAdvance and cardScale then
		cardScale.Scale = 1.08
		Kit.Tween(cardScale, { Scale = 1 }, Theme.Tween.Spring)
	end
end

local function refresh()
	if fetching then
		refetchQueued = true
		return
	end
	fetching = true
	repeat
		refetchQueued = false
		invoke("GetState", nil)
	until not refetchQueued
	fetching = false
	render()
end

function TutorialController:GetState()
	return state
end

function TutorialController:Refresh()
	task.spawn(refresh)
end

function TutorialController:Start()
	local done = ClientData.Get("Tutorial.Done")
	if done == true then
		return -- nothing to show; no listeners needed for veterans
	end
	sessionStartedIncomplete = true

	ClientData.OnChanged("Tutorial", function()
		task.spawn(refresh)
	end)

	-- client-reportable step: opening the phone
	Router.Opened:Connect(function(name: string)
		local s = state
		if s and not s.Done and s.ClientReport and type(name) == "string" and name:find("Phone") then
			local res = invoke("Continue", { Step = s.Id })
			if res.ok then
				render()
			end
		end
	end)

	-- the GPS target depends on where the player is: refresh it after respawns
	localPlayer.CharacterAdded:Connect(function()
		task.delay(2, function()
			if state and not state.Done and state.Target then
				task.spawn(refresh)
			end
		end)
	end)

	task.spawn(refresh)
end

return TutorialController
