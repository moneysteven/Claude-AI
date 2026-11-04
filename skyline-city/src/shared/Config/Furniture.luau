-- FURNITURE CONFIG — every item that can be placed in build mode (homes AND businesses).
--
-- Item fields
--   Id         unique id (letters/digits/underscore). Also the name of an optional real model in
--              ServerStorage.Assets.Furniture.<Id> (pivot = bottom centre, front = -Z) that replaces the greybox.
--   Name / Icon / Category
--   Price      base price (VIP discount is applied by EconomyService:GetPrice(category "Furniture"))
--   Catalogs   which build contexts may use it: "House" | "Apartment" | "Business"
--   Function   gameplay role other systems look for (ARCHITECTURE §8)
--   Size       bounding box in studs (X width, Y height, Z depth). Used for bounds checks and the ghost.
--   Parts      procedural greybox recipe (see "Recipe parts" below)
--   Paintable  colour/material can be changed (placement tint is free; repainting costs a Paint item)
--   VipOnly    only VIP pass holders can place it
--   Mount      nil (floor) | "Wall" (snaps flat against walls) | "Ceiling" (hangs from the ceiling)
--   HideInBuild  roofs: faded out while build mode is open so you can see inside
--   DoorStyle  "Swing" | "SlideUp" | "SlideSide" for Function = "Door"
--
-- Paint items (Category "Paint") have Kind = "Paint", Color, Material and are used by the Paint tool and
-- Wallpaper (apartment walls / floors). CustomColor = true lets the player pick any colour.
--
-- Recipe parts (positions are relative to the item's bottom centre; front faces -Z):
--   S = size, O = centre offset, C = Color3, M = Enum.Material, Sh = "Wedge"|"Cylinder"|"Ball"|"CornerWedge",
--   R = rotation in degrees (Vector3), T = transparency, P = paintable part, N = name, NC = no collision,
--   L = { Range, Brightness, Color } adds a PointLight, Seat = "Sit"|"Sleep" makes a Seat (tagged RPSeat),
--   Door = true marks moving door parts (the main one must be named "Panel").

local Furniture = {}

local function v(x: number, y: number, z: number): Vector3
	return Vector3.new(x, y, z)
end
local rgb = Color3.fromRGB
local Mat = Enum.Material

-- palette
local WOOD = rgb(160, 112, 72)
local DARKWOOD = rgb(96, 64, 44)
local LIGHTWOOD = rgb(206, 170, 124)
local WHITE = rgb(240, 240, 238)
local OFFWHITE = rgb(226, 220, 206)
local BLACK = rgb(32, 32, 36)
local GREY = rgb(130, 132, 140)
local DARKGREY = rgb(70, 72, 80)
local STEEL = rgb(176, 180, 188)
local GOLD = rgb(222, 180, 70)
local GLASS = rgb(170, 210, 235)
local FABRIC_BLUE = rgb(70, 110, 170)
local FABRIC_GREY = rgb(120, 124, 132)
local FABRIC_RED = rgb(170, 60, 62)
local FABRIC_BEIGE = rgb(200, 184, 150)
local LEAF = rgb(64, 140, 70)
local LEAF_DARK = rgb(40, 100, 52)
local TERRACOTTA = rgb(186, 98, 64)
local WATER = rgb(70, 170, 230)
local WARM = rgb(255, 214, 160)
local NEON_PINK = rgb(255, 60, 180)
local NEON_BLUE = rgb(60, 180, 255)

local function part(sx, sy, sz, ox, oy, oz, color, material, extra)
	local p = { S = v(sx, sy, sz), O = v(ox, oy, oz), C = color, M = material }
	if extra then
		for k, val in pairs(extra) do
			p[k] = val
		end
	end
	return p
end

local function join(...)
	local out = {}
	for _, list in ipairs({ ... }) do
		for _, p in ipairs(list) do
			table.insert(out, p)
		end
	end
	return out
end

-- vertical cylinder (Roblox cylinders run along X, so rotate 90° about Z)
local function cyl(height, diameter, ox, oy, oz, color, material, extra)
	local p = part(height, diameter, diameter, ox, oy, oz, color, material, extra)
	p.Sh = "Cylinder"
	p.R = v(0, 0, 90)
	return p
end

local function ball(d, ox, oy, oz, color, material, extra)
	local p = part(d, d, d, ox, oy, oz, color, material, extra)
	p.Sh = "Ball"
	return p
end

---------------------------------------------------------------------------
-- Recipe generators
---------------------------------------------------------------------------
local function gBox(w, h, d, color, material, extra)
	return { part(w, h, d, 0, h / 2, 0, color, material or Mat.SmoothPlastic, extra or { P = true }) }
end

local function gLegs(w, d, h, color, material, thick)
	local t = thick or 0.3
	local out = {}
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			table.insert(out, part(t, h, t, sx * (w / 2 - t), h / 2, sz * (d / 2 - t), color, material or Mat.Wood))
		end
	end
	return out
end

local function gTable(w, d, h, top, leg, topMat)
	return join({ part(w, 0.3, d, 0, h - 0.15, 0, top, topMat or Mat.Wood, { P = true }) }, gLegs(w, d, h - 0.3, leg))
end

local function gChair(seat, frame)
	return join({
		part(2, 0.3, 2, 0, 1.85, 0, seat, Mat.Fabric, { P = true, Seat = "Sit", N = "Seat" }),
		part(2, 2.1, 0.3, 0, 3.05, 0.85, frame, Mat.Wood),
	}, gLegs(2, 2, 1.7, frame, Mat.Wood, 0.25))
end

local function gStool(seat, frame, h)
	return {
		cyl(0.4, 1.8, 0, h - 0.2, 0, seat, Mat.Fabric, { P = true, Seat = "Sit", N = "Seat" }),
		cyl(h - 0.4, 0.3, 0, (h - 0.4) / 2, 0, frame, Mat.Metal),
		cyl(0.2, 1.4, 0, 0.1, 0, frame, Mat.Metal),
	}
end

local function gSofa(w, color)
	local n = math.max(1, math.floor(w / 2.6))
	local inner = w - 1.2
	local out = {
		part(w, 1.2, 3, 0, 0.6, 0, color, Mat.Fabric, { P = true }),
		part(w, 2.0, 0.7, 0, 2.2, 1.15, color, Mat.Fabric, { P = true }),
		part(0.6, 1.4, 3, -(w / 2 - 0.3), 1.9, 0, color, Mat.Fabric, { P = true }),
		part(0.6, 1.4, 3, w / 2 - 0.3, 1.9, 0, color, Mat.Fabric, { P = true }),
	}
	for i = 1, n do
		local cw = inner / n
		local x = -inner / 2 + cw * (i - 0.5)
		table.insert(out, part(cw - 0.08, 0.5, 2.3, x, 1.45, -0.3, color, Mat.Fabric, { P = true, Seat = "Sit" }))
	end
	return out
end

local function gArmchair(color)
	return gSofa(3.2, color)
end

local function gBed(w, l, frame, sheet)
	return {
		part(w, 1, l, 0, 0.5, 0, frame, Mat.Wood),
		part(w - 0.4, 0.8, l - 0.6, 0, 1.4, -0.2, sheet, Mat.Fabric, { P = true, Seat = "Sleep", N = "Mattress" }),
		part(w - 1, 0.4, 1.2, 0, 2.0, l / 2 - 1.3, WHITE, Mat.Fabric),
		part(w, 3.5, 0.4, 0, 1.75, l / 2 - 0.2, frame, Mat.Wood),
	}
end

local function gCabinet(w, h, d, color, handle)
	return {
		part(w, h, d, 0, h / 2, 0, color, Mat.Wood, { P = true }),
		part(0.15, math.min(0.8, h * 0.3), 0.12, -0.35, h * 0.6, -d / 2 - 0.05, handle or STEEL, Mat.Metal),
		part(0.15, math.min(0.8, h * 0.3), 0.12, 0.35, h * 0.6, -d / 2 - 0.05, handle or STEEL, Mat.Metal),
	}
end

local function gShelf(w, h, d, color, shelves)
	local out = {
		part(0.25, h, d, -(w / 2 - 0.125), h / 2, 0, color, Mat.Wood, { P = true }),
		part(0.25, h, d, w / 2 - 0.125, h / 2, 0, color, Mat.Wood, { P = true }),
		part(w, h, 0.15, 0, h / 2, d / 2 - 0.075, color, Mat.Wood, { P = true }),
	}
	for i = 0, shelves do
		local y = 0.15 + (h - 0.3) * (i / shelves)
		table.insert(out, part(w - 0.5, 0.2, d - 0.15, 0, y, -0.075, color, Mat.Wood, { P = true }))
	end
	return out
end

local function gLampFloor(shade)
	return {
		cyl(0.2, 1.4, 0, 0.1, 0, DARKGREY, Mat.Metal),
		cyl(5, 0.2, 0, 2.6, 0, DARKGREY, Mat.Metal),
		cyl(1.2, 1.6, 0, 5.6, 0, shade, Mat.Fabric, { P = true }),
		ball(0.6, 0, 5.4, 0, WARM, Mat.Neon, { NC = true, L = { Range = 18, Brightness = 1.4, Color = WARM } }),
	}
end

local function gLampTable(shade)
	return {
		cyl(0.8, 0.8, 0, 0.4, 0, shade, Mat.SmoothPlastic, { P = true }),
		cyl(0.8, 1.2, 0, 1.3, 0, OFFWHITE, Mat.Fabric),
		ball(0.4, 0, 1.2, 0, WARM, Mat.Neon, { NC = true, L = { Range = 12, Brightness = 1.1, Color = WARM } }),
	}
end

local function gPlant(pot, leaf, h, r)
	return {
		cyl(1.2, r * 0.6, 0, 0.6, 0, pot, Mat.SmoothPlastic, { P = true }),
		ball(r, 0, 1.2 + (h - 1.2) * 0.55, 0, leaf, Mat.Grass, { NC = true }),
		cyl(h - r * 0.5, 0.2, 0, (h - r * 0.5) / 2 + 0.6, 0, DARKWOOD, Mat.Wood, { NC = true }),
	}
end

local function gTree(h, r, trunk, leaf)
	return {
		cyl(h * 0.6, 1.2, 0, h * 0.3, 0, trunk, Mat.Wood),
		ball(r, 0, h - r / 2, 0, leaf, Mat.Grass, { NC = true }),
		ball(r * 0.7, r * 0.3, h - r * 0.75, r * 0.2, LEAF_DARK, Mat.Grass, { NC = true }),
	}
end

local function gPalm(h)
	local out = { cyl(h, 1, 0, h / 2, 0, rgb(150, 120, 80), Mat.Wood) }
	for i = 0, 5 do
		local a = i * 60
		local rad = math.rad(a)
		table.insert(
			out,
			part(0.6, 0.3, 5, math.sin(rad) * 2.2, h - 0.2, math.cos(rad) * 2.2, LEAF, Mat.Grass, { R = v(-20, a, 0), NC = true })
		)
	end
	return out
end

local function gTV(w, h, standH)
	return {
		part(w, h, 0.3, 0, standH + h / 2, 0, BLACK, Mat.Glass),
		part(w + 0.2, h + 0.2, 0.2, 0, standH + h / 2, 0.15, DARKGREY, Mat.SmoothPlastic),
		part(0.4, standH, 0.4, 0, standH / 2, 0.15, DARKGREY, Mat.Metal),
		part(math.min(2, w * 0.4), 0.15, 1, 0, 0.075, 0.1, DARKGREY, Mat.Metal),
	}
end

local function gWall(len, h, t)
	return { part(len, h, t, 0, h / 2, 0, OFFWHITE, Mat.SmoothPlastic, { P = true }) }
end

local function gWallWindow(len, h, t)
	local win = len - 3
	return {
		part(len, 3.5, t, 0, 1.75, 0, OFFWHITE, Mat.SmoothPlastic, { P = true }),
		part(len, 3, t, 0, h - 1.5, 0, OFFWHITE, Mat.SmoothPlastic, { P = true }),
		part(1.5, h - 6.5, t, -(len / 2 - 0.75), 3.5 + (h - 6.5) / 2, 0, OFFWHITE, Mat.SmoothPlastic, { P = true }),
		part(1.5, h - 6.5, t, len / 2 - 0.75, 3.5 + (h - 6.5) / 2, 0, OFFWHITE, Mat.SmoothPlastic, { P = true }),
		part(win, h - 6.5, 0.2, 0, 3.5 + (h - 6.5) / 2, 0, GLASS, Mat.Glass, { T = 0.55 }),
	}
end

local function gWallDoor(len, h, t, open)
	local side = (len - open) / 2
	return {
		part(side, h, t, -(open / 2 + side / 2), h / 2, 0, OFFWHITE, Mat.SmoothPlastic, { P = true }),
		part(side, h, t, open / 2 + side / 2, h / 2, 0, OFFWHITE, Mat.SmoothPlastic, { P = true }),
		part(open, h - 8.2, t, 0, 8.2 + (h - 8.2) / 2, 0, OFFWHITE, Mat.SmoothPlastic, { P = true }),
	}
end

local function gDoor(w, h, color, material, glass)
	local out = {
		part(w - 0.1, h - 0.1, 0.3, 0, (h - 0.1) / 2, 0, color, material, {
			P = true,
			N = "Panel",
			Door = true,
			T = glass and 0.4 or nil,
		}),
	}
	if not glass then
		table.insert(out, part(0.25, 0.25, 0.5, w / 2 - 0.5, h * 0.48, 0, GOLD, Mat.Metal, { Door = true, N = "Handle" }))
	end
	return out
end

local function gFence(len, h, color, material)
	local out = {
		part(len, 0.3, 0.2, 0, h * 0.75, 0, color, material, { P = true }),
		part(len, 0.3, 0.2, 0, h * 0.3, 0, color, material, { P = true }),
	}
	local posts = math.max(2, math.floor(len / 2) + 1)
	for i = 0, posts - 1 do
		local x = -len / 2 + 0.2 + (len - 0.4) * (i / (posts - 1))
		table.insert(out, part(0.4, h, 0.4, x, h / 2, 0, color, material, { P = true }))
	end
	return out
end

local function gStairs(w, rise, run, steps)
	local out = {}
	local sh, sd = rise / steps, run / steps
	for i = 1, steps do
		table.insert(out, part(w, sh * i, sd, 0, sh * i / 2, run / 2 - sd * (i - 0.5), WOOD, Mat.WoodPlanks, { P = true }))
	end
	return out
end

local function gRoofPitched(s, h)
	return {
		part(s, h, s / 2, 0, h / 2, -s / 4, rgb(120, 70, 60), Mat.Slate, { Sh = "Wedge", P = true }),
		part(s, h, s / 2, 0, h / 2, s / 4, rgb(120, 70, 60), Mat.Slate, { Sh = "Wedge", P = true, R = v(0, 180, 0) }),
	}
end

local function gCounter(w, body, top)
	return {
		part(w, 3.2, 2.5, 0, 1.6, 0, body, Mat.Wood, { P = true }),
		part(w, 0.3, 2.6, 0, 3.35, -0.05, top, Mat.Marble),
		part(w * 0.8, 0.1, 0.1, 0, 2.6, -1.3, STEEL, Mat.Metal),
	}
end

local function gPainting(w, h, color)
	return {
		part(w, h, 0.2, 0, h / 2, 0, DARKWOOD, Mat.Wood),
		part(w - 0.4, h - 0.4, 0.1, 0, h / 2, -0.12, color, Mat.SmoothPlastic, { P = true }),
	}
end

---------------------------------------------------------------------------
-- Catalog groups
---------------------------------------------------------------------------
local HOUSE = { "House" }
local HOME = { "House", "Apartment" }
local ALL = { "House", "Apartment", "Business" }
local HB = { "House", "Business" }
local BIZ = { "Business" }

Furniture.Categories = {
	{ Id = "Structure", Name = "Structure", Icon = "🧱" },
	{ Id = "DoorsWindows", Name = "Doors & Windows", Icon = "🚪" },
	{ Id = "Paint", Name = "Paint & Wallpaper", Icon = "🎨" },
	{ Id = "LivingRoom", Name = "Living Room", Icon = "🛋️" },
	{ Id = "Bedroom", Name = "Bedroom", Icon = "🛏️" },
	{ Id = "Kitchen", Name = "Kitchen", Icon = "🍳" },
	{ Id = "Bathroom", Name = "Bathroom", Icon = "🛁" },
	{ Id = "Office", Name = "Office", Icon = "💼" },
	{ Id = "Outdoor", Name = "Outdoor & Garden", Icon = "🌳" },
	{ Id = "Lighting", Name = "Lighting", Icon = "💡" },
	{ Id = "Electronics", Name = "Electronics", Icon = "📺" },
	{ Id = "Decor", Name = "Decor", Icon = "🖼️" },
	{ Id = "Gym", Name = "Gym", Icon = "🏋️" },
	{ Id = "Party", Name = "Party", Icon = "🎉" },
	{ Id = "Kids", Name = "Kids", Icon = "🧸" },
	{ Id = "Restaurant", Name = "Restaurant", Icon = "🍔" },
	{ Id = "Retail", Name = "Retail", Icon = "👕" },
	{ Id = "Club", Name = "Club", Icon = "🎧" },
	{ Id = "BizOffice", Name = "Business Office", Icon = "🖥️" },
	{ Id = "GasStation", Name = "Gas Station", Icon = "⛽" },
	{ Id = "Dealership", Name = "Dealership", Icon = "🚘" },
}

-- Materials players may pick (placement tint / paint). Names of Enum.Material.
Furniture.Materials = {
	"SmoothPlastic",
	"Plastic",
	"Wood",
	"WoodPlanks",
	"Brick",
	"Concrete",
	"Marble",
	"Granite",
	"Slate",
	"Fabric",
	"Metal",
	"DiamondPlate",
	"Cobblestone",
	"Pebble",
	"Sand",
	"Grass",
	"Glass",
}

local Items = {}
Furniture.Items = Items

local function I(id, name, category, price, catalogs, fn, size, parts, extra)
	local def = {
		Id = id,
		Name = name,
		Category = category,
		Price = price,
		Catalogs = catalogs,
		Function = fn,
		Size = size,
		Parts = parts,
		Paintable = true,
	}
	if extra then
		for k, val in pairs(extra) do
			def[k] = val
		end
	end
	table.insert(Items, def)
	return def
end

local FH = 12 -- floor height (keep in sync with Config.Housing.Build.FloorHeight)
local WT = 0.6 -- wall thickness

---------------------------------------------------------------------------
-- Structure
---------------------------------------------------------------------------
I("wall_4", "Wall (4)", "Structure", 40, HB, "Decoration", v(4, FH, WT), gWall(4, FH, WT), { Icon = "🧱" })
I("wall_8", "Wall (8)", "Structure", 70, HB, "Decoration", v(8, FH, WT), gWall(8, FH, WT), { Icon = "🧱" })
I("wall_16", "Wall (16)", "Structure", 130, HB, "Decoration", v(16, FH, WT), gWall(16, FH, WT), { Icon = "🧱" })
I("wall_half_4", "Half Wall (4)", "Structure", 25, HB, "Decoration", v(4, 4, WT), gWall(4, 4, WT), { Icon = "▭" })
I("wall_half_8", "Half Wall (8)", "Structure", 45, HB, "Decoration", v(8, 4, WT), gWall(8, 4, WT), { Icon = "▭" })
I("wall_window_8", "Window Wall (8)", "Structure", 160, HB, "Window", v(8, FH, WT), gWallWindow(8, FH, WT), { Icon = "🪟" })
I("wall_window_16", "Window Wall (16)", "Structure", 290, HB, "Window", v(16, FH, WT), gWallWindow(16, FH, WT), { Icon = "🪟" })
I("wall_door_8", "Door Frame (8)", "Structure", 110, HB, "Decoration", v(8, FH, WT), gWallDoor(8, FH, WT, 4), { Icon = "🚪" })
I("wall_door_wide_8", "Wide Door Frame (8)", "Structure", 120, HB, "Decoration", v(8, FH, WT), gWallDoor(8, FH, WT, 6.2), { Icon = "🚪" })
I("wall_glass_8", "Glass Wall (8)", "Structure", 240, HB, "Window", v(8, FH, WT), {
	part(8, FH, 0.3, 0, FH / 2, 0, GLASS, Mat.Glass, { T = 0.5 }),
	part(8, 0.4, WT, 0, 0.2, 0, DARKGREY, Mat.Metal),
	part(8, 0.4, WT, 0, FH - 0.2, 0, DARKGREY, Mat.Metal),
}, { Icon = "🔲" })
I("floor_4", "Floor Tile (4)", "Structure", 15, HB, "Decoration", v(4, 0.4, 4), gBox(4, 0.4, 4, WOOD, Mat.WoodPlanks), { Icon = "⬛" })
I("floor_8", "Floor Tile (8)", "Structure", 50, HB, "Decoration", v(8, 0.4, 8), gBox(8, 0.4, 8, WOOD, Mat.WoodPlanks), { Icon = "⬛" })
I("floor_16", "Floor Tile (16)", "Structure", 180, HB, "Decoration", v(16, 0.4, 16), gBox(16, 0.4, 16, WOOD, Mat.WoodPlanks), { Icon = "⬛" })
I("stairs_straight", "Stairs", "Structure", 350, HB, "Decoration", v(4, FH, 12), gStairs(4, FH, 12, 12), { Icon = "🪜" })
I("stairs_wide", "Wide Stairs", "Structure", 600, HB, "Decoration", v(8, FH, 14), gStairs(8, FH, 14, 14), { Icon = "🪜" })
I("roof_flat_8", "Flat Roof (8)", "Structure", 60, HB, "Decoration", v(8, 0.6, 8), gBox(8, 0.6, 8, DARKGREY, Mat.Slate), { Icon = "🟫", HideInBuild = true })
I("roof_flat_16", "Flat Roof (16)", "Structure", 210, HB, "Decoration", v(16, 0.6, 16), gBox(16, 0.6, 16, DARKGREY, Mat.Slate), { Icon = "🟫", HideInBuild = true })
I("roof_pitched_8", "Pitched Roof (8)", "Structure", 140, HB, "Decoration", v(8, 3, 8), gRoofPitched(8, 3), { Icon = "🔺", HideInBuild = true })
I("roof_pitched_16", "Pitched Roof (16)", "Structure", 420, HB, "Decoration", v(16, 6, 16), gRoofPitched(16, 6), { Icon = "🔺", HideInBuild = true })
I("fence_wood_8", "Wooden Fence (8)", "Structure", 80, HB, "Decoration", v(8, 4, 0.4), gFence(8, 4, WOOD, Mat.Wood), { Icon = "🚧" })
I("fence_picket_8", "Picket Fence (8)", "Structure", 95, HB, "Decoration", v(8, 3.5, 0.4), gFence(8, 3.5, WHITE, Mat.Wood), { Icon = "🚧" })
I("fence_metal_8", "Metal Fence (8)", "Structure", 130, HB, "Decoration", v(8, 5, 0.4), gFence(8, 5, DARKGREY, Mat.Metal), { Icon = "🚧" })
I("pillar_round", "Round Pillar", "Structure", 90, HB, "Decoration", v(1.6, FH, 1.6), { cyl(FH, 1.6, 0, FH / 2, 0, WHITE, Mat.Marble, { P = true }) }, { Icon = "🏛️" })
I("pillar_square", "Square Pillar", "Structure", 70, HB, "Decoration", v(1.4, FH, 1.4), gBox(1.4, FH, 1.4, WHITE, Mat.Concrete), { Icon = "🏛️" })
I("railing_8", "Railing (8)", "Structure", 85, HB, "Decoration", v(8, 3.5, 0.3), gFence(8, 3.5, STEEL, Mat.Metal), { Icon = "〰️" })
I("platform_8", "Raised Platform (8)", "Structure", 120, HB, "Decoration", v(8, 1.5, 8), gBox(8, 1.5, 8, GREY, Mat.Concrete), { Icon = "⬜" })

---------------------------------------------------------------------------
-- Doors & Windows
---------------------------------------------------------------------------
I("door_basic", "Wooden Door", "DoorsWindows", 150, HB, "Door", v(4, 8, 0.4), gDoor(4, 8, WOOD, Mat.Wood), { Icon = "🚪", DoorStyle = "Swing" })
I("door_modern", "Modern Door", "DoorsWindows", 260, HB, "Door", v(4, 8, 0.4), gDoor(4, 8, DARKGREY, Mat.SmoothPlastic), { Icon = "🚪", DoorStyle = "Swing" })
I("door_glass_slide", "Sliding Glass Door", "DoorsWindows", 380, HB, "Door", v(6, 8, 0.4), gDoor(6, 8, GLASS, Mat.Glass, true), { Icon = "🚪", DoorStyle = "SlideSide" })
I("door_wide", "Wide Door", "DoorsWindows", 320, HB, "Door", v(6, 8, 0.4), gDoor(6, 8, DARKWOOD, Mat.Wood), { Icon = "🚪", DoorStyle = "Swing" })
I("door_interior", "Interior Door", "DoorsWindows", 120, ALL, "Door", v(4, 8, 0.4), gDoor(4, 8, WHITE, Mat.SmoothPlastic), { Icon = "🚪", DoorStyle = "Swing" })
I("garage_door", "Garage Door", "DoorsWindows", 900, HB, "Door", v(12, 9, 0.5), {
	part(12, 9, 0.4, 0, 4.5, 0, WHITE, Mat.Metal, { P = true, N = "Panel", Door = true }),
}, { Icon = "🚗", DoorStyle = "SlideUp" })
I("window_small", "Small Window", "DoorsWindows", 90, ALL, "Window", v(3, 3, 0.4), {
	part(3, 3, 0.3, 0, 1.5, 0, WHITE, Mat.Wood, { P = true }),
	part(2.6, 2.6, 0.32, 0, 1.5, 0, GLASS, Mat.Glass, { T = 0.45 }),
}, { Icon = "🪟", Mount = "Wall" })
I("window_large", "Large Window", "DoorsWindows", 160, ALL, "Window", v(6, 4, 0.4), {
	part(6, 4, 0.3, 0, 2, 0, WHITE, Mat.Wood, { P = true }),
	part(5.6, 3.6, 0.32, 0, 2, 0, GLASS, Mat.Glass, { T = 0.45 }),
}, { Icon = "🪟", Mount = "Wall" })
I("window_round", "Round Window", "DoorsWindows", 140, ALL, "Window", v(3, 3, 0.4), {
	part(0.3, 3, 3, 0, 1.5, 0, WHITE, Mat.Wood, { Sh = "Cylinder", R = v(0, 90, 0), P = true }),
	part(0.34, 2.6, 2.6, 0, 1.5, 0, GLASS, Mat.Glass, { Sh = "Cylinder", R = v(0, 90, 0), T = 0.45 }),
}, { Icon = "⭕", Mount = "Wall" })
I("curtains", "Curtains", "DoorsWindows", 110, ALL, "Decoration", v(6, 7, 0.5), {
	part(6.2, 0.2, 0.2, 0, 6.9, 0, GOLD, Mat.Metal),
	part(1.6, 6.8, 0.3, -2.2, 3.4, 0, FABRIC_RED, Mat.Fabric, { P = true }),
	part(1.6, 6.8, 0.3, 2.2, 3.4, 0, FABRIC_RED, Mat.Fabric, { P = true }),
}, { Icon = "🎭", Mount = "Wall" })
I("blinds", "Blinds", "DoorsWindows", 80, ALL, "Decoration", v(5, 4, 0.3), gBox(5, 4, 0.2, OFFWHITE, Mat.Fabric), { Icon = "🎚️", Mount = "Wall" })

---------------------------------------------------------------------------
-- Paint & Wallpaper (used by the Paint tool, not placed)
---------------------------------------------------------------------------
local function paint(id, name, price, color, material, extra)
	local def = I(id, name, "Paint", price, ALL, "Decoration", v(1, 1, 1), {}, {
		Kind = "Paint",
		Color = color,
		Material = material,
		Paintable = false,
		Icon = "🎨",
	})
	if extra then
		for k, val in pairs(extra) do
			def[k] = val
		end
	end
	return def
end
paint("paint_white", "Paint: Snow White", 20, rgb(245, 245, 242), "SmoothPlastic")
paint("paint_cream", "Paint: Cream", 20, rgb(240, 228, 200), "SmoothPlastic")
paint("paint_grey", "Paint: Soft Grey", 20, rgb(170, 172, 178), "SmoothPlastic")
paint("paint_charcoal", "Paint: Charcoal", 25, rgb(52, 54, 60), "SmoothPlastic")
paint("paint_sky", "Paint: Sky Blue", 25, rgb(140, 196, 240), "SmoothPlastic")
paint("paint_navy", "Paint: Navy", 25, rgb(36, 52, 96), "SmoothPlastic")
paint("paint_mint", "Paint: Mint", 25, rgb(160, 226, 196), "SmoothPlastic")
paint("paint_forest", "Paint: Forest", 25, rgb(46, 98, 62), "SmoothPlastic")
paint("paint_blush", "Paint: Blush", 25, rgb(240, 180, 190), "SmoothPlastic")
paint("paint_red", "Paint: Brick Red", 25, rgb(170, 60, 50), "SmoothPlastic")
paint("paint_sunny", "Paint: Sunny Yellow", 25, rgb(250, 214, 90), "SmoothPlastic")
paint("paint_lavender", "Paint: Lavender", 25, rgb(186, 164, 226), "SmoothPlastic")
paint("wallpaper_brick", "Wallpaper: Brick", 60, rgb(170, 90, 70), "Brick")
paint("wallpaper_wood", "Wallpaper: Wood Panels", 60, rgb(150, 108, 72), "WoodPlanks")
paint("wallpaper_marble", "Wallpaper: Marble", 90, rgb(236, 236, 238), "Marble")
paint("wallpaper_concrete", "Wallpaper: Concrete", 45, rgb(160, 160, 160), "Concrete")
paint("wallpaper_slate", "Wallpaper: Slate Tiles", 70, rgb(80, 84, 92), "Slate")
paint("wallpaper_fabric", "Wallpaper: Fabric", 55, rgb(200, 184, 150), "Fabric")
paint("wallpaper_granite", "Wallpaper: Granite", 80, rgb(120, 110, 104), "Granite")
paint("paint_gold", "Paint: Gold Leaf", 250, GOLD, "Metal", { VipOnly = true })
paint("paint_custom", "Paint: Custom Colour", 40, rgb(255, 255, 255), "SmoothPlastic", { CustomColor = true })

---------------------------------------------------------------------------
-- Living Room
---------------------------------------------------------------------------
I("sofa_2", "Loveseat", "LivingRoom", 450, ALL, "Seat", v(5.5, 3.2, 3), gSofa(5.5, FABRIC_GREY), { Icon = "🛋️" })
I("sofa_3", "Three-Seat Sofa", "LivingRoom", 650, ALL, "Seat", v(8, 3.2, 3), gSofa(8, FABRIC_BLUE), { Icon = "🛋️" })
I("sofa_sectional", "Sectional Sofa", "LivingRoom", 1200, HOME, "Seat", v(9, 3.2, 7), join(gSofa(9, FABRIC_BEIGE), {
	part(3, 1.2, 3, -3, 0.6, -2, FABRIC_BEIGE, Mat.Fabric, { P = true }),
	part(2.6, 0.5, 2.6, -3, 1.45, -2.2, FABRIC_BEIGE, Mat.Fabric, { P = true, Seat = "Sit" }),
}), { Icon = "🛋️" })
I("armchair", "Armchair", "LivingRoom", 300, ALL, "Seat", v(3.2, 3.2, 3), gArmchair(FABRIC_RED), { Icon = "💺" })
I("beanbag", "Beanbag", "LivingRoom", 120, HOME, "Seat", v(3, 2, 3), {
	ball(3, 0, 1, 0, FABRIC_RED, Mat.Fabric, { P = true }),
	part(2, 0.3, 2, 0, 1.5, 0, FABRIC_RED, Mat.Fabric, { T = 1, Seat = "Sit" }),
}, { Icon = "🫘" })
I("ottoman", "Ottoman", "LivingRoom", 110, HOME, "Seat", v(2.5, 1.6, 2.5), {
	part(2.5, 1.6, 2.5, 0, 0.8, 0, FABRIC_BEIGE, Mat.Fabric, { P = true, Seat = "Sit" }),
}, { Icon = "🟫" })
I("coffee_table", "Coffee Table", "LivingRoom", 220, ALL, "Table", v(5, 1.6, 3), gTable(5, 3, 1.6, LIGHTWOOD, DARKWOOD), { Icon = "☕" })
I("side_table", "Side Table", "LivingRoom", 120, ALL, "Table", v(2, 2.2, 2), gTable(2, 2, 2.2, WOOD, DARKWOOD), { Icon = "🪵" })
I("tv_stand", "TV Stand", "LivingRoom", 260, HOME, "Storage", v(7, 2, 2), gCabinet(7, 2, 2, DARKWOOD), { Icon = "🗄️" })
I("bookshelf", "Bookshelf", "LivingRoom", 280, ALL, "Storage", v(4, 7, 1.5), join(gShelf(4, 7, 1.5, WOOD, 4), {
	part(3.2, 1.2, 1, 0, 0.9, -0.1, FABRIC_RED, Mat.SmoothPlastic),
	part(3.2, 1.2, 1, 0, 2.6, -0.1, FABRIC_BLUE, Mat.SmoothPlastic),
	part(3.2, 1.2, 1, 0, 4.3, -0.1, LEAF, Mat.SmoothPlastic),
}), { Icon = "📚" })
I("rug_small", "Small Rug", "LivingRoom", 90, ALL, "Decoration", v(6, 0.1, 4), gBox(6, 0.1, 4, FABRIC_RED, Mat.Fabric, { P = true, NC = true }), { Icon = "🟥" })
I("rug_large", "Large Rug", "LivingRoom", 180, ALL, "Decoration", v(10, 0.1, 8), gBox(10, 0.1, 8, FABRIC_BEIGE, Mat.Fabric, { P = true, NC = true }), { Icon = "🟧" })
I("fireplace", "Fireplace", "LivingRoom", 1400, HOUSE, "Decoration", v(6, 7, 2), {
	part(6, 7, 2, 0, 3.5, 0, rgb(150, 80, 64), Mat.Brick, { P = true }),
	part(3.6, 2.6, 0.4, 0, 1.5, -0.85, BLACK, Mat.Slate),
	part(2.4, 1, 0.6, 0, 0.8, -0.7, rgb(255, 140, 40), Mat.Neon, { NC = true, L = { Range = 16, Brightness = 2, Color = rgb(255, 150, 70) } }),
	part(6.4, 0.4, 2.4, 0, 7.2, 0, DARKWOOD, Mat.Wood),
}, { Icon = "🔥" })

---------------------------------------------------------------------------
-- Bedroom
---------------------------------------------------------------------------
I("bed_single", "Single Bed", "Bedroom", 350, HOME, "Bed", v(4, 3.5, 8), gBed(4, 8, WOOD, FABRIC_BLUE), { Icon = "🛏️" })
I("bed_double", "Double Bed", "Bedroom", 650, HOME, "Bed", v(6, 3.5, 8.5), gBed(6, 8.5, DARKWOOD, OFFWHITE), { Icon = "🛏️" })
I("bed_king", "Royal King Bed", "Bedroom", 2500, HOME, "Bed", v(8, 5, 9.5), join(gBed(8, 9.5, rgb(60, 40, 30), rgb(120, 40, 60)), {
	part(8.4, 5, 0.6, 0, 2.5, 4.5, GOLD, Mat.Metal),
}), { Icon = "👑", VipOnly = true })
I("bunk_bed", "Bunk Bed", "Kids", 700, HOME, "Bed", v(4, 7, 8), join(gBed(4, 8, WOOD, FABRIC_RED), {
	part(3.6, 0.6, 7.4, 0, 4.6, -0.2, FABRIC_BLUE, Mat.Fabric, { P = true, Seat = "Sleep" }),
	part(4, 0.6, 8, 0, 4, 0, WOOD, Mat.Wood),
	part(0.3, 7, 0.3, -1.85, 3.5, -3.85, WOOD, Mat.Wood),
	part(0.3, 7, 0.3, 1.85, 3.5, -3.85, WOOD, Mat.Wood),
}), { Icon = "🛏️" })
I("nightstand", "Nightstand", "Bedroom", 140, HOME, "Storage", v(2, 2.2, 2), gCabinet(2, 2.2, 2, WOOD), { Icon = "🗄️" })
I("dresser", "Dresser", "Bedroom", 320, HOME, "Storage", v(5, 3.5, 2), gCabinet(5, 3.5, 2, LIGHTWOOD), { Icon = "🗄️" })
I("wardrobe", "Wardrobe", "Bedroom", 480, HOME, "Storage", v(5, 8, 2.4), gCabinet(5, 8, 2.4, DARKWOOD), { Icon = "🚪" })
I("vanity", "Vanity Desk", "Bedroom", 380, HOME, "Desk", v(4, 6, 2), join(gTable(4, 2, 2.8, WHITE, WHITE), {
	part(3, 3, 0.2, 0, 4.4, 0.9, GLASS, Mat.Glass, { T = 0.2 }),
}), { Icon = "💄" })
I("mirror_standing", "Standing Mirror", "Bedroom", 160, ALL, "Decoration", v(2.4, 6, 0.6), {
	part(2.4, 6, 0.3, 0, 3, 0, GOLD, Mat.Metal, { P = true }),
	part(2, 5.6, 0.32, 0, 3, -0.02, GLASS, Mat.Glass, { T = 0.1 }),
}, { Icon = "🪞" })

---------------------------------------------------------------------------
-- Kitchen
---------------------------------------------------------------------------
I("fridge", "Fridge", "Kitchen", 900, ALL, "Fridge", v(3, 7, 3), join(gBox(3, 7, 3, WHITE, Mat.Metal), {
	part(0.2, 2.5, 0.2, 1.1, 5, -1.6, STEEL, Mat.Metal),
	part(0.2, 1.5, 0.2, 1.1, 2.2, -1.6, STEEL, Mat.Metal),
	part(3, 0.1, 0.1, 0, 3.6, -1.55, GREY, Mat.Metal),
}), { Icon = "🧊" })
I("stove", "Stove", "Kitchen", 750, HOME, "Stove", v(3, 3.5, 2.5), {
	part(3, 3.2, 2.5, 0, 1.6, 0, WHITE, Mat.Metal, { P = true }),
	part(3, 0.3, 2.5, 0, 3.35, 0, BLACK, Mat.Slate),
	cyl(0.1, 0.8, -0.7, 3.55, -0.5, DARKGREY, Mat.Metal),
	cyl(0.1, 0.8, 0.7, 3.55, -0.5, DARKGREY, Mat.Metal),
	cyl(0.1, 0.8, -0.7, 3.55, 0.6, DARKGREY, Mat.Metal),
	cyl(0.1, 0.8, 0.7, 3.55, 0.6, DARKGREY, Mat.Metal),
	part(2.4, 1.4, 0.1, 0, 1.4, -1.27, BLACK, Mat.Glass, { T = 0.2 }),
}, { Icon = "🍳" })
I("counter", "Kitchen Counter", "Kitchen", 260, ALL, "Storage", v(4, 3.5, 2.6), gCounter(4, WHITE, rgb(200, 200, 204)), { Icon = "🟫" })
I("counter_long", "Long Counter", "Kitchen", 480, ALL, "Storage", v(8, 3.5, 2.6), gCounter(8, WHITE, rgb(200, 200, 204)), { Icon = "🟫" })
I("sink_kitchen", "Kitchen Sink", "Kitchen", 420, ALL, "Sink", v(4, 4.6, 2.6), join(gCounter(4, WHITE, rgb(200, 200, 204)), {
	part(2.4, 0.1, 1.6, 0, 3.52, 0, STEEL, Mat.Metal),
	part(0.2, 1.2, 0.2, 0, 4.0, 0.9, STEEL, Mat.Metal),
	part(0.2, 0.2, 0.8, 0, 4.5, 0.6, STEEL, Mat.Metal),
}), { Icon = "🚰" })
I("kitchen_island", "Kitchen Island", "Kitchen", 900, HOME, "Table", v(8, 3.5, 4), {
	part(7.6, 3.2, 3.6, 0, 1.6, 0, DARKWOOD, Mat.Wood, { P = true }),
	part(8, 0.3, 4, 0, 3.35, 0, rgb(236, 236, 240), Mat.Marble),
}, { Icon = "🏝️" })
I("dining_table_4", "Dining Table (4)", "Kitchen", 400, ALL, "Table", v(6, 3, 4), gTable(6, 4, 3, WOOD, DARKWOOD), { Icon = "🍽️" })
I("dining_table_6", "Dining Table (6)", "Kitchen", 620, ALL, "Table", v(9, 3, 4.5), gTable(9, 4.5, 3, DARKWOOD, DARKWOOD), { Icon = "🍽️" })
I("dining_chair", "Dining Chair", "Kitchen", 120, ALL, "Seat", v(2, 4.2, 2), gChair(FABRIC_BEIGE, WOOD), { Icon = "🪑" })
I("bar_stool", "Bar Stool", "Kitchen", 110, ALL, "Seat", v(1.8, 3.4, 1.8), gStool(BLACK, STEEL, 3.4), { Icon = "🪑" })
I("microwave", "Microwave", "Kitchen", 180, ALL, "Decoration", v(1.8, 1.1, 1.3), {
	part(1.8, 1.1, 1.3, 0, 0.55, 0, BLACK, Mat.Metal, { P = true }),
	part(1.1, 0.8, 0.05, -0.25, 0.55, -0.66, DARKGREY, Mat.Glass, { T = 0.3 }),
}, { Icon = "📦" })
I("dishwasher", "Dishwasher", "Kitchen", 520, HOME, "Sink", v(2.5, 3.5, 2.6), join(gBox(2.5, 3.5, 2.6, STEEL, Mat.Metal), {
	part(2, 0.15, 0.15, 0, 3.1, -1.35, DARKGREY, Mat.Metal),
}), { Icon = "🍽️" })
I("coffee_machine", "Coffee Machine", "Kitchen", 240, ALL, "Decoration", v(1.2, 1.6, 1.2), {
	part(1.2, 1.6, 1.2, 0, 0.8, 0, BLACK, Mat.Metal, { P = true }),
	cyl(0.4, 0.4, 0, 0.3, -0.4, WHITE, Mat.SmoothPlastic),
}, { Icon = "☕" })

---------------------------------------------------------------------------
-- Bathroom
---------------------------------------------------------------------------
I("toilet", "Toilet", "Bathroom", 280, ALL, "Toilet", v(2, 3, 3), {
	part(1.8, 1.4, 2, 0, 0.7, -0.3, WHITE, Mat.SmoothPlastic, { P = true }),
	part(1.8, 0.2, 2, 0, 1.5, -0.3, WHITE, Mat.SmoothPlastic, { Seat = "Sit", N = "Seat" }),
	part(2, 1.8, 0.8, 0, 2.1, 1.1, WHITE, Mat.SmoothPlastic, { P = true }),
}, { Icon = "🚽" })
I("shower", "Shower", "Bathroom", 700, ALL, "Shower", v(4, 8, 4), {
	part(4, 0.3, 4, 0, 0.15, 0, WHITE, Mat.SmoothPlastic, { P = true }),
	part(4, 7.6, 0.15, 0, 4.1, -1.9, GLASS, Mat.Glass, { T = 0.6 }),
	part(0.15, 7.6, 4, -1.9, 4.1, 0, GLASS, Mat.Glass, { T = 0.6 }),
	part(0.15, 7.6, 4, 1.9, 4.1, 0, WHITE, Mat.SmoothPlastic, { P = true }),
	part(4, 7.6, 0.15, 0, 4.1, 1.9, WHITE, Mat.SmoothPlastic, { P = true }),
	cyl(0.2, 0.8, 0, 7, 1.4, STEEL, Mat.Metal),
}, { Icon = "🚿" })
I("bathtub", "Bathtub", "Bathroom", 850, HOME, "Shower", v(6, 2.4, 3.2), {
	part(6, 2.2, 3.2, 0, 1.1, 0, WHITE, Mat.SmoothPlastic, { P = true }),
	part(5.2, 0.2, 2.4, 0, 2.0, 0, WATER, Mat.Glass, { T = 0.35, NC = true }),
	part(5, 0.3, 2.2, 0, 1.0, 0, WHITE, Mat.SmoothPlastic, { T = 1, Seat = "Sit" }),
}, { Icon = "🛁" })
I("sink_bath", "Bathroom Sink", "Bathroom", 260, ALL, "Sink", v(2.6, 3.6, 1.8), {
	cyl(2.6, 0.7, 0, 1.3, 0.2, WHITE, Mat.SmoothPlastic),
	part(2.6, 0.6, 1.8, 0, 2.9, 0, WHITE, Mat.SmoothPlastic, { P = true }),
	part(0.2, 0.6, 0.2, 0, 3.3, 0.7, STEEL, Mat.Metal),
}, { Icon = "🚰" })
I("bath_cabinet", "Bathroom Cabinet", "Bathroom", 200, ALL, "Storage", v(2.6, 3, 0.8), join(gCabinet(2.6, 3, 0.8, WHITE), {
	part(2.2, 2.4, 0.05, 0, 1.5, -0.42, GLASS, Mat.Glass, { T = 0.1 }),
}), { Icon = "🪞", Mount = "Wall" })
I("towel_rack", "Towel Rack", "Bathroom", 70, ALL, "Decoration", v(2.4, 1.6, 0.5), {
	part(2.4, 0.15, 0.15, 0, 1.4, 0, STEEL, Mat.Metal),
	part(2, 1.4, 0.15, 0, 0.8, -0.1, FABRIC_BLUE, Mat.Fabric, { P = true }),
}, { Icon = "🧺", Mount = "Wall" })
I("hot_tub", "Hot Tub", "Bathroom", 3200, HOUSE, "Seat", v(7, 2.8, 7), {
	part(7, 2.6, 7, 0, 1.3, 0, DARKWOOD, Mat.Wood, { P = true }),
	part(6, 0.2, 6, 0, 2.5, 0, WATER, Mat.Glass, { T = 0.3, NC = true, L = { Range = 10, Brightness = 1, Color = NEON_BLUE } }),
	part(2, 0.3, 2, -2, 1.6, -2, WHITE, Mat.SmoothPlastic, { T = 1, Seat = "Sit" }),
	part(2, 0.3, 2, 2, 1.6, -2, WHITE, Mat.SmoothPlastic, { T = 1, Seat = "Sit" }),
	part(2, 0.3, 2, -2, 1.6, 2, WHITE, Mat.SmoothPlastic, { T = 1, Seat = "Sit" }),
	part(2, 0.3, 2, 2, 1.6, 2, WHITE, Mat.SmoothPlastic, { T = 1, Seat = "Sit" }),
}, { Icon = "♨️", VipOnly = true })

---------------------------------------------------------------------------
-- Office (home)
---------------------------------------------------------------------------
I("office_desk", "Office Desk", "Office", 380, ALL, "Desk", v(6, 3, 3), join(gTable(6, 3, 3, LIGHTWOOD, DARKGREY), {
	part(1.8, 2.4, 2.6, 2, 1.3, 0, DARKGREY, Mat.Wood),
}), { Icon = "🗃️" })
I("office_chair", "Office Chair", "Office", 220, ALL, "Seat", v(2.2, 4.4, 2.2), {
	cyl(0.2, 2, 0, 0.1, 0, BLACK, Mat.Metal),
	cyl(1.6, 0.3, 0, 1, 0, BLACK, Mat.Metal),
	part(2.2, 0.4, 2.2, 0, 2, 0, BLACK, Mat.Fabric, { P = true, Seat = "Sit", N = "Seat" }),
	part(2.2, 2.2, 0.3, 0, 3.3, 0.95, BLACK, Mat.Fabric, { P = true }),
}, { Icon = "💺" })
I("filing_cabinet", "Filing Cabinet", "Office", 180, ALL, "Storage", v(2, 4, 2.4), gCabinet(2, 4, 2.4, GREY), { Icon = "🗄️" })
I("office_bookcase", "Office Bookcase", "Office", 300, ALL, "Storage", v(6, 6, 1.5), gShelf(6, 6, 1.5, DARKWOOD, 3), { Icon = "📚" })
I("whiteboard", "Whiteboard", "Office", 150, ALL, "Decoration", v(6, 4, 0.3), {
	part(6, 4, 0.2, 0, 2, 0, STEEL, Mat.Metal),
	part(5.7, 3.7, 0.05, 0, 2, -0.12, WHITE, Mat.SmoothPlastic),
}, { Icon = "📋", Mount = "Wall" })

---------------------------------------------------------------------------
-- Outdoor & Garden
---------------------------------------------------------------------------
I("tree_oak", "Oak Tree", "Outdoor", 300, HB, "Plant", v(8, 14, 8), gTree(14, 8, DARKWOOD, LEAF), { Icon = "🌳", Paintable = false })
I("tree_pine", "Pine Tree", "Outdoor", 280, HB, "Plant", v(6, 16, 6), {
	cyl(6, 1, 0, 3, 0, DARKWOOD, Mat.Wood),
	part(6, 8, 6, 0, 8, 0, LEAF_DARK, Mat.Grass, { Sh = "Ball", NC = true }),
	part(4, 6, 4, 0, 12.5, 0, LEAF_DARK, Mat.Grass, { Sh = "Ball", NC = true }),
}, { Icon = "🌲", Paintable = false })
I("tree_palm", "Palm Tree", "Outdoor", 340, HB, "Plant", v(8, 14, 8), gPalm(13), { Icon = "🌴", Paintable = false })
I("bush", "Bush", "Outdoor", 60, HB, "Plant", v(3, 2.5, 3), { ball(3, 0, 1.25, 0, LEAF, Mat.Grass, { NC = true }) }, { Icon = "🌿", Paintable = false })
I("hedge_8", "Hedge (8)", "Outdoor", 140, HB, "Plant", v(8, 3.5, 2), gBox(8, 3.5, 2, LEAF_DARK, Mat.Grass, { P = false }), { Icon = "🌿", Paintable = false })
I("flower_bed", "Flower Bed", "Outdoor", 120, HB, "Plant", v(6, 1.4, 2.4), {
	part(6, 1, 2.4, 0, 0.5, 0, DARKWOOD, Mat.Wood, { P = true }),
	part(5.6, 0.4, 2, 0, 1.1, 0, rgb(250, 120, 160), Mat.Grass, { NC = true }),
}, { Icon = "🌷" })
I("grass_patch", "Grass Patch (8)", "Outdoor", 25, HB, "Decoration", v(8, 0.2, 8), gBox(8, 0.2, 8, rgb(80, 150, 70), Mat.Grass), { Icon = "🟩" })
I("path_stone", "Stone Path (4)", "Outdoor", 30, HB, "Decoration", v(4, 0.2, 4), gBox(4, 0.2, 4, GREY, Mat.Cobblestone), { Icon = "🪨" })
I("picnic_table", "Picnic Table", "Outdoor", 350, HB, "Table", v(6, 3, 6), join(gTable(6, 3, 3, WOOD, WOOD), {
	part(6, 0.4, 1.2, 0, 1.6, -2.4, WOOD, Mat.Wood, { Seat = "Sit" }),
	part(6, 0.4, 1.2, 0, 1.6, 2.4, WOOD, Mat.Wood, { Seat = "Sit", R = v(0, 180, 0) }),
}), { Icon = "🧺" })
I("bench_park", "Park Bench", "Outdoor", 200, HB, "Seat", v(6, 3.2, 2), {
	part(6, 0.3, 1.8, 0, 1.6, 0, WOOD, Mat.Wood, { P = true, Seat = "Sit" }),
	part(6, 1.4, 0.2, 0, 2.6, 0.8, WOOD, Mat.Wood, { P = true }),
	part(0.3, 1.6, 1.8, -2.6, 0.8, 0, BLACK, Mat.Metal),
	part(0.3, 1.6, 1.8, 2.6, 0.8, 0, BLACK, Mat.Metal),
}, { Icon = "🪑" })
I("grill_bbq", "BBQ Grill", "Outdoor", 450, HB, "Stove", v(3, 4, 2), {
	part(3, 1.4, 2, 0, 3, 0, BLACK, Mat.Metal, { P = true }),
	part(0.3, 2.3, 0.3, -1.2, 1.15, -0.7, BLACK, Mat.Metal),
	part(0.3, 2.3, 0.3, 1.2, 1.15, -0.7, BLACK, Mat.Metal),
	part(0.3, 2.3, 0.3, -1.2, 1.15, 0.7, BLACK, Mat.Metal),
	part(0.3, 2.3, 0.3, 1.2, 1.15, 0.7, BLACK, Mat.Metal),
	part(2.6, 0.1, 1.6, 0, 3.75, 0, rgb(255, 90, 30), Mat.Neon, { NC = true }),
}, { Icon = "🍖" })
I("pool_small", "Small Pool", "Outdoor", 2500, HOUSE, "Decoration", v(12, 2, 8), {
	part(12, 2, 0.6, 0, 1, -3.7, WHITE, Mat.Concrete, { P = true }),
	part(12, 2, 0.6, 0, 1, 3.7, WHITE, Mat.Concrete, { P = true }),
	part(0.6, 2, 8, -5.7, 1, 0, WHITE, Mat.Concrete, { P = true }),
	part(0.6, 2, 8, 5.7, 1, 0, WHITE, Mat.Concrete, { P = true }),
	part(10.8, 0.2, 6.8, 0, 0.1, 0, rgb(80, 160, 210), Mat.SmoothPlastic),
	part(10.8, 1.5, 6.8, 0, 1, 0, WATER, Mat.Glass, { T = 0.4, NC = true }),
}, { Icon = "🏊" })
I("pool_large", "Infinity Pool", "Outdoor", 7500, HOUSE, "Decoration", v(24, 2, 12), {
	part(24, 2, 0.6, 0, 1, -5.7, rgb(230, 230, 236), Mat.Marble, { P = true }),
	part(24, 2, 0.6, 0, 1, 5.7, rgb(230, 230, 236), Mat.Marble, { P = true }),
	part(0.6, 2, 12, -11.7, 1, 0, rgb(230, 230, 236), Mat.Marble, { P = true }),
	part(0.6, 2, 12, 11.7, 1, 0, rgb(230, 230, 236), Mat.Marble, { P = true }),
	part(22.8, 0.2, 10.8, 0, 0.1, 0, rgb(60, 150, 210), Mat.SmoothPlastic),
	part(22.8, 1.5, 10.8, 0, 1, 0, WATER, Mat.Glass, { T = 0.35, NC = true, L = { Range = 16, Brightness = 0.8, Color = NEON_BLUE } }),
}, { Icon = "🏝️", VipOnly = true })
I("lamp_post", "Garden Lamp Post", "Outdoor", 260, HB, "Light", v(1.4, 9, 1.4), {
	cyl(0.4, 1.4, 0, 0.2, 0, BLACK, Mat.Metal),
	cyl(8, 0.4, 0, 4.2, 0, BLACK, Mat.Metal),
	part(1.2, 1.2, 1.2, 0, 8.4, 0, WARM, Mat.Neon, { NC = true, L = { Range = 24, Brightness = 1.6, Color = WARM } }),
}, { Icon = "🏮" })
I("mailbox", "Mailbox", "Outdoor", 90, HB, "Decoration", v(1.4, 4, 2), {
	part(0.3, 3, 0.3, 0, 1.5, 0, WOOD, Mat.Wood),
	part(1.2, 1, 2, 0, 3.4, 0, rgb(60, 90, 160), Mat.Metal, { P = true }),
}, { Icon = "📫" })
I("sun_lounger", "Sun Lounger", "Outdoor", 220, HB, "Seat", v(2.4, 2.4, 6), {
	part(2.4, 0.4, 6, 0, 1.2, 0, WHITE, Mat.SmoothPlastic, { P = true, Seat = "Sleep" }),
	part(2.4, 0.3, 2, 0, 1.8, 2.3, WHITE, Mat.SmoothPlastic, { R = v(-30, 0, 0) }),
	part(2.4, 1, 0.3, 0, 0.5, -2.7, GREY, Mat.Metal),
	part(2.4, 1, 0.3, 0, 0.5, 2.7, GREY, Mat.Metal),
}, { Icon = "🏖️" })
I("umbrella_patio", "Patio Umbrella", "Outdoor", 180, HB, "Decoration", v(7, 8, 7), {
	cyl(0.3, 2, 0, 0.15, 0, GREY, Mat.Metal),
	cyl(7.6, 0.3, 0, 3.8, 0, GREY, Mat.Metal),
	cyl(0.6, 7, 0, 7.6, 0, FABRIC_RED, Mat.Fabric, { P = true, NC = true }),
}, { Icon = "⛱️" })

---------------------------------------------------------------------------
-- Lighting
---------------------------------------------------------------------------
I("lamp_floor", "Floor Lamp", "Lighting", 180, ALL, "Light", v(1.6, 6.2, 1.6), gLampFloor(OFFWHITE), { Icon = "💡" })
I("lamp_table", "Table Lamp", "Lighting", 90, ALL, "Light", v(1.2, 1.9, 1.2), gLampTable(FABRIC_BLUE), { Icon = "💡" })
I("light_ceiling", "Ceiling Light", "Lighting", 120, ALL, "Light", v(2.4, 0.6, 2.4), {
	cyl(0.2, 2.4, 0, 0.5, 0, WHITE, Mat.SmoothPlastic, { P = true }),
	cyl(0.4, 2, 0, 0.2, 0, WARM, Mat.Neon, { NC = true, L = { Range = 22, Brightness = 1.5, Color = WARM } }),
}, { Icon = "🔆", Mount = "Ceiling" })
I("light_wall", "Wall Sconce", "Lighting", 100, ALL, "Light", v(1, 1.6, 0.8), {
	part(0.8, 1.4, 0.2, 0, 0.8, 0.3, GOLD, Mat.Metal, { P = true }),
	ball(0.7, 0, 1, -0.1, WARM, Mat.Neon, { NC = true, L = { Range = 14, Brightness = 1.1, Color = WARM } }),
}, { Icon = "🕯️", Mount = "Wall" })
I("chandelier", "Crystal Chandelier", "Lighting", 2200, HOME, "Light", v(5, 4, 5), {
	cyl(1.6, 0.2, 0, 3.2, 0, GOLD, Mat.Metal),
	cyl(0.4, 4.4, 0, 1.6, 0, GOLD, Mat.Metal),
	ball(1.4, 0, 1.2, 0, rgb(230, 240, 255), Mat.Glass, { T = 0.2, NC = true, L = { Range = 30, Brightness = 2, Color = rgb(255, 236, 210) } }),
	ball(0.6, -1.8, 1, 0, rgb(230, 240, 255), Mat.Neon, { NC = true }),
	ball(0.6, 1.8, 1, 0, rgb(230, 240, 255), Mat.Neon, { NC = true }),
	ball(0.6, 0, 1, -1.8, rgb(230, 240, 255), Mat.Neon, { NC = true }),
	ball(0.6, 0, 1, 1.8, rgb(230, 240, 255), Mat.Neon, { NC = true }),
}, { Icon = "✨", Mount = "Ceiling", VipOnly = true })
I("neon_strip", "Neon Light Strip", "Lighting", 150, ALL, "Light", v(6, 0.3, 0.3), {
	part(6, 0.3, 0.3, 0, 0.15, 0, NEON_PINK, Mat.Neon, { P = true, NC = true, L = { Range = 12, Brightness = 1.2, Color = NEON_PINK } }),
}, { Icon = "🌈", Mount = "Wall" })
I("lantern", "Lantern", "Lighting", 70, ALL, "Light", v(1, 1.6, 1), {
	part(1, 0.2, 1, 0, 0.1, 0, BLACK, Mat.Metal),
	part(0.8, 1.1, 0.8, 0, 0.75, 0, WARM, Mat.Glass, { T = 0.3, L = { Range = 10, Brightness = 1, Color = WARM } }),
	part(1, 0.3, 1, 0, 1.45, 0, BLACK, Mat.Metal),
}, { Icon = "🏮" })

---------------------------------------------------------------------------
-- Electronics
---------------------------------------------------------------------------
I("tv_small", "32\" TV", "Electronics", 400, ALL, "TV", v(4, 3, 1.2), gTV(4, 2.5, 0.5), { Icon = "📺", Paintable = false })
I("tv_large", "75\" TV", "Electronics", 1500, ALL, "TV", v(8, 5, 1.2), gTV(8, 4.4, 0.6), { Icon = "📺", Paintable = false })
I("tv_wall", "Wall-Mounted TV", "Electronics", 1800, ALL, "TV", v(7, 4, 0.4), {
	part(7, 4, 0.3, 0, 2, 0, BLACK, Mat.Glass),
	part(7.2, 4.2, 0.2, 0, 2, 0.15, DARKGREY, Mat.SmoothPlastic),
}, { Icon = "🖥️", Mount = "Wall", Paintable = false })
I("computer_pc", "Gaming PC", "Electronics", 1200, ALL, "Computer", v(3, 2, 1.6), {
	part(2, 1.3, 0.2, -0.3, 1.0, 0.4, BLACK, Mat.Glass),
	part(0.2, 0.4, 0.2, -0.3, 0.2, 0.4, DARKGREY, Mat.Metal),
	part(1.6, 0.1, 0.5, -0.3, 0.05, -0.4, DARKGREY, Mat.SmoothPlastic),
	part(0.7, 1.6, 1.4, 1.1, 0.8, 0, BLACK, Mat.Metal, { P = true }),
	part(0.05, 1.2, 1, 0.73, 0.8, 0, NEON_BLUE, Mat.Neon, { NC = true }),
}, { Icon = "🖥️" })
I("laptop", "Laptop", "Electronics", 600, ALL, "Computer", v(1.4, 0.9, 1.2), {
	part(1.4, 0.06, 1, 0, 0.03, -0.1, STEEL, Mat.Metal, { P = true }),
	part(1.4, 0.9, 0.06, 0, 0.45, 0.45, STEEL, Mat.Metal, { R = v(-10, 0, 0) }),
}, { Icon = "💻" })
I("game_console", "Game Console", "Electronics", 450, HOME, "Decoration", v(1.4, 0.4, 1), {
	part(1.4, 0.3, 1, 0, 0.15, 0, WHITE, Mat.SmoothPlastic, { P = true }),
	part(0.6, 0.1, 0.4, 0, 0.35, -0.2, BLACK, Mat.SmoothPlastic),
}, { Icon = "🎮" })
I("speaker_home", "Home Speaker", "Electronics", 320, ALL, "Decoration", v(1.4, 3.4, 1.4), {
	part(1.4, 3.4, 1.4, 0, 1.7, 0, BLACK, Mat.SmoothPlastic, { P = true }),
	cyl(0.1, 0.9, 0, 2.5, -0.71, DARKGREY, Mat.Metal, { R = v(0, 90, 0) }),
	cyl(0.1, 1.1, 0, 1.2, -0.71, DARKGREY, Mat.Metal, { R = v(0, 90, 0) }),
}, { Icon = "🔊" })
I("radio", "Retro Radio", "Electronics", 140, ALL, "Decoration", v(1.6, 1, 0.8), {
	part(1.6, 1, 0.8, 0, 0.5, 0, rgb(170, 100, 70), Mat.Wood, { P = true }),
	part(0.7, 0.6, 0.05, -0.35, 0.5, -0.42, DARKGREY, Mat.Fabric),
}, { Icon = "📻" })

---------------------------------------------------------------------------
-- Decor
---------------------------------------------------------------------------
I("plant_potted", "Potted Plant", "Decor", 80, ALL, "Plant", v(2, 3, 2), gPlant(TERRACOTTA, LEAF, 3, 2), { Icon = "🪴" })
I("plant_tall", "Tall Plant", "Decor", 140, ALL, "Plant", v(2.6, 6, 2.6), gPlant(WHITE, LEAF_DARK, 6, 2.6), { Icon = "🌿" })
I("cactus", "Cactus", "Decor", 60, ALL, "Plant", v(1.2, 2.6, 1.2), {
	cyl(0.8, 1.2, 0, 0.4, 0, TERRACOTTA, Mat.SmoothPlastic, { P = true }),
	cyl(1.8, 0.6, 0, 1.7, 0, LEAF, Mat.Grass),
}, { Icon = "🌵" })
I("painting_landscape", "Landscape Painting", "Decor", 200, ALL, "Decoration", v(5, 3.2, 0.3), gPainting(5, 3.2, rgb(110, 170, 210)), { Icon = "🖼️", Mount = "Wall" })
I("painting_abstract", "Abstract Painting", "Decor", 260, ALL, "Decoration", v(3.2, 4, 0.3), gPainting(3.2, 4, rgb(230, 120, 80)), { Icon = "🎨", Mount = "Wall" })
I("poster", "Movie Poster", "Decor", 60, ALL, "Decoration", v(2.4, 3.4, 0.1), gBox(2.4, 3.4, 0.08, rgb(40, 40, 90), Mat.SmoothPlastic), { Icon = "🎬", Mount = "Wall" })
I("clock_wall", "Wall Clock", "Decor", 80, ALL, "Decoration", v(1.8, 1.8, 0.3), {
	part(0.2, 1.8, 1.8, 0, 0.9, 0, WHITE, Mat.SmoothPlastic, { Sh = "Cylinder", R = v(0, 90, 0), P = true }),
	part(0.08, 0.7, 0.1, 0, 1.15, -0.15, BLACK, Mat.SmoothPlastic),
	part(0.5, 0.08, 0.1, 0.2, 0.9, -0.15, BLACK, Mat.SmoothPlastic),
}, { Icon = "🕒", Mount = "Wall" })
I("vase", "Vase", "Decor", 70, ALL, "Decoration", v(1, 2, 1), {
	cyl(1.6, 1, 0, 0.8, 0, rgb(60, 110, 160), Mat.Glass, { P = true }),
	ball(0.9, 0, 1.9, 0, rgb(240, 90, 120), Mat.Grass, { NC = true }),
}, { Icon = "🏺" })
I("sculpture_gold", "Golden Sculpture", "Decor", 5000, ALL, "Decoration", v(2, 5, 2), {
	part(2, 1.4, 2, 0, 0.7, 0, BLACK, Mat.Marble),
	ball(1.6, 0, 2.3, 0, GOLD, Mat.Foil),
	part(0.6, 1.8, 0.6, 0, 3.9, 0, GOLD, Mat.Foil, { R = v(0, 45, 20) }),
}, { Icon = "🏆", VipOnly = true, Paintable = false })
I("aquarium", "Aquarium", "Decor", 900, ALL, "Decoration", v(5, 4.4, 2), {
	part(5, 1.6, 2, 0, 0.8, 0, DARKWOOD, Mat.Wood, { P = true }),
	part(4.8, 2.6, 1.8, 0, 2.9, 0, WATER, Mat.Glass, { T = 0.5, L = { Range = 8, Brightness = 0.8, Color = NEON_BLUE } }),
	part(0.6, 0.4, 0.1, -0.8, 3, 0, rgb(255, 140, 40), Mat.SmoothPlastic, { NC = true }),
	part(0.5, 0.3, 0.1, 1, 2.5, 0.3, rgb(255, 220, 60), Mat.SmoothPlastic, { NC = true }),
}, { Icon = "🐠" })
I("trophy", "Trophy", "Decor", 150, ALL, "Decoration", v(0.8, 1.6, 0.8), {
	part(0.8, 0.4, 0.8, 0, 0.2, 0, BLACK, Mat.Marble),
	cyl(1.2, 0.6, 0, 1, 0, GOLD, Mat.Metal),
}, { Icon = "🏆", Paintable = false })
I("globe", "Desk Globe", "Decor", 90, ALL, "Decoration", v(1.2, 1.8, 1.2), {
	cyl(0.2, 0.9, 0, 0.1, 0, DARKWOOD, Mat.Wood),
	ball(1.2, 0, 1.2, 0, rgb(70, 140, 200), Mat.SmoothPlastic, { P = true }),
}, { Icon = "🌍" })
I("candles", "Candle Set", "Decor", 45, ALL, "Light", v(1.2, 0.9, 0.6), {
	cyl(0.6, 0.3, -0.35, 0.3, 0, WHITE, Mat.SmoothPlastic),
	cyl(0.8, 0.3, 0, 0.4, 0, WHITE, Mat.SmoothPlastic),
	cyl(0.5, 0.3, 0.35, 0.25, 0, WHITE, Mat.SmoothPlastic),
	ball(0.15, 0, 0.88, 0, rgb(255, 170, 60), Mat.Neon, { NC = true, L = { Range = 6, Brightness = 0.7, Color = rgb(255, 170, 80) } }),
}, { Icon = "🕯️", Paintable = false })
I("bookstack", "Book Stack", "Decor", 35, ALL, "Decoration", v(1.2, 0.8, 0.9), {
	part(1.2, 0.25, 0.9, 0, 0.125, 0, FABRIC_RED, Mat.SmoothPlastic),
	part(1.1, 0.25, 0.85, 0.05, 0.375, 0, FABRIC_BLUE, Mat.SmoothPlastic, { R = v(0, 8, 0) }),
	part(1.0, 0.25, 0.8, 0, 0.625, 0, LEAF, Mat.SmoothPlastic, { R = v(0, -6, 0) }),
}, { Icon = "📚", Paintable = false })

---------------------------------------------------------------------------
-- Gym
---------------------------------------------------------------------------
I("treadmill", "Treadmill", "Gym", 1100, ALL, "Gym", v(3, 4.6, 7), {
	part(3, 0.8, 7, 0, 0.4, 0, BLACK, Mat.Metal),
	part(2.4, 0.1, 6, 0, 0.85, 0.2, DARKGREY, Mat.Fabric),
	part(0.3, 3.8, 0.3, -1.3, 2.7, -3.2, GREY, Mat.Metal),
	part(0.3, 3.8, 0.3, 1.3, 2.7, -3.2, GREY, Mat.Metal),
	part(3, 0.8, 0.6, 0, 4.4, -3.2, BLACK, Mat.SmoothPlastic, { P = true }),
}, { Icon = "🏃" })
I("bench_press", "Bench Press", "Gym", 800, ALL, "Gym", v(6, 4.6, 6), {
	part(1.6, 0.5, 5, 0, 1.6, 0, BLACK, Mat.Fabric, { P = true, Seat = "Sleep" }),
	part(0.4, 1.4, 0.4, 0, 0.7, 0, GREY, Mat.Metal),
	part(0.3, 4.4, 0.3, -1.4, 2.2, 2.2, GREY, Mat.Metal),
	part(0.3, 4.4, 0.3, 1.4, 2.2, 2.2, GREY, Mat.Metal),
	cyl(6, 0.25, 0, 4.2, 2.2, STEEL, Mat.Metal, { R = v(0, 0, 0) }),
	cyl(0.4, 1.8, -2.6, 4.2, 2.2, BLACK, Mat.Metal, { R = v(0, 0, 0) }),
	cyl(0.4, 1.8, 2.6, 4.2, 2.2, BLACK, Mat.Metal, { R = v(0, 0, 0) }),
}, { Icon = "🏋️" })
I("dumbbell_rack", "Dumbbell Rack", "Gym", 500, ALL, "Gym", v(5, 3, 1.8), join(gTable(5, 1.8, 2.6, DARKGREY, DARKGREY), {
	part(4.4, 0.6, 0.6, 0, 2.9, -0.3, BLACK, Mat.Metal),
}), { Icon = "💪" })
I("yoga_mat", "Yoga Mat", "Gym", 60, ALL, "Gym", v(2.4, 0.1, 6), gBox(2.4, 0.1, 6, rgb(130, 90, 200), Mat.Fabric, { P = true, NC = true }), { Icon = "🧘" })
I("punching_bag", "Punching Bag", "Gym", 380, ALL, "Gym", v(3, 8, 3), {
	part(3, 0.4, 3, 0, 0.2, 0, BLACK, Mat.Metal),
	part(0.3, 7.8, 0.3, -1.2, 3.9, 0, GREY, Mat.Metal),
	part(1.8, 0.3, 0.3, -0.3, 7.7, 0, GREY, Mat.Metal),
	cyl(3.6, 1.6, 0.4, 5.2, 0, FABRIC_RED, Mat.Fabric, { P = true }),
}, { Icon = "🥊" })
I("exercise_bike", "Exercise Bike", "Gym", 700, ALL, "Gym", v(2, 4.4, 4.4), {
	part(1, 0.6, 4.4, 0, 0.3, 0, BLACK, Mat.Metal),
	part(0.4, 3, 0.4, 0, 1.8, 1, GREY, Mat.Metal),
	part(1.4, 0.4, 1.6, 0, 3.4, 1.2, BLACK, Mat.Fabric, { P = true, Seat = "Sit" }),
	part(0.4, 3.6, 0.4, 0, 2.1, -1.6, GREY, Mat.Metal),
	part(2, 0.3, 0.3, 0, 4.1, -1.6, BLACK, Mat.Metal),
}, { Icon = "🚴" })

---------------------------------------------------------------------------
-- Party
---------------------------------------------------------------------------
I("disco_ball", "Disco Ball", "Party", 600, ALL, "Light", v(2, 3, 2), {
	cyl(1, 0.15, 0, 2.5, 0, STEEL, Mat.Metal),
	ball(2, 0, 1, 0, STEEL, Mat.Foil, { NC = true, L = { Range = 26, Brightness = 1.6, Color = NEON_PINK } }),
}, { Icon = "🪩", Mount = "Ceiling", Paintable = false })
I("balloons", "Balloon Bunch", "Party", 50, ALL, "Decoration", v(3, 6, 3), {
	cyl(0.4, 0.8, 0, 0.2, 0, GREY, Mat.Metal),
	ball(1.4, -0.6, 5, 0, rgb(255, 80, 100), Mat.SmoothPlastic, { NC = true }),
	ball(1.4, 0.6, 5.2, 0.3, rgb(80, 180, 255), Mat.SmoothPlastic, { NC = true }),
	ball(1.4, 0, 4.4, -0.6, rgb(255, 220, 70), Mat.SmoothPlastic, { NC = true }),
	part(0.05, 4, 0.05, 0, 2.4, 0, WHITE, Mat.SmoothPlastic, { NC = true }),
}, { Icon = "🎈", Paintable = false })
I("party_table", "Party Snack Table", "Party", 300, ALL, "Table", v(6, 3.6, 3), join(gTable(6, 3, 3, WHITE, STEEL), {
	cyl(0.6, 1.4, -1.6, 3.3, 0, rgb(250, 160, 80), Mat.SmoothPlastic),
	cyl(0.9, 1.6, 0.8, 3.45, 0, rgb(240, 90, 120), Mat.SmoothPlastic),
}), { Icon = "🎂" })
I("karaoke", "Karaoke Machine", "Party", 850, ALL, "Decoration", v(3, 5.4, 2), {
	part(3, 3, 2, 0, 1.5, 0, BLACK, Mat.SmoothPlastic, { P = true }),
	part(2.6, 1.6, 0.2, 0, 3.8, 0.5, NEON_BLUE, Mat.Neon, { NC = true }),
	cyl(1.4, 0.1, 1.2, 4.7, -0.4, STEEL, Mat.Metal),
}, { Icon = "🎤" })
I("bar_cart", "Bar Cart", "Party", 340, ALL, "Bar", v(3, 3, 1.6), join(gShelf(3, 3, 1.6, GOLD, 2), {
	ball(0.5, -0.8, 3.2, 0, LEAF, Mat.Glass, { NC = true, T = 0.3 }),
	ball(0.5, 0.6, 3.2, 0, FABRIC_RED, Mat.Glass, { NC = true, T = 0.3 }),
}), { Icon = "🍸" })
I("dance_floor_home", "Dance Floor Tile", "Party", 220, ALL, "Decoration", v(4, 0.3, 4), {
	part(4, 0.3, 4, 0, 0.15, 0, NEON_PINK, Mat.Neon, { P = true, L = { Range = 8, Brightness = 0.6, Color = NEON_PINK } }),
}, { Icon = "🟪" })

---------------------------------------------------------------------------
-- Kids
---------------------------------------------------------------------------
I("toy_box", "Toy Box", "Kids", 120, HOME, "Storage", v(3, 2, 2), {
	part(3, 1.8, 2, 0, 0.9, 0, rgb(80, 160, 230), Mat.Wood, { P = true }),
	part(3.1, 0.2, 2.1, 0, 1.9, 0, rgb(250, 200, 60), Mat.Wood),
}, { Icon = "🧸" })
I("crib", "Crib", "Kids", 320, HOME, "Bed", v(3, 3.4, 5), join(gFence(5, 3.4, WHITE, Mat.Wood), {
	part(2.8, 0.4, 4.8, 0, 1, 0, WHITE, Mat.Fabric, { Seat = "Sleep" }),
}), { Icon = "👶" })
I("kids_table", "Kids Table", "Kids", 140, HOME, "Table", v(3, 1.6, 3), gTable(3, 3, 1.6, rgb(250, 200, 60), rgb(80, 160, 230)), { Icon = "🖍️" })
I("rocking_horse", "Rocking Horse", "Kids", 160, HOME, "Seat", v(1.4, 3, 4), {
	part(1.2, 0.3, 4, 0, 0.15, 0, DARKWOOD, Mat.Wood),
	part(1, 1.2, 2.6, 0, 1.6, 0, rgb(180, 120, 70), Mat.Wood, { P = true, Seat = "Sit" }),
	part(0.8, 1.4, 0.8, 0, 2.6, -1.2, rgb(180, 120, 70), Mat.Wood, { P = true }),
}, { Icon = "🐴" })
I("play_tent", "Play Tent", "Kids", 180, HOME, "Decoration", v(4, 4, 4), {
	part(4, 4, 2, 0, 2, -1, rgb(250, 140, 170), Mat.Fabric, { Sh = "Wedge", P = true }),
	part(4, 4, 2, 0, 2, 1, rgb(250, 140, 170), Mat.Fabric, { Sh = "Wedge", R = v(0, 180, 0), P = true }),
}, { Icon = "⛺" })

---------------------------------------------------------------------------
-- Business: Restaurant
---------------------------------------------------------------------------
I("biz_stove", "Commercial Stove", "Restaurant", 1800, BIZ, "Stove", v(5, 3.6, 3), {
	part(5, 3.2, 3, 0, 1.6, 0, STEEL, Mat.DiamondPlate),
	part(5, 0.3, 3, 0, 3.35, 0, BLACK, Mat.Slate),
	cyl(0.1, 1, -1.5, 3.55, -0.6, DARKGREY, Mat.Metal),
	cyl(0.1, 1, 0, 3.55, -0.6, DARKGREY, Mat.Metal),
	cyl(0.1, 1, 1.5, 3.55, -0.6, DARKGREY, Mat.Metal),
	cyl(0.1, 1, -1.5, 3.55, 0.7, DARKGREY, Mat.Metal),
	cyl(0.1, 1, 0, 3.55, 0.7, DARKGREY, Mat.Metal),
	cyl(0.1, 1, 1.5, 3.55, 0.7, DARKGREY, Mat.Metal),
}, { Icon = "🔥", Paintable = false })
I("biz_fryer", "Deep Fryer", "Restaurant", 1400, BIZ, "Stove", v(3, 3.8, 3), {
	part(3, 3.4, 3, 0, 1.7, 0, STEEL, Mat.Metal),
	part(2.4, 0.1, 2.2, 0, 3.45, 0, rgb(220, 170, 60), Mat.Glass, { T = 0.2 }),
	part(0.8, 0.6, 1.6, -0.6, 3.7, 0, STEEL, Mat.Metal),
}, { Icon = "🍟", Paintable = false })
I("biz_prep_table", "Prep Table", "Restaurant", 600, BIZ, "Table", v(6, 3.4, 3), join(gTable(6, 3, 3.4, STEEL, STEEL, Mat.Metal), {
	part(5.4, 0.2, 2.4, 0, 0.8, 0, STEEL, Mat.Metal),
}), { Icon = "🔪", Paintable = false })
I("biz_register", "Cash Register", "Restaurant", 900, BIZ, "Register", v(4, 4.6, 2.6), {
	part(4, 3.4, 2.6, 0, 1.7, 0, DARKWOOD, Mat.Wood, { P = true }),
	part(1.6, 0.8, 1.2, 0, 3.8, 0, BLACK, Mat.SmoothPlastic),
	part(1.4, 0.8, 0.1, 0, 4.4, 0.4, NEON_BLUE, Mat.Neon, { R = v(-20, 0, 0), NC = true }),
}, { Icon = "💵" })
I("biz_dining_table", "Restaurant Table", "Restaurant", 450, BIZ, "Table", v(4, 3, 4), gTable(4, 4, 3, WHITE, BLACK), { Icon = "🍽️" })
I("biz_booth", "Diner Booth", "Restaurant", 700, BIZ, "Seat", v(6, 4, 3), {
	part(6, 1.6, 3, 0, 0.8, 0, FABRIC_RED, Mat.Fabric, { P = true }),
	part(6, 2.4, 0.6, 0, 2.8, 1.2, FABRIC_RED, Mat.Fabric, { P = true }),
	part(2.8, 0.4, 2.2, -1.5, 1.8, -0.3, FABRIC_RED, Mat.Fabric, { Seat = "Sit" }),
	part(2.8, 0.4, 2.2, 1.5, 1.8, -0.3, FABRIC_RED, Mat.Fabric, { Seat = "Sit" }),
}, { Icon = "🛋️" })

---------------------------------------------------------------------------
-- Business: Retail
---------------------------------------------------------------------------
I("biz_clothing_rack", "Clothing Rack", "Retail", 500, BIZ, "ClothingRack", v(5, 5.6, 2), {
	part(5, 0.2, 2, 0, 0.1, 0, STEEL, Mat.Metal),
	part(0.2, 5.4, 0.2, -2.3, 2.8, 0, STEEL, Mat.Metal),
	part(0.2, 5.4, 0.2, 2.3, 2.8, 0, STEEL, Mat.Metal),
	cyl(4.8, 0.15, 0, 5.4, 0, STEEL, Mat.Metal, { R = v(0, 0, 0) }),
	part(0.6, 2.4, 1.6, -1.4, 4, 0, FABRIC_BLUE, Mat.Fabric, { P = true }),
	part(0.6, 2.4, 1.6, 0, 4, 0, FABRIC_RED, Mat.Fabric, { P = true }),
	part(0.6, 2.4, 1.6, 1.4, 4, 0, FABRIC_BEIGE, Mat.Fabric, { P = true }),
}, { Icon = "👕" })
I("biz_display_rack", "Display Shelf", "Retail", 450, BIZ, "DisplayRack", v(6, 6, 2), gShelf(6, 6, 2, WHITE, 3), { Icon = "🛍️" })
I("biz_mannequin", "Mannequin", "Retail", 350, BIZ, "Decoration", v(2, 6.4, 1.4), {
	cyl(0.2, 1.4, 0, 0.1, 0, BLACK, Mat.Metal),
	part(0.2, 2, 0.2, 0, 1.2, 0, BLACK, Mat.Metal),
	part(1.8, 2.6, 1, 0, 3.5, 0, WHITE, Mat.SmoothPlastic, { P = true }),
	ball(1.1, 0, 5.4, 0, WHITE, Mat.SmoothPlastic),
}, { Icon = "🧍" })
I("biz_checkout", "Checkout Counter", "Retail", 1100, BIZ, "Register", v(6, 4.4, 3), {
	part(6, 3.4, 3, 0, 1.7, 0, WHITE, Mat.SmoothPlastic, { P = true }),
	part(2.4, 0.1, 2.6, -1.4, 3.45, 0, BLACK, Mat.Fabric),
	part(1.2, 1, 1, 1.8, 3.9, 0, BLACK, Mat.SmoothPlastic),
}, { Icon = "🧾" })

---------------------------------------------------------------------------
-- Business: Club
---------------------------------------------------------------------------
I("biz_dj_booth", "DJ Booth", "Club", 2400, BIZ, "DJBooth", v(6, 4.4, 3), {
	part(6, 3.6, 3, 0, 1.8, 0, BLACK, Mat.SmoothPlastic, { P = true }),
	part(6, 0.3, 3, 0, 3.75, 0, DARKGREY, Mat.Metal),
	cyl(0.2, 1.6, -1.6, 4, 0, DARKGREY, Mat.Metal),
	cyl(0.2, 1.6, 1.6, 4, 0, DARKGREY, Mat.Metal),
	part(6, 0.3, 0.1, 0, 3.0, -1.52, NEON_PINK, Mat.Neon, { NC = true, L = { Range = 14, Brightness = 1.4, Color = NEON_PINK } }),
}, { Icon = "🎧" })
I("biz_bar", "Bar Counter", "Club", 1600, BIZ, "Bar", v(10, 4.2, 3), {
	part(10, 3.8, 3, 0, 1.9, 0, DARKWOOD, Mat.Wood, { P = true }),
	part(10.4, 0.4, 3.4, 0, 4, 0, BLACK, Mat.Granite),
	part(10, 0.2, 0.1, 0, 0.4, -1.52, NEON_BLUE, Mat.Neon, { NC = true }),
}, { Icon = "🍹" })
I("biz_dance_tile", "Dance Floor Tile", "Club", 260, BIZ, "Decoration", v(4, 0.3, 4), {
	part(4, 0.3, 4, 0, 0.15, 0, NEON_BLUE, Mat.Neon, { P = true }),
}, { Icon = "🟦" })
I("biz_speaker", "Club Speaker", "Club", 900, BIZ, "Decoration", v(3, 7, 3), {
	part(3, 7, 3, 0, 3.5, 0, BLACK, Mat.SmoothPlastic, { P = true }),
	cyl(0.1, 2.2, 0, 4.8, -1.52, DARKGREY, Mat.Metal, { R = v(0, 90, 0) }),
	cyl(0.1, 2.6, 0, 1.9, -1.52, DARKGREY, Mat.Metal, { R = v(0, 90, 0) }),
}, { Icon = "🔊" })

---------------------------------------------------------------------------
-- Business: Office
---------------------------------------------------------------------------
I("biz_desk", "Executive Desk", "BizOffice", 900, BIZ, "Desk", v(7, 3, 3.4), join(gTable(7, 3.4, 3, DARKWOOD, DARKWOOD), {
	part(6.6, 2.6, 0.2, 0, 1.4, 1.5, DARKWOOD, Mat.Wood),
}), { Icon = "🗄️" })
I("biz_computer", "Workstation", "BizOffice", 1300, BIZ, "Computer", v(3, 2, 1.6), {
	part(2.4, 1.4, 0.2, 0, 1.1, 0.4, BLACK, Mat.Glass),
	part(0.2, 0.4, 0.2, 0, 0.2, 0.4, DARKGREY, Mat.Metal),
	part(1.8, 0.1, 0.6, 0, 0.05, -0.4, DARKGREY, Mat.SmoothPlastic),
}, { Icon = "🖥️", Paintable = false })
I("biz_meeting_table", "Meeting Table", "BizOffice", 1200, BIZ, "Table", v(12, 3, 5), gTable(12, 5, 3, rgb(40, 40, 46), STEEL, Mat.Granite), { Icon = "🤝" })

---------------------------------------------------------------------------
-- Business: Gas station
---------------------------------------------------------------------------
I("biz_snack_shelf", "Snack Shelf", "GasStation", 500, BIZ, "DisplayRack", v(6, 5, 2), join(gShelf(6, 5, 2, WHITE, 3), {
	part(5, 1, 1.4, 0, 1.0, -0.2, rgb(250, 160, 40), Mat.SmoothPlastic, { NC = true }),
	part(5, 1, 1.4, 0, 2.6, -0.2, rgb(230, 60, 60), Mat.SmoothPlastic, { NC = true }),
}), { Icon = "🍫" })
I("biz_fuel_register", "Fuel Register", "GasStation", 1000, BIZ, "Register", v(4, 4.6, 2.6), {
	part(4, 3.4, 2.6, 0, 1.7, 0, rgb(220, 60, 50), Mat.SmoothPlastic, { P = true }),
	part(1.6, 0.8, 1.2, 0, 3.8, 0, BLACK, Mat.SmoothPlastic),
	part(1.4, 0.8, 0.1, 0, 4.4, 0.4, rgb(120, 255, 140), Mat.Neon, { R = v(-20, 0, 0), NC = true }),
}, { Icon = "⛽" })

---------------------------------------------------------------------------
-- Business: Dealership
---------------------------------------------------------------------------
I("biz_car_display", "Car Display Platform", "Dealership", 3000, BIZ, "CarDisplay", v(16, 1, 24), {
	part(0.6, 16, 16, 0, 0.5, -4, rgb(230, 230, 236), Mat.Marble, { Sh = "Cylinder", R = v(0, 0, 90), P = true }),
	part(14, 1, 10, 0, 0.5, 6.5, rgb(230, 230, 236), Mat.Marble, { P = true }),
	part(14, 0.1, 0.2, 0, 1.02, 11.4, NEON_BLUE, Mat.Neon, { NC = true }),
}, { Icon = "🚘" })

---------------------------------------------------------------------------
-- Indexes
---------------------------------------------------------------------------
Furniture.ById = {}
Furniture.MaterialSet = {}
for _, name in ipairs(Furniture.Materials) do
	Furniture.MaterialSet[name] = true
end
for i, def in ipairs(Items) do
	assert(Furniture.ById[def.Id] == nil, "Duplicate furniture id " .. def.Id)
	def.Order = i
	def.CatalogSet = {}
	for _, c in ipairs(def.Catalogs) do
		def.CatalogSet[c] = true
	end
	Furniture.ById[def.Id] = def
end

function Furniture.Get(id: string)
	return Furniture.ById[id]
end

function Furniture.IsPaint(def): boolean
	return def ~= nil and def.Kind == "Paint"
end

return Furniture
