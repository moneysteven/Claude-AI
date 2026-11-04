-- CarAnimator: animates a car's moving body parts from its attributes using Motor6D.Transform (client only,
-- physics is never touched).
--
--   local a = CarAnimator.new(model)
--   a:Update(dt, opts)     opts = { SpinWheels = bool }   → returns true while something is still moving
--   a:SetLocalDriver(bool) -- the local chassis owns the wheels while we drive (DriveController sets C0)
--   a:Reset()              -- snap everything to its attribute state (used after streaming in / range re-entry)
--   a:Destroy()
--
-- Rig (ARCHITECTURE §9): Doors/<FL..RR>/Door "Hinge" + Window "WindowMotor", Hood / Trunk "Hinge",
-- Sunroof "Slide", Roof "Fold", Wheels/<FL..RR> "WheelMotor". Motor attributes (OpenAxis, OpenAngle, Drop,
-- SlideDistance, Lift, FoldAngle) come from the server builder; asset models fall back to Config/Vehicles.Visuals.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local VehiclesConfig = require(Shared.Config.Vehicles)

local V = VehiclesConfig.Visuals

local CarAnimator = {}
CarAnimator.__index = CarAnimator

local DOORS = { "FL", "FR", "RL", "RR" }

local function findMotor(root: Instance?, name: string): Motor6D?
	if not root then
		return nil
	end
	local m = root:FindFirstChild(name, true)
	if m and m:IsA("Motor6D") then
		return m
	end
	return nil
end

local function smooth(t: number): number
	return t * t * (3 - 2 * t)
end

function CarAnimator.new(model: Model)
	local self = setmetatable({}, CarAnimator)
	self.Model = model
	self.Root = model.PrimaryPart or model:FindFirstChild("Chassis")
	self.Items = {}
	self.Wheels = {}
	self.LocalDriver = false

	local function hinge(attr: string, motor: Motor6D?, defaultAxis: string, defaultAngle: number, kind: string)
		if not motor then
			return
		end
		table.insert(self.Items, {
			Attr = attr,
			Motor = motor,
			Kind = kind,
			Axis = motor:GetAttribute("OpenAxis") or defaultAxis,
			Angle = math.rad(motor:GetAttribute("OpenAngle") or defaultAngle),
			Current = 0,
		})
	end

	local doors = model:FindFirstChild("Doors")
	for _, id in ipairs(DOORS) do
		local d = doors and doors:FindFirstChild(id)
		if d then
			local side = (id == "FL" or id == "RL") and -1 or 1
			hinge("Door_" .. id, findMotor(d, "Hinge"), "Y", side * V.DoorAngle, "Door")
			local wm = findMotor(d, "WindowMotor")
			if wm then
				local win = wm.Part1
				local drop = wm:GetAttribute("Drop") or (win and win.Size.Y * 0.9) or 1
				table.insert(self.Items, { Attr = "Window_" .. id, Motor = wm, Kind = "Window", Drop = drop, Current = 0 })
			end
		end
	end
	local hood = model:FindFirstChild("Hood")
	hinge("Hood", hood and findMotor(hood, "Hinge"), "X", V.HoodAngle, "Hinge")
	local trunk = model:FindFirstChild("Trunk")
	hinge("Trunk", trunk and findMotor(trunk, "Hinge"), "X", -V.TrunkAngle, "Hinge")
	local sunroof = model:FindFirstChild("Sunroof")
	local slide = sunroof and findMotor(sunroof, "Slide")
	if slide then
		local part = slide.Part1
		table.insert(self.Items, {
			Attr = "Sunroof",
			Motor = slide,
			Kind = "Slide",
			Distance = slide:GetAttribute("SlideDistance") or (part and part.Size.Z * V.SunroofSlide) or 1,
			Lift = slide:GetAttribute("Lift") or 0.15,
			Current = 0,
		})
	end
	local roof = model:FindFirstChild("Roof")
	local fold = roof and findMotor(roof, "Fold")
	if fold then
		table.insert(self.Items, {
			Attr = "Roof",
			Motor = fold,
			Kind = "Fold",
			Angle = math.rad(fold:GetAttribute("FoldAngle") or V.RoofFoldAngle),
			Current = 0,
		})
	end

	local wheels = model:FindFirstChild("Wheels")
	if wheels then
		for _, w in ipairs(wheels:GetChildren()) do
			local part = w:IsA("BasePart") and w or (w:IsA("Model") and (w.PrimaryPart or w:FindFirstChildWhichIsA("BasePart", true)))
			local motor = part and findMotor(part, "WheelMotor")
			if part and motor then
				table.insert(self.Wheels, {
					Motor = motor,
					Radius = part:GetAttribute("Radius") or math.max(part.Size.Y, part.Size.Z) / 2,
					Angle = 0,
				})
			end
		end
	end
	self:Reset()
	return self
end

local function target(model: Model, item): number
	local v = model:GetAttribute(item.Attr)
	if type(v) == "boolean" then
		return v and 1 or 0
	elseif type(v) == "number" then
		return math.clamp(v, 0, 1)
	end
	return 0
end

local function apply(item)
	local m: Motor6D = item.Motor
	local c = item.Current
	if item.Kind == "Door" or item.Kind == "Hinge" then
		local a = item.Angle * smooth(c)
		if item.Axis == "Y" then
			m.Transform = CFrame.Angles(0, a, 0)
		elseif item.Axis == "Z" then
			m.Transform = CFrame.Angles(0, 0, a)
		else
			m.Transform = CFrame.Angles(a, 0, 0)
		end
	elseif item.Kind == "Window" then
		m.Transform = CFrame.new(0, -item.Drop * c, 0)
	elseif item.Kind == "Slide" then
		local lift = item.Lift * math.clamp(c * 4, 0, 1)
		local slide = item.Distance * smooth(math.clamp((c - 0.15) / 0.85, 0, 1))
		m.Transform = CFrame.new(0, lift, slide)
	elseif item.Kind == "Fold" then
		local t = smooth(c)
		m.Transform = CFrame.new(0, -0.15 * math.sin(t * math.pi), 0) * CFrame.Angles(item.Angle * t, 0, 0)
	end
end

function CarAnimator:Reset()
	for _, item in ipairs(self.Items) do
		item.Current = target(self.Model, item)
		if item.Motor.Parent then
			apply(item)
		end
	end
end

function CarAnimator:SetLocalDriver(on: boolean)
	if self.LocalDriver == on then
		return
	end
	self.LocalDriver = on
	for _, w in ipairs(self.Wheels) do
		w.Angle = 0
		if w.Motor.Parent then
			w.Motor.Transform = CFrame.identity
		end
	end
end

function CarAnimator:Update(dt: number, opts: { [string]: any }?): boolean
	local model = self.Model
	local moving = false
	for _, item in ipairs(self.Items) do
		local goal = target(model, item)
		local c = item.Current
		if c ~= goal then
			if item.Kind == "Window" then
				local step = V.WindowSpeed * dt
				c = (goal > c) and math.min(goal, c + step) or math.max(goal, c - step)
			elseif item.Kind == "Fold" then
				local step = V.RoofSpeed * dt
				c = (goal > c) and math.min(goal, c + step) or math.max(goal, c - step)
			else
				local step = V.DoorSpeed * dt * (0.35 + math.abs(goal - c))
				c = (goal > c) and math.min(goal, c + step) or math.max(goal, c - step)
			end
			item.Current = c
			if item.Motor.Parent then
				apply(item)
			end
			moving = true
		end
	end
	-- wheel spin for cars someone else drives (the driver's own chassis animates its wheels)
	if opts and opts.SpinWheels and not self.LocalDriver and self.Root then
		local root: BasePart = self.Root
		local vel = root.AssemblyLinearVelocity
		local pivot = model:GetPivot()
		local forward = vel:Dot(pivot.LookVector)
		if math.abs(forward) > 0.3 or self.Spinning then
			self.Spinning = math.abs(forward) > 0.3
			for _, w in ipairs(self.Wheels) do
				w.Angle = (w.Angle - forward / math.max(0.2, w.Radius) * dt) % (math.pi * 2)
				if w.Motor.Parent then
					w.Motor.Transform = CFrame.Angles(w.Angle, 0, 0)
				end
			end
		end
	end
	return moving
end

function CarAnimator:Destroy()
	table.clear(self.Items)
	table.clear(self.Wheels)
end

return CarAnimator
