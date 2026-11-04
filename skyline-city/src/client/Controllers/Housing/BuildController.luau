-- BuildController: Bloxburg-style build mode (client).
--
--   BuildController:Enter(contextId)   asks the server (Build.BeginSession) and opens the "BuildMode" panel
--   BuildController:Exit(force?)       leaves build mode (asks to discard pending changes unless forced)
--   BuildController:IsActive() -> bool
--
-- Everything the player does is collected as PENDING operations (BuildState) and previewed locally
-- (BuildPreview). The budget card shows the server-quoted cost; Confirm sends ONE Build.PlaceBatch.
--
-- Controls
--   PC:      click = use tool · R / T rotate · X / Delete remove · Ctrl+Z / Ctrl+Y undo / redo · G grid · F free
--            C catalog · PageUp / PageDown floor · 1-7 tools · Enter confirm · Backspace cancel action
--            camera: right-drag orbit, middle-drag / WASD pan, wheel zoom, Q / E turn
--   Mobile:  tap = use tool (tap the ghost again or ✔ to place) · drag orbit · two fingers pan · pinch zoom
--   Gamepad: A use tool at the centre reticle · L1 / R1 rotate · X remove · Y catalog · B cancel action
--            D-pad ↑↓ floor, ←→ tools · Select confirm · Start exit · sticks pan / orbit · L2 / R2 zoom

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Maid = require(Shared.Util.Maid)
local Format = require(Shared.Util.Format)
local Furniture = require(Shared.Config.Furniture)
local HousingConfig = require(Shared.Config.Housing)
local BuildMath = require(Shared.Build.BuildMath)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))
local Kit = require(Client.UI:WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local BuildState = require(script.Parent.BuildState)
local BuildPreview = require(script.Parent.BuildPreview)
local BuildCamera = require(script.Parent.BuildCamera)
local BuildUI = require(script.Parent.BuildUI)

local BuildController = {
	Name = "BuildController",
	Priority = 60,
}

local CFG = HousingConfig.Build
local player = Players.LocalPlayer
local ACTION = "SkylineBuildActions"
local RENDER = "SkylineBuildCursor"

local active = false
local entering = false
local session = nil -- server descriptor
local state = nil
local preview = nil
local ui = nil
local maid = Maid.new()

local tool = "Select"
local placeItem: string? = nil
local paintId = "paint_white"
local customColor: Color3? = nil
local step = 0
local gridOn = true
local gridIndex = 1
local free = false
local floor = 1
local selected: string? = nil
local movingKey: string? = nil
local wallStart: Vector3? = nil
local wallDragArmed = false
local hover = nil -- { Pos, Step, Valid, Reason }
local wallPreview = nil -- { Segments, Valid }
local pointer = { Pos = Vector2.zero, Viewport = true, Set = false }
local quote = nil
local quoteToken = 0
local confirming = false
local controlsDisabled = false
local effective = {} -- cached BuildState:Effective() (refreshed on every state change)
local itemCount = 0

for i, g in ipairs(CFG.GridSizes) do
	if g == CFG.DefaultGrid then
		gridIndex = i
	end
end

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function gridSize(): number
	return CFG.GridSizes[gridIndex] or 1
end

local function fh(): number
	return session and session.FloorHeight or CFG.FloorHeight
end

local function floorBase(): number
	return BuildMath.FloorBase(floor, fh())
end

local function rotStep(): number
	return free and (CFG.FreeRotateStep // BuildMath.STEP_DEGREES) or (CFG.RotateStep // BuildMath.STEP_DEGREES)
end

local function isVip(): boolean
	return player:GetAttribute("VIP") == true
end

local function heightLimits(): (number, number)
	return BuildMath.HeightLimits(session.Floors or 1, fh(), session.RoofAllowance or CFG.RoofAllowance)
end

local function setControls(enabled: boolean)
	local ok, controls = pcall(function()
		local module = require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule", 5) :: any)
		return module:GetControls()
	end)
	if ok and controls then
		if enabled then
			controls:Enable()
		else
			controls:Disable()
		end
	end
	controlsDisabled = not enabled
end

local function canPlace(def, pos: Vector3, st: number, isNew: boolean): (boolean, string?)
	if not def.CatalogSet[session.Catalog] then
		return false, "Not available here"
	end
	if def.VipOnly and not isVip() then
		return false, "VIP only"
	end
	if isNew and itemCount + 1 > state.MaxItems then
		return false, "Item limit reached"
	end
	local maxTop, maxBottom = heightLimits()
	return BuildMath.InBounds(def.Size, pos, st, session.Size, maxTop, maxBottom)
end

local function charsList(): { Instance }
	local list = {}
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Character then
			table.insert(list, p.Character)
		end
	end
	-- the preview folder is NOT excluded: pending ghosts must be clickable; the cursor / wall ghosts
	-- have CanQuery = false so rays pass through them. The item being moved is excluded (no self-stacking).
	if movingKey and preview then
		local m = preview:ModelForKey(movingKey)
		if m then
			table.insert(list, m)
		end
	end
	return list
end

local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude
rayParams.IgnoreWater = true

local function pointerRay(): Ray?
	local cam = Workspace.CurrentCamera
	if not cam then
		return nil
	end
	local last = UserInputService:GetLastInputType()
	if last.Name:find("Gamepad") then
		local vp = cam.ViewportSize
		return cam:ViewportPointToRay(vp.X / 2, vp.Y / 2)
	end
	if not pointer.Set then
		return nil
	end
	if pointer.Viewport then
		return cam:ViewportPointToRay(pointer.Pos.X, pointer.Pos.Y)
	end
	return cam:ScreenPointToRay(pointer.Pos.X, pointer.Pos.Y)
end

-- Raycast the pointer. Returns { Rel, NormalRel, Instance?, FromPlane } in plot space.
local function cast(planeOnly: boolean?)
	local ray = pointerRay()
	if not ray then
		return nil
	end
	local origin: CFrame = session.Origin
	local dir = ray.Direction.Unit * 1500
	local up = origin.UpVector
	local planePoint = origin:PointToWorldSpace(Vector3.new(0, floorBase(), 0))
	local planeHit = nil
	local denom = dir:Dot(up)
	if math.abs(denom) > 1e-5 then
		local t = (planePoint - ray.Origin):Dot(up) / denom
		if t > 0 and t <= 1 then
			planeHit = ray.Origin + dir * t
		end
	end
	local hit = nil
	if not planeOnly then
		rayParams.FilterDescendantsInstances = charsList()
		hit = Workspace:Raycast(ray.Origin, dir, rayParams)
	end
	local useHit = false
	if hit then
		local relHit = origin:PointToObjectSpace(hit.Position)
		local inArea = math.abs(relHit.X) <= session.Size.X / 2 + 2 and math.abs(relHit.Z) <= session.Size.Z / 2 + 2
		local closer = not planeHit or (hit.Position - ray.Origin).Magnitude <= (planeHit - ray.Origin).Magnitude + 0.05
		useHit = inArea and closer
	end
	if useHit and hit then
		return {
			Rel = origin:PointToObjectSpace(hit.Position),
			NormalRel = origin:VectorToObjectSpace(hit.Normal),
			Instance = hit.Instance,
			FromPlane = false,
		}
	elseif planeHit then
		return {
			Rel = origin:PointToObjectSpace(planeHit),
			NormalRel = Vector3.yAxis,
			Instance = nil,
			FromPlane = true,
		}
	end
	return nil
end

local function placementFor(def, c, st: number)
	local base = floorBase()
	local size: Vector3 = def.Size
	local rel: Vector3 = c.Rel
	local n: Vector3 = c.NormalRel
	local pos: Vector3
	local wallMounted = false
	if def.Mount == "Wall" and not c.FromPlane and math.abs(n.Y) < 0.3 then
		local flat = Vector3.new(n.X, 0, n.Z).Unit
		st = BuildMath.NormalizeStep(math.round(math.atan2(-flat.X, -flat.Z) / math.rad(BuildMath.STEP_DEGREES)))
		local y = math.clamp(rel.Y - size.Y / 2, base, math.max(base, base + fh() - size.Y))
		local p = rel + flat * (size.Z / 2 + 0.02)
		pos = Vector3.new(p.X, y, p.Z)
		wallMounted = true
	elseif def.Mount == "Ceiling" then
		pos = Vector3.new(rel.X, math.max(base, base + fh() - size.Y - 0.05), rel.Z)
	else
		local y = base
		if not c.FromPlane and n.Y > 0.7 then
			y = math.max(base, rel.Y)
		end
		pos = Vector3.new(rel.X, y, rel.Z)
	end
	if gridOn and not free and not wallMounted then
		pos = BuildMath.SnapPosition(pos, gridSize(), size, st)
	end
	pos = BuildMath.RoundVector(BuildMath.ClampToArea(pos, size, st, session.Size))
	return pos, st
end

local function hintFor(): string
	local touch = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
	local pad = UserInputService:GetLastInputType().Name:find("Gamepad") ~= nil
	local use = touch and "Tap" or (pad and "Press A" or "Click")
	local rot = touch and "⟳" or (pad and "L1/R1" or "R/T")
	if tool == "Place" then
		if not placeItem then
			return "Pick an item from the catalog below"
		end
		return ("%s to place · %s rotate · %s"):format(use, rot, touch and "tap the ghost again or ✔ to confirm the spot" or "G grid, F free")
	elseif tool == "Wall" then
		return wallStart and ("%s the end point (keeps chaining) · %s to stop"):format(use, touch and "✖" or (pad and "B" or "Backspace"))
			or ("%s (or drag) from one point to another to draw walls"):format(use)
	elseif tool == "Move" then
		return movingKey and ("%s to drop it · %s rotate"):format(use, rot) or ("%s an item to pick it up"):format(use)
	elseif tool == "Rotate" then
		return ("%s an item to rotate it"):format(use)
	elseif tool == "Delete" then
		return ("%s an item to sell it back (%d%%)"):format(use, math.floor((session and session.SellBack or 0.7) * 100))
	elseif tool == "Paint" then
		local paint = Furniture.ById[paintId]
		return ("%s an item to paint it with %s"):format(use, paint and paint.Name or "paint")
	end
	return ("%s an item to select it"):format(use)
end

---------------------------------------------------------------------------
-- Budget / quote
---------------------------------------------------------------------------
local function refreshBudget()
	if not ui or not state then
		return
	end
	local cost, refund = state:Estimate(isVip(), CFG.VipDisplayDiscount)
	local exact = false
	local err = nil
	if quote then
		if quote.Error then
			err = quote.Error
		else
			cost, refund = quote.Cost, quote.Refund
			exact = true
		end
	end
	ui.SetBudget({
		Cost = cost,
		Refund = refund,
		Cash = ClientData.Get("Cash") or 0,
		Exact = exact,
		Error = err,
		IsOwner = session.IsOwner,
		HasChanges = state:HasChanges(),
	})
end

local function scheduleQuote()
	quoteToken += 1
	local my = quoteToken
	quote = nil
	task.delay(CFG.QuoteDebounce, function()
		if my ~= quoteToken or not active or not state then
			return
		end
		local ops = state:Compact()
		if #ops == 0 then
			quote = { Cost = 0, Refund = 0 }
			refreshBudget()
			return
		end
		local res = Net.Invoke("Build", "Quote", { ContextId = session.Id, Ops = ops })
		if my ~= quoteToken or not active then
			return
		end
		if res.ok then
			quote = { Cost = res.Cost or 0, Refund = res.Refund or 0 }
		else
			quote = { Error = res.err or "Can't price these changes" }
		end
		refreshBudget()
	end)
end

local function onStateChanged()
	if not state or not preview or not ui then
		return
	end
	local eff, surf = state:Effective()
	effective = eff
	itemCount = 0
	for _, e in pairs(eff) do
		if not e.Removed then
			itemCount += 1
		end
	end
	preview:Sync(eff, surf, state.ServerSurfaces)
	if selected and (not eff[selected] or eff[selected].Removed) then
		selected = nil
		preview:Select(nil)
		ui.SetSelection(nil)
	elseif selected then
		preview:Select(selected)
	end
	ui.SetCount(itemCount, state.MaxItems)
	ui.SetUndoRedo(state:CanUndo(), state:CanRedo())
	ui.SetFloor(floor, session.Floors or 1)
	refreshBudget()
	scheduleQuote()
end

---------------------------------------------------------------------------
-- Tool logic
---------------------------------------------------------------------------
local setTool

local function clearAction()
	movingKey = nil
	wallStart = nil
	wallDragArmed = false
	wallPreview = nil
	if preview then
		preview:SetWallRun(nil, true)
		if tool ~= "Place" then
			preview:SetCursor(nil)
		end
	end
end

local function selectKey(key: string?)
	selected = key
	if not preview or not ui then
		return
	end
	preview:Select(key)
	if key then
		local e = state:Get(key)
		local def = e and Furniture.ById[e.ItemId]
		if def then
			ui.SetSelection({ Title = (def.Icon or "📦") .. " " .. def.Name, Paintable = def.Paintable })
			return
		end
	end
	ui.SetSelection(nil)
end

local function pickKey(): string?
	local c = cast(false)
	if not c or not c.Instance then
		return nil
	end
	return preview:KeyFromInstance(c.Instance)
end

local function push(op): boolean
	local ok, err = state:Push(op)
	if not ok then
		Router.Notify(err or "Can't do that", "error", 2)
	end
	return ok
end

local function rotateKey(key: string, dir: number)
	local e = state:Get(key)
	local def = e and Furniture.ById[e.ItemId]
	if not e or not def or e.Removed then
		return
	end
	local st = BuildMath.NormalizeStep(e.Step + dir * rotStep())
	local pos = BuildMath.RoundVector(BuildMath.ClampToArea(e.Pos, def.Size, st, session.Size))
	local ok, why = canPlace(def, pos, st, false)
	if not ok then
		Router.Notify(why or "No room to rotate", "error", 2)
		return
	end
	push({ Type = "Move", Key = key, Pos = pos, Step = st })
end

local function paintKey(key: string)
	local e = state:Get(key)
	local def = e and Furniture.ById[e.ItemId]
	if not def or not def.Paintable then
		Router.Notify("That item can't be painted", "warning", 2)
		return
	end
	local paint = Furniture.ById[paintId]
	if not paint then
		return
	end
	if paint.VipOnly and not isVip() then
		Router.Notify(paint.Name .. " is VIP only", "warning", 2)
		return
	end
	push({ Type = "Paint", Key = key, PaintId = paintId, Color = paint.CustomColor and customColor or nil })
end

local function wallpaper(target: string)
	if not session.CanWallpaper then
		Router.Notify("Paint walls one by one here (Paint tool)", "info", 2)
		return
	end
	local paint = Furniture.ById[paintId]
	if not paint then
		return
	end
	if paint.VipOnly and not isVip() then
		Router.Notify(paint.Name .. " is VIP only", "warning", 2)
		return
	end
	push({ Type = "Wallpaper", Target = target, PaintId = paintId, Color = paint.CustomColor and customColor or nil })
end

local function commitWall(b: Vector3, keepChain: boolean)
	if not wallPreview or not wallStart then
		return
	end
	if not wallPreview.Valid or #wallPreview.Segments == 0 then
		Router.Notify(wallPreview.Reason or "Walls must stay inside your plot", "error", 2)
		return
	end
	local ops = {}
	for _, seg in ipairs(wallPreview.Segments) do
		table.insert(ops, { Type = "Place", ItemId = seg.ItemId, Pos = seg.Pos, Step = seg.Step })
	end
	local ok, err = state:PushGroup(ops)
	if not ok then
		Router.Notify(err or "Can't place walls", "error", 2)
		return
	end
	if keepChain then
		wallStart = b
	else
		wallStart = nil
		preview:SetWallRun(nil, true)
	end
end

local function snapWallPoint(rel: Vector3): Vector3
	local g = (gridOn and not free) and math.max(gridSize(), 1) or 0
	local x, z = rel.X, rel.Z
	if g > 0 then
		x = math.round(x / g) * g
		z = math.round(z / g) * g
	end
	x = math.clamp(x, -session.Size.X / 2, session.Size.X / 2)
	z = math.clamp(z, -session.Size.Z / 2, session.Size.Z / 2)
	return BuildMath.RoundVector(Vector3.new(x, floorBase(), z))
end

local function updateCursor()
	if not active or not session then
		return
	end
	hover = nil
	if tool == "Place" or (tool == "Move" and movingKey) then
		local itemId = placeItem
		local st = step
		if tool == "Move" and movingKey then
			local e = effective[movingKey]
			itemId = e and e.ItemId
		end
		local def = itemId and Furniture.ById[itemId]
		if def then
			local c = cast(false)
			if c then
				local pos, st2 = placementFor(def, c, st)
				local ok, why = canPlace(def, pos, st2, tool == "Place")
				hover = { Pos = pos, Step = st2, Valid = ok, Reason = why }
				preview:MoveCursor(pos, st2, ok)
			else
				preview:MoveCursor(nil, st, false)
			end
		end
	elseif tool == "Wall" then
		local c = cast(true)
		if c and wallStart then
			local b = snapWallPoint(c.Rel)
			local runs = BuildMath.WallRun(wallStart, b, CFG.WallSegments)
			local segs = {}
			local valid = #runs > 0
			local reason = nil
			for _, r in ipairs(runs) do
				local id = CFG.WallItems[r.Length]
				local def = id and Furniture.ById[id]
				if def then
					local ok, why = canPlace(def, r.Position, r.Step, false)
					if not ok and not reason then
						reason = why
					end
					valid = valid and ok
					table.insert(segs, { ItemId = id, Pos = r.Position, Step = r.Step })
				end
			end
			if itemCount + #segs > state.MaxItems then
				valid = false
				reason = reason or "Item limit reached"
			end
			wallPreview = { Segments = segs, Valid = valid, End = b, Reason = reason }
			preview:SetWallRun(segs, valid)
		end
	end
end

local function primary()
	if not active then
		return
	end
	if tool == "Place" then
		if not placeItem then
			ui.ToggleCatalog(true)
			return
		end
		updateCursor()
		if hover and hover.Valid then
			push({ Type = "Place", ItemId = placeItem, Pos = hover.Pos, Step = hover.Step })
		elseif hover then
			Router.Notify(hover.Reason or "Can't place here", "error", 1.5)
		end
	elseif tool == "Move" then
		if movingKey then
			updateCursor()
			if hover and hover.Valid then
				push({ Type = "Move", Key = movingKey, Pos = hover.Pos, Step = hover.Step })
				movingKey = nil
				preview:SetCursor(nil)
			elseif hover then
				Router.Notify(hover.Reason or "Can't move here", "error", 1.5)
			end
		else
			local key = pickKey()
			local e = key and state:Get(key)
			if e and not e.Removed then
				movingKey = key
				step = e.Step
				preview:SetCursor(e.ItemId, e.Color, e.Material)
				selectKey(nil)
			end
		end
	elseif tool == "Wall" then
		local c = cast(true)
		if not c then
			return
		end
		local b = snapWallPoint(c.Rel)
		if not wallStart then
			wallStart = b
			wallDragArmed = true
		else
			updateCursor()
			commitWall(b, true)
			wallDragArmed = false
		end
	elseif tool == "Rotate" then
		local key = pickKey()
		if key then
			rotateKey(key, 1)
		end
	elseif tool == "Delete" then
		local key = pickKey()
		local e = key and state:Get(key)
		if e and not e.Removed then
			push({ Type = "Remove", Key = key })
		end
	elseif tool == "Paint" then
		local c = cast(false)
		if not c or not c.Instance then
			return
		end
		local key = preview:KeyFromInstance(c.Instance)
		if key then
			paintKey(key)
		elseif c.Instance:GetAttribute("Surface") then
			wallpaper(c.Instance:GetAttribute("Surface"))
		end
	else
		selectKey(pickKey())
	end
	if ui then
		ui.SetHint(hintFor())
	end
end

local function rotate(dir: number)
	if tool == "Place" or (tool == "Move" and movingKey) then
		step = BuildMath.NormalizeStep(step + dir * rotStep())
		updateCursor()
	elseif selected then
		rotateKey(selected, dir)
	end
end

local function deleteSelected()
	local key = selected
	if not key and pointer.Set then
		key = pickKey()
	end
	local e = key and state:Get(key)
	if e and not e.Removed then
		push({ Type = "Remove", Key = key })
		selectKey(nil)
	end
end

local function cancelAction()
	if movingKey or wallStart then
		clearAction()
	elseif tool == "Place" and placeItem then
		placeItem = nil
		preview:SetCursor(nil)
		ui.SetActiveItem(nil)
		setTool("Select")
	elseif selected then
		selectKey(nil)
	end
	if ui then
		ui.SetHint(hintFor())
	end
end

local function wallsAllowed(): boolean
	local def = Furniture.ById[CFG.WallItems[8] or "wall_8"]
	return session ~= nil and def ~= nil and def.CatalogSet[session.Catalog] == true
end

function setTool(t: string)
	if t == "Wall" and not wallsAllowed() then
		Router.Notify("Walls can't be built here — furniture & paint only", "info", 2)
		if tool == "Wall" then
			t = "Select"
		else
			return
		end
	end
	tool = t
	clearAction()
	if t == "Place" and placeItem then
		preview:SetCursor(placeItem)
	elseif t ~= "Place" then
		preview:SetCursor(nil)
	end
	if t == "Paint" then
		local def = Furniture.ById[paintId]
		if def then
			ui.SetActiveItem(paintId)
		end
	end
	ui.SetTool(t)
	selectKey(selected)
	ui.SetHint(hintFor())
end

local function changeFloor(delta: number)
	local maxF = session.Floors or 1
	floor = math.clamp(floor + delta, 1, maxF)
	preview:ApplyFloorView(floor)
	BuildCamera.SetFloorY(floorBase())
	ui.SetFloor(floor, maxF)
	updateCursor()
end

local function askCustomColor(): boolean
	local text = Router.Prompt("Custom colour", "#RRGGBB  e.g. #FF8800", customColor and ("#" .. customColor:ToHex()) or "")
	if not text then
		return false
	end
	local hex = text:gsub("#", ""):gsub("%s", "")
	if #hex ~= 6 or hex:find("[^%x]") then
		Router.Notify("Use a hex colour like #FF8800", "error")
		return false
	end
	local ok, c = pcall(Color3.fromHex, hex)
	if ok and c then
		customColor = c
		return true
	end
	return false
end

local function onItem(itemId: string)
	local def = Furniture.ById[itemId]
	if not def then
		return
	end
	if def.VipOnly and not isVip() then
		Router.Notify("👑 " .. def.Name .. " is a VIP item", "warning", 2)
	end
	if Furniture.IsPaint(def) then
		if def.CustomColor and not askCustomColor() then
			return
		end
		paintId = itemId
		ui.SetActiveItem(itemId)
		if selected then
			paintKey(selected)
		end
		setTool("Paint")
		return
	end
	placeItem = itemId
	step = 0
	ui.SetActiveItem(itemId)
	setTool("Place")
	preview:SetCursor(itemId)
	updateCursor()
end

---------------------------------------------------------------------------
-- Confirm / cancel / exit
---------------------------------------------------------------------------
local function confirm()
	if confirming or not state then
		return
	end
	local ops = state:Compact()
	if #ops == 0 then
		Router.Notify("No changes to save", "info", 2)
		return
	end
	confirming = true
	local res = Net.Invoke("Build", "PlaceBatch", { ContextId = session.Id, Ops = ops })
	confirming = false
	if not active then
		return
	end
	if res.ok then
		state:Clear()
		if res.State then
			state:SetServerState(res.State)
		end
		local parts = {}
		if (res.Charged or 0) > 0 then
			table.insert(parts, "spent " .. Format.Money(res.Charged))
		end
		if (res.Credited or 0) > 0 then
			table.insert(parts, "got back " .. Format.Money(res.Credited))
		end
		Router.Notify("🏠 Saved!" .. (#parts > 0 and (" You " .. table.concat(parts, ", ") .. ".") or ""), "success", 3)
	else
		Router.Notify(res.err or "Couldn't save your changes", "error", 4)
	end
end

local function cancelAll()
	if not state or not state:HasChanges() then
		return
	end
	if Router.Confirm("Discard changes?", "All pending changes will be undone.", "Discard") then
		state:Clear()
		clearAction()
	end
end

local function cleanup()
	if not active then
		return
	end
	active = false
	RunService:UnbindFromRenderStep(RENDER)
	ContextActionService:UnbindAction(ACTION)
	maid:Clean()
	BuildCamera.Stop()
	if preview then
		preview:Destroy()
		preview = nil
	end
	if ui then
		ui.Destroy()
		ui = nil
	end
	state = nil
	if controlsDisabled then
		setControls(true)
	end
	Router.SetHudVisible(true)
	local id = session and session.Id
	session = nil
	if id then
		task.spawn(function()
			Net.Invoke("Build", "EndSession", { ContextId = id })
		end)
	end
end

function BuildController:IsActive(): boolean
	return active
end

function BuildController:Exit(force: boolean?)
	if not active then
		return
	end
	if not force and state and state:HasChanges() then
		if not Router.Confirm("Leave build mode?", "Your unsaved changes will be discarded.", "Leave") then
			return
		end
	end
	Router.Close("BuildMode") -- panel cleanup calls cleanup()
	cleanup()
end

---------------------------------------------------------------------------
-- Input
---------------------------------------------------------------------------
local TOOL_KEYS = {
	[Enum.KeyCode.One] = "Select",
	[Enum.KeyCode.Two] = "Place",
	[Enum.KeyCode.Three] = "Wall",
	[Enum.KeyCode.Four] = "Move",
	[Enum.KeyCode.Five] = "Rotate",
	[Enum.KeyCode.Six] = "Delete",
	[Enum.KeyCode.Seven] = "Paint",
}

local function toolIndex(): number
	for i, t in ipairs(BuildUI.Tools) do
		if t.Id == tool then
			return i
		end
	end
	return 1
end

local function ctrlDown(): boolean
	return UserInputService:IsKeyDown(Enum.KeyCode.LeftControl) or UserInputService:IsKeyDown(Enum.KeyCode.RightControl)
end

local function handleAction(_, inputState, input)
	if inputState ~= Enum.UserInputState.Begin then
		return Enum.ContextActionResult.Pass
	end
	if UserInputService:GetFocusedTextBox() then
		return Enum.ContextActionResult.Pass
	end
	local kc = input.KeyCode
	if kc == Enum.KeyCode.ButtonA then
		if GuiService.SelectedObject then
			return Enum.ContextActionResult.Pass
		end
		task.spawn(primary)
	elseif kc == Enum.KeyCode.R or kc == Enum.KeyCode.ButtonR1 then
		rotate(1)
	elseif kc == Enum.KeyCode.T or kc == Enum.KeyCode.ButtonL1 then
		rotate(-1)
	elseif kc == Enum.KeyCode.X or kc == Enum.KeyCode.Delete or kc == Enum.KeyCode.ButtonX then
		deleteSelected()
	elseif kc == Enum.KeyCode.Z and ctrlDown() then
		if UserInputService:IsKeyDown(Enum.KeyCode.LeftShift) then
			state:Redo()
		else
			state:Undo()
		end
	elseif kc == Enum.KeyCode.Y and ctrlDown() then
		state:Redo()
	elseif kc == Enum.KeyCode.G then
		gridOn = not gridOn
		ui.SetGrid(gridOn, gridSize())
	elseif kc == Enum.KeyCode.F then
		free = not free
		ui.SetFree(free)
	elseif kc == Enum.KeyCode.C or kc == Enum.KeyCode.ButtonY then
		ui.ToggleCatalog()
	elseif kc == Enum.KeyCode.PageUp or kc == Enum.KeyCode.DPadUp then
		changeFloor(1)
	elseif kc == Enum.KeyCode.PageDown or kc == Enum.KeyCode.DPadDown then
		changeFloor(-1)
	elseif kc == Enum.KeyCode.DPadLeft or kc == Enum.KeyCode.DPadRight then
		if GuiService.SelectedObject then
			return Enum.ContextActionResult.Pass
		end
		local n = #BuildUI.Tools
		local dir = kc == Enum.KeyCode.DPadRight and 1 or -1
		local i = (toolIndex() - 1 + dir) % n + 1
		if BuildUI.Tools[i].Id == "Wall" and not wallsAllowed() then
			i = (i - 1 + dir) % n + 1
		end
		setTool(BuildUI.Tools[i].Id)
	elseif kc == Enum.KeyCode.Return or kc == Enum.KeyCode.KeypadEnter or kc == Enum.KeyCode.ButtonSelect then
		task.spawn(confirm)
	elseif kc == Enum.KeyCode.Backspace or kc == Enum.KeyCode.ButtonB then
		if GuiService.SelectedObject then
			GuiService.SelectedObject = nil
		else
			cancelAction()
		end
	elseif kc == Enum.KeyCode.ButtonStart then
		task.spawn(function()
			BuildController:Exit(false)
		end)
	elseif TOOL_KEYS[kc] then
		setTool(TOOL_KEYS[kc])
	else
		return Enum.ContextActionResult.Pass
	end
	return Enum.ContextActionResult.Sink
end

local function bindInput()
	local keys = {
		Enum.KeyCode.ButtonA,
		Enum.KeyCode.R,
		Enum.KeyCode.T,
		Enum.KeyCode.X,
		Enum.KeyCode.Delete,
		Enum.KeyCode.Z,
		Enum.KeyCode.Y,
		Enum.KeyCode.G,
		Enum.KeyCode.F,
		Enum.KeyCode.C,
		Enum.KeyCode.PageUp,
		Enum.KeyCode.PageDown,
		Enum.KeyCode.Return,
		Enum.KeyCode.KeypadEnter,
		Enum.KeyCode.Backspace,
		Enum.KeyCode.ButtonR1,
		Enum.KeyCode.ButtonL1,
		Enum.KeyCode.ButtonX,
		Enum.KeyCode.ButtonY,
		Enum.KeyCode.ButtonB,
		Enum.KeyCode.DPadUp,
		Enum.KeyCode.DPadDown,
		Enum.KeyCode.DPadLeft,
		Enum.KeyCode.DPadRight,
		Enum.KeyCode.ButtonSelect,
		Enum.KeyCode.ButtonStart,
	}
	for kc in pairs(TOOL_KEYS) do
		table.insert(keys, kc)
	end
	ContextActionService:BindActionAtPriority(ACTION, handleAction, false, Enum.ContextActionPriority.High.Value + 20, table.unpack(keys))

	maid:Give(UserInputService.InputBegan:Connect(function(input, processed)
		if processed or not active then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton1 then
			local m = UserInputService:GetMouseLocation()
			pointer.Pos = m
			pointer.Viewport = true
			pointer.Set = true
			task.spawn(primary)
		end
	end))
	maid:Give(UserInputService.InputEnded:Connect(function(input)
		if not active then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton1 and tool == "Wall" and wallStart and wallDragArmed then
			wallDragArmed = false
			updateCursor()
			if wallPreview and wallPreview.End and (wallPreview.End - wallStart).Magnitude >= 2 then
				commitWall(wallPreview.End, false)
			end
		end
	end))
	maid:Give(UserInputService.InputChanged:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseMovement then
			pointer.Pos = UserInputService:GetMouseLocation()
			pointer.Viewport = true
			pointer.Set = true
		end
	end))
	maid:Give(UserInputService.TouchTap:Connect(function(positions, processed)
		if processed or not active or BuildCamera.IsGesturing() then
			return
		end
		local pos = positions[1]
		if not pos then
			return
		end
		local prev = hover
		pointer.Pos = Vector2.new(pos.X, pos.Y)
		pointer.Viewport = false
		pointer.Set = true
		if tool == "Place" or (tool == "Move" and movingKey) then
			updateCursor()
			-- first tap shows the ghost; tapping it again (or ✔) places
			if prev and hover and (prev.Pos - hover.Pos).Magnitude < 2.5 then
				task.spawn(primary)
			end
		else
			task.spawn(primary)
		end
	end))
end

---------------------------------------------------------------------------
-- Enter
---------------------------------------------------------------------------
local function buildPanel(content: Frame, data, ctx)
	local callbacks = {
		OnTool = function(t)
			setTool(t)
		end,
		OnItem = onItem,
		OnUndo = function()
			if state then
				state:Undo()
			end
		end,
		OnRedo = function()
			if state then
				state:Redo()
			end
		end,
		OnGridToggle = function()
			gridOn = not gridOn
			ui.SetGrid(gridOn, gridSize())
		end,
		OnGridSize = function()
			gridIndex = gridIndex % #CFG.GridSizes + 1
			gridOn = true
			ui.SetGrid(gridOn, gridSize())
		end,
		OnFree = function()
			free = not free
			ui.SetFree(free)
		end,
		OnFloor = changeFloor,
		OnConfirm = confirm,
		OnCancel = cancelAll,
		OnExit = function()
			BuildController:Exit(false)
		end,
		OnRotate = function()
			rotate(1)
		end,
		OnPlaceHere = function()
			primary()
		end,
		OnDeleteSelected = deleteSelected,
		OnCancelAction = cancelAction,
		OnSelectionAction = function(action)
			if not selected then
				return
			end
			if action == "Move" then
				local e = state:Get(selected)
				if e then
					setTool("Move")
					movingKey = selected
					step = e.Step
					preview:SetCursor(e.ItemId, e.Color, e.Material)
					selectKey(nil)
					ui.SetHint(hintFor())
				end
			elseif action == "Rotate" then
				rotateKey(selected, 1)
			elseif action == "Paint" then
				paintKey(selected)
			elseif action == "Delete" then
				deleteSelected()
			end
		end,
		OnWallpaper = wallpaper,
	}
	ui = BuildUI.Create(content, session, callbacks)
	ui.SetGrid(gridOn, gridSize())
	ui.SetFree(free)
	ui.SetFloor(floor, session.Floors or 1)
	ui.SetTool(tool)
	ui.SetHint(hintFor())

	-- gamepad reticle
	local reticle = Kit.Label("＋", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(40, 40),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = 30,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextColor3 = Theme.Colors.Text,
		TextStrokeTransparency = 0.3,
		Visible = Kit.IsGamepad(),
		Parent = ui.Root,
	})
	ctx.Maid:Give(UserInputService.LastInputTypeChanged:Connect(function(last)
		reticle.Visible = last.Name:find("Gamepad") ~= nil
		if ui then
			ui.SetHint(hintFor())
		end
	end))
	ctx.Maid:Give(ClientData.OnChanged("Cash", function()
		refreshBudget()
	end))
	return function()
		task.defer(cleanup)
	end
end

function BuildController:Enter(contextId: string)
	if active or entering then
		return
	end
	if type(contextId) ~= "string" then
		return
	end
	entering = true
	local res = Net.Invoke("Build", "BeginSession", { ContextId = contextId })
	entering = false
	if not res.ok or type(res.Context) ~= "table" then
		Router.Notify(res.err or "Can't build here right now", "error")
		return
	end
	session = res.Context
	active = true
	tool = "Select"
	placeItem = nil
	selected = nil
	movingKey = nil
	wallStart = nil
	quote = nil
	pointer.Set = false
	floor = 1
	-- start on the floor the player is standing on
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		local rel = session.Origin:PointToObjectSpace(root.Position)
		floor = math.clamp(BuildMath.FloorOf(rel.Y - 3, session.FloorHeight or CFG.FloorHeight), 1, session.Floors or 1)
	end

	state = BuildState.new(session)
	preview = BuildPreview.new(session)

	Router.CloseAll()
	Router.SetHudVisible(false)
	setControls(false)
	Router.Open("BuildMode", session)
	if not ui then
		cleanup()
		return
	end

	maid:Give(state.Changed:Connect(onStateChanged))
	BuildCamera.Start(session.Origin, session.Size, floorBase())
	bindInput()
	RunService:BindToRenderStep(RENDER, Enum.RenderPriority.Camera.Value + 2, function()
		if active then
			updateCursor()
		end
	end)

	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if hum then
		maid:Give(hum.Died:Connect(function()
			BuildController:Exit(true)
		end))
	end
	maid:Give(player.CharacterRemoving:Connect(function()
		BuildController:Exit(true)
	end))

	onStateChanged()
	ui.ToggleCatalog(true)
	Router.Notify("🔨 Build mode — changes are saved when you press Confirm", "info", 3)
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function BuildController:Init()
	Router.Register("BuildMode", {
		Title = "Build",
		Icon = "🔨",
		Kind = "custom",
		Build = buildPanel,
	})
end

function BuildController:Start()
	Net.Listen("BuildEvent", function(kind, id, data)
		if not active or not session or id ~= session.Id then
			return
		end
		if kind == "State" and state then
			state:SetServerState(data)
			if type(data) == "table" and type(data.Floors) == "number" then
				session.Floors = data.Floors
				if floor > data.Floors then
					changeFloor(0)
				end
			end
		elseif kind == "SessionEnded" then
			Router.Notify(type(data) == "string" and data ~= "" and data or "Build mode closed", "warning")
			BuildController:Exit(true)
		end
	end)
end

return BuildController
