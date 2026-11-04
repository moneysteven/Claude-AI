-- RoadGraph (shared, pure): turns Config/CityLayout.Roads into intersections, road segments,
-- a directed lane graph for NPC traffic and an undirected sidewalk graph for pedestrians.
-- The server uses it to build the road network + RoadNode/WalkNode parts; clients use the same
-- function as a fallback when node parts are not streamed in. Ids are deterministic, so
-- server-made nodes and client-computed nodes share the same NodeId.
--
--   RoadGraph.Analyze(layout) -> { Intersections = {inter}, Segments = {seg} }
--       inter = { Id, Pos, Hx, Hz, Dirs = { N|S|E|W = segId }, Highway, Street }
--       seg   = { Id, A, B (inter ids; A has the smaller coordinate), Axis ("X"|"Z"), Width, Kind, Name, Length }
--   RoadGraph.Along(inter, seg) -> half size of the intersection box along the segment
--   RoadGraph.Kind(layout, kindName) -> road kind table (lanes, median, shoulder, speeds)
--   RoadGraph.Traffic(layout) -> { Nodes = {[id] = node}, List = {node} }   directed lanes (right-hand traffic)
--   RoadGraph.Walk(layout)    -> { Nodes = {[id] = node}, List = {node} }   sidewalks + crosswalks (both directions)
--       node = { Id, Position (surface height), Links = {id}, SpeedMin, SpeedMax, Kind, Cross = {[id]=true}? }

local RoadGraph = {}

local DEFAULT_KIND = { Lanes = 1, Median = 0.5, Shoulder = 5, Sidewalk = 10, Speed = { 26, 40 } }
local TRAFFIC_SPACING = 140 -- studs between intermediate lane nodes
local WALK_SPACING = 90

local analyzeCache = setmetatable({}, { __mode = "k" })
local trafficCache = setmetatable({}, { __mode = "k" })
local walkCache = setmetatable({}, { __mode = "k" })

local function round(n: number): number
	return math.floor(n + 0.5)
end

local function keyOf(x: number, z: number): string
	return string.format("%d_%d", round(x), round(z))
end

function RoadGraph.Kind(layout, kindName: string?)
	local kinds = layout.RoadKinds or {}
	return kinds[kindName or "Street"] or DEFAULT_KIND
end

local function uniqueSorted(list: { number }): { number }
	table.sort(list)
	local out = {}
	for _, n in ipairs(list) do
		if #out == 0 or math.abs(out[#out] - n) > 0.5 then
			table.insert(out, n)
		end
	end
	return out
end

function RoadGraph.Analyze(layout)
	local cached = analyzeCache[layout]
	if cached then
		return cached
	end
	local inters = {}
	local byKey = {}
	local function inter(x: number, z: number)
		local k = keyOf(x, z)
		local it = byKey[k]
		if not it then
			it = {
				Id = #inters + 1,
				Key = k,
				Pos = Vector3.new(round(x), 0, round(z)),
				Hx = 0,
				Hz = 0,
				Dirs = {},
				Highway = false,
				Street = false,
			}
			byKey[k] = it
			table.insert(inters, it)
		end
		return it
	end

	local verts, horiz = {}, {}
	for index, r in ipairs(layout.Roads or {}) do
		local a: Vector3, b: Vector3 = r.From, r.To
		if typeof(a) == "Vector3" and typeof(b) == "Vector3" then
			if math.abs(a.X - b.X) < 0.5 and math.abs(a.Z - b.Z) >= 1 then
				table.insert(verts, { Road = r, Index = index, C = a.X, Lo = math.min(a.Z, b.Z), Hi = math.max(a.Z, b.Z), Stops = { a.Z, b.Z } })
			elseif math.abs(a.Z - b.Z) < 0.5 and math.abs(a.X - b.X) >= 1 then
				table.insert(horiz, { Road = r, Index = index, C = a.Z, Lo = math.min(a.X, b.X), Hi = math.max(a.X, b.X), Stops = { a.X, b.X } })
			end
		end
	end

	local TOL = 1
	for _, vl in ipairs(verts) do
		for _, hl in ipairs(horiz) do
			if vl.C >= hl.Lo - TOL and vl.C <= hl.Hi + TOL and hl.C >= vl.Lo - TOL and hl.C <= vl.Hi + TOL then
				table.insert(vl.Stops, hl.C)
				table.insert(hl.Stops, vl.C)
			end
		end
	end

	local segs = {}
	local function addLine(line, axis: string)
		local stops = uniqueSorted(line.Stops)
		local r = line.Road
		local half = (r.Width or 36) / 2
		local kind = r.Kind or "Street"
		local nodes = {}
		for _, s in ipairs(stops) do
			local it = axis == "Z" and inter(line.C, s) or inter(s, line.C)
			if axis == "Z" then
				it.Hx = math.max(it.Hx, half)
			else
				it.Hz = math.max(it.Hz, half)
			end
			if kind == "Highway" then
				it.Highway = true
			else
				it.Street = true
			end
			table.insert(nodes, it)
		end
		for i = 1, #nodes - 1 do
			local A, B = nodes[i], nodes[i + 1]
			local seg = {
				Id = #segs + 1,
				A = A.Id,
				B = B.Id,
				Axis = axis,
				Width = r.Width or 36,
				Kind = kind,
				Name = r.Name,
				Length = (B.Pos - A.Pos).Magnitude,
			}
			table.insert(segs, seg)
			if axis == "Z" then
				A.Dirs.S = seg.Id
				B.Dirs.N = seg.Id
			else
				A.Dirs.E = seg.Id
				B.Dirs.W = seg.Id
			end
		end
	end
	for _, vl in ipairs(verts) do
		addLine(vl, "Z")
	end
	for _, hl in ipairs(horiz) do
		addLine(hl, "X")
	end
	-- dead ends: square caps
	for _, it in ipairs(inters) do
		if it.Hx == 0 then
			it.Hx = it.Hz
		end
		if it.Hz == 0 then
			it.Hz = it.Hx
		end
	end

	local result = { Intersections = inters, Segments = segs }
	analyzeCache[layout] = result
	return result
end

-- Half size of an intersection box measured along a segment's axis.
function RoadGraph.Along(it, seg): number
	return seg.Axis == "Z" and it.Hz or it.Hx
end

local function laneOffsets(kind, width: number): { number }
	local lanes = math.max(1, kind.Lanes or 1)
	local median = kind.Median or 0.5
	local shoulder = kind.Shoulder or 5
	local laneW = math.max(4, (width / 2 - median - shoulder) / lanes)
	local out = {}
	for l = 1, lanes do
		out[l] = median + laneW * (l - 0.5)
	end
	return out
end
RoadGraph.LaneOffsets = laneOffsets

function RoadGraph.Traffic(layout)
	local cached = trafficCache[layout]
	if cached then
		return cached
	end
	local info = RoadGraph.Analyze(layout)
	local inters, segs = info.Intersections, info.Segments
	local roadY = (layout.Heights and layout.Heights.Road) or 0.4
	local nodes, list = {}, {}
	-- entry[segId][dir][lane] = first node id ; exitNodes = { {seg, dir, lane, node, toInter} }
	local entry = {}
	local exits = {}

	local function add(id: string, pos: Vector3, kind)
		local n = {
			Id = id,
			Position = pos,
			Links = {},
			SpeedMin = kind.Speed and kind.Speed[1] or 26,
			SpeedMax = kind.Speed and kind.Speed[2] or 40,
		}
		nodes[id] = n
		table.insert(list, n)
		return n
	end

	for _, seg in ipairs(segs) do
		local kind = RoadGraph.Kind(layout, seg.Kind)
		local offsets = laneOffsets(kind, seg.Width)
		entry[seg.Id] = { [1] = {}, [-1] = {} }
		for _, dir in ipairs({ 1, -1 }) do
			local P = inters[dir == 1 and seg.A or seg.B]
			local Q = inters[dir == 1 and seg.B or seg.A]
			local delta = Q.Pos - P.Pos
			if delta.Magnitude > 1 then
				local u = delta.Unit
				local right = u:Cross(Vector3.yAxis)
				local s = P.Pos + u * (RoadGraph.Along(P, seg) + 3)
				local e = Q.Pos - u * (RoadGraph.Along(Q, seg) + 3)
				local len = (e - s).Magnitude
				local count = math.max(1, math.floor(len / TRAFFIC_SPACING))
				for lane, off in ipairs(offsets) do
					local prev = nil
					for i = 0, count do
						local p = s + (e - s) * (i / count) + right * off
						local id = string.format("t%d%s%d_%d", seg.Id, dir == 1 and "f" or "b", lane, i)
						local n = add(id, Vector3.new(p.X, roadY, p.Z), kind)
						n.Kind = seg.Kind
						if prev then
							table.insert(prev.Links, id)
						else
							entry[seg.Id][dir][lane] = id
						end
						prev = n
					end
					table.insert(exits, { Seg = seg, Dir = dir, Lane = lane, Lanes = #offsets, Node = prev, To = Q })
				end
			end
		end
	end

	for _, ex in ipairs(exits) do
		local Q = ex.To
		local linked = false
		for _, segId in pairs(Q.Dirs) do
			if segId ~= ex.Seg.Id then
				local seg2 = segs[segId]
				local dir2 = (seg2.A == Q.Id) and 1 or -1
				local lanes2 = entry[segId] and entry[segId][dir2]
				if lanes2 then
					local count2 = #laneOffsets(RoadGraph.Kind(layout, seg2.Kind), seg2.Width)
					local lane2 = math.clamp(ex.Lane + (count2 - ex.Lanes), 1, count2)
					local target = lanes2[lane2] or lanes2[1]
					if target then
						table.insert(ex.Node.Links, target)
						linked = true
					end
				end
			end
		end
		if not linked then
			-- dead end: U-turn into the opposite lane
			local back = entry[ex.Seg.Id] and entry[ex.Seg.Id][-ex.Dir]
			local target = back and (back[1])
			if target then
				table.insert(ex.Node.Links, target)
			end
		end
	end

	local result = { Nodes = nodes, List = list }
	trafficCache[layout] = result
	return result
end

local QUADS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } } -- ring order

local function quadKey(sx: number, sz: number): string
	return (sx < 0 and "w" or "e") .. (sz < 0 and "n" or "s")
end

function RoadGraph.Walk(layout)
	local cached = walkCache[layout]
	if cached then
		return cached
	end
	local info = RoadGraph.Analyze(layout)
	local inters, segs = info.Intersections, info.Segments
	local walkY = (layout.Heights and layout.Heights.Sidewalk) or 0.9
	local nodes, list = {}, {}

	local function add(id: string, pos: Vector3)
		local n = { Id = id, Position = pos, Links = {}, Cross = {} }
		nodes[id] = n
		table.insert(list, n)
		return n
	end
	local function link(a, b, cross: boolean?)
		if not a or not b or a == b then
			return
		end
		if not table.find(a.Links, b.Id) then
			table.insert(a.Links, b.Id)
		end
		if not table.find(b.Links, a.Id) then
			table.insert(b.Links, a.Id)
		end
		if cross then
			a.Cross[b.Id] = true
			b.Cross[a.Id] = true
		end
	end

	local corners = {} -- [interId][quadKey] = node
	for _, it in ipairs(inters) do
		if it.Street and not it.Highway then
			-- sidewalk width: widest street kind meeting here
			local sw = 10
			for _, segId in pairs(it.Dirs) do
				local k = RoadGraph.Kind(layout, segs[segId].Kind)
				sw = math.max(sw, k.Sidewalk or 0)
			end
			local c = {}
			for _, q in ipairs(QUADS) do
				local p = it.Pos + Vector3.new(q[1] * (it.Hx + sw / 2), 0, q[2] * (it.Hz + sw / 2))
				c[quadKey(q[1], q[2])] = add(string.format("w%d%s", it.Id, quadKey(q[1], q[2])), Vector3.new(p.X, walkY, p.Z))
			end
			corners[it.Id] = c
			-- ring around the intersection: crossing a street = crosswalk
			local hasN, hasS, hasE, hasW = it.Dirs.N ~= nil, it.Dirs.S ~= nil, it.Dirs.E ~= nil, it.Dirs.W ~= nil
			link(c.wn, c.en, hasN)
			link(c.en, c.es, hasE)
			link(c.es, c.ws, hasS)
			link(c.ws, c.wn, hasW)
		end
	end

	local function chain(a, b, prefix: string)
		if not a or not b then
			return
		end
		local d = (b.Position - a.Position).Magnitude
		local count = math.floor(d / WALK_SPACING)
		local prev = a
		for i = 1, count do
			local p = a.Position:Lerp(b.Position, i / (count + 1))
			local n = add(string.format("%s_%d", prefix, i), p)
			link(prev, n)
			prev = n
		end
		link(prev, b)
	end

	for _, seg in ipairs(segs) do
		local k = RoadGraph.Kind(layout, seg.Kind)
		if (k.Sidewalk or 0) > 0 then
			local ca, cb = corners[seg.A], corners[seg.B]
			if ca and cb then
				if seg.Axis == "Z" then
					chain(ca.ws, cb.wn, string.format("w%dW", seg.Id)) -- west side (A north, B south)
					chain(ca.es, cb.en, string.format("w%dE", seg.Id))
				else
					chain(ca.en, cb.wn, string.format("w%dN", seg.Id)) -- north side (A west, B east)
					chain(ca.es, cb.ws, string.format("w%dS", seg.Id))
				end
			end
		end
	end

	local result = { Nodes = nodes, List = list }
	walkCache[layout] = result
	return result
end

return RoadGraph
