-- ClothingService: wardrobe ownership, the cash clothing store and dressing characters.
--
-- Data: Clothing.Owned[itemId] = true, Clothing.Equipped[slot] = itemId   (Starter items are owned by everyone)
-- Cash items are bought at ClothingStore-tagged parts (server ProximityPrompt opens the "Clothing" panel on the
-- Store tab). Robux exclusives are granted by MonetizationService developer products (GrantItem).
-- Equipped items are re-applied on every CharacterAdded (after the Roblox avatar has loaded).
--
-- API (server):
--   ClothingService:Owns(player, itemId) -> boolean
--   ClothingService:GrantItem(player, itemId) -> boolean
--   ClothingService:RevokeItem(player, itemId) -> boolean       (purchase rollback)
--   ClothingService:Equip(player, itemId) -> (ok, err?)
--   ClothingService:Unequip(player, slot) -> (ok, err?)
--   ClothingService:Refresh(player)                             re-dress the current character
--   ClothingService:GetEquipped(player) -> { [slot]: itemId }
--
-- Remote domain "Clothing":
--   GetCatalog {}                 -> { Owned, Equipped, Prices = {[id]=cash price}, NearStore }
--   Buy { ItemId, Equip? }        cash item, must be near a ClothingStore
--   Equip { ItemId }              must own it
--   Unequip { Slot }

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Maid = require(Shared.Util.Maid)
local Format = require(Shared.Util.Format)
local Clothing = require(Shared.Config.Clothing)
local World = require(Shared.Config.World)

local Server = ServerScriptService:WaitForChild("Server")
local Registry = require(Server.Registry)
local Guard = require(Server.Lib.Guard)

local ClothingFactory = require(script.Parent.ClothingFactory)

local ClothingService = {
	Name = "ClothingService",
	Priority = 30,
}

local PROMPT_NAME = "SkylineClothingPrompt"

local DataService
local EconomyService
local NotifyService

local playerMaids: { [Player]: any } = {}
local lastEquip: { [Player]: number } = {}
local applyToken: { [Player]: number } = {}
local promptConns: { [Instance]: RBXScriptConnection } = {}

---------------------------------------------------------------------------
-- Ownership
---------------------------------------------------------------------------
function ClothingService:Owns(player: Player, itemId: string): boolean
	local item = Clothing.ById[itemId]
	if not item then
		return false
	end
	if item.Starter then
		return true
	end
	return DataService:Get(player, "Clothing.Owned." .. itemId) == true
end

function ClothingService:GrantItem(player: Player, itemId: string): boolean
	if not Clothing.ById[itemId] or not DataService:IsLoaded(player) then
		return false
	end
	return DataService:Set(player, "Clothing.Owned." .. itemId, true) == true
end

function ClothingService:RevokeItem(player: Player, itemId: string): boolean
	local item = Clothing.ById[itemId]
	if not item or not DataService:IsLoaded(player) then
		return false
	end
	DataService:Set(player, "Clothing.Owned." .. itemId, nil)
	local equipped = self:GetEquipped(player)
	if equipped[item.Slot] == itemId then
		self:Unequip(player, item.Slot)
	end
	return true
end

function ClothingService:GetEquipped(player: Player): { [string]: string }
	local eq = DataService:Get(player, "Clothing.Equipped")
	if type(eq) ~= "table" then
		return {}
	end
	return eq
end

---------------------------------------------------------------------------
-- Dressing
---------------------------------------------------------------------------
local function equippedItems(player: Player): { any }
	local list = {}
	local eq = ClothingService:GetEquipped(player)
	for _, slot in ipairs(Clothing.Slots) do
		local id = eq[slot]
		local item = id and Clothing.ById[id]
		if item and item.Slot == slot and ClothingService:Owns(player, id) then
			table.insert(list, item)
		end
	end
	return list
end

function ClothingService:Refresh(player: Player)
	local char = player.Character
	if not char or not char.Parent then
		return
	end
	-- newest request wins if several arrive while an asset is loading (ClothingFactory.Apply aborts older runs);
	-- equippedItems is read inside the thread so a deferred run always dresses the latest selection
	local token = (applyToken[player] or 0) + 1
	applyToken[player] = token
	task.defer(function()
		if applyToken[player] ~= token or player.Character ~= char then
			return -- a newer Refresh in the same frame supersedes this one
		end
		local ok, err = pcall(ClothingFactory.Apply, char, equippedItems(player))
		if not ok then
			warn("[ClothingService] dress failed for " .. player.Name .. ": " .. tostring(err))
		end
	end)
end

local function onCharacter(player: Player, char: Model)
	-- wait for the Roblox avatar (it would otherwise overwrite our tints)
	local t = 0
	while not player:HasAppearanceLoaded() and t < Clothing.AppearanceWait and char.Parent do
		task.wait(0.25)
		t += 0.25
	end
	char:WaitForChild("Humanoid", 5)
	if not char.Parent or player.Character ~= char then
		return
	end
	if not DataService:IsLoaded(player) then
		DataService:WaitForData(player, 30)
	end
	if player.Character == char then
		ClothingService:Refresh(player)
	end
end

local function trackPlayer(player: Player)
	if playerMaids[player] then
		return
	end
	local maid = Maid.new()
	playerMaids[player] = maid
	maid:Give(player.CharacterAdded:Connect(function(char)
		onCharacter(player, char)
	end))
	if player.Character then
		task.spawn(onCharacter, player, player.Character)
	end
end

---------------------------------------------------------------------------
-- Equip / Unequip
---------------------------------------------------------------------------
function ClothingService:Equip(player: Player, itemId: string): (boolean, string?)
	local item = Clothing.ById[itemId]
	if not item then
		return false, "Unknown item"
	end
	if not DataService:IsLoaded(player) then
		return false, "Your data is still loading."
	end
	if not self:Owns(player, itemId) then
		return false, "You don't own that yet."
	end
	DataService:Update(player, "Clothing.Equipped", function(old)
		local eq = {}
		if type(old) == "table" then
			for k, v in pairs(old) do
				eq[k] = v
			end
		end
		if item.Slot == "Outfit" then
			eq.Shirt = nil
			eq.Pants = nil
		elseif item.Slot == "Shirt" or item.Slot == "Pants" then
			eq.Outfit = nil
		end
		eq[item.Slot] = itemId
		return eq
	end)
	self:Refresh(player)
	return true, nil
end

function ClothingService:Unequip(player: Player, slot: string): (boolean, string?)
	if not Clothing.SlotSet[slot] then
		return false, "Unknown slot"
	end
	if not DataService:IsLoaded(player) then
		return false, "Your data is still loading."
	end
	DataService:Update(player, "Clothing.Equipped", function(old)
		local eq = {}
		if type(old) == "table" then
			for k, v in pairs(old) do
				if k ~= slot then
					eq[k] = v
				end
			end
		end
		return eq
	end)
	self:Refresh(player)
	return true, nil
end

---------------------------------------------------------------------------
-- Remote
---------------------------------------------------------------------------
local function nearStore(player: Player): boolean
	return Guard.NearTagged(player, World.Tags.ClothingStore, Clothing.StoreDistance) ~= nil
end

local function cashPrice(player: Player, item): number?
	if item.ProductKey or type(item.Price) ~= "number" then
		return nil
	end
	if item.Price <= 0 then
		return 0
	end
	return EconomyService:GetPrice(player, item.Price, Clothing.PriceCategory)
end

local function cooldownOk(player: Player): boolean
	local now = os.clock()
	if lastEquip[player] and now - lastEquip[player] < Clothing.EquipCooldown then
		return false
	end
	lastEquip[player] = now
	return true
end

local function handleRemote()
	Net.HandleActions("Clothing", {
		GetCatalog = function(player: Player)
			if not DataService:IsLoaded(player) then
				return { ok = false, err = "Your data is still loading." }
			end
			local owned = {}
			local prices = {}
			for _, item in ipairs(Clothing.Items) do
				owned[item.Id] = ClothingService:Owns(player, item.Id)
				local p = cashPrice(player, item)
				if p then
					prices[item.Id] = p
				end
			end
			return {
				ok = true,
				Owned = owned,
				Equipped = ClothingService:GetEquipped(player),
				Prices = prices,
				NearStore = nearStore(player),
			}
		end,

		Buy = function(player: Player, payload)
			local id = Guard.Id(payload.ItemId, 48)
			local item = id and Clothing.ById[id]
			if not item then
				return { ok = false, err = "Unknown item" }
			end
			if item.ProductKey then
				return { ok = false, err = "That's a Robux exclusive — find it in the 🛍️ Shop." }
			end
			if ClothingService:Owns(player, item.Id) then
				return { ok = false, err = "You already own " .. item.Name .. "." }
			end
			if not nearStore(player) then
				return { ok = false, err = "Visit a clothing store to buy this." }
			end
			local price = cashPrice(player, item)
			if not price then
				return { ok = false, err = "That item isn't for sale." }
			end
			if price > 0 and not EconomyService:TrySpend(player, price, "Buy:Clothing:" .. item.Id) then
				return { ok = false, err = "Not enough cash — you need " .. Format.Money(price) .. "." }
			end
			if not ClothingService:GrantItem(player, item.Id) then
				if price > 0 then
					EconomyService:AddCash(player, price, "Refund:Clothing:" .. item.Id)
				end
				return { ok = false, err = "Couldn't add the item. You were refunded." }
			end
			if Guard.Bool(payload.Equip) == true then
				ClothingService:Equip(player, item.Id)
			end
			NotifyService:Send(player, ("%s %s added to your wardrobe!"):format(item.Icon or "👕", item.Name), "success")
			return { ok = true, Price = price }
		end,

		Equip = function(player: Player, payload)
			local id = Guard.Id(payload.ItemId, 48)
			if not id or not Clothing.ById[id] then
				return { ok = false, err = "Unknown item" }
			end
			if not cooldownOk(player) then
				return { ok = false, err = "Slow down!" }
			end
			local ok, err = ClothingService:Equip(player, id)
			return { ok = ok, err = err, Equipped = ClothingService:GetEquipped(player) }
		end,

		Unequip = function(player: Player, payload)
			local slot = Guard.OneOf(Guard.Id(payload.Slot, 16), Clothing.SlotSet)
			if not slot then
				return { ok = false, err = "Unknown slot" }
			end
			if not cooldownOk(player) then
				return { ok = false, err = "Slow down!" }
			end
			local ok, err = ClothingService:Unequip(player, slot)
			return { ok = ok, err = err, Equipped = ClothingService:GetEquipped(player) }
		end,
	}, {
		rate = 6,
		burst = 12,
		perAction = {
			Buy = { rate = 1, burst = 3 },
			GetCatalog = { rate = 1, burst = 4 },
		},
	})
end

---------------------------------------------------------------------------
-- Store prompts
---------------------------------------------------------------------------
local function setupStore(inst: Instance)
	if promptConns[inst] then
		return
	end
	local part: BasePart? = nil
	if inst:IsA("BasePart") then
		part = inst
	elseif inst:IsA("Model") then
		part = inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
	end
	if not part then
		return
	end
	local prompt = part:FindFirstChild(PROMPT_NAME)
	if not prompt then
		prompt = Instance.new("ProximityPrompt")
		prompt.Name = PROMPT_NAME
		prompt.ActionText = "Shop clothes"
		prompt.ObjectText = "👕 Clothing Store"
		prompt.HoldDuration = 0
		prompt.MaxActivationDistance = Clothing.PromptDistance
		prompt.RequiresLineOfSight = false
		prompt.KeyboardKeyCode = Enum.KeyCode.E
		prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
		prompt.Parent = part
	end
	promptConns[inst] = (prompt :: ProximityPrompt).Triggered:Connect(function(player: Player)
		NotifyService:OpenUI(player, "Clothing", { Tab = "Store" })
	end)
end

local function teardownStore(inst: Instance)
	local c = promptConns[inst]
	if c then
		c:Disconnect()
		promptConns[inst] = nil
	end
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function ClothingService:Init()
	DataService = Registry.Get("DataService")
	EconomyService = Registry.Get("EconomyService")
	NotifyService = Registry.Get("NotifyService")
	handleRemote()

	Players.PlayerAdded:Connect(trackPlayer)
	Players.PlayerRemoving:Connect(function(player)
		local maid = playerMaids[player]
		if maid then
			maid:Clean()
			playerMaids[player] = nil
		end
		lastEquip[player] = nil
		applyToken[player] = nil
	end)
end

function ClothingService:Start()
	for _, player in ipairs(Players:GetPlayers()) do
		trackPlayer(player)
	end
	local tag = World.Tags.ClothingStore
	CollectionService:GetInstanceAddedSignal(tag):Connect(setupStore)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(teardownStore)
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		setupStore(inst)
	end
end

return ClothingService
