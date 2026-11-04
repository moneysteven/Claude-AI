-- GaragePanel: the "Garage" window (phone Cars app / HUD button / N key).
--
-- Owned cars with brand badge, name, class, plate, fuel / health bars, mileage, value, finance status and
-- performance bars, plus Spawn / Despawn / Call to me / Lock / Unlock / Locate / Favourite / Sell (confirm).
-- Pass perks: VIP "🅿️ VIP spot" (free delivery to your reserved bay in the VIP Car Park) and Premium Car Park
-- "✨ Showcase" (your car on display at the AutoStrip Meet Lot showroom while you are online).
-- Gamepad: L1 / R1 select a car, X spawns or despawns it, Y calls it to you, B closes.
--
--   GaragePanel.Build(content, data, ctx)   (Router panel builder)

local ContextActionService = game:GetService("ContextActionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)

local Client = script:FindFirstAncestor("Client") or script.Parent.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))

local Widgets = require(script.Parent:WaitForChild("Widgets"))

local GaragePanel = {}

local C = Theme.Colors
local PRIORITY = 3100

local function setWaypoint(position: Vector3, label: string): boolean
	local phone = Registry.Find("PhoneController")
	if phone and type(phone.SetWaypoint) == "function" then
		local ok = pcall(phone.SetWaypoint, phone, position, label)
		return ok
	end
	return false
end

function GaragePanel.Build(content: Frame, _data: any, ctx)
	local maid = ctx.Maid
	local alive = true
	maid:Give(function()
		alive = false
	end)

	local state = { List = nil :: any, Expanded = {} :: { [string]: boolean }, Selected = 1, Cards = {} :: { any } }

	-- header
	local header = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Parent = content })
	local slotsLabel = Kit.Label("🅿️ Loading your garage…", {
		Size = UDim2.new(1, -110, 1, 0),
		AutomaticSize = Enum.AutomaticSize.None,
		TextYAlignment = Enum.TextYAlignment.Center,
		Font = Theme.FontBold,
		Parent = header,
	})
	local refreshBtn = Kit.IconButton("🔄", nil, {
		Size = UDim2.fromOffset(44, 44),
		Position = UDim2.new(1, -44, 0, 0),
		Parent = header,
	})
	local despawnAll = Kit.IconButton("🅿️", nil, {
		Size = UDim2.fromOffset(44, 44),
		Position = UDim2.new(1, -96, 0, 0),
		Parent = header,
	})
	local hint = Kit.Label("", {
		Position = UDim2.fromOffset(0, 46),
		Size = UDim2.new(1, 0, 0, 18),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small,
		TextColor3 = C.TextDim,
		Parent = content,
	})
	local scroll = Kit.Scroll({ Position = UDim2.fromOffset(0, 70), Size = UDim2.new(1, 0, 1, -70), Parent = content }, 10)

	local refresh: () -> ()

	local function act(action: string, payload: any, okText: string?)
		local res = Net.Invoke("Vehicle", action, payload)
		local ok = Router.Result(res, okText)
		if alive then
			task.spawn(refresh)
		end
		return ok, res
	end

	local function highlight()
		for i, card in ipairs(state.Cards) do
			local stroke = card:FindFirstChild("SelectStroke")
			if stroke then
				stroke.Transparency = (i == state.Selected and Kit.IsGamepad()) and 0 or 1
			end
		end
	end

	local function carCard(c, order: number)
		local card = Kit.Card({ LayoutOrder = order, BackgroundColor3 = C.SurfaceAlt, Parent = scroll })
		Kit.List(card, 8)
		Kit.new("UIStroke", { Name = "SelectStroke", Color = C.Accent, Thickness = 2, Transparency = 1, Parent = card })

		-- title row
		local top = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 52), BackgroundTransparency = 1, LayoutOrder = 1, Parent = card })
		Widgets.Badge(c.Brand, 52, { Parent = top })
		Kit.Label(("<b>%s</b>"):format(c.Name), {
			Position = UDim2.fromOffset(62, 2),
			Size = UDim2.new(1, -62, 0, 24),
			AutomaticSize = Enum.AutomaticSize.None,
			TextSize = Theme.TextSize.Heading,
			TextTruncate = Enum.TextTruncate.AtEnd,
			TextWrapped = false,
			Parent = top,
		})
		Kit.Label(("%s · %s · <font face=\"RobotoMono\">%s</font>"):format(c.BrandName, c.Class, c.Plate ~= "" and c.Plate or "—"), {
			Position = UDim2.fromOffset(62, 28),
			Size = UDim2.new(1, -62, 0, 20),
			AutomaticSize = Enum.AutomaticSize.None,
			TextSize = Theme.TextSize.Small,
			TextColor3 = C.TextDim,
			Parent = top,
		})

		-- chips
		local chips = Widgets.Row(22, { LayoutOrder = 2, Parent = card })
		local function chip(text: string, color: Color3)
			Widgets.Chip(text, color, { Parent = chips })
		end
		if c.Active then
			chip("● OUT", C.Success)
		end
		if c.Favorite then
			chip("★ Favourite", C.VIP)
		end
		if c.Locked then
			chip("🔒 Locked", C.Danger)
		end
		if c.Financed then
			chip("💳 Financed", C.AccentAlt)
		end
		if c.Electric then
			chip("⚡ Electric", C.Accent)
		end
		if c.Health < 40 then
			chip("🔧 Needs repair", C.Warning)
		end
		if c.Showcase then
			chip("✨ On display", C.Accent)
		end

		-- fuel / health
		local bars = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 30), BackgroundTransparency = 1, LayoutOrder = 3, Parent = card })
		Widgets.Bar(("%s %d%%"):format(c.Electric and "🔋 Battery" or "⛽ Fuel", math.floor(c.Fuel * 100 + 0.5)), c.Fuel, Widgets.FuelColor(c.Fuel), {
			Size = UDim2.new(0.5, -6, 1, 0),
			Parent = bars,
		})
		Widgets.Bar(("❤️ Condition %d%%"):format(math.floor(c.Health + 0.5)), c.Health / 100, Widgets.HealthColor(c.Health), {
			Size = UDim2.new(0.5, -6, 1, 0),
			Position = UDim2.new(0.5, 6, 0, 0),
			Parent = bars,
		})

		Kit.Label(("📍 %s   💲 Worth %s   💰 Sell %s"):format(Widgets.Distance(c.Mileage), Format.MoneyShort(c.Value), Format.MoneyShort(math.max(0, c.Resale))), {
			TextSize = Theme.TextSize.Small,
			TextColor3 = C.TextDim,
			LayoutOrder = 4,
			Parent = card,
		})

		-- details (performance + finance)
		local details = Kit.new("Frame", {
			Size = UDim2.new(1, 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundTransparency = 1,
			Visible = state.Expanded[c.Uid] == true,
			LayoutOrder = 5,
			Parent = card,
		})
		Kit.List(details, 6)
		local r = c.Ratings or {}
		local stats = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 66), BackgroundTransparency = 1, LayoutOrder = 1, Parent = details })
		Widgets.Bar(("Top speed · %s"):format(Widgets.Speed(c.TopSpeed or 0)), r.Speed or 0, C.Accent, { Size = UDim2.new(0.5, -6, 0, 30), Parent = stats })
		Widgets.Bar(("Acceleration · %d hp"):format(math.floor(c.Horsepower or 0)), r.Acceleration or 0, C.AccentAlt, { Size = UDim2.new(0.5, -6, 0, 30), Position = UDim2.new(0.5, 6, 0, 0), Parent = stats })
		Widgets.Bar("Handling", r.Handling or 0, C.Success, { Size = UDim2.new(0.5, -6, 0, 30), Position = UDim2.fromOffset(0, 36), Parent = stats })
		Widgets.Bar("Braking", r.Braking or 0, C.Warning, { Size = UDim2.new(0.5, -6, 0, 30), Position = UDim2.new(0.5, 6, 0, 36), Parent = stats })
		local up = c.Upgrades or {}
		local upText = {}
		for _, k in ipairs({ "Engine", "Turbo", "Brakes", "Suspension", "Transmission" }) do
			local lvl = tonumber(up[k]) or 0
			if lvl > 0 then
				table.insert(upText, ("%s %d"):format(k, lvl))
			end
		end
		Kit.Label(#upText > 0 and ("🛠️ Upgrades: " .. table.concat(upText, " · ")) or "🛠️ No performance upgrades yet — visit a tuning shop", {
			TextSize = Theme.TextSize.Small,
			TextColor3 = C.TextDim,
			LayoutOrder = 2,
			Parent = details,
		})
		if c.Financed then
			Kit.Label(("💳 Finance: %s left · %s per payment · %d payments to go"):format(Format.Money(c.FinanceRemaining), Format.Money(c.FinancePayment or 0), math.floor(c.FinancePaymentsLeft or 0)), {
				TextSize = Theme.TextSize.Small,
				TextColor3 = C.Warning,
				LayoutOrder = 3,
				Parent = details,
			})
		end

		-- actions
		local grid = Widgets.ButtonGrid({ LayoutOrder = 6, Parent = card })
		local order = 0
		local function button(text: string, style: string, fn: () -> ())
			order += 1
			Kit.Button(text, style, fn, { LayoutOrder = order, TextSize = 14, Parent = grid })
		end
		if c.Active then
			button("🅿️ Despawn", "secondary", function()
				act("Despawn", {}, "Car parked in your garage")
			end)
		else
			button("🚗 Spawn", "primary", function()
				local ok, res = act("Spawn", { Uid = c.Uid }, ("%s is ready!"):format(c.Name))
				if ok and res.Position then
					setWaypoint(res.Position, c.Name)
				end
			end)
		end
		button("📞 Call to me", "secondary", function()
			local res = Net.Invoke("Vehicle", "Call", { Uid = c.Uid })
			if Router.Result(res) then
				Router.Notify(("🚗 %s is on its way (%ds)…"):format(c.Name, math.floor(res.Eta or 4)), "info", 4)
			end
		end)
		local list = state.List
		if list and list.Vip then
			button("🅿️ VIP spot", "secondary", function()
				local ok, res = act("ParkVip", { Uid = c.Uid }, ("%s is waiting in your VIP bay"):format(c.Name))
				if ok and res.Position then
					setWaypoint(res.Position, ("VIP bay %s"):format(tostring(res.Bay or "")))
				end
			end)
		end
		if list and list.PremiumCarPark then
			if c.Showcase then
				button("✨ Remove display", "ghost", function()
					act("SetShowcase", {}, "Showroom display taken down")
				end)
			else
				button("✨ Showcase", "secondary", function()
					act("SetShowcase", { Uid = c.Uid })
				end)
			end
		end
		if c.Active then
			button(c.Locked and "🔓 Unlock" or "🔒 Lock", "secondary", function()
				act("Lock", { Locked = not c.Locked }, c.Locked and "Car unlocked" or "Car locked")
			end)
			button("🧭 Locate", "secondary", function()
				local res = Net.Invoke("Vehicle", "Locate", { Uid = c.Uid })
				if Router.Result(res) then
					if setWaypoint(res.Position, res.Name or c.Name) then
						Router.Notify("🧭 GPS set to your car", "success", 3)
					else
						Router.Notify(("Your car is at %d, %d"):format(math.floor(res.Position.X), math.floor(res.Position.Z)), "info", 4)
					end
				end
			end)
		end
		button(c.Favorite and "★ Unfavourite" or "☆ Favourite", "ghost", function()
			act("SetFavorite", { Uid = c.Uid })
		end)
		button(state.Expanded[c.Uid] and "▴ Less" or "▾ Details", "ghost", function()
			state.Expanded[c.Uid] = not state.Expanded[c.Uid]
			details.Visible = state.Expanded[c.Uid] == true
		end)
		button("💰 Sell", "danger", function()
			local body
			if c.Financed then
				body = ("You'll get %s after paying off the remaining %s of finance."):format(Format.Money(math.max(0, c.Resale)), Format.Money(c.FinanceRemaining))
			else
				body = ("You'll get %s (%s value). This can't be undone."):format(Format.Money(math.max(0, c.Resale)), Format.Money(c.Value))
			end
			if c.Financed and c.Resale < 0 then
				Router.Notify(("You still owe %s — more than the car is worth. Pay off the finance first."):format(Format.Money(c.FinanceRemaining)), "error", 5)
				return
			end
			if Router.Confirm(("Sell your %s?"):format(c.Name), body, "Sell") then
				act("Sell", { Uid = c.Uid })
			end
		end)
		card:SetAttribute("Uid", c.Uid)
		return card
	end

	local function render(list)
		for _, child in ipairs(scroll:GetChildren()) do
			if child:IsA("GuiObject") then
				child:Destroy()
			end
		end
		table.clear(state.Cards)
		if not list then
			Kit.Label("Couldn't load your garage. Tap 🔄 to try again.", { TextColor3 = C.TextDim, Parent = scroll })
			return
		end
		slotsLabel.Text = ("🅿️ Garage · %d / %d slots"):format(math.floor(list.Used or 0), math.floor(list.Slots or 0))
		if list.PremiumCarPark then
			hint.Text = "⭐ Premium Car Park: instant spawn anywhere · ✨ Showcase a car at the Meet Lot."
		elseif list.Vip then
			hint.Text = "👑 VIP: 🅿️ VIP spot parks your car free in the VIP Car Park."
		elseif (list.CallCooldown or 0) > 0 then
			hint.Text = ("📞 Call available in %ds"):format(math.floor(list.CallCooldown))
		else
			hint.Text = "Tip: 📞 Call to me brings your car to the nearest road for free."
		end
		if #list.Cars == 0 then
			local empty = Kit.Card({ BackgroundColor3 = C.SurfaceAlt, Parent = scroll })
			Kit.Label("🚗 You don't own a car yet.\nVisit the dealership on the Auto Strip — cars start at just a few thousand dollars!", {
				TextColor3 = C.TextDim,
				Parent = empty,
			})
			return
		end
		for i, c in ipairs(list.Cars) do
			table.insert(state.Cards, carCard(c, i))
		end
		state.Selected = math.clamp(state.Selected, 1, #state.Cards)
		highlight()
	end

	local fetching = false
	refresh = function()
		if fetching or not alive then
			return
		end
		fetching = true
		local res = Net.Invoke("Vehicle", "List", {})
		fetching = false
		if not alive then
			return
		end
		if res.ok then
			state.List = res
			render(res)
		else
			render(nil)
		end
	end

	refreshBtn.Activated:Connect(function()
		task.spawn(refresh)
	end)
	despawnAll.Activated:Connect(function()
		task.spawn(function()
			act("Despawn", {}, "Car parked in your garage")
		end)
	end)

	-- live: data changes (fuel saves, purchases, tuning) refresh the list, debounced
	local pending = false
	local conn = ClientData.OnChanged("Vehicles", function()
		if pending or not alive then
			return
		end
		pending = true
		task.delay(0.8, function()
			pending = false
			if alive then
				refresh()
			end
		end)
	end)
	maid:Give(conn)

	-- gamepad controls
	local function selectedCar()
		local list = state.List
		return list and list.Cars and list.Cars[state.Selected] or nil
	end
	local function scrollTo()
		local card = state.Cards[state.Selected]
		if card then
			local y = card.AbsolutePosition.Y - scroll.AbsolutePosition.Y + scroll.CanvasPosition.Y
			Kit.Tween(scroll, { CanvasPosition = Vector2.new(0, math.max(0, y - 8)) }, Theme.Tween.Fast)
		end
		highlight()
	end
	ContextActionService:BindActionAtPriority("GarageNext", function(_, st)
		if st == Enum.UserInputState.Begin and #state.Cards > 0 then
			state.Selected = (state.Selected % #state.Cards) + 1
			scrollTo()
		end
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.ButtonR1)
	ContextActionService:BindActionAtPriority("GaragePrev", function(_, st)
		if st == Enum.UserInputState.Begin and #state.Cards > 0 then
			state.Selected = ((state.Selected - 2) % #state.Cards) + 1
			scrollTo()
		end
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.ButtonL1)
	ContextActionService:BindActionAtPriority("GarageSpawn", function(_, st)
		if st ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		local c = selectedCar()
		if c then
			task.spawn(function()
				if c.Active then
					act("Despawn", {}, "Car parked in your garage")
				else
					act("Spawn", { Uid = c.Uid }, ("%s is ready!"):format(c.Name))
				end
			end)
		end
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.ButtonX)
	ContextActionService:BindActionAtPriority("GarageCall", function(_, st)
		if st ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		local c = selectedCar()
		if c then
			task.spawn(function()
				local res = Net.Invoke("Vehicle", "Call", { Uid = c.Uid })
				if Router.Result(res) then
					Router.Notify(("🚗 %s is on its way…"):format(c.Name), "info", 3)
				end
			end)
		end
		return Enum.ContextActionResult.Sink
	end, false, PRIORITY, Enum.KeyCode.ButtonY)
	maid:Give(function()
		for _, name in ipairs({ "GarageNext", "GaragePrev", "GarageSpawn", "GarageCall" }) do
			ContextActionService:UnbindAction(name)
		end
	end)

	task.spawn(refresh)
end

return GaragePanel
