-- FuelService: fuel pumps & EV charging (FuelPump-tagged parts).
--
--   * every FuelPump-tagged part gets a server ProximityPrompt "Refuel" → opens the client panel "FuelPump"
--   * remote "Fuel": Quote() → price & tank info, Refuel({ Amount }) → pays up front, fills over time,
--     Cancel() → stops and refunds the unfilled part. EVs "charge" at the same pumps (cheaper, slower).
--   * the car must be the player's occupied or active car, within Config.Vehicles.Fuel.PumpDistance of the pump;
--     the player must be within PlayerDistance. Moving the car away stops the fill (refund for the rest).
--
-- API (server):  FuelService:Quote(player) -> table     FuelService:IsRefueling(player) -> bool

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local World = require(Shared.Config.World)
local VehiclesConfig = require(Shared.Config.Vehicles)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local FuelService = {
	Name = "FuelService",
	Priority = 45,
}

local F = VehiclesConfig.Fuel
local TAG = World.Tags.FuelPump

local DataService
local EconomyService
local NotifyService
local VehicleService

local prompts: { [Instance]: ProximityPrompt } = {}
local sessions: { [Player]: any } = {}

local function pumpPart(inst: Instance): BasePart?
	if inst:IsA("BasePart") then
		return inst
	end
	if inst:IsA("Model") then
		return inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	return nil
end

local function nearestPump(position: Vector3, maxDist: number): BasePart?
	local best, bestD = nil, maxDist
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		local p = pumpPart(inst)
		if p and p:IsDescendantOf(workspace) then
			local d = (p.Position - position).Magnitude
			if d <= bestD then
				best, bestD = p, d
			end
		end
	end
	return best
end

-- The car this player would refuel: the one they sit in, else their active car. Returns (model, info).
local function carFor(player: Player)
	if not VehicleService then
		return nil, nil
	end
	local model = VehicleService:GetOccupiedVehicle(player)
	if not model then
		model = VehicleService:GetActiveVehicle(player)
	end
	if not model then
		return nil, nil
	end
	local info = VehicleService.GetVehicleInfo and VehicleService:GetVehicleInfo(model)
	return model, info
end

local function unitPrice(player: Player, electric: boolean): number
	local base = electric and F.PricePerKWh or F.PricePerLitre
	-- price modifiers work on whole dollars; apply them to a 100-unit reference to keep cents
	local per100 = EconomyService:GetPrice(player, math.floor(base * 100 + 0.5), "Fuel")
	return per100 / 100
end

function FuelService:Quote(player: Player): { [string]: any }
	local model, info = carFor(player)
	if not (model and info) then
		return { ok = false, err = "Bring your car to the pump first 🚗" }
	end
	local pos = Guard.RootPosition(player)
	local pump = pos and nearestPump(pos, F.PlayerDistance)
	if not pump then
		return { ok = false, err = "Stand next to a fuel pump" }
	end
	if (info.Root.Position - pump.Position).Magnitude > F.PumpDistance + info.Root.Size.Z / 2 then
		return { ok = false, err = "Park your car closer to the pump" }
	end
	if info.Kind ~= "Owned" then
		return { ok = false, err = "Work vehicles are fuelled by the city — no need to pay!" }
	end
	local def = info.Def
	local electric = def.Electric == true
	local capacity = math.max(1, (def.Stats and def.Stats.FuelCapacity) or 50)
	local missing = math.max(0, (1 - (info.Fuel or 1)) * capacity)
	local price = unitPrice(player, electric)
	local s = sessions[player]
	return {
		ok = true,
		Car = def.Name,
		Uid = info.Uid,
		Electric = electric,
		Fuel = info.Fuel or 1,
		Capacity = capacity,
		Missing = math.floor(missing * 10) / 10,
		MaxAmount = math.floor(missing),
		Unit = electric and "kWh" or "L",
		PricePerUnit = price,
		FullCost = math.ceil(missing * price),
		Rate = electric and F.ChargeKWhPerSecond or F.PumpLitresPerSecond,
		Cash = EconomyService:GetCash(player),
		Refueling = s ~= nil,
		Remaining = s and s.Remaining or 0,
	}
end

function FuelService:IsRefueling(player: Player): boolean
	return sessions[player] ~= nil
end

local function finish(player: Player, s, reason: string)
	sessions[player] = nil
	if s.Model.Parent then
		s.Model:SetAttribute("Refueling", false)
	end
	local refundUnits = math.max(0, s.Remaining)
	local refund = math.floor(refundUnits * s.Price)
	if refund > 0 and reason ~= "done" then
		EconomyService:AddCash(player, refund, "Refund:Fuel")
	end
	if not player.Parent then
		return
	end
	if reason == "done" then
		NotifyService:Send(player, s.Electric and "⚡ Charged!" or "⛽ Tank filled!", "success", 3)
	elseif reason == "moved" then
		NotifyService:Send(player, ("Refuelling stopped — the car moved away. Refunded %s."):format(Format.Money(refund)), "warning", 4)
	else
		NotifyService:Send(player, ("Refuelling stopped. Refunded %s."):format(Format.Money(refund)), "info", 3)
	end
	NotifyService:CloseUI(player, "FuelPump")
end

local function refuel(player: Player, payload)
	if sessions[player] then
		return { ok = false, err = "Already refuelling" }
	end
	local quote = FuelService:Quote(player)
	if not quote.ok then
		return quote
	end
	local amount = Guard.Number(payload.Amount, 0.5, 2000)
	if not amount then
		return { ok = false, err = "Choose an amount" }
	end
	amount = math.min(amount, quote.Missing)
	if amount < 0.5 then
		return { ok = false, err = quote.Electric and "The battery is already full" or "The tank is already full" }
	end
	local cost = math.max(1, math.ceil(amount * quote.PricePerUnit))
	if not EconomyService:Charge(player, cost, quote.Electric and "Fuel:Charge" or "Fuel:Pump") then
		return { ok = false, err = ("You need %s"):format(Format.Money(cost)) }
	end
	local model, info = carFor(player)
	if not (model and info) then
		EconomyService:AddCash(player, cost, "Refund:Fuel")
		return { ok = false, err = "Your car disappeared" }
	end
	local pump = nearestPump(info.Root.Position, F.PumpDistance + info.Root.Size.Z / 2 + 2)
	sessions[player] = {
		Model = model,
		Info = info,
		Remaining = amount,
		Total = amount,
		Rate = quote.Rate,
		Price = cost / amount,
		Capacity = quote.Capacity,
		Electric = quote.Electric,
		Pump = pump,
		Start = info.Root.Position,
	}
	model:SetAttribute("Refueling", true)
	return { ok = true, Cost = cost, Amount = amount, Seconds = amount / quote.Rate }
end

local function tick(dt: number)
	for player, s in pairs(sessions) do
		local info = s.Info
		if not player.Parent or not s.Model.Parent then
			finish(player, s, "gone")
		elseif (info.Root.Position - s.Start).Magnitude > 4 or (s.Pump and (info.Root.Position - s.Pump.Position).Magnitude > F.PumpDistance + info.Root.Size.Z / 2 + 4) then
			finish(player, s, "moved")
		else
			local add = math.min(s.Remaining, s.Rate * dt)
			s.Remaining -= add
			info.Fuel = math.clamp((info.Fuel or 0) + add / s.Capacity, 0, 1)
			info.Dirty = true
			info.LowFuelWarned = false
			s.Model:SetAttribute("Fuel", math.floor(info.Fuel * 1000 + 0.5) / 1000)
			if s.Remaining <= 1e-3 or info.Fuel >= 0.999 then
				s.Remaining = 0
				finish(player, s, "done")
			end
		end
	end
end

local function addPump(inst: Instance)
	if prompts[inst] then
		return
	end
	local part = pumpPart(inst)
	if not part then
		return
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "FuelPrompt"
	prompt.ActionText = "Refuel / Charge"
	prompt.ObjectText = "⛽ Fuel pump"
	prompt.HoldDuration = F.PromptHoldDuration
	prompt.MaxActivationDistance = 12
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = part
	prompts[inst] = prompt
	prompt.Triggered:Connect(function(player)
		local q = FuelService:Quote(player)
		if q.ok then
			NotifyService:OpenUI(player, "FuelPump", q)
		else
			NotifyService:Send(player, q.err, "info", 3)
		end
	end)
end

local function removePump(inst: Instance)
	local p = prompts[inst]
	if p then
		prompts[inst] = nil
		p:Destroy()
	end
end

function FuelService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	Net.HandleActions("Fuel", {
		Quote = function(player)
			return FuelService:Quote(player)
		end,
		Refuel = refuel,
		Cancel = function(player)
			local s = sessions[player]
			if not s then
				return { ok = false, err = "Not refuelling" }
			end
			finish(player, s, "cancel")
			return { ok = true }
		end,
	}, { rate = 4, burst = 8, perAction = { Refuel = { rate = 0.5, burst = 2 } } })
	-- refund an unfinished fill BEFORE the save is released (Releasing handlers run synchronously while the
	-- profile is still writable; a PlayerRemoving refund could land after the data is gone and be lost)
	DataService.Releasing:Connect(function(player)
		local s = sessions[player]
		if s then
			finish(player, s, "gone")
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		local s = sessions[player]
		if s then
			finish(player, s, "gone")
		end
	end)
end

function FuelService:Start()
	VehicleService = Registry.Find("VehicleService")
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		addPump(inst)
	end
	CollectionService:GetInstanceAddedSignal(TAG):Connect(addPump)
	CollectionService:GetInstanceRemovedSignal(TAG):Connect(removePump)
	task.spawn(function()
		local interval = 0.25
		while true do
			task.wait(interval)
			if next(sessions) ~= nil then
				tick(interval)
			end
		end
	end)
end

return FuelService
