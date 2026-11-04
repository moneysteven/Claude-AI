-- CarBuilder: builds a complete car rig (ARCHITECTURE §9) for a Config/Cars model id.
--
--   CarBuilder.Build(modelId, look?, opts?) -> (Model?, layout?)
--       look = Shared/Vehicle/Looks.Resolve(...) (defaults if nil); opts = { Name = "v_7" }
--   CarBuilder.Layout(modelId) -> layout?            cached CarLayout for spawning / clearance checks
--   CarBuilder.Exists(modelId) -> boolean
--
-- If ServerStorage.Assets.Cars[modelId] exists it is cloned and validated (CarRig.PrepareAsset warns about
-- missing pieces); otherwise a procedural greybox car is generated from Body params. Procedural builds are
-- cached as templates per model id (cloning is much faster than building), then the look is applied.
-- The returned model sits at the origin (pivot = ground centre) with its Chassis anchored; PivotTo it into place.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Cars = require(Shared.Config.Cars)
local Looks = require(Shared.Vehicle.Looks)

local CarKit = require(script.Parent.CarKit)
local CarLayout = require(script.Parent.CarLayout)
local CarRig = require(script.Parent.CarRig)
local CarBody = require(script.Parent.CarBody)
local CarCabin = require(script.Parent.CarCabin)
local CarDetails = require(script.Parent.CarDetails)
local CarScooter = require(script.Parent.CarScooter)
local CarLooks = require(script.Parent.CarLooks)

local CarBuilder = {}

local templates: { [string]: Model } = {}
local layouts: { [string]: any } = {}

function CarBuilder.Exists(modelId: any): boolean
	return type(modelId) == "string" and type(Cars[modelId]) == "table"
end

function CarBuilder.Layout(modelId: string)
	local cached = layouts[modelId]
	if cached then
		return cached
	end
	local def = Cars[modelId]
	if not def then
		return nil
	end
	local B = CarLayout.Compute(def)
	if B.Scooter then
		CarScooter.Prepare(B)
	end
	-- tall rear bodies (box / ladder / dump / tow) need their real height for clearance checks
	if B.Rear == "Box" then
		B.TopY = B.Belt + B.RearHeight
	elseif B.Rear == "Ladder" then
		B.TopY = B.Belt + B.RearHeight * 0.55 + 1.2
	elseif B.Rear == "Dump" then
		B.TopY = math.max(B.Cl + 0.9, B.ArchTop + 0.1) + B.RearHeight + 0.8
	elseif B.Rear == "Tow" then
		B.TopY = B.Belt - 0.9 + 3.4
	end
	layouts[modelId] = B
	return B
end

local function assetFor(modelId: string): Model?
	local assets = ServerStorage:FindFirstChild("Assets")
	local folder = assets and assets:FindFirstChild("Cars")
	local m = folder and folder:FindFirstChild(modelId)
	if m and m:IsA("Model") then
		return m
	end
	return nil
end

local function buildProcedural(def: { [string]: any }, B): Model
	local model, chassis = CarRig.CreateModel(def.Id, B)
	local k = CarKit.new(model, chassis)
	local look = Looks.Default(def)
	local paint = Looks.Color(look.Paint.Color)
	if B.Scooter then
		CarScooter.Build(k, B, paint)
	else
		CarBody.Build(k, B, paint)
		CarCabin.Build(k, B, paint)
		CarDetails.Build(k, B, paint)
	end
	CarRig.Wheels(k, B)
	CarRig.Seats(k, B)
	CarRig.Finalize(model, chassis)
	return model
end

function CarBuilder.Build(modelId: string, look: { [string]: any }?, opts: { [string]: any }?): (Model?, any)
	local def = Cars[modelId]
	if type(def) ~= "table" then
		warn("[CarBuilder] unknown car model id: " .. tostring(modelId))
		return nil, nil
	end
	local B = CarBuilder.Layout(modelId)
	local model: Model
	local asset = assetFor(modelId)
	if asset then
		model = asset:Clone()
		model:PivotTo(CFrame.identity)
		model = CarRig.PrepareAsset(model, def, B)
		model:PivotTo(CFrame.identity)
	else
		local template = templates[modelId]
		if not template then
			local ok, built = pcall(buildProcedural, def, B)
			if not ok then
				warn(("[CarBuilder] failed to build %s: %s"):format(modelId, tostring(built)))
				return nil, nil
			end
			template = built
			templates[modelId] = template
		end
		model = template:Clone()
	end
	model.Name = (opts and opts.Name) or modelId
	model:SetAttribute("ModelId", modelId)
	model:SetAttribute("Brand", def.Brand or "")
	model:SetAttribute("Class", def.Class or "")
	model:SetAttribute("Electric", def.Electric == true)
	model:SetAttribute("HasSiren", def.Features and def.Features.Siren == true or false)
	model:SetAttribute("CarName", def.Name or modelId)
	CarLooks.Apply(model, look or Looks.Default(def), def, B)
	return model, B
end

return CarBuilder
