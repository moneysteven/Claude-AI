-- WorkHud (client helper): HUD for players employed by a player business.
-- Shows "<role> at <business>" and a big work button that lights up when you stand next to a built station
-- matching your role (Stove for Cooks, Register for Cashiers, ...). Server re-validates distance + cooldown.
--   WorkHud.Start()
-- Keys: F (PC) · ButtonY (gamepad) · on-screen button (touch). Bound only while next to a station.
-- Reads player attributes set by the server: BizRole, BizWage, BizEmployerLot, EmployerName, InVehicle.

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Businesses)

local Client = script.Parent.Parent.Parent
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))
local Kit = require(Client.UI:WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local WorkHud = {}

local ACTION = "SkylineBizWorkTask"
local player = Players.LocalPlayer

local frame: Frame
local infoLabel: TextLabel
local workButton: TextButton
local cooldownFill: Frame
local bound = false
local busy = false
local cooldownUntil = 0
local cooldownTotal = 1
local nearStation = false

local function nearMatchingStation(role): boolean
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	local lotId = player:GetAttribute("BizEmployerLot")
	if not root or type(lotId) ~= "string" then
		return false
	end
	local businesses = Workspace:FindFirstChild("SkylineBusinesses")
	local lotFolder = businesses and businesses:FindFirstChild(lotId)
	local build = lotFolder and lotFolder:FindFirstChild("Build")
	if not build then
		return false
	end
	local pos = (root :: BasePart).Position
	local maxDist = Config.PlayerWork.TaskDistance - 0.5
	for _, m in ipairs(build:GetChildren()) do
		if m:IsA("Model") then
			local fn = m:GetAttribute("Function")
			if fn and table.find(role.Stations, fn) then
				local ok, pivot = pcall(m.GetPivot, m)
				if ok and (pivot.Position - pos).Magnitude <= maxDist then
					return true
				end
			end
		end
	end
	return false
end

local function doTask()
	if busy then
		return
	end
	if os.clock() < cooldownUntil then
		return
	end
	busy = true
	local res = Net.Invoke("Business", "WorkTask", {})
	busy = false
	if res.ok then
		cooldownTotal = math.max(0.5, tonumber(res.Cooldown) or 8)
		cooldownUntil = os.clock() + cooldownTotal
		Router.Notify(("%s · +%s"):format(res.TaskName or "Task done", Format.Money(tonumber(res.Paid) or 0)), "money", 2)
		local s = workButton:FindFirstChildOfClass("UIScale")
		if s then
			s.Scale = 1.12
			Kit.Tween(s, { Scale = 1 }, Theme.Tween.Spring)
		end
	else
		if tonumber(res.Cooldown) then
			cooldownTotal = math.max(0.5, tonumber(res.Cooldown) :: number)
			cooldownUntil = os.clock() + cooldownTotal
		end
		Router.Notify(res.err or "Couldn't do that", "error", 3)
	end
end

local function bind(on: boolean)
	if on == bound then
		return
	end
	bound = on
	if on then
		ContextActionService:BindAction(ACTION, function(_, state)
			if state == Enum.UserInputState.Begin then
				task.spawn(doTask)
				return Enum.ContextActionResult.Sink
			end
			return Enum.ContextActionResult.Pass
		end, false, Enum.KeyCode.F, Enum.KeyCode.ButtonY)
	else
		ContextActionService:UnbindAction(ACTION)
	end
end

local function build()
	local layer = Router.GetLayer("HUD")
	frame = Kit.new("Frame", {
		Name = "BusinessWorkHud",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -96),
		Size = UDim2.fromOffset(330, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.Colors.Surface,
		BackgroundTransparency = 0.1,
		Visible = false,
		Parent = layer,
	})
	Kit.Corner(frame)
	Kit.Stroke(frame)
	Kit.Padding(frame, 10)
	Kit.List(frame, 6, false, Enum.HorizontalAlignment.Center)
	local top = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 1, Parent = frame })
	infoLabel = Kit.Label("", {
		Size = UDim2.new(1, -52, 1, 0),
		AutomaticSize = Enum.AutomaticSize.None,
		TextYAlignment = Enum.TextYAlignment.Center,
		TextSize = Theme.TextSize.Small + 1,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = top,
	})
	Kit.IconButton("✕", function()
		if Router.Confirm("Quit your business job?", nil, "Quit") then
			Router.Result(Net.Invoke("Business", "QuitJob", {}), "You quit your job")
		end
	end, {
		Size = UDim2.fromOffset(44, 44),
		Position = UDim2.new(1, -44, 0, 0),
		TextSize = 16,
		Parent = top,
	})
	workButton = Kit.Button("", "success", doTask, {
		Size = UDim2.new(1, 0, 0, 52),
		LayoutOrder = 2,
		Parent = frame,
	})
	local bar = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 6),
		BackgroundColor3 = Theme.Colors.Background,
		LayoutOrder = 3,
		Parent = frame,
	})
	Kit.Corner(bar, UDim.new(1, 0))
	cooldownFill = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Theme.Colors.Money, Parent = bar })
	Kit.Corner(cooldownFill, UDim.new(1, 0))
end

local function update()
	local roleId = player:GetAttribute("BizRole")
	local role = type(roleId) == "string" and Config.Roles[roleId] or nil
	local inVehicle = player:GetAttribute("InVehicle") == true
	if not role or inVehicle then
		frame.Visible = false
		bind(false)
		return
	end
	frame.Visible = true
	local employer = player:GetAttribute("EmployerName")
	infoLabel.Text = ("%s <b>%s</b> at %s · %s/task"):format(
		role.Icon,
		role.Name,
		type(employer) == "string" and employer ~= "" and employer or "a business",
		Format.Money(tonumber(player:GetAttribute("BizWage")) or 0)
	)
	nearStation = nearMatchingStation(role)
	local now = os.clock()
	local cooling = now < cooldownUntil
	cooldownFill.Size = UDim2.fromScale(cooling and 1 - (cooldownUntil - now) / cooldownTotal or 1, 1)
	local keyHint = Kit.IsGamepad() and " (Y)" or (Kit.IsMobile() and "" or " (F)")
	if nearStation then
		workButton.Text = ("%s %s%s"):format(role.TaskIcon, role.TaskName, keyHint)
		workButton.BackgroundColor3 = cooling and Theme.Colors.SurfaceAlt or Theme.Colors.Success
		workButton.TextColor3 = cooling and Theme.Colors.TextDim or Theme.Colors.Text
	else
		local names = {}
		for _, fn in ipairs(role.Stations) do
			table.insert(names, Config.FunctionNames[fn] or fn)
			if #names >= 2 then
				break
			end
		end
		workButton.Text = "Go to a " .. table.concat(names, " / ")
		workButton.BackgroundColor3 = Theme.Colors.SurfaceAlt
		workButton.TextColor3 = Theme.Colors.TextDim
	end
	bind(nearStation)
end

function WorkHud.Start()
	build()
	task.spawn(function()
		while true do
			local ok, err = pcall(update)
			if not ok then
				warn("[WorkHud]", err)
			end
			task.wait(0.25)
		end
	end)
end

return WorkHud
