-- Parties (SocialService helper): player-hosted parties at the host's location.
--
--   Parties.Setup(deps)                          deps = { NotifyService, Phone = () -> PhoneService? }
--   Parties.Start(host, name) -> (party?, err?)  name must already be filtered
--   Parties.End(id, reason?)
--   Parties.EndFor(host)                         (host left / ended it)
--   Parties.List() -> { public party }
--
-- Each party has a persistent (always streamed) marker model in Workspace.SkylineParties with a billboard,
-- light and sparkles. Parties expire after Config.Social.Parties.DurationMinutes.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local SocialConfig = require(Shared.Config.Social)

local CFG = SocialConfig.Parties

local Parties = {}

local deps: any = nil
local parties: { [string]: any } = {}
local lastHosted: { [number]: number } = {}
local nextId = 0
local folder: Folder? = nil

local function getFolder(): Folder
	if folder and folder.Parent then
		return folder
	end
	local f = Workspace:FindFirstChild("SkylineParties")
	if not f then
		f = Instance.new("Folder")
		f.Name = "SkylineParties"
		f.Parent = Workspace
	end
	folder = f :: Folder
	return folder :: Folder
end

local function displayName(p: Player): string
	local rp = p:GetAttribute("RPName")
	if type(rp) == "string" and rp ~= "" then
		return rp
	end
	return p.DisplayName
end

local function public(party)
	return {
		Id = party.Id,
		Name = party.Name,
		HostUserId = party.HostUserId,
		HostName = party.HostName,
		Position = party.Position,
		District = party.District,
		EndsAt = party.EndsAt,
	}
end

local function buildMarker(party): Model
	local model = Instance.new("Model")
	model.Name = "Party_" .. party.Id
	model.ModelStreamingMode = Enum.ModelStreamingMode.Persistent
	model:SetAttribute("PartyId", party.Id)

	local anchor = Instance.new("Part")
	anchor.Name = "Marker"
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanQuery = false
	anchor.CanTouch = false
	anchor.CastShadow = false
	anchor.Transparency = 1
	anchor.Size = Vector3.new(1, 1, 1)
	anchor.Position = party.Position + Vector3.new(0, 7, 0)
	anchor.Parent = model
	model.PrimaryPart = anchor

	local ring = Instance.new("Part")
	ring.Name = "Ring"
	ring.Shape = Enum.PartType.Cylinder
	ring.Anchored = true
	ring.CanCollide = false
	ring.CanQuery = false
	ring.CanTouch = false
	ring.CastShadow = false
	ring.Material = Enum.Material.Neon
	ring.Color = CFG.MarkerColor
	ring.Transparency = 0.55
	ring.Size = Vector3.new(0.2, 26, 26)
	ring.CFrame = CFrame.new(party.Position - Vector3.new(0, 2.6, 0)) * CFrame.Angles(0, 0, math.rad(90))
	ring.Parent = model

	local light = Instance.new("PointLight")
	light.Color = CFG.MarkerColor
	light.Brightness = 3
	light.Range = 24
	light.Parent = anchor

	local sparkles = Instance.new("ParticleEmitter")
	sparkles.Rate = 12
	sparkles.Lifetime = NumberRange.new(1.5, 2.5)
	sparkles.Speed = NumberRange.new(3, 6)
	sparkles.SpreadAngle = Vector2.new(60, 60)
	sparkles.Color = ColorSequence.new(CFG.MarkerColor, Color3.fromRGB(120, 200, 255))
	sparkles.LightEmission = 0.8
	sparkles.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.6), NumberSequenceKeypoint.new(1, 0) })
	sparkles.Parent = anchor

	local gui = Instance.new("BillboardGui")
	gui.Name = "PartyTag"
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.MaxDistance = CFG.MarkerMaxDistance
	gui.Size = UDim2.fromOffset(220, 58)
	gui.StudsOffset = Vector3.new(0, 1, 0)
	gui.Parent = anchor

	local bg = Instance.new("Frame")
	bg.Size = UDim2.fromScale(1, 1)
	bg.BackgroundColor3 = Color3.fromRGB(26, 20, 40)
	bg.BackgroundTransparency = 0.2
	bg.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 12)
	corner.Parent = bg
	local stroke = Instance.new("UIStroke")
	stroke.Color = CFG.MarkerColor
	stroke.Thickness = 2
	stroke.Parent = bg

	local title = Instance.new("TextLabel")
	title.BackgroundTransparency = 1
	title.Size = UDim2.new(1, -12, 0.6, 0)
	title.Position = UDim2.fromOffset(6, 2)
	title.Font = Enum.Font.GothamBlack
	title.TextScaled = true
	title.TextColor3 = Color3.new(1, 1, 1)
	title.Text = "🎉 " .. party.Name
	title.Parent = bg

	local host = Instance.new("TextLabel")
	host.BackgroundTransparency = 1
	host.Size = UDim2.new(1, -12, 0.34, 0)
	host.Position = UDim2.new(0, 6, 0.62, 0)
	host.Font = Enum.Font.GothamMedium
	host.TextScaled = true
	host.TextColor3 = Color3.fromRGB(230, 200, 255)
	host.Text = "Hosted by " .. party.HostName
	host.Parent = bg

	model.Parent = getFolder()
	return model
end

function Parties.Setup(d)
	deps = d
end

function Parties.List()
	local out = {}
	for _, party in pairs(parties) do
		table.insert(out, public(party))
	end
	table.sort(out, function(a, b)
		return a.EndsAt < b.EndsAt
	end)
	return out
end

function Parties.End(id: string, reason: string?)
	local party = parties[id]
	if not party then
		return
	end
	parties[id] = nil
	if party.Marker then
		party.Marker:Destroy()
	end
	if party.Timer then
		pcall(task.cancel, party.Timer)
	end
	Net.FireAll("PhoneEvent", "PartyEnded", { Id = id, Reason = reason or "ended" })
end

function Parties.EndFor(host: Player)
	for id, party in pairs(parties) do
		if party.HostUserId == host.UserId then
			Parties.End(id, "host")
		end
	end
end

function Parties.Start(host: Player, name: string)
	local root = host.Character and host.Character:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return nil, "Spawn in first"
	end
	if host:GetAttribute("InVehicle") == true then
		return nil, "Get out of your vehicle first"
	end
	for _, party in pairs(parties) do
		if party.HostUserId == host.UserId then
			return nil, "You're already hosting a party"
		end
	end
	local count = 0
	for _ in pairs(parties) do
		count += 1
	end
	if count >= CFG.MaxActive then
		return nil, "Too many parties in this server right now"
	end
	local last = lastHosted[host.UserId]
	local cooldown = CFG.CooldownMinutes * 60
	if last and os.clock() - last < cooldown then
		local left = math.ceil((cooldown - (os.clock() - last)) / 60)
		return nil, ("You can host another party in %d min"):format(left)
	end
	lastHosted[host.UserId] = os.clock()

	nextId += 1
	local district = host:GetAttribute("District")
	local party = {
		Id = "p_" .. nextId,
		Name = name,
		HostUserId = host.UserId,
		HostName = displayName(host),
		Position = root.Position,
		District = type(district) == "string" and district or "",
		EndsAt = os.time() + CFG.DurationMinutes * 60,
	}
	party.Marker = buildMarker(party)
	parties[party.Id] = party
	party.Timer = task.delay(CFG.DurationMinutes * 60, function()
		party.Timer = nil
		Parties.End(party.Id, "expired")
	end)

	local where = party.District ~= "" and (" in " .. party.District) or ""
	local phone = deps.Phone()
	if phone and phone.PostToFeed then
		pcall(phone.PostToFeed, phone, host, ("🎉 %s is throwing a party: \"%s\"%s! Open Maps to find it."):format(party.HostName, name, where))
	end
	deps.NotifyService:SendAll(("🎉 %s started a party: \"%s\"%s!"):format(party.HostName, name, where), "info", 6)
	Net.FireAll("PhoneEvent", "Party", public(party))
	return public(party), nil
end

Players.PlayerRemoving:Connect(function(player)
	Parties.EndFor(player)
end)

return Parties
