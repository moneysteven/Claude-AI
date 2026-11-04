-- BuildValidator (server helper): validates and prices a batch of build operations WITHOUT applying it.
-- BuildService uses the result to charge atomically and then apply exactly this plan.
--
--   BuildValidator.Evaluate(args) -> result
--     args = { Player, Ctx, State = { Entries, NextUid, Surfaces }, Ops, Economy, IsVip = fn(player) -> bool,
--              MaxItems, FloorHeight, RoofAllowance, SellBack }
--     result = { ok, err?, Index?, Cost, Refund, ValueDelta, Count, Entries, NextUid, Surfaces, Changes }
--
-- Operations (from the client; every field is validated):
--   { Type = "Place", ItemId, CFrame (relative to Origin), Color?, Material? }
--   { Type = "Move", Uid, CFrame }
--   { Type = "Remove", Uid }
--   { Type = "Paint", Uid, PaintId, Color? }            Color only for paints with CustomColor
--   { Type = "Wallpaper", Target = "Walls"|"Floor", PaintId, Color? }

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Furniture = require(Shared.Config.Furniture)
local EconomyConfig = require(Shared.Config.Economy)
local BuildMath = require(Shared.Build.BuildMath)
local Serializer = require(Shared.Build.Serializer)
local Guard = require(ServerScriptService.Server.Lib.Guard)

local BuildValidator = {}

local SURFACE_TARGETS = { Walls = true, Floor = true }
local OP_TYPES = { Place = true, Move = true, Remove = true, Paint = true, Wallpaper = true }

local function fail(index: number, err: string)
	return { ok = false, err = ("Change #%d: %s"):format(index, err), Index = index }
end

local function copyEntry(e)
	return {
		Uid = e.Uid,
		ItemId = e.ItemId,
		Position = e.Position,
		Step = e.Step,
		Color = e.Color,
		Material = e.Material,
		Paid = e.Paid,
		Free = e.Free,
	}
end

local function allowedIn(def, catalog: string): boolean
	return def.CatalogSet ~= nil and def.CatalogSet[catalog] == true
end

-- Returns true when `ops` is a plain array of tables with at most `max` entries.
function BuildValidator.IsOpArray(ops: any, max: number): boolean
	if type(ops) ~= "table" then
		return false
	end
	local n = #ops
	if n == 0 or n > max then
		return false
	end
	local count = 0
	for k, op in pairs(ops) do
		count += 1
		if type(k) ~= "number" or type(op) ~= "table" then
			return false
		end
	end
	return count == n
end

function BuildValidator.Evaluate(args)
	local player: Player = args.Player
	local ctx = args.Ctx
	local state = args.State
	local ops = args.Ops
	local economy = args.Economy
	local sellBack: number = args.SellBack
	local catalog: string = ctx.Catalog or "House"

	local maxTop, maxBottom = BuildMath.HeightLimits(ctx.Floors or 1, args.FloorHeight, args.RoofAllowance)
	local area: Vector3 = ctx.Size

	local entries = table.clone(state.Entries)
	local surfaces = table.clone(state.Surfaces or {})
	local nextUid: number = state.NextUid
	local count = 0
	for _ in pairs(entries) do
		count += 1
	end

	local cost, refund, valueDelta = 0, 0, 0
	local changes = {}
	local touched: { [string]: boolean } = {}
	local placedNow: { [string]: number } = {} -- uid -> price, items placed earlier in THIS batch
	local isVip: boolean? = nil

	local function vip(): boolean
		if isVip == nil then
			isVip = args.IsVip(player) == true
		end
		return isVip :: boolean
	end

	local function placement(def, cf: any, index: number): (Vector3?, number?, any?)
		local rel = Guard.CFrame(cf)
		if not rel then
			return nil, nil, fail(index, "Bad position")
		end
		local pos, step, err = BuildMath.Decompose(rel)
		if not pos or not step then
			return nil, nil, fail(index, err or "Bad rotation")
		end
		local ok, why = BuildMath.InBounds(def.Size, pos, step, area, maxTop, maxBottom)
		if not ok then
			return nil, nil, fail(index, (def.Name or def.Id) .. ": " .. (why or "out of bounds"))
		end
		return pos, step, nil
	end

	local function paintFor(op, index: number): (any?, Color3?, string?, any?)
		local paintId = Guard.Id(op.PaintId, 48)
		local paint = paintId and Furniture.ById[paintId]
		if not paint or not Furniture.IsPaint(paint) then
			return nil, nil, nil, fail(index, "Unknown paint")
		end
		if paint.VipOnly and not vip() then
			return nil, nil, nil, fail(index, paint.Name .. " is VIP only")
		end
		local color: Color3 = paint.Color
		if paint.CustomColor and op.Color ~= nil then
			local c = Guard.Color(op.Color)
			if not c then
				return nil, nil, nil, fail(index, "Bad colour")
			end
			color = Color3.fromRGB(c[1], c[2], c[3])
		end
		return paint, color, paint.Material, nil
	end

	for index, op in ipairs(ops) do
		local kind = op.Type
		if type(kind) ~= "string" or not OP_TYPES[kind] then
			return fail(index, "Unknown change")
		end

		if kind == "Place" then
			local itemId = Guard.Id(op.ItemId, 48)
			local def = itemId and Furniture.ById[itemId]
			if not def or Furniture.IsPaint(def) then
				return fail(index, "Unknown item")
			end
			if not allowedIn(def, catalog) then
				return fail(index, def.Name .. " can't be placed here")
			end
			if def.VipOnly and not vip() then
				return fail(index, def.Name .. " is VIP only")
			end
			if count + 1 > args.MaxItems then
				return fail(index, ("Item limit reached (%d)"):format(args.MaxItems))
			end
			local pos, step, err = placement(def, op.CFrame, index)
			if err then
				return err
			end
			local color: Color3? = nil
			local material: string? = nil
			if def.Paintable then
				if op.Color ~= nil then
					local c = Guard.Color(op.Color)
					if not c then
						return fail(index, "Bad colour")
					end
					color = Color3.fromRGB(c[1], c[2], c[3])
				end
				if op.Material ~= nil then
					if type(op.Material) ~= "string" or not Furniture.MaterialSet[op.Material] then
						return fail(index, "Bad material")
					end
					material = op.Material
				end
			end
			local price = economy:GetPrice(player, def.Price, "Furniture")
			local uid = tostring(nextUid)
			nextUid += 1
			entries[uid] = {
				Uid = uid,
				ItemId = def.Id,
				Position = pos,
				Step = step,
				Color = color,
				Material = material,
				Paid = price,
				Free = false,
			}
			count += 1
			cost += price
			valueDelta += math.floor(price * sellBack)
			placedNow[uid] = price
			touched[uid] = true
			table.insert(changes, { Kind = "Place", Uid = uid })
		elseif kind == "Move" then
			local uid = Guard.Id(op.Uid, 12)
			local e = uid and entries[uid]
			if not e then
				return fail(index, "That item no longer exists")
			end
			local def = Furniture.ById[e.ItemId]
			if not def then
				return fail(index, "Unknown item")
			end
			local pos, step, err = placement(def, op.CFrame, index)
			if err then
				return err
			end
			local n = copyEntry(e)
			n.Position = pos
			n.Step = step
			entries[uid] = n
			if not touched[uid] then
				touched[uid] = true
				table.insert(changes, { Kind = "Update", Uid = uid })
			end
		elseif kind == "Remove" then
			local uid = Guard.Id(op.Uid, 12)
			local e = uid and entries[uid]
			if not e then
				return fail(index, "That item no longer exists")
			end
			local wasPlacedNow = placedNow[uid]
			if wasPlacedNow then
				-- placed and removed in the same batch: simply never bought
				cost -= wasPlacedNow
				valueDelta -= math.floor(wasPlacedNow * sellBack)
				placedNow[uid] = nil
			elseif not e.Free then
				local back = math.floor(e.Paid * sellBack)
				refund += back
				valueDelta -= back
			end
			entries[uid] = nil
			count -= 1
			touched[uid] = true
			table.insert(changes, { Kind = "Remove", Uid = uid })
		elseif kind == "Paint" then
			local uid = Guard.Id(op.Uid, 12)
			local e = uid and entries[uid]
			if not e then
				return fail(index, "That item no longer exists")
			end
			local def = Furniture.ById[e.ItemId]
			if not def or not def.Paintable then
				return fail(index, "That item can't be painted")
			end
			local paint, color, material, err = paintFor(op, index)
			if err then
				return err
			end
			local n = copyEntry(e)
			n.Color = color
			n.Material = material
			entries[uid] = n
			cost += economy:GetPrice(player, paint.Price, "Furniture")
			if not touched[uid] then
				touched[uid] = true
				table.insert(changes, { Kind = "Update", Uid = uid })
			end
		elseif kind == "Wallpaper" then
			if not ctx.SurfaceRoot then
				return fail(index, "Nothing to wallpaper here")
			end
			local target = Guard.OneOf(op.Target, SURFACE_TARGETS)
			if not target then
				return fail(index, "Bad surface")
			end
			local paint, color, material, err = paintFor(op, index)
			if err then
				return err
			end
			surfaces[target] = { Color = color, Material = material }
			cost += economy:GetPrice(player, paint.Price, "Furniture")
			table.insert(changes, { Kind = "Surface", Target = target })
		end
	end

	cost = math.max(0, cost)
	if cost > EconomyConfig.MaxSingleTransaction then
		return { ok = false, err = "That's too much in one go — confirm in smaller batches" }
	end

	return {
		ok = true,
		Cost = cost,
		Refund = refund,
		ValueDelta = valueDelta,
		Count = count,
		Entries = entries,
		NextUid = nextUid,
		Surfaces = surfaces,
		Changes = changes,
	}
end

-- Validate a single saved entry for loading (catalog may have changed since it was saved).
function BuildValidator.CanLoad(ctx, entry, floorHeight: number, roofAllowance: number): boolean
	local def = Furniture.ById[entry.ItemId]
	if not def or Furniture.IsPaint(def) then
		return false
	end
	local maxTop, maxBottom = BuildMath.HeightLimits(ctx.Floors or 1, floorHeight, roofAllowance)
	return (BuildMath.InBounds(def.Size, entry.Position, entry.Step, ctx.Size, maxTop, maxBottom))
end

BuildValidator.Serializer = Serializer

return BuildValidator
