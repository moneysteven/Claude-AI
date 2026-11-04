-- TestDrive: 90-second test drives from the dealership.
--
--   * one at a time per player, cooldown between drives
--   * spawns at the nearest TestDriveSpawn tag (or in front of the dealership counter)
--   * VehicleService:SpawnTestDrive builds the car (attribute IsTestDrive = true: can't be refuelled / sold)
--   * ends on timeout, when the car is destroyed, when the player dies / leaves, drives too far away,
--     or asks to end it — the car despawns and the player is returned to where they started
--   * the client gets the "TestDrive" HUD via NotifyService:OpenUI and it is closed with CloseUI
--
--   TestDrive.Init(deps)                       deps = { NotifyService }
--   TestDrive.Start(player, modelId, counter) -> (ok, err?)
--   TestDrive.Stop(player, reason?)
--   TestDrive.IsActive(player) -> boolean
--   TestDrive.CooldownLeft(player) -> number
--   TestDrive.StartLoop()

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Maid = require(Shared.Util.Maid)
local World = require(Shared.Config.World)
local DealerCfg = require(Shared.Config.Dealership)

local Common = require(script.Parent.Common)
local Catalog = require(script.Parent.Catalog)
local Registry = require(game:GetService("ServerScriptService"):WaitForChild("Server").Registry)

local T = DealerCfg.TestDrive

local TestDrive = {}

type Session = {
	Model: Model?,
	ModelId: string,
	EndsAt: number,
	ReturnCFrame: CFrame,
	StartPos: Vector3,
	Maid: any,
	Ending: boolean,
	Seated: boolean,
}

local sessions: { [Player]: Session } = {}
local cooldownUntil: { [Player]: number } = {}
local Notify

function TestDrive.Init(deps)
	Notify = deps.NotifyService
	Players.PlayerRemoving:Connect(function(player)
		TestDrive.Stop(player, "left", true)
		cooldownUntil[player] = nil
	end)
end

function TestDrive.IsActive(player: Player): boolean
	return sessions[player] ~= nil
end

function TestDrive.CooldownLeft(player: Player): number
	local t = cooldownUntil[player]
	if not t then
		return 0
	end
	return math.max(0, math.ceil(t - os.clock()))
end

local function spawnCFrame(counter: Instance?): CFrame?
	local origin: Vector3? = nil
	if counter then
		if counter:IsA("BasePart") then
			origin = counter.Position
		elseif counter:IsA("Model") then
			origin = counter:GetPivot().Position
		end
	end
	local best: BasePart? = nil
	local bestDist = math.huge
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.TestDriveSpawn)) do
		if inst:IsA("BasePart") and inst:IsDescendantOf(Workspace) then
			local d = origin and (inst.Position - origin).Magnitude or 0
			if d < bestDist and d <= T.SpawnSearchRadius then
				best = inst
				bestDist = d
			end
		end
	end
	if best then
		local top = best.CFrame * CFrame.new(0, best.Size.Y / 2 + 3, 0)
		local look = best.CFrame.LookVector
		local flat = Vector3.new(look.X, 0, look.Z)
		if flat.Magnitude < 0.01 then
			flat = Vector3.new(0, 0, -1)
		end
		return CFrame.lookAt(top.Position, top.Position + flat.Unit)
	end
	if counter and counter:IsA("BasePart") then
		local look = counter.CFrame.LookVector
		local flat = Vector3.new(look.X, 0, look.Z)
		if flat.Magnitude < 0.01 then
			flat = Vector3.new(0, 0, -1)
		end
		local pos = counter.Position + flat.Unit * T.FallbackSpawnOffset
		-- drop onto whatever is below
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { counter }
		local hit = Workspace:Raycast(pos + Vector3.new(0, 20, 0), Vector3.new(0, -80, 0), params)
		local y = hit and hit.Position.Y or (counter.Position.Y - counter.Size.Y / 2)
		local p = Vector3.new(pos.X, y + 3, pos.Z)
		return CFrame.lookAt(p, p + flat.Unit)
	end
	return nil
end

local function returnPlayer(player: Player, cf: CFrame)
	local char = player.Character
	if not char or not char.Parent then
		return
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	if hum then
		hum.Sit = false
		local seat = hum.SeatPart
		if seat then
			local weld = seat:FindFirstChild("SeatWeld")
			if weld then
				weld:Destroy()
			end
		end
	end
	local world = Registry.Find("WorldService")
	if world and type(world.Teleport) == "function" then
		local ok = pcall(world.Teleport, world, player, cf)
		if ok then
			return
		end
	end
	local anti = Registry.Find("AntiExploitService")
	if anti and type(anti.Whitelist) == "function" then
		pcall(anti.Whitelist, anti, player, T.AntiExploitWhitelistSeconds)
	end
	char:PivotTo(cf)
end

local function isSeatedIn(player: Player, model: Model): boolean
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	return seat ~= nil and seat:IsDescendantOf(model)
end

function TestDrive.Stop(player: Player, reason: string?, leaving: boolean?)
	local s = sessions[player]
	if not s or s.Ending then
		return
	end
	s.Ending = true
	sessions[player] = nil
	s.Maid:Clean()
	cooldownUntil[player] = os.clock() + T.CooldownSeconds

	local model = s.Model
	-- a dead / respawning character goes to its spawn as normal; everyone else is brought back to the dealership
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	local alive = hum ~= nil and hum.Health > 0 and reason ~= "died" and reason ~= "respawn"
	if not leaving and alive then
		returnPlayer(player, s.ReturnCFrame)
	end
	if model and model.Parent then
		-- give the unseat a moment so the character isn't dragged with the model
		task.delay(leaving and 0 or 0.2, function()
			if model.Parent then
				model:Destroy()
			end
		end)
	end
	if not leaving and Notify then
		Notify:CloseUI(player, "TestDrive")
		local def = Catalog.GetCar(s.ModelId)
		local name = def and def.Name or s.ModelId
		local msg = "Test drive over. Hope you enjoyed the " .. tostring(name) .. "!"
		if reason == "far" then
			msg = "Test drive ended: you drove too far from the dealership."
		elseif reason == "destroyed" then
			msg = "Test drive ended."
		end
		Notify:Send(player, "🏁 " .. msg, "info", 5)
		if alive then
			Notify:OpenUI(player, "Dealership", { Focus = s.ModelId })
		end
	end
end

function TestDrive.Start(player: Player, modelId: string, counter: Instance?): (boolean, string?)
	if sessions[player] then
		return false, "You're already on a test drive."
	end
	local cd = TestDrive.CooldownLeft(player)
	if cd > 0 then
		return false, ("Next test drive available in %ds."):format(cd)
	end
	local vs = Common.VehicleService()
	if not vs or type(vs.SpawnTestDrive) ~= "function" then
		return false, "Test drives are unavailable right now."
	end
	local occupied = Common.OccupiedModel(player)
	if occupied then
		return false, "Step out of your car first."
	end
	local root = Common.Root(player)
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not root or not hum or hum.Health <= 0 then
		return false, "You need to be standing at the dealership."
	end
	local cf = spawnCFrame(counter)
	if not cf then
		return false, "No test-drive spot available."
	end

	local anti = Registry.Find("AntiExploitService")
	if anti and type(anti.Whitelist) == "function" then
		pcall(anti.Whitelist, anti, player, T.AntiExploitWhitelistSeconds)
	end

	-- reserve the slot before yielding so double requests can't spawn two cars
	local session: Session = {
		Model = nil,
		ModelId = modelId,
		EndsAt = os.clock() + T.Seconds,
		ReturnCFrame = root.CFrame,
		StartPos = cf.Position,
		Maid = Maid.new(),
		Ending = false,
		Seated = false,
	}
	sessions[player] = session

	local ok, model = pcall(vs.SpawnTestDrive, vs, player, modelId, cf, T.Seconds)
	if sessions[player] ~= session then
		-- player left / stopped while spawning
		if ok and typeof(model) == "Instance" then
			model:Destroy()
		end
		return false, "Test drive cancelled."
	end
	if not ok or typeof(model) ~= "Instance" or not model:IsA("Model") then
		sessions[player] = nil
		session.Maid:Clean()
		if not ok then
			warn("[Dealership] SpawnTestDrive failed:", model)
		end
		return false, "Couldn't bring the car round. Try again."
	end
	session.Model = model
	model:SetAttribute("IsTestDrive", true)
	model:SetAttribute("TestDriveOwner", player.UserId)

	-- seat the player if VehicleService didn't
	task.delay(0.25, function()
		if sessions[player] ~= session or not model.Parent then
			return
		end
		if not isSeatedIn(player, model) then
			local seat = model:FindFirstChild("DriveSeat", true)
			local h = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
			if seat and seat:IsA("VehicleSeat") and h and h.Health > 0 and not seat.Occupant then
				if anti and type(anti.Whitelist) == "function" then
					pcall(anti.Whitelist, anti, player, T.AntiExploitWhitelistSeconds)
				end
				seat:Sit(h)
			end
		end
	end)

	session.Maid:Give(model.AncestryChanged:Connect(function(_, parent)
		if parent == nil then
			task.defer(TestDrive.Stop, player, "destroyed")
		end
	end))
	local char = player.Character
	if hum then
		session.Maid:Give(hum.Died:Connect(function()
			TestDrive.Stop(player, "died")
		end))
	end
	session.Maid:Give(player.CharacterRemoving:Connect(function(c)
		if c == char then
			TestDrive.Stop(player, "respawn")
		end
	end))

	if Notify then
		local def = Catalog.GetCar(modelId)
		Notify:OpenUI(player, "TestDrive", {
			ModelId = modelId,
			Name = def and def.Name or modelId,
			Seconds = T.Seconds,
			EndsAt = Workspace:GetServerTimeNow() + T.Seconds,
		})
	end
	return true, nil
end

-- One batched 2 Hz loop for every running test drive.
function TestDrive.StartLoop()
	task.spawn(function()
		while true do
			task.wait(0.5)
			local now = os.clock()
			for player, s in pairs(sessions) do
				if not s.Ending then
					local model = s.Model
					if now >= s.EndsAt then
						task.spawn(TestDrive.Stop, player, "time")
					elseif model and model.Parent then
						local ok, pos = pcall(function()
							return model:GetPivot().Position
						end)
						if ok and (pos - s.StartPos).Magnitude > T.MaxDistanceFromStart then
							task.spawn(TestDrive.Stop, player, "far")
						elseif isSeatedIn(player, model) then
							s.Seated = true
						end
					end
				end
			end
		end
	end)
end

return TestDrive
