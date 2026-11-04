-- FurnitureFactory (server helper): creates the real, replicated model for a placed item.
--   * Uses ServerStorage.Assets.Furniture.<ItemId> when the developer has added a real model
--     (pivot at the bottom centre, front facing -Z, paintable parts with attribute Paint = true).
--   * Otherwise builds the procedural greybox from Config.Furniture (Shared/Build/FurnitureBuilder).
--   * Tags seats (RPSeat + Pose) and stamps the attributes other systems read (ItemId, Function, Catalog).

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local FurnitureBuilder = require(Shared.Build.FurnitureBuilder)

local FurnitureFactory = {}

local function assetFor(itemId: string): Model?
	local assets = ServerStorage:FindFirstChild("Assets")
	local folder = assets and assets:FindFirstChild("Furniture")
	local template = folder and folder:FindFirstChild(itemId)
	if template and template:IsA("Model") then
		return template
	end
	return nil
end

function FurnitureFactory.HasAsset(itemId: string): boolean
	return assetFor(itemId) ~= nil
end

function FurnitureFactory.Create(def, opts: { [string]: any }?): Model
	local o = opts or {}
	local model: Model
	local template = assetFor(def.Id)
	if template then
		model = template:Clone()
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") then
				d.Anchored = true
			end
		end
		if o.Color or o.Material then
			FurnitureBuilder.Paint(model, o.Color, o.Material)
		end
	else
		model = FurnitureBuilder.Build(def, { Color = o.Color, Material = o.Material })
	end

	model:SetAttribute("ItemId", def.Id)
	model:SetAttribute("Function", def.Function or "Decoration")
	model:SetAttribute("Category", def.Category)
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic

	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("Seat") then
			local pose = d:GetAttribute("SeatPose") or d:GetAttribute("Pose") or (def.Function == "Bed" and "Sleep" or "Sit")
			d:SetAttribute("Pose", pose)
			CollectionService:AddTag(d, World.Tags.Seat)
		end
	end
	return model
end

return FurnitureFactory
