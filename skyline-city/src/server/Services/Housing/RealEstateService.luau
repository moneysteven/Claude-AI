-- RealEstateService: the player-to-player housing market.
--
--   * Owners list a house for Sale or Rent. The price must be within [MinPriceFactor, MaxPriceFactor] x the
--     reference price (Sale: house Value, Rent: Value x RentPerValuePerWeek per week).
--   * Listings live in this server only (both players must be here). The Listing field is saved on the
--     house, so it re-appears automatically when the owner joins any server.
--   * BuyListing is atomic: buyer pays -> seller is paid (minus agency fee) -> the house record (incl. build)
--     moves to the buyer under a new id -> both profiles are saved. Any failure rolls every step back.
--   * RentListing: the tenant pays the first week now and then every in-game week (HousingService.WeekTick);
--     the tenant gets a key; the landlord keeps ownership. Ends when either player leaves or stops paying.
--
-- Remote "RealEstate": GetListings, ListHouse{HouseId, Mode, Price}, Unlist{HouseId}, BuyListing{ListingId, Price},
--   RentListing{ListingId, Price}, EndTenancy{ListingId}
-- Extra API: :UnlistHouse(player, houseId, reason?), :GetTenancies(player) -> list

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local HousingConfig = require(Shared.Config.Housing)
local EconomyConfig = require(Shared.Config.Economy)
local Serializer = require(Shared.Build.Serializer)

local Server = ServerScriptService.Server
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local RealEstateService = {
	Name = "RealEstateService",
	Priority = 50,
}

local RE = HousingConfig.RealEstate
local TIERS = HousingConfig.Tiers
local MODES = { Sale = true, Rent = true }

local DataService, EconomyService, NotifyService, HousingService

type Listing = {
	Id: string,
	Seller: Player,
	HouseId: string,
	Mode: string,
	Price: number,
	CreatedAt: number,
	Tenant: Player?,
}

local listings: { [string]: Listing } = {}
local tenancies: { [Player]: string } = {}
local nextId = 0

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function phone(player: Player, text: string)
	local ps = Registry.Find("PhoneService")
	if ps and ps.SendSystemMessage then
		task.spawn(function()
			pcall(ps.SendSystemMessage, ps, player, HousingConfig.Rent.SenderName, text)
		end)
	end
end

local function blocked(a: Player, b: Player): boolean
	local mod = Registry.Find("ModerationService")
	if mod and mod.IsBlocked then
		local ok, res = pcall(mod.IsBlocked, mod, a, b)
		return ok and res == true
	end
	return false
end

local function spend(player: Player, amount: number, reason: string): boolean
	if HousingConfig.Purchase.AllowBank then
		return EconomyService:Charge(player, amount, reason)
	end
	return EconomyService:TrySpend(player, amount, reason)
end

local function recordOf(player: Player, houseId: string)
	return HousingService:GetHouseRecord(player, houseId)
end

local function referencePrice(rec, mode: string): number
	local value = math.max(0, tonumber(rec.Value) or 0)
	if mode == "Rent" then
		return math.max(RE.MinReferenceRent, math.floor(value * RE.RentPerValuePerWeek))
	end
	return math.max(1, value)
end

local function priceRange(rec, mode: string): (number, number)
	local ref = referencePrice(rec, mode)
	local lo = math.max(1, math.floor(ref * RE.MinPriceFactor))
	local hi = math.min(EconomyConfig.MaxSingleTransaction, math.floor(ref * RE.MaxPriceFactor))
	return lo, math.max(lo, hi)
end

local function listingFor(seller: Player, houseId: string): Listing?
	for _, l in pairs(listings) do
		if l.Seller == seller and l.HouseId == houseId then
			return l
		end
	end
	return nil
end

local function countFor(seller: Player): number
	local n = 0
	for _, l in pairs(listings) do
		if l.Seller == seller then
			n += 1
		end
	end
	return n
end

local function endTenancy(l: Listing, reason: string?)
	local tenant = l.Tenant
	if not tenant then
		return
	end
	l.Tenant = nil
	if tenancies[tenant] == l.Id then
		tenancies[tenant] = nil
	end
	HousingService:RemoveGuestKey(l.Seller, l.HouseId, tenant.UserId)
	local text = "Your tenancy has ended" .. (reason and (": " .. reason) or ".")
	if tenant.Parent == Players then
		NotifyService:Send(tenant, "🏠 " .. text, "info")
		phone(tenant, text)
	end
	if l.Seller.Parent == Players then
		NotifyService:Send(l.Seller, ("🏠 %s's tenancy ended."):format(tenant.DisplayName), "info")
	end
end

-- Is the listed house the one currently loaded as the landlord's home?
local function isLandlordActive(l: Listing): boolean
	local home = HousingService:GetHome(l.Seller)
	return home ~= nil and home.HouseId == l.HouseId
end

local function removeListing(id: string, reason: string?)
	local l = listings[id]
	if not l then
		return
	end
	endTenancy(l, reason)
	listings[id] = nil
end

local function createListing(seller: Player, houseId: string, mode: string, price: number): Listing
	nextId += 1
	local l: Listing = {
		Id = "l_" .. nextId,
		Seller = seller,
		HouseId = houseId,
		Mode = mode,
		Price = price,
		CreatedAt = os.time(),
		Tenant = nil,
	}
	listings[l.Id] = l
	return l
end

local function publicInfo(l: Listing, viewer: Player)
	local rec = recordOf(l.Seller, l.HouseId) or {}
	local tierId = rec.TierId or "Studio"
	local tier = TIERS[tierId]
	local name = (type(rec.Name) == "string" and rec.Name ~= "") and rec.Name
		or HousingConfig.Names.Default:format(l.Seller.DisplayName, tier and tier.Name or tierId)
	return {
		Id = l.Id,
		SellerUserId = l.Seller.UserId,
		SellerName = l.Seller.DisplayName,
		HouseId = l.HouseId,
		HouseName = name,
		TierId = tierId,
		TierName = tier and tier.Name or tierId,
		Icon = tier and tier.Icon or "🏠",
		Mode = l.Mode,
		Price = l.Price,
		Value = tonumber(rec.Value) or 0,
		Floors = tonumber(rec.Floors) or 1,
		Items = Serializer.Count(rec.Build),
		Rented = l.Tenant ~= nil,
		Available = l.Mode == "Sale" or isLandlordActive(l),
		Mine = l.Seller == viewer,
		MyTenancy = l.Tenant == viewer,
		CreatedAt = l.CreatedAt,
	}
end

local function loadListings(player: Player)
	local owned = DataService:Get(player, "Housing.Owned")
	if type(owned) ~= "table" then
		return
	end
	for houseId, rec in pairs(owned) do
		if type(rec) == "table" and type(rec.Listing) == "table" then
			local mode = rec.Listing.Mode
			local price = tonumber(rec.Listing.Price)
			local valid = MODES[mode] and price and countFor(player) < RE.MaxListingsPerPlayer
			if valid then
				local lo, hi = priceRange(rec, mode)
				valid = price >= lo and price <= hi
			end
			if valid then
				createListing(player, houseId, mode, math.floor(price :: number))
			else
				DataService:Set(player, "Housing.Owned." .. houseId .. ".Listing", false)
			end
		end
	end
end

---------------------------------------------------------------------------
-- Public API
---------------------------------------------------------------------------
function RealEstateService:UnlistHouse(player: Player, houseId: string, reason: string?)
	local l = listingFor(player, houseId)
	if l then
		removeListing(l.Id, reason)
	end
	if recordOf(player, houseId) then
		DataService:Set(player, "Housing.Owned." .. houseId .. ".Listing", false)
	end
end

function RealEstateService:GetTenancies(player: Player)
	local out = {}
	for _, l in pairs(listings) do
		if l.Tenant and (l.Tenant == player or l.Seller == player) then
			local info = publicInfo(l, player)
			info.Role = l.Tenant == player and "Tenant" or "Landlord"
			info.TenantName = l.Tenant.DisplayName
			info.TenantUserId = l.Tenant.UserId
			table.insert(out, info)
		end
	end
	return out
end

---------------------------------------------------------------------------
-- Remote handlers
---------------------------------------------------------------------------
local function getListings(player: Player)
	local list = {}
	for _, l in pairs(listings) do
		if l.Seller.Parent == Players then
			table.insert(list, publicInfo(l, player))
		end
	end
	table.sort(list, function(a, b)
		if a.Mine ~= b.Mine then
			return a.Mine
		end
		return a.Price < b.Price
	end)
	return { ok = true, List = list, AgencyFee = RE.AgencyFee, RentAgencyFee = RE.RentAgencyFee }
end

local function listHouse(player: Player, payload)
	local houseId = Guard.Id(payload.HouseId, 16)
	local rec = houseId and recordOf(player, houseId)
	if not houseId or houseId == "" or not rec then
		return { ok = false, err = "You can only list a home you own" }
	end
	local mode = Guard.OneOf(payload.Mode, MODES)
	if not mode then
		return { ok = false, err = "Choose Sale or Rent" }
	end
	local price = Guard.Money(payload.Price, EconomyConfig.MaxSingleTransaction)
	if not price then
		return { ok = false, err = "Enter a valid price" }
	end
	local lo, hi = priceRange(rec, mode)
	if price < lo or price > hi then
		return { ok = false, err = ("Price must be between %s and %s"):format(Format.Money(lo), Format.Money(hi)) }
	end
	local existing = listingFor(player, houseId)
	if existing then
		if existing.Tenant then
			return { ok = false, err = "End the current tenancy before changing the listing" }
		end
		removeListing(existing.Id)
	elseif countFor(player) >= RE.MaxListingsPerPlayer then
		return { ok = false, err = ("You can list up to %d homes"):format(RE.MaxListingsPerPlayer) }
	end
	DataService:Set(player, "Housing.Owned." .. houseId .. ".Listing", { Mode = mode, Price = price })
	local l = createListing(player, houseId, mode, price)
	NotifyService:Send(player, ("🏷️ Listed for %s%s"):format(Format.Money(price), mode == "Rent" and "/week" or ""), "success")
	if mode == "Rent" and not isLandlordActive(l) then
		NotifyService:Send(player, "Tenants can rent this home once you move into it (Homes → Move in).", "info", 6)
	end
	return { ok = true, ListingId = l.Id }
end

local function unlist(player: Player, payload)
	local houseId = Guard.Id(payload.HouseId, 16)
	if not houseId or not listingFor(player, houseId) then
		return { ok = false, err = "That home isn't listed" }
	end
	RealEstateService:UnlistHouse(player, houseId, "The owner removed the listing")
	return { ok = true }
end

local function validateDeal(player: Player, payload, mode: string): (Listing?, string?)
	local id = Guard.Id(payload.ListingId, 16)
	local l = id and listings[id]
	if not l or l.Mode ~= mode then
		return nil, "That listing is no longer available"
	end
	local price = Guard.Money(payload.Price, EconomyConfig.MaxSingleTransaction)
	if price ~= l.Price then
		return nil, "The price changed — refresh and try again"
	end
	local seller = l.Seller
	if seller == player then
		return nil, "That's your own home"
	end
	if seller.Parent ~= Players or not DataService:IsLoaded(seller) then
		removeListing(l.Id)
		return nil, "The owner has left"
	end
	if not DataService:IsLoaded(player) then
		return nil, "Your data is still loading"
	end
	if blocked(player, seller) then
		return nil, "You can't trade with this player"
	end
	if HousingService:HasRentDebt(player) then
		return nil, "Pay your overdue rent first"
	end
	if not recordOf(seller, l.HouseId) then
		removeListing(l.Id)
		return nil, "That home is no longer available"
	end
	return l, nil
end

local function buyListing(player: Player, payload)
	local l, err = validateDeal(player, payload, "Sale")
	if not l then
		return { ok = false, err = err }
	end
	local seller = l.Seller
	local used, limit = HousingService:GetSlotInfo(player)
	if used >= limit then
		return { ok = false, err = ("You own the maximum of %d home(s)"):format(limit) }
	end
	local price = l.Price
	local fee = math.floor(price * RE.AgencyFee)
	local sellerGets = price - fee

	-- 1) buyer pays
	if not spend(player, price, "Buy:Listing:" .. l.Id) then
		return { ok = false, err = ("You need %s"):format(Format.Money(price)) }
	end
	-- 2) seller is paid
	if sellerGets > 0 and not EconomyService:AddCash(seller, sellerGets, "Sell:Listing:" .. l.Id) then
		EconomyService:AddCash(player, price, "Refund:Listing")
		return { ok = false, err = "The seller can't receive the money — you were refunded" }
	end
	local function rollbackMoney()
		if sellerGets > 0 then
			EconomyService:Charge(seller, sellerGets, "Refund:Listing")
		end
		EconomyService:AddCash(player, price, "Refund:Listing")
	end
	-- 3) move the house
	local houseId = l.HouseId
	removeListing(l.Id, "The home was sold")
	local record = HousingService:RemoveHouse(seller, houseId, "SoldToPlayer")
	if not record then
		rollbackMoney()
		return { ok = false, err = "The sale failed — you were refunded" }
	end
	local newId = HousingService:GrantHouse(player, record.TierId, {
		Value = record.Value,
		Name = record.Name,
		Build = record.Build,
		Floors = record.Floors,
	})
	if not newId then
		HousingService:RestoreHouse(seller, houseId, record)
		rollbackMoney()
		return { ok = false, err = "The sale failed — you were refunded" }
	end
	-- 4) save both
	task.spawn(function()
		DataService:SaveNow(seller)
	end)
	task.spawn(function()
		DataService:SaveNow(player)
	end)

	local tier = TIERS[record.TierId]
	local tName = tier and tier.Name or record.TierId
	NotifyService:Send(player, ("🏡 You bought %s's %s for %s! Set it active in Homes."):format(seller.DisplayName, tName, Format.Money(price)), "success")
	NotifyService:Send(seller, ("💰 %s bought your %s — you received %s (after %s agency fee)."):format(
		player.DisplayName,
		tName,
		Format.Money(sellerGets),
		Format.Money(fee)
	), "money")
	phone(seller, ("Your %s sold to %s for %s. Agency fee: %s."):format(tName, player.DisplayName, Format.Money(price), Format.Money(fee)))
	phone(player, ("Welcome to your new %s! Open Homes to move in."):format(tName))
	return { ok = true, HouseId = newId }
end

local function rentListing(player: Player, payload)
	local l, err = validateDeal(player, payload, "Rent")
	if not l then
		return { ok = false, err = err }
	end
	if l.Tenant then
		return { ok = false, err = "Someone is already renting this home" }
	end
	if tenancies[player] then
		return { ok = false, err = "You're already renting a player's home" }
	end
	local landlord = l.Seller
	-- the tenant's key opens the landlord's LOADED home, so only the home the landlord lives in can be rented
	if not isLandlordActive(l) then
		return { ok = false, err = ("%s needs to move into this home before it can be rented"):format(landlord.DisplayName) }
	end
	local price = l.Price
	local fee = math.floor(price * RE.RentAgencyFee)
	if not EconomyService:Charge(player, price, "Rent:Listing:" .. l.Id) then
		return { ok = false, err = ("You need %s for the first week"):format(Format.Money(price)) }
	end
	if price - fee > 0 and not EconomyService:AddCash(landlord, price - fee, "RentIncome:" .. l.Id) then
		EconomyService:AddCash(player, price, "Refund:Rent")
		return { ok = false, err = "The landlord can't receive rent — you were refunded" }
	end
	l.Tenant = player
	tenancies[player] = l.Id
	HousingService:AddGuestKey(landlord, l.HouseId, player.UserId)
	NotifyService:Send(player, ("🔑 You're renting %s's home for %s/week. Visit it from Homes."):format(landlord.DisplayName, Format.Money(price)), "success")
	NotifyService:Send(landlord, ("💰 %s is renting your home (%s/week)."):format(player.DisplayName, Format.Money(price)), "money")
	phone(landlord, ("%s started renting your home for %s/week."):format(player.DisplayName, Format.Money(price)))
	return { ok = true }
end

local function endTenancyAction(player: Player, payload)
	local id = Guard.Id(payload.ListingId, 16)
	local l = id and listings[id]
	if not l or not l.Tenant or (l.Tenant ~= player and l.Seller ~= player) then
		return { ok = false, err = "No tenancy to end" }
	end
	endTenancy(l, l.Tenant == player and "you moved out" or "the landlord ended it")
	return { ok = true }
end

local function weeklyRent()
	for _, l in pairs(listings) do
		local tenant = l.Tenant
		if tenant then
			if tenant.Parent ~= Players or l.Seller.Parent ~= Players then
				endTenancy(l, "a player left")
			else
				local fee = math.floor(l.Price * RE.RentAgencyFee)
				if EconomyService:Charge(tenant, l.Price, "Rent:Listing:" .. l.Id) then
					if l.Price - fee > 0 then
						EconomyService:AddCash(l.Seller, l.Price - fee, "RentIncome:" .. l.Id)
					end
					phone(tenant, ("Paid %s rent to %s."):format(Format.Money(l.Price), l.Seller.DisplayName))
				else
					endTenancy(l, "rent couldn't be paid")
				end
			end
		end
	end
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function RealEstateService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	HousingService = Registry.Get("HousingService")

	Net.HandleActions("RealEstate", {
		GetListings = getListings,
		ListHouse = listHouse,
		Unlist = unlist,
		BuyListing = buyListing,
		RentListing = rentListing,
		EndTenancy = endTenancyAction,
	}, {
		rate = 3,
		burst = 8,
		perAction = {
			BuyListing = { rate = 0.5, burst = 2 },
			RentListing = { rate = 0.5, burst = 2 },
			ListHouse = { rate = 0.5, burst = 3 },
		},
	})
end

function RealEstateService:Start()
	DataService:OnLoaded(function(player)
		local ok, err = pcall(loadListings, player)
		if not ok then
			warn("[RealEstateService] loadListings failed:", err)
		end
	end)

	HousingService.HouseRemoved:Connect(function(player: Player, houseId: string)
		local l = listingFor(player, houseId)
		if l then
			removeListing(l.Id, "the home is no longer available")
		end
	end)

	-- a landlord who moves into another home (or loses this one) ends the tenancy: the key would open nothing
	HousingService.HomeChanged:Connect(function(player: Player, home)
		for _, l in pairs(listings) do
			if l.Seller == player and l.Tenant and (not home or home.HouseId ~= l.HouseId) then
				endTenancy(l, "the landlord moved out")
			end
		end
	end)

	HousingService.WeekTick:Connect(function()
		local ok, err = pcall(weeklyRent)
		if not ok then
			warn("[RealEstateService] weekly rent failed:", err)
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		-- tenancies end when either side leaves; listings vanish from this server (data keeps them)
		local tid = tenancies[player]
		if tid and listings[tid] then
			endTenancy(listings[tid], "the tenant left")
		end
		tenancies[player] = nil
		for id, l in pairs(listings) do
			if l.Seller == player then
				endTenancy(l, "the landlord left")
				listings[id] = nil
			end
		end
	end)
end

return RealEstateService
