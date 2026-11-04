-- RealEstateTabs (client helper): the tab bodies of the "RealEstate" panel.
--   RealEstateTabs.Market(body, env)    game-sold tiers (buy / rent)
--   RealEstateTabs.Listings(body, env)  player listings (buy / rent / unlist / end tenancy)
--   RealEstateTabs.MyHomes(body, env)   rental + owned houses management
--   RealEstateTabs.People(body, env, houseId, field)   roommate keys / builder permissions
--   RealEstateTabs.Visit(body, env)     visit players' homes in this server
-- env = { State = Housing.GetState result, Refresh = fn(), Go = fn(view, ...) }

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local HousingConfig = require(Shared.Config.Housing)
local EconomyConfig = require(Shared.Config.Economy)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))
local Kit = require(Client.UI:WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local RealEstateTabs = {}

local TIERS = HousingConfig.Tiers
local player = Players.LocalPlayer

---------------------------------------------------------------------------
-- Small UI helpers
---------------------------------------------------------------------------
-- Labels use RichText: escape anything a player typed (house names, display names) so it renders as text.
local function esc(text: any): string
	return (tostring(text or ""):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"))
end

local function card(parent: Instance, order: number): Frame
	local c = Kit.Card({ LayoutOrder = order, Parent = parent })
	Kit.List(c, 6)
	return c
end

local function row(parent: Instance, order: number): Frame
	local r = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = order,
		Parent = parent,
	})
	local list = Kit.List(r, 6, true)
	list.Wraps = true
	list.VerticalAlignment = Enum.VerticalAlignment.Top
	return r
end

local function button(parent: Instance, text: string, style: string, fn, width: number?)
	return Kit.Button(text, style, fn, {
		Size = UDim2.fromOffset(width or 150, 44),
		TextSize = Theme.TextSize.Small,
		Parent = parent,
	})
end

local function invoke(domain: string, action: string, payload, successText: string?): boolean
	local res = Net.Invoke(domain, action, payload or {})
	return Router.Result(res, successText)
end

local function tierLine(tier): string
	local parts = {
		("%dx%d plot"):format(tier.PlotSize.X, tier.PlotSize.Y),
		("%d floor%s"):format(tier.MaxFloors, tier.MaxFloors == 1 and "" or "s"),
		("%d items"):format(tier.BaseMaxItems),
		tier.District,
	}
	return table.concat(parts, " · ")
end

local function scroll(body: Instance): ScrollingFrame
	return Kit.Scroll({ Parent = body }, 10)
end

local function homeName(rec, tierId: string): string
	if rec and type(rec.Name) == "string" and rec.Name ~= "" then
		return rec.Name
	end
	local t = TIERS[tierId]
	return HousingConfig.Names.Default:format(player.DisplayName, t and t.Name or tierId)
end

---------------------------------------------------------------------------
-- Market
---------------------------------------------------------------------------
function RealEstateTabs.Market(body: Instance, env)
	local list = scroll(body)
	local housing = ClientData.Get("Housing") or {}
	local rented = type(housing.Rented) == "table" and housing.Rented or nil
	local state = env.State or {}
	Kit.Label(("You own %d/%d homes. Rent is charged every in-game week (wallet first, then bank)."):format(
		state.SlotsUsed or 0,
		state.SlotLimit or 1
	), { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small, LayoutOrder = 0, Parent = list })
	for i, tierId in ipairs(HousingConfig.TierOrder) do
		local tier = TIERS[tierId]
		if tier then
			local c = card(list, i)
			Kit.Label(("%s  <b>%s</b>"):format(tier.Icon or "🏠", tier.Name), { TextSize = Theme.TextSize.Heading, LayoutOrder = 1, Parent = c })
			Kit.Label(tier.Description or "", { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small, LayoutOrder = 2, Parent = c })
			Kit.Label(tierLine(tier), { TextSize = Theme.TextSize.Small, LayoutOrder = 3, Parent = c })
			if tier.RequiresPass then
				Kit.Label(state.HasExclusive and "👑 Exclusive Apartments pass: owned" or "👑 Requires the Exclusive Apartments pass", {
					TextColor3 = Theme.Colors.VIP,
					TextSize = Theme.TextSize.Small,
					LayoutOrder = 4,
					Parent = c,
				})
			end
			local r = row(c, 5)
			if rented and rented.TierId == tierId then
				Kit.Label("✅ You rent this", { Size = UDim2.fromOffset(150, 44), TextColor3 = Theme.Colors.Success, Parent = r })
			elseif (tier.Kind == "Rent" or tier.Kind == "Both") and tier.WeeklyRent > 0 then
				button(r, ("🔑 Rent %s/wk"):format(Format.MoneyShort(tier.WeeklyRent)), "secondary", function()
					local body2 = ("First week (%s) is charged now. Your current rental's furniture is sold back."):format(Format.Money(tier.WeeklyRent))
					if Router.Confirm("Rent a " .. tier.Name .. "?", body2, "Rent") then
						if invoke("Housing", "RentTier", { TierId = tierId }) then
							env.Refresh()
						end
					end
				end, 170)
			end
			if (tier.Kind == "Buy" or tier.Kind == "Both") and tier.BuyPrice > 0 then
				button(r, ("🏡 Buy %s"):format(Format.MoneyShort(tier.BuyPrice)), "primary", function()
					if Router.Confirm("Buy a " .. tier.Name .. "?", ("Price: %s (wallet, then bank)."):format(Format.Money(tier.BuyPrice)), "Buy") then
						if invoke("Housing", "BuyHouse", { TierId = tierId }) then
							env.Refresh()
						end
					end
				end, 170)
			end
		end
	end
end

---------------------------------------------------------------------------
-- Player listings
---------------------------------------------------------------------------
function RealEstateTabs.Listings(body: Instance, env)
	local list = scroll(body)
	local loading = Kit.Label("Loading listings…", { TextColor3 = Theme.Colors.TextDim, LayoutOrder = 0, Parent = list })
	local res = Net.Invoke("RealEstate", "GetListings", {})
	if not loading.Parent then
		return
	end
	loading:Destroy()
	if not res.ok then
		Kit.Label(res.err or "Couldn't load listings", { TextColor3 = Theme.Colors.Danger, Parent = list })
		return
	end
	local items = res.List or {}
	Kit.Label(("Players in this server selling or renting out their homes. Agency fee: %d%%."):format(math.floor((res.AgencyFee or 0.05) * 100)), {
		TextColor3 = Theme.Colors.TextDim,
		TextSize = Theme.TextSize.Small,
		LayoutOrder = 1,
		Parent = list,
	})
	if #items == 0 then
		Kit.Label("No player listings right now. List your own home from My Homes!", { LayoutOrder = 2, Parent = list })
		return
	end
	for i, l in ipairs(items) do
		local c = card(list, 10 + i)
		Kit.Label(("%s  <b>%s</b>"):format(l.Icon or "🏠", esc(l.HouseName)), { TextSize = Theme.TextSize.Heading, LayoutOrder = 1, Parent = c })
		Kit.Label(("%s · by %s · %d floor(s) · %d items · value %s"):format(
			l.TierName,
			esc(l.SellerName),
			l.Floors or 1,
			l.Items or 0,
			Format.MoneyShort(l.Value or 0)
		), { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small, LayoutOrder = 2, Parent = c })
		Kit.Label(l.Mode == "Rent" and ("🔑 For rent: <b>%s</b>/week"):format(Format.Money(l.Price)) or ("🏷️ For sale: <b>%s</b>"):format(Format.Money(l.Price)), {
			TextColor3 = Theme.Colors.Money,
			LayoutOrder = 3,
			Parent = c,
		})
		local r = row(c, 4)
		if l.Mine then
			button(r, "Unlist", "secondary", function()
				if invoke("RealEstate", "Unlist", { HouseId = l.HouseId }, "Listing removed") then
					env.Refresh()
				end
			end)
		elseif l.MyTenancy then
			button(r, "🚪 Move out", "danger", function()
				if invoke("RealEstate", "EndTenancy", { ListingId = l.Id }, "Tenancy ended") then
					env.Refresh()
				end
			end)
			button(r, "Visit", "secondary", function()
				invoke("Housing", "Visit", { UserId = l.SellerUserId })
			end)
		elseif l.Available == false then
			Kit.Label("Not available to rent right now", { Size = UDim2.fromOffset(220, 44), TextColor3 = Theme.Colors.TextDim, Parent = r })
		elseif l.Rented then
			Kit.Label("Already rented", { Size = UDim2.fromOffset(150, 44), TextColor3 = Theme.Colors.TextDim, Parent = r })
		elseif l.Mode == "Sale" then
			button(r, "🏡 Buy " .. Format.MoneyShort(l.Price), "primary", function()
				if Router.Confirm("Buy " .. l.HouseName .. "?", ("You'll pay %s. The house and everything built in it becomes yours."):format(Format.Money(l.Price)), "Buy") then
					if invoke("RealEstate", "BuyListing", { ListingId = l.Id, Price = l.Price }) then
						env.Refresh()
					end
				end
			end, 170)
		else
			button(r, "🔑 Rent " .. Format.MoneyShort(l.Price) .. "/wk", "primary", function()
				if Router.Confirm("Rent " .. l.HouseName .. "?", ("First week (%s) is charged now, then every in-game week. You get a key."):format(Format.Money(l.Price)), "Rent") then
					if invoke("RealEstate", "RentListing", { ListingId = l.Id, Price = l.Price }) then
						env.Refresh()
					end
				end
			end, 170)
		end
	end
end

---------------------------------------------------------------------------
-- My homes
---------------------------------------------------------------------------
local function peopleButtons(r: Instance, env, houseId: string)
	button(r, "🔑 Keys", "secondary", function()
		env.Go("People", houseId, "Roommates")
	end, 110)
	button(r, "🔨 Builders", "secondary", function()
		env.Go("People", houseId, "Builders")
	end, 110)
end

local function commonButtons(r: Instance, env, houseId: string, rec, isActive: boolean)
	if isActive then
		button(r, "🏠 Go home", "primary", function()
			invoke("Housing", "GoHome", {})
		end, 120)
	else
		button(r, "📦 Move in", "primary", function()
			if invoke("Housing", "SetActiveHouse", { HouseId = houseId }, "Moved in!") then
				env.Refresh()
			end
		end, 120)
	end
	local locked = rec.Locked == true
	button(r, locked and "🔓 Unlock" or "🔒 Lock", "secondary", function()
		if invoke("Housing", "LockDoors", { HouseId = houseId, Locked = not locked }) then
			env.Refresh()
		end
	end, 110)
	button(r, "✏️ Rename", "secondary", function()
		local name = Router.Prompt("Rename home", "My dream house", homeName(rec, rec.TierId))
		if name and name ~= "" then
			if invoke("Housing", "RenameHouse", { HouseId = houseId, Name = name }, "Renamed!") then
				env.Refresh()
			end
		end
	end, 110)
	peopleButtons(r, env, houseId)
end

local function listPrompt(houseId: string, rec, mode: string, env)
	local value = tonumber(rec.Value) or 0
	local ref = value
	if mode == "Rent" then
		ref = math.max(HousingConfig.RealEstate.MinReferenceRent, math.floor(value * HousingConfig.RealEstate.RentPerValuePerWeek))
	end
	local lo = math.max(1, math.floor(ref * HousingConfig.RealEstate.MinPriceFactor))
	local hi = math.floor(ref * HousingConfig.RealEstate.MaxPriceFactor)
	local text = Router.Prompt(
		("%s price (%s – %s)%s"):format(mode == "Rent" and "Weekly rent" or "Sale", Format.Money(lo), Format.Money(hi), mode == "Rent" and " /week" or ""),
		tostring(ref),
		tostring(ref)
	)
	if not text then
		return
	end
	local price = tonumber((text:gsub("[^%d]", "")))
	if not price then
		Router.Notify("Enter a number", "error")
		return
	end
	if invoke("RealEstate", "ListHouse", { HouseId = houseId, Mode = mode, Price = price }) then
		env.Refresh()
	end
end

function RealEstateTabs.MyHomes(body: Instance, env)
	local list = scroll(body)
	local housing = ClientData.Get("Housing") or {}
	local state = env.State or {}
	local active = state.Active and state.Active.HouseId or housing.ActiveHouseId or ""
	local order = 0
	local function nextOrder()
		order += 1
		return order
	end

	-- rental
	local rented = type(housing.Rented) == "table" and housing.Rented or nil
	if rented and TIERS[rented.TierId] then
		local tier = TIERS[rented.TierId]
		local c = card(list, nextOrder())
		Kit.Label(("%s  <b>%s</b>  <font color=\"#9aa0b8\">(rented)</font>%s"):format(
			tier.Icon or "🏠",
			esc(homeName(rented, rented.TierId)),
			active == "" and "  ⭐" or ""
		), { TextSize = Theme.TextSize.Heading, LayoutOrder = 1, Parent = c })
		Kit.Label(("%s · %s/week"):format(tier.Name, Format.Money(tier.WeeklyRent)), {
			TextColor3 = Theme.Colors.TextDim,
			TextSize = Theme.TextSize.Small,
			LayoutOrder = 2,
			Parent = c,
		})
		if (state.RentDue or 0) > 0 then
			Kit.Label(("⚠️ Overdue rent: <b>%s</b> — buying is blocked until you pay."):format(Format.Money(state.RentDue)), {
				TextColor3 = Theme.Colors.Warning,
				LayoutOrder = 3,
				Parent = c,
			})
		end
		local r = row(c, 4)
		commonButtons(r, env, "", rented, active == "")
		if (state.RentDue or 0) > 0 then
			button(r, "💵 Pay " .. Format.MoneyShort(state.RentDue), "success", function()
				if invoke("Housing", "PayRent", {}) then
					env.Refresh()
				end
			end, 130)
		end
		if (state.SlotsUsed or 0) > 0 then
			button(r, "Stop renting", "danger", function()
				if Router.Confirm("Stop renting?", "Furniture in your rental is sold back. You'll live in a home you own.", "Stop renting") then
					if invoke("Housing", "StopRenting", {}) then
						env.Refresh()
					end
				end
			end, 130)
		end
	end

	-- owned houses
	local owned = type(housing.Owned) == "table" and housing.Owned or {}
	local ids = {}
	for id, rec in pairs(owned) do
		if type(rec) == "table" then
			table.insert(ids, id)
		end
	end
	table.sort(ids)
	if #ids == 0 then
		Kit.Label("You don't own a home yet — check the Market tab!", { TextColor3 = Theme.Colors.TextDim, LayoutOrder = nextOrder(), Parent = list })
	end
	for _, id in ipairs(ids) do
		local rec = owned[id]
		local tier = TIERS[rec.TierId]
		if tier then
			local info = (state.Houses or {})[id] or {}
			local c = card(list, nextOrder())
			Kit.Label(("%s  <b>%s</b>%s"):format(tier.Icon or "🏠", esc(homeName(rec, rec.TierId)), active == id and "  ⭐" or ""), {
				TextSize = Theme.TextSize.Heading,
				LayoutOrder = 1,
				Parent = c,
			})
			Kit.Label(("%s · value %s · floors %d/%d · %d items"):format(
				tier.Name,
				Format.Money(tonumber(rec.Value) or 0),
				info.Floors or rec.Floors or 1,
				info.MaxFloors or tier.MaxFloors,
				info.Items or 0
			), { TextColor3 = Theme.Colors.TextDim, TextSize = Theme.TextSize.Small, LayoutOrder = 2, Parent = c })
			if type(rec.Listing) == "table" then
				Kit.Label(("🏷️ Listed for %s: %s%s"):format(
					rec.Listing.Mode == "Rent" and "rent" or "sale",
					Format.Money(rec.Listing.Price or 0),
					rec.Listing.Mode == "Rent" and "/week" or ""
				), { TextColor3 = Theme.Colors.Money, TextSize = Theme.TextSize.Small, LayoutOrder = 3, Parent = c })
			end
			local r = row(c, 4)
			commonButtons(r, env, id, rec, active == id)
			local r2 = row(c, 5)
			if (info.Floors or 1) < (info.MaxFloors or tier.MaxFloors) then
				button(r2, ("🏗️ Add floor %s"):format(Format.MoneyShort(info.FloorPrice or 0)), "secondary", function()
					if Router.Confirm("Add a floor?", ("Costs %s and adds to the home's value."):format(Format.Money(info.FloorPrice or 0)), "Build it") then
						if invoke("Housing", "AddFloor", { HouseId = id }) then
							env.Refresh()
						end
					end
				end, 160)
			end
			if type(rec.Listing) == "table" then
				button(r2, "Unlist", "secondary", function()
					if invoke("RealEstate", "Unlist", { HouseId = id }, "Listing removed") then
						env.Refresh()
					end
				end, 110)
			else
				button(r2, "🏷️ Sell to player", "secondary", function()
					listPrompt(id, rec, "Sale", env)
				end, 150)
				button(r2, "🔑 Rent out", "secondary", function()
					listPrompt(id, rec, "Rent", env)
				end, 120)
			end
			local sellPrice = info.SellPrice or math.floor((tonumber(rec.Value) or 0) * EconomyConfig.ResaleFraction)
			button(r2, ("💰 Sell %s"):format(Format.MoneyShort(sellPrice)), "danger", function()
				local msg = ("The city buys it for %s (%d%% of its value). Everything built in it is included. This can't be undone."):format(
					Format.Money(sellPrice),
					math.floor(EconomyConfig.ResaleFraction * 100)
				)
				if Router.Confirm("Sell " .. homeName(rec, rec.TierId) .. "?", msg, "Sell") then
					if invoke("Housing", "SellHouse", { HouseId = id }) then
						env.Refresh()
					end
				end
			end, 130)
		end
	end

	-- tenancies
	for _, t in ipairs(state.Tenancies or {}) do
		local c = card(list, nextOrder())
		if t.Role == "Tenant" then
			Kit.Label(("🔑 Renting <b>%s</b> from %s — %s/week"):format(esc(t.HouseName), esc(t.SellerName), Format.Money(t.Price)), { LayoutOrder = 1, Parent = c })
			local r = row(c, 2)
			button(r, "Visit", "primary", function()
				invoke("Housing", "Visit", { UserId = t.SellerUserId })
			end, 110)
			button(r, "🚪 Move out", "danger", function()
				if invoke("RealEstate", "EndTenancy", { ListingId = t.Id }, "Tenancy ended") then
					env.Refresh()
				end
			end, 130)
		else
			Kit.Label(("💰 %s rents your <b>%s</b> — %s/week"):format(esc(t.TenantName or "?"), esc(t.HouseName), Format.Money(t.Price)), { LayoutOrder = 1, Parent = c })
			local r = row(c, 2)
			button(r, "End tenancy", "danger", function()
				if invoke("RealEstate", "EndTenancy", { ListingId = t.Id }, "Tenancy ended") then
					env.Refresh()
				end
			end, 140)
		end
	end
end

---------------------------------------------------------------------------
-- Keys / builders
---------------------------------------------------------------------------
function RealEstateTabs.People(body: Instance, env, houseId: string, field: string)
	local list = scroll(body)
	local housing = ClientData.Get("Housing") or {}
	local rec = houseId == "" and housing.Rented or (housing.Owned or {})[houseId]
	if type(rec) ~= "table" then
		Kit.Label("That home no longer exists.", { Parent = list })
		return
	end
	local set = type(rec[field]) == "table" and rec[field] or {}
	local isKeys = field == "Roommates"
	local top = row(list, 0)
	button(top, "← Back", "ghost", function()
		env.Go("MyHomes")
	end, 100)
	Kit.Label(isKeys and "🔑 Roommates can enter even when locked and use your furniture."
		or "🔨 Builders can build in your home with their own money; items belong to your home.", {
		TextColor3 = Theme.Colors.TextDim,
		TextSize = Theme.TextSize.Small,
		LayoutOrder = 1,
		Parent = list,
	})
	local order = 10
	local names = (env.State and env.State.Names) or {}
	-- current holders (also players who left)
	for uid in pairs(set) do
		if not Players:GetPlayerByUserId(tonumber(uid) or 0) then
			order += 1
			local c = card(list, order)
			Kit.Label(("%s (offline)"):format(esc(names[uid] or ("User " .. uid))), { LayoutOrder = 1, Parent = c })
			local r = row(c, 2)
			button(r, "Remove", "danger", function()
				if invoke("Housing", isKeys and "RevokeKey" or "DisallowBuild", { HouseId = houseId, UserId = tonumber(uid) }) then
					env.Go("People", houseId, field)
				end
			end, 110)
		end
	end
	for _, p in ipairs(Players:GetPlayers()) do
		if p ~= player then
			order += 1
			local has = set[tostring(p.UserId)] == true
			local c = card(list, order)
			Kit.Label(("%s <font color=\"#9aa0b8\">@%s</font>%s"):format(esc(p.DisplayName), esc(p.Name), has and "  ✅" or ""), { LayoutOrder = 1, Parent = c })
			local r = row(c, 2)
			if has then
				button(r, isKeys and "Take key" or "Remove builder", "danger", function()
					if invoke("Housing", isKeys and "RevokeKey" or "DisallowBuild", { HouseId = houseId, UserId = p.UserId }) then
						env.Go("People", houseId, field)
					end
				end, 150)
			else
				button(r, isKeys and "Give key" or "Allow building", "success", function()
					if invoke("Housing", isKeys and "GiveKey" or "AllowBuild", { HouseId = houseId, UserId = p.UserId }) then
						env.Go("People", houseId, field)
					end
				end, 150)
			end
		end
	end
	if order == 10 then
		Kit.Label("Nobody else is in this server right now.", { LayoutOrder = 99, Parent = list })
	end
end

---------------------------------------------------------------------------
-- Visit
---------------------------------------------------------------------------
function RealEstateTabs.Visit(body: Instance, env)
	local list = scroll(body)
	local top = row(list, 0)
	button(top, "🏠 Go to my home", "primary", function()
		invoke("Housing", "GoHome", {})
	end, 180)
	local res = Net.Invoke("Housing", "GetVisitable", {})
	if not list.Parent then
		return
	end
	if not res.ok then
		Kit.Label(res.err or "Couldn't load homes", { TextColor3 = Theme.Colors.Danger, LayoutOrder = 1, Parent = list })
		return
	end
	local items = res.List or {}
	if #items == 0 then
		Kit.Label("No other homes in this server yet.", { TextColor3 = Theme.Colors.TextDim, LayoutOrder = 1, Parent = list })
	end
	for i, h in ipairs(items) do
		local c = card(list, 10 + i)
		local tier = TIERS[h.TierId]
		Kit.Label(("%s  <b>%s</b>"):format(tier and tier.Icon or "🏠", esc(h.HouseName)), { LayoutOrder = 1, Parent = c })
		Kit.Label(("%s · %s%s"):format(esc(h.Name), h.TierName, h.Locked and " · 🔒 locked" or ""), {
			TextColor3 = Theme.Colors.TextDim,
			TextSize = Theme.TextSize.Small,
			LayoutOrder = 2,
			Parent = c,
		})
		local r = row(c, 3)
		if h.CanEnter then
			button(r, h.HasKey and "🔑 Visit" or "🚪 Visit", "primary", function()
				if invoke("Housing", "Visit", { UserId = h.UserId }) then
					Router.Close("RealEstate")
				end
			end, 120)
		else
			Kit.Label("🔒 Locked", { Size = UDim2.fromOffset(120, 44), TextColor3 = Theme.Colors.TextDim, Parent = r })
		end
	end
end

return RealEstateTabs
