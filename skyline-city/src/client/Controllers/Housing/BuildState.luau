-- BuildState (client helper): the build-mode model — server items + a stack of pending operations.
--
--   local s = BuildState.new(ctx)            ctx = BeginSession descriptor from the server
--   s:SetServerState(state)                  { Items, Surfaces, MaxItems, Floors } (BuildEvent "State" / PlaceBatch reply)
--   s:Push(op) -> (ok, err)                  local ops (Key = server uid or "p<n>" for pending placements):
--       { Type = "Place", ItemId, Pos, Step, Color?, Material? }   -- Key is assigned by Push
--       { Type = "Move", Key, Pos, Step } · { Type = "Remove", Key } · { Type = "Paint", Key, PaintId, Color? }
--       { Type = "Wallpaper", Target, PaintId, Color? }
--   s:Undo() / s:Redo() / s:Clear() / s:CanUndo() / s:CanRedo() / s:HasChanges()
--   s:Effective() -> (items: { [key]: entry }, surfaces)     what the build will look like after Confirm
--   s:Compact() -> { serverOp }               the minimal batch sent to Build.PlaceBatch / Build.Quote
--   s:Estimate(isVip, vipFactor) -> (cost, refund)   local preview (the server Quote is authoritative)
--   s:Count() -> number                      items after the pending changes
--   s.Changed : Signal()

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Signal = require(Shared.Util.Signal)
local Furniture = require(Shared.Config.Furniture)
local HousingConfig = require(Shared.Config.Housing)
local BuildMath = require(Shared.Build.BuildMath)
local Serializer = require(Shared.Build.Serializer)

local BuildState = {}
BuildState.__index = BuildState

local MAX_OPS = HousingConfig.Build.MaxOpsPerBatch

local function fromServerItem(it)
	return {
		Key = it.Uid,
		Uid = it.Uid,
		ItemId = it.ItemId,
		Pos = it.P,
		Step = it.R or 0,
		Color = Serializer.ArrayToColor(it.C),
		Material = it.M,
		Paid = it.Paid or 0,
		Free = it.Free == true,
		Server = true,
	}
end

function BuildState.new(ctx)
	local self = setmetatable({}, BuildState)
	self.Ctx = ctx
	self.Server = {}
	self.ServerSurfaces = {}
	self.Ops = {}
	self.RedoStack = {}
	self.Temp = 0
	self.Groups = 0
	self.MaxItems = ctx.MaxItems or 100
	self.Changed = Signal.new()
	self:SetServerState({ Items = ctx.Items, Surfaces = ctx.Surfaces, MaxItems = ctx.MaxItems, Floors = ctx.Floors })
	return self
end

function BuildState:SetServerState(state)
	if type(state) ~= "table" then
		return
	end
	local server = {}
	for _, it in ipairs(state.Items or {}) do
		if type(it) == "table" and type(it.Uid) == "string" and typeof(it.P) == "Vector3" then
			server[it.Uid] = fromServerItem(it)
		end
	end
	self.Server = server
	local surfaces = {}
	for target, s in pairs(state.Surfaces or {}) do
		surfaces[target] = { Color = Serializer.ArrayToColor(s.C), Material = s.M }
	end
	self.ServerSurfaces = surfaces
	if type(state.MaxItems) == "number" then
		self.MaxItems = state.MaxItems
	end
	if type(state.Floors) == "number" then
		self.Ctx.Floors = state.Floors
	end
	if typeof(state.Size) == "Vector3" then
		self.Ctx.Size = state.Size
	end
	-- drop pending ops that reference items that no longer exist on the server
	local valid = {}
	local temps = {}
	for _, op in ipairs(self.Ops) do
		if op.Type == "Place" then
			temps[op.Key] = true
			table.insert(valid, op)
		elseif op.Type == "Wallpaper" then
			table.insert(valid, op)
		elseif (op.Key and (server[op.Key] or temps[op.Key])) then
			table.insert(valid, op)
		end
	end
	self.Ops = valid
	self.Changed:Fire()
end

local function copy(e)
	local n = table.clone(e)
	return n
end

function BuildState:Effective()
	local items = {}
	for k, e in pairs(self.Server) do
		items[k] = copy(e)
	end
	local surfaces = {}
	for t, s in pairs(self.ServerSurfaces) do
		surfaces[t] = { Color = s.Color, Material = s.Material }
	end
	for _, op in ipairs(self.Ops) do
		if op.Type == "Place" then
			items[op.Key] = {
				Key = op.Key,
				ItemId = op.ItemId,
				Pos = op.Pos,
				Step = op.Step,
				Color = op.Color,
				Material = op.Material,
				Paid = 0,
				Free = false,
				Server = false,
			}
		elseif op.Type == "Move" then
			local e = items[op.Key]
			if e and not e.Removed then
				e.Pos = op.Pos
				e.Step = op.Step
				e.Moved = true
			end
		elseif op.Type == "Remove" then
			local e = items[op.Key]
			if e then
				if e.Server then
					e.Removed = true
				else
					items[op.Key] = nil
				end
			end
		elseif op.Type == "Paint" then
			local e = items[op.Key]
			local paint = Furniture.ById[op.PaintId]
			if e and not e.Removed and paint then
				e.Color = op.Color or paint.Color
				e.Material = paint.Material
				e.PaintId = op.PaintId
				e.PaintColor = op.Color
				e.Painted = true
			end
		elseif op.Type == "Wallpaper" then
			local paint = Furniture.ById[op.PaintId]
			if paint then
				surfaces[op.Target] = {
					Color = op.Color or paint.Color,
					Material = paint.Material,
					PaintId = op.PaintId,
					PaintColor = op.Color,
					Changed = true,
				}
			end
		end
	end
	return items, surfaces
end

local function cframeOf(e): CFrame
	return BuildMath.Compose(e.Pos, e.Step)
end

function BuildState:Compact(): { any }
	local items, surfaces = self:Effective()
	local removes, moves, paints, places, walls = {}, {}, {}, {}, {}
	for key, e in pairs(items) do
		if e.Server then
			if e.Removed then
				table.insert(removes, { Type = "Remove", Uid = key })
			else
				if e.Moved then
					table.insert(moves, { Type = "Move", Uid = key, CFrame = cframeOf(e) })
				end
				if e.Painted then
					local op = { Type = "Paint", Uid = key, PaintId = e.PaintId }
					if e.PaintColor then
						op.Color = Serializer.ColorToArray(e.PaintColor)
					end
					table.insert(paints, op)
				end
			end
		else
			local op = { Type = "Place", ItemId = e.ItemId, CFrame = cframeOf(e) }
			local def = Furniture.ById[e.ItemId]
			if def and def.Paintable then
				if e.Color then
					op.Color = Serializer.ColorToArray(e.Color)
				end
				if e.Material and Furniture.MaterialSet[e.Material] then
					op.Material = e.Material
				end
			end
			op._Order = tonumber(key:sub(2)) or 0
			table.insert(places, op)
		end
	end
	table.sort(places, function(a, b)
		return a._Order < b._Order
	end)
	for _, op in ipairs(places) do
		op._Order = nil
	end
	for target, s in pairs(surfaces) do
		if s.Changed then
			local op = { Type = "Wallpaper", Target = target, PaintId = s.PaintId }
			if s.PaintColor then
				op.Color = Serializer.ColorToArray(s.PaintColor)
			end
			table.insert(walls, op)
		end
	end
	local out = {}
	for _, list in ipairs({ removes, moves, paints, places, walls }) do
		for _, op in ipairs(list) do
			table.insert(out, op)
		end
	end
	return out
end

function BuildState:Count(): number
	local items = self:Effective()
	local n = 0
	for _, e in pairs(items) do
		if not e.Removed then
			n += 1
		end
	end
	return n
end

function BuildState:Estimate(isVip: boolean, vipFactor: number): (number, number)
	local items, surfaces = self:Effective()
	local cost, refund = 0, 0
	local function price(base: number, category: string?): number
		if isVip and category == "Furniture" then
			return math.floor(base * vipFactor + 0.5)
		end
		return base
	end
	for _, e in pairs(items) do
		if e.Server then
			if e.Removed then
				if not e.Free then
					refund += math.floor(e.Paid * (self.Ctx.SellBack or 0.7))
				end
			elseif e.Painted then
				local paint = Furniture.ById[e.PaintId]
				if paint then
					cost += price(paint.Price, "Furniture")
				end
			end
		else
			local def = Furniture.ById[e.ItemId]
			if def then
				cost += price(def.Price, "Furniture")
			end
		end
	end
	for _, s in pairs(surfaces) do
		if s.Changed then
			local paint = Furniture.ById[s.PaintId]
			if paint then
				cost += price(paint.Price, "Furniture")
			end
		end
	end
	return cost, refund
end

function BuildState:Push(op): (boolean, string?)
	if op.Type == "Place" then
		if self:Count() + 1 > self.MaxItems then
			return false, ("Item limit reached (%d)"):format(self.MaxItems)
		end
		self.Temp += 1
		op.Key = "p" .. self.Temp
	end
	table.insert(self.Ops, op)
	if #self:Compact() > MAX_OPS then
		table.remove(self.Ops)
		return false, ("Confirm your changes first (max %d per batch)"):format(MAX_OPS)
	end
	table.clear(self.RedoStack)
	self.Changed:Fire()
	return true, nil
end

-- Push several ops as one undo step (e.g. a wall run). All or nothing.
function BuildState:PushGroup(ops: { any }): (boolean, string?)
	local before = #self.Ops
	local tempBefore = self.Temp
	self.Groups += 1
	local groupId = self.Groups
	for _, op in ipairs(ops) do
		if op.Type == "Place" then
			if self:Count() + 1 > self.MaxItems then
				for i = #self.Ops, before + 1, -1 do
					table.remove(self.Ops, i)
				end
				self.Temp = tempBefore
				return false, ("Item limit reached (%d)"):format(self.MaxItems)
			end
			self.Temp += 1
			op.Key = "p" .. self.Temp
		end
		op.Group = groupId
		table.insert(self.Ops, op)
	end
	if #self:Compact() > MAX_OPS then
		for i = #self.Ops, before + 1, -1 do
			table.remove(self.Ops, i)
		end
		self.Temp = tempBefore
		return false, ("Confirm your changes first (max %d per batch)"):format(MAX_OPS)
	end
	table.clear(self.RedoStack)
	self.Changed:Fire()
	return true, nil
end

function BuildState:CanUndo(): boolean
	return #self.Ops > 0
end

function BuildState:CanRedo(): boolean
	return #self.RedoStack > 0
end

function BuildState:HasChanges(): boolean
	return #self.Ops > 0
end

function BuildState:Undo()
	local last = table.remove(self.Ops)
	if not last then
		return
	end
	local group = { last }
	if last.Group then
		while #self.Ops > 0 and self.Ops[#self.Ops].Group == last.Group do
			table.insert(group, 1, table.remove(self.Ops))
		end
	end
	table.insert(self.RedoStack, group)
	self.Changed:Fire()
end

function BuildState:Redo()
	local group = table.remove(self.RedoStack)
	if not group then
		return
	end
	for _, op in ipairs(group) do
		table.insert(self.Ops, op)
	end
	self.Changed:Fire()
end

function BuildState:Clear()
	table.clear(self.Ops)
	table.clear(self.RedoStack)
	self.Changed:Fire()
end

function BuildState:Get(key: string)
	local items = self:Effective()
	return items[key]
end

return BuildState
