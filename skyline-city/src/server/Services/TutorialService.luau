-- TutorialService: the new-player walkthrough (steps in Shared/Config/Tutorial).
--
-- API (server):
--   TutorialService:Advance(player, stepId) -> boolean   -- completes the CURRENT step only if its id (or alias) matches
--   TutorialService:GetState(player) -> table
--   Systems report: "OpenPhone", "ClockIn", "FirstPay", "Deposit", "BuyCar"/"OpenGarage", "EnterBuild".
--   As a safety net this service also detects ClockIn (JobId attribute), FirstPay ("Job:"/"Wage:" pay) and
--   already-owned cars by itself, and skips steps whose system (Config `Requires`) isn't running.
--
-- Remote domain "Tutorial":
--   GetState {}           -> { State }
--   Continue { Step }     -> completes the current step if it is Manual / ClientReport and matches Step
--   Skip {}               -> ends the tutorial (no reward)

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Maid = require(Shared.Util.Maid)
local TutorialConfig = require(Shared.Config.Tutorial)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local TutorialService = {
	Name = "TutorialService",
	Priority = 50,
}

local STEPS = TutorialConfig.Steps
local LAST = #STEPS

local DataService
local EconomyService
local NotifyService

local maids: { [Player]: any } = {}

local function stepMatches(step, id: string): boolean
	if step.Id == id then
		return true
	end
	if step.Aliases then
		for _, alias in ipairs(step.Aliases) do
			if alias == id then
				return true
			end
		end
	end
	return false
end

local function stepAvailable(step): boolean
	if step.Requires then
		return Registry.Find(step.Requires) ~= nil
	end
	return true
end

-- is this step already satisfied by the player's current state?
local function alreadySatisfied(player: Player, step): boolean
	if step.Id == "ClockIn" then
		local job = player:GetAttribute("JobId")
		return type(job) == "string" and job ~= ""
	elseif step.Id == "BuyCar" then
		local cars = DataService:Get(player, "Vehicles")
		return type(cars) == "table" and next(cars) ~= nil
	end
	return false
end

local function nearestTagged(player: Player, tag: string): (Vector3?, number)
	local root = Guard.RootPosition(player)
	local best: Vector3? = nil
	local bestDist = math.huge
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		local pos: Vector3? = nil
		if inst:IsA("BasePart") then
			pos = inst.Position
		elseif inst:IsA("Model") then
			pos = inst:GetPivot().Position
		end
		if pos then
			local d = root and (pos - root).Magnitude or 0
			if d < bestDist then
				best = pos
				bestDist = d
			end
		end
	end
	return best, bestDist
end

local function finish(player: Player, rewarded: boolean)
	DataService:Set(player, "Tutorial.Step", LAST)
	DataService:Set(player, "Tutorial.Done", true)
	if rewarded then
		local reward = math.max(0, math.floor(TutorialConfig.Reward or 0))
		if reward > 0 then
			EconomyService:AddCash(player, reward, "Reward:Tutorial")
		end
		NotifyService:Send(
			player,
			("🎉 Tutorial complete!%s"):format(reward > 0 and (" +" .. Format.Money(reward)) or ""),
			"success",
			6
		)
	end
end

-- Move to `index`, skipping unavailable / already satisfied steps. Reaching the last step finishes.
local function goTo(player: Player, index: number)
	local i = index
	while i < LAST do
		local step = STEPS[i]
		if stepAvailable(step) and not alreadySatisfied(player, step) then
			break
		end
		i += 1
	end
	if i >= LAST then
		finish(player, true)
		return
	end
	DataService:Set(player, "Tutorial.Step", i)
end

local function buildState(player: Player)
	local done = DataService:Get(player, "Tutorial.Done") == true
	local index = math.clamp(DataService:Get(player, "Tutorial.Step") or 1, 1, LAST)
	local step = STEPS[index]
	local state = {
		Done = done,
		Step = index,
		Total = LAST,
		Id = step.Id,
		Icon = step.Icon,
		Title = step.Title,
		Text = step.Text,
		Manual = step.Manual == true,
		ClientReport = step.ClientReport == true,
		Reward = TutorialConfig.Reward,
	}
	if not done and step.Tag then
		local pos = nearestTagged(player, step.Tag)
		if pos then
			state.Target = { Position = pos, Label = step.WaypointLabel or step.Title }
		end
	end
	return state
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function TutorialService:Advance(player: Player, stepId: string): boolean
	if typeof(player) ~= "Instance" or not player:IsA("Player") or type(stepId) ~= "string" then
		return false
	end
	if not DataService:IsLoaded(player) or DataService:Get(player, "Tutorial.Done") == true then
		return false
	end
	local index = DataService:Get(player, "Tutorial.Step") or 1
	local step = STEPS[index]
	if not step or not stepMatches(step, stepId) then
		return false
	end
	goTo(player, index + 1)
	return true
end

function TutorialService:GetState(player: Player)
	if not DataService:IsLoaded(player) then
		return nil
	end
	return buildState(player)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function TutorialService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")

	Net.HandleActions("Tutorial", {
		GetState = function(player: Player, _payload)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			return { ok = true, State = buildState(player) }
		end,
		Continue = function(player: Player, payload)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			local id = Guard.Id(payload.Step, 32)
			if not id then
				return { ok = false, err = "Bad step" }
			end
			local index = DataService:Get(player, "Tutorial.Step") or 1
			local step = STEPS[index]
			if DataService:Get(player, "Tutorial.Done") or not step or step.Id ~= id then
				return { ok = false, err = "Not the current step" }
			end
			if not (step.Manual or step.ClientReport) then
				return { ok = false, err = "Complete this step in the world" }
			end
			TutorialService:Advance(player, id)
			return { ok = true, State = buildState(player) }
		end,
		Skip = function(player: Player, _payload)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading" }
			end
			if DataService:Get(player, "Tutorial.Done") ~= true then
				finish(player, false)
			end
			return { ok = true, State = buildState(player) }
		end,
	}, { rate = 2, burst = 6 })

	-- FirstPay safety net: any job / wage paycheck
	EconomyService.Transaction:Connect(function(player: Player, delta: number, reason: string)
		if delta > 0 and type(reason) == "string" and (reason:sub(1, 4) == "Job:" or reason:sub(1, 5) == "Wage:") then
			TutorialService:Advance(player, "FirstPay")
		end
	end)

	DataService:OnLoaded(function(player: Player)
		if maids[player] then
			maids[player]:Clean()
		end
		local maid = Maid.new()
		maids[player] = maid
		maid:Give(player:GetAttributeChangedSignal("JobId"):Connect(function()
			local job = player:GetAttribute("JobId")
			if type(job) == "string" and job ~= "" then
				TutorialService:Advance(player, "ClockIn")
			end
		end))
		-- re-validate the saved step (systems may have been added / removed since last session)
		if DataService:Get(player, "Tutorial.Done") ~= true then
			local index = math.clamp(DataService:Get(player, "Tutorial.Step") or 1, 1, LAST)
			goTo(player, index)
		end
	end)

	-- cars can be granted by any system: watch the Vehicles table cheaply at the BuyCar step
	task.spawn(function()
		while true do
			task.wait(5)
			for _, player in ipairs(Players:GetPlayers()) do
				if DataService:IsLoaded(player) and DataService:Get(player, "Tutorial.Done") ~= true then
					local step = STEPS[DataService:Get(player, "Tutorial.Step") or 1]
					if step and step.Id == "BuyCar" and alreadySatisfied(player, step) then
						TutorialService:Advance(player, "BuyCar")
					end
				end
			end
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		local maid = maids[player]
		if maid then
			maid:Clean()
			maids[player] = nil
		end
	end)
end

return TutorialService
