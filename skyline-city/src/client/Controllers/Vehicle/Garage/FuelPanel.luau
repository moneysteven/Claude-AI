-- FuelPanel: the "FuelPump" window (opened by the server ProximityPrompt on FuelPump-tagged parts).
-- Choose how many litres (or kWh for EVs) to buy, see the price, then fill up; the tank gauge updates live
-- while the pump runs. Gamepad: L1 / R1 change the amount, X starts / stops the pump, B closes.
--
--   FuelPanel.Build(content, quote?, ctx)    quote = FuelService:Quote() table (fetched if nil)

local ContextActionService = game:GetService("ContextActionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local VehiclesConfig = require(Shared.Config.Vehicles)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))

local Widgets = require(script.Parent:WaitForChild("Widgets"))

local FuelPanel = {}

local C = Theme.Colors
local PRIORITY = 3100

local function carModel(uid: string?): Model?
	if type(uid) ~= "string" then
		return nil
	end
	local folder = Workspace:FindFirstChild(VehiclesConfig.FolderName)
	local m = folder and folder:FindFirstChild(uid)
	if m and m:IsA("Model") then
		return m
	end
	return nil
end

function FuelPanel.Build(content: Frame, data: any, ctx)
	local maid = ctx.Maid
	local quote = data
	if type(quote) ~= "table" or not quote.ok then
		local loading = Kit.Label("Checking your car…", { TextColor3 = C.TextDim, Parent = content })
		quote = Net.Invoke("Fuel", "Quote", {})
		if not content.Parent then
			return
		end
		loading:Destroy()
		if not quote.ok then
			Kit.Label("⛽ " .. tostring(quote.err or "Bring your car to the pump"), { TextColor3 = C.TextDim, Parent = content })
			Kit.Button("Close", "secondary", ctx.Close, { Position = UDim2.new(0, 0, 1, -44), Parent = content })
			return
		end
	end

	local electric = quote.Electric == true
	local unit = quote.Unit or (electric and "kWh" or "L")
	local maxAmount = math.max(0, quote.MaxAmount or 0)
	local price = quote.PricePerUnit or 0
	local amount = maxAmount

	local list = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = content })
	Kit.List(list, 10)

	Kit.Label(("%s <b>%s</b>"):format(electric and "⚡ Charging" or "⛽ Refuelling", quote.Car or "your car"), {
		TextSize = Theme.TextSize.Heading,
		LayoutOrder = 1,
		Parent = list,
	})
	local gaugeFrame, setGauge = Widgets.Bar("", quote.Fuel or 0, Widgets.FuelColor(quote.Fuel or 0), { LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 34), Parent = list })
	local function gaugeText(f: number)
		return ("%s %d%% · %.0f / %.0f %s"):format(electric and "🔋 Battery" or "⛽ Tank", math.floor(f * 100 + 0.5), f * (quote.Capacity or 0), quote.Capacity or 0, unit)
	end
	setGauge(quote.Fuel or 0, gaugeText(quote.Fuel or 0))
	gaugeFrame.Name = "Gauge"

	Kit.Label(("Price: <b>%s</b> per %s · %s%s"):format(Format.Money(price), unit, electric and "charges at " or "pumps ", ("%s %s/s"):format(tostring(math.floor((quote.Rate or 0) * 10 + 0.5) / 10), unit)), {
		TextSize = Theme.TextSize.Small,
		TextColor3 = C.TextDim,
		LayoutOrder = 3,
		Parent = list,
	})

	-- amount picker
	local picker = Kit.Card({ LayoutOrder = 4, BackgroundColor3 = C.SurfaceAlt, Parent = list })
	Kit.List(picker, 8)
	local amountLabel = Kit.Label("", { Font = Theme.FontBold, TextSize = Theme.TextSize.Heading, LayoutOrder = 1, Parent = picker })
	local stepRow = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 2, Parent = picker })
	local quickRow = Widgets.ButtonGrid({ LayoutOrder = 3, Parent = picker })

	local payBtn: TextButton
	local setAmountBar: ((number, string?) -> ())? = nil
	local function refreshAmount()
		amount = math.clamp(math.floor(amount + 0.5), 0, maxAmount)
		local cost = math.max(amount > 0 and 1 or 0, math.ceil(amount * price))
		amountLabel.Text = ("%d %s  →  %s"):format(amount, unit, Format.Money(cost))
		if setAmountBar then
			setAmountBar(maxAmount > 0 and amount / maxAmount or 0, ("%d%% of what fits"):format(maxAmount > 0 and math.floor(amount / maxAmount * 100 + 0.5) or 0))
		end
		if payBtn then
			payBtn.Text = amount > 0 and ((electric and "⚡ Charge for " or "⛽ Fill for ") .. Format.Money(cost)) or "Already full"
		end
	end
	Kit.Button("−", "secondary", function()
		amount -= 5
		refreshAmount()
	end, { Size = UDim2.new(0, 56, 1, 0), TextSize = 22, Parent = stepRow })
	Kit.Button("+", "secondary", function()
		amount += 5
		refreshAmount()
	end, { Size = UDim2.new(0, 56, 1, 0), Position = UDim2.new(1, -56, 0, 0), TextSize = 22, Parent = stepRow })
	local _, amountSetter = Widgets.Bar("Amount", 1, C.Money, { Size = UDim2.new(1, -128, 0, 30), Position = UDim2.fromOffset(64, 6), Parent = stepRow })
	setAmountBar = amountSetter
	for i, q in ipairs(VehiclesConfig.UI.FuelQuickAmounts) do
		Kit.Button(("+%d %s"):format(q, unit), "ghost", function()
			amount = q
			refreshAmount()
		end, { LayoutOrder = i, TextSize = 14, Parent = quickRow })
	end
	Kit.Button("Fill up", "ghost", function()
		amount = maxAmount
		refreshAmount()
	end, { LayoutOrder = 99, TextSize = 14, Parent = quickRow })

	local status = Kit.Label("", { TextSize = Theme.TextSize.Small, TextColor3 = C.TextDim, LayoutOrder = 5, Parent = list })
	local running = quote.Refueling == true

	local busy = false
	local function payOrStop()
		if busy then
			return
		end
		busy = true
		if running then
			local res = Net.Invoke("Fuel", "Cancel", {})
			Router.Result(res)
			busy = false
			return
		end
		if amount <= 0 then
			Router.Notify("Your tank is already full 👍", "info", 2)
			busy = false
			return
		end
		local res = Net.Invoke("Fuel", "Refuel", { Amount = amount })
		if Router.Result(res) and payBtn.Parent then
			running = true
			payBtn.Text = "⏹ Stop"
			payBtn.BackgroundColor3 = C.Danger
			status.Text = ("Filling %d %s… about %ds. Don't drive off!"):format(math.floor(res.Amount or amount), unit, math.ceil(res.Seconds or 0))
		end
		busy = false
	end
	payBtn = Kit.Button("", "success", payOrStop, { LayoutOrder = 6, Parent = list })
	refreshAmount()
	if running then
		payBtn.Text = "⏹ Stop"
		payBtn.BackgroundColor3 = C.Danger
	end
	Kit.Button("Close", "secondary", ctx.Close, { LayoutOrder = 7, Parent = list })

	-- live gauge from the car's Fuel attribute
	local model = carModel(quote.Uid)
	if model then
		maid:Give(model:GetAttributeChangedSignal("Fuel"):Connect(function()
			local f = model:GetAttribute("Fuel") or 0
			setGauge(f, gaugeText(f), Widgets.FuelColor(f))
		end))
		maid:Give(model:GetAttributeChangedSignal("Refueling"):Connect(function()
			if model:GetAttribute("Refueling") ~= true and running then
				running = false
				status.Text = "Done!"
				payBtn.BackgroundColor3 = C.Success
				refreshAmount()
			end
		end))
	end

	-- gamepad
	ContextActionService:BindActionAtPriority("FuelLess", function(_, st)
		if st == Enum.UserInputState.Begin then
			amount -= 5
			refreshAmount()
		end
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.ButtonL1)
	ContextActionService:BindActionAtPriority("FuelMore", function(_, st)
		if st == Enum.UserInputState.Begin then
			amount += 5
			refreshAmount()
		end
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.ButtonR1)
	ContextActionService:BindActionAtPriority("FuelPay", function(_, st)
		if st == Enum.UserInputState.Begin then
			task.spawn(payOrStop)
		end
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.ButtonX)
	maid:Give(function()
		ContextActionService:UnbindAction("FuelLess")
		ContextActionService:UnbindAction("FuelMore")
		ContextActionService:UnbindAction("FuelPay")
	end)
end

return FuelPanel
