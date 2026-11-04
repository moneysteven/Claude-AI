-- ShopPanels (client helper): the "BusinessShop" (buy from a player business at its register) and
-- "JobOfferBusiness" (accept / decline a job offer from a business owner) panel builders.
--   ShopPanels.BuildShop(content, data, ctx)    data = server shop data { Key, BizName, OwnerName, TypeId, Open, Products }
--   ShopPanels.BuildOffer(content, data, ctx)   data = { OfferId, BizName, TypeId, OwnerName, Role, Wage, ExpiresIn }

local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Businesses)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))
local Kit = require(Client.UI:WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local W = require(script.Parent.BizWidgets)

local ShopPanels = {}

local KIND_TEXT = {
	Food = "🍽️ Food · restores a little health",
	Drink = "🥤 Drink · restores a little health",
	Clothing = "👕 Clothing · added to your inventory",
	Item = "🎒 Item · added to your inventory",
	Service = "🧾 Service",
}

---------------------------------------------------------------------------
-- BusinessShop
---------------------------------------------------------------------------
function ShopPanels.BuildShop(content: Frame, data: any, ctx)
	if type(data) ~= "table" or type(data.Key) ~= "string" then
		ctx.Close()
		return
	end
	local alive = true
	local shop = data
	local t = Config.Types[shop.TypeId]

	local header = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 52),
		BackgroundTransparency = 1,
		Parent = content,
	})
	local title = Kit.Label("", {
		Size = UDim2.new(1, 0, 0, 26),
		AutomaticSize = Enum.AutomaticSize.None,
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Heading,
		Parent = header,
	})
	local cashLabel = Kit.Label("", {
		Position = UDim2.fromOffset(0, 28),
		Size = UDim2.new(1, 0, 0, 20),
		AutomaticSize = Enum.AutomaticSize.None,
		TextSize = Theme.TextSize.Small + 1,
		TextColor3 = Theme.Colors.TextDim,
		Parent = header,
	})
	local grid = Kit.Grid(UDim2.new(0.5, -4, 0, 150), {
		Position = UDim2.fromOffset(0, 60),
		Size = UDim2.new(1, 0, 1, -60),
		Parent = content,
	})
	local layout = grid:FindFirstChildOfClass("UIGridLayout")
	local function fit()
		if layout then
			local cols = grid.AbsoluteSize.X >= 520 and 3 or 2
			layout.CellSize = UDim2.new(1 / cols, -8, 0, 150)
		end
	end
	ctx.Maid:Give(grid:GetPropertyChangedSignal("AbsoluteSize"):Connect(fit))
	task.defer(fit)

	local render

	local function buy(product)
		local res = Net.Invoke("Business", "BuyProduct", { Key = shop.Key, ProductId = product.Id })
		if res.ok then
			Router.Notify(("%s Bought %s for %s"):format(res.Icon or product.Icon, res.Item or product.Name, Format.Money(res.Price or product.Price)), "money", 3)
		else
			Router.Notify(res.err or "Couldn't buy that", "error")
		end
		local fresh = Net.Invoke("Business", "GetShop", { Key = shop.Key })
		if not alive then
			return
		end
		if fresh.ok then
			shop = fresh
			render()
		elseif fresh.err then
			Router.Notify(fresh.err, "warning")
			ctx.Close()
		end
	end

	render = function()
		title.Text = ("%s %s"):format(t and t.Icon or "🏪", shop.BizName or "Shop")
		cashLabel.Text = ("by %s · %s · You have %s"):format(
			shop.OwnerName or "?",
			shop.Open and "🟢 Open" or "🔴 Closed",
			Format.Money(ClientData.Get("Cash") or 0)
		)
		W.Clear(grid)
		local first = nil
		for i, p in ipairs(shop.Products or {}) do
			local card = Kit.new("Frame", {
				BackgroundColor3 = Theme.Colors.SurfaceAlt,
				LayoutOrder = i,
				Parent = grid,
			})
			Kit.Corner(card, Theme.CornerSmall)
			Kit.Padding(card, 8)
			Kit.Label(p.Icon or "🛒", {
				Size = UDim2.new(1, 0, 0, 36),
				AutomaticSize = Enum.AutomaticSize.None,
				TextSize = 30,
				TextXAlignment = Enum.TextXAlignment.Center,
				Parent = card,
			})
			Kit.Label(("<b>%s</b>"):format(p.Name), {
				Position = UDim2.fromOffset(0, 38),
				Size = UDim2.new(1, 0, 0, 20),
				AutomaticSize = Enum.AutomaticSize.None,
				TextXAlignment = Enum.TextXAlignment.Center,
				TextTruncate = Enum.TextTruncate.AtEnd,
				TextSize = Theme.TextSize.Small + 1,
				Parent = card,
			})
			Kit.Label(KIND_TEXT[p.Kind] or "", {
				Position = UDim2.fromOffset(0, 58),
				Size = UDim2.new(1, 0, 0, 16),
				AutomaticSize = Enum.AutomaticSize.None,
				TextXAlignment = Enum.TextXAlignment.Center,
				TextTruncate = Enum.TextTruncate.AtEnd,
				TextSize = 11,
				TextColor3 = Theme.Colors.TextDim,
				Parent = card,
			})
			local b = Kit.Button(p.InStock and Format.Money(p.Price) or "Sold out", p.InStock and "success" or "ghost", function()
				if p.InStock then
					buy(p)
				end
			end, {
				AnchorPoint = Vector2.new(0, 1),
				Position = UDim2.fromScale(0, 1),
				Size = UDim2.new(1, 0, 0, 44),
				Parent = card,
			})
			first = first or b
		end
		if #(shop.Products or {}) == 0 then
			Kit.Label("Nothing for sale here.", { TextColor3 = Theme.Colors.TextDim, Parent = grid })
		end
		if first and Kit.IsGamepad() then
			GuiService.SelectedObject = first
		end
	end
	render()
	ctx.Maid:Give(ClientData.OnChanged("Cash", function()
		if alive then
			cashLabel.Text = ("by %s · %s · You have %s"):format(
				shop.OwnerName or "?",
				shop.Open and "🟢 Open" or "🔴 Closed",
				Format.Money(ClientData.Get("Cash") or 0)
			)
		end
	end))
	return function()
		alive = false
	end
end

---------------------------------------------------------------------------
-- JobOfferBusiness
---------------------------------------------------------------------------
function ShopPanels.BuildOffer(content: Frame, data: any, ctx)
	if type(data) ~= "table" or type(data.OfferId) ~= "string" then
		ctx.Close()
		return
	end
	local alive = true
	local t = Config.Types[data.TypeId]
	local role = Config.Roles[data.Role]
	local holder = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = content })
	Kit.List(holder, 10)
	Kit.Label(("%s <b>%s</b>"):format(t and t.Icon or "🏪", tostring(data.BizName)), {
		TextSize = Theme.TextSize.Heading,
		LayoutOrder = 1,
		Parent = holder,
	})
	Kit.Label(("%s wants to hire you as a <b>%s %s</b>."):format(tostring(data.OwnerName), role and role.Icon or "", role and role.Name or tostring(data.Role)), {
		LayoutOrder = 2,
		Parent = holder,
	})
	Kit.Label(("Wage: <font color=\"#58D678\"><b>%s per task</b></font>"):format(Format.Money(tonumber(data.Wage) or 0)), {
		LayoutOrder = 3,
		Parent = holder,
	})
	if role then
		local names = {}
		for _, fn in ipairs(role.Stations) do
			table.insert(names, Config.FunctionNames[fn] or fn)
		end
		Kit.Label(("You'll %s at: %s (every %ds while the business is open)."):format(role.TaskName:lower(), table.concat(names, ", "), role.TaskCooldown), {
			TextSize = Theme.TextSize.Small + 1,
			TextColor3 = Theme.Colors.TextDim,
			LayoutOrder = 4,
			Parent = holder,
		})
	end
	local timer = W.Progress(holder, 1, Theme.Colors.Accent, 5, 8)
	local row = W.Row(holder, 6)
	W.Button(row, "Decline", "secondary", function()
		Net.Invoke("Business", "DeclineJob", { OfferId = data.OfferId })
		ctx.Close()
	end, 140)
	local accept = W.Button(row, "Accept job", "success", function()
		local res = Net.Invoke("Business", "AcceptJob", { OfferId = data.OfferId })
		Router.Result(res)
		ctx.Close()
	end, 180)
	if Kit.IsGamepad() then
		GuiService.SelectedObject = accept
	end
	local total = math.max(1, tonumber(data.ExpiresIn) or Config.PlayerWork.OfferExpireSeconds)
	local started = os.clock()
	ctx.Maid:Give(task.spawn(function()
		while alive do
			local left = total - (os.clock() - started)
			timer.Set(left / total)
			if left <= 0 then
				Router.Notify("The job offer expired", "info")
				ctx.Close()
				return
			end
			task.wait(0.5)
		end
	end))
	return function()
		alive = false
	end
end

return ShopPanels
