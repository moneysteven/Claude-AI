-- BuildService: Bloxburg-style build mode for any "build context" (homes, businesses, ...).
--
-- CONTRACT (ARCHITECTURE §5)
--   BuildService:RegisterContext(id, ctx)   ctx = { Owner, Origin, Size, DataPath, Catalog, MaxItems, Floors, CanBuild, Folder }
--   BuildService:UnregisterContext(id)      removes the context and its instantiated items (saved data is kept)
--   BuildService:LoadBuild(id) -> count     (re)instantiates every saved item from ctx.Owner's data at ctx.DataPath
--   BuildService:ClearBuild(id)             destroys the instantiated items (saved data is kept)
-- Optional ctx extras (all optional, businesses can ignore them):
--   ctx.Label            string shown in the build UI
--   ctx.CanUse(player)   -> boolean  doors / lights permission (nil = everyone)
--   ctx.LockHost         Instance with boolean attribute "Locked" (door prompts show 🔒)
--   ctx.SurfaceRoot      Instance whose descendant parts with attribute Surface = "Walls"|"Floor" can be wallpapered
--   ctx.OnItemsChanged(valueDelta, result)  called after a batch is applied (housing adds furniture value to the house)
--   ctx.FloorHeight      default Config.Housing.Build.FloorHeight
-- Extra API:
--   BuildService:GetModels(id) -> { Model }            BuildService:FindByFunction(id, fn) -> { Model }
--   BuildService:GetMaxItems(id) -> number             BuildService:RefreshContext(id)  (after Floors/MaxItems change)
--   BuildService:RefreshPermissions()                  (after CanBuild results change, e.g. builder added)
--   BuildService:WipeBuild(id, refundFraction?) -> refund   clears saved items, refunds paid items to the owner
--   BuildService:SellBackValue(build) -> number        sell-back value of a raw saved build table
--
-- Remote "Build": GetBuildable, BeginSession{ContextId}, Quote{ContextId, Ops}, PlaceBatch{ContextId, Ops}, EndSession{}
-- Event  "BuildEvent" (s->c): ("Buildable", list) · ("State", id, state) · ("SessionEnded", id, reason)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Furniture = require(Shared.Config.Furniture)
local HousingConfig = require(Shared.Config.Housing)
local BuildMath = require(Shared.Build.BuildMath)
local Serializer = require(Shared.Build.Serializer)
local Format = require(Shared.Util.Format)

local Server = ServerScriptService.Server
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local FurnitureFactory = require(script.Parent.FurnitureFactory)
local Interactables = require(script.Parent.Interactables)
local BuildValidator = require(script.Parent.BuildValidator)

local BuildService = {
	Name = "BuildService",
	Priority = 40,
}

local CFG = HousingConfig.Build

type Runtime = {
	Id: string,
	Ctx: any,
	Entries: { [string]: any },
	NextUid: number,
	Surfaces: { [string]: any },
	Models: { [string]: Model },
	Loaded: boolean,
}

local contexts: { [string]: Runtime } = {}
local sessions: { [Player]: string } = {}
local buildableSig: { [Player]: string } = {}
local permissionsQueued = false

local DataService, EconomyService, NotifyService
local contextsFolder: Folder

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function floorHeight(ctx): number
	return ctx.FloorHeight or CFG.FloorHeight
end

local function isVip(player: Player): boolean
	local mon = Registry.Find("MonetizationService")
	if mon and mon.HasPass then
		local ok, res = pcall(mon.HasPass, mon, player, "VIP")
		if ok then
			return res == true
		end
	end
	return player:GetAttribute("VIP") == true
end

local function canBuild(ctx, player: Player): boolean
	if type(ctx.CanBuild) ~= "function" then
		return player == ctx.Owner
	end
	local ok, res = pcall(ctx.CanBuild, player)
	return ok and res == true
end

local function maxItemsFor(rt: Runtime): number
	local ctx = rt.Ctx
	local n = tonumber(ctx.MaxItems) or 100
	if ctx.Owner and isVip(ctx.Owner) then
		n += CFG.VipExtraItems
	end
	return math.clamp(math.floor(n), 1, CFG.HardItemCap)
end

local function worldCFrame(ctx, entry): CFrame
	return ctx.Origin * BuildMath.Compose(entry.Position, entry.Step)
end

local function heightOf(ctx): number
	return math.max(1, ctx.Floors or 1) * floorHeight(ctx) + CFG.RoofAllowance
end

local function nearContext(player: Player, ctx): boolean
	local pos = Guard.RootPosition(player)
	if not pos then
		return false
	end
	return BuildMath.PointInArea(ctx.Origin, ctx.Size, pos, CFG.SessionMaxDistance, heightOf(ctx))
end

local function entryForClient(e)
	return {
		Uid = e.Uid,
		ItemId = e.ItemId,
		P = e.Position,
		R = e.Step,
		C = e.Color and Serializer.ColorToArray(e.Color) or nil,
		M = e.Material,
		Paid = e.Paid,
		Free = e.Free,
	}
end

local function surfacesForClient(surfaces)
	local out = {}
	for target, s in pairs(surfaces) do
		out[target] = { C = s.Color and Serializer.ColorToArray(s.Color) or nil, M = s.Material }
	end
	return out
end

local function stateFor(rt: Runtime)
	local items = {}
	for _, e in pairs(rt.Entries) do
		table.insert(items, entryForClient(e))
	end
	return {
		Items = items,
		Surfaces = surfacesForClient(rt.Surfaces),
		MaxItems = maxItemsFor(rt),
		Floors = rt.Ctx.Floors or 1,
		Size = rt.Ctx.Size,
	}
end

local function describe(rt: Runtime, player: Player)
	local ctx = rt.Ctx
	local state = stateFor(rt)
	return {
		Id = rt.Id,
		Label = ctx.Label or rt.Id,
		Origin = ctx.Origin,
		Size = ctx.Size,
		Floors = ctx.Floors or 1,
		FloorHeight = floorHeight(ctx),
		RoofAllowance = CFG.RoofAllowance,
		MaxItems = state.MaxItems,
		Catalog = ctx.Catalog or "House",
		Folder = ctx.Folder,
		CanWallpaper = ctx.SurfaceRoot ~= nil,
		IsOwner = player == ctx.Owner,
		SellBack = CFG.SellBackFraction,
		Items = state.Items,
		Surfaces = state.Surfaces,
	}
end

local function applySurfaces(rt: Runtime)
	local root = rt.Ctx.SurfaceRoot
	if not root or not root.Parent then
		return
	end
	local FurnitureBuilder = require(Shared.Build.FurnitureBuilder)
	for _, d in ipairs(root:GetDescendants()) do
		if d:IsA("BasePart") then
			local target = d:GetAttribute("Surface")
			local s = target and rt.Surfaces[target]
			if s then
				if s.Color then
					d.Color = s.Color
				end
				local mat = FurnitureBuilder.MaterialFromName(s.Material)
				if mat then
					d.Material = mat
				end
			end
		end
	end
end

local function destroyModel(rt: Runtime, uid: string)
	local m = rt.Models[uid]
	if m then
		rt.Models[uid] = nil
		m:Destroy()
	end
end

local function instantiate(rt: Runtime, entry)
	local ctx = rt.Ctx
	local def = Furniture.ById[entry.ItemId]
	if not def or Furniture.IsPaint(def) then
		return
	end
	destroyModel(rt, entry.Uid)
	local ok, model = pcall(FurnitureFactory.Create, def, { Color = entry.Color, Material = entry.Material })
	if not ok or not model then
		warn("[BuildService] failed to build", entry.ItemId, model)
		return
	end
	model.Name = "Item_" .. entry.Uid
	model:SetAttribute("Uid", entry.Uid)
	model:SetAttribute("ContextId", rt.Id)
	model:SetAttribute("Catalog", ctx.Catalog or "House")
	if def.HideInBuild then
		model:SetAttribute("HideInBuild", true)
	end
	model:PivotTo(worldCFrame(ctx, entry))
	if def.Function == "Door" then
		Interactables.AttachDoor(model, {
			Style = def.DoorStyle,
			CanOpen = ctx.CanUse and function(p)
				if ctx.CanUse(p) then
					return true
				end
				return false, "🔒 This door is locked"
			end or nil,
			LockHost = ctx.LockHost,
			OnDenied = function(p, reason)
				if NotifyService then
					NotifyService:Send(p, reason or "🔒 Locked", "warning", 2)
				end
			end,
		})
	elseif def.Function == "Light" then
		Interactables.AttachLight(model, ctx.CanUse)
	end
	model.Parent = ctx.Folder
	rt.Models[entry.Uid] = model
end

local function sessionPlayers(id: string): { Player }
	local out = {}
	for p, sid in pairs(sessions) do
		if sid == id and p.Parent == Players then
			table.insert(out, p)
		end
	end
	return out
end

local function broadcastState(rt: Runtime)
	local list = sessionPlayers(rt.Id)
	if #list > 0 then
		Net.FireList(list, "BuildEvent", "State", rt.Id, stateFor(rt))
	end
end

local function endSession(player: Player, reason: string?)
	local id = sessions[player]
	if not id then
		return
	end
	sessions[player] = nil
	if player.Parent == Players then
		Net.Fire(player, "BuildEvent", "SessionEnded", id, reason or "")
	end
end

local function saveRuntime(rt: Runtime): boolean
	local ctx = rt.Ctx
	if not ctx.Owner or not DataService:IsLoaded(ctx.Owner) or type(ctx.DataPath) ~= "string" then
		return false
	end
	return DataService:Set(ctx.Owner, ctx.DataPath, Serializer.EncodeBuild(rt.Entries, rt.NextUid, rt.Surfaces)) ~= false
end

local function buildableFor(player: Player)
	local list = {}
	for id, rt in pairs(contexts) do
		local ctx = rt.Ctx
		if ctx.Origin and ctx.Size and canBuild(ctx, player) then
			table.insert(list, {
				Id = id,
				Label = ctx.Label or id,
				Origin = ctx.Origin,
				Size = ctx.Size,
				Height = heightOf(ctx),
				IsOwner = ctx.Owner == player,
			})
		end
	end
	table.sort(list, function(a, b)
		return a.Id < b.Id
	end)
	return list
end

local function refreshPermissionsNow()
	for _, player in ipairs(Players:GetPlayers()) do
		local list = buildableFor(player)
		local parts = {}
		for _, b in ipairs(list) do
			table.insert(parts, b.Id .. "@" .. tostring(b.Origin.Position) .. tostring(b.Size))
		end
		local sig = table.concat(parts, "|")
		if buildableSig[player] ~= sig then
			buildableSig[player] = sig
			Net.Fire(player, "BuildEvent", "Buildable", list)
		end
		-- end sessions that lost permission
		local sid = sessions[player]
		if sid then
			local rt = contexts[sid]
			if not rt or not canBuild(rt.Ctx, player) then
				endSession(player, "You can no longer build here")
			end
		end
	end
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function BuildService:RegisterContext(id: string, ctx)
	assert(type(id) == "string" and Guard.Id(id, 64), "BuildService:RegisterContext bad id")
	assert(type(ctx) == "table" and typeof(ctx.Origin) == "CFrame" and typeof(ctx.Size) == "Vector3", "BuildService: ctx needs Origin and Size")
	local existing = contexts[id]
	if existing then
		if existing.Ctx == ctx then
			self:RefreshContext(id)
			return
		end
		self:UnregisterContext(id)
	end
	if not ctx.Folder or not ctx.Folder.Parent then
		local folder = Instance.new("Folder")
		folder.Name = id
		folder.Parent = contextsFolder
		ctx.Folder = folder
	end
	contexts[id] = {
		Id = id,
		Ctx = ctx,
		Entries = {},
		NextUid = 1,
		Surfaces = {},
		Models = {},
		Loaded = false,
	}
	self:RefreshPermissions()
end

function BuildService:UnregisterContext(id: string)
	local rt = contexts[id]
	if not rt then
		return
	end
	for _, p in ipairs(sessionPlayers(id)) do
		endSession(p, "This build area was closed")
	end
	self:ClearBuild(id)
	contexts[id] = nil
	self:RefreshPermissions()
end

function BuildService:GetContext(id: string)
	local rt = contexts[id]
	return rt and rt.Ctx or nil
end

function BuildService:LoadBuild(id: string): number
	local rt = contexts[id]
	if not rt then
		return 0
	end
	self:ClearBuild(id)
	local ctx = rt.Ctx
	local raw = ctx.Owner and type(ctx.DataPath) == "string" and DataService:Get(ctx.Owner, ctx.DataPath) or nil
	local entries, nextUid, surfaces = Serializer.DecodeBuild(raw)
	rt.Entries = entries
	rt.NextUid = nextUid
	rt.Surfaces = surfaces
	rt.Loaded = true
	local fh = floorHeight(ctx)
	local loaded = 0
	for _, e in pairs(entries) do
		-- items that no longer fit (catalog / plot changes) stay saved but are not spawned
		if BuildValidator.CanLoad(ctx, e, fh, CFG.RoofAllowance) then
			instantiate(rt, e)
			loaded += 1
		end
	end
	applySurfaces(rt)
	broadcastState(rt)
	return loaded
end

function BuildService:ClearBuild(id: string)
	local rt = contexts[id]
	if not rt then
		return
	end
	for uid in pairs(rt.Models) do
		destroyModel(rt, uid)
	end
	table.clear(rt.Models)
	rt.Loaded = false
end

function BuildService:GetModels(id: string): { Model }
	local rt = contexts[id]
	local out = {}
	if rt then
		for _, m in pairs(rt.Models) do
			table.insert(out, m)
		end
	end
	return out
end

function BuildService:FindByFunction(id: string, fn: string): { Model }
	local out = {}
	for _, m in ipairs(self:GetModels(id)) do
		if m:GetAttribute("Function") == fn then
			table.insert(out, m)
		end
	end
	return out
end

function BuildService:GetMaxItems(id: string): number
	local rt = contexts[id]
	return rt and maxItemsFor(rt) or 0
end

function BuildService:RefreshContext(id: string)
	local rt = contexts[id]
	if rt then
		applySurfaces(rt)
		broadcastState(rt)
	end
	self:RefreshPermissions()
end

function BuildService:RefreshPermissions()
	if permissionsQueued then
		return
	end
	permissionsQueued = true
	task.defer(function()
		permissionsQueued = false
		refreshPermissionsNow()
	end)
end

function BuildService:SellBackValue(build: any): number
	return Serializer.SellBackValue(build, CFG.SellBackFraction)
end

function BuildService:WipeBuild(id: string, refundFraction: number?): number
	local rt = contexts[id]
	if not rt then
		return 0
	end
	local ctx = rt.Ctx
	if not rt.Loaded then
		self:LoadBuild(id)
	end
	local fraction = refundFraction or CFG.SellBackFraction
	local refund = 0
	for _, e in pairs(rt.Entries) do
		if not e.Free then
			refund += math.floor(e.Paid * fraction)
		end
	end
	self:ClearBuild(id)
	rt.Entries = {}
	rt.Surfaces = {}
	rt.Loaded = true
	saveRuntime(rt)
	if refund > 0 and ctx.Owner then
		EconomyService:AddCash(ctx.Owner, refund, "Build:SellBack")
	end
	broadcastState(rt)
	return refund
end

---------------------------------------------------------------------------
-- Remote handlers
---------------------------------------------------------------------------
local function sessionContext(player: Player, payload): (Runtime?, string?)
	local id = Guard.Id(payload.ContextId, 64)
	if not id then
		return nil, "Bad request"
	end
	if sessions[player] ~= id then
		return nil, "Open build mode first"
	end
	local rt = contexts[id]
	if not rt then
		return nil, "This build area is gone"
	end
	if not canBuild(rt.Ctx, player) then
		endSession(player, "You can no longer build here")
		return nil, "You can't build here"
	end
	if not nearContext(player, rt.Ctx) then
		return nil, "You're too far from the build area"
	end
	if not rt.Loaded then
		BuildService:LoadBuild(id)
	end
	return rt, nil
end

local function evaluate(player: Player, rt: Runtime, ops)
	if not BuildValidator.IsOpArray(ops, CFG.MaxOpsPerBatch) then
		return { ok = false, err = ("Send between 1 and %d changes at a time"):format(CFG.MaxOpsPerBatch) }
	end
	return BuildValidator.Evaluate({
		Player = player,
		Ctx = rt.Ctx,
		State = { Entries = rt.Entries, NextUid = rt.NextUid, Surfaces = rt.Surfaces },
		Ops = ops,
		Economy = EconomyService,
		IsVip = isVip,
		MaxItems = maxItemsFor(rt),
		FloorHeight = floorHeight(rt.Ctx),
		RoofAllowance = CFG.RoofAllowance,
		SellBack = CFG.SellBackFraction,
	})
end

local function placeBatch(player: Player, payload)
	local rt, err = sessionContext(player, payload)
	if not rt then
		return { ok = false, err = err }
	end
	local ctx = rt.Ctx
	local owner: Player? = ctx.Owner
	if not owner or owner.Parent ~= Players or not DataService:IsLoaded(owner) then
		return { ok = false, err = "The owner isn't here" }
	end
	local result = evaluate(player, rt, payload.Ops)
	if not result.ok then
		return { ok = false, err = result.err, Index = result.Index }
	end

	-- charge atomically (owner nets sell-backs against purchases; builders pay their own purchases)
	local cost, refund = result.Cost, result.Refund
	local charged = 0
	local credited = 0
	if player == owner then
		local net = cost - refund
		if net > 0 then
			if not EconomyService:TrySpend(player, net, "Build:" .. rt.Id) then
				return { ok = false, err = ("You need %s for these changes"):format(Format.Money(net)) }
			end
			charged = net
		elseif net < 0 then
			credited = -net
		end
	else
		if cost > 0 then
			if not EconomyService:TrySpend(player, cost, "Build:" .. rt.Id) then
				return { ok = false, err = ("You need %s for these changes"):format(Format.Money(cost)) }
			end
			charged = cost
		end
		credited = refund -- removed items belong to the house: the owner gets the sell-back
	end

	-- apply exactly the validated plan
	local okApply, applyErr = pcall(function()
		rt.Entries = result.Entries
		rt.NextUid = result.NextUid
		rt.Surfaces = result.Surfaces
		local surfacesChanged = false
		for _, change in ipairs(result.Changes) do
			if change.Kind == "Remove" then
				destroyModel(rt, change.Uid)
			elseif change.Kind == "Surface" then
				surfacesChanged = true
			else
				local e = rt.Entries[change.Uid]
				if e then
					instantiate(rt, e)
				else
					destroyModel(rt, change.Uid)
				end
			end
		end
		if surfacesChanged then
			applySurfaces(rt)
		end
	end)
	if not okApply then
		warn("[BuildService] apply failed:", applyErr)
		if charged > 0 then
			EconomyService:AddCash(player, charged, "Build:Refund")
		end
		BuildService:LoadBuild(rt.Id)
		return { ok = false, err = "Couldn't apply your changes — you were refunded" }
	end

	saveRuntime(rt)
	if credited > 0 then
		EconomyService:AddCash(owner, credited, "Build:SellBack")
	end
	if type(ctx.OnItemsChanged) == "function" then
		task.spawn(function()
			local ok, e = pcall(ctx.OnItemsChanged, result.ValueDelta, result)
			if not ok then
				warn("[BuildService] OnItemsChanged error:", e)
			end
		end)
	end
	broadcastState(rt)
	return {
		ok = true,
		Cost = cost,
		Refund = refund,
		Charged = charged,
		Credited = credited,
		State = stateFor(rt),
	}
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function BuildService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")

	contextsFolder = Workspace:FindFirstChild("BuildContexts") :: Folder
	if not contextsFolder then
		contextsFolder = Instance.new("Folder")
		contextsFolder.Name = "BuildContexts"
		contextsFolder.Parent = Workspace
	end

	Net.Declare("BuildEvent")

	Net.HandleActions("Build", {
		GetBuildable = function(player)
			return { ok = true, List = buildableFor(player) }
		end,

		BeginSession = function(player, payload)
			local id = Guard.Id(payload.ContextId, 64)
			local rt = id and contexts[id]
			if not rt then
				return { ok = false, err = "Nothing to build here" }
			end
			if not canBuild(rt.Ctx, player) then
				return { ok = false, err = "You don't have permission to build here" }
			end
			if not nearContext(player, rt.Ctx) then
				return { ok = false, err = "Go to the plot to build" }
			end
			if player:GetAttribute("InVehicle") then
				return { ok = false, err = "Get out of your vehicle first" }
			end
			if not rt.Loaded then
				self:LoadBuild(rt.Id)
			end
			sessions[player] = rt.Id
			local tutorial = Registry.Find("TutorialService")
			if tutorial and tutorial.Advance then
				task.spawn(function()
					pcall(tutorial.Advance, tutorial, player, "EnterBuild")
				end)
			end
			return { ok = true, Context = describe(rt, player) }
		end,

		Quote = function(player, payload)
			local rt, err = sessionContext(player, payload)
			if not rt then
				return { ok = false, err = err }
			end
			local result = evaluate(player, rt, payload.Ops)
			if not result.ok then
				return { ok = false, err = result.err, Index = result.Index }
			end
			local isOwner = player == rt.Ctx.Owner
			return {
				ok = true,
				Cost = result.Cost,
				Refund = result.Refund,
				Net = isOwner and (result.Cost - result.Refund) or result.Cost,
				Count = result.Count,
				MaxItems = maxItemsFor(rt),
			}
		end,

		PlaceBatch = placeBatch,

		EndSession = function(player, payload)
			-- only end the session the client is leaving (a late EndSession must not kill a newer session)
			local id = payload.ContextId ~= nil and Guard.Id(payload.ContextId, 64) or nil
			if id == nil or sessions[player] == id then
				sessions[player] = nil
			end
			return { ok = true }
		end,
	}, {
		rate = 6,
		burst = 12,
		perAction = {
			Quote = { rate = 3, burst = 6 },
			PlaceBatch = { rate = 1, burst = 3 },
			BeginSession = { rate = 1, burst = 3 },
		},
	})

	Players.PlayerRemoving:Connect(function(player)
		sessions[player] = nil
		buildableSig[player] = nil
		-- contexts owned by a leaving player are closed (their owner service may also do this)
		task.defer(function()
			for id, rt in pairs(contexts) do
				if rt.Ctx.Owner == player then
					self:UnregisterContext(id)
				end
			end
		end)
	end)
end

function BuildService:Start()
	-- permissions can depend on things other systems change (friends, employees): re-check slowly
	task.spawn(function()
		while true do
			task.wait(5)
			refreshPermissionsNow()
		end
	end)
end

return BuildService
