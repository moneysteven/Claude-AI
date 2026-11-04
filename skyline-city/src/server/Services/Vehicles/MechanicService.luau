-- MechanicService: self-service repairs at MechanicBay-tagged zones.
--
--   * every MechanicBay-tagged part gets a server ProximityPrompt "Repair car" → opens the client panel "Repair"
--   * remote "Mechanic": Quote({ Uid? }) → health + cost, Repair({ Uid }) → charges (wallet, then bank) and
--     restores the car to 100 health through VehicleService:Repair
--   * the car must be inside the bay volume (+ Config.Vehicles.Repair.BayPadding) and the player nearby
--   * cost scales with missing health and the car's value (Config/Vehicles.Repair)
--
-- API (server):  MechanicService:GetRepairCost(player, uid) -> number

local CollectionService = game:GetService("CollectionService")
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

local MechanicService = {
	Name = "MechanicService",
	Priority = 45,
}

local R = VehiclesConfig.Repair
local TAG = World.Tags.MechanicBay

local EconomyService
local NotifyService
local VehicleService

local prompts: { [Instance]: ProximityPrompt } = {}

local function bayPart(inst: Instance): BasePart?
	if inst:IsA("BasePart") then
		return inst
	end
	if inst:IsA("Model") then
		return inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	return nil
end

local function inBay(bay: BasePart, pos: Vector3): boolean
	local lp = bay.CFrame:PointToObjectSpace(pos)
	local half = bay.Size / 2 + Vector3.new(R.BayPadding, R.BayPadding + 6, R.BayPadding)
	return math.abs(lp.X) <= half.X and math.abs(lp.Y) <= half.Y and math.abs(lp.Z) <= half.Z
end

local function bayFor(pos: Vector3): BasePart?
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		local b = bayPart(inst)
		if b and b:IsDescendantOf(workspace) and inBay(b, pos) then
			return b
		end
	end
	return nil
end

local function carFor(player: Player, uid: string?)
	if not VehicleService then
		return nil, nil
	end
	local model = VehicleService:GetOccupiedVehicle(player)
	if model and uid and model:GetAttribute("CarUid") ~= uid then
		model = nil
	end
	if not model then
		model = VehicleService:GetActiveVehicle(player)
		if model and uid and model:GetAttribute("CarUid") ~= uid then
			model = nil
		end
	end
	if not model then
		return nil, nil
	end
	local info = VehicleService.GetVehicleInfo and VehicleService:GetVehicleInfo(model)
	if not info or info.Owner ~= player then
		return nil, nil
	end
	return model, info
end

local function costFor(player: Player, info): number
	local health = math.clamp(info.Health or 100, 0, 100)
	local missing = 100 - health
	if missing <= 0.5 then
		return 0
	end
	if info.Kind ~= "Owned" then
		return 0 -- job / test-drive vehicles are maintained by the city
	end
	local value = VehicleService:GetCarValue(player, info.Uid)
	local raw = R.MinCost + missing * (R.CostPerPoint + value * R.ValueFactorPerPoint)
	local cap = math.max(R.MinCost, value * R.MaxCostFraction)
	if value <= 0 then
		cap = R.MinCost + missing * R.CostPerPoint
	end
	local base = math.floor(math.min(raw, cap) + 0.5)
	return EconomyService:GetPrice(player, base, "Repair")
end

function MechanicService:GetRepairCost(player: Player, uid: string): number
	local _, info = carFor(player, uid)
	if not info then
		return 0
	end
	return costFor(player, info)
end

local function quote(player: Player, payload)
	local uid = payload and Guard.Id(payload.Uid, 24) or nil
	local model, info = carFor(player, uid)
	if not (model and info) then
		return { ok = false, err = "Drive your car into the repair bay first 🔧" }
	end
	if not Guard.NearTagged(player, TAG, R.PlayerDistance) then
		return { ok = false, err = "Stand inside the repair bay" }
	end
	if not bayFor(info.Root.Position) then
		return { ok = false, err = "Park your car inside the bay" }
	end
	local cost = costFor(player, info)
	return {
		ok = true,
		Uid = info.Uid,
		Car = info.Def.Name,
		Health = math.floor((info.Health or 100) + 0.5),
		Cost = cost,
		NeedsRepair = (info.Health or 100) < 99.5,
		EngineDead = model:GetAttribute("EngineDead") == true,
		Cash = EconomyService:GetCash(player),
	}
end

local function repair(player: Player, payload)
	local q = quote(player, payload)
	if not q.ok then
		return q
	end
	if not q.NeedsRepair then
		return { ok = false, err = "Your car is already in perfect shape ✨" }
	end
	if q.Cost > 0 and not EconomyService:Charge(player, q.Cost, "Repair:Bay") then
		return { ok = false, err = ("You need %s for this repair"):format(Format.Money(q.Cost)) }
	end
	local ok, res = pcall(VehicleService.Repair, VehicleService, player, q.Uid)
	if not ok or res == false then
		warn("[MechanicService] repair failed:", res)
		if q.Cost > 0 then
			EconomyService:AddCash(player, q.Cost, "Refund:Repair")
		end
		return { ok = false, err = "Repair failed — you were refunded" }
	end
	if q.Cost > 0 then
		NotifyService:Send(player, ("🔧 %s repaired for %s"):format(q.Car, Format.Money(q.Cost)), "success", 4)
	else
		NotifyService:Send(player, ("🔧 %s repaired — on the city's tab"):format(q.Car), "success", 4)
	end
	return { ok = true, Cost = q.Cost }
end

local function addBay(inst: Instance)
	if prompts[inst] then
		return
	end
	local part = bayPart(inst)
	if not part then
		return
	end
	local att = Instance.new("Attachment")
	att.Name = "RepairPromptAttachment"
	att.Parent = part
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "RepairPrompt"
	prompt.ActionText = "Repair car"
	prompt.ObjectText = "🔧 Repair bay"
	prompt.HoldDuration = R.PromptHoldDuration
	prompt.MaxActivationDistance = math.clamp(math.max(part.Size.X, part.Size.Z) / 2 + 6, 10, 30)
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = att
	prompts[inst] = prompt
	prompt.Triggered:Connect(function(player)
		local q = quote(player, nil)
		if q.ok then
			NotifyService:OpenUI(player, "Repair", q)
		else
			NotifyService:Send(player, q.err, "info", 3)
		end
	end)
end

local function removeBay(inst: Instance)
	local p = prompts[inst]
	if p then
		prompts[inst] = nil
		local att = p.Parent
		p:Destroy()
		if att and att:IsA("Attachment") then
			att:Destroy()
		end
	end
end

function MechanicService:Init()
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	Net.HandleActions("Mechanic", {
		Quote = quote,
		Repair = repair,
	}, { rate = 4, burst = 8, perAction = { Repair = { rate = 0.5, burst = 2 } } })
end

function MechanicService:Start()
	VehicleService = Registry.Find("VehicleService")
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		addBay(inst)
	end
	CollectionService:GetInstanceAddedSignal(TAG):Connect(addBay)
	CollectionService:GetInstanceRemovedSignal(TAG):Connect(removeBay)
end

return MechanicService
