-- MonetizationService: gamepasses, developer products (ProcessReceipt), the Robux Shop remote and elevators.
--
-- API (server, ARCHITECTURE §5):
--   MonetizationService:HasPass(player, key) -> boolean      keys: VIP, ExclusiveApartments, PremiumCarPark, ExtraHouse
--   MonetizationService.PassGranted : Signal(player, key)    fires when a pass becomes active this session
--                                                             (join check, purchase, Studio simulation)
--   MonetizationService:GetOwnedPasses(player) -> { [key]: boolean }
--   MonetizationService:RegisterProductHandler(productKey, handler)
--       handler = { Grant = fn(player, product, purchaseId) -> (ok: boolean, rollback: (() -> ())?, message: string?),
--                   After = fn(player, product)? }   -- After runs only once the purchase is safely saved
--   Player attributes: VIP, Pass_<key>
--
-- Economy modifiers registered here: VIP 2x pay for reasons starting "Job:", VIP 20% off price category "Furniture".
--
-- Remote domain "Shop":
--   GetCatalog {}                      -> { Passes = {[key]=owned}, Configured = {...}, Vip = status, CanSimulate }
--   PromptPass { Key }                 server calls MarketplaceService:PromptGamePassPurchase
--   PromptProduct { Key }              server calls MarketplaceService:PromptProductPurchase
--   ClaimVipDaily {}                   (VIPService)
--   SimulatePurchase { Kind = "Pass"|"Product", Key }   Studio + Config.TestMode only
--
-- ProcessReceipt guarantees (never lose a purchase, never grant twice):
--   1. player not in this server            -> NotProcessedYet (Roblox retries when they join a server)
--   2. data not loaded                      -> NotProcessedYet
--   3. PurchaseId already in Data.Purchases -> PurchaseGranted
--   4. PurchaseId in the global ledger      -> PurchaseGranted
--   5. grant (idempotent handler), append PurchaseId, DataService:SaveNow
--      save OK -> record in global ledger -> PurchaseGranted; save failed -> roll back -> NotProcessedYet

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Config = require(Shared.Config.Monetization)
local ClothingConfig = require(Shared.Config.Clothing)
local Economy = require(Shared.Config.Economy)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local Receipts = require(script.Parent.Receipts)
local Elevators = require(script.Parent.Elevators)
local Cosmetics = require(script.Parent.Cosmetics)
local MonUtil = require(script.Parent.MonUtil)

local MonetizationService = {
	Name = "MonetizationService",
	Priority = 15, -- after Data/Economy/Notify, before consumers that read HasPass during Init/Start
}

MonetizationService.PassGranted = Signal.new()

local IS_STUDIO = RunService:IsStudio()
local OWNERSHIP_RETRIES = 3

local DataService
local NotifyService

local owned: { [Player]: { [string]: boolean } } = {}
local receiptBusy: { [Player]: boolean } = {}
local handlers: { [string]: any } = {}

---------------------------------------------------------------------------
-- Pass ownership
---------------------------------------------------------------------------
local function cacheSaysOwned(data: any, key: string): boolean
	local gp = data and data.Gamepasses
	if type(gp) ~= "table" then
		return false
	end
	local v = gp[key]
	if v == true then
		return true
	end
	-- "Studio" = granted by SimulatePurchase; only honoured inside Studio so tests never leak into live servers
	return v == "Studio" and IS_STUDIO
end

local function applyAttributes(player: Player)
	local set = owned[player] or {}
	for _, pass in ipairs(Config.Passes) do
		player:SetAttribute("Pass_" .. pass.Key, set[pass.Key] == true)
	end
	player:SetAttribute("VIP", set.VIP == true)
end

-- source: "Join" | "Purchase" | "Simulated"
local function grantPass(player: Player, key: string, source: string)
	if player.Parent ~= Players or not Config.PassByKey[key] then
		return
	end
	local set = owned[player]
	if not set then
		set = {}
		owned[player] = set
	end
	local already = set[key] == true
	set[key] = true

	if DataService:IsLoaded(player) then
		local current = DataService:Get(player, "Gamepasses." .. key)
		if source == "Simulated" then
			if current ~= true then
				DataService:Set(player, "Gamepasses." .. key, "Studio")
			end
		elseif current ~= true then
			DataService:Set(player, "Gamepasses." .. key, true)
		end
	end

	applyAttributes(player)
	if already then
		return
	end
	print(("[Monetization] pass %s active for %s (%d) via %s"):format(key, player.Name, player.UserId, source))
	MonetizationService.PassGranted:Fire(player, key)

	if source ~= "Join" then
		local pass = Config.PassByKey[key]
		NotifyService:Send(player, ("%s %s unlocked! Thank you for supporting SKYLINE CITY."):format(pass.Icon, pass.Name), "success", 6)
		NotifyService:OpenUI(player, "ShopCelebrate", {
			Icon = pass.Icon,
			Title = pass.Name,
			Text = "Unlocked! Your perks are active right now.",
			Perks = pass.Perks,
			Kind = "Pass",
			Key = key,
		})
	end
end

local function queryOwnership(userId: number, passId: number): boolean?
	for attempt = 1, OWNERSHIP_RETRIES do
		local ok, result = pcall(function()
			return MarketplaceService:UserOwnsGamePassAsync(userId, passId)
		end)
		if ok then
			return result == true
		end
		warn(("[Monetization] UserOwnsGamePassAsync(%d, %d) failed (%d/%d): %s"):format(userId, passId, attempt, OWNERSHIP_RETRIES, tostring(result)))
		if attempt < OWNERSHIP_RETRIES then
			task.wait(attempt * 2)
		end
	end
	return nil -- unknown (Roblox API down)
end

local function checkPasses(player: Player)
	owned[player] = owned[player] or {}
	applyAttributes(player)

	-- query Roblox in parallel with the data load
	local results: { [string]: boolean? } = {}
	local pending = 0
	for _, pass in ipairs(Config.Passes) do
		if pass.Id ~= 0 then
			pending += 1
			task.spawn(function()
				results[pass.Key] = queryOwnership(player.UserId, pass.Id)
				pending -= 1
			end)
		end
	end

	local data = DataService:WaitForData(player, 60)
	local waited = 0
	while pending > 0 and waited < 30 and player.Parent == Players do
		task.wait(0.25)
		waited += 0.25
	end
	if player.Parent ~= Players then
		return
	end

	local unknown = {}
	for _, pass in ipairs(Config.Passes) do
		local key = pass.Key
		if cacheSaysOwned(data, key) or results[key] == true then
			grantPass(player, key, "Join")
		elseif pass.Id ~= 0 and results[key] == nil then
			table.insert(unknown, pass)
		end
	end

	-- the API was down for some passes: try again a few times in the background
	if #unknown > 0 then
		task.spawn(function()
			for round = 1, 3 do
				task.wait(60 * round)
				if player.Parent ~= Players then
					return
				end
				for i = #unknown, 1, -1 do
					local pass = unknown[i]
					local r = queryOwnership(player.UserId, pass.Id)
					if r ~= nil then
						table.remove(unknown, i)
						if r then
							grantPass(player, pass.Key, "Join")
						end
					end
				end
				if #unknown == 0 then
					return
				end
			end
		end)
	end
end

function MonetizationService:HasPass(player: Player, key: string): boolean
	if typeof(player) ~= "Instance" or not player:IsA("Player") then
		return false
	end
	local set = owned[player]
	if set and set[key] then
		return true
	end
	-- data cache covers the moment between data load and the async ownership check
	local data = DataService and DataService:GetData(player)
	return data ~= nil and cacheSaysOwned(data, key)
end

function MonetizationService:GetOwnedPasses(player: Player): { [string]: boolean }
	local out = {}
	for _, pass in ipairs(Config.Passes) do
		out[pass.Key] = self:HasPass(player, pass.Key)
	end
	return out
end

---------------------------------------------------------------------------
-- Developer products
---------------------------------------------------------------------------
function MonetizationService:RegisterProductHandler(productKey: string, handler)
	assert(type(handler) == "table" and type(handler.Grant) == "function", "handler.Grant required")
	handlers[productKey] = handler
end

local function clothingOwned(player: Player, itemId: string): boolean
	local clothing = Registry.Find("ClothingService")
	if clothing and type(clothing.Owns) == "function" then
		local ok, res = pcall(clothing.Owns, clothing, player, itemId)
		if ok then
			return res == true
		end
	end
	return DataService:Get(player, "Clothing.Owned." .. itemId) == true
end

local function makeClothingHandler()
	return {
		Grant = function(player: Player, product)
			local itemId = product.ItemId
			local item = ClothingConfig.ById[itemId]
			if not item then
				warn("[Monetization] product " .. product.Key .. " points at unknown clothing item " .. tostring(itemId))
				return false, nil, nil
			end
			if clothingOwned(player, itemId) then
				-- already owned (e.g. bought in another server before this one updated): nothing to grant twice
				return true, nil, "You already own " .. item.Name .. "."
			end
			local clothing = Registry.Find("ClothingService")
			local granted = false
			if clothing and type(clothing.GrantItem) == "function" then
				local ok, res = pcall(clothing.GrantItem, clothing, player, itemId)
				granted = ok and res == true
			else
				granted = DataService:Set(player, "Clothing.Owned." .. itemId, true) == true
			end
			if not granted then
				return false, nil, nil
			end
			local rollback = function()
				local c = Registry.Find("ClothingService")
				if c and type(c.RevokeItem) == "function" then
					pcall(c.RevokeItem, c, player, itemId)
				else
					DataService:Set(player, "Clothing.Owned." .. itemId, nil)
				end
			end
			return true, rollback, nil
		end,
		After = function(player: Player, product)
			local item = ClothingConfig.ById[product.ItemId]
			if not item then
				return
			end
			-- auto-equip the new exclusive so the player sees it straight away
			local clothing = Registry.Find("ClothingService")
			if clothing and type(clothing.Equip) == "function" then
				pcall(clothing.Equip, clothing, player, item.Id)
			end
			NotifyService:OpenUI(player, "ShopCelebrate", {
				Icon = item.Icon,
				Title = item.Name,
				Text = "Added to your wardrobe and equipped!",
				Kind = "Clothing",
				Key = item.Id,
			})
		end,
	}
end

local function makeCosmeticHandler()
	return {
		Grant = function(_player: Player, product)
			-- consumables have no saved state; the effect itself runs in After (only once the receipt is safe)
			return product.Effect ~= nil, nil, nil
		end,
		After = function(player: Player, product)
			Cosmetics.Run(product.Effect, player)
			NotifyService:OpenUI(player, "ShopCelebrate", {
				Icon = product.Icon,
				Title = product.Name,
				Text = "Enjoy the show! 🎉",
				Kind = "Cosmetic",
				Key = product.Key,
			})
		end,
	}
end

local function appendPurchase(player: Player, purchaseId: string)
	DataService:Update(player, "Purchases", function(old)
		local list = {}
		if type(old) == "table" then
			for _, id in ipairs(old) do
				table.insert(list, id)
			end
		end
		table.insert(list, purchaseId)
		local cap = Economy.MaxStoredPurchaseIds
		while #list > cap do
			table.remove(list, 1) -- keep the most recent
		end
		return list
	end)
end

local function removePurchase(player: Player, purchaseId: string)
	DataService:Update(player, "Purchases", function(old)
		local list = {}
		if type(old) == "table" then
			for _, id in ipairs(old) do
				if id ~= purchaseId then
					table.insert(list, id)
				end
			end
		end
		return list
	end)
end

local Decision = Enum.ProductPurchaseDecision

-- The core purchase pipeline (shared by ProcessReceipt and Studio simulation).
-- simulated = true skips the global ledger so Studio tests never write to the live receipt store.
local function processPurchase(player: Player, product, purchaseId: string, productId: number, simulated: boolean)
	local data = DataService:WaitForData(player, Config.Receipts.DataWaitSeconds)
	if not data or player.Parent ~= Players then
		return Decision.NotProcessedYet
	end

	-- layer 1: the player's own save
	if type(data.Purchases) == "table" and table.find(data.Purchases, purchaseId) then
		return Decision.PurchaseGranted
	end

	-- layer 2: the global ledger
	if not simulated then
		local ok, record = Receipts.Lookup(purchaseId)
		if not ok then
			return Decision.NotProcessedYet -- can't be sure; Roblox will retry
		end
		if type(record) == "table" and record.State == "Granted" then
			appendPurchase(player, purchaseId)
			print(("[Monetization] receipt %s was already granted (global ledger); acknowledging"):format(purchaseId))
			return Decision.PurchaseGranted
		end
	end

	local handler = handlers[product.Key]
	if not handler then
		warn("[Monetization] no handler for product " .. product.Key)
		return Decision.NotProcessedYet
	end

	local okGrant, granted, rollback, message = pcall(handler.Grant, player, product, purchaseId)
	if not okGrant then
		warn(("[Monetization] grant error for %s / %s: %s"):format(player.Name, product.Key, tostring(granted)))
		return Decision.NotProcessedYet
	end
	if not granted then
		warn(("[Monetization] grant refused for %s / %s"):format(player.Name, product.Key))
		return Decision.NotProcessedYet
	end

	appendPurchase(player, purchaseId)
	local saved = DataService:SaveNow(player)
	if not saved then
		warn(("[Monetization] save failed after granting %s to %s — rolling back, Roblox will retry"):format(product.Key, player.Name))
		if rollback then
			local okRb, errRb = pcall(rollback)
			if not okRb then
				warn("[Monetization] rollback error:", errRb)
			end
		end
		removePurchase(player, purchaseId)
		return Decision.NotProcessedYet
	end

	if not simulated then
		Receipts.MarkGranted(purchaseId, { UserId = player.UserId, ProductId = productId, ProductKey = product.Key })
	end

	print(
		("[Monetization] GRANTED product %s (id %d) to %s (%d), purchase %s%s"):format(
			product.Key,
			productId,
			player.Name,
			player.UserId,
			purchaseId,
			simulated and " [STUDIO SIMULATION]" or ""
		)
	)

	if message then
		NotifyService:Send(player, message, "info", 6)
	elseif handler.After then
		task.spawn(function()
			local ok, err = pcall(handler.After, player, product)
			if not ok then
				warn("[Monetization] After handler error:", err)
			end
		end)
	end
	return Decision.PurchaseGranted
end

-- One receipt at a time per player so SaveNow / rollback never interleave.
local function withPlayerLock(player: Player, fn: () -> any): any
	local waited = 0
	while receiptBusy[player] do
		if waited > 25 or player.Parent ~= Players then
			return Decision.NotProcessedYet
		end
		task.wait(0.2)
		waited += 0.2
	end
	receiptBusy[player] = true
	local ok, result = pcall(fn)
	receiptBusy[player] = nil
	if not ok then
		warn("[Monetization] purchase pipeline error:", result)
		return Decision.NotProcessedYet
	end
	return result
end

local function processReceipt(receipt)
	local player = Players:GetPlayerByUserId(receipt.PlayerId)
	if not player then
		return Decision.NotProcessedYet
	end
	local product = Config.ProductById[receipt.ProductId]
	if not product then
		warn(("[Monetization] receipt for unknown product id %s (add it to Config/Monetization.Products)"):format(tostring(receipt.ProductId)))
		return Decision.NotProcessedYet
	end
	local purchaseId = tostring(receipt.PurchaseId)
	return withPlayerLock(player, function()
		return processPurchase(player, product, purchaseId, receipt.ProductId, false)
	end)
end

---------------------------------------------------------------------------
-- Shop remote
---------------------------------------------------------------------------
local function canSimulate(): boolean
	return IS_STUDIO and Config.TestMode == true
end

local function vipStatus(player: Player)
	local vip = Registry.Find("VIPService")
	if vip and type(vip.GetDailyStatus) == "function" then
		local ok, res = pcall(vip.GetDailyStatus, vip, player)
		if ok and type(res) == "table" then
			return res
		end
	end
	return { IsVip = MonetizationService:HasPass(player, "VIP"), Claimable = false, Amount = Config.VIP.DailyCash, NextIn = 0 }
end

local function buildCatalog(player: Player)
	local passes = {}
	for _, pass in ipairs(Config.Passes) do
		passes[pass.Key] = { Owned = MonetizationService:HasPass(player, pass.Key), Configured = pass.Id ~= 0 }
	end
	local products = {}
	for _, product in ipairs(Config.Products) do
		local entry = { Configured = product.Id ~= 0, Owned = false }
		if product.Kind == "Clothing" and product.ItemId then
			entry.Owned = clothingOwned(player, product.ItemId)
		end
		products[product.Key] = entry
	end
	return {
		Passes = passes,
		Products = products,
		Vip = vipStatus(player),
		CanSimulate = canSimulate(),
	}
end

local function handleShop()
	Net.HandleActions("Shop", {
		GetCatalog = function(player: Player)
			return { ok = true, Catalog = buildCatalog(player) }
		end,

		PromptPass = function(player: Player, payload)
			local key = Guard.OneOf(Guard.Id(payload.Key, 32), Config.PassByKey)
			if not key then
				return { ok = false, err = "Unknown pass" }
			end
			if MonetizationService:HasPass(player, key) then
				return { ok = false, err = "You already own this pass." }
			end
			local ok, err = MonUtil.PromptPass(player, key)
			return { ok = ok, err = err }
		end,

		PromptProduct = function(player: Player, payload)
			local key = Guard.OneOf(Guard.Id(payload.Key, 40), Config.ProductByKey)
			if not key then
				return { ok = false, err = "Unknown item" }
			end
			local product = Config.ProductByKey[key]
			if product.Kind == "Clothing" and product.ItemId and clothingOwned(player, product.ItemId) then
				return { ok = false, err = "You already own this item — find it in your Wardrobe." }
			end
			local ok, err = MonUtil.PromptProduct(player, key)
			return { ok = ok, err = err }
		end,

		ClaimVipDaily = function(player: Player)
			local vip = Registry.Find("VIPService")
			if not vip or type(vip.ClaimDaily) ~= "function" then
				return { ok = false, err = "VIP rewards are unavailable right now." }
			end
			return vip:ClaimDaily(player)
		end,

		SimulatePurchase = function(player: Player, payload)
			if not canSimulate() then
				return { ok = false, err = "Simulation is only available in Studio with TestMode on." }
			end
			local kind = Guard.OneOf(payload.Kind, { Pass = true, Product = true })
			if kind == "Pass" then
				local key = Guard.OneOf(Guard.Id(payload.Key, 32), Config.PassByKey)
				if not key then
					return { ok = false, err = "Unknown pass" }
				end
				grantPass(player, key, "Simulated")
				return { ok = true }
			elseif kind == "Product" then
				local key = Guard.OneOf(Guard.Id(payload.Key, 40), Config.ProductByKey)
				if not key then
					return { ok = false, err = "Unknown item" }
				end
				local product = Config.ProductByKey[key]
				local purchaseId = "studio_" .. HttpService:GenerateGUID(false)
				local decision = withPlayerLock(player, function()
					return processPurchase(player, product, purchaseId, product.Id, true)
				end)
				if decision == Decision.PurchaseGranted then
					return { ok = true }
				end
				return { ok = false, err = "Simulated purchase was not granted (see output)." }
			end
			return { ok = false, err = "Bad request" }
		end,
	}, {
		rate = 6,
		burst = 12,
		perAction = {
			PromptPass = { rate = 1, burst = 3 },
			PromptProduct = { rate = 1, burst = 3 },
			ClaimVipDaily = { rate = 0.5, burst = 2 },
			SimulatePurchase = { rate = 1, burst = 2 },
		},
	})
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function MonetizationService:Init()
	DataService = Registry.Get("DataService")
	NotifyService = Registry.Get("NotifyService")
	local EconomyService = Registry.Get("EconomyService")

	Receipts.Init(Config.Receipts.GlobalStoreName, Config.Receipts.Retries)

	for _, product in ipairs(Config.Products) do
		if product.Kind == "Clothing" then
			handlers[product.Key] = makeClothingHandler()
		elseif product.Kind == "Cosmetic" then
			handlers[product.Key] = makeCosmeticHandler()
		end
	end

	-- VIP economy perks (consumers never need to know about VIP)
	local vipCfg = Config.VIP
	local prefixLen = #vipCfg.PayReasonPrefix
	EconomyService:RegisterPayModifier(function(player: Player, _amount: number, reason: string)
		if type(reason) == "string" and reason:sub(1, prefixLen) == vipCfg.PayReasonPrefix and MonetizationService:HasPass(player, "VIP") then
			return vipCfg.PayMultiplier
		end
		return 1
	end)
	EconomyService:RegisterPriceModifier(function(player: Player, _price: number, category: string)
		if category == vipCfg.DiscountCategory and MonetizationService:HasPass(player, "VIP") then
			return vipCfg.FurnitureDiscount
		end
		return 1
	end)

	handleShop()

	MarketplaceService.ProcessReceipt = processReceipt

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player: Player, passId: number, wasPurchased: boolean)
		if not wasPurchased then
			return
		end
		local pass = Config.PassById[passId]
		if pass then
			grantPass(player, pass.Key, "Purchase")
		end
	end)

	Players.PlayerAdded:Connect(function(player)
		checkPasses(player)
	end)
	for _, player in ipairs(Players:GetPlayers()) do
		task.spawn(checkPasses, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		owned[player] = nil
		receiptBusy[player] = nil
	end)
end

function MonetizationService:Start()
	Elevators.Start({
		HasPass = function(player: Player, key: string)
			return MonetizationService:HasPass(player, key)
		end,
	})
end

return MonetizationService
