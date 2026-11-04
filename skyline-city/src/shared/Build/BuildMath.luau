-- BuildMath: grid / rotation / bounds math shared by the client preview and server validation.
-- Everything here is pure (no Instances) so the client's green/red ghost and the server's
-- accept/reject decision always agree.
--
-- Conventions
--   * Positions are RELATIVE to the build context Origin (top-centre of the build surface).
--   * An item's position is the BOTTOM-CENTRE of its bounding box.
--   * Rotation is yaw only, stored as an integer step of STEP_DEGREES (0..STEPS-1).
--   * Plot local axes: X = width, Z = depth, +Z is the front edge (street side).

local BuildMath = {}

BuildMath.STEP_DEGREES = 15
BuildMath.STEPS = 24
BuildMath.POSITION_PRECISION = 0.05
BuildMath.EPSILON = 0.02

local STEP_RAD = math.rad(BuildMath.STEP_DEGREES)

local function finite(n: number): boolean
	return n == n and n ~= math.huge and n ~= -math.huge
end

function BuildMath.Round(n: number, precision: number?): number
	local p = precision or BuildMath.POSITION_PRECISION
	return math.round(n / p) * p
end

function BuildMath.RoundVector(v: Vector3, precision: number?): Vector3
	return Vector3.new(BuildMath.Round(v.X, precision), BuildMath.Round(v.Y, precision), BuildMath.Round(v.Z, precision))
end

function BuildMath.NormalizeStep(step: number): number
	return math.floor(step) % BuildMath.STEPS
end

function BuildMath.StepToRadians(step: number): number
	return BuildMath.NormalizeStep(step) * STEP_RAD
end

function BuildMath.StepToCFrame(step: number): CFrame
	return CFrame.Angles(0, BuildMath.StepToRadians(step), 0)
end

-- Relative CFrame for an item at `pos` with rotation `step`.
function BuildMath.Compose(pos: Vector3, step: number): CFrame
	return CFrame.new(pos) * BuildMath.StepToCFrame(step)
end

-- Yaw of a CFrame in radians (rotation about +Y).
function BuildMath.Yaw(cf: CFrame): number
	local look = cf.LookVector
	return math.atan2(-look.X, -look.Z)
end

-- Convert an arbitrary relative CFrame into (position, step). Returns nil + reason when the rotation is
-- not an upright yaw that lands on a STEP_DEGREES increment (within `toleranceDeg`).
function BuildMath.Decompose(cf: CFrame, toleranceDeg: number?): (Vector3?, number?, string?)
	local p = cf.Position
	if not (finite(p.X) and finite(p.Y) and finite(p.Z)) then
		return nil, nil, "Bad position"
	end
	if cf.UpVector.Y < 0.995 then
		return nil, nil, "Items must stand upright"
	end
	local yaw = BuildMath.Yaw(cf)
	if not finite(yaw) then
		return nil, nil, "Bad rotation"
	end
	local stepF = yaw / STEP_RAD
	local step = math.round(stepF)
	if math.abs(stepF - step) * BuildMath.STEP_DEGREES > (toleranceDeg or 2) then
		return nil, nil, "Rotation must be in 15° steps"
	end
	return BuildMath.RoundVector(p), BuildMath.NormalizeStep(step), nil
end

-- Half extents (X, Y, Z) of the axis-aligned box that contains an item of `size` rotated by `step`.
function BuildMath.RotatedHalfExtents(size: Vector3, step: number): Vector3
	local a = BuildMath.StepToRadians(step)
	local c, s = math.abs(math.cos(a)), math.abs(math.sin(a))
	local hx = (c * size.X + s * size.Z) / 2
	local hz = (s * size.X + c * size.Z) / 2
	return Vector3.new(hx, size.Y / 2, hz)
end

-- Max height above the origin an item's TOP may reach, and its BOTTOM may start at.
function BuildMath.HeightLimits(floors: number, floorHeight: number, roofAllowance: number): (number, number)
	local top = math.max(1, floors) * floorHeight
	return top + roofAllowance, top
end

-- Is an item of `size` at relative `pos` (bottom centre) rotated by `step` inside the build area?
--   area      Vector3 (X width, Z depth used; Y ignored)
--   maxTop    highest allowed top of the item
--   maxBottom highest allowed bottom of the item
function BuildMath.InBounds(size: Vector3, pos: Vector3, step: number, area: Vector3, maxTop: number, maxBottom: number): (boolean, string?)
	local eps = BuildMath.EPSILON
	local half = BuildMath.RotatedHalfExtents(size, step)
	if math.abs(pos.X) + half.X > area.X / 2 + eps or math.abs(pos.Z) + half.Z > area.Z / 2 + eps then
		return false, "Outside your plot"
	end
	if pos.Y < -eps then
		return false, "Below the floor"
	end
	if pos.Y > maxBottom + eps then
		return false, "Too high"
	end
	if pos.Y + size.Y > maxTop + eps then
		return false, "Too tall for this floor"
	end
	return true, nil
end

-- Snap one axis so the item's EDGES land on the grid (odd multiples get a half-cell offset).
local function snapAxis(center: number, fullExtent: number, grid: number): number
	local cells = math.round(fullExtent / grid)
	if cells % 2 == 1 then
		return (math.floor(center / grid) + 0.5) * grid
	end
	return math.round(center / grid) * grid
end

-- Snap a relative position (X/Z) to the grid for an item of `size` and rotation `step`.
function BuildMath.SnapPosition(pos: Vector3, grid: number, size: Vector3, step: number): Vector3
	if grid <= 0 then
		return BuildMath.RoundVector(pos)
	end
	local half = BuildMath.RotatedHalfExtents(size, step)
	local x = snapAxis(pos.X, half.X * 2, grid)
	local z = snapAxis(pos.Z, half.Z * 2, grid)
	return BuildMath.RoundVector(Vector3.new(x, pos.Y, z))
end

-- Keep an item fully inside the area by pushing it back in (used by the ghost so it never leaves the plot).
function BuildMath.ClampToArea(pos: Vector3, size: Vector3, step: number, area: Vector3): Vector3
	local half = BuildMath.RotatedHalfExtents(size, step)
	local mx = math.max(0, area.X / 2 - half.X)
	local mz = math.max(0, area.Z / 2 - half.Z)
	return Vector3.new(math.clamp(pos.X, -mx, mx), pos.Y, math.clamp(pos.Z, -mz, mz))
end

-- Is a world point inside a build area (with optional margin and height)?
function BuildMath.PointInArea(origin: CFrame, area: Vector3, worldPos: Vector3, margin: number?, height: number?): boolean
	local rel = origin:PointToObjectSpace(worldPos)
	local m = margin or 0
	if math.abs(rel.X) > area.X / 2 + m or math.abs(rel.Z) > area.Z / 2 + m then
		return false
	end
	local h = height or math.max(area.Y, 12)
	return rel.Y > -10 - m and rel.Y < h + m
end

-- Base height (relative Y) of a floor number (1-based).
function BuildMath.FloorBase(floor: number, floorHeight: number): number
	return (math.max(1, floor) - 1) * floorHeight
end

-- Which floor (1-based) a relative Y belongs to.
function BuildMath.FloorOf(y: number, floorHeight: number): number
	return math.max(1, math.floor((y + 0.5) / floorHeight) + 1)
end

-- Yaw step whose local +X axis best follows a direction in plot space (for walls).
function BuildMath.StepForDirection(dx: number, dz: number): number
	-- local +X after yaw a is (cos a, 0, -sin a)
	local a = math.atan2(-dz, dx)
	return BuildMath.NormalizeStep(math.round(a / STEP_RAD))
end

-- Split a wall run from a to b (relative positions, Y = floor base) into segments.
-- Returns { { Length, Position, Step } } with each segment centred on the run.
function BuildMath.WallRun(a: Vector3, b: Vector3, segments: { number }): { { Length: number, Position: Vector3, Step: number } }
	local out = {}
	local d = Vector3.new(b.X - a.X, 0, b.Z - a.Z)
	local total = d.Magnitude
	if total < 0.5 then
		return out
	end
	local step = BuildMath.StepForDirection(d.X, d.Z)
	local ang = BuildMath.StepToRadians(step)
	local dir = Vector3.new(math.cos(ang), 0, -math.sin(ang))
	-- project the run on the snapped direction
	local len = math.max(0, d:Dot(dir))
	local sorted = table.clone(segments)
	table.sort(sorted, function(x, y)
		return x > y
	end)
	local smallest = sorted[#sorted]
	-- round the length to the nearest smallest segment so short drags still produce a wall
	len = math.max(smallest, math.round(len / smallest) * smallest)
	local cursor = 0
	local guard = 0
	while len - cursor >= smallest - 0.01 and guard < 200 do
		guard += 1
		local placed = false
		for _, seg in ipairs(sorted) do
			if len - cursor >= seg - 0.01 then
				local centre = a + dir * (cursor + seg / 2)
				table.insert(out, { Length = seg, Position = BuildMath.RoundVector(Vector3.new(centre.X, a.Y, centre.Z)), Step = step })
				cursor += seg
				placed = true
				break
			end
		end
		if not placed then
			break
		end
	end
	return out
end

return BuildMath
