-- RepairPanel: the "Repair" window (opened by the server ProximityPrompt on MechanicBay-tagged zones).
-- Shows the car's condition and the repair cost; one tap (or gamepad X) repairs it to 100 %.
--
--   RepairPanel.Build(content, quote?, ctx)    quote = Mechanic.Quote result (fetched if nil)

local ContextActionService = game:GetService("ContextActionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))

local Widgets = require(script.Parent:WaitForChild("Widgets"))

local RepairPanel = {}

local C = Theme.Colors

function RepairPanel.Build(content: Frame, data: any, ctx)
	local quote = data
	if type(quote) ~= "table" or not quote.ok then
		local loading = Kit.Label("Inspecting your car…", { TextColor3 = C.TextDim, Parent = content })
		quote = Net.Invoke("Mechanic", "Quote", {})
		if not content.Parent then
			return
		end
		loading:Destroy()
	end

	local list = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = content })
	Kit.List(list, 10)

	if not quote.ok then
		Kit.Label("🔧 " .. tostring(quote.err or "Drive your car into the bay"), { TextColor3 = C.TextDim, LayoutOrder = 1, Parent = list })
		Kit.Button("Close", "secondary", ctx.Close, { LayoutOrder = 2, Parent = list })
		return
	end

	local health = math.clamp(quote.Health or 100, 0, 100)
	Kit.Label(("🔧 <b>%s</b>"):format(quote.Car or "Your car"), { TextSize = Theme.TextSize.Heading, LayoutOrder = 1, Parent = list })
	local _, setBar = Widgets.Bar(("Condition %d%%"):format(math.floor(health + 0.5)), health / 100, Widgets.HealthColor(health), {
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, 34),
		Parent = list,
	})

	local notes = {}
	if quote.EngineDead then
		table.insert(notes, "💥 The engine is dead — it won't start until it's repaired.")
	elseif health < 40 then
		table.insert(notes, "⚠️ Heavy damage: smoke from the bonnet and less power.")
	elseif health < 100 then
		table.insert(notes, "Minor dents and scratches.")
	else
		table.insert(notes, "✨ Your car is in perfect shape.")
	end
	Kit.Label(table.concat(notes, "\n"), { TextColor3 = C.TextDim, LayoutOrder = 3, Parent = list })

	local card = Kit.Card({ LayoutOrder = 4, BackgroundColor3 = C.SurfaceAlt, Parent = list })
	Kit.List(card, 4)
	Kit.Label(("Full repair: <b>%s</b>"):format(Format.Money(quote.Cost or 0)), { TextSize = Theme.TextSize.Heading, LayoutOrder = 1, Parent = card })
	Kit.Label(("Your cash: %s (the bank covers the rest)"):format(Format.Money(quote.Cash or 0)), {
		TextSize = Theme.TextSize.Small,
		TextColor3 = C.TextDim,
		LayoutOrder = 2,
		Parent = card,
	})

	local done = false
	local repairBtn = Kit.Button(quote.NeedsRepair and ("🔧 Repair for " .. Format.Money(quote.Cost or 0)) or "Nothing to repair", quote.NeedsRepair and "success" or "secondary", function()
		if done or not quote.NeedsRepair then
			return
		end
		local res = Net.Invoke("Mechanic", "Repair", { Uid = quote.Uid })
		if Router.Result(res) then
			done = true
			setBar(1, "Condition 100%", C.Success)
			task.delay(0.8, ctx.Close)
		end
	end, { LayoutOrder = 5, Parent = list })
	Kit.Button("Close", "secondary", ctx.Close, { LayoutOrder = 6, Parent = list })

	ContextActionService:BindActionAtPriority("RepairConfirm", function(_, st)
		if st == Enum.UserInputState.Begin and quote.NeedsRepair and not done then
			task.spawn(function()
				local res = Net.Invoke("Mechanic", "Repair", { Uid = quote.Uid })
				if Router.Result(res) then
					done = true
					setBar(1, "Condition 100%", C.Success)
					repairBtn.Text = "✅ Repaired"
					task.delay(0.8, ctx.Close)
				end
			end)
		end
		return Enum.ContextActionResult.Sink
	end, false, 3100, Enum.KeyCode.ButtonX)
	ctx.Maid:Give(function()
		ContextActionService:UnbindAction("RepairConfirm")
	end)
end

return RepairPanel
