-- Looks: shared car-appearance helpers (server applies them to car models, client UI uses them for previews).
--
--   Looks.Color(v) -> Color3                      v = Color3 | {R,G,B} (0-255) | nil
--   Looks.ToRGB(color3) -> {R,G,B}
--   Looks.Finish(name) -> { Material, Reflectance }    "Gloss" | "Matte" | "Metallic" | "Chrome" | "Pearl"
--   Looks.RimStyle(id) -> style table               (unknown ids map to a stable style so new Tuning rims still render)
--   Looks.Default(def) -> look                      default customisation for a Config/Cars definition
--   Looks.Resolve(saved?, def) -> look              saved Vehicles[uid] entry (or opts) merged over the default
--   Looks.Tint(tint 0..1) -> (transparency, color)  window tint
--   Looks.CleanPlate(text) -> string?               uppercase A-Z 0-9 and spaces, 1..8 chars
--   Looks.BuildBadge(parent: GuiObject, brandId, zIndex?) -> Frame   procedural brand badge (SurfaceGui or UI)
--   Looks.Brand(brandId) -> brand table (never nil)

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Brands = require(Shared.Config.Brands)

local Looks = {}

Looks.TrimColor = Color3.fromRGB(28, 28, 32)
Looks.ChromeColor = Color3.fromRGB(205, 208, 214)
Looks.TyreColor = Color3.fromRGB(24, 24, 26)
Looks.InteriorColor = Color3.fromRGB(44, 44, 50)
Looks.GlassColor = Color3.fromRGB(40, 52, 64)

Looks.Finishes = {
	Gloss = { Material = Enum.Material.SmoothPlastic, Reflectance = 0.08 },
	Matte = { Material = Enum.Material.Plastic, Reflectance = 0 },
	Metallic = { Material = Enum.Material.SmoothPlastic, Reflectance = 0.2 },
	Chrome = { Material = Enum.Material.SmoothPlastic, Reflectance = 0.55 },
	Pearl = { Material = Enum.Material.Glass, Reflectance = 0.12 },
}
-- Config/Tuning sells the finish id "Pearlescent"; accept it natively (same look as Pearl).
Looks.Finishes.Pearlescent = Looks.Finishes.Pearl

-- Rim styles. Tuning may sell any id; ids not listed here fall back to a style picked by a stable hash.
Looks.RimStyles = {
	Stock = { Kind = "Spoke", Spokes = 5, Size = 0.66, Depth = 0.1, Color = { 190, 192, 198 }, Cap = true },
	Sport = { Kind = "Spoke", Spokes = 6, Size = 0.74, Depth = 0.14, Color = { 60, 62, 68 }, Cap = true },
	Split = { Kind = "Spoke", Spokes = 10, Size = 0.76, Depth = 0.12, Color = { 210, 212, 218 }, Cap = false },
	Mesh = { Kind = "Mesh", Spokes = 8, Size = 0.74, Depth = 0.1, Color = { 200, 180, 120 }, Cap = true },
	Deep = { Kind = "Dish", Spokes = 5, Size = 0.78, Depth = 0.24, Color = { 220, 222, 228 }, Cap = true },
	Turbine = { Kind = "Turbine", Spokes = 12, Size = 0.72, Depth = 0.1, Color = { 170, 172, 180 }, Cap = true },
	Classic = { Kind = "Wire", Spokes = 14, Size = 0.66, Depth = 0.08, Color = { 215, 215, 220 }, Cap = true },
	Offroad = { Kind = "Beadlock", Spokes = 6, Size = 0.62, Depth = 0.18, Color = { 40, 40, 44 }, Cap = false },
	Aero = { Kind = "Disc", Spokes = 0, Size = 0.72, Depth = 0.06, Color = { 235, 235, 240 }, Cap = false },
	Steelie = { Kind = "Disc", Spokes = 0, Size = 0.62, Depth = 0.08, Color = { 30, 30, 34 }, Cap = true },
	-- ids used by Config/Tuning
	Spoke5 = { Kind = "Spoke", Spokes = 5, Size = 0.7, Depth = 0.12, Color = { 200, 202, 208 }, Cap = true },
	DeepDish = { Kind = "Dish", Spokes = 6, Size = 0.8, Depth = 0.26, Color = { 225, 226, 232 }, Cap = true },
	Beadlock = { Kind = "Beadlock", Spokes = 8, Size = 0.64, Depth = 0.18, Color = { 40, 40, 44 }, Cap = false },
	Monoblock = { Kind = "Spoke", Spokes = 7, Size = 0.76, Depth = 0.16, Color = { 70, 72, 80 }, Cap = true, Width = 0.24 },
	Wire = { Kind = "Wire", Spokes = 24, Size = 0.7, Depth = 0.08, Color = { 220, 220, 226 }, Cap = true },
	Star = { Kind = "Spoke", Spokes = 5, Size = 0.74, Depth = 0.14, Color = { 190, 192, 198 }, Cap = true, Width = 0.28 },
	Blade = { Kind = "Turbine", Spokes = 9, Size = 0.76, Depth = 0.12, Color = { 40, 42, 48 }, Cap = true },
}
local RIM_ORDER = { "Stock", "Sport", "Split", "Mesh", "Deep", "Turbine", "Classic", "Offroad", "Aero", "Steelie", "Star", "Blade", "Monoblock" }

local DEFAULT_RIMS_BY_CLASS = {
	Classic = "Classic",
	Offroad = "Offroad",
	Pickup = "Steelie",
	Van = "Steelie",
	Supercar = "Sport",
	Hypercar = "Turbine",
	EV = "Aero",
	Muscle = "Deep",
	Luxury = "Split",
	Scooter = "Stock",
}

function Looks.Brand(brandId: any): { [string]: any }
	local b = type(brandId) == "string" and Brands[brandId] or nil
	if b then
		return b
	end
	return {
		Id = "generic",
		Name = "Skyline",
		Short = "SKY",
		Country = "",
		Tagline = "",
		Badge = {
			Shape = "circle",
			Primary = Color3.fromRGB(40, 44, 56),
			Secondary = Color3.fromRGB(200, 200, 210),
			Accent = Color3.fromRGB(64, 156, 255),
			Letters = "S",
			TextColor = Color3.fromRGB(255, 255, 255),
		},
		Color = Color3.fromRGB(64, 156, 255),
	}
end

function Looks.Color(v: any, fallback: Color3?): Color3
	if typeof(v) == "Color3" then
		return v
	end
	if type(v) == "table" then
		local r, g, b = tonumber(v[1] or v.R), tonumber(v[2] or v.G), tonumber(v[3] or v.B)
		if r and g and b then
			return Color3.fromRGB(math.clamp(r, 0, 255), math.clamp(g, 0, 255), math.clamp(b, 0, 255))
		end
	end
	return fallback or Color3.fromRGB(200, 200, 200)
end

function Looks.ToRGB(c: Color3): { number }
	return { math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5) }
end

function Looks.Finish(name: any): { Material: Enum.Material, Reflectance: number }
	return Looks.Finishes[name] or Looks.Finishes.Gloss
end

local function hash(s: string): number
	local h = 7
	for i = 1, #s do
		h = (h * 31 + string.byte(s, i)) % 1000003
	end
	return h
end

function Looks.RimStyle(id: any)
	if type(id) ~= "string" or id == "" then
		return Looks.RimStyles.Stock, "Stock"
	end
	local s = Looks.RimStyles[id]
	if s then
		return s, id
	end
	local key = RIM_ORDER[(hash(id) % #RIM_ORDER) + 1]
	return Looks.RimStyles[key], key
end

function Looks.Default(def: any): { [string]: any }
	local body = type(def) == "table" and type(def.Body) == "table" and def.Body or {}
	local class = type(def) == "table" and def.Class or "Sedan"
	local livery = type(def) == "table" and def.Livery or nil
	local color = livery and livery.Primary or body.DefaultColor or { 200, 200, 205 }
	return {
		Paint = { Color = { color[1] or 200, color[2] or 200, color[3] or 205 }, Finish = (class == "Classic") and "Gloss" or "Metallic" },
		Rims = DEFAULT_RIMS_BY_CLASS[class] or "Stock",
		RimColor = false,
		Tint = 0.25,
		BodyKit = "Stock",
		Spoiler = body.Spoiler or "None",
		Underglow = false,
		Plate = "",
	}
end

-- Merge a saved vehicle entry (or GrantVehicle opts) over the car's defaults. Never returns nil fields.
function Looks.Resolve(saved: any, def: any): { [string]: any }
	local look = Looks.Default(def)
	if type(saved) ~= "table" then
		return look
	end
	local p = saved.Paint
	if type(p) == "table" then
		if p.Color ~= nil then
			look.Paint.Color = Looks.ToRGB(Looks.Color(p.Color, Looks.Color(look.Paint.Color)))
		elseif p[1] ~= nil then
			look.Paint.Color = Looks.ToRGB(Looks.Color(p, Looks.Color(look.Paint.Color)))
		end
		if type(p.Finish) == "string" and Looks.Finishes[p.Finish] then
			look.Paint.Finish = p.Finish
		end
	elseif typeof(p) == "Color3" then
		look.Paint.Color = Looks.ToRGB(p)
	end
	if type(saved.Rims) == "string" and saved.Rims ~= "" then
		look.Rims = saved.Rims
	end
	if type(saved.RimColor) == "table" then
		look.RimColor = Looks.ToRGB(Looks.Color(saved.RimColor))
	end
	if type(saved.Tint) == "number" then
		look.Tint = math.clamp(saved.Tint, 0, 1)
	end
	if type(saved.BodyKit) == "string" then
		look.BodyKit = saved.BodyKit
	end
	if type(saved.Spoiler) == "string" then
		look.Spoiler = saved.Spoiler
	end
	if type(saved.Underglow) == "table" then
		look.Underglow = Looks.ToRGB(Looks.Color(saved.Underglow))
	end
	if type(saved.Plate) == "string" then
		look.Plate = saved.Plate
	end
	return look
end

-- Window tint: 0 = clear-ish, 1 = limo black.
function Looks.Tint(tint: number?): (number, Color3)
	local t = math.clamp(tint or 0.25, 0, 1)
	local transparency = 0.62 - t * 0.5
	local c = Looks.GlassColor:Lerp(Color3.fromRGB(8, 8, 10), t)
	return transparency, c
end

function Looks.CleanPlate(text: any): string?
	if type(text) ~= "string" then
		return nil
	end
	local up = string.upper(text):gsub("[^A-Z0-9 ]", ""):gsub("%s+", " ")
	up = up:gsub("^%s+", ""):gsub("%s+$", "")
	if #up < 1 or #up > 8 then
		return nil
	end
	return up
end

---------------------------------------------------------------------------
-- Procedural badge (works inside SurfaceGuis and ScreenGuis; everything is scale-based)
---------------------------------------------------------------------------
local function frame(parent: Instance, props: { [string]: any }): Frame
	local f = Instance.new("Frame")
	f.BorderSizePixel = 0
	for k, v in pairs(props) do
		(f :: any)[k] = v
	end
	f.Parent = parent
	return f
end

local function round(f: GuiObject, radius: UDim?)
	local c = Instance.new("UICorner")
	c.CornerRadius = radius or UDim.new(1, 0)
	c.Parent = f
end

local function letters(parent: Instance, text: string, color: Color3, z: number, size: UDim2?, pos: UDim2?)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.AnchorPoint = Vector2.new(0.5, 0.5)
	t.Position = pos or UDim2.fromScale(0.5, 0.5)
	t.Size = size or UDim2.fromScale(0.72, 0.5)
	t.Text = text
	t.TextScaled = true
	t.Font = Enum.Font.GothamBlack
	t.TextColor3 = color
	t.ZIndex = z
	t.Parent = parent
	return t
end

function Looks.BuildBadge(parent: Instance, brandId: any, zIndex: number?): Frame
	local brand = Looks.Brand(brandId)
	local spec = brand.Badge or {}
	local z = zIndex or 1
	local shape = spec.Shape or "circle"
	local primary = Looks.Color(spec.Primary, Color3.fromRGB(40, 44, 56))
	local secondary = Looks.Color(spec.Secondary, Color3.fromRGB(220, 220, 225))
	local accent = Looks.Color(spec.Accent, secondary)
	local textColor = Looks.Color(spec.TextColor, Color3.new(1, 1, 1))
	local text = tostring(spec.Letters or brand.Short or "?")

	local root = frame(parent, {
		Name = "Badge",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(1, 1),
		ZIndex = z,
	})
	local aspect = Instance.new("UIAspectRatioConstraint")
	aspect.AspectRatio = shape == "wing" and 2 or 1
	aspect.Parent = root

	local textScale = #text >= 4 and 0.82 or (#text == 3 and 0.7 or 0.55)

	if shape == "circle" then
		local outer = frame(root, { Size = UDim2.fromScale(1, 1), BackgroundColor3 = secondary, ZIndex = z })
		round(outer)
		local ring = frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.86, 0.86), BackgroundColor3 = accent, ZIndex = z + 1,
		})
		round(ring)
		local inner = frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.78, 0.78), BackgroundColor3 = primary, ZIndex = z + 2,
		})
		round(inner)
		if spec.Stripe then
			frame(root, {
				AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
				Size = UDim2.fromScale(0.78, 0.12), BackgroundColor3 = accent, ZIndex = z + 3,
			})
		end
		letters(root, text, textColor, z + 4, UDim2.fromScale(textScale, 0.42))
	elseif shape == "shield" then
		-- top block + rotated square bottom point
		local top = frame(root, {
			AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.fromScale(0.5, 0.02),
			Size = UDim2.fromScale(0.84, 0.56), BackgroundColor3 = secondary, ZIndex = z,
		})
		round(top, UDim.new(0.12, 0))
		frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.56),
			Size = UDim2.fromScale(0.6, 0.6), Rotation = 45, BackgroundColor3 = secondary, ZIndex = z,
		})
		local innerTop = frame(root, {
			AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.fromScale(0.5, 0.08),
			Size = UDim2.fromScale(0.72, 0.5), BackgroundColor3 = primary, ZIndex = z + 1,
		})
		round(innerTop, UDim.new(0.1, 0))
		frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.55),
			Size = UDim2.fromScale(0.5, 0.5), Rotation = 45, BackgroundColor3 = primary, ZIndex = z + 1,
		})
		if spec.Stripe then
			frame(root, {
				AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.26),
				Size = UDim2.fromScale(0.72, 0.08), BackgroundColor3 = accent, ZIndex = z + 2,
			})
		end
		frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.72),
			Size = UDim2.fromScale(0.14, 0.14), Rotation = 45, BackgroundColor3 = accent, ZIndex = z + 2,
		})
		letters(root, text, textColor, z + 3, UDim2.fromScale(textScale * 0.9, 0.3), UDim2.fromScale(0.5, 0.42))
	elseif shape == "diamond" then
		frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.7, 0.7), Rotation = 45, BackgroundColor3 = secondary, ZIndex = z,
		})
		frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.58, 0.58), Rotation = 45, BackgroundColor3 = primary, ZIndex = z + 1,
		})
		frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.2, 0.2), Rotation = 45, BackgroundColor3 = accent,
			BackgroundTransparency = 0.6, ZIndex = z + 2,
		})
		letters(root, text, textColor, z + 3, UDim2.fromScale(textScale * 0.8, 0.36))
	else -- wing
		for _, side in ipairs({ -1, 1 }) do
			for i = 0, 2 do
				frame(root, {
					AnchorPoint = Vector2.new(0.5, 0.5),
					Position = UDim2.fromScale(0.5 + side * (0.25 + i * 0.05), 0.36 + i * 0.13),
					Size = UDim2.fromScale(0.36 - i * 0.08, 0.1),
					Rotation = side * -12,
					BackgroundColor3 = i == 0 and accent or secondary,
					ZIndex = z,
				})
			end
		end
		local disc = frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.42, 0.84), BackgroundColor3 = secondary, ZIndex = z + 1,
		})
		round(disc)
		local inner = frame(root, {
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.34, 0.68), BackgroundColor3 = primary, ZIndex = z + 2,
		})
		round(inner)
		letters(root, text, textColor, z + 3, UDim2.fromScale(0.26, 0.4))
	end
	return root
end

return Looks
