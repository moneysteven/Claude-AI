-- Visual theme for every SKYLINE CITY screen. Change colours / fonts here.

local Theme = {
	Font = Enum.Font.GothamMedium,
	FontBold = Enum.Font.GothamBold,
	FontMono = Enum.Font.RobotoMono,

	Colors = {
		Background = Color3.fromRGB(16, 18, 26),
		Surface = Color3.fromRGB(26, 29, 40),
		SurfaceAlt = Color3.fromRGB(36, 40, 54),
		Stroke = Color3.fromRGB(60, 66, 86),
		Text = Color3.fromRGB(240, 242, 248),
		TextDim = Color3.fromRGB(160, 166, 186),
		Accent = Color3.fromRGB(64, 156, 255), -- skyline blue
		AccentAlt = Color3.fromRGB(120, 92, 255),
		Success = Color3.fromRGB(52, 199, 120),
		Warning = Color3.fromRGB(255, 184, 48),
		Danger = Color3.fromRGB(255, 82, 92),
		Money = Color3.fromRGB(88, 214, 120),
		VIP = Color3.fromRGB(255, 196, 40),
		Overlay = Color3.fromRGB(0, 0, 0),
	},

	Corner = UDim.new(0, 14),
	CornerSmall = UDim.new(0, 8),
	Padding = 12,

	TextSize = {
		Title = 24,
		Heading = 19,
		Body = 16,
		Small = 13,
	},

	Tween = {
		Fast = TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		Normal = TweenInfo.new(0.25, Enum.EasingStyle.Quint, Enum.EasingDirection.Out),
		Spring = TweenInfo.new(0.4, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
	},

	-- UI DisplayOrder layers
	Layers = {
		HUD = 10,
		Panels = 20,
		Phone = 30,
		Modal = 40,
		Toast = 50,
		Tutorial = 60,
	},
}

return Theme
