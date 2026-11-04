-- PHONE CONFIG — the smartphone UI, messaging, feed, GPS and camera.
-- Change values freely; no code changes needed.

local Phone = {}

---------------------------------------------------------------------------
-- Apps on the home screen (in this order, 4 per row).
--   Kind = "app"   -> built inside the phone (Messages, Contacts, Map, Camera, Feed, Profile)
--   Kind = "panel" -> closes the phone and opens the Router panel `Panel` with `PanelData`
--                     (panels belong to other systems; if one isn't installed the phone shows "App unavailable")
--   Color = icon tile colour
---------------------------------------------------------------------------
Phone.Apps = {
	{ Id = "Messages", Name = "Messages", Icon = "💬", Color = Color3.fromRGB(52, 199, 89), Kind = "app" },
	{ Id = "Contacts", Name = "Contacts", Icon = "👥", Color = Color3.fromRGB(142, 142, 160), Kind = "app" },
	{ Id = "Map", Name = "Maps", Icon = "🗺️", Color = Color3.fromRGB(64, 156, 255), Kind = "app" },
	{ Id = "Feed", Name = "Skyline Feed", Icon = "📰", Color = Color3.fromRGB(255, 94, 120), Kind = "app" },
	{ Id = "Bank", Name = "Bank", Icon = "🏦", Color = Color3.fromRGB(40, 170, 110), Kind = "panel", Panel = "Bank", PanelData = { ViaPhone = true } },
	{ Id = "Jobs", Name = "Jobs", Icon = "💼", Color = Color3.fromRGB(255, 160, 40), Kind = "panel", Panel = "Jobs", PanelData = { ViaPhone = true } },
	{ Id = "RealEstate", Name = "Real Estate", Icon = "🏠", Color = Color3.fromRGB(120, 92, 255), Kind = "panel", Panel = "RealEstate", PanelData = { ViaPhone = true } },
	{ Id = "Cars", Name = "Cars", Icon = "🚗", Color = Color3.fromRGB(230, 70, 70), Kind = "panel", Panel = "Garage", PanelData = { ViaPhone = true } },
	{ Id = "Business", Name = "Business", Icon = "🏪", Color = Color3.fromRGB(0, 170, 200), Kind = "panel", Panel = "Business", PanelData = { ViaPhone = true } },
	{ Id = "Shop", Name = "Shop", Icon = "🛍️", Color = Color3.fromRGB(255, 196, 40), Kind = "panel", Panel = "Shop", PanelData = { ViaPhone = true } },
	{ Id = "Camera", Name = "Camera", Icon = "📷", Color = Color3.fromRGB(60, 60, 72), Kind = "app" },
	{ Id = "Profile", Name = "Profile", Icon = "🪪", Color = Color3.fromRGB(90, 120, 255), Kind = "app" },
	{ Id = "Settings", Name = "Settings", Icon = "⚙️", Color = Color3.fromRGB(110, 110, 125), Kind = "panel", Panel = "Settings" },
}

---------------------------------------------------------------------------
-- Look & feel
---------------------------------------------------------------------------
Phone.UI = {
	MaxWidth = 320, -- px (before the global UI scale)
	MaxHeight = 660,
	HeightScale = 0.9, -- fraction of screen height the phone may use
	AspectRatio = 0.49, -- width / height
	RightMargin = 82, -- px from the right edge (leaves room for the HUD side bar)
	BottomMargin = 14,
	BezelColor = Color3.fromRGB(12, 12, 16),
	WallpaperTop = Color3.fromRGB(40, 70, 160),
	WallpaperBottom = Color3.fromRGB(150, 60, 170),
	CarrierText = "SKYLINE 5G",
	OpenTween = 0.35, -- seconds
	BannerSeconds = 4, -- notification banners stay this long
	ClosedBannerSeconds = 5, -- banners shown while the phone is closed (bottom-right "peek")
	Keybind = Enum.KeyCode.P,
	GamepadButton = Enum.KeyCode.ButtonY,
	HudOrder = 10,
}

---------------------------------------------------------------------------
-- Messages (in-server only, kept in server memory)
---------------------------------------------------------------------------
Phone.Messages = {
	MaxLength = 200, -- characters per message
	MaxPerThread = 50, -- older messages are dropped
	MaxThreads = 40, -- per player
	SendRate = 1, -- messages per second per player
	SendBurst = 3,
	PingCooldown = 15, -- seconds between "calls" to the same person
}

---------------------------------------------------------------------------
-- Skyline Feed (server-wide, in memory)
---------------------------------------------------------------------------
Phone.Feed = {
	MaxPosts = 50, -- recent posts kept per server
	MaxLength = 140, -- characters per post
	PostCooldown = 30, -- seconds between posts per player
	LikeRate = 3, -- likes per second per player
}

---------------------------------------------------------------------------
-- Contacts (saved in data: Social.Contacts)
---------------------------------------------------------------------------
Phone.Contacts = {
	MaxContacts = 100,
	MaxNicknameLength = 24,
}

---------------------------------------------------------------------------
-- GPS waypoint (PhoneController:SetWaypoint)
---------------------------------------------------------------------------
Phone.Waypoint = {
	ArriveDistance = 14, -- studs; the waypoint clears itself when you get this close
	MetersPerStud = 0.28, -- distance label conversion
	BeamColor = Color3.fromRGB(64, 156, 255),
	BeamWidth = 0.5,
	MarkerHeight = 6, -- studs above the target for the billboard
	UpdateHz = 5,
}

---------------------------------------------------------------------------
-- Map / GPS app
---------------------------------------------------------------------------
Phone.Map = {
	MinZoom = 0.15, -- px per stud
	MaxZoom = 2.5,
	DefaultZoom = 0.45,
	ZoomStep = 1.25, -- multiplier per +/- press or wheel notch
	RoadColor = Color3.fromRGB(70, 74, 88),
	BackgroundColor = Color3.fromRGB(34, 60, 40),
	DistrictTransparency = 0.55,
	PoiSize = 30, -- px (icons keep their size while zooming)
	CategoryIcons = { -- fallback icons when a POI has no Icon
		Job = "💼",
		Bank = "🏦",
		Shop = "🛍️",
		Food = "🍔",
		Car = "🚗",
		Fuel = "⛽",
		Home = "🏠",
		Civic = "🏛️",
		Fun = "🎡",
		Party = "🎉",
	},
}

---------------------------------------------------------------------------
-- Camera app (selfie / photo mode)
---------------------------------------------------------------------------
Phone.Camera = {
	SelfieDistance = { Min = 2.5, Max = 10, Default = 4.5 }, -- studs in front of your face
	SelfieHeight = 0.4, -- studs above the head
	FieldOfView = { Min = 25, Max = 90, Default = 70 },
	ZoomStep = 0.5, -- studs (selfie) / scaled to FOV for the rear camera
	ShutterHideSeconds = 2, -- the controls hide this long after the shutter so you can screenshot
	-- ColorCorrection presets (Brightness / Contrast / Saturation are -1..1; TintColor multiplies the scene)
	Filters = {
		{ Name = "Normal", Brightness = 0, Contrast = 0, Saturation = 0, TintColor = Color3.new(1, 1, 1) },
		{ Name = "Vivid", Brightness = 0.03, Contrast = 0.15, Saturation = 0.45, TintColor = Color3.new(1, 1, 1) },
		{ Name = "Noir", Brightness = 0, Contrast = 0.35, Saturation = -1, TintColor = Color3.new(1, 1, 1) },
		{ Name = "Sunset", Brightness = 0.04, Contrast = 0.1, Saturation = 0.15, TintColor = Color3.fromRGB(255, 214, 180) },
		{ Name = "Cool", Brightness = 0, Contrast = 0.08, Saturation = -0.1, TintColor = Color3.fromRGB(196, 222, 255) },
		{ Name = "Retro", Brightness = 0.05, Contrast = -0.1, Saturation = -0.35, TintColor = Color3.fromRGB(255, 236, 200) },
		{ Name = "Dream", Brightness = 0.1, Contrast = -0.15, Saturation = 0.2, TintColor = Color3.fromRGB(255, 220, 245) },
	},
	-- emotes the "Pose" button cycles through (EmoteController ids, see Config.Social.Emotes)
	Poses = { "wave", "cheer", "dance", "point", "laugh", "dance2", "salute", "dance3" },
}

return Phone
