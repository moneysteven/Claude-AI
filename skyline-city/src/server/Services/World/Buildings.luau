-- Buildings (World helper): procedural greybox architecture. Union-free, anchored, cheap part counts.
-- Window grids are made from glass bodies + concrete floor bands + neon accent strips (no textures needed).
-- Every function first tries ServerStorage.Assets.Buildings.<AssetId> and clones it instead when present.
--
--   Buildings.Tower(parent, opts) -> Model
--       opts = { Name, AssetId?, Position (ground centre), Size (Vector3), Facing (Vector3 front), Color, Glass, Accent?,
--                Lobby? (enterable glass lobby), Crown? ("Flat"|"Spire"|"Stepped"|"Antenna"), FloorHeight? }
--   Buildings.Hollow(parent, opts) -> { Model, CFrame, Inside (CFrame), Outside (CFrame), FloorY }
--       walk-in building: floor, walls, door gap on the front, roof, sign, interior light
--       opts = { Name, AssetId?, Position, Size, Facing, Color, Trim?, GlassFront?, DoorWidth?, DoorHeight?, Sign?, SignColor?, Floor? }
--   Buildings.Box(parent, opts) -> Model      solid decorative building with windows, door and sign
--   Buildings.Apartment(parent, opts, gameplay) -> Model   (ESSENTIAL: units + elevators)
--       opts = { Name, Prefix, Position, Facing, Levels = {{Tier, Count, Height}}, LobbyHeight?, PodiumHeight?, Color, Glass, Accent }

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Housing = require(Shared.Config.Housing)
local Layout = require(Shared.Config.CityLayout)

local Props = require(script.Parent.Props)

local Buildings = {}

local GROUND = Layout.Heights.Ground
local CONCRETE = Color3.fromRGB(200, 198, 192)
local DARK = Color3.fromRGB(40, 42, 50)

local function baseCF(pos: Vector3, facing: Vector3?): CFrame
	return Props.Facing(Vector3.new(pos.X, 0, pos.Z), facing or Vector3.new(0, 0, -1))
end

local function newModel(parent: Instance, name: string): Model
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = parent
	return m
end

---------------------------------------------------------------------------
-- Crowns / roofs
---------------------------------------------------------------------------
local function crown(m: Model, cf: CFrame, w: number, d: number, style: string, color: Color3, accent: Color3)
	if style == "Spire" then
		Props.Part(m, "Crown1", Vector3.new(w * 0.7, 10, d * 0.7), cf * CFrame.new(0, 5, 0), color, Enum.Material.Glass, { Reflectance = 0.1 })
		Props.Part(m, "Crown2", Vector3.new(w * 0.4, 12, d * 0.4), cf * CFrame.new(0, 16, 0), color, Enum.Material.Glass, { Reflectance = 0.1 })
		Props.Small(m, "CrownRing", Vector3.new(w * 0.42, 0.8, d * 0.42), cf * CFrame.new(0, 22.4, 0), accent, Enum.Material.Neon)
		Props.Small(m, "Needle", Vector3.new(1, 36, 1), cf * CFrame.new(0, 40, 0), Color3.fromRGB(220, 220, 228), Enum.Material.Metal)
		local tip = Props.Small(m, "Beacon", Vector3.new(1.6, 1.6, 1.6), cf * CFrame.new(0, 58.8, 0), Color3.fromRGB(255, 40, 40), Enum.Material.Neon)
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(255, 60, 60)
		light.Range = 30
		light.Brightness = 3
		light.Parent = tip
	elseif style == "Stepped" then
		Props.Part(m, "Step1", Vector3.new(w * 0.75, 12, d * 0.75), cf * CFrame.new(0, 6, 0), color, Enum.Material.Concrete)
		Props.Part(m, "Step2", Vector3.new(w * 0.5, 10, d * 0.5), cf * CFrame.new(0, 17, 0), color, Enum.Material.Concrete)
		Props.Small(m, "StepGlow", Vector3.new(w * 0.52, 0.6, d * 0.52), cf * CFrame.new(0, 22.3, 0), accent, Enum.Material.Neon)
	elseif style == "Antenna" then
		Props.Part(m, "RoofBox", Vector3.new(w * 0.4, 8, d * 0.35), cf * CFrame.new(w * 0.15, 4, 0), DARK, Enum.Material.Metal)
		Props.Small(m, "Antenna", Vector3.new(0.6, 26, 0.6), cf * CFrame.new(-w * 0.2, 13, d * 0.15), Color3.fromRGB(180, 180, 186), Enum.Material.Metal)
		local tip = Props.Small(m, "AntennaTip", Vector3.new(1, 1, 1), cf * CFrame.new(-w * 0.2, 26.5, d * 0.15), Color3.fromRGB(255, 40, 40), Enum.Material.Neon)
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(255, 60, 60)
		light.Range = 20
		light.Parent = tip
	elseif style == "Flat" then
		Props.Part(m, "RoofUnit", Vector3.new(w * 0.3, 5, d * 0.3), cf * CFrame.new(-w * 0.2, 2.5, -d * 0.15), Color3.fromRGB(150, 152, 160), Enum.Material.Metal)
		Props.Part(m, "RoofUnit2", Vector3.new(w * 0.2, 4, d * 0.2), cf * CFrame.new(w * 0.25, 2, d * 0.2), Color3.fromRGB(150, 152, 160), Enum.Material.Metal)
	end
end

---------------------------------------------------------------------------
-- Glass tower
---------------------------------------------------------------------------
local function lobbyShell(m: Model, cf: CFrame, w: number, d: number, h: number, frame: Color3)
	-- floor
	Props.Part(m, "LobbyFloor", Vector3.new(w, GROUND, d), cf * CFrame.new(0, GROUND / 2, 0), Color3.fromRGB(226, 224, 220), Enum.Material.Marble)
	-- corner + mid columns
	for _, x in ipairs({ -1, 1 }) do
		for _, z in ipairs({ -1, 1 }) do
			Props.Part(m, "Column", Vector3.new(2, h, 2), cf * CFrame.new(x * (w / 2 - 1), h / 2, z * (d / 2 - 1)), frame, Enum.Material.Concrete)
		end
	end
	local glass = { Transparency = 0.55, CastShadow = false }
	local gc = Color3.fromRGB(170, 205, 230)
	local door = 12
	local side = (w - door) / 2
	-- front (local -Z) with a door gap
	Props.Part(m, "LobbyGlassFL", Vector3.new(side - 2, h - 1, 0.4), cf * CFrame.new(-(door / 2 + side / 2), h / 2, -d / 2 + 0.5), gc, Enum.Material.Glass, glass)
	Props.Part(m, "LobbyGlassFR", Vector3.new(side - 2, h - 1, 0.4), cf * CFrame.new(door / 2 + side / 2, h / 2, -d / 2 + 0.5), gc, Enum.Material.Glass, glass)
	Props.Part(m, "LobbyLintel", Vector3.new(door, 3, 0.6), cf * CFrame.new(0, h - 1.5, -d / 2 + 0.5), frame, Enum.Material.Concrete)
	Props.Part(m, "LobbyGlassB", Vector3.new(w - 2, h - 1, 0.4), cf * CFrame.new(0, h / 2, d / 2 - 0.5), gc, Enum.Material.Glass, glass)
	Props.Part(m, "LobbyGlassL", Vector3.new(0.4, h - 1, d - 2), cf * CFrame.new(-w / 2 + 0.5, h / 2, 0), gc, Enum.Material.Glass, glass)
	Props.Part(m, "LobbyGlassR", Vector3.new(0.4, h - 1, d - 2), cf * CFrame.new(w / 2 - 0.5, h / 2, 0), gc, Enum.Material.Glass, glass)
	Props.Part(m, "LobbyCeiling", Vector3.new(w, 1, d), cf * CFrame.new(0, h + 0.5, 0), CONCRETE, Enum.Material.Concrete)
	local light = Instance.new("PointLight")
	light.Range = math.min(60, math.max(w, d))
	light.Brightness = 1.2
	light.Color = Color3.fromRGB(255, 236, 210)
	light.Parent = Props.Small(m, "LobbyLight", Vector3.new(4, 0.3, 4), cf * CFrame.new(0, h - 0.2, 0), Color3.fromRGB(255, 244, 220), Enum.Material.Neon, { CanCollide = false })
	-- reception
	Props.Part(m, "Reception", Vector3.new(10, 3.6, 2.4), cf * CFrame.new(0, GROUND + 1.8, d / 4), Color3.fromRGB(60, 62, 70), Enum.Material.Marble)
end

function Buildings.Tower(parent: Instance, opts: { [string]: any }): Model
	local cf = baseCF(opts.Position, opts.Facing)
	if opts.AssetId then
		local asset = Props.TryBuilding(opts.AssetId, cf, parent)
		if asset then
			return asset :: any
		end
	end
	local size: Vector3 = opts.Size
	local w, h, d = size.X, size.Y, size.Z
	local m = newModel(parent, opts.Name or "Tower")
	local frame: Color3 = opts.Color or CONCRETE
	local glass: Color3 = opts.Glass or Color3.fromRGB(70, 110, 150)
	local accent: Color3 = opts.Accent or Color3.fromRGB(110, 200, 255)
	local fh = opts.FloorHeight or 12
	local lobbyH = opts.Lobby and 16 or 0
	if opts.Lobby then
		lobbyShell(m, cf, w - 4, d - 4, lobbyH, frame)
	end
	local bodyH = h - lobbyH
	-- glass body
	Props.Part(m, "Body", Vector3.new(w - 1, bodyH, d - 1), cf * CFrame.new(0, lobbyH + bodyH / 2, 0), glass, Enum.Material.Glass, { Reflectance = 0.12 })
	-- floor bands (one part wraps all four facades)
	local floors = math.floor(bodyH / fh)
	for i = 0, floors do
		local y = lobbyH + i * fh
		local isAccent = opts.Accent and (i % 5 == 4)
		Props.Part(m, isAccent and "AccentBand" or "Band", Vector3.new(w, isAccent and 0.7 or 1.4, d), cf * CFrame.new(0, math.min(y, h - 0.7) + 0.7, 0), isAccent and accent or frame, isAccent and Enum.Material.Neon or Enum.Material.Concrete, { CastShadow = not isAccent })
	end
	-- vertical fins (corners + mid facade)
	for _, x in ipairs({ -1, 1 }) do
		for _, z in ipairs({ -1, 1 }) do
			Props.Part(m, "CornerFin", Vector3.new(1.6, bodyH, 1.6), cf * CFrame.new(x * (w / 2 - 0.4), lobbyH + bodyH / 2, z * (d / 2 - 0.4)), frame, Enum.Material.Concrete)
		end
	end
	local finsX = math.max(1, math.floor(w / 24))
	for i = 1, finsX do
		local x = -w / 2 + i * (w / (finsX + 1))
		Props.Part(m, "FinFront", Vector3.new(0.8, bodyH, 0.6), cf * CFrame.new(x, lobbyH + bodyH / 2, -d / 2), frame, Enum.Material.Concrete, { CastShadow = false })
		Props.Part(m, "FinBack", Vector3.new(0.8, bodyH, 0.6), cf * CFrame.new(x, lobbyH + bodyH / 2, d / 2), frame, Enum.Material.Concrete, { CastShadow = false })
	end
	local finsZ = math.max(1, math.floor(d / 24))
	for i = 1, finsZ do
		local z = -d / 2 + i * (d / (finsZ + 1))
		Props.Part(m, "FinLeft", Vector3.new(0.6, bodyH, 0.8), cf * CFrame.new(-w / 2, lobbyH + bodyH / 2, z), frame, Enum.Material.Concrete, { CastShadow = false })
		Props.Part(m, "FinRight", Vector3.new(0.6, bodyH, 0.8), cf * CFrame.new(w / 2, lobbyH + bodyH / 2, z), frame, Enum.Material.Concrete, { CastShadow = false })
	end
	-- roof + crown
	Props.Part(m, "Roof", Vector3.new(w + 0.6, 1.2, d + 0.6), cf * CFrame.new(0, h + 0.6, 0), frame, Enum.Material.Concrete)
	crown(m, cf * CFrame.new(0, h + 1.2, 0), w, d, opts.Crown or "Flat", glass, accent)
	if opts.Sign then
		local sign = Props.Small(m, "Sign", Vector3.new(math.min(w - 6, 36), 4, 0.6), cf * CFrame.new(0, lobbyH > 0 and lobbyH + 3 or 8, -d / 2 - 0.6), DARK, Enum.Material.SmoothPlastic)
		Props.Sign(sign, opts.Sign, { TextColor = accent })
	end
	return m
end

---------------------------------------------------------------------------
-- Walk-in building
---------------------------------------------------------------------------
function Buildings.Hollow(parent: Instance, opts: { [string]: any })
	local cf = baseCF(opts.Position, opts.Facing)
	local size: Vector3 = opts.Size
	local w, h, d = size.X, size.Y, size.Z
	local result = {
		CFrame = cf,
		FloorY = GROUND,
		Inside = cf * CFrame.new(0, GROUND + 3, -d / 2 + 8),
		Outside = cf * CFrame.new(0, GROUND + 3, -d / 2 - 8),
	}
	if opts.AssetId then
		local asset = Props.TryBuilding(opts.AssetId, cf, parent)
		if asset then
			result.Model = asset
			return result
		end
	end
	local m = newModel(parent, opts.Name or "Building")
	result.Model = m
	local color: Color3 = opts.Color or CONCRETE
	local trim: Color3 = opts.Trim or DARK
	local t = 1
	local door = opts.DoorWidth or 12
	local doorH = math.min(opts.DoorHeight or 10, h - 2)
	-- floor slab (top at GROUND)
	Props.Part(m, "Floor", Vector3.new(w, GROUND, d), cf * CFrame.new(0, GROUND / 2, 0), opts.Floor or Color3.fromRGB(214, 212, 206), Enum.Material.SmoothPlastic)
	-- walls
	local wallY = GROUND + h / 2
	Props.Part(m, "WallBack", Vector3.new(w, h, t), cf * CFrame.new(0, wallY, d / 2 - t / 2), color, Enum.Material.Concrete)
	Props.Part(m, "WallLeft", Vector3.new(t, h, d - 2 * t), cf * CFrame.new(-w / 2 + t / 2, wallY, 0), color, Enum.Material.Concrete)
	Props.Part(m, "WallRight", Vector3.new(t, h, d - 2 * t), cf * CFrame.new(w / 2 - t / 2, wallY, 0), color, Enum.Material.Concrete)
	local side = (w - door) / 2
	local frontMat = opts.GlassFront and Enum.Material.Glass or Enum.Material.Concrete
	local frontColor = opts.GlassFront and Color3.fromRGB(170, 205, 230) or color
	local frontExtra = opts.GlassFront and { Transparency = 0.5, CastShadow = false } or nil
	if side > 0.5 then
		Props.Part(m, "WallFrontL", Vector3.new(side, h, t), cf * CFrame.new(-(door / 2 + side / 2), wallY, -d / 2 + t / 2), frontColor, frontMat, frontExtra)
		Props.Part(m, "WallFrontR", Vector3.new(side, h, t), cf * CFrame.new(door / 2 + side / 2, wallY, -d / 2 + t / 2), frontColor, frontMat, frontExtra)
	end
	Props.Part(m, "Lintel", Vector3.new(door, h - doorH, t), cf * CFrame.new(0, GROUND + doorH + (h - doorH) / 2, -d / 2 + t / 2), trim, Enum.Material.Concrete)
	-- side window strips
	if not opts.NoWindows then
		for _, x in ipairs({ -1, 1 }) do
			Props.Small(m, "WindowStrip", Vector3.new(0.3, math.max(2, h * 0.3), d * 0.7), cf * CFrame.new(x * (w / 2 + 0.1), GROUND + h * 0.6, 0), Color3.fromRGB(150, 190, 220), Enum.Material.Glass, { Transparency = 0.2, CanCollide = false })
		end
	end
	-- roof
	Props.Part(m, "Roof", Vector3.new(w + 1, 1, d + 1), cf * CFrame.new(0, GROUND + h + 0.5, 0), trim, Enum.Material.Concrete)
	Props.Small(m, "Parapet", Vector3.new(w + 1.4, 1.2, 0.8), cf * CFrame.new(0, GROUND + h + 1.6, -d / 2 - 0.1), color, Enum.Material.Concrete)
	-- interior light
	local light = Instance.new("PointLight")
	light.Range = math.min(60, math.max(w, d) * 0.8)
	light.Brightness = 1.1
	light.Color = Color3.fromRGB(255, 240, 220)
	light.Shadows = false
	light.Parent = Props.Small(m, "CeilingLight", Vector3.new(6, 0.3, 6), cf * CFrame.new(0, GROUND + h - 0.2, 0), Color3.fromRGB(255, 246, 228), Enum.Material.Neon, { CanCollide = false })
	-- sign
	if opts.Sign then
		local sign = Props.Small(m, "Sign", Vector3.new(math.min(w - 4, 40), 4, 0.6), cf * CFrame.new(0, GROUND + h - 2.5, -d / 2 - 0.4), trim, Enum.Material.SmoothPlastic)
		Props.Sign(sign, opts.Sign, { TextColor = opts.SignColor or Color3.new(1, 1, 1) })
	end
	-- awning over the door
	Props.Small(m, "Awning", Vector3.new(door + 4, 0.5, 5), cf * CFrame.new(0, GROUND + doorH + 0.6, -d / 2 - 2.5), opts.SignColor or trim, Enum.Material.SmoothPlastic)
	return result
end

---------------------------------------------------------------------------
-- Solid decorative building
---------------------------------------------------------------------------
function Buildings.Box(parent: Instance, opts: { [string]: any }): Model
	local cf = baseCF(opts.Position, opts.Facing)
	if opts.AssetId then
		local asset = Props.TryBuilding(opts.AssetId, cf, parent)
		if asset then
			return asset :: any
		end
	end
	local size: Vector3 = opts.Size
	local w, h, d = size.X, size.Y, size.Z
	local m = newModel(parent, opts.Name or "Building")
	local color: Color3 = opts.Color or CONCRETE
	local trim: Color3 = opts.Trim or DARK
	Props.Part(m, "Body", Vector3.new(w, h, d), cf * CFrame.new(0, h / 2, 0), color, opts.Material or Enum.Material.Concrete)
	Props.Part(m, "Roof", Vector3.new(w + 1, 1, d + 1), cf * CFrame.new(0, h + 0.5, 0), trim, Enum.Material.Concrete)
	-- window rows on front/back
	local rows = math.max(1, math.floor((h - 6) / 10))
	for r = 1, rows do
		local y = 6 + (r - 0.5) * ((h - 6) / rows)
		Props.Small(m, "WindowsF", Vector3.new(w * 0.86, 3, 0.3), cf * CFrame.new(0, y, -d / 2 - 0.1), opts.WindowColor or Color3.fromRGB(120, 170, 210), Enum.Material.Glass, { CanCollide = false })
		if not opts.FrontOnly then
			Props.Small(m, "WindowsB", Vector3.new(w * 0.86, 3, 0.3), cf * CFrame.new(0, y, d / 2 + 0.1), opts.WindowColor or Color3.fromRGB(120, 170, 210), Enum.Material.Glass, { CanCollide = false })
		end
	end
	-- door
	Props.Small(m, "Door", Vector3.new(opts.DoorWidth or 6, 8, 0.4), cf * CFrame.new(0, 4, -d / 2 - 0.15), Color3.fromRGB(70, 50, 36), Enum.Material.Wood, { CanCollide = false })
	if opts.Sign then
		local sign = Props.Small(m, "Sign", Vector3.new(math.min(w - 4, 40), 4, 0.6), cf * CFrame.new(0, math.min(h - 3, 14), -d / 2 - 0.5), trim, Enum.Material.SmoothPlastic)
		Props.Sign(sign, opts.Sign, { TextColor = opts.SignColor or Color3.new(1, 1, 1) })
	end
	if opts.Crown then
		crown(m, cf * CFrame.new(0, h + 1, 0), w, d, opts.Crown, color, opts.SignColor or Color3.fromRGB(110, 200, 255))
	end
	return m
end

---------------------------------------------------------------------------
-- Apartment tower (ESSENTIAL: ApartmentUnit pads + elevators)
---------------------------------------------------------------------------
local CORRIDOR = 10
local MARGIN = 4

local function tierSize(tierId: string): Vector2
	local t = Housing.Tiers[tierId]
	return (t and t.PlotSize) or Vector2.new(30, 30)
end

-- Returns the plate size needed for all levels.
local function plateFor(levels): Vector2
	local w, d = 40, 40
	for _, lv in ipairs(levels) do
		local s = tierSize(lv.Tier)
		w = math.max(w, 2 * s.X + CORRIDOR + 2 * MARGIN)
		d = math.max(d, 2 * s.Y + CORRIDOR + 2 * MARGIN)
	end
	return Vector2.new(w, d)
end

function Buildings.Apartment(parent: Instance, opts: { [string]: any }, gameplay): Model
	local cf = baseCF(opts.Position, opts.Facing)
	local plate = plateFor(opts.Levels)
	local W, D = plate.X, plate.Y
	local m = newModel(parent, opts.Name or "Apartments")
	local frame: Color3 = opts.Color or CONCRETE
	local glassColor: Color3 = opts.Glass or Color3.fromRGB(120, 160, 190)
	local accent: Color3 = opts.Accent or Color3.fromRGB(255, 200, 110)
	local lobbyH = opts.LobbyHeight or 18
	local podium = opts.PodiumHeight or 0
	local tags = World.Tags

	-- lobby
	lobbyShell(m, cf, W, D, lobbyH, frame)
	if opts.Sign then
		local sign = Props.Small(m, "Sign", Vector3.new(math.min(W - 12, 44), 4, 0.6), cf * CFrame.new(0, lobbyH - 2.5, -D / 2 - 0.4), DARK, Enum.Material.SmoothPlastic)
		Props.Sign(sign, opts.Sign, { TextColor = accent })
	end
	local lobbyArrive = cf * CFrame.new(0, GROUND + 3, -D / 2 + 10) * CFrame.Angles(0, math.pi, 0)

	-- optional podium of office floors between the lobby and the first unit level
	local y = lobbyH + 1.2 -- slab sits just above the lobby ceiling (no z-fighting)
	if podium > 0 then
		Props.Part(m, "Podium", Vector3.new(W - 1, podium, D - 1), cf * CFrame.new(0, y + podium / 2, 0), glassColor, Enum.Material.Glass, { Reflectance = 0.12 })
		local bands = math.floor(podium / 12)
		for i = 1, bands do
			Props.Part(m, "PodiumBand", Vector3.new(W, 1.2, D), cf * CFrame.new(0, y + i * 12 - 0.6, 0), frame, Enum.Material.Concrete)
		end
		y += podium
	end

	-- elevator panels on the lobby back wall, one per unit level
	local panelSpacing = 6
	local levelCount = #opts.Levels
	local panelStart = -((levelCount - 1) * panelSpacing) / 2
	local unitIndex = {}
	for li, lv in ipairs(opts.Levels) do
		local h = lv.Height or 16
		local floorY = y
		-- slab (doubles as the facade floor band)
		Props.Part(m, "Slab", Vector3.new(W + 0.6, 1.2, D + 0.6), cf * CFrame.new(0, floorY - 0.6, 0), frame, Enum.Material.Concrete)
		-- curtain glass
		local gx = { Transparency = 0.55, CastShadow = false }
		Props.Part(m, "CurtainF", Vector3.new(W, h - 1.2, 0.4), cf * CFrame.new(0, floorY + (h - 1.2) / 2, -D / 2 + 0.2), glassColor, Enum.Material.Glass, gx)
		Props.Part(m, "CurtainB", Vector3.new(W, h - 1.2, 0.4), cf * CFrame.new(0, floorY + (h - 1.2) / 2, D / 2 - 0.2), glassColor, Enum.Material.Glass, gx)
		Props.Part(m, "CurtainL", Vector3.new(0.4, h - 1.2, D - 0.8), cf * CFrame.new(-W / 2 + 0.2, floorY + (h - 1.2) / 2, 0), glassColor, Enum.Material.Glass, gx)
		Props.Part(m, "CurtainR", Vector3.new(0.4, h - 1.2, D - 0.8), cf * CFrame.new(W / 2 - 0.2, floorY + (h - 1.2) / 2, 0), glassColor, Enum.Material.Glass, gx)
		-- corridor light
		local light = Instance.new("PointLight")
		light.Range = 30
		light.Brightness = 0.9
		light.Color = Color3.fromRGB(255, 236, 210)
		light.Shadows = false
		light.Parent = Props.Small(m, "CorridorLight", Vector3.new(3, 0.3, 3), cf * CFrame.new(0, floorY + h - 1.8, 0), Color3.fromRGB(255, 244, 220), Enum.Material.Neon, { CanCollide = false })

		-- units in a 2 x 2 grid around the corridor cross; fronts face the corridor (local +Z = corridor)
		local s = tierSize(lv.Tier)
		local quads = { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }
		unitIndex[lv.Tier] = unitIndex[lv.Tier] or 0
		for q = 1, math.min(4, lv.Count or 4) do
			local sx, sz = quads[q][1], quads[q][2]
			local local_ = Vector3.new(sx * (CORRIDOR / 2 + s.X / 2), 0, sz * (CORRIDOR / 2 + s.Y / 2))
			local worldPos = (cf * CFrame.new(local_.X, floorY, local_.Z)).Position
			local towardCorridor = (cf:VectorToWorldSpace(Vector3.new(0, 0, -sz)))
			local unitCF = Props.StreetFacing(worldPos, towardCorridor)
			unitIndex[lv.Tier] += 1
			local plotId = string.format("%s_%s_%d", opts.Prefix or "apt", string.lower(lv.Tier), unitIndex[lv.Tier])
			gameplay.Plot(m, tags.ApartmentUnit, plotId, lv.Tier, unitCF, s, Color3.fromRGB(200, 196, 188), Enum.Material.WoodPlanks)
		end

		-- elevators: lobby panel -> this level, and a return panel on this level
		local arrive = cf * CFrame.new(8, floorY + 3, 0)
		local label = lv.Label or ("Floor " .. (li + 1))
		local pass = lv.RequiresPass
		-- panels stand in front of the lobby back wall; their front face (LookVector) points into the lobby
		local panelCF = cf * CFrame.new(panelStart + (li - 1) * panelSpacing, GROUND, D / 2 - 2)
		gameplay.Elevator(m, panelCF, label, arrive, pass)
		local backCF = cf * CFrame.new(-2, floorY, 0) * CFrame.Angles(0, -math.pi / 2, 0)
		gameplay.Elevator(m, backCF, "Lobby ⬇", lobbyArrive)

		y = floorY + h
	end

	-- roof + corner columns + crown
	Props.Part(m, "Roof", Vector3.new(W + 0.6, 1.4, D + 0.6), cf * CFrame.new(0, y + 0.1, 0), frame, Enum.Material.Concrete)
	for _, x in ipairs({ -1, 1 }) do
		for _, z in ipairs({ -1, 1 }) do
			Props.Part(m, "Column", Vector3.new(2, y - lobbyH, 2), cf * CFrame.new(x * (W / 2 - 0.2), lobbyH + (y - lobbyH) / 2, z * (D / 2 - 0.2)), frame, Enum.Material.Concrete)
		end
	end
	crown(m, cf * CFrame.new(0, y + 0.8, 0), W, D, opts.Crown or "Flat", glassColor, accent)
	m:SetAttribute("TopY", y)
	return m
end

return Buildings
