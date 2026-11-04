-- JobController: client side of the jobs system.
--   * Panels: "JobOffer", "Jobs" (phone app list), "RepairOffer" (JobPanels), "JobMinigame" (custom, Modal layer)
--   * HUD side-bar button "Jobs" (order 20), job tracker card, contextual action button, GPS beam
--   * Listens to "JobEvent" (s->c); every reward is decided by the server — minigames only send input.
--
-- Public (client):
--   JobController:GetCurrentJob() -> jobId?
--   JobController:GetState() -> state?
--   JobController:ClockIn(jobId) -> boolean
--   JobController:ClockOut() -> boolean
--   JobController:Act(op, payload?, quiet?) -> res
--   JobController:SetStationWaypoint(position, label)

local CollectionService = game:GetService("CollectionService")
local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Config = require(Shared.Config.Jobs)
local World = require(Shared.Config.World)

local Client = script.Parent.Parent.Parent
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))

local JobPanels = require(script.Parent.JobPanels)
local JobTracker = require(script.Parent.JobTracker)
local JobWaypoint = require(script.Parent.JobWaypoint)
local JobEffects = require(script.Parent.JobEffects)

local MinigameFolder = script.Parent:WaitForChild("Minigames")
local MinigameCommon = require(MinigameFolder:WaitForChild("Common"))

local JobController = {
	Name = "JobController",
	Priority = 60,
}

local player = Players.LocalPlayer

local state = nil
local taskView = nil
local tracker = nil
local waypoint = nil
local stationWaypoint = nil
local actionAvailable = false
local actionHeld = false
local hoseToken = 0 -- bumps every time the hose starts/stops so stale refresh loops exit
local actBusy = false
local mgToken = 0
local mgTaskId: number? = nil
local minigames: { [string]: any } = {}

local ACTION_NAME = "SkylineJobAction"
local TRACKER_NAME = "SkylineJobTracker"
local ACTION_PRIORITY = 3150 -- above Config/Driving.ActionPriority (3100), below the tuning orbit sink (3300)

local function keyCode(name: string?): Enum.KeyCode?
	if not name then
		return nil
	end
	local ok, kc = pcall(function()
		return (Enum.KeyCode :: any)[name]
	end)
	return ok and kc or nil
end

local function loadMinigame(kind: string)
	if minigames[kind] ~= nil then
		return minigames[kind]
	end
	local m = MinigameFolder:FindFirstChild(kind)
	if m and m:IsA("ModuleScript") then
		local ok, mod = pcall(require, m)
		if ok then
			minigames[kind] = mod
			return mod
		end
		warn("[JobController] minigame failed to load:", kind, mod)
	end
	minigames[kind] = false
	return false
end

---------------------------------------------------------------------------
-- Task / state
---------------------------------------------------------------------------
local function stopHose(send: boolean?)
	if not actionHeld then
		return
	end
	actionHeld = false
	hoseToken += 1 -- the refresh loop exits on its own once the token changes
	JobEffects.StopHose()
	if send ~= false and taskView and taskView.Hold then
		task.spawn(function()
			JobController:Act(taskView.Action, { On = false }, true)
		end)
	end
end

local function nearestFire(): Vector3?
	local extra = taskView and taskView.Extra
	local fires = extra and extra.Fires
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if type(fires) ~= "table" or not root then
		return nil
	end
	local best, bestD = nil, math.huge
	for _, pos in ipairs(fires) do
		if typeof(pos) == "Vector3" then
			local d = (pos - (root :: BasePart).Position).Magnitude
			if d < bestD then
				best, bestD = pos, d
			end
		end
	end
	return best
end

local function setTask(view)
	taskView = view
	if tracker then
		tracker:SetTask(view)
	end
	if waypoint then
		if view and typeof(view.Target) == "Vector3" then
			local cfg = Config.Jobs[view.JobId or ""]
			waypoint:Set(view.Target, view.TargetLabel or view.Title or "Task", view.Icon, cfg and cfg.UniformColor)
		else
			waypoint:Clear()
		end
	end
	if not (view and view.Hold) then
		stopHose(false)
	end
end

local function applyTaskFromResponse(sentId: number?, res)
	if res.HasTask == nil then
		return
	end
	if res.Task then
		if not taskView or res.Task.Id >= taskView.Id then
			setTask(res.Task)
		end
	elseif taskView and taskView.Id == sentId then
		setTask(nil)
	end
end

local function bindAction()
	local primary = keyCode(Config.Keybinds.Action) or Enum.KeyCode.G
	local pad = keyCode(Config.Keybinds.ActionGamepad) or Enum.KeyCode.ButtonY
	-- Bound above the driving controls (Config/Driving.ActionPriority) so G / ButtonY reach the job
	-- (taxi Board/Drop, hose...) while seated; it only Sinks while a job action is available, otherwise
	-- G stays the seatbelt in a car and ButtonY falls through to the phone. See docs/CONTROLS.md.
	ContextActionService:BindActionAtPriority(ACTION_NAME, function(_, inputState)
		if not actionAvailable then
			return Enum.ContextActionResult.Pass
		end
		if inputState == Enum.UserInputState.Begin then
			JobController:_onAction(true)
		elseif inputState == Enum.UserInputState.End or inputState == Enum.UserInputState.Cancel then
			JobController:_onAction(false)
		end
		return Enum.ContextActionResult.Sink
	end, false, ACTION_PRIORITY, primary, pad)

	local tk = keyCode(Config.Keybinds.Tracker) or Enum.KeyCode.J
	local tpad = keyCode(Config.Keybinds.TrackerGamepad) or Enum.KeyCode.ButtonL1
	ContextActionService:BindAction(TRACKER_NAME, function(_, inputState)
		if not state then
			return Enum.ContextActionResult.Pass
		end
		if inputState == Enum.UserInputState.Begin and tracker then
			tracker:Toggle()
		end
		return Enum.ContextActionResult.Sink
	end, false, tk, tpad)
end

local function unbindAction()
	ContextActionService:UnbindAction(ACTION_NAME)
	ContextActionService:UnbindAction(TRACKER_NAME)
end

local function applyState(st)
	local wasOn = state ~= nil
	state = st
	if tracker then
		tracker:SetState(st)
	end
	if st then
		if not wasOn then
			bindAction()
			JobEffects.Play("ClockIn")
		end
		if stationWaypoint then
			stationWaypoint:Clear()
		end
		setTask(st.Task)
		if tracker then
			tracker:SetNextAt(st.NextTaskAt)
		end
	else
		unbindAction()
		stopHose(false)
		setTask(nil)
		if Router.IsOpen("JobMinigame") then
			Router.Close("JobMinigame")
		end
	end
end

---------------------------------------------------------------------------
-- Public
---------------------------------------------------------------------------
function JobController:GetCurrentJob(): string?
	return state and state.JobId or nil
end

function JobController:GetState()
	return state
end

function JobController:ClockIn(jobId: string): boolean
	local res = Net.Invoke("Jobs", "ClockIn", { JobId = jobId })
	if res.ok then
		applyState(res.State)
		return true
	end
	Router.Notify(res.err or "Couldn't clock in", res.Queue and "warning" or "error", 5)
	return false
end

function JobController:ClockOut(): boolean
	local res = Net.Invoke("Jobs", "ClockOut", {})
	if Router.Result(res) then
		applyState(nil)
		return true
	end
	return false
end

function JobController:SetStationWaypoint(position: Vector3, label: string)
	if stationWaypoint then
		stationWaypoint:Set(position, label, "📍", Theme.Colors.Success)
	end
end

function JobController:OpenMinigame(mg)
	if type(mg) ~= "table" or type(mg.Type) ~= "string" then
		return
	end
	if not loadMinigame(mg.Type) then
		return
	end
	stopHose()
	Router.Open("JobMinigame", mg)
end

function JobController:Act(op: string, payload: { [string]: any }?, quiet: boolean?)
	local p = payload or {}
	p.Op = op
	local sentId = taskView and taskView.Id or nil
	p.TaskId = sentId
	local res = Net.Invoke("Jobs", "Act", p)
	applyTaskFromResponse(sentId, res)
	if not quiet then
		if not res.ok and res.err and not res.Soft then
			Router.Notify(res.err, "error", 3)
		elseif res.Result then
			Router.Notify(res.Result, "info", 3)
		end
	end
	if res.Minigame then
		self:OpenMinigame(res.Minigame)
	end
	return res
end

function JobController:_onAction(began: boolean)
	local view = taskView
	if not view or not view.Action then
		return
	end
	if view.Hold then
		if began and not actionHeld then
			actionHeld = true
			hoseToken += 1
			local myToken = hoseToken
			JobEffects.StartHose(nearestFire)
			local op = view.Action
			task.spawn(function()
				while actionHeld and hoseToken == myToken do
					JobController:Act(op, { On = true }, true)
					task.wait(1)
				end
			end)
		elseif not began then
			stopHose()
		end
		return
	end
	if began and not actBusy then
		actBusy = true
		self:Act(view.Action, {})
		actBusy = false
	end
end

---------------------------------------------------------------------------
-- Minigame host panel
---------------------------------------------------------------------------
local function buildMinigame(content: Frame, data, ctx)
	local mod = loadMinigame(data and data.Type or "")
	if not mod then
		task.defer(ctx.Close)
		return
	end
	mgToken += 1
	local myToken = mgToken
	mgTaskId = data.TaskId

	local overlay = Kit.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Colors.Overlay,
		BackgroundTransparency = 0.5,
		Active = true,
		Parent = content,
	})
	local card = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.94, 0.88),
		BackgroundColor3 = Theme.Colors.Surface,
		Parent = overlay,
	})
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(480, 600), Parent = card })
	Kit.Corner(card)
	Kit.Stroke(card)
	local scale = Kit.new("UIScale", { Scale = 0.85, Parent = card })
	Kit.Tween(scale, { Scale = 1 }, Theme.Tween.Spring)

	local cfg = state and Config.Jobs[state.JobId]
	Kit.Label(("%s  %s"):format(cfg and cfg.Icon or "💼", cfg and cfg.Name or "Job"), {
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small + 1,
		TextColor3 = Theme.Colors.TextDim,
		Position = UDim2.fromOffset(16, 0),
		Size = UDim2.new(1, -70, 0, 48),
		AutomaticSize = Enum.AutomaticSize.None,
		TextYAlignment = Enum.TextYAlignment.Center,
		Parent = card,
	})
	Kit.IconButton("✕", function()
		ctx.Close()
	end, { Size = UDim2.fromOffset(40, 40), Position = UDim2.new(1, -48, 0, 4), TextSize = 18, Parent = card })

	local body = Kit.Scroll({
		Position = UDim2.fromOffset(16, 48),
		Size = UDim2.new(1, -32, 1, -60),
		Parent = card,
	}, 10)

	local mg = {}
	mg.Maid = ctx.Maid
	mg.TaskId = data.TaskId
	mg.Notify = function(text: string, kind: string?)
		Router.Notify(text, kind or "info", 3)
	end
	mg.IsOpen = function(): boolean
		return mgToken == myToken and Router.IsOpen("JobMinigame")
	end
	mg.Close = function()
		if mg.IsOpen() then
			ctx.Close()
		end
	end
	mg.Send = function(payload: { [string]: any }, opts: { [string]: any }?)
		local op = (data.Data and data.Data.Op) or "Submit"
		local res = JobController:Act(op, payload)
		if not mg.IsOpen() or res.Minigame then
			return res
		end
		local taskGone = res.HasTask ~= nil and (not res.Task or res.Task.Id ~= data.TaskId)
		if taskGone or res.Done or (res.ok and not (opts and opts.KeepOpen)) then
			ctx.Close()
		end
		return res
	end

	MinigameCommon.Bind(ctx.Maid, "Close", function(inputState)
		if inputState == Enum.UserInputState.Begin then
			mg.Close()
		end
	end, Enum.KeyCode.ButtonB)

	local ok, err = pcall(mod.Build, body, data.Data or {}, mg)
	if not ok then
		warn("[JobController] minigame build failed:", err)
		task.defer(ctx.Close)
	end
	return function()
		if mgToken == myToken then
			mgTaskId = nil
		end
	end
end

---------------------------------------------------------------------------
-- Context actions (police cuffs / mechanic player repairs)
---------------------------------------------------------------------------
local overlap = OverlapParams.new()
overlap.FilterType = Enum.RaycastFilterType.Exclude
overlap.MaxParts = 200

local function carModelOf(part: BasePart): Model?
	local m = part:FindFirstAncestorWhichIsA("Model")
	while m do
		if m:GetAttribute("CarUid") then
			return m
		end
		m = m:FindFirstAncestorWhichIsA("Model")
	end
	return nil
end

local function scanContext()
	if not (state and tracker) then
		return
	end
	local list = {}
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		if state.JobId == "Police" then
			local range = Config.Jobs.Police.PlayerCuffDistance
			for _, p in ipairs(Players:GetPlayers()) do
				if p ~= player and p:GetAttribute("Wanted") == true and not p:GetAttribute("Cuffed") and not p:GetAttribute("InSafeZone") then
					local r = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
					if r and r:IsA("BasePart") and (r.Position - root.Position).Magnitude <= range then
						table.insert(list, { Id = "Cuff", Text = "🔗 Cuff " .. p.DisplayName, Style = "danger", UserId = p.UserId })
					end
				end
			end
		elseif state.JobId == "Mechanic" then
			local cfg = Config.Jobs.Mechanic
			local inBay = false
			for _, bay in ipairs(CollectionService:GetTagged(World.Tags.MechanicBay)) do
				local pos = bay:IsA("BasePart") and bay.Position or (bay:IsA("Model") and bay:GetPivot().Position)
				if pos and (pos - root.Position).Magnitude <= cfg.BayDistance then
					inBay = true
					break
				end
			end
			if inBay then
				overlap.FilterDescendantsInstances = { char :: Model }
				local seen = {}
				for _, part in ipairs(Workspace:GetPartBoundsInRadius(root.Position, cfg.CarDistance, overlap)) do
					local car = carModelOf(part)
					if car and not seen[car] then
						seen[car] = true
						local owner = car:GetAttribute("OwnerUserId")
						local health = car:GetAttribute("Health")
						if
							type(owner) == "number"
							and owner ~= player.UserId
							and type(health) == "number"
							and health < 99.5
							and not car:GetAttribute("IsJobVehicle")
							and not car:GetAttribute("IsTestDrive")
						then
							local op = Players:GetPlayerByUserId(owner)
							if op then
								table.insert(list, {
									Id = "Repair",
									Text = ("🔧 Offer repair: %s (%d%%)"):format(op.DisplayName, math.floor(health)),
									Style = "success",
									OwnerUserId = owner,
								})
							end
						end
					end
				end
			end
		end
	end
	tracker:SetContext(list)
end

---------------------------------------------------------------------------
-- Events
---------------------------------------------------------------------------
local function onEvent(kind: string, data: any)
	if kind == "State" then
		applyState(data)
	elseif kind == "Task" then
		if state then
			setTask(data)
			JobEffects.Play("Notify")
		end
	elseif kind == "TaskEnded" then
		if type(data) ~= "table" then
			return
		end
		if taskView and taskView.Id == data.TaskId then
			setTask(nil)
		end
		if tracker then
			tracker:SetNextAt(data.NextAt)
		end
		if mgTaskId == data.TaskId and Router.IsOpen("JobMinigame") then
			Router.Close("JobMinigame")
		end
		if data.Outcome == "Complete" then
			JobEffects.Play("TaskComplete")
		end
	elseif kind == "Paid" then
		if type(data) == "table" and tracker and state then
			data.Title = state.Title
			tracker:SetProgress(data)
			tracker:PaidPopup(data.Amount or 0)
			JobEffects.Play("Money")
		end
	elseif kind == "LevelUp" then
		if type(data) == "table" and state then
			state.Title = data.Title
			state.Level = data.Level
			if tracker then
				tracker:SetProgress({ Level = data.Level, Title = data.Title, XP = state.XP or 0, XPNext = state.XPNext or 0 })
			end
			JobEffects.Play("LevelUp")
		end
	elseif kind == "Queue" then
		if type(data) == "table" and data.Ready then
			local cfg = Config.Jobs[data.JobId or ""]
			if typeof(data.Station) == "Vector3" and cfg then
				JobPanels.SetWaypoint(JobController, data.Station, ("%s %s"):format(cfg.Icon, cfg.Name))
			end
			JobEffects.Play("Notify")
		end
	elseif kind == "Progress" then
		if type(data) == "table" and taskView and data.TaskId == taskView.Id then
			if data.Progress then
				taskView.Progress = data.Progress
			end
			if data.ProgressText then
				taskView.ProgressText = data.ProgressText
			end
			if data.Extra then
				taskView.Extra = data.Extra
			end
			if tracker then
				tracker:SetProgressBar(taskView.Progress, taskView.ProgressText)
				tracker:Tick()
			end
		end
	end
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function JobController:Init()
	JobPanels.Register(self)
	Router.Register("JobMinigame", {
		Kind = "custom",
		Layer = "Modal",
		Build = buildMinigame,
	})
end

function JobController:Start()
	tracker = JobTracker.new({
		OnAction = function(began: boolean)
			task.spawn(function()
				JobController:_onAction(began)
			end)
		end,
		OnClockOut = function()
			JobController:ClockOut()
		end,
		OnContext = function(id: string, c)
			if id == "Cuff" then
				JobController:Act("CuffPlayer", { UserId = c.UserId })
			elseif id == "Repair" then
				JobController:Act("OfferRepair", { OwnerUserId = c.OwnerUserId })
			end
		end,
	})
	waypoint = JobWaypoint.new()
	stationWaypoint = JobWaypoint.new()

	Router.AddHudButton("Jobs", "💼", "Jobs", 20, function()
		Router.Toggle("Jobs")
	end)

	Net.Listen("JobEvent", onEvent)

	player.CharacterRemoving:Connect(function()
		stopHose()
	end)

	local res = Net.Invoke("Jobs", "GetState", {})
	if res.ok then
		applyState(res.State)
	end

	-- light-weight UI loop (client visuals only)
	task.spawn(function()
		local acc = 0
		while true do
			local dt = task.wait(0.15)
			acc += dt
			-- action availability
			local view = taskView
			local avail = false
			if state and view and view.Action and not Router.IsOpen("JobMinigame") then
				if typeof(view.Target) ~= "Vector3" then
					avail = true
				else
					local d = waypoint:Distance()
					avail = d ~= nil and d <= (view.Radius or Config.General.DefaultInteractRadius) + 2
				end
			end
			if avail ~= actionAvailable or avail then
				actionAvailable = avail
				tracker:SetActionVisible(avail, view and view.ActionText, view and view.Hold)
			end
			if not avail and actionHeld then
				stopHose()
			end
			if acc >= 0.3 then
				acc = 0
				waypoint:Update()
				stationWaypoint:Update()
				local sd = stationWaypoint:Distance()
				if sd and sd < 20 then
					stationWaypoint:Clear()
				end
				tracker:Tick()
				if state then
					scanContext()
				end
			end
		end
	end)
end

return JobController
