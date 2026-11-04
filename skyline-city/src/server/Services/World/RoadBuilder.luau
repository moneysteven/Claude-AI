-- RoadBuilder (World helper): builds the road network from Config/CityLayout via Shared/World/RoadGraph.
--
--   RoadBuilder.Essential(ctx)  asphalt, intersections, sidewalks/kerbs, RoadNode + WalkNode graph parts
--   RoadBuilder.Decor(ctx)      lane markings, crosswalks, highway barriers/rails, ramps, streetlights
--
-- Heights: asphalt top = Layout.Heights.Road, sidewalk top = Layout.Heights.Sidewalk.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)
local RoadGraph = require(Shared:WaitForChild("World"):WaitForChild("RoadGraph"))

local Props = require(script.Parent.Props)
local Gameplay = require(script.Parent.Gameplay)

local RoadBuilder = {}

local ROAD_Y = Layout.Heights.Road
local WALK_Y = Layout.Heights.Sidewalk
local ASPHALT = Color3.fromRGB(46, 48, 54)
local ASPHALT_HW = Color3.fromRGB(56, 58, 64)
local SIDEWALK = Color3.fromRGB(196, 194, 188)
local YELLOW = Color3.fromRGB(240, 196, 40)
local WHITE = Color3.fromRGB(235, 235, 235)
local MARK_Y = ROAD_Y + 0.03

local function segGeometry(info, seg)
	local inters = info.Intersections
	local A, B = inters[seg.A], inters[seg.B]
	local alongA, alongB = RoadGraph.Along(A, seg), RoadGraph.Along(B, seg)
	local dir = (B.Pos - A.Pos).Unit
	local startP = A.Pos + dir * alongA
	local endP = B.Pos - dir * alongB
	local len = (endP - startP).Magnitude
	local mid = (startP + endP) / 2
	-- frame: LookVector along the road, RightVector across it
	local frame = CFrame.lookAt(Vector3.new(mid.X, 0, mid.Z), Vector3.new(mid.X, 0, mid.Z) + dir)
	return frame, len, startP, endP, dir
end

local function isSidewalked(seg): boolean
	local kind = RoadGraph.Kind(Layout, seg.Kind)
	return (kind.Sidewalk or 0) > 0
end

---------------------------------------------------------------------------
-- Essential
---------------------------------------------------------------------------
function RoadBuilder.Essential(ctx)
	local info = RoadGraph.Analyze(Layout)
	local roads = ctx.Folder("Roads")
	local walks = ctx.Folder("Sidewalks")

	-- intersections
	for _, it in ipairs(info.Intersections) do
		Props.Part(roads, "Intersection", Vector3.new(it.Hx * 2, ROAD_Y, it.Hz * 2), CFrame.new(it.Pos.X, ROAD_Y / 2, it.Pos.Z), it.Highway and ASPHALT_HW or ASPHALT, Enum.Material.Asphalt, { CastShadow = false })
		if it.Street and not it.Highway then
			local sw = Layout.Grid.Sidewalk
			for _, sx in ipairs({ -1, 1 }) do
				for _, sz in ipairs({ -1, 1 }) do
					Props.Part(walks, "Corner", Vector3.new(sw, WALK_Y, sw), CFrame.new(it.Pos.X + sx * (it.Hx + sw / 2), WALK_Y / 2, it.Pos.Z + sz * (it.Hz + sw / 2)), SIDEWALK, Enum.Material.Concrete, { CastShadow = false })
				end
			end
			-- continue the sidewalk straight across sides without a road (T-junctions / corners)
			if not it.Dirs.N then
				Props.Part(walks, "SidewalkCap", Vector3.new(it.Hx * 2, WALK_Y, sw), CFrame.new(it.Pos.X, WALK_Y / 2, it.Pos.Z - it.Hz - sw / 2), SIDEWALK, Enum.Material.Concrete, { CastShadow = false })
			end
			if not it.Dirs.S then
				Props.Part(walks, "SidewalkCap", Vector3.new(it.Hx * 2, WALK_Y, sw), CFrame.new(it.Pos.X, WALK_Y / 2, it.Pos.Z + it.Hz + sw / 2), SIDEWALK, Enum.Material.Concrete, { CastShadow = false })
			end
			if not it.Dirs.W then
				Props.Part(walks, "SidewalkCap", Vector3.new(sw, WALK_Y, it.Hz * 2), CFrame.new(it.Pos.X - it.Hx - sw / 2, WALK_Y / 2, it.Pos.Z), SIDEWALK, Enum.Material.Concrete, { CastShadow = false })
			end
			if not it.Dirs.E then
				Props.Part(walks, "SidewalkCap", Vector3.new(sw, WALK_Y, it.Hz * 2), CFrame.new(it.Pos.X + it.Hx + sw / 2, WALK_Y / 2, it.Pos.Z), SIDEWALK, Enum.Material.Concrete, { CastShadow = false })
			end
		end
	end

	-- road segments + sidewalks
	for _, seg in ipairs(info.Segments) do
		local frame, len = segGeometry(info, seg)
		if len > 0.2 then
			Props.Part(roads, seg.Name or "Road", Vector3.new(seg.Width, ROAD_Y, len), frame * CFrame.new(0, ROAD_Y / 2, 0), seg.Kind == "Highway" and ASPHALT_HW or ASPHALT, Enum.Material.Asphalt, { CastShadow = false })
			if isSidewalked(seg) then
				local kind = RoadGraph.Kind(Layout, seg.Kind)
				local sw = kind.Sidewalk
				for _, side in ipairs({ -1, 1 }) do
					Props.Part(walks, "Sidewalk", Vector3.new(sw, WALK_Y, len), frame * CFrame.new(side * (seg.Width / 2 + sw / 2), WALK_Y / 2, 0), SIDEWALK, Enum.Material.Concrete, { CastShadow = false })
				end
			end
		end
	end

	-- navigation graph parts (invisible). Clients compute the same graph from CityLayout when not streamed.
	local roadNodes = ctx.Folder("RoadNodes")
	local traffic = RoadGraph.Traffic(Layout)
	for _, n in ipairs(traffic.List) do
		local p = Props.Volume(roadNodes, "RoadNode", CFrame.new(n.Position + Vector3.new(0, 0.5, 0)), Vector3.new(1, 1, 1), nil, {
			NodeId = n.Id,
			Links = table.concat(n.Links, ","),
		})
		Props.Tag(p, World.Tags.RoadNode)
	end
	local walkNodes = ctx.Folder("WalkNodes")
	local walk = RoadGraph.Walk(Layout)
	for _, n in ipairs(walk.List) do
		local p = Props.Volume(walkNodes, "WalkNode", CFrame.new(n.Position + Vector3.new(0, 0.5, 0)), Vector3.new(1, 1, 1), nil, {
			NodeId = n.Id,
			Links = table.concat(n.Links, ","),
		})
		Props.Tag(p, World.Tags.WalkNode)
	end
end

---------------------------------------------------------------------------
-- Decor
---------------------------------------------------------------------------
local function mark(parent: Instance, size: Vector3, cf: CFrame, color: Color3)
	return Props.Small(parent, "Marking", size, cf, color, Enum.Material.SmoothPlastic, { CanCollide = false, CanQuery = false, CanTouch = false })
end

local function decorSegment(parent: Instance, lightsFolder: Instance, info, seg)
	local frame, len = segGeometry(info, seg)
	if len < 4 then
		return
	end
	local kind = RoadGraph.Kind(Layout, seg.Kind)
	local half = seg.Width / 2
	local edge = half - (kind.Shoulder or 5)
	local markY = MARK_Y - ROAD_Y / 2
	local base = frame * CFrame.new(0, ROAD_Y / 2, 0)
	if seg.Kind == "Highway" then
		-- median barrier + yellow inner edges
		Props.Part(parent, "MedianBarrier", Vector3.new(1.4, 2.8, len), base * CFrame.new(0, 1.4, 0), Color3.fromRGB(190, 188, 182), Enum.Material.Concrete, { CastShadow = false })
		for _, s in ipairs({ -1, 1 }) do
			mark(parent, Vector3.new(0.4, 0.06, len), base * CFrame.new(s * ((kind.Median or 2) + 0.3), markY, 0), YELLOW)
			mark(parent, Vector3.new(0.5, 0.06, len), base * CFrame.new(s * edge, markY, 0), WHITE)
			-- guard rail
			Props.Small(parent, "GuardRail", Vector3.new(0.4, 1, len), base * CFrame.new(s * (half - 0.4), 2.2, 0), Color3.fromRGB(170, 172, 178), Enum.Material.Metal)
			local posts = math.floor(len / 24)
			for i = 0, posts do
				Props.Small(parent, "RailPost", Vector3.new(0.4, 2.4, 0.4), base * CFrame.new(s * (half - 0.4), 1.2, -len / 2 + i * (len / math.max(1, posts))), Color3.fromRGB(120, 122, 128), Enum.Material.Metal)
			end
			-- dashed lane divider
			local offsets = RoadGraph.LaneOffsets(kind, seg.Width)
			if #offsets >= 2 then
				local divider = (offsets[1] + offsets[2]) / 2
				local dashes = math.floor(len / 40)
				for i = 0, dashes - 1 do
					mark(parent, Vector3.new(0.4, 0.06, 12), base * CFrame.new(s * divider, markY, -len / 2 + 14 + i * 40), WHITE)
				end
			end
		end
		-- median lights
		local count = math.floor(len / 160)
		for i = 1, count do
			local z = -len / 2 + i * (len / (count + 1))
			local cf = base * CFrame.new(0, -ROAD_Y / 2 + 2.8, z)
			Gameplay.Streetlight(lightsFolder, CFrame.new(cf.Position) * (frame - frame.Position) * CFrame.Angles(0, math.pi / 2, 0), true)
		end
		return
	end
	-- streets: double yellow centre line + white edge lines
	mark(parent, Vector3.new(0.3, 0.06, len), base * CFrame.new(-0.4, markY, 0), YELLOW)
	mark(parent, Vector3.new(0.3, 0.06, len), base * CFrame.new(0.4, markY, 0), YELLOW)
	for _, s in ipairs({ -1, 1 }) do
		mark(parent, Vector3.new(0.4, 0.06, len), base * CFrame.new(s * edge, markY, 0), WHITE)
	end
	-- streetlights on alternating sides, pole on the kerb, arm over the road
	if kind.Lights and len > 60 then
		local count = math.max(1, math.floor(len / 95))
		for i = 1, count do
			local z = -len / 2 + i * (len / (count + 1))
			local side = (i + seg.Id) % 2 == 0 and 1 or -1
			local pos = (frame * CFrame.new(side * (half + 1.4), WALK_Y, z)).Position
			local towardRoad = frame.RightVector * -side
			Gameplay.Streetlight(lightsFolder, Props.Facing(pos, towardRoad))
		end
	end
end

local function crosswalks(parent: Instance, it, info)
	local segs = info.Segments
	for dirName, segId in pairs(it.Dirs) do
		local seg = segs[segId]
		if seg.Kind ~= "Highway" then
			local dir
			if dirName == "N" then
				dir = Vector3.new(0, 0, -1)
			elseif dirName == "S" then
				dir = Vector3.new(0, 0, 1)
			elseif dirName == "E" then
				dir = Vector3.new(1, 0, 0)
			else
				dir = Vector3.new(-1, 0, 0)
			end
			local along = RoadGraph.Along(it, seg)
			local center = it.Pos + dir * (along + 4)
			local frame = CFrame.lookAt(Vector3.new(center.X, MARK_Y, center.Z), Vector3.new(center.X, MARK_Y, center.Z) + dir)
			local stripes = math.floor((seg.Width - 4) / 4)
			for i = 0, stripes - 1 do
				local x = -((stripes - 1) * 4) / 2 + i * 4
				mark(parent, Vector3.new(2, 0.06, 6), frame * CFrame.new(x, 0, 0), WHITE)
			end
			-- stop line on the approaching lane (right-hand traffic arrives on the left of `dir`)
			mark(parent, Vector3.new(seg.Width / 2 - 1, 0.06, 0.8), frame * CFrame.new(-seg.Width / 4, 0, -4), WHITE)
		end
	end
end

function RoadBuilder.Decor(ctx)
	local info = RoadGraph.Analyze(Layout)
	local markings = ctx.Folder("Markings")
	local lights = ctx.Folder("Streetlights")
	for _, seg in ipairs(info.Segments) do
		decorSegment(markings, lights, info, seg)
	end
	for _, it in ipairs(info.Intersections) do
		if it.Street and not it.Highway then
			crosswalks(markings, it, info)
		end
	end
	-- on-ramps (merge lanes)
	local roads = ctx.Folder("Roads")
	for _, r in ipairs(Layout.Ramps or {}) do
		local a: Vector3, b: Vector3 = r.From, r.To
		local len = (b - a).Magnitude
		local mid = (a + b) / 2
		local frame = CFrame.lookAt(Vector3.new(mid.X, 0, mid.Z), Vector3.new(b.X, 0, b.Z))
		Props.Part(roads, "OnRamp", Vector3.new(r.Width, ROAD_Y - 0.06, len), frame * CFrame.new(0, (ROAD_Y - 0.06) / 2, 0), ASPHALT_HW, Enum.Material.Asphalt, { CastShadow = false })
		for _, s in ipairs({ -1, 1 }) do
			mark(markings, Vector3.new(0.4, 0.06, len), frame * CFrame.new(s * (r.Width / 2 - 0.6), ROAD_Y - 0.03, 0), WHITE)
		end
	end
	-- highway signs at the junctions
	for _, it in ipairs(info.Intersections) do
		if it.Highway and it.Street then
			local post = Props.Part(markings, "HighwaySign", Vector3.new(14, 5, 0.5), CFrame.new(it.Pos + Vector3.new(it.Hx + 6, 14, it.Hz + 6)), Color3.fromRGB(30, 110, 60), Enum.Material.SmoothPlastic)
			Props.Sign(post, "SKYLINE LOOP ⟳", { PixelsPerStud = 20 })
			Props.Small(markings, "SignPole", Vector3.new(0.6, 12, 0.6), CFrame.new(it.Pos + Vector3.new(it.Hx + 6, 6, it.Hz + 6.5)), Color3.fromRGB(120, 122, 128), Enum.Material.Metal)
		end
	end
end

return RoadBuilder
