-- Suspension: reads the car rig (ARCHITECTURE §9) into a list of physics wheels and solves the
-- raycast spring-damper for each one.
--
--   local geo = Suspension.Build(model, root, stats, stiffnessMult)
--     geo.Wheels    = { wheel, ... }   (physics contacts; scooters get virtual stabiliser contacts)
--     geo.Visuals   = { visual, ... }  (cosmetic wheels driven through Motor6D "WheelMotor".C0)
--     geo.BasisLocal: CFrame            chassis-local rotation whose LookVector = car forward, UpVector = car up
--     geo.Wheelbase, geo.Track, geo.Length, geo.Width, geo.Height (studs, in the car's own frame)
--   Suspension.Solve(geo, root, rayParams, dt, mass, gravity) -> groundedCount
--     fills wheel.Contact, HitPos, Normal, Material, SpringLen, Compression, Load and adds the spring
--     impulses to geo.Impulse / geo.AngularImpulse (applied once per step by Chassis).
--
-- Missing wheels / attachments are handled: positions fall back to the wheel parts, then to
-- Stats.Wheelbase / TrackWidth.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Driving = require(Shared.Config.Driving)

local P = Driving.Physics

local Suspension = {}

local NAMES = { "FL", "FR", "RL", "RR" }

local function findMotor(root: BasePart, part: BasePart?): Motor6D?
	if not part then
		return nil
	end
	local m = part:FindFirstChild("WheelMotor")
	if m and m:IsA("Motor6D") then
		return m
	end
	for _, child in ipairs(root:GetChildren()) do
		if child:IsA("Motor6D") and child.Part1 == part then
			return child
		end
	end
	for _, d in ipairs(part:GetDescendants()) do
		if d:IsA("Motor6D") and d.Name == "WheelMotor" then
			return d
		end
	end
	return nil
end

local function flat(v: Vector3): Vector3
	return Vector3.new(v.X, 0, v.Z)
end

function Suspension.Build(model: Model, root: BasePart, stats: { [string]: any }, stiffnessMult: number?)
	local wheelsFolder = model:FindFirstChild("Wheels")
	local travel = stats.SuspensionTravel or P.DefaultTravel
	local sag = math.clamp(P.Sag / math.max(0.3, stiffnessMult or 1), 0.25, 0.8)
	local up = Vector3.yAxis

	-- 1. raw wheel data from the rig
	local raw: { [string]: any } = {}
	for _, n in ipairs(NAMES) do
		local att = root:FindFirstChild("Wheel" .. n)
		if att and not att:IsA("Attachment") then
			att = nil
		end
		local part = wheelsFolder and wheelsFolder:FindFirstChild(n)
		if part and not part:IsA("BasePart") then
			-- a wheel Model: use its primary / largest part
			local m = part
			part = (m:IsA("Model") and m.PrimaryPart) or m:FindFirstChildWhichIsA("BasePart", true)
		end
		local motor = findMotor(root, part)
		if att or part then
			local radius = (part and part:GetAttribute("Radius"))
				or stats.WheelRadius
				or (part and math.max(part.Size.Y, part.Size.Z) / 2)
				or 1.2
			if type(radius) ~= "number" or radius <= 0 then
				radius = 1.2
			end
			local centre: Vector3? = nil
			if motor then
				centre = motor.C0.Position
			elseif part then
				centre = root.CFrame:PointToObjectSpace(part.Position)
			end
			local attachPos: Vector3
			local restDrop = P.DefaultRestDrop
			if att then
				attachPos = (att :: Attachment).Position
				if centre then
					local d = (attachPos - centre):Dot(up)
					if d > 0.05 and d < 8 then
						restDrop = d
					elseif d <= 0.05 then
						-- attachment placed at (or below) the wheel centre: treat it as the centre so the
						-- car keeps its modelled ride height
						attachPos = centre + up * restDrop
					end
				end
			else
				attachPos = (centre :: Vector3) + up * restDrop
			end
			-- keep any sideways / fore-aft offset between the attachment and the modelled wheel centre
			local centreOffset = Vector3.zero
			if centre then
				centreOffset = centre - (attachPos - up * restDrop)
				if centreOffset.Magnitude > 3 then
					centreOffset = Vector3.zero
				end
			end
			raw[n] = {
				Name = n,
				Attach = attachPos,
				CentreOffset = centreOffset,
				Radius = radius,
				RestDrop = restDrop,
				Part = part,
				Motor = motor,
				BaseRot = motor and (motor.C0 - motor.C0.Position) or CFrame.identity,
			}
		end
	end

	-- 2. synthesize a full set if the rig has nothing
	if next(raw) == nil then
		local halfL = (stats.Wheelbase or 9) / 2
		local halfT = (stats.TrackWidth or 5) / 2
		local y = -root.Size.Y / 2
		local radius = stats.WheelRadius or 1.2
		local drop = math.max(0.3, (stats.RideHeight or 2) - radius)
		for _, n in ipairs(NAMES) do
			local x = (n:sub(2, 2) == "L") and -halfT or halfT
			local z = (n:sub(1, 1) == "F") and -halfL or halfL
			raw[n] = {
				Name = n,
				Attach = Vector3.new(x, y, z),
				Radius = radius,
				RestDrop = drop,
				BaseRot = CFrame.identity,
			}
		end
	end

	-- 3. car frame from wheel layout
	local function mid(a: string, b: string): Vector3?
		local wa, wb = raw[a], raw[b]
		if wa and wb then
			return (wa.Attach + wb.Attach) / 2
		end
		return (wa and wa.Attach) or (wb and wb.Attach) or nil
	end
	local frontMid = mid("FL", "FR")
	local rearMid = mid("RL", "RR")
	local fwdLocal = -Vector3.zAxis
	local wheelbase = stats.Wheelbase or 9
	if frontMid and rearMid then
		local d = flat(frontMid - rearMid)
		if d.Magnitude > 0.5 then
			fwdLocal = d.Unit
			wheelbase = d.Magnitude
		end
	end
	local rightLocal = fwdLocal:Cross(up).Unit
	local basisLocal = CFrame.fromMatrix(Vector3.zero, rightLocal, up, -fwdLocal)
	local centreLocal = ((frontMid or Vector3.zero) + (rearMid or Vector3.zero)) / ((frontMid and rearMid) and 2 or 1)

	-- 4. physics wheels (+ virtual outriggers for single-wheel axles)
	local wheels = {}
	local visuals = {}
	local track = stats.TrackWidth or 5

	local function addWheel(r, axle: string, offset: Vector3, visual: boolean)
		local lmax = r.RestDrop + travel * sag
		local w = {
			Name = r.Name,
			Axle = axle,
			Attach = r.Attach + offset,
			Radius = r.Radius,
			RestDrop = r.RestDrop,
			Lmax = lmax,
			Lmin = math.max(0.05, lmax - travel),
			Side = 0,
			Steer = axle == "F",
			SteerAngle = 0,
			Contact = false,
			HitPos = Vector3.zero,
			Normal = Vector3.yAxis,
			Material = Enum.Material.Plastic,
			SpringLen = lmax,
			Compression = 0,
			Load = 0,
			AntiRoll = 0,
			SurfaceSpeed = 0,
			Spin = 0,
			Skid = 0,
		}
		local side = (w.Attach - centreLocal):Dot(rightLocal)
		w.Side = (side > 0.05 and 1) or (side < -0.05 and -1) or 0
		table.insert(wheels, w)
		if visual and r.Motor then
			table.insert(visuals, {
				Physics = w,
				Motor = r.Motor,
				BaseRot = r.BaseRot,
				OrigC0 = r.Motor.C0,
				Top = r.Attach, -- visual stays at the real wheel position (not the outrigger)
				Offset = r.CentreOffset or Vector3.zero,
				Radius = r.Radius,
				Len = r.RestDrop,
				Angle = 0,
			})
		end
		return w
	end

	for _, axle in ipairs({ "F", "R" }) do
		local left, rightW = raw[axle .. "L"], raw[axle .. "R"]
		local outrigger = math.max(P.SingleWheelOutrigger, 0.1)
		if left and rightW then
			local gap = flat(left.Attach - rightW.Attach).Magnitude
			if gap < 0.5 then
				-- coincident pair (scooter modelled with FL/FR at the same spot)
				addWheel(left, axle, -rightLocal * outrigger, true)
				addWheel(rightW, axle, rightLocal * outrigger, true)
			else
				addWheel(left, axle, Vector3.zero, true)
				addWheel(rightW, axle, Vector3.zero, true)
				if axle == "F" then
					track = gap
				end
			end
		elseif left or rightW then
			local r = left or rightW
			addWheel(r, axle, -rightLocal * outrigger, true)
			addWheel(r, axle, rightLocal * outrigger, false)
		end
	end
	-- a car with only one axle (very odd rig): mirror it so it can stand
	local hasF, hasR = false, false
	for _, w in ipairs(wheels) do
		if w.Axle == "F" then
			hasF = true
		else
			hasR = true
		end
	end
	if not (hasF and hasR) then
		local existing = table.clone(wheels)
		for _, w in ipairs(existing) do
			local mirrorAttach = w.Attach - fwdLocal * (hasF and wheelbase or -wheelbase)
			local clone = table.clone(w)
			clone.Attach = mirrorAttach
			clone.Axle = hasF and "R" or "F"
			clone.Steer = clone.Axle == "F"
			table.insert(wheels, clone)
		end
	end

	-- 5. extents in the car frame
	local ok, size = pcall(function()
		return model:GetExtentsSize()
	end)
	local ext = ok and size or Vector3.new(6, 4, 12)
	local inBasis = basisLocal:VectorToObjectSpace(ext)
	local length = math.abs(inBasis.Z)
	local width = math.abs(inBasis.X)
	local height = math.abs(inBasis.Y)

	return {
		Wheels = wheels,
		Visuals = visuals,
		BasisLocal = basisLocal,
		UpLocal = up,
		RightLocal = rightLocal,
		ForwardLocal = fwdLocal,
		Wheelbase = math.max(1, wheelbase),
		Track = math.max(0.5, track),
		Length = math.max(4, length),
		Width = math.max(2, width),
		Height = math.max(2, height),
		Travel = travel,
		Sag = sag,
		Impulse = Vector3.zero,
		AngularImpulse = Vector3.zero,
	}
end

-- Change stiffness (upgrade) without rebuilding: stiffer = less sag, same ride height.
function Suspension.SetStiffness(geo, stiffnessMult: number)
	geo.Sag = math.clamp(P.Sag / math.max(0.3, stiffnessMult), 0.25, 0.8)
	for _, w in ipairs(geo.Wheels) do
		w.Lmax = w.RestDrop + geo.Travel * geo.Sag
		w.Lmin = math.max(0.05, w.Lmax - geo.Travel)
	end
end

-- Add an impulse at a world position to the step accumulators.
function Suspension.AddImpulse(geo, com: Vector3, impulse: Vector3, at: Vector3)
	geo.Impulse += impulse
	geo.AngularImpulse += (at - com):Cross(impulse)
end

function Suspension.Solve(geo, root: BasePart, params: RaycastParams, dt: number, mass: number, gravity: number, dampingMult: number)
	local cf = root.CFrame
	local up = cf:VectorToWorldSpace(geo.UpLocal)
	local wheels = geo.Wheels
	local n = #wheels
	local massShare = mass / math.max(1, n)
	local k = massShare * gravity / math.max(0.05, geo.Travel * geo.Sag)
	local zeta = P.BaseDampingRatio * dampingMult
	local c = 2 * zeta * math.sqrt(k * massShare)
	local com = root.AssemblyCenterOfMass
	local grounded = 0

	-- raycasts
	for _, w in ipairs(wheels) do
		local top = cf:PointToWorldSpace(w.Attach)
		w.TopWorld = top
		local result = Workspace:Raycast(top, -up * (w.Lmax + w.Radius), params)
		if result then
			local len = result.Distance - w.Radius
			w.Contact = true
			w.HitPos = result.Position
			w.Normal = result.Normal
			w.Material = result.Material
			w.SpringLen = math.max(len, w.Lmin - 0.4)
			w.Compression = math.max(0, w.Lmax - len)
			grounded += 1
		else
			w.Contact = false
			w.SpringLen = w.Lmax
			w.Compression = 0
			w.Load = 0
		end
		w.AntiRoll = 0
	end

	-- anti-roll bars (pairs on the same axle, opposite sides)
	for _, axle in ipairs({ "F", "R" }) do
		local l, r = nil, nil
		for _, w in ipairs(wheels) do
			if w.Axle == axle then
				if w.Side < 0 and not l then
					l = w
				elseif w.Side > 0 and not r then
					r = w
				end
			end
		end
		if l and r and l.Contact and r.Contact then
			local f = (l.Compression - r.Compression) * k * P.AntiRoll
			l.AntiRoll = f
			r.AntiRoll = -f
		end
	end

	-- spring + damper + bump stop
	for _, w in ipairs(wheels) do
		if w.Contact then
			local vPoint = root:GetVelocityAtPosition(w.TopWorld)
			local compVel = -vPoint:Dot(up)
			local spring = k * w.Compression
			local damp = c * compVel
			-- never let the damper reverse the motion in one step (stable at low fps)
			local dampLimit = massShare * math.abs(compVel) / dt
			damp = math.clamp(damp, -dampLimit, dampLimit)
			local bump = 0
			local len = w.Lmax - w.Compression
			if len < w.Lmin then
				bump = k * P.BumpStopMultiplier * (w.Lmin - len)
			end
			local force = math.max(0, spring + damp + bump + w.AntiRoll)
			w.Load = force
			Suspension.AddImpulse(geo, com, up * force * dt, w.TopWorld)
		end
	end

	return grounded, massShare
end

return Suspension
