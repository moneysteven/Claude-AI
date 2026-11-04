-- HousingController: knows where the local player may build and shows the HUD "Build" button there.
--   * Build areas come from Build.GetBuildable + BuildEvent "Buildable" (homes, businesses, friends' homes
--     that gave you build permission).
--   * Checks at 2 Hz whether the character stands inside one; the 🔨 Build button (HUD order 30, key B)
--     is visible only then.
--
-- API (client):
--   HousingController:GetBuildableHere() -> contextId?
--   HousingController:GetState(force?) -> table?   cached Housing.GetState (refreshed every 10 s or when forced)
--   HousingController:EnterBuild()

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local BuildMath = require(Shared.Build.BuildMath)

local Client = script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))

local HousingController = {
	Name = "HousingController",
	Priority = 55,
}

local player = Players.LocalPlayer
local buildables: { any } = {}
local current: string? = nil
local bound = false
local cachedState = nil
local cachedAt = 0

local function inside(b, pos: Vector3): boolean
	if typeof(b.Origin) ~= "CFrame" or typeof(b.Size) ~= "Vector3" then
		return false
	end
	return BuildMath.PointInArea(b.Origin, b.Size, pos, 4, b.Height or 40)
end

local function setButton(visible: boolean)
	Router.SetHudButtonVisible("Build", visible)
	if visible and not bound then
		bound = true
		-- B = Build while standing in an area you may build in (bound above Default so it deterministically
		-- beats the emote wheel, which owns B everywhere else; the wheel stays on its HUD button). See docs/CONTROLS.md.
		ContextActionService:BindActionAtPriority("SkylineEnterBuild", function(_, state)
			if state == Enum.UserInputState.Begin then
				HousingController:EnterBuild()
			end
			return Enum.ContextActionResult.Sink
		end, false, Enum.ContextActionPriority.Default.Value + 10, Enum.KeyCode.B)
	elseif not visible and bound then
		bound = false
		ContextActionService:UnbindAction("SkylineEnterBuild")
	end
end

local function tick()
	local build = Registry.Find("BuildController")
	if build and build:IsActive() then
		setButton(false)
		return
	end
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	local found = nil
	if root and root:IsA("BasePart") and not player:GetAttribute("InVehicle") then
		-- prefer areas we own, then any other we may build in
		for _, b in ipairs(buildables) do
			if inside(b, root.Position) then
				if b.IsOwner or not found then
					found = b
				end
			end
		end
	end
	current = found and found.Id or nil
	setButton(current ~= nil)
end

function HousingController:GetBuildableHere(): string?
	return current
end

function HousingController:EnterBuild()
	local build = Registry.Find("BuildController")
	if build and current and not build:IsActive() then
		task.spawn(function()
			build:Enter(current)
		end)
	end
end

function HousingController:GetState(force: boolean?)
	if force or not cachedState or os.clock() - cachedAt > 10 then
		local res = Net.Invoke("Housing", "GetState", {})
		if res.ok then
			cachedState = res
			cachedAt = os.clock()
		end
	end
	return cachedState
end

function HousingController:Init()
	Router.AddHudButton("Build", "🔨", "Build", 30, function()
		HousingController:EnterBuild()
	end)
	Router.SetHudButtonVisible("Build", false)
end

function HousingController:Start()
	Net.Listen("BuildEvent", function(kind, list)
		if kind == "Buildable" and type(list) == "table" then
			buildables = list
			tick()
		end
	end)
	task.spawn(function()
		local res = Net.Invoke("Build", "GetBuildable", {})
		if res.ok and type(res.List) == "table" then
			buildables = res.List
		end
	end)
	task.spawn(function()
		while true do
			task.wait(0.5)
			local ok, err = pcall(tick)
			if not ok then
				warn("[HousingController]", err)
			end
		end
	end)
end

return HousingController
