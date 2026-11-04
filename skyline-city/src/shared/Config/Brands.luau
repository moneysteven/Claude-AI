-- BRANDS CONFIG — every car maker in SKYLINE CITY. ALL brands are ORIGINAL parodies:
-- never put a real car brand name, real logo or real model name here.
--
-- Brands[brandId] = {
--   Id, Name, Short (2-4 letter code shown on badges / plates frames), Country (flavour text),
--   Tagline, Description,
--   Badge = {                     -- procedural logo rendered into a SurfaceGui / UI by Shared/Vehicle/Looks
--     Shape = "circle" | "shield" | "diamond" | "wing",
--     Primary = Color3,           -- main badge fill
--     Secondary = Color3,         -- ring / outline / wings
--     Accent = Color3,            -- inner detail (stripe, inner ring, wing tips)
--     Letters = "BVM",            -- 1-4 characters drawn on the badge
--     TextColor = Color3,
--     Stripe = true?,             -- optional diagonal stripe across the badge
--   },
--   Color = Color3,               -- brand colour used in the Garage / dealership UI
-- }
--
-- Car models reference brands by id (Config/Cars: Brand = "bvm").

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

return {
	bvm = {
		Id = "bvm",
		Name = "Bavaria Motors",
		Short = "BVM",
		Country = "Southern Germania",
		Tagline = "Precision you can feel in every corner.",
		Description = "Sporty executive saloons and coupés engineered in the foothills of the Alpenwald.",
		Badge = {
			Shape = "circle",
			Primary = rgb(24, 46, 92),
			Secondary = rgb(210, 214, 222),
			Accent = rgb(90, 170, 255),
			Letters = "BVM",
			TextColor = rgb(255, 255, 255),
		},
		Color = rgb(60, 120, 220),
	},

	mercato = {
		Id = "mercato",
		Name = "Mercato",
		Short = "MRC",
		Country = "Stuttgarden",
		Tagline = "Nothing less than magnificent.",
		Description = "Old-money luxury: whisper-quiet cabins, soft leather and a silver diamond on the bonnet.",
		Badge = {
			Shape = "diamond",
			Primary = rgb(200, 204, 212),
			Secondary = rgb(60, 64, 74),
			Accent = rgb(255, 255, 255),
			Letters = "M",
			TextColor = rgb(30, 32, 40),
		},
		Color = rgb(170, 176, 190),
	},

	lambrino = {
		Id = "lambrino",
		Name = "Lambrino",
		Short = "LMB",
		Country = "Emilia Rossa",
		Tagline = "Born angry. Raised loud.",
		Description = "Wedge-shaped Italian-style supercars with doors that scream louder than the engine.",
		Badge = {
			Shape = "shield",
			Primary = rgb(20, 20, 22),
			Secondary = rgb(232, 186, 48),
			Accent = rgb(232, 186, 48),
			Letters = "L",
			TextColor = rgb(232, 186, 48),
		},
		Color = rgb(232, 186, 48),
	},

	porza = {
		Id = "porza",
		Name = "Porza",
		Short = "PRZ",
		Country = "Zuffenwald",
		Tagline = "Rear engine. Front-row smile.",
		Description = "Driver-focused sports cars with a cult following and a crest full of stripes.",
		Badge = {
			Shape = "shield",
			Primary = rgb(196, 152, 40),
			Secondary = rgb(30, 30, 30),
			Accent = rgb(200, 30, 40),
			Letters = "P",
			TextColor = rgb(20, 20, 20),
			Stripe = true,
		},
		Color = rgb(200, 40, 50),
	},

	toyomo = {
		Id = "toyomo",
		Name = "Toyomo",
		Short = "TYM",
		Country = "Nakamura Prefecture",
		Tagline = "Runs forever. Probably longer.",
		Description = "Sensible, ultra-reliable family cars that every taxi rank and grandparent swears by.",
		Badge = {
			Shape = "circle",
			Primary = rgb(200, 30, 40),
			Secondary = rgb(240, 240, 240),
			Accent = rgb(240, 240, 240),
			Letters = "T",
			TextColor = rgb(255, 255, 255),
		},
		Color = rgb(210, 50, 60),
	},

	fjord = {
		Id = "fjord",
		Name = "Fjord",
		Short = "FJD",
		Country = "Motor Valley, Great Lakes",
		Tagline = "Built tough. Built cheap. Built everywhere.",
		Description = "Workhorse pickups, vans and no-nonsense hatchbacks with a blue oval-ish badge.",
		Badge = {
			Shape = "circle",
			Primary = rgb(18, 58, 140),
			Secondary = rgb(220, 226, 236),
			Accent = rgb(120, 170, 240),
			Letters = "Fjord",
			TextColor = rgb(255, 255, 255),
		},
		Color = rgb(40, 90, 190),
	},

	teslo = {
		Id = "teslo",
		Name = "Teslo",
		Short = "TSL",
		Country = "Silicon Bay",
		Tagline = "Over-the-air updates for your whole life.",
		Description = "Silent electric cars with giant screens, instant torque and a lightning-bolt badge.",
		Badge = {
			Shape = "diamond",
			Primary = rgb(230, 32, 46),
			Secondary = rgb(250, 250, 250),
			Accent = rgb(255, 220, 80),
			Letters = "⚡",
			TextColor = rgb(255, 255, 255),
		},
		Color = rgb(230, 50, 60),
	},

	audex = {
		Id = "audex",
		Name = "Audex",
		Short = "ADX",
		Country = "Ingoltal",
		Tagline = "Progress, with four-wheel drive.",
		Description = "Quattro-style all-wheel-drive saloons and SUVs with a crisp, techy interior.",
		Badge = {
			Shape = "wing",
			Primary = rgb(190, 194, 204),
			Secondary = rgb(120, 124, 134),
			Accent = rgb(220, 30, 40),
			Letters = "AX",
			TextColor = rgb(20, 22, 28),
		},
		Color = rgb(150, 156, 170),
	},

	rangel = {
		Id = "rangel",
		Name = "Rangel Rover",
		Short = "RGR",
		Country = "Coventry Moors",
		Tagline = "Wellies optional. Mud mandatory.",
		Description = "Posh off-roaders equally at home in a field or outside a five-star hotel.",
		Badge = {
			Shape = "shield",
			Primary = rgb(18, 70, 46),
			Secondary = rgb(220, 200, 140),
			Accent = rgb(220, 200, 140),
			Letters = "RR",
			TextColor = rgb(240, 230, 200),
		},
		Color = rgb(40, 120, 80),
	},

	nordvik = {
		Id = "nordvik",
		Name = "Nordvik",
		Short = "NVK",
		Country = "Västerholm",
		Tagline = "Safe, calm and electric — like a snowy forest.",
		Description = "Minimalist Scandinavian EVs with the safety ratings of a bank vault.",
		Badge = {
			Shape = "circle",
			Primary = rgb(232, 236, 240),
			Secondary = rgb(40, 60, 90),
			Accent = rgb(110, 200, 220),
			Letters = "N",
			TextColor = rgb(40, 60, 90),
			Stripe = true,
		},
		Color = rgb(110, 190, 210),
	},

	kaizen = {
		Id = "kaizen",
		Name = "Kaizen",
		Short = "KZN",
		Country = "Hiroshore",
		Tagline = "Always a little better.",
		Description = "Light, rev-happy coupés and roadsters loved by the midnight touge crowd.",
		Badge = {
			Shape = "wing",
			Primary = rgb(30, 30, 34),
			Secondary = rgb(200, 204, 214),
			Accent = rgb(255, 120, 40),
			Letters = "K",
			TextColor = rgb(255, 255, 255),
		},
		Color = rgb(255, 120, 40),
	},

	valkyr = {
		Id = "valkyr",
		Name = "Valkyr",
		Short = "VLK",
		Country = "Ängelholm Fjords",
		Tagline = "Ride with the gods.",
		Description = "Hand-built carbon hypercars from a tiny workshop with an absurd top-speed obsession.",
		Badge = {
			Shape = "wing",
			Primary = rgb(16, 18, 26),
			Secondary = rgb(150, 200, 255),
			Accent = rgb(255, 255, 255),
			Letters = "V",
			TextColor = rgb(150, 200, 255),
		},
		Color = rgb(120, 170, 255),
	},

	stallion = {
		Id = "stallion",
		Name = "Stallion Motor Co.",
		Short = "STL",
		Country = "Detroitville",
		Tagline = "More cylinders. More freedom.",
		Description = "Big-block muscle cars and heavy-duty trucks that measure fuel economy in gallons per mile.",
		Badge = {
			Shape = "shield",
			Primary = rgb(150, 20, 24),
			Secondary = rgb(210, 214, 222),
			Accent = rgb(20, 20, 20),
			Letters = "STL",
			TextColor = rgb(255, 255, 255),
		},
		Color = rgb(170, 30, 36),
	},

	zippa = {
		Id = "zippa",
		Name = "Zippa",
		Short = "ZIP",
		Country = "Portofino Bay",
		Tagline = "Beat the traffic. Beat the parking.",
		Description = "Cheerful scooters and mopeds that fit through gaps you didn't know existed.",
		Badge = {
			Shape = "circle",
			Primary = rgb(70, 200, 160),
			Secondary = rgb(255, 255, 255),
			Accent = rgb(255, 210, 60),
			Letters = "Z",
			TextColor = rgb(255, 255, 255),
		},
		Color = rgb(70, 200, 160),
	},

	fleetworks = {
		Id = "fleetworks",
		Name = "Metro Fleetworks",
		Short = "MFW",
		Country = "Skyline City",
		Tagline = "Keeping the city moving since day one.",
		Description = "The city's own builder of police cruisers, taxis, ambulances, fire engines and work trucks.",
		Badge = {
			Shape = "shield",
			Primary = rgb(30, 40, 60),
			Secondary = rgb(255, 196, 40),
			Accent = rgb(255, 196, 40),
			Letters = "MF",
			TextColor = rgb(255, 196, 40),
		},
		Color = rgb(255, 196, 40),
	},
}
