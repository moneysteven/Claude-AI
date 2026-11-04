-- BuildPreview (client helper): every client-only visual of build mode.
--   * cursor ghost (item that follows the pointer) with green / red Highlight
--   * pending ghosts for placed / moved / repainted items, red outline on items marked for removal
--   * floor view: items above the selected floor, roofs and ceilings fade out (and stop catching raycasts)
--   * selection box, wall-run preview
-- Nothing here replicates: ghosts live in a local folder, real items are only changed with
-- LocalTransparencyModifier / CanQuery (local-only property changes) and restored on Stop.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Furniture = require(Shared.Config.Furniture)
local BuildMath = require(Shared.Build.BuildMath)
local FurnitureBuilder = require(Shared.Build.FurnitureBuilder)

local BuildPreview = {}
BuildPreview.__index = BuildPreview

local VALID = Color3.fromRGB(80, 230, 120)
local INVALID = Color3.fromRGB(255, 70, 80)
local SELECT = Color3.fromRGB(64, 156, 255)

local function sigOf(e): string
	local c = e.Color
	return table.concat({
		e.ItemId,
		c and string.format("%d,%d,%d", c.R * 255, c.G * 255, c.B * 255) or "-",
		e.Material or "-",
	}, "|")
end

-- Ghost model for an item. Clones a streamed-in real model of the same item when possible
-- (so developer assets look right), otherwise builds the procedural greybox.
local function ghostFor(def, color: Color3?, material: string?, folder: Instance?, transparency: number): Model
	local model: Model
	local real = nil
	if folder then
		for _, child in ipairs(folder:GetChildren()) do
			if child:IsA("Model") and child:GetAttribute("ItemId") == def.Id then
				real = child
				break
			end
		end
	end
	if real then
		model = real:Clone()
		FurnitureBuilder.MakeGhost(model, transparency)
		if color or material then
			FurnitureBuilder.Paint(model, color, material)
		end
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") then
				d.LocalTransparencyModifier = 0
			end
		end
	else
		model = FurnitureBuilder.Build(def, { Color = color, Material = material, Ghost = true })
		FurnitureBuilder.MakeGhost(model, transparency)
	end
	model:SetAttribute("Ghost", true)
	return model
end

function BuildPreview.new(ctx)
	local self = setmetatable({}, BuildPreview)
	self.Ctx = ctx
	self.Origin = ctx.Origin
	local folder = Instance.new("Folder")
	folder.Name = "SkylineBuildPreview"
	folder.Parent = Workspace
	self.Folder = folder
	self.Ghosts = {} -- key -> { Model, Sig, Pos, Step }
	self.Touched = {} -- part -> { ltm, query }
	self.Marked = {} -- uid -> SelectionBox (removals)
	self.Cursor = nil
	self.CursorKey = nil
	self.Highlight = nil
	self.WallGhosts = {}
	self.Floor = 1
	self.Effective = {}
	self.Surfaces = {}
	self.ServerSurfaces = {}
	self.SurfaceOriginal = {}

	local sel = Instance.new("SelectionBox")
	sel.Name = "SkylineBuildSelection"
	sel.Color3 = SELECT
	sel.LineThickness = 0.08
	sel.SurfaceTransparency = 0.85
	sel.SurfaceColor3 = SELECT
	sel.Parent = folder
	self.Selection = sel

	-- re-sync when real items stream in / are rebuilt by the server
	local buildFolder = ctx.Folder
	if buildFolder then
		self.ChildConn = buildFolder.ChildAdded:Connect(function()
			task.defer(function()
				if self.Folder then
					self:Sync(self.Effective, self.Surfaces, nil)
				end
			end)
		end)
	end
	return self
end

function BuildPreview:WorldCFrame(pos: Vector3, step: number): CFrame
	return self.Origin * BuildMath.Compose(pos, step)
end

function BuildPreview:RealModel(uid: string): Model?
	local folder = self.Ctx.Folder
	if not folder then
		return nil
	end
	local m = folder:FindFirstChild("Item_" .. uid)
	if m and m:IsA("Model") then
		return m
	end
	return nil
end

-- local-only appearance change of a real part (remembering the original so Stop can restore it)
function BuildPreview:SetPartLocal(part: BasePart, ltm: number?, query: boolean?)
	local orig = self.Touched[part]
	if not orig then
		orig = { ltm = part.LocalTransparencyModifier, query = part.CanQuery }
		self.Touched[part] = orig
	end
	part.LocalTransparencyModifier = ltm or orig.ltm
	if query == nil then
		part.CanQuery = orig.query
	else
		part.CanQuery = query and orig.query
	end
end

function BuildPreview:SetModelLocal(model: Instance, ltm: number?, query: boolean?)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and d.Name ~= "Root" then
			self:SetPartLocal(d, ltm, query)
		end
	end
end

---------------------------------------------------------------------------
-- Cursor ghost
---------------------------------------------------------------------------
function BuildPreview:SetCursor(itemId: string?, color: Color3?, material: string?)
	local key = itemId and (itemId .. (color and tostring(color) or "") .. (material or "")) or nil
	if key == self.CursorKey then
		return
	end
	self.CursorKey = key
	if self.Cursor then
		self.Cursor:Destroy()
		self.Cursor = nil
	end
	if not itemId then
		return
	end
	local def = Furniture.ById[itemId]
	if not def then
		return
	end
	local model = ghostFor(def, color, material, self.Ctx.Folder, 0.35)
	model.Name = "Cursor"
	local hl = Instance.new("Highlight")
	hl.FillTransparency = 0.7
	hl.OutlineTransparency = 0
	hl.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
	hl.FillColor = VALID
	hl.OutlineColor = VALID
	hl.Parent = model
	self.Highlight = hl
	model.Parent = self.Folder
	self.Cursor = model
end

function BuildPreview:MoveCursor(pos: Vector3?, step: number, valid: boolean)
	local m = self.Cursor
	if not m then
		return
	end
	if not pos then
		m.Parent = nil
		return
	end
	m.Parent = self.Folder
	m:PivotTo(self:WorldCFrame(pos, step))
	if self.Highlight then
		local c = valid and VALID or INVALID
		self.Highlight.FillColor = c
		self.Highlight.OutlineColor = c
	end
end

---------------------------------------------------------------------------
-- Wall-run preview
---------------------------------------------------------------------------
function BuildPreview:SetWallRun(segments: { { ItemId: string, Pos: Vector3, Step: number } }?, valid: boolean)
	for _, g in ipairs(self.WallGhosts) do
		g:Destroy()
	end
	table.clear(self.WallGhosts)
	if not segments then
		return
	end
	for _, seg in ipairs(segments) do
		local def = Furniture.ById[seg.ItemId]
		if def then
			local g = ghostFor(def, nil, nil, nil, 0.4)
			g:PivotTo(self:WorldCFrame(seg.Pos, seg.Step))
			local box = Instance.new("SelectionBox")
			box.Adornee = g
			box.Color3 = valid and VALID or INVALID
			box.LineThickness = 0.06
			box.Parent = g
			g.Parent = self.Folder
			table.insert(self.WallGhosts, g)
		end
	end
end

---------------------------------------------------------------------------
-- Selection
---------------------------------------------------------------------------
function BuildPreview:ModelForKey(key: string?): Model?
	if not key then
		return nil
	end
	local g = self.Ghosts[key]
	if g then
		return g.Model
	end
	return self:RealModel(key)
end

function BuildPreview:Select(key: string?)
	self.Selection.Adornee = self:ModelForKey(key)
end

-- Which effective key does this hit instance belong to?
function BuildPreview:KeyFromInstance(inst: Instance?): string?
	local node = inst
	while node and node ~= Workspace do
		if node:IsA("Model") then
			local pk = node:GetAttribute("PendingKey")
			if pk then
				return pk
			end
			local uid = node:GetAttribute("Uid")
			local folder = self.Ctx.Folder
			if uid and folder and node:IsDescendantOf(folder) then
				return uid
			end
		end
		node = node.Parent
	end
	return nil
end

---------------------------------------------------------------------------
-- Sync pending changes
---------------------------------------------------------------------------
function BuildPreview:Sync(effective, surfaces, serverSurfaces)
	self.Effective = effective
	self.Surfaces = surfaces or {}
	if serverSurfaces then
		self.ServerSurfaces = serverSurfaces
	end
	local seen = {}
	for key, e in pairs(effective) do
		local def = Furniture.ById[e.ItemId]
		if def then
			local needsGhost = (not e.Server) or ((e.Moved or e.Painted) and not e.Removed)
			local real = e.Server and self:RealModel(key) or nil
			if e.Server and real then
				if e.Removed then
					self:SetModelLocal(real, 0.55, false)
					if not self.Marked[key] then
						local box = Instance.new("SelectionBox")
						box.Color3 = INVALID
						box.LineThickness = 0.1
						box.SurfaceColor3 = INVALID
						box.SurfaceTransparency = 0.7
						box.Adornee = real
						box.Parent = self.Folder
						self.Marked[key] = box
					end
				elseif needsGhost then
					self:SetModelLocal(real, 1, false)
				else
					self:SetModelLocal(real, nil, nil)
				end
			end
			if not e.Removed and self.Marked[key] then
				self.Marked[key]:Destroy()
				self.Marked[key] = nil
			end
			if needsGhost then
				seen[key] = true
				local sig = sigOf(e)
				local g = self.Ghosts[key]
				if not g or g.Sig ~= sig then
					if g then
						g.Model:Destroy()
					end
					local model = ghostFor(def, e.Color, e.Material, self.Ctx.Folder, 0.2)
					model.Name = "Pending_" .. key
					model:SetAttribute("PendingKey", key)
					-- pending ghosts can be clicked (select / move / delete) but never block the character
					for _, d in ipairs(model:GetDescendants()) do
						if d:IsA("BasePart") and d.Name ~= "Root" then
							d.CanQuery = true
						end
					end
					model.Parent = self.Folder
					g = { Model = model, Sig = sig }
					self.Ghosts[key] = g
				end
				g.Model:PivotTo(self:WorldCFrame(e.Pos, e.Step))
				g.Pos = e.Pos
			end
		end
	end
	for key, g in pairs(self.Ghosts) do
		if not seen[key] then
			g.Model:Destroy()
			self.Ghosts[key] = nil
		end
	end
	for key, box in pairs(self.Marked) do
		local e = effective[key]
		if not e or not e.Removed then
			box:Destroy()
			self.Marked[key] = nil
		end
	end
	-- items that were removed on the server: restore nothing (model is gone)
	self:ApplySurfaces()
	self:ApplyFloorView(self.Floor)
end

-- Preview wallpaper on the apartment shell (local colour change; Destroy puts back the server state)
local function applySurface(part: BasePart, s, orig)
	if s and (s.Color or s.Material) then
		part.Color = s.Color or orig.Color
		part.Material = FurnitureBuilder.MaterialFromName(s.Material) or orig.Material
	else
		part.Color = orig.Color
		part.Material = orig.Material
	end
end

function BuildPreview:ShellParts(): { BasePart }
	local out = {}
	local root = self.Ctx.Folder and self.Ctx.Folder.Parent
	local shell = root and root:FindFirstChild("Shell")
	if shell then
		for _, d in ipairs(shell:GetDescendants()) do
			if d:IsA("BasePart") and d:GetAttribute("Surface") then
				table.insert(out, d)
			end
		end
	end
	return out
end

function BuildPreview:ApplySurfaces()
	for _, d in ipairs(self:ShellParts()) do
		local target = d:GetAttribute("Surface")
		local server = self.ServerSurfaces[target]
		if not self.SurfaceOriginal[d] then
			-- the shell's own colour (used when the server has no wallpaper for this surface)
			self.SurfaceOriginal[d] = { Color = d.Color, Material = d.Material }
		end
		local s = self.Surfaces[target]
		if s and s.Changed then
			applySurface(d, s, self.SurfaceOriginal[d])
		elseif server then
			applySurface(d, server, self.SurfaceOriginal[d])
		end
	end
end

-- Fade everything above the current floor + roofs / ceilings
function BuildPreview:ApplyFloorView(floor: number)
	self.Floor = floor
	local fh = self.Ctx.FloorHeight or 12
	local cutoff = floor * fh - 0.5
	local folder = self.Ctx.Folder
	if folder then
		for _, m in ipairs(folder:GetChildren()) do
			if m:IsA("Model") then
				local uid = m:GetAttribute("Uid")
				local e = uid and self.Effective[uid]
				local busy = e and (e.Removed or e.Moved or e.Painted)
				if not busy then
					local rel = self.Origin:PointToObjectSpace(m:GetPivot().Position)
					local hide = m:GetAttribute("HideInBuild") == true or rel.Y >= cutoff
					if hide then
						self:SetModelLocal(m, 0.85, false)
					else
						self:SetModelLocal(m, nil, nil)
					end
				end
			end
		end
	end
	for _, g in pairs(self.Ghosts) do
		local hide = g.Pos and g.Pos.Y >= cutoff
		for _, d in ipairs(g.Model:GetDescendants()) do
			if d:IsA("BasePart") and d.Name ~= "Root" then
				d.LocalTransparencyModifier = hide and 0.8 or 0
				d.CanQuery = not hide
			end
		end
	end
	local root = folder and folder.Parent
	local shell = root and root:FindFirstChild("Shell")
	if shell then
		for _, d in ipairs(shell:GetDescendants()) do
			if d:IsA("BasePart") then
				local rel = self.Origin:PointToObjectSpace(d.Position)
				if d:GetAttribute("Ceiling") then
					self:SetPartLocal(d, 0.95, false)
				elseif rel.Y - d.Size.Y / 2 >= cutoff then
					self:SetPartLocal(d, 0.85, false)
				else
					self:SetPartLocal(d, nil, nil)
				end
			end
		end
	end
end

function BuildPreview:Destroy()
	if self.ChildConn then
		self.ChildConn:Disconnect()
		self.ChildConn = nil
	end
	for part, orig in pairs(self.Touched) do
		if part.Parent then
			part.LocalTransparencyModifier = orig.ltm
			part.CanQuery = orig.query
		end
	end
	table.clear(self.Touched)
	for part, orig in pairs(self.SurfaceOriginal) do
		if part.Parent then
			local server = self.ServerSurfaces[part:GetAttribute("Surface")]
			applySurface(part, server, orig)
		end
	end
	table.clear(self.SurfaceOriginal)
	if self.Folder then
		self.Folder:Destroy()
		self.Folder = nil
	end
	self.Ghosts = {}
	self.Marked = {}
	self.Cursor = nil
end

return BuildPreview
