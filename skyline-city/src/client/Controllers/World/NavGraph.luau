-- NavGraph (client helper): road-lane / sidewalk graph for cosmetic NPCs.
-- Built from Config/CityLayout through Shared/World/RoadGraph (works even when node parts are not streamed),
-- then extended with any RoadNode / WalkNode tagged parts that stream in (hand-made maps add their own nodes).
--
--   local g = NavGraph.new("Road" | "Walk")
--   g:Get(id) -> node?          node = { Id, Position, Links = {id}, SpeedMin, SpeedMax, Cross = {[id]=true}? }
--   g:RandomNear(pos, maxR, minR, rng) -> node?
--   g:Next(node, prevId?, rng) -> node?      random outgoing link (avoids going straight back when possible)
--   g:Destroy()

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local RoadGraph = require(Shared:WaitForChild("World"):WaitForChild("RoadGraph"))

local NavGraph = {}
NavGraph.__index = NavGraph

local CELL = 100

local function cellKey(x: number, z: number): string
	return math.floor(x / CELL) .. "_" .. math.floor(z / CELL)
end

function NavGraph.new(kind: string)
	local self = setmetatable({ Kind = kind, Nodes = {}, List = {}, Cells = {} }, NavGraph)
	local config = Shared:FindFirstChild("Config")
	local module = config and config:FindFirstChild("CityLayout")
	if module and module:IsA("ModuleScript") then
		local ok, layout = pcall(require, module)
		if ok and type(layout) == "table" and type(layout.Roads) == "table" then
			local okGraph, g = pcall(function()
				return kind == "Road" and RoadGraph.Traffic(layout) or RoadGraph.Walk(layout)
			end)
			if okGraph and g then
				for _, n in ipairs(g.List) do
					self:_add(n.Id, n.Position, n.Links, n.SpeedMin, n.SpeedMax, n.Cross)
				end
			end
		end
	end
	local tag = kind == "Road" and World.Tags.RoadNode or World.Tags.WalkNode
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		self:_fromPart(inst)
	end
	self._conn = CollectionService:GetInstanceAddedSignal(tag):Connect(function(inst)
		self:_fromPart(inst)
	end)
	return self
end

function NavGraph:_add(id: string, pos: Vector3, links: { string }, smin: number?, smax: number?, cross)
	if self.Nodes[id] then
		return
	end
	local n = { Id = id, Position = pos, Links = links, SpeedMin = smin or 26, SpeedMax = smax or 40, Cross = cross }
	self.Nodes[id] = n
	table.insert(self.List, n)
	local key = cellKey(pos.X, pos.Z)
	local cell = self.Cells[key]
	if not cell then
		cell = {}
		self.Cells[key] = cell
	end
	table.insert(cell, n)
end

function NavGraph:_fromPart(inst: Instance)
	if not inst:IsA("BasePart") then
		return
	end
	local id = inst:GetAttribute("NodeId")
	if type(id) ~= "string" or self.Nodes[id] then
		return
	end
	local links = {}
	local raw = inst:GetAttribute("Links")
	if type(raw) == "string" then
		for _, l in ipairs(string.split(raw, ",")) do
			if l ~= "" then
				table.insert(links, l)
			end
		end
	end
	local speedMin = inst:GetAttribute("SpeedMin")
	local speedMax = inst:GetAttribute("SpeedMax")
	self:_add(id, (inst :: BasePart).Position - Vector3.new(0, 0.5, 0), links, type(speedMin) == "number" and speedMin or nil, type(speedMax) == "number" and speedMax or nil, nil)
end

function NavGraph:Get(id: string)
	return self.Nodes[id]
end

function NavGraph:RandomNear(pos: Vector3, maxR: number, minR: number, rng: Random)
	local cx0, cx1 = math.floor((pos.X - maxR) / CELL), math.floor((pos.X + maxR) / CELL)
	local cz0, cz1 = math.floor((pos.Z - maxR) / CELL), math.floor((pos.Z + maxR) / CELL)
	local candidates = {}
	local maxSq, minSq = maxR * maxR, minR * minR
	for cx = cx0, cx1 do
		for cz = cz0, cz1 do
			local cell = self.Cells[cx .. "_" .. cz]
			if cell then
				for _, n in ipairs(cell) do
					local dx, dz = n.Position.X - pos.X, n.Position.Z - pos.Z
					local d = dx * dx + dz * dz
					if d <= maxSq and d >= minSq and #n.Links > 0 then
						table.insert(candidates, n)
					end
				end
			end
		end
	end
	if #candidates == 0 then
		return nil
	end
	return candidates[rng:NextInteger(1, #candidates)]
end

function NavGraph:Next(node, prevId: string?, rng: Random)
	local links = node.Links
	if #links == 0 then
		return nil
	end
	local options = {}
	for _, id in ipairs(links) do
		if id ~= prevId and self.Nodes[id] then
			table.insert(options, id)
		end
	end
	if #options == 0 then
		-- only way on is straight back (dead-end sidewalk / U-turn link)
		if prevId and table.find(links, prevId) and self.Nodes[prevId] then
			return self.Nodes[prevId]
		end
		return nil
	end
	return self.Nodes[options[rng:NextInteger(1, #options)]]
end

function NavGraph:Destroy()
	if self._conn then
		self._conn:Disconnect()
		self._conn = nil
	end
end

return NavGraph
