-- BankController: the "Bank" panel (opened by ATM / Bank counter prompts from the server, or by the phone app).
--
-- API (client):
--   BankController:Open(opts?)          opts = { ViaPhone = bool, Tab = "Wallet"|"Bank"|"Savings"|"Send"|"History", TargetUserId }
--   BankController:OpenPhoneBank(tab?)  shortcut for the phone's Bank app (ViaPhone = true)
--   BankController:GetBalances() -> { Cash, Bank, Savings }   (from the client data mirror)

local Client = script.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))
local BankPanel = require(script.Parent:WaitForChild("Economy"):WaitForChild("BankPanel"))

local BankController = {
	Name = "BankController",
	Priority = 50,
}

local function num(path: string): number
	local v = ClientData.Get(path)
	return type(v) == "number" and v or 0
end

function BankController:Open(opts: { [string]: any }?)
	Router.Open("Bank", opts or { ViaPhone = true })
end

function BankController:OpenPhoneBank(tab: string?)
	Router.Open("Bank", { ViaPhone = true, Tab = tab })
end

function BankController:GetBalances()
	return { Cash = num("Cash"), Bank = num("Bank"), Savings = num("Savings") }
end

function BankController:Init()
	Router.Register("Bank", {
		Title = "Skyline Bank",
		Icon = "🏦",
		Kind = "window",
		Size = Vector2.new(560, 600),
		Build = function(content, data, ctx)
			BankPanel.Build(content, data, ctx)
		end,
	})
end

return BankController
