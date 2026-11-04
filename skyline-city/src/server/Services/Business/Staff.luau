-- Staff (server helper): NPC staff and PLAYER employees of businesses.
--
-- NPC staff:  Staff.HireNPC(owner, biz, role) / Staff.FireNPC(owner, biz, role) -> response
-- Players:    Staff.Offer(owner, biz, userId, role, wage) -> response      (opens "JobOfferBusiness" for the target)
--             Staff.Accept(player, offerId) / Staff.Decline(player, offerId) / Staff.Quit(player)
--             Staff.FireEmployee(owner, biz, userId) -> response
--             Staff.WorkTask(player) -> response   (at a matching station; wage from the owner's vault, then wallet)
--             Staff.GetEmployer(player) -> (ownerPlayer?, bizId?)
--             Staff.OnlineEmployees(biz) -> { [role] = count }
--             Staff.List(biz) -> { { UserId, Name, Role, Wage, Online } }
-- Lifecycle:  Staff.OnBizLoaded(biz) / Staff.OnBizUnloaded(biz) / Staff.OnPlayerAdded(p) / Staff.OnPlayerRemoving(p)
--
-- Player attributes set on employees: EmployerName (§6), BizEmployerLot, BizEmployerKey, BizRole, BizWage.
-- Employment is saved in the OWNER's record: Businesses.<bizId>.Employees[userIdString] = { Role, Wage, Name, Since }.

local Players = game:GetService("Players")
local ServerScriptService = game:GetService("ServerScriptService")

local Registry = require(ServerScriptService.Server.Registry)
local Guard = require(ServerScriptService.Server.Lib.Guard)

local BizState = require(script.Parent.BizState)
local BizMath = require(script.Parent.BizMath)
local Ledger = require(script.Parent.Ledger)
local Stations = require(script.Parent.Stations)

local Config = BizState.Config
local Work = Config.PlayerWork

local Staff = {}

type Offer = { Id: string, BizKey: string, Owner: Player, BizId: string, Role: string, Wage: number, Expires: number }

local offers: { [Player]: Offer } = {}
local lastOfferBy: { [Player]: number } = {}
local lastTask: { [Player]: number } = {}
local taskWindow: { [Player]: { Start: number, Count: number } } = {}
local offerCounter = 0

local function fail(err: string, extra: { [string]: any }?)
	local r = { ok = false, err = err }
	if extra then
		for k, v in pairs(extra) do
			r[k] = v
		end
	end
	return r
end

local function employeesOf(rec): { [string]: any }
	return type(rec.Employees) == "table" and rec.Employees or {}
end

local function countEmployees(rec): number
	local n = 0
	for _ in pairs(employeesOf(rec)) do
		n += 1
	end
	return n
end

local function setAttributes(player: Player, biz, entry)
	local rec = BizState.RecOf(biz)
	player:SetAttribute("EmployerName", BizState.DisplayName(rec, biz.Owner))
	player:SetAttribute("BizEmployerLot", biz.Lot and biz.Lot.Id or "")
	player:SetAttribute("BizEmployerKey", biz.Key)
	player:SetAttribute("BizRole", entry.Role)
	player:SetAttribute("BizWage", entry.Wage)
end

local function clearAttributes(player: Player)
	if player.Parent ~= Players then
		return
	end
	player:SetAttribute("EmployerName", "")
	player:SetAttribute("BizEmployerLot", nil)
	player:SetAttribute("BizEmployerKey", nil)
	player:SetAttribute("BizRole", nil)
	player:SetAttribute("BizWage", nil)
end

local function phone(player: Player, from: string, text: string)
	local ps = Registry.Find("PhoneService")
	if ps and ps.SendSystemMessage then
		task.spawn(function()
			pcall(ps.SendSystemMessage, ps, player, from, text)
		end)
	end
end

---------------------------------------------------------------------------
-- NPC staff
---------------------------------------------------------------------------
function Staff.HireNPC(owner: Player, biz, role: string)
	local rec = BizState.RecOf(biz)
	local t = BizState.TypeOf(biz)
	local def = Config.Roles[role]
	if not rec or not t or not def or not t.StaffRoleSet[role] then
		return fail("This business can't hire that role")
	end
	if BizMath.StaffCount(rec) >= BizMath.MaxStaff(rec) then
		return fail(("Staff limit reached (%d). Level up your business to hire more."):format(BizMath.MaxStaff(rec)))
	end
	local current = type(rec.Staff) == "table" and math.floor(tonumber(rec.Staff[role]) or 0) or 0
	if current >= def.MaxPerBusiness then
		return fail(("You already have %d %s NPCs"):format(current, def.Name))
	end
	local EconomyService = BizState.Deps.EconomyService
	if not EconomyService:TrySpend(owner, def.HireCost, "Business:Hire:" .. role) then
		return fail("Not enough cash")
	end
	BizState.Set(biz, "Staff." .. role, current + 1)
	return { ok = true }
end

function Staff.FireNPC(owner: Player, biz, role: string)
	local rec = BizState.RecOf(biz)
	local current = rec and type(rec.Staff) == "table" and math.floor(tonumber(rec.Staff[role]) or 0) or 0
	if current <= 0 then
		return fail("No NPC staff with that role")
	end
	BizState.Set(biz, "Staff." .. role, current - 1 > 0 and current - 1 or nil)
	return { ok = true }
end

---------------------------------------------------------------------------
-- Player employees
---------------------------------------------------------------------------
function Staff.GetEmployer(player: Player): (Player?, string?)
	local biz = BizState.EmployeeOf[player.UserId]
	if biz and BizState.Loaded[biz.Key] == biz then
		return biz.Owner, biz.Id
	end
	return nil, nil
end

function Staff.OnlineEmployees(biz): { [string]: number }
	local out = {}
	for userId, b in pairs(BizState.EmployeeOf) do
		if b == biz then
			local p = Players:GetPlayerByUserId(userId)
			local role = p and p:GetAttribute("BizRole")
			if type(role) == "string" and p:GetAttribute("AFK") ~= true then
				out[role] = (out[role] or 0) + 1
			end
		end
	end
	return out
end

function Staff.List(biz)
	local rec = BizState.RecOf(biz)
	local out = {}
	if not rec then
		return out
	end
	for uidStr, e in pairs(employeesOf(rec)) do
		local uid = tonumber(uidStr)
		local online = uid ~= nil and BizState.EmployeeOf[uid] == biz
		table.insert(out, {
			UserId = uid or 0,
			Name = type(e.Name) == "string" and e.Name or uidStr,
			Role = e.Role,
			Wage = e.Wage,
			Online = online,
		})
	end
	table.sort(out, function(a, b)
		return a.Name < b.Name
	end)
	return out
end

function Staff.Offer(owner: Player, biz, userId: number, role: string, wage: number)
	local rec = BizState.RecOf(biz)
	local t = BizState.TypeOf(biz)
	local def = Config.Roles[role]
	if not rec or not t or not def or not t.StaffRoleSet[role] then
		return fail("This business doesn't have that role")
	end
	if wage < def.Wage.Min or wage > def.Wage.Max then
		return fail(("Wage must be $%d - $%d per task"):format(def.Wage.Min, def.Wage.Max))
	end
	local target = Players:GetPlayerByUserId(userId)
	if not target or target == owner then
		return fail("That player isn't in this server")
	end
	if not BizState.Deps.DataService:IsLoaded(target) then
		return fail("That player is still loading")
	end
	local mod = Registry.Find("ModerationService")
	if mod and mod.IsBlocked then
		local ok, blocked = pcall(mod.IsBlocked, mod, owner, target)
		if ok and blocked then
			return fail("You can't hire this player")
		end
	end
	if employeesOf(rec)[tostring(userId)] then
		return fail("They already work here")
	end
	if countEmployees(rec) >= Work.MaxEmployees then
		return fail(("You can employ up to %d players"):format(Work.MaxEmployees))
	end
	local now = os.clock()
	if lastOfferBy[owner] and now - lastOfferBy[owner] < Work.OfferCooldown then
		return fail("Wait a moment before sending another offer")
	end
	lastOfferBy[owner] = now
	offerCounter += 1
	local offer: Offer = {
		Id = "o" .. offerCounter,
		BizKey = biz.Key,
		Owner = owner,
		BizId = biz.Id,
		Role = role,
		Wage = wage,
		Expires = now + Work.OfferExpireSeconds,
	}
	offers[target] = offer
	local name = BizState.DisplayName(rec, owner)
	BizState.Deps.NotifyService:OpenUI(target, "JobOfferBusiness", {
		OfferId = offer.Id,
		BizName = name,
		TypeId = biz.TypeId,
		OwnerName = owner.DisplayName,
		Role = role,
		Wage = wage,
		ExpiresIn = Work.OfferExpireSeconds,
	})
	phone(target, name, ("%s offered you a job as %s for $%d per task. Open the offer to accept."):format(owner.DisplayName, def.Name, wage))
	return { ok = true }
end

function Staff.Decline(player: Player, offerId: string)
	local offer = offers[player]
	if not offer or offer.Id ~= offerId then
		return fail("That offer is no longer available")
	end
	offers[player] = nil
	BizState.Notify(offer.Owner, ("%s declined your job offer."):format(player.DisplayName), "info")
	return { ok = true }
end

function Staff.Accept(player: Player, offerId: string)
	local offer = offers[player]
	if not offer or offer.Id ~= offerId then
		return fail("That offer is no longer available")
	end
	offers[player] = nil
	if os.clock() > offer.Expires then
		return fail("That offer expired")
	end
	local biz = BizState.Loaded[offer.BizKey]
	if not biz or biz.Owner ~= offer.Owner or offer.Owner.Parent ~= Players then
		return fail("That business is no longer open in this server")
	end
	local current = BizState.EmployeeOf[player.UserId]
	if current and current ~= biz then
		return fail("Quit your current business job first")
	end
	local rec = BizState.RecOf(biz)
	if not rec then
		return fail("That business is no longer available")
	end
	if not employeesOf(rec)[tostring(player.UserId)] and countEmployees(rec) >= Work.MaxEmployees then
		return fail("That business has no free positions")
	end
	local entry = { Role = offer.Role, Wage = offer.Wage, Name = player.DisplayName, Since = os.time() }
	BizState.Set(biz, "Employees." .. tostring(player.UserId), entry)
	BizState.EmployeeOf[player.UserId] = biz
	setAttributes(player, biz, entry)
	local def = Config.Roles[offer.Role]
	BizState.Notify(offer.Owner, ("%s accepted your job offer (%s)."):format(player.DisplayName, def and def.Name or offer.Role), "success")
	BizState.Notify(player, ("You now work at %s as %s! Go to a work station to start."):format(BizState.DisplayName(rec, biz.Owner), def and def.Name or offer.Role), "success", 6)
	return { ok = true }
end

local function removeEmployee(biz, userId: number)
	local rec = BizState.RecOf(biz)
	if rec and employeesOf(rec)[tostring(userId)] then
		BizState.Set(biz, "Employees." .. tostring(userId), nil)
	end
	if BizState.EmployeeOf[userId] == biz then
		BizState.EmployeeOf[userId] = nil
		local p = Players:GetPlayerByUserId(userId)
		if p then
			clearAttributes(p)
		end
	end
end

function Staff.Quit(player: Player)
	local biz = BizState.EmployeeOf[player.UserId]
	if not biz then
		clearAttributes(player)
		return fail("You don't have a business job")
	end
	local rec = BizState.RecOf(biz)
	removeEmployee(biz, player.UserId)
	BizState.Notify(biz.Owner, ("%s quit their job at %s."):format(player.DisplayName, BizState.DisplayName(rec, biz.Owner)), "warning")
	return { ok = true }
end

function Staff.FireEmployee(owner: Player, biz, userId: number)
	local rec = BizState.RecOf(biz)
	if not rec or not employeesOf(rec)[tostring(userId)] then
		return fail("That player doesn't work here")
	end
	local p = Players:GetPlayerByUserId(userId)
	removeEmployee(biz, userId)
	if p then
		BizState.Notify(p, ("You were let go from %s."):format(BizState.DisplayName(rec, owner)), "warning", 6)
	end
	return { ok = true }
end

-- Pay `wage` to `employee` from the business vault first, then the owner's wallet.
local function payWage(biz, employee: Player, wage: number): boolean
	local rec = BizState.RecOf(biz)
	local EconomyService = BizState.Deps.EconomyService
	if not rec then
		return false
	end
	local vault = math.floor(tonumber(rec.Vault) or 0)
	local fromVault = math.min(vault, wage)
	local fromCash = wage - fromVault
	local reason = "Wage:" .. biz.Id
	if fromCash > 0 and not EconomyService:TrySpend(biz.Owner, fromCash, reason) then
		return false
	end
	if fromVault > 0 then
		BizState.Set(biz, "Vault", vault - fromVault)
	end
	if not EconomyService:AddCash(employee, wage, reason) then
		-- refund the owner if the employee couldn't receive it (wallet cap)
		if fromVault > 0 then
			local now = BizState.RecOf(biz)
			BizState.Set(biz, "Vault", math.floor(tonumber(now and now.Vault) or 0) + fromVault)
		end
		if fromCash > 0 then
			EconomyService:AddCash(biz.Owner, fromCash, "Wage:Refund")
		end
		return false
	end
	return true
end

function Staff.WorkTask(player: Player)
	local biz = BizState.EmployeeOf[player.UserId]
	if not biz or BizState.Loaded[biz.Key] ~= biz then
		return fail("You don't have a business job")
	end
	local rec = BizState.RecOf(biz)
	local entry = rec and employeesOf(rec)[tostring(player.UserId)]
	if not rec or type(entry) ~= "table" then
		BizState.EmployeeOf[player.UserId] = nil
		clearAttributes(player)
		return fail("You no longer work here")
	end
	local def = Config.Roles[entry.Role]
	if not def then
		return fail("Unknown role")
	end
	if rec.Open ~= true then
		return fail("The business is closed right now")
	end
	if player:GetAttribute("InVehicle") then
		return fail("Get out of your vehicle first")
	end
	local now = os.clock()
	local last = lastTask[player]
	if last and now - last < def.TaskCooldown then
		return fail("Not so fast!", { Cooldown = def.TaskCooldown - (now - last) })
	end
	local w = taskWindow[player]
	if not w or now - w.Start >= 3600 then
		w = { Start = now, Count = 0 }
		taskWindow[player] = w
	end
	if w.Count >= Work.MaxTasksPerHour then
		return fail("You've worked a lot this hour — take a break!")
	end
	local station = Stations.NearAny(player, biz, def.Stations, Work.TaskDistance)
	if not station then
		local names = {}
		for _, fn in ipairs(def.Stations) do
			table.insert(names, Config.FunctionNames[fn] or fn)
			if #names >= 3 then
				break
			end
		end
		return fail("Go to a " .. table.concat(names, " / "))
	end
	local wage = math.clamp(math.floor(tonumber(entry.Wage) or def.Wage.Default), def.Wage.Min, def.Wage.Max)
	lastTask[player] = now
	if not payWage(biz, player, wage) then
		BizState.Warn(biz, "wage", ("⚠️ You can't afford %s's wage — they worked for free!"):format(player.DisplayName), "error")
		return fail("Your employer can't afford your wage right now", { Cooldown = def.TaskCooldown })
	end
	w.Count += 1
	Ledger.Credit(biz, def.TaskRevenue, 1, "Work")
	local js = Registry.Find("TutorialService")
	if js and js.Advance then
		task.spawn(function()
			pcall(js.Advance, js, player, "FirstPay")
		end)
	end
	return { ok = true, Paid = wage, Cooldown = def.TaskCooldown, TaskName = def.TaskName }
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function Staff.OnBizLoaded(biz)
	local rec = BizState.RecOf(biz)
	if not rec then
		return
	end
	for uidStr, entry in pairs(employeesOf(rec)) do
		local uid = tonumber(uidStr)
		local p = uid and Players:GetPlayerByUserId(uid)
		if p and type(entry) == "table" and not BizState.EmployeeOf[uid] then
			BizState.EmployeeOf[uid] = biz
			setAttributes(p, biz, entry)
			BizState.Notify(p, ("Your employer %s is open for business in this server."):format(BizState.DisplayName(rec, biz.Owner)), "info")
		end
	end
end

function Staff.OnBizUnloaded(biz)
	for uid, b in pairs(BizState.EmployeeOf) do
		if b == biz then
			BizState.EmployeeOf[uid] = nil
			local p = Players:GetPlayerByUserId(uid)
			if p then
				clearAttributes(p)
			end
		end
	end
	for target, offer in pairs(offers) do
		if offer.BizKey == biz.Key then
			offers[target] = nil
		end
	end
end

-- Refresh attributes (e.g. after a rename or lot change).
function Staff.RefreshAttributes(biz)
	local rec = BizState.RecOf(biz)
	if not rec then
		return
	end
	for uid, b in pairs(BizState.EmployeeOf) do
		if b == biz then
			local p = Players:GetPlayerByUserId(uid)
			local entry = employeesOf(rec)[tostring(uid)]
			if p and entry then
				setAttributes(p, biz, entry)
			end
		end
	end
end

function Staff.OnPlayerAdded(player: Player)
	clearAttributes(player)
	local key = tostring(player.UserId)
	for _, biz in pairs(BizState.Loaded) do
		if biz.Owner ~= player then
			local rec = BizState.RecOf(biz)
			local entry = rec and employeesOf(rec)[key]
			if type(entry) == "table" then
				BizState.EmployeeOf[player.UserId] = biz
				setAttributes(player, biz, entry)
				BizState.Notify(player, ("Your employer %s is open in this server."):format(BizState.DisplayName(rec, biz.Owner)), "info")
				return
			end
		end
	end
end

function Staff.OnPlayerRemoving(player: Player)
	BizState.EmployeeOf[player.UserId] = nil
	offers[player] = nil
	lastOfferBy[player] = nil
	lastTask[player] = nil
	taskWindow[player] = nil
	for target, offer in pairs(offers) do
		if offer.Owner == player then
			offers[target] = nil
		end
	end
end

-- Expose the guard-validated user id parser for the service.
Staff.UserId = function(v: any): number?
	return Guard.Int(v, 1, 2 ^ 53)
end

return Staff
