-- SOCIAL CONFIG — name tags, RP profile, groups, parties, emotes, seats and moderation.
-- Change values freely; no code changes needed.

local Social = {}

---------------------------------------------------------------------------
-- Roleplay profile
---------------------------------------------------------------------------
Social.Profile = {
	RPNameMax = 24, -- characters
	RPNameMin = 2,
	BioMax = 60,
	ChangeCooldown = 5, -- seconds between profile edits
}

---------------------------------------------------------------------------
-- Name tags (BillboardGui on every character's head, built by the server)
---------------------------------------------------------------------------
Social.NameTags = {
	MaxDistance = 60, -- studs; tags fade out beyond this
	SizeStuds = Vector2.new(7, 2.6), -- billboard size in studs (scales with distance)
	StudsOffset = Vector3.new(0, 2.3, 0),
	ShowOwnTag = false, -- show your own tag above your head (client-local)
	NameColor = Color3.fromRGB(255, 255, 255),
	BioColor = Color3.fromRGB(205, 210, 225),
	GroupColor = Color3.fromRGB(150, 220, 255),
	VipColor = Color3.fromRGB(255, 196, 40),
}

---------------------------------------------------------------------------
-- Family / friend groups (in-server; GroupId + name saved per member)
---------------------------------------------------------------------------
Social.Groups = {
	MaxMembers = 8,
	NameMax = 24,
	NameMin = 3,
	InviteSeconds = 60, -- invites expire after this long
	MembersCanInvite = false, -- false = only the leader can invite
	ActionCooldown = 2, -- seconds between group actions per player
}

---------------------------------------------------------------------------
-- Parties (StartParty at your location)
---------------------------------------------------------------------------
Social.Parties = {
	DurationMinutes = 20, -- parties expire after this long
	CooldownMinutes = 10, -- per host, between parties
	NameMax = 32,
	NameMin = 3,
	MaxActive = 6, -- per server
	MarkerColor = Color3.fromRGB(255, 94, 200),
	MarkerMaxDistance = 2000, -- studs the party billboard is visible from
}

---------------------------------------------------------------------------
-- RPSeat seats (CollectionService tag "RPSeat", attr Pose = "Sit" | "Sleep")
---------------------------------------------------------------------------
Social.Seats = {
	UseDistance = 10, -- studs
	PromptDistance = 8,
	PromptHoldSeconds = 0,
}

---------------------------------------------------------------------------
-- Poses (character attribute "Pose", rendered by every client procedurally)
--   Ids must match the client PoseRenderer.
---------------------------------------------------------------------------
Social.Poses = {
	SitGround = true,
	Lay = true,
	Sleep = true, -- in an RPSeat (bed)
	Salute = true,
}

---------------------------------------------------------------------------
-- Emote wheel (EmoteController). Kind = "Emote" uses Humanoid:PlayEmote(Emote) with the default R15
-- emotes; Kind = "Pose" uses a procedural pose (no animation assets needed).
---------------------------------------------------------------------------
Social.Emotes = {
	{ Id = "wave", Name = "Wave", Icon = "👋", Kind = "Emote", Emote = "wave" },
	{ Id = "dance", Name = "Dance", Icon = "💃", Kind = "Emote", Emote = "dance" },
	{ Id = "dance2", Name = "Dance 2", Icon = "🕺", Kind = "Emote", Emote = "dance2" },
	{ Id = "dance3", Name = "Dance 3", Icon = "🪩", Kind = "Emote", Emote = "dance3" },
	{ Id = "point", Name = "Point", Icon = "👉", Kind = "Emote", Emote = "point" },
	{ Id = "cheer", Name = "Cheer", Icon = "🙌", Kind = "Emote", Emote = "cheer" },
	{ Id = "laugh", Name = "Laugh", Icon = "😂", Kind = "Emote", Emote = "laugh" },
	{ Id = "salute", Name = "Salute", Icon = "🫡", Kind = "Pose", Pose = "Salute", Seconds = 4 },
	{ Id = "sit", Name = "Sit", Icon = "🧘", Kind = "Pose", Pose = "SitGround" },
	{ Id = "sleep", Name = "Lay Down", Icon = "😴", Kind = "Pose", Pose = "Lay" },
}
Social.EmoteKey = Enum.KeyCode.B
Social.EmoteGamepadKey = Enum.KeyCode.DPadDown -- opens the wheel on foot (ignored while a menu is selected)
Social.EmoteHudOrder = 60
Social.PoseRenderDistance = 150 -- studs; poses further away are not rendered (saves CPU)

---------------------------------------------------------------------------
-- Moderation
---------------------------------------------------------------------------
Social.Moderation = {
	ReportStore = "SkylineCity_Reports_v1",
	ReportCooldown = 60, -- seconds between reports per reporter
	ReportTextMax = 300,
	ReportCategories = { "Bullying", "Scamming", "Exploiting", "Inappropriate", "Other" },
	MaxBlocked = 200,
	-- Admins may use "/kick <name> [reason]" in chat. Add Roblox user ids here.
	AdminUserIds = {
		-- 123456789,
	},
	CreatorIsAdmin = true, -- the place owner (user-owned places) is always an admin
	KickMessage = "You were removed from this SKYLINE CITY server by a moderator.",
}

---------------------------------------------------------------------------
-- Voice-chat hangouts (tag "VoiceZone")
---------------------------------------------------------------------------
Social.VoiceZones = {
	CheckHz = 2,
	ChipText = "🎙️ Voice Hangout",
}

---------------------------------------------------------------------------
-- Player interaction prompt (client-side ProximityPrompt on other characters)
---------------------------------------------------------------------------
Social.Interact = {
	Distance = 8,
	-- T: G is the job action key (Config.Jobs.Keybinds.Action), E is used by world prompts, F by business / cars
	KeyboardKey = Enum.KeyCode.T,
	GamepadKey = Enum.KeyCode.DPadUp,
}

return Social
