-- EventFx (client helper): pooled event effects.
--   EventFx.Init(fxFolder)
--   EventFx.SetFireworks(on)        rockets + bursts over Config/CityLayout.EventSpots.Fireworks (night, when near)
--   EventFx.SetCarMeet(on)          cosmetic parked show cars with underglow at the meet lot (when near)
--   EventFx.Update(dt, focus, lowGraphics)  call every frame
--   EventFx.PartyTick(focus, lowGraphics)   ~2 Hz: confetti + party music inside active PartyZones

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Layout = require(Shared.Config.CityLayout)
local Config = require(Shared.Config.Events)
local Audio = require(Shared.Config.Audio)
local Pool = require(Shared.Util.Pool)

local NpcModels = require(script.Parent:WaitForChild("NpcModels"))

local EventFx = {}

local FW = Config.Fireworks
local rng = Random.new()
local folder: Folder
local rocketPool, burstPool
local rockets = {}
local fireworksOn = false
local launchTimer = 0
local meetCars = {}
local carMeetOn = false
local confetti: { [BasePart]: Part } = {}
local music: Sound? = nil
local musicTrack = 0

local function basePart(name: string, size: Vector3): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Size = size
	return p
end

local function newRocket(): Instance
	local p = basePart("Rocket", Vector3.new(0.6, 1.6, 0.6))
	p.Material = Enum.Material.Neon
	local trail = Instance.new("ParticleEmitter")
	trail.Name = "Trail"
	trail.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	trail.LightEmission = 1
	trail.Size = NumberSequence.new(0.6, 0)
	trail.Lifetime = NumberRange.new(0.3, 0.6)
	trail.Speed = NumberRange.new(2, 4)
	trail.SpreadAngle = Vector2.new(20, 20)
	trail.EmissionDirection = Enum.NormalId.Bottom
	trail.Rate = 60
	trail.Parent = p
	return p
end

local function newBurst(): Instance
	local p = basePart("Burst", Vector3.new(1, 1, 1))
	p.Transparency = 1
	local e = Instance.new("ParticleEmitter")
	e.Name = "Sparks"
	e.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	e.LightEmission = 1
	e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1.6), NumberSequenceKeypoint.new(1, 0) })
	e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(0.7, 0.2), NumberSequenceKeypoint.new(1, 1) })
	e.Lifetime = NumberRange.new(1.4, 2.2)
	e.Speed = NumberRange.new(40, 60)
	e.SpreadAngle = Vector2.new(180, 180)
	e.Drag = 2.2
	e.Acceleration = Vector3.new(0, -14, 0)
	e.Rate = 0
	e.Parent = p
	local light = Instance.new("PointLight")
	light.Name = "Flash"
	light.Range = 60
	light.Brightness = 0
	light.Shadows = false
	light.Parent = p
	return p
end

function EventFx.Init(fx: Folder)
	folder = fx
	rocketPool = Pool.new(newRocket, 2, 12)
	burstPool = Pool.new(newBurst, 2, 12)
end

---------------------------------------------------------------------------
-- Fireworks
---------------------------------------------------------------------------
function EventFx.SetFireworks(on: boolean)
	fireworksOn = on
	if not on then
		for _, r in ipairs(rockets) do
			rocketPool:Release(r.Part)
		end
		table.clear(rockets)
	end
end

local function burst(pos: Vector3, color: Color3)
	local b = burstPool:Get() :: Part
	b.CFrame = CFrame.new(pos)
	b.Parent = folder
	local sparks = b:FindFirstChild("Sparks") :: ParticleEmitter
	local second = FW.Colors[rng:NextInteger(1, #FW.Colors)]
	sparks.Color = ColorSequence.new(color, second)
	sparks:Emit(90)
	local flash = b:FindFirstChild("Flash") :: PointLight
	flash.Color = color
	flash.Brightness = 6
	TweenService:Create(flash, TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Brightness = 0 }):Play()
	task.delay(2.6, function()
		burstPool:Release(b)
	end)
end

local function launch(lowGraphics: boolean, focus: Vector3)
	local sites = Layout.EventSpots.Fireworks
	local near = {}
	for _, s in ipairs(sites) do
		if (s - focus).Magnitude < FW.ViewDistance then
			table.insert(near, s)
		end
	end
	if #near == 0 then
		return
	end
	local maxR = lowGraphics and FW.LowGraphicsMaxRockets or FW.MaxRockets
	if #rockets >= maxR then
		return
	end
	local site = near[rng:NextInteger(1, #near)]
	local p = rocketPool:Get() :: Part
	local color = FW.Colors[rng:NextInteger(1, #FW.Colors)]
	p.Color = color
	local start = site + Vector3.new(rng:NextNumber(-12, 12), 2, rng:NextNumber(-12, 12))
	p.CFrame = CFrame.new(start)
	p.Parent = folder
	table.insert(rockets, {
		Part = p,
		Pos = start,
		Vel = Vector3.new(rng:NextNumber(-6, 6), rng:NextNumber(FW.RiseSpeed[1], FW.RiseSpeed[2]), rng:NextNumber(-6, 6)),
		Burst = site.Y + rng:NextNumber(FW.BurstHeight[1], FW.BurstHeight[2]),
		Color = color,
	})
end

---------------------------------------------------------------------------
-- Car meet show cars
---------------------------------------------------------------------------
function EventFx.SetCarMeet(on: boolean)
	carMeetOn = on
end

local SHOW_COLORS = {
	Color3.fromRGB(255, 40, 60),
	Color3.fromRGB(20, 20, 24),
	Color3.fromRGB(250, 200, 40),
	Color3.fromRGB(60, 200, 255),
	Color3.fromRGB(150, 60, 255),
	Color3.fromRGB(240, 240, 240),
	Color3.fromRGB(40, 170, 90),
	Color3.fromRGB(255, 120, 30),
}

local function spawnMeetCars()
	local spots = Layout.EventSpots.CarMeet.Spots
	local parts, cframes = {}, {}
	for i, spot in ipairs(spots) do
		local car = NpcModels.Car(SHOW_COLORS[((i - 1) % #SHOW_COLORS) + 1])
		car.Model.Name = "MeetCar"
		local glow = Instance.new("PointLight")
		glow.Color = SHOW_COLORS[(i % #SHOW_COLORS) + 1]
		glow.Range = 12
		glow.Brightness = 3
		glow.Parent = car.Parts[1]
		NpcModels.SetCarLights(car, true)
		local cf = CFrame.new(spot.Position) * CFrame.Angles(0, spot.Yaw or 0, 0)
		NpcModels.PoseCar(car, cf, parts, cframes)
		car.Model.Parent = folder
		table.insert(meetCars, car)
	end
	Workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
end

local function clearMeetCars()
	for _, car in ipairs(meetCars) do
		car.Model:Destroy()
	end
	table.clear(meetCars)
end

---------------------------------------------------------------------------
-- Per frame
---------------------------------------------------------------------------
function EventFx.Update(dt: number, focus: Vector3?, lowGraphics: boolean)
	if fireworksOn and focus then
		launchTimer -= dt
		if launchTimer <= 0 then
			launchTimer = rng:NextNumber(FW.LaunchInterval[1], FW.LaunchInterval[2])
			launch(lowGraphics, focus)
		end
	end
	if #rockets > 0 then
		local parts, cframes = {}, {}
		for i = #rockets, 1, -1 do
			local r = rockets[i]
			r.Vel += Vector3.new(0, -18 * dt, 0)
			r.Pos += r.Vel * dt
			if r.Pos.Y >= r.Burst or r.Vel.Y <= 0 then
				burst(r.Pos, r.Color)
				rocketPool:Release(r.Part)
				table.remove(rockets, i)
			else
				table.insert(parts, r.Part)
				table.insert(cframes, CFrame.lookAt(r.Pos, r.Pos + r.Vel) * CFrame.Angles(-math.pi / 2, 0, 0))
			end
		end
		if #parts > 0 then
			Workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
		end
	end
	-- car meet cosmetics follow distance
	if focus then
		local near = carMeetOn and (Layout.EventSpots.CarMeet.Center - focus).Magnitude < Config.CarMeetViewDistance
		if near and #meetCars == 0 then
			spawnMeetCars()
		elseif not near and #meetCars > 0 then
			clearMeetCars()
		end
	end
end

---------------------------------------------------------------------------
-- Party zones (confetti + music)
---------------------------------------------------------------------------
local function insideZone(zone: BasePart, pos: Vector3, margin: number): boolean
	local rel = zone.CFrame:PointToObjectSpace(pos)
	local h = zone.Size / 2
	return math.abs(rel.X) <= h.X + margin and math.abs(rel.Y) <= h.Y + margin and math.abs(rel.Z) <= h.Z + margin
end

local function confettiFor(zone: BasePart, lowGraphics: boolean): Part
	local c = confetti[zone]
	if c and c.Parent then
		return c
	end
	c = basePart("Confetti", Vector3.new(zone.Size.X * 0.8, 1, zone.Size.Z * 0.8))
	c.Transparency = 1
	local e = Instance.new("ParticleEmitter")
	e.Name = "Confetti"
	e.Shape = Enum.ParticleEmitterShape.Box
	e.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
	e.EmissionDirection = Enum.NormalId.Bottom
	local cols = Config.Confetti.Colors
	local keys = {}
	for i, col in ipairs(cols) do
		table.insert(keys, ColorSequenceKeypoint.new((i - 1) / math.max(1, #cols - 1), col))
	end
	e.Color = ColorSequence.new(keys)
	e.Size = NumberSequence.new(0.35)
	e.Lifetime = NumberRange.new(3, 4.5)
	e.Speed = NumberRange.new(4, 8)
	e.Rotation = NumberRange.new(0, 360)
	e.RotSpeed = NumberRange.new(-200, 200)
	e.Acceleration = Vector3.new(0, -3, 0)
	e.Drag = 0.6
	e.SpreadAngle = Vector2.new(30, 30)
	e.LightEmission = 0.3
	e.Rate = lowGraphics and Config.Confetti.LowGraphicsRate or Config.Confetti.Rate
	e.Parent = c
	c.CFrame = zone.CFrame * CFrame.new(0, zone.Size.Y / 2 - 1, 0)
	c.Parent = folder
	confetti[zone] = c
	return c
end

local function nextTrack(): string?
	local tracks = Audio.Club and Audio.Club.Tracks or {}
	if #tracks == 0 then
		return nil
	end
	musicTrack = musicTrack % #tracks + 1
	return tracks[musicTrack]
end

function EventFx.PartyTick(focus: Vector3?, lowGraphics: boolean)
	local inParty = false
	for _, inst in ipairs(CollectionService:GetTagged(World.Tags.PartyZone)) do
		if inst:IsA("BasePart") then
			local zone = inst :: BasePart
			local on = zone:GetAttribute("Active") == true
			local nearZone = on and focus ~= nil and insideZone(zone, focus, 80)
			-- confetti only for outdoor event zones (the club is always "on")
			if nearZone and zone:GetAttribute("Zone") ~= "Club" then
				local c = confettiFor(zone, lowGraphics)
				local e = c:FindFirstChild("Confetti") :: ParticleEmitter
				e.Rate = lowGraphics and Config.Confetti.LowGraphicsRate or Config.Confetti.Rate
			elseif confetti[zone] then
				confetti[zone]:Destroy()
				confetti[zone] = nil
			end
			if on and focus and insideZone(zone, focus, 0) then
				inParty = true
			end
		end
	end
	for zone, c in pairs(confetti) do
		if not zone.Parent then
			c:Destroy()
			confetti[zone] = nil
		end
	end
	-- party music (only when track ids exist)
	if inParty then
		if not music then
			local id = nextTrack()
			if id then
				local s = Instance.new("Sound")
				s.Name = "PartyMusic"
				s.SoundId = id
				s.Volume = 0
				s.Parent = SoundService
				s.Ended:Connect(function()
					local nextId = nextTrack()
					if nextId and music == s then
						s.SoundId = nextId
						s:Play()
					end
				end)
				s:Play()
				music = s
				TweenService:Create(s, TweenInfo.new(1.5), { Volume = Config.PartyMusicVolume }):Play()
			end
		end
	elseif music then
		local s = music
		music = nil
		local t = TweenService:Create(s, TweenInfo.new(1.5), { Volume = 0 })
		t.Completed:Once(function()
			s:Destroy()
		end)
		t:Play()
	end
end

return EventFx
