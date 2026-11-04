-- RealEstateController: the "RealEstate" panel (🏠 Homes HUD button, key H).
--   Tabs: 🏙️ Market (game homes) · 🏷️ Listings (players) · 🏠 My Homes · 🚪 Visit
--   The server can open it with NotifyService:OpenUI(player, "RealEstate", { Tab = "Market" }).
--
-- API (client): RealEstateController:Open(tab?)

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local UserInputService = game:GetService("UserInputService")

local Client = script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))
local Kit = require(Client.UI:WaitForChild("Kit"))
local Theme = require(Client.UI:WaitForChild("Theme"))

local RealEstateTabs = require(script.Parent.RealEstateTabs)

local RealEstateController = {
	Name = "RealEstateController",
	Priority = 70,
}

local TABS = {
	{ Id = "Market", Label = "🏙️ Market" },
	{ Id = "Listings", Label = "🏷️ Listings" },
	{ Id = "MyHomes", Label = "🏠 My Homes" },
	{ Id = "Visit", Label = "🚪 Visit" },
}

local lastTab = "MyHomes"

local function getState(force: boolean)
	local hc = Registry.Find("HousingController")
	if hc then
		return hc:GetState(force)
	end
	return nil
end

local function build(content: Frame, data, ctx)
	local view = (type(data) == "table" and type(data.Tab) == "string" and data.Tab) or lastTab
	local args = {}
	local token = 0

	local tabBar = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 48),
		BackgroundTransparency = 1,
		Parent = content,
	})
	Kit.List(tabBar, 6, true)
	local body = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 56),
		Size = UDim2.new(1, 0, 1, -56),
		BackgroundTransparency = 1,
		ClipsDescendants = true,
		Parent = content,
	})

	local tabButtons = {}
	local render

	local env = {}
	function env.Refresh()
		task.spawn(function()
			env.State = getState(true)
			render()
		end)
	end
	function env.Go(v: string, ...)
		view = v
		args = { ... }
		render()
	end

	function render()
		token += 1
		local my = token
		for _, child in ipairs(body:GetChildren()) do
			child:Destroy()
		end
		local tabId = view == "People" and "MyHomes" or view
		for id, b in pairs(tabButtons) do
			b.BackgroundColor3 = id == tabId and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
		end
		if view ~= "People" then
			lastTab = view
		end
		task.spawn(function()
			if my ~= token then
				return
			end
			local ok, err = pcall(function()
				if view == "Market" then
					RealEstateTabs.Market(body, env)
				elseif view == "Listings" then
					RealEstateTabs.Listings(body, env)
				elseif view == "Visit" then
					RealEstateTabs.Visit(body, env)
				elseif view == "People" then
					RealEstateTabs.People(body, env, args[1] or "", args[2] or "Roommates")
				else
					RealEstateTabs.MyHomes(body, env)
				end
			end)
			if not ok then
				warn("[RealEstateController]", err)
			end
		end)
	end

	for i, t in ipairs(TABS) do
		local b = Kit.Button(t.Label, "secondary", function()
			view = t.Id
			args = {}
			render()
		end, {
			Size = UDim2.new(0.25, -5, 1, -4),
			LayoutOrder = i,
			TextSize = Theme.TextSize.Small,
			Parent = tabBar,
		})
		tabButtons[t.Id] = b
	end

	env.State = getState(false)
	render()
	if Kit.IsGamepad() then
		GuiService.SelectedObject = tabButtons[view] or tabButtons.MyHomes
	end

	-- live refresh when housing data changes (keys, listings, purchases)
	local pending = false
	ctx.Maid:Give(ClientData.OnChanged("Housing", function()
		if pending then
			return
		end
		pending = true
		task.delay(0.4, function()
			pending = false
			if Router.IsOpen("RealEstate") and (view == "MyHomes" or view == "People" or view == "Market") then
				env.State = getState(true)
				render()
			end
		end)
	end))
	return nil
end

function RealEstateController:Open(tab: string?)
	Router.Open("RealEstate", { Tab = tab })
end

function RealEstateController:Init()
	Router.Register("RealEstate", {
		Title = "Homes & Real Estate",
		Icon = "🏠",
		Kind = "window",
		Size = Vector2.new(760, 600),
		Build = build,
	})
end

function RealEstateController:Start()
	Router.AddHudButton("Homes", "🏠", "Homes", 32, function()
		Router.Toggle("RealEstate", { Tab = lastTab })
	end)
	ContextActionService:BindAction("SkylineOpenHomes", function(_, state)
		if state ~= Enum.UserInputState.Begin or UserInputService:GetFocusedTextBox() then
			return Enum.ContextActionResult.Pass
		end
		local build = Registry.Find("BuildController")
		if build and build:IsActive() then
			return Enum.ContextActionResult.Pass
		end
		Router.Toggle("RealEstate", { Tab = lastTab })
		return Enum.ContextActionResult.Sink
	end, false, Enum.KeyCode.H)
end

return RealEstateController
