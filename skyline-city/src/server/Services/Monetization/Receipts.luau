-- Receipts: the GLOBAL receipt ledger ("SkylineCity_Receipts_v1"), the second idempotency layer for developer products.
--
-- The player's own save (Data.Purchases) is the first layer. This store is keyed by PurchaseId, so even if a
-- player's PurchaseId history was trimmed, or a receipt is retried in a different server, it is never granted twice.
--
--   Receipts.Init(storeName)
--   Receipts.Lookup(purchaseId) -> (ok: boolean, record: table?)   ok=false means the store could not be read (retry later)
--   Receipts.MarkGranted(purchaseId, info) -> boolean              info = { UserId, ProductId, ProductKey }
--
-- In Studio without API access this falls back to an in-memory table (ProfileStore.IsMock()).

local DataStoreService = game:GetService("DataStoreService")
local ServerScriptService = game:GetService("ServerScriptService")

local ProfileStore = require(ServerScriptService:WaitForChild("Server").Lib.ProfileStore)

local Receipts = {}

local store: DataStore? = nil
local mock: { [string]: any }? = nil
local attempts = 4

local function keyFor(purchaseId: string): string
	-- DataStore keys are limited to 50 characters; PurchaseIds are ~32 hex chars.
	return ("r_" .. purchaseId):sub(1, 50)
end

function Receipts.Init(storeName: string, retries: number?)
	attempts = retries or 4
	if ProfileStore.IsMock() then
		mock = {}
		warn("[Receipts] DataStores unavailable — using an in-memory receipt ledger (Studio only).")
		return
	end
	local ok, ds = pcall(function()
		return DataStoreService:GetDataStore(storeName)
	end)
	if ok then
		store = ds
	else
		warn("[Receipts] could not open receipt store:", ds)
	end
end

function Receipts.Lookup(purchaseId: string): (boolean, any)
	local key = keyFor(purchaseId)
	if mock then
		return true, mock[key]
	end
	local ds = store
	if not ds then
		return false, nil
	end
	local current = nil
	local ok, err = ProfileStore.Retry(attempts, Enum.DataStoreRequestType.UpdateAsync, function()
		return ds:UpdateAsync(key, function(old)
			current = old
			return nil -- read only: returning nil cancels the write
		end)
	end)
	if not ok then
		warn(("[Receipts] lookup failed for %s: %s"):format(purchaseId, tostring(err)))
		return false, nil
	end
	return true, current
end

function Receipts.MarkGranted(purchaseId: string, info: { [string]: any }): boolean
	local key = keyFor(purchaseId)
	local record = {
		State = "Granted",
		UserId = info.UserId,
		ProductId = info.ProductId,
		ProductKey = info.ProductKey,
		Time = os.time(),
	}
	if mock then
		mock[key] = record
		return true
	end
	local ds = store
	if not ds then
		return false
	end
	local ok, err = ProfileStore.Retry(attempts, Enum.DataStoreRequestType.UpdateAsync, function()
		return ds:UpdateAsync(key, function(old)
			if type(old) == "table" and old.State == "Granted" then
				return nil -- already recorded
			end
			return record
		end)
	end)
	if not ok then
		warn(("[Receipts] could not record %s in the global ledger: %s"):format(purchaseId, tostring(err)))
		return false
	end
	return true
end

return Receipts
