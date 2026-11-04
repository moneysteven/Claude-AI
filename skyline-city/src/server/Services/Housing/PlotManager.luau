-- PlotManager (server helper): tracks HousePlot / ApartmentUnit tagged parts and hands them out.
--
--   PlotManager.Init()
--   PlotManager.Acquire(player, tierDef) -> plot      a free plot of the tier, else the smallest bigger one that fits,
--                                                    else a procedural fallback plot created far from the city
--   PlotManager.Release(plot)
--   PlotManager.Origin(plot) -> CFrame              top-centre of the plot, yaw-only
--   PlotManager.FromPart(part) -> plot?
--   PlotManager.OnRemoved : (plot) -> ()            set by HousingService; called when an occupied plot disappears
--
-- plot = { Part, Id, Tier, Kind ("House"|"Apartment"), Footprint (Vector3 X,0,Z), Occupant, Fallback, Elevated,
--          LobbyCFrame? (sky fallback: ground elevator pad) }

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local HousingConfig = require(Shared.Config.Housing)

local PlotManager = {}
PlotManager.OnRemoved = nil :: ((any) -> ())?

local plots: { [BasePart]: any } = {}
local fallbackFolder: Folder? = nil
local counters = { House = 0, Apartment = 0, Sky = 0 }

local TIER_RANK: { [string]: number } = {}
for i, id in ipairs(HousingConfig.TierOrder) do
	TIER_RANK[id] = i
end

local function kindForTier(tier): string
	return tier.Catalog == "Apartment" and "Apartment" or "House"
end

local function footprintOf(part: BasePart): Vector3
	local attr = part:GetAttribute("Size")
	if typeof(attr) == "Vector3" and attr.X > 0 and attr.Z > 0 then
		return Vector3.new(attr.X, 0, attr.Z)
	end
	return Vector3.new(part.Size.X, 0, part.Size.Z)
end

local function add(inst: Instance, kind: string)
	if not inst:IsA("BasePart") or plots[inst] then
		return
	end
	local part = inst :: BasePart
	local id = part:GetAttribute("PlotId")
	plots[part] = {
		Part = part,
		Id = type(id) == "string" and id or part:GetFullName(),
		Tier = part:GetAttribute("Tier"),
		Kind = kind,
		Footprint = footprintOf(part),
		Occupant = nil,
		Fallback = part:GetAttribute("Fallback") == true,
		Elevated = part:GetAttribute("Elevated") == true,
		LobbyCFrame = part:GetAttribute("LobbyCFrame"),
	}
end

local function remove(inst: Instance)
	local plot = plots[inst :: any]
	if not plot then
		return
	end
	plots[inst :: any] = nil
	if plot.Occupant and PlotManager.OnRemoved then
		task.spawn(PlotManager.OnRemoved, plot)
	end
end

function PlotManager.Init()
	local tags = { [World.Tags.HousePlot] = "House", [World.Tags.ApartmentUnit] = "Apartment" }
	for tag, kind in pairs(tags) do
		for _, inst in ipairs(CollectionService:GetTagged(tag)) do
			add(inst, kind)
		end
		CollectionService:GetInstanceAddedSignal(tag):Connect(function(inst)
			add(inst, kind)
		end)
		CollectionService:GetInstanceRemovedSignal(tag):Connect(remove)
	end
end

function PlotManager.FromPart(part: BasePart)
	return plots[part]
end

function PlotManager.Origin(plot): CFrame
	local part: BasePart = plot.Part
	local top = (part.CFrame * CFrame.new(0, part.Size.Y / 2, 0)).Position
	local look = part.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 0.05 then
		flat = Vector3.new(0, 0, -1)
	end
	return CFrame.lookAt(top, top + flat.Unit)
end

local function fits(plot, need: Vector3): boolean
	return plot.Footprint.X >= need.X - 0.5 and plot.Footprint.Z >= need.Z - 0.5
end

local function maxWidthForKind(kind: string): number
	local w = 0
	for _, tier in pairs(HousingConfig.Tiers) do
		if kindForTier(tier) == kind then
			w = math.max(w, tier.PlotSize.X)
		end
	end
	return w
end

local function ensureFallbackFolder(): Folder
	if fallbackFolder and fallbackFolder.Parent then
		return fallbackFolder
	end
	local f = Instance.new("Folder")
	f.Name = "FallbackPlots"
	f.Parent = Workspace
	fallbackFolder = f
	return f
end

local function newPart(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do
		(p :: any)[k] = v
	end
	return p
end

-- Creates a new procedural plot sized for `tier` in the fallback rows.
local function createFallback(tier)
	local FB = HousingConfig.Fallback
	local kind = kindForTier(tier)
	local sky = tier.PrivateElevator == true
	local row = sky and "Sky" or kind
	local origin: Vector3 = sky and FB.SkyRowOrigin or (kind == "House" and FB.HouseRowOrigin or FB.ApartmentRowOrigin)
	local n = counters[row]
	counters[row] += 1
	local slotW = maxWidthForKind(kind) + FB.Gap
	local col = n % FB.MaxPerRow
	local rowIndex = n // FB.MaxPerRow
	local rowDir = kind == "House" and -1 or 1
	local need = Vector3.new(tier.PlotSize.X, 0, tier.PlotSize.Y)
	local ground = origin + Vector3.new(col * slotW + slotW / 2, 0, rowIndex * FB.RowSpacing * rowDir)
	local height = sky and FB.SkyHeight or (kind == "Apartment" and FB.ApartmentHeight or 0)
	local topY = FB.GroundY + height

	local folder = ensureFallbackFolder()
	local plotId = ("fb_%s_%d"):format(row, n + 1)
	local model = Instance.new("Model")
	model.Name = plotId
	model.ModelStreamingMode = Enum.ModelStreamingMode.Atomic

	local pad = newPart({
		Name = "Plot",
		Size = Vector3.new(need.X, 1, need.Z),
		CFrame = CFrame.new(ground.X, topY - 0.5, ground.Z),
		Material = kind == "House" and Enum.Material.Grass or Enum.Material.Concrete,
		Color = kind == "House" and Color3.fromRGB(96, 158, 82) or Color3.fromRGB(150, 152, 158),
	})
	pad:SetAttribute("PlotId", plotId)
	pad:SetAttribute("Tier", tier.Id)
	pad:SetAttribute("Size", Vector3.new(need.X, 1, need.Z))
	pad:SetAttribute("Fallback", true)
	pad.Parent = model

	-- sidewalk + road in front (+Z) so the street feels like a street
	local walk = newPart({
		Name = "Sidewalk",
		Size = Vector3.new(slotW, 0.4, 6),
		CFrame = CFrame.new(ground.X, FB.GroundY + 0.2, ground.Z + need.Z / 2 + 3),
		Material = Enum.Material.Concrete,
		Color = Color3.fromRGB(190, 190, 186),
	})
	walk.Parent = model
	local road = newPart({
		Name = "Road",
		Size = Vector3.new(slotW, 0.3, 20),
		CFrame = CFrame.new(ground.X, FB.GroundY + 0.15, ground.Z + need.Z / 2 + 16),
		Material = Enum.Material.Asphalt,
		Color = Color3.fromRGB(46, 48, 52),
	})
	road.Parent = model

	if height > 0 then
		pad:SetAttribute("Elevated", true)
		-- tower core under elevated units (keeps the "skyscraper" look)
		local core = newPart({
			Name = "TowerCore",
			Size = Vector3.new(math.min(need.X, 24), height - 1, math.min(need.Z, 24)),
			CFrame = CFrame.new(ground.X, FB.GroundY + (height - 1) / 2, ground.Z),
			Material = Enum.Material.Glass,
			Color = Color3.fromRGB(70, 96, 130),
			Transparency = 0.15,
			CastShadow = false,
		})
		core.Parent = model
		local base = newPart({
			Name = "UnderSlab",
			Size = Vector3.new(need.X + 2, 3, need.Z + 2),
			CFrame = CFrame.new(ground.X, topY - 2.5, ground.Z),
			Material = Enum.Material.Concrete,
			Color = Color3.fromRGB(80, 82, 90),
		})
		base.Parent = model
		-- front terrace so the entrance door of an elevated unit never opens onto a sheer drop
		local terraceDepth = 8
		local terrace = newPart({
			Name = "Terrace",
			Size = Vector3.new(need.X + 2, 1, terraceDepth),
			CFrame = CFrame.new(ground.X, topY - 0.5, ground.Z + need.Z / 2 + 0.6 + terraceDepth / 2),
			Material = Enum.Material.Concrete,
			Color = Color3.fromRGB(196, 198, 204),
		})
		terrace.Parent = model
		local railFront = newPart({
			Name = "TerraceRailing",
			Size = Vector3.new(need.X + 2, 4, 0.3),
			CFrame = CFrame.new(ground.X, topY + 2, ground.Z + need.Z / 2 + 0.6 + terraceDepth - 0.15),
			Material = Enum.Material.Glass,
			Color = Color3.fromRGB(170, 210, 235),
			Transparency = 0.5,
			CastShadow = false,
		})
		railFront.Parent = model
		for _, side in ipairs({ -1, 1 }) do
			local rail = newPart({
				Name = "TerraceRailing",
				Size = Vector3.new(0.3, 4, terraceDepth),
				CFrame = CFrame.new(ground.X + side * (need.X / 2 + 0.85), topY + 2, ground.Z + need.Z / 2 + 0.6 + terraceDepth / 2),
				Material = Enum.Material.Glass,
				Color = Color3.fromRGB(170, 210, 235),
				Transparency = 0.5,
				CastShadow = false,
			})
			rail.Parent = model
		end
		local lobby = CFrame.new(ground.X, FB.GroundY, ground.Z + need.Z / 2 + 2)
		pad:SetAttribute("LobbyCFrame", lobby)
	end

	model.Parent = folder
	CollectionService:AddTag(pad, kind == "House" and World.Tags.HousePlot or World.Tags.ApartmentUnit)
	add(pad, kind) -- in case the tag signal is deferred
	return plots[pad]
end

function PlotManager.Acquire(player: Player, tier)
	local kind = kindForTier(tier)
	local need = Vector3.new(tier.PlotSize.X, 0, tier.PlotSize.Y)
	local wantRank = TIER_RANK[tier.Id] or 1
	local best, bestScore = nil, math.huge
	for _, plot in pairs(plots) do
		if not plot.Occupant and plot.Kind == kind and plot.Part.Parent and fits(plot, need) then
			-- sky apartments need an elevated plot and elevated plots are only for sky apartments
			local skyOk = (tier.PrivateElevator == true) == (plot.Elevated == true) or not plot.Fallback
			if skyOk then
				local score
				if plot.Tier == tier.Id then
					score = 0
				else
					local r = TIER_RANK[plot.Tier or ""] or 50
					score = 10 + math.abs(r - wantRank)
				end
				if plot.Fallback then
					score += 1000
				end
				score += (plot.Footprint.X * plot.Footprint.Z) / 1e5
				if score < bestScore then
					best, bestScore = plot, score
				end
			end
		end
	end
	if not best then
		best = createFallback(tier)
	end
	best.Occupant = player
	return best
end

function PlotManager.Release(plot)
	if not plot then
		return
	end
	plot.Occupant = nil
	local part = plot.Part
	if part and part.Parent then
		part:SetAttribute("OwnerUserId", nil)
		part:SetAttribute("OwnerName", nil)
		part:SetAttribute("HouseName", nil)
		part:SetAttribute("Occupied", false)
		part:SetAttribute("Locked", nil)
		part:SetAttribute("ContextId", nil)
	end
end

return PlotManager
