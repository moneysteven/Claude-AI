-- MonUtil: small helpers shared by MonetizationService, VIPService, ClothingService and Elevators.
--
--   MonUtil.Teleport(player, cframe) -> boolean          WorldService:Teleport if present, else AntiExploit whitelist + PivotTo
--   MonUtil.PromptPass(player, passKey) -> (ok, err?)    server-side PromptGamePassPurchase
--   MonUtil.PromptProduct(player, productKey) -> (ok, err?)
--   MonUtil.Notify(player, text, kind?, duration?)
--   MonUtil.Root(player) -> BasePart?

local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config.Monetization)

local Registry = require(ServerScriptService:WaitForChild("Server").Registry)

local MonUtil = {}

function MonUtil.Root(player: Player): BasePart?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root
	end
	return nil
end

function MonUtil.Notify(player: Player, text: string, kind: string?, duration: number?)
	local notify = Registry.Find("NotifyService")
	if notify then
		notify:Send(player, text, kind, duration)
	end
end

function MonUtil.Teleport(player: Player, cframe: CFrame): boolean
	local char = player.Character
	if not char or not char.Parent then
		return false
	end
	local humanoid = char:FindFirstChildOfClass("Humanoid")
	if humanoid and humanoid.SeatPart then
		-- leave seats / cars first so we never drag a vehicle along
		local weld = humanoid.SeatPart:FindFirstChild("SeatWeld")
		if weld then
			weld:Destroy()
		end
		humanoid.Sit = false
	end
	local world = Registry.Find("WorldService")
	if world and type(world.Teleport) == "function" then
		local ok, err = pcall(world.Teleport, world, player, cframe)
		if ok then
			return true
		end
		warn("[MonUtil] WorldService:Teleport failed, using fallback:", err)
	end
	local anti = Registry.Find("AntiExploitService")
	if anti and type(anti.Whitelist) == "function" then
		pcall(anti.Whitelist, anti, player, 3)
	end
	local ok = pcall(function()
		char:PivotTo(cframe)
		local root = char:FindFirstChild("HumanoidRootPart")
		if root and root:IsA("BasePart") then
			root.AssemblyLinearVelocity = Vector3.zero
		end
	end)
	return ok
end

function MonUtil.PromptPass(player: Player, key: string): (boolean, string?)
	local pass = Config.PassByKey[key]
	if not pass then
		return false, "Unknown pass"
	end
	if pass.Id == 0 then
		return false, pass.Name .. " isn't on sale yet (not configured)."
	end
	local ok, err = pcall(function()
		MarketplaceService:PromptGamePassPurchase(player, pass.Id)
	end)
	if not ok then
		warn("[MonUtil] PromptGamePassPurchase failed:", err)
		return false, "The Roblox store is unavailable right now. Try again soon."
	end
	return true, nil
end

function MonUtil.PromptProduct(player: Player, key: string): (boolean, string?)
	local product = Config.ProductByKey[key]
	if not product then
		return false, "Unknown product"
	end
	if product.Id == 0 then
		return false, "This item isn't on sale yet (not configured)."
	end
	local ok, err = pcall(function()
		MarketplaceService:PromptProductPurchase(player, product.Id)
	end)
	if not ok then
		warn("[MonUtil] PromptProductPurchase failed:", err)
		return false, "The Roblox store is unavailable right now. Try again soon."
	end
	return true, nil
end

return MonUtil
