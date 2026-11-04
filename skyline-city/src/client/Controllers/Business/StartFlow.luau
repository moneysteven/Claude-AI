-- StartFlow (client helper): the "Start a Business" view inside the Business panel.
--   StartFlow.Render(body, opts)
--     opts = { PreselectLot = lotId?, Owned = number, Max = number, OnBought = fn(bizId), Alive = fn() -> bool }
-- Lists business types; picking one lists free compatible lots (distance + 📍 GPS + Buy).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Businesses)
local EconomyConfig = require(Shared.Config.Economy)

local Client = script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))
local Kit = require(Client.UI:WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local W = require(script.Parent.BizWidgets)

local StartFlow = {}

local player = Players.LocalPlayer

local function distanceTo(pos: Vector3?): number?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if not root or typeof(pos) ~= "Vector3" then
		return nil
	end
	return ((root :: BasePart).Position - pos).Magnitude
end

local function setGps(pos: Vector3, label: string)
	local phone = Registry.Find("PhoneController")
	if phone and type(phone.SetWaypoint) == "function" then
		local ok = pcall(phone.SetWaypoint, phone, pos, label)
		if ok then
			Router.Notify("📍 GPS set to " .. label, "info", 3)
			return
		end
	end
	Router.Notify("GPS isn't available right now", "warning")
end

local function requiredText(t): string
	local parts = {}
	for fn, c in pairs(t.Required) do
		table.insert(parts, ("%s×%d"):format(Config.FunctionNames[fn] or fn, c))
	end
	table.sort(parts)
	return table.concat(parts, "  ")
end

function StartFlow.Render(body: ScrollingFrame, opts)
	W.Clear(body)
	local alive = opts.Alive or function()
		return true
	end
	local selectedType: string? = nil
	local lots = nil
	local lotsHolder: Frame

	local head = W.Section(body, "🚀 Start a Business", 1)
	W.Text(head, ("Own up to %d businesses. They earn while you're online and open — decorate them in build mode, stock up, hire staff and collect the vault."):format(opts.Max or Config.General.MaxPerPlayer), 1, {
		TextColor3 = Theme.Colors.TextDim,
		TextSize = Theme.TextSize.Small + 1,
	})
	if (opts.Owned or 0) >= (opts.Max or Config.General.MaxPerPlayer) then
		W.Text(head, "⚠️ You already own the maximum number of businesses. Sell one to start another.", 2, { TextColor3 = Theme.Colors.Warning })
		return
	end

	local renderLots

	local typesCard = W.Section(body, "1. Choose a type", 2)
	local cards = {}
	for i, typeId in ipairs(Config.TypeOrder) do
		local t = Config.Types[typeId]
		local card = Kit.new("Frame", {
			Size = UDim2.new(1, 0, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundColor3 = Theme.Colors.Surface,
			LayoutOrder = i,
			Parent = typesCard,
		})
		Kit.Corner(card, Theme.CornerSmall)
		Kit.Padding(card, 10)
		local stroke = Kit.Stroke(card, t.Color, 2, 1)
		Kit.List(card, 4)
		W.Text(card, ("%s  <b>%s</b>   <font color=\"#58D678\">%s</font>"):format(t.Icon, t.Name, Format.Money(t.LotPrice)), 1, {
			TextSize = Theme.TextSize.Body + 1,
		})
		W.Text(card, t.Blurb, 2, { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small + 1 })
		W.Text(card, "Needs: " .. requiredText(t), 3, { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small })
		local row = W.Flow(card, 4)
		W.Button(row, "Choose", "primary", function()
			selectedType = typeId
			for id, c in pairs(cards) do
				Kit.Tween(c, { Transparency = id == typeId and 0 or 1 }, Theme.Tween.Fast)
			end
			renderLots()
		end, 140)
		cards[typeId] = stroke
	end

	local lotsCard = W.Section(body, "2. Pick a lot", 3)
	lotsHolder = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = 1,
		Parent = lotsCard,
	})
	Kit.List(lotsHolder, 6)

	renderLots = function()
		W.Clear(lotsHolder)
		if not lots then
			W.Text(lotsHolder, "Loading lots…", 1, { TextColor3 = Theme.Colors.TextDim })
			return
		end
		if not selectedType then
			W.Text(lotsHolder, "Choose a business type above to see the lots it fits on.", 1, { TextColor3 = Theme.Colors.TextDim })
			return
		end
		local t = Config.Types[selectedType]
		local list = {}
		for _, lot in ipairs(lots) do
			if table.find(lot.Allowed, selectedType) then
				table.insert(list, lot)
			end
		end
		table.sort(list, function(a, b)
			if a.LotId == opts.PreselectLot then
				return true
			elseif b.LotId == opts.PreselectLot then
				return false
			end
			if a.Free ~= b.Free then
				return a.Free
			end
			return (distanceTo(a.Position) or 1e9) < (distanceTo(b.Position) or 1e9)
		end)
		if #list == 0 then
			W.Text(lotsHolder, ("No lots in this server allow a %s."):format(t.Name), 1, { TextColor3 = Theme.Colors.Warning })
			return
		end
		for i, lot in ipairs(list) do
			local row = Kit.new("Frame", {
				Size = UDim2.new(1, 0, 0, 0),
				AutomaticSize = Enum.AutomaticSize.Y,
				BackgroundColor3 = Theme.Colors.Surface,
				LayoutOrder = i,
				Parent = lotsHolder,
			})
			Kit.Corner(row, Theme.CornerSmall)
			Kit.Padding(row, 8)
			Kit.List(row, 6)
			local d = distanceTo(lot.Position)
			local where = d and ("%d studs away"):format(math.floor(d)) or ""
			local title = ("📍 Lot <b>%s</b> · %dx%d · %s"):format(lot.LotId, math.floor(lot.Size.X), math.floor(lot.Size.Y), where)
			if lot.LotId == opts.PreselectLot then
				title = "⭐ " .. title
			end
			W.Text(row, title, 1)
			if not lot.Free then
				local tt = lot.TypeId and Config.Types[lot.TypeId]
				W.Text(row, ("Taken — %s %s by %s"):format(tt and tt.Icon or "🏪", lot.BizName or "Business", lot.OwnerName or "?"), 2, {
					TextColor3 = Theme.Colors.TextDim,
					TextSize = Theme.TextSize.Small + 1,
				})
			end
			local buttons = W.Flow(row, 3)
			W.Button(buttons, "📍 GPS", "secondary", function()
				setGps(lot.Position, "Lot " .. lot.LotId)
			end, 110)
			if lot.Free then
				local cash = ClientData.Get("Cash") or 0
				W.Button(buttons, ("Buy %s"):format(Format.Money(t.LotPrice)), cash >= t.LotPrice and "success" or "ghost", function()
					if not Router.Confirm(
						("Buy a %s?"):format(t.Name),
						("Lot %s for %s cash. You can decorate it in build mode and sell it back later for %d%% of its value."):format(lot.LotId, Format.Money(t.LotPrice), math.floor(EconomyConfig.ResaleFraction * 100 + 0.5)),
						"Buy"
					) then
						return
					end
					local res = Net.Invoke("Business", "BuyLot", { LotId = lot.LotId, TypeId = selectedType })
					if Router.Result(res) and opts.OnBought then
						opts.OnBought(res.BizId)
					end
				end, 180)
			end
		end
	end
	renderLots()

	task.spawn(function()
		local res = Net.Invoke("Business", "GetLots", {})
		if not alive() then
			return
		end
		if res.ok then
			lots = res.Lots
			if opts.PreselectLot then
				for _, lot in ipairs(lots) do
					if lot.LotId == opts.PreselectLot then
						for _, id in ipairs(Config.TypeOrder) do
							if table.find(lot.Allowed, id) then
								selectedType = selectedType or id
							end
						end
						if selectedType and cards[selectedType] then
							cards[selectedType].Transparency = 0
						end
					end
				end
			end
		else
			lots = {}
			Router.Notify(res.err or "Couldn't load lots", "error")
		end
		renderLots()
	end)
end

return StartFlow
