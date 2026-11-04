-- Catalog: defensive access to Config/Cars and Config/Brands (owned by the vehicle engineer).
-- Both configs are required with pcall and may be missing; every accessor returns safe values.
--
--   Catalog.GetCar(modelId) -> def?            (nil for unknown / Hidden / job cars)
--   Catalog.List() -> { def }                  (all buyable cars, sorted by price)
--   Catalog.GetBrand(brandId) -> { Name, Code, Tagline, Badge }
--   Catalog.Brands() -> { [brandId]: brand }
--   Catalog.Price(def) -> number
--   Catalog.Summary(def) -> table sent to clients

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local DealerCfg = require(Shared.Config.Dealership)

local Catalog = {}

local carsCache: { [string]: any }? = nil
local brandsCache: { [string]: any }? = nil
local listCache: { any }? = nil

local function tryRequire(name: string): any
	local folder = Shared:FindFirstChild("Config")
	local module = folder and folder:FindFirstChild(name)
	if not module or not module:IsA("ModuleScript") then
		return nil
	end
	local ok, result = pcall(require, module)
	if ok and type(result) == "table" then
		return result
	end
	warn(("[Dealership] Config/%s failed to load: %s"):format(name, tostring(result)))
	return nil
end

local function isBuyable(id: string, def: any): boolean
	if type(def) ~= "table" or type(id) ~= "string" then
		return false
	end
	if def.Hidden == true then
		return false
	end
	if id:sub(1, 4) == "job_" then
		return false
	end
	return type(def.Price) == "number" and def.Price > 0
end

-- Collect car defs keyed by id. Supports Cars[id] = def, or Cars.List/Cars/All arrays.
local function loadCars(): { [string]: any }
	if carsCache then
		return carsCache
	end
	local out = {}
	local raw = tryRequire("Cars")
	if type(raw) == "table" then
		for k, v in pairs(raw) do
			if type(k) == "string" and type(v) == "table" and (v.Price ~= nil or v.Stats ~= nil) then
				local id = type(v.Id) == "string" and v.Id or k
				out[id] = v
			end
		end
		for _, key in ipairs({ "List", "Cars", "All" }) do
			local list = raw[key]
			if type(list) == "table" then
				for k, v in pairs(list) do
					if type(v) == "table" then
						local id = type(v.Id) == "string" and v.Id or (type(k) == "string" and k or nil)
						if id then
							out[id] = v
						end
					end
				end
			end
		end
	end
	carsCache = out
	return out
end

local function loadBrands(): { [string]: any }
	if brandsCache then
		return brandsCache
	end
	local out = {}
	local raw = tryRequire("Brands")
	if type(raw) == "table" then
		for k, v in pairs(raw) do
			if type(k) == "string" and type(v) == "table" and type(v.Name) == "string" then
				out[k] = v
			end
		end
		if type(raw.List) == "table" then
			for _, v in ipairs(raw.List) do
				if type(v) == "table" and type(v.Id) == "string" then
					out[v.Id] = v
				end
			end
		end
	end
	brandsCache = out
	return out
end

function Catalog.GetCar(modelId: any): { [string]: any }?
	if type(modelId) ~= "string" then
		return nil
	end
	local def = loadCars()[modelId]
	if not isBuyable(modelId, def) then
		return nil
	end
	return def
end

-- Raw definition even for hidden/job cars (used to read a car's price tier for tuning).
function Catalog.GetAnyCar(modelId: any): { [string]: any }?
	if type(modelId) ~= "string" then
		return nil
	end
	local def = loadCars()[modelId]
	if type(def) == "table" then
		return def
	end
	return nil
end

function Catalog.Price(def: { [string]: any }?): number
	if type(def) ~= "table" or type(def.Price) ~= "number" then
		return 0
	end
	return math.max(0, math.floor(def.Price))
end

function Catalog.List(): { { [string]: any } }
	if listCache then
		return listCache
	end
	local out = {}
	for id, def in pairs(loadCars()) do
		if isBuyable(id, def) then
			table.insert(out, { Id = id, Def = def })
		end
	end
	table.sort(out, function(a, b)
		local pa, pb = Catalog.Price(a.Def), Catalog.Price(b.Def)
		if pa == pb then
			return a.Id < b.Id
		end
		return pa < pb
	end)
	listCache = out
	return out
end

function Catalog.Brands(): { [string]: any }
	return loadBrands()
end

function Catalog.GetBrand(brandId: any): { [string]: any }
	local b = type(brandId) == "string" and loadBrands()[brandId] or nil
	if type(b) ~= "table" then
		return { Name = type(brandId) == "string" and brandId or "Skyline Motors", Code = "", Tagline = "", Badge = "🚗" }
	end
	return {
		Name = type(b.Name) == "string" and b.Name or brandId,
		Code = (type(b.Code) == "string" and b.Code) or (type(b.Short) == "string" and b.Short) or "",
		Tagline = type(b.Tagline) == "string" and b.Tagline or "",
		Badge = type(b.Badge) == "string" and b.Badge or "🚗",
		Color = b.Color,
	}
end

local function num(v: any, default: number): number
	if type(v) == "number" and v == v then
		return v
	end
	return default
end

-- Client-safe summary of a car (no functions, no instances).
function Catalog.Summary(id: string, def: { [string]: any }): { [string]: any }
	local stats = type(def.Stats) == "table" and def.Stats or {}
	local features = {}
	if type(def.Features) == "table" then
		for k, v in pairs(def.Features) do
			if type(k) == "string" and (type(v) == "boolean" or type(v) == "number" or type(v) == "string") then
				features[k] = v
			elseif type(k) == "number" and type(v) == "string" then
				features[v] = true
			end
		end
	end
	local brand = Catalog.GetBrand(def.Brand)
	local body = type(def.Body) == "table" and def.Body or {}
	local defaultColor = nil
	if type(body.DefaultColor) == "table" and type(body.DefaultColor[1]) == "number" then
		defaultColor = { body.DefaultColor[1], body.DefaultColor[2] or 0, body.DefaultColor[3] or 0 }
	elseif typeof(body.DefaultColor) == "Color3" then
		local c = body.DefaultColor
		defaultColor = { math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5) }
	end
	return {
		Id = id,
		Brand = type(def.Brand) == "string" and def.Brand or "",
		BrandName = brand.Name,
		BrandBadge = brand.Badge,
		Name = type(def.Name) == "string" and def.Name or id,
		Class = type(def.Class) == "string" and def.Class or "Sedan",
		BasePrice = Catalog.Price(def),
		VipOnly = def.VipOnly == true,
		Seats = math.floor(num(def.Seats, 4)),
		Electric = def.Electric == true,
		Description = type(def.Description) == "string" and def.Description or "",
		Features = features,
		DefaultColor = defaultColor,
		Stats = {
			Horsepower = math.floor(num(stats.Horsepower, 150)),
			TopSpeed = math.floor(num(stats.TopSpeed, 110)),
			Mass = math.floor(num(stats.Mass, 1400)),
			ZeroToSixty = DealerCfg.EstimateZeroToSixty(stats),
			Drivetrain = type(stats.Drivetrain) == "string" and stats.Drivetrain or nil,
		},
	}
end

return Catalog
