-- Serializer: compact, DataStore-safe encoding of builds.
--
-- Saved shape (at the context's DataPath):
--   Build = {
--     Version = 1,
--     NextUid = 12,
--     Items = { { u = "1", i = "sofa_3", p = { x, y, z }, r = step, c = { R, G, B }?, m = "Fabric"?, pp = paid, f = true? }, ... },
--     Surfaces = { Walls = { c = { R, G, B }, m = "Brick" }?, Floor = { ... }? },
--   }
--   u  = uid (string, unique inside the build)      i = furniture item id
--   p  = position relative to Origin, rounded to 0.05 studs (bottom-centre of the item)
--   r  = yaw step (0..23, 15° each)                 c = colour override (0-255 ints), m = material override
--   pp = price actually paid (sell-back refunds a fraction of this)   f = free starter item (no refund)
--
-- Decoded entry (in memory, both server and client):
--   { Uid, ItemId, Position: Vector3, Step, Color: Color3?, Material: string?, Paid, Free }

local BuildMath = require(script.Parent.BuildMath)

local Serializer = {}

Serializer.VERSION = 1

local function int255(n: any): number?
	if type(n) ~= "number" or n ~= n then
		return nil
	end
	return math.clamp(math.floor(n + 0.5), 0, 255)
end

function Serializer.ColorToArray(c: Color3): { number }
	return { math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5) }
end

function Serializer.ArrayToColor(t: any): Color3?
	if type(t) ~= "table" then
		return nil
	end
	local r, g, b = int255(t[1]), int255(t[2]), int255(t[3])
	if not (r and g and b) then
		return nil
	end
	return Color3.fromRGB(r, g, b)
end

function Serializer.NewBuild()
	return { Version = Serializer.VERSION, NextUid = 1, Items = {}, Surfaces = {} }
end

function Serializer.Encode(entry): { [string]: any }
	local p = BuildMath.RoundVector(entry.Position)
	local out: { [string]: any } = {
		u = tostring(entry.Uid),
		i = entry.ItemId,
		p = { p.X, p.Y, p.Z },
		r = BuildMath.NormalizeStep(entry.Step or 0),
		pp = math.max(0, math.floor(entry.Paid or 0)),
	}
	if entry.Color then
		out.c = Serializer.ColorToArray(entry.Color)
	end
	if entry.Material then
		out.m = entry.Material
	end
	if entry.Free then
		out.f = true
	end
	return out
end

function Serializer.Decode(raw: any)
	if type(raw) ~= "table" then
		return nil
	end
	if type(raw.i) ~= "string" or type(raw.p) ~= "table" then
		return nil
	end
	local x, y, z = raw.p[1], raw.p[2], raw.p[3]
	if type(x) ~= "number" or type(y) ~= "number" or type(z) ~= "number" then
		return nil
	end
	if x ~= x or y ~= y or z ~= z then
		return nil
	end
	local uid = raw.u
	if type(uid) == "number" then
		uid = tostring(uid)
	end
	if type(uid) ~= "string" or uid == "" then
		return nil
	end
	return {
		Uid = uid,
		ItemId = raw.i,
		Position = Vector3.new(x, y, z),
		Step = BuildMath.NormalizeStep(type(raw.r) == "number" and raw.r or 0),
		Color = Serializer.ArrayToColor(raw.c),
		Material = type(raw.m) == "string" and raw.m or nil,
		Paid = type(raw.pp) == "number" and math.max(0, raw.pp) or 0,
		Free = raw.f == true,
	}
end

-- Decode a whole build table. Returns (entries map uid -> entry, nextUid, surfaces)
function Serializer.DecodeBuild(build: any)
	local entries = {}
	local nextUid = 1
	local surfaces = {}
	if type(build) ~= "table" then
		return entries, nextUid, surfaces
	end
	if type(build.Items) == "table" then
		for _, raw in ipairs(build.Items) do
			local e = Serializer.Decode(raw)
			if e and not entries[e.Uid] then
				entries[e.Uid] = e
				local n = tonumber(e.Uid)
				if n and n >= nextUid then
					nextUid = n + 1
				end
			end
		end
	end
	if type(build.NextUid) == "number" and build.NextUid > nextUid then
		nextUid = math.floor(build.NextUid)
	end
	if type(build.Surfaces) == "table" then
		for target, s in pairs(build.Surfaces) do
			if type(target) == "string" and type(s) == "table" then
				surfaces[target] = { Color = Serializer.ArrayToColor(s.c), Material = type(s.m) == "string" and s.m or nil }
			end
		end
	end
	return entries, nextUid, surfaces
end

-- Encode entries map back into a build table (items sorted by numeric uid for stable saves).
function Serializer.EncodeBuild(entries, nextUid: number, surfaces)
	local list = {}
	for _, e in pairs(entries) do
		table.insert(list, e)
	end
	table.sort(list, function(a, b)
		local na, nb = tonumber(a.Uid) or 0, tonumber(b.Uid) or 0
		if na == nb then
			return a.Uid < b.Uid
		end
		return na < nb
	end)
	local items = table.create(#list)
	for i, e in ipairs(list) do
		items[i] = Serializer.Encode(e)
	end
	local surf = {}
	for target, s in pairs(surfaces or {}) do
		local out = {}
		if s.Color then
			out.c = Serializer.ColorToArray(s.Color)
		end
		if s.Material then
			out.m = s.Material
		end
		surf[target] = out
	end
	return { Version = Serializer.VERSION, NextUid = nextUid, Items = items, Surfaces = surf }
end

-- Sell-back value of every paid item in a raw build table.
function Serializer.SellBackValue(build: any, fraction: number): number
	local entries = Serializer.DecodeBuild(build)
	local total = 0
	for _, e in pairs(entries) do
		if not e.Free then
			total += math.floor(e.Paid * fraction)
		end
	end
	return total
end

function Serializer.Count(build: any): number
	if type(build) == "table" and type(build.Items) == "table" then
		return #build.Items
	end
	return 0
end

return Serializer
