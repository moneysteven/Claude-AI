-- DisplayTurntable: slowly spins showroom display cars (tag "DealershipDisplayCar") on THIS client only.
-- The models are anchored server copies; we pivot them locally around their original pivot, ~30 Hz,
-- and only when the camera is near. Streaming-safe (instance added / removed signals).

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local DealerCfg = require(Shared.Config.Dealership)

local DisplayTurntable = {}

local TAG = "DealershipDisplayCar"
local D = DealerCfg.Displays

local models: { [Model]: { Base: CFrame, Angle: number } } = {}
local started = false

local function add(inst: Instance)
	if inst:IsA("Model") and not models[inst] and inst:IsDescendantOf(Workspace) then
		local ok, pivot = pcall(function()
			return inst:GetPivot()
		end)
		if ok then
			models[inst] = { Base = pivot, Angle = 0 }
		end
	end
end

function DisplayTurntable.Start()
	if started or not D.ClientTurntable then
		return
	end
	started = true
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		add(inst)
	end
	CollectionService:GetInstanceAddedSignal(TAG):Connect(function(inst)
		task.defer(add, inst)
	end)
	CollectionService:GetInstanceRemovedSignal(TAG):Connect(function(inst)
		models[inst :: Model] = nil
	end)

	local acc = 0
	local speed = math.rad(D.TurntableDegreesPerSecond)
	RunService.Heartbeat:Connect(function(dt)
		acc += dt
		if acc < 1 / 30 then
			return
		end
		local step = acc
		acc = 0
		local cam = Workspace.CurrentCamera
		if not cam then
			return
		end
		local camPos = cam.CFrame.Position
		for model, st in pairs(models) do
			if not model.Parent then
				models[model] = nil
			elseif (st.Base.Position - camPos).Magnitude <= D.TurntableRadius then
				st.Angle = (st.Angle + speed * step) % (math.pi * 2)
				model:PivotTo(st.Base * CFrame.Angles(0, st.Angle, 0))
			end
		end
	end)
end

return DisplayTurntable
