-- HouseShell (server helper): procedural home geometry.
--
--   HouseShell.StarterBuild(tier) -> build table
--       Owned / rented HOUSES start with a free, fully editable layout made of normal build items
--       (walls, windows, front door, floor, roof, path). Starter items are flagged Free (no sell-back).
--   HouseShell.BuildInterior(parent, origin, size, floors, tier) -> (shellModel, doorModel)
--       APARTMENTS get a fixed interior shell (not editable: floor, walls with windows / glass, ceiling,
--       entrance door, mezzanine floors for duplexes). Walls and floors carry attribute Surface for wallpaper.
--   HouseShell.BuildSign(parent, origin, size, isApartment) -> sign part
--   HouseShell.UpdateSign(sign, title, subtitle, locked)
--   HouseShell.BuildElevator(parent, lobbyCF, unitCF, opts) -> Model   private elevator for elevated Sky Apartments
--       opts = { CanUse = fn(player) -> bool, Teleport = fn(player, cframe), OnDenied = fn(player) }

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local HousingConfig = require(Shared.Config.Housing)
local BuildMath = require(Shared.Build.BuildMath)
local Serializer = require(Shared.Build.Serializer)

local HouseShell = {}

local FH = HousingConfig.Build.FloorHeight
local WT = 0.6

---------------------------------------------------------------------------
-- Starter layout (houses)
---------------------------------------------------------------------------
function HouseShell.StarterLayout(tier): { { ItemId: string, Position: Vector3, Step: number } }
	local out = {}
	local foot: Vector2? = tier.StarterFootprint
	if not foot then
		return out
	end
	local P = tier.PlotSize
	local W = math.min(foot.X, P.X - 8)
	local D = math.min(foot.Y, P.Y - 16)
	W = math.max(8, W - W % 8)
	D = math.max(8, D - D % 8)
	-- push the house towards the back to leave a front yard
	local z0 = -math.max(0, (P.Y - D) / 4)
	local function add(id: string, x: number, y: number, z: number, step: number)
		table.insert(out, { ItemId = id, Position = BuildMath.RoundVector(Vector3.new(x, y, z)), Step = step })
	end

	local nx, nz = W // 8, D // 8
	local frontZ = z0 + D / 2 - WT / 2
	local backZ = z0 - D / 2 + WT / 2
	local doorIndex = nx // 2
	for i = 0, nx - 1 do
		local x = -W / 2 + 4 + 8 * i
		if i == doorIndex then
			add("wall_door_8", x, 0, frontZ, 0)
			add("door_basic", x, 0, frontZ, 0)
		elseif i % 2 == 1 then
			add("wall_window_8", x, 0, frontZ, 0)
		else
			add("wall_8", x, 0, frontZ, 0)
		end
		add(i % 2 == 0 and "wall_window_8" or "wall_8", x, 0, backZ, 0)
	end
	for j = 0, nz - 1 do
		local z = z0 - D / 2 + 4 + 8 * j
		local id = (j % 2 == 1) and "wall_window_8" or "wall_8"
		add(id, -W / 2 + WT / 2, 0, z, 6)
		add(id, W / 2 - WT / 2, 0, z, 6)
	end
	for i = 0, nx - 1 do
		for j = 0, nz - 1 do
			local x = -W / 2 + 4 + 8 * i
			local z = z0 - D / 2 + 4 + 8 * j
			add("floor_8", x, 0, z, 0)
			add("roof_flat_8", x, FH, z, 0)
		end
	end
	-- path from the door to the street + a little garden
	local doorX = -W / 2 + 4 + 8 * doorIndex
	local z = z0 + D / 2 + 2
	while z + 2 <= P.Y / 2 - 0.5 do
		add("path_stone", doorX, 0, z, 0)
		z += 4
	end
	if doorX - 4 - 1.5 > -P.X / 2 then
		add("bush", doorX - 4, 0, z0 + D / 2 + 2.5, 0)
	end
	if doorX + 4 + 1.5 < P.X / 2 then
		add("bush", doorX + 4, 0, z0 + D / 2 + 2.5, 0)
	end
	local mailX = math.clamp(doorX + 6, -P.X / 2 + 1, P.X / 2 - 1)
	add("mailbox", mailX, 0, P.Y / 2 - 1.5, 0)
	return out
end

function HouseShell.StarterBuild(tier)
	if tier.Catalog ~= "House" then
		return Serializer.NewBuild()
	end
	local entries = {}
	local n = 0
	for _, item in ipairs(HouseShell.StarterLayout(tier)) do
		n += 1
		local uid = tostring(n)
		entries[uid] = {
			Uid = uid,
			ItemId = item.ItemId,
			Position = item.Position,
			Step = item.Step,
			Paid = 0,
			Free = true,
		}
	end
	return Serializer.EncodeBuild(entries, n + 1, {})
end

---------------------------------------------------------------------------
-- Part helper
---------------------------------------------------------------------------
local function make(className: string, parent: Instance, props: { [string]: any }): BasePart
	local p = Instance.new(className) :: BasePart
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CanTouch = false
	for k, v in pairs(props) do
		(p :: any)[k] = v
	end
	p.Parent = parent
	return p
end

---------------------------------------------------------------------------
-- Apartment interior shell
---------------------------------------------------------------------------
function HouseShell.BuildInterior(parent: Instance, origin: CFrame, size: Vector3, floors: number, tier)
	local shellCfg = tier.Shell or {}
	local wallColor: Color3 = shellCfg.Wall or Color3.fromRGB(235, 232, 225)
	local floorColor: Color3 = shellCfg.Floor or Color3.fromRGB(160, 120, 86)
	local floorMat: Enum.Material = shellCfg.FloorMaterial or Enum.Material.WoodPlanks
	local glassFrac: number = math.clamp(shellCfg.Glass or 0.4, 0, 1)
	local X, Z = size.X, size.Z
	local H = math.max(1, floors) * FH

	local shell = Instance.new("Model")
	shell.Name = "Shell"
	shell.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	local function at(x: number, y: number, z: number): CFrame
		return origin * CFrame.new(x, y, z)
	end

	-- floor slab (top surface = build origin)
	local floor = make("Part", shell, {
		Name = "Floor",
		Size = Vector3.new(X, 0.4, Z),
		CFrame = at(0, -0.2, 0),
		Color = floorColor,
		Material = floorMat,
	})
	floor:SetAttribute("Surface", "Floor")

	local function wall(name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number)
		local w = make("Part", shell, {
			Name = name,
			Size = Vector3.new(sx, sy, sz),
			CFrame = at(x, y, z),
			Color = wallColor,
			Material = Enum.Material.SmoothPlastic,
		})
		w:SetAttribute("Surface", "Walls")
		return w
	end
	local function glass(sx: number, sy: number, sz: number, x: number, y: number, z: number)
		return make("Part", shell, {
			Name = "Glass",
			Size = Vector3.new(sx, sy, sz),
			CFrame = at(x, y, z),
			Color = Color3.fromRGB(170, 210, 235),
			Material = Enum.Material.Glass,
			Transparency = 0.55,
			CastShadow = false,
		})
	end

	-- side walls
	wall("WallLeft", WT, H, Z, -X / 2 - WT / 2, H / 2, 0)
	wall("WallRight", WT, H, Z, X / 2 + WT / 2, H / 2, 0)

	-- back wall: windows (or full glass for sky / penthouse views)
	local backZ = -Z / 2 - WT / 2
	if glassFrac >= 0.99 then
		glass(X, H, 0.3, 0, H / 2, backZ)
		for i = 0, math.floor(X / 12) do
			local x = -X / 2 + math.min(X, i * 12)
			make("Part", shell, {
				Name = "Mullion",
				Size = Vector3.new(0.4, H, 0.5),
				CFrame = at(x, H / 2, backZ),
				Color = Color3.fromRGB(40, 42, 50),
				Material = Enum.Material.Metal,
			})
		end
	else
		local winW = math.max(4, X * glassFrac)
		local sideW = (X - winW) / 2
		for f = 1, math.max(1, floors) do
			local base = (f - 1) * FH
			wall("WallBackLow", X, 3, WT, 0, base + 1.5, backZ)
			wall("WallBackHigh", X, 2, WT, 0, base + FH - 1, backZ)
			if sideW > 0.05 then
				wall("WallBackL", sideW, FH - 5, WT, -X / 2 + sideW / 2, base + 3 + (FH - 5) / 2, backZ)
				wall("WallBackR", sideW, FH - 5, WT, X / 2 - sideW / 2, base + 3 + (FH - 5) / 2, backZ)
			end
			glass(winW, FH - 5, 0.25, 0, base + 3 + (FH - 5) / 2, backZ)
		end
	end

	-- front wall with entrance opening (door 5 wide, 8.2 tall)
	local frontZ = Z / 2 + WT / 2
	local open = 5
	local side = (X - open) / 2
	wall("WallFrontL", side, H, WT, -(open / 2 + side / 2), H / 2, frontZ)
	wall("WallFrontR", side, H, WT, open / 2 + side / 2, H / 2, frontZ)
	wall("WallFrontTop", open, H - 8.2, WT, 0, 8.2 + (H - 8.2) / 2, frontZ)

	-- ceiling (faded by the client in build mode)
	local ceiling = make("Part", shell, {
		Name = "Ceiling",
		Size = Vector3.new(X + WT * 2, 0.4, Z + WT * 2),
		CFrame = at(0, H + 0.2, 0),
		Color = Color3.fromRGB(245, 245, 245),
		Material = Enum.Material.SmoothPlastic,
	})
	ceiling:SetAttribute("Ceiling", true)
	local lamp = make("Part", shell, {
		Name = "CeilingLamp",
		Size = Vector3.new(2, 0.2, 2),
		CFrame = at(0, H - 0.1, 0),
		Color = Color3.fromRGB(255, 240, 220),
		Material = Enum.Material.Neon,
		CanCollide = false,
	})
	lamp:SetAttribute("Ceiling", true)
	local light = Instance.new("PointLight")
	light.Range = math.clamp(math.max(X, Z) * 0.8, 16, 60)
	light.Brightness = 0.8
	light.Color = Color3.fromRGB(255, 236, 214)
	light.Shadows = false
	light.Parent = lamp

	-- mezzanine floors for duplexes (back 60 % of the unit) + stairs
	for f = 2, math.max(1, floors) do
		local y = (f - 1) * FH
		local depth = Z * 0.6
		local slab = make("Part", shell, {
			Name = "Mezzanine" .. f,
			Size = Vector3.new(X, 0.6, depth),
			CFrame = at(0, y - 0.3, -Z / 2 + depth / 2),
			Color = floorColor,
			Material = floorMat,
		})
		slab:SetAttribute("Surface", "Floor")
		make("Part", shell, {
			Name = "Railing",
			Size = Vector3.new(X - 6, 3, 0.2),
			CFrame = at(3, y + 1.5, -Z / 2 + depth - 0.1),
			Color = Color3.fromRGB(170, 210, 235),
			Material = Enum.Material.Glass,
			Transparency = 0.5,
		})
		-- stairs along the left wall, rising towards the back
		local steps = 12
		local run = math.min(Z * 0.4 - 1, 14)
		for s = 1, steps do
			local h = FH * s / steps
			make("Part", shell, {
				Name = "Step",
				Size = Vector3.new(4, h, run / steps),
				CFrame = at(-X / 2 + 2.2, (f - 2) * FH + h / 2, -Z / 2 + depth + run - (run / steps) * (s - 0.5)),
				Color = Color3.fromRGB(120, 90, 66),
				Material = Enum.Material.WoodPlanks,
			})
		end
	end

	-- entrance door (the actual moving door; Interactables attaches the prompt)
	local doorModel = Instance.new("Model")
	doorModel.Name = "EntranceDoor"
	local panel = make("Part", doorModel, {
		Name = "Panel",
		Size = Vector3.new(open - 0.1, 8.1, 0.3),
		CFrame = at(0, 4.05, frontZ),
		Color = Color3.fromRGB(110, 76, 52),
		Material = Enum.Material.Wood,
	})
	panel:SetAttribute("DoorPart", true)
	local handle = make("Part", doorModel, {
		Name = "Handle",
		Size = Vector3.new(0.25, 0.25, 0.6),
		CFrame = at(open / 2 - 0.6, 4, frontZ),
		Color = Color3.fromRGB(222, 180, 70),
		Material = Enum.Material.Metal,
	})
	handle:SetAttribute("DoorPart", true)
	doorModel:SetAttribute("Function", "Door")
	doorModel.Parent = shell

	shell.Parent = parent
	return shell, doorModel
end

---------------------------------------------------------------------------
-- Signs
---------------------------------------------------------------------------
function HouseShell.BuildSign(parent: Instance, origin: CFrame, size: Vector3, isApartment: boolean): BasePart
	local signCF
	local signSize
	if isApartment then
		-- door plate on the corridor side of the entrance
		signCF = origin * CFrame.new(4.2, 5.5, size.Z / 2 + WT + 0.06) * CFrame.Angles(0, math.pi, 0)
		signSize = Vector3.new(2.6, 1.3, 0.1)
	else
		-- yard sign just outside the front edge
		local x = math.clamp(-size.X / 2 + 3, -size.X / 2, size.X / 2)
		local post = make("Part", parent, {
			Name = "SignPost",
			Size = Vector3.new(0.3, 4, 0.3),
			CFrame = origin * CFrame.new(x, 2, size.Z / 2 + 1.2),
			Color = Color3.fromRGB(240, 240, 240),
			Material = Enum.Material.Wood,
		})
		post.CanQuery = false
		signCF = origin * CFrame.new(x, 4.6, size.Z / 2 + 1.2) * CFrame.Angles(0, math.pi, 0)
		signSize = Vector3.new(4, 2, 0.2)
	end
	local sign = make("Part", parent, {
		Name = "HouseSign",
		Size = signSize,
		CFrame = signCF,
		Color = Color3.fromRGB(28, 32, 44),
		Material = Enum.Material.SmoothPlastic,
		CanQuery = false,
	})
	local gui = Instance.new("SurfaceGui")
	gui.Name = "SignGui"
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 60
	gui.LightInfluence = 0
	gui.MaxDistance = 120
	gui.Parent = sign
	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.BackgroundTransparency = 1
	title.Size = UDim2.fromScale(1, 0.58)
	title.Font = Enum.Font.GothamBold
	title.TextScaled = true
	title.TextColor3 = Color3.fromRGB(255, 255, 255)
	title.Text = ""
	title.Parent = gui
	local sub = Instance.new("TextLabel")
	sub.Name = "Subtitle"
	sub.BackgroundTransparency = 1
	sub.Position = UDim2.fromScale(0, 0.58)
	sub.Size = UDim2.fromScale(1, 0.42)
	sub.Font = Enum.Font.GothamMedium
	sub.TextScaled = true
	sub.TextColor3 = Color3.fromRGB(170, 190, 220)
	sub.Text = ""
	sub.Parent = gui
	for _, l in ipairs({ title, sub }) do
		local pad = Instance.new("UIPadding")
		pad.PaddingLeft = UDim.new(0.05, 0)
		pad.PaddingRight = UDim.new(0.05, 0)
		pad.PaddingTop = UDim.new(0.04, 0)
		pad.Parent = l
	end
	return sign
end

function HouseShell.UpdateSign(sign: BasePart?, titleText: string, subtitleText: string, locked: boolean)
	if not sign or not sign.Parent then
		return
	end
	local gui = sign:FindFirstChild("SignGui")
	if not gui then
		return
	end
	local title = gui:FindFirstChild("Title") :: TextLabel?
	local sub = gui:FindFirstChild("Subtitle") :: TextLabel?
	if title then
		title.Text = (locked and "🔒 " or "🏠 ") .. titleText
	end
	if sub then
		sub.Text = subtitleText
	end
end

---------------------------------------------------------------------------
-- Private elevator (elevated fallback Sky Apartments)
---------------------------------------------------------------------------
local function pad(parent: Instance, name: string, cf: CFrame, text: string, action: string): (BasePart, ProximityPrompt)
	local p = make("Part", parent, {
		Name = name,
		Size = Vector3.new(6, 0.4, 6),
		CFrame = cf * CFrame.new(0, 0.2, 0),
		Color = Color3.fromRGB(222, 180, 70),
		Material = Enum.Material.Metal,
	})
	local glow = make("Part", parent, {
		Name = name .. "Glow",
		Size = Vector3.new(5, 0.05, 5),
		CFrame = cf * CFrame.new(0, 0.43, 0),
		Color = Color3.fromRGB(255, 220, 140),
		Material = Enum.Material.Neon,
		CanCollide = false,
		CanQuery = false,
	})
	glow.Transparency = 0.3
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = action
	prompt.ObjectText = text
	prompt.HoldDuration = 0.3
	prompt.MaxActivationDistance = 8
	prompt.RequiresLineOfSight = false
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = p
	return p, prompt
end

function HouseShell.BuildElevator(parent: Instance, lobbyCF: CFrame, unitCF: CFrame, opts)
	local model = Instance.new("Model")
	model.Name = "PrivateElevator"
	local lobbyPad, upPrompt = pad(model, "LobbyPad", lobbyCF, "Private Elevator", "Ride up")
	make("Part", model, {
		Name = "LobbyFrame",
		Size = Vector3.new(7, 10, 0.6),
		CFrame = lobbyCF * CFrame.new(0, 5, -3.3),
		Color = Color3.fromRGB(40, 42, 50),
		Material = Enum.Material.Metal,
	})
	lobbyPad:SetAttribute("Elevator", "Lobby")
	local _, downPrompt = pad(model, "UnitPad", unitCF, "Private Elevator", "Go down")
	upPrompt.Triggered:Connect(function(player: Player)
		if opts.CanUse and not opts.CanUse(player) then
			if opts.OnDenied then
				opts.OnDenied(player)
			end
			return
		end
		opts.Teleport(player, unitCF * CFrame.new(0, 3.5, 0))
	end)
	downPrompt.Triggered:Connect(function(player: Player)
		opts.Teleport(player, lobbyCF * CFrame.new(0, 3.5, 0))
	end)
	model.Parent = parent
	return model
end

return HouseShell
