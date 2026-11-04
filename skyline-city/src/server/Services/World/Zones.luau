-- Zones (World helper): caches tagged volumes (DistrictZone, SafeZone, VIPArea, PartyZone) and answers
-- cheap point-in-box queries. Volumes are anchored and static, so their CFrame/Size are cached and refreshed
-- only when a part changes (or every RefreshSeconds as a safety net).
--
--   Zones.Init()
--   Zones.Find(tag, pos) -> BasePart?        smallest volume of that tag containing pos
--   Zones.Inside(part, pos) -> boolean
--   Zones.DistrictAt(pos) -> string?          DistrictZone volumes, falling back to CityLayout rectangles
--   Zones.List(tag) -> { BasePart }

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)

local Zones = {}

local TRACKED = {
	World.Tags.DistrictZone,
	World.Tags.SafeZone,
	World.Tags.VIPArea,
	World.Tags.PartyZone,
}

type Entry = { Part: BasePart, CF: CFrame, Half: Vector3, Volume: number }
local caches: { [string]: { [BasePart]: Entry } } = {}
local conns: { [BasePart]: { RBXScriptConnection } } = {}

local function refresh(e: Entry)
	e.CF = e.Part.CFrame
	e.Half = e.Part.Size / 2
	e.Volume = e.Part.Size.X * e.Part.Size.Y * e.Part.Size.Z
end

local function add(tag: string, inst: Instance)
	if not inst:IsA("BasePart") then
		return
	end
	local part = inst :: BasePart
	local cache = caches[tag]
	if cache[part] then
		return
	end
	local e: Entry = { Part = part, CF = part.CFrame, Half = part.Size / 2, Volume = 0 }
	refresh(e)
	cache[part] = e
	local list = conns[part] or {}
	table.insert(list, part:GetPropertyChangedSignal("CFrame"):Connect(function()
		refresh(e)
	end))
	table.insert(list, part:GetPropertyChangedSignal("Size"):Connect(function()
		refresh(e)
	end))
	conns[part] = list
end

local function remove(tag: string, inst: Instance)
	local part = inst :: BasePart
	local cache = caches[tag]
	if cache and cache[part] then
		cache[part] = nil
	end
	local stillTracked = false
	for _, c in pairs(caches) do
		if c[part] then
			stillTracked = true
		end
	end
	if not stillTracked and conns[part] then
		for _, c in ipairs(conns[part]) do
			c:Disconnect()
		end
		conns[part] = nil
	end
end

function Zones.Init()
	for _, tag in ipairs(TRACKED) do
		caches[tag] = {}
		for _, inst in ipairs(CollectionService:GetTagged(tag)) do
			add(tag, inst)
		end
		CollectionService:GetInstanceAddedSignal(tag):Connect(function(inst)
			add(tag, inst)
		end)
		CollectionService:GetInstanceRemovedSignal(tag):Connect(function(inst)
			remove(tag, inst)
		end)
	end
end

local function inside(e: Entry, pos: Vector3): boolean
	local rel = e.CF:PointToObjectSpace(pos)
	local h = e.Half
	return math.abs(rel.X) <= h.X and math.abs(rel.Y) <= h.Y and math.abs(rel.Z) <= h.Z
end

function Zones.Inside(part: BasePart, pos: Vector3): boolean
	for _, cache in pairs(caches) do
		local e = cache[part]
		if e then
			return inside(e, pos)
		end
	end
	local rel = part.CFrame:PointToObjectSpace(pos)
	local h = part.Size / 2
	return math.abs(rel.X) <= h.X and math.abs(rel.Y) <= h.Y and math.abs(rel.Z) <= h.Z
end

function Zones.Find(tag: string, pos: Vector3): BasePart?
	local cache = caches[tag]
	if not cache then
		return nil
	end
	local best: Entry? = nil
	for _, e in pairs(cache) do
		if inside(e, pos) and (best == nil or e.Volume < (best :: Entry).Volume) then
			best = e
		end
	end
	return best and (best :: Entry).Part or nil
end

function Zones.List(tag: string): { BasePart }
	local out = {}
	for part in pairs(caches[tag] or {}) do
		table.insert(out, part)
	end
	return out
end

function Zones.DistrictAt(pos: Vector3): string?
	local part = Zones.Find(World.Tags.DistrictZone, pos)
	if part then
		local d = part:GetAttribute("District")
		if type(d) == "string" and d ~= "" then
			return d
		end
	end
	-- fallback: layout rectangles (smallest wins)
	local bestName, bestArea = nil, math.huge
	for _, d in ipairs(Layout.Districts) do
		local c: Vector3, s: Vector2 = d.Center, d.Size
		if math.abs(pos.X - c.X) <= s.X / 2 and math.abs(pos.Z - c.Z) <= s.Y / 2 then
			local area = s.X * s.Y
			if area < bestArea then
				bestName, bestArea = d.Name, area
			end
		end
	end
	return bestName
end

return Zones
