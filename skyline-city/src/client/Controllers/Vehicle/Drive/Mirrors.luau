-- Mirrors: a working rear-view mirror widget (top centre while driving).
-- A ViewportFrame with its own Camera shows LOW-DETAIL proxies (pooled boxes) of the vehicles and
-- characters within Config/Driving.Mirror.Range behind the car, plus a ground plane, refreshed at
-- ~15 Hz. The image is mirrored left↔right like a real mirror (proxies are reflected into mirror space).
-- Disabled on LowGraphics. Cheap: no world parts are cloned, nearby cars are found by a 1 Hz scan of
-- top-level workspace children / folders (never per-frame).
--
--   local m = Mirrors.new(model, chassis, parentGui)
--   m:Update(dt)  m:SetVisible(bool)  m:IsVisible()  m:Destroy()

local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Driving = require(Shared.Config.Driving)
local Pool = require(Shared.Util.Pool)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))

local M = Driving.Mirror

-- workspace folders whose every Model is a vehicle (TrafficController's client-side NPC cars)
local TRAFFIC_FOLDERS = { NPCTraffic = true }

local Mirrors = {}
Mirrors.__index = Mirrors

local extentsCache: { [Instance]: Vector3 } = setmetatable({}, { __mode = "k" }) :: any
local colorCache: { [Instance]: Color3 } = setmetatable({}, { __mode = "k" }) :: any

local function isVehicle(m: Instance): boolean
	if not m:IsA("Model") then
		return false
	end
	return m:GetAttribute("CarUid") ~= nil
		or m:GetAttribute("ModelId") ~= nil
		or m:GetAttribute("IsTraffic") == true
		or m:FindFirstChild("DriveSeat") ~= nil
end

local function extentsOf(model: Model): Vector3
	local e = extentsCache[model]
	if not e then
		local ok, size = pcall(function()
			return model:GetExtentsSize()
		end)
		e = ok and size or Vector3.new(6, 4, 12)
		extentsCache[model] = e
	end
	return e
end

local function colorOf(model: Model): Color3
	local c = colorCache[model]
	if not c then
		c = Color3.fromRGB(150, 150, 160)
		local body = model:FindFirstChild("Body")
		local search = body or model
		for _, d in ipairs(search:GetDescendants()) do
			if d:IsA("BasePart") and d:GetAttribute("Paint") == true then
				c = d.Color
				break
			end
		end
		colorCache[model] = c
	end
	return c
end

-- Reflect a world CFrame into mirror space (camera at identity looking down -Z, x flipped).
local function reflect(mirrorCF: CFrame, cf: CFrame): CFrame
	local rel = mirrorCF:ToObjectSpace(cf)
	local p = rel.Position
	local pos = Vector3.new(-p.X, p.Y, p.Z)
	local look = rel.LookVector
	local up = rel.UpVector
	local rLook = Vector3.new(-look.X, look.Y, look.Z)
	local rUp = Vector3.new(-up.X, up.Y, up.Z)
	return CFrame.lookAt(pos, pos + rLook, rUp)
end

function Mirrors.new(model: Model, chassis: any, parentGui: Instance)
	local self = setmetatable({}, Mirrors)
	self.Model = model
	self.Chassis = chassis
	self.Accum = 0
	self.ScanAccum = M.ScanInterval
	self.Candidates = {}
	self.Active = {} -- target -> { parts }
	self.Visible = M.Enabled

	local frame = Kit.new("Frame", {
		Name = "RearMirror",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 8),
		Size = UDim2.fromOffset(M.Size.X + 10, M.Size.Y + 10),
		BackgroundColor3 = Color3.fromRGB(12, 12, 16),
		Parent = parentGui,
	})
	Kit.Corner(frame, UDim.new(0, 16))
	Kit.Stroke(frame, Theme.Colors.Stroke, 2, 0.1)
	local vp = Kit.new("ViewportFrame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(1, -10, 1, -10),
		BackgroundColor3 = Color3.fromRGB(150, 190, 235),
		Ambient = Color3.fromRGB(160, 160, 170),
		LightColor = Color3.fromRGB(255, 250, 240),
		LightDirection = Vector3.new(-0.3, -1, -0.4),
		Parent = frame,
	})
	Kit.Corner(vp, UDim.new(0, 12))
	local cam = Instance.new("Camera")
	cam.FieldOfView = M.Fov
	cam.CFrame = CFrame.identity
	cam.Parent = vp
	vp.CurrentCamera = cam
	self.Frame = frame
	self.Viewport = vp
	self.Camera = cam

	local ground = Kit.new("Part", {
		Anchored = true,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		CastShadow = false,
		Size = Vector3.new(700, 0.2, 700),
		Color = Color3.fromRGB(62, 64, 70),
		Material = Enum.Material.SmoothPlastic,
		Parent = vp,
	})
	self.Ground = ground

	self.Pool = Pool.new(function()
		return Kit.new("Part", {
			Anchored = true,
			CanCollide = false,
			CanQuery = false,
			CanTouch = false,
			CastShadow = false,
			Material = Enum.Material.SmoothPlastic,
			Size = Vector3.one,
		})
	end, 8, 64)

	self:SetVisible(self.Visible)
	return self
end

function Mirrors:SetVisible(on: boolean)
	local low = Players.LocalPlayer:GetAttribute("LowGraphics") == true
	self.Visible = on
	self.Frame.Visible = on and not low
	if not self.Frame.Visible then
		self:_ReleaseAll()
	end
end

function Mirrors:IsVisible(): boolean
	return self.Frame.Visible
end

function Mirrors:_ReleaseAll()
	for target, parts in pairs(self.Active) do
		for _, p in ipairs(parts) do
			self.Pool:Release(p)
		end
		self.Active[target] = nil
	end
end

function Mirrors:_Scan()
	local list = {}
	local own = self.Model
	local function consider(inst: Instance)
		if inst ~= own and isVehicle(inst) then
			table.insert(list, inst)
		end
	end
	for _, child in ipairs(Workspace:GetChildren()) do
		if child:IsA("Model") then
			consider(child)
		elseif child:IsA("Folder") then
			local traffic = TRAFFIC_FOLDERS[child.Name] == true
			for _, sub in ipairs(child:GetChildren()) do
				if sub:IsA("Model") then
					if traffic then
						table.insert(list, sub) -- client-side NPC traffic cars carry no attributes
					else
						consider(sub)
					end
				elseif sub:IsA("Folder") then
					for _, sub2 in ipairs(sub:GetChildren()) do
						if sub2:IsA("Model") then
							consider(sub2)
						end
					end
				end
			end
		end
	end
	self.Candidates = list
end

function Mirrors:_Acquire(target: Instance, count: number): { BasePart }
	local parts = self.Active[target]
	if not parts then
		parts = {}
		for _ = 1, count do
			local p = self.Pool:Get() :: BasePart
			p.Parent = self.Viewport
			table.insert(parts, p)
		end
		self.Active[target] = parts
	end
	return parts
end

function Mirrors:Update(dt: number)
	if not self.Frame.Visible then
		if self.Visible and Players.LocalPlayer:GetAttribute("LowGraphics") ~= true then
			self.Frame.Visible = true
		end
		return
	end
	if Players.LocalPlayer:GetAttribute("LowGraphics") == true then
		self:SetVisible(self.Visible)
		return
	end
	self.ScanAccum += dt
	if self.ScanAccum >= M.ScanInterval then
		self.ScanAccum = 0
		self:_Scan()
	end
	self.Accum += dt
	if self.Accum < 1 / M.UpdateRate then
		return
	end
	self.Accum = 0

	local chassis = self.Chassis
	local basis = chassis:GetBasis()
	local geo = chassis.Geo
	local mirrorsFolder = self.Model:FindFirstChild("Mirrors")
	local centre = mirrorsFolder and mirrorsFolder:FindFirstChild("Mirror_C")
	local origin
	if centre and centre:IsA("BasePart") then
		origin = centre.Position
	else
		origin = (basis * CFrame.new(0, geo.Height * 0.35, -geo.Length * 0.05)).Position
	end
	-- looking backwards, same up as the car
	local mirrorCF = CFrame.lookAt(origin, origin - basis.LookVector, basis.UpVector)
		* CFrame.new(0, 0, -geo.Length * 0.55) -- start behind our own bodywork

	-- sky / light follows the time of day
	local clock = Lighting.ClockTime
	local day = math.clamp(1 - math.abs(clock - 12.5) / 7, 0, 1)
	self.Viewport.BackgroundColor3 = Color3.fromRGB(20, 26, 46):Lerp(Color3.fromRGB(150, 190, 235), day)
	self.Viewport.Ambient = Color3.fromRGB(60, 60, 80):Lerp(Color3.fromRGB(165, 165, 175), day)

	-- ground plane under the car
	local groundY = chassis:GetGroundY() or (origin.Y - geo.Height)
	local groundCF = CFrame.new(Vector3.new(origin.X, groundY - 0.1, origin.Z)) * basis.Rotation
	self.Ground.CFrame = reflect(mirrorCF, groundCF)

	-- gather targets in range & behind
	local range = M.Range
	local targets = {}
	local function behind(pos: Vector3): boolean
		local rel = mirrorCF:PointToObjectSpace(pos)
		return rel.Z < 2 and (pos - origin).Magnitude <= range
	end
	for _, car in ipairs(self.Candidates) do
		if car.Parent then
			local ok, pivot = pcall(car.GetPivot, car)
			if ok and behind(pivot.Position) then
				table.insert(targets, { Kind = "Car", Target = car, CFrame = pivot, Dist = (pivot.Position - origin).Magnitude })
			end
		end
	end
	local me = Players.LocalPlayer
	for _, plr in ipairs(Players:GetPlayers()) do
		if plr ~= me and plr.Character then
			local hrp = plr.Character:FindFirstChild("HumanoidRootPart")
			local hum = plr.Character:FindFirstChildOfClass("Humanoid")
			-- seated players are inside a car proxy already
			if hrp and hrp:IsA("BasePart") and not (hum and hum.SeatPart) and behind(hrp.Position) then
				table.insert(targets, { Kind = "Char", Target = plr.Character, CFrame = hrp.CFrame, Dist = (hrp.Position - origin).Magnitude })
			end
		end
	end
	table.sort(targets, function(a, b)
		return a.Dist < b.Dist
	end)

	local used = {}
	local count = 0
	for _, t in ipairs(targets) do
		if count >= M.MaxProxies then
			break
		end
		count += 1
		used[t.Target] = true
		if t.Kind == "Car" then
			local parts = self:_Acquire(t.Target, 2)
			local ext = extentsOf(t.Target)
			local body, cabin = parts[1], parts[2]
			body.Size = Vector3.new(ext.X, ext.Y * 0.5, ext.Z)
			body.Color = colorOf(t.Target)
			cabin.Size = Vector3.new(ext.X * 0.85, ext.Y * 0.4, ext.Z * 0.5)
			cabin.Color = Color3.fromRGB(40, 50, 62)
			local base = t.CFrame * CFrame.new(0, -ext.Y * 0.2, 0)
			body.CFrame = reflect(mirrorCF, base)
			cabin.CFrame = reflect(mirrorCF, base * CFrame.new(0, ext.Y * 0.45, ext.Z * 0.05))
		else
			local parts = self:_Acquire(t.Target, 1)
			local p = parts[1]
			p.Size = Vector3.new(2, 5, 1)
			local torso = t.Target:FindFirstChild("UpperTorso") or t.Target:FindFirstChild("Torso")
			p.Color = (torso and torso:IsA("BasePart")) and torso.Color or Color3.fromRGB(200, 170, 140)
			p.CFrame = reflect(mirrorCF, t.CFrame * CFrame.new(0, -0.5, 0))
		end
	end
	for target, parts in pairs(self.Active) do
		if not used[target] then
			for _, p in ipairs(parts) do
				self.Pool:Release(p)
			end
			self.Active[target] = nil
		end
	end
end

function Mirrors:Destroy()
	self:_ReleaseAll()
	self.Pool:Clear()
	if self.Frame then
		self.Frame:Destroy()
	end
end

return Mirrors
