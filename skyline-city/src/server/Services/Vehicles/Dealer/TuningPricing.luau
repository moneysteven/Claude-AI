-- TuningPricing: validates a client's tuning "cart" and prices it from Config/Tuning (never from the client).
--
--   TuningPricing.Init(deps)                                   deps = { EconomyService, HasPass = fn(player, key) }
--   TuningPricing.PriceTable(player, def) -> table             per-option prices for the client UI
--   TuningPricing.Quote(player, uid, car, def, changes) -> (quote?, err?)
--     quote = { Lines = {{ Label, Price, Kind }}, Total, PerfSpend, CosmeticSpend, Writes = { {Path, Value} },
--               Upgrades = { [cat] = level }, Plate = string? (needs filtering) }

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Table = require(Shared.Util.Table)
local Tuning = require(Shared.Config.Tuning)

local Guard = require(ServerScriptService:WaitForChild("Server").Lib.Guard)
local Catalog = require(script.Parent.Catalog)
local Common = require(script.Parent.Common)

local TuningPricing = {}

local Economy

function TuningPricing.Init(deps)
	Economy = deps.EconomyService
end

local function tierMult(def: { [string]: any }?): number
	return Tuning.TierMult(Catalog.Price(def))
end

-- base price → final price for this player and car
local function price(player: Player, base: number, mult: number): number
	if base <= 0 then
		return 0
	end
	return Economy:GetPrice(player, math.floor(base * mult + 0.5), Tuning.PriceCategory)
end

local function sameColor(a: any, b: any): boolean
	if type(a) ~= "table" or type(b) ~= "table" then
		return false
	end
	return a[1] == b[1] and a[2] == b[2] and a[3] == b[3]
end

function TuningPricing.PriceTable(player: Player, def: { [string]: any }?)
	local m = tierMult(def)
	local out = {
		TierMult = m,
		Paint = price(player, Tuning.PaintPrice, m),
		Finish = {},
		Exclusive = {},
		Rims = {},
		RimColor = price(player, Tuning.RimColorPrice, m),
		Tint = {},
		BodyKits = {},
		BodyKitAllowed = {},
		Spoilers = {},
		Underglow = price(player, Tuning.UnderglowPrice, m),
		Plate = price(player, Tuning.PlatePrice, 1), -- plates cost the same on every car
		Upgrades = {},
	}
	for id, row in pairs(Tuning.Finishes) do
		out.Finish[id] = price(player, row.Price, m)
	end
	for _, row in ipairs(Tuning.ExclusivePaints) do
		out.Exclusive[row.Id] = price(player, row.Price, m)
	end
	for _, row in ipairs(Tuning.Rims) do
		out.Rims[row.Id] = price(player, row.Price, m)
	end
	for i, row in ipairs(Tuning.Tint) do
		out.Tint[i] = price(player, row.Price, m)
	end
	local class = def and def.Class or nil
	for _, row in ipairs(Tuning.BodyKits) do
		out.BodyKits[row.Id] = price(player, row.Price, m)
		out.BodyKitAllowed[row.Id] = Tuning.KitFits(row, class)
	end
	for _, row in ipairs(Tuning.Spoilers) do
		out.Spoilers[row.Id] = price(player, row.Price, m)
	end
	for _, cat in ipairs(Tuning.UpgradeOrder) do
		local list = {}
		for lvl = 1, Tuning.MaxUpgradeLevel do
			local row = Tuning.Upgrades[cat] and Tuning.Upgrades[cat][lvl]
			list[lvl] = row and price(player, row.Price or 0, m) or 0
		end
		out.Upgrades[cat] = list
	end
	return out
end

function TuningPricing.Quote(player: Player, uid: string, car: { [string]: any }, def: { [string]: any }?, changes: any)
	if type(changes) ~= "table" then
		return nil, "Nothing to apply."
	end
	local m = tierMult(def)
	local lines = {}
	local writes = {}
	local perf, cosmetic = 0, 0
	local base = "Vehicles." .. uid
	local quote = { Lines = lines, Writes = writes, Upgrades = {}, Plate = nil }

	local function add(label: string, amount: number, kind: string)
		table.insert(lines, { Label = label, Price = amount, Kind = kind })
		if kind == "Performance" then
			perf += amount
		else
			cosmetic += amount
		end
	end

	-- Paint -------------------------------------------------------------------
	if changes.Paint ~= nil then
		local p = changes.Paint
		if type(p) ~= "table" then
			return nil, "Invalid paint."
		end
		local cur = type(car.Paint) == "table" and car.Paint or {}
		if p.Exclusive ~= nil then
			local id = Guard.Id(p.Exclusive, 32)
			local row = id and Tuning.ExclusiveById[id]
			if not row then
				return nil, "Unknown paint."
			end
			if row.Pass and not Common.HasPass(player, row.Pass) then
				return nil, row.Pass == "VIP" and "👑 That paint is VIP only." or "💎 That paint needs the Premium Car Park pass."
			end
			if cur.Exclusive ~= row.Id then
				add("Paint: " .. row.Name, price(player, row.Price, m), "Cosmetic")
				table.insert(writes, {
					Path = base .. ".Paint",
					Value = { Color = table.clone(row.Color), Finish = row.Finish, Name = row.Name, Exclusive = row.Id },
				})
			end
		else
			local color = Guard.Color(p.Color)
			if not color then
				return nil, "Invalid colour."
			end
			local finish = Guard.OneOf(p.Finish, Tuning.Finishes)
			if not finish then
				return nil, "Invalid finish."
			end
			local finishRow = Tuning.Finishes[finish]
			if finishRow.Pass and not Common.HasPass(player, finishRow.Pass) then
				return nil, "That finish needs a pass."
			end
			local colorChanged = not sameColor(color, cur.Color) or cur.Exclusive ~= nil
			local finishChanged = cur.Finish ~= finish or cur.Exclusive ~= nil
			if colorChanged or finishChanged then
				local cost = price(player, Tuning.PaintPrice, m)
				if finishChanged then
					cost += price(player, finishRow.Price, m)
				end
				add(("Paint (%s)"):format(finishRow.Name), cost, "Cosmetic")
				table.insert(writes, { Path = base .. ".Paint", Value = { Color = color, Finish = finish } })
			end
		end
	end

	-- Rims ----------------------------------------------------------------------
	if changes.Rims ~= nil then
		local id = Guard.Id(changes.Rims, 32)
		local row = id and Tuning.RimsById[id]
		if not row then
			return nil, "Unknown rims."
		end
		if (car.Rims or "Stock") ~= row.Id then
			add("Rims: " .. row.Name, price(player, row.Price, m), "Cosmetic")
			table.insert(writes, { Path = base .. ".Rims", Value = row.Id })
		end
	end
	if changes.RimColor ~= nil then
		local color = Guard.Color(changes.RimColor)
		if not color then
			return nil, "Invalid rim colour."
		end
		if not sameColor(color, car.RimColor or Tuning.DefaultRimColor) then
			add("Rim colour", price(player, Tuning.RimColorPrice, m), "Cosmetic")
			table.insert(writes, { Path = base .. ".RimColor", Value = color })
		end
	end

	-- Tint ----------------------------------------------------------------------
	if changes.Tint ~= nil then
		local row = Tuning.TintRow(Guard.Number(changes.Tint, 0, 0.9))
		if not row then
			return nil, "Invalid tint."
		end
		local curTint = type(car.Tint) == "number" and car.Tint or 0
		if math.abs(curTint - row.Level) > 0.001 then
			add("Tint: " .. row.Name, price(player, row.Price, m), "Cosmetic")
			table.insert(writes, { Path = base .. ".Tint", Value = row.Level })
		end
	end

	-- Body kit / spoiler ----------------------------------------------------------
	if changes.BodyKit ~= nil then
		local id = Guard.Id(changes.BodyKit, 32)
		local row = id and Tuning.BodyKitsById[id]
		if not row then
			return nil, "Unknown body kit."
		end
		if not Tuning.KitFits(row, def and def.Class) then
			return nil, ("The %s kit doesn't fit this car."):format(row.Name)
		end
		if (car.BodyKit or "Stock") ~= row.Id then
			add("Body kit: " .. row.Name, price(player, row.Price, m), "Cosmetic")
			table.insert(writes, { Path = base .. ".BodyKit", Value = row.Id })
		end
	end
	if changes.Spoiler ~= nil then
		local id = Guard.Id(changes.Spoiler, 32)
		local row = id and Tuning.SpoilersById[id]
		if not row then
			return nil, "Unknown spoiler."
		end
		if (car.Spoiler or "None") ~= row.Id then
			add("Spoiler: " .. row.Name, price(player, row.Price, m), "Cosmetic")
			table.insert(writes, { Path = base .. ".Spoiler", Value = row.Id })
		end
	end

	-- Underglow -------------------------------------------------------------------
	if changes.Underglow ~= nil then
		if changes.Underglow == false then
			if car.Underglow then
				add("Remove underglow", 0, "Cosmetic")
				table.insert(writes, { Path = base .. ".Underglow", Value = false })
			end
		else
			local color = Guard.Color(changes.Underglow)
			if not color then
				return nil, "Invalid underglow colour."
			end
			if not sameColor(color, car.Underglow) then
				add("Underglow", price(player, Tuning.UnderglowPrice, m), "Cosmetic")
				table.insert(writes, { Path = base .. ".Underglow", Value = color })
			end
		end
	end

	-- Plate (filtered later by the service because filtering yields) ------------------
	if changes.Plate ~= nil then
		local plate = Common.CleanPlate(changes.Plate, Tuning.PlateMaxLength)
		if not plate then
			return nil, ("Plates are 1-%d letters, numbers or spaces."):format(Tuning.PlateMaxLength)
		end
		if plate ~= car.Plate then
			add("Plate: " .. plate, price(player, Tuning.PlatePrice, 1), "Cosmetic")
			quote.Plate = plate
			table.insert(writes, { Path = base .. ".Plate", Value = plate })
		end
	end

	-- Performance upgrades (sequential: every level between current and target is charged) ----
	if changes.Upgrades ~= nil then
		if type(changes.Upgrades) ~= "table" then
			return nil, "Invalid upgrades."
		end
		local cur = type(car.Upgrades) == "table" and car.Upgrades or {}
		for cat, target in pairs(changes.Upgrades) do
			if type(cat) ~= "string" or not Tuning.Upgrades[cat] then
				return nil, "Unknown upgrade."
			end
			local lvl = Guard.Int(target, 0, Tuning.MaxUpgradeLevel)
			if not lvl then
				return nil, "Invalid upgrade level."
			end
			local have = math.clamp(math.floor(tonumber(cur[cat]) or 0), 0, Tuning.MaxUpgradeLevel)
			if lvl < have then
				return nil, "Upgrades can't be downgraded."
			end
			if lvl > have then
				local cost = 0
				for l = have + 1, lvl do
					local row = Tuning.Upgrades[cat][l]
					cost += row and price(player, row.Price or 0, m) or 0
				end
				local info = Tuning.UpgradeInfo[cat]
				add(("%s Stage %d"):format(info and info.Name or cat, lvl), cost, "Performance")
				quote.Upgrades[cat] = lvl
				table.insert(writes, { Path = base .. ".Upgrades." .. cat, Value = lvl })
			end
		end
	end

	if #writes == 0 then
		return nil, "No changes to apply."
	end
	quote.PerfSpend = perf
	quote.CosmeticSpend = cosmetic
	quote.Total = perf + cosmetic
	return quote, nil
end

-- deep copy helper exported for the service (writes must not share tables with config)
function TuningPricing.CopyValue(v: any): any
	return Table.DeepCopy(v)
end

return TuningPricing
