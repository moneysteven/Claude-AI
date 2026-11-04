-- BusinessController: client side of player businesses.
--
-- Panels (Router):
--   "Business"          dashboard for owners + "Start a Business" flow + "My Job"   data = { BizId? , LotId? }
--   "BusinessShop"      buy products at a player business register (opened by the server prompt)
--   "JobOfferBusiness"  accept / decline a job offer (opened by the server)
-- HUD: side-bar button "Business" (order 35), key M toggles the dashboard (N is the Garage; see docs/CONTROLS.md).
-- Also runs the cosmetic NPC customers (CustomerSim) and the employee work HUD (WorkHud).
--
-- API:
--   BusinessController:Open(bizId?)        open the dashboard (optionally on one business)
--   BusinessController:GetOwned() -> { [bizId] = record }   (read-only ClientData mirror)

local ContextActionService = game:GetService("ContextActionService")

local Client = script.Parent.Parent.Parent
local Registry = require(Client:WaitForChild("Registry"))
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))

local Dashboard = require(script.Parent.Dashboard)
local ShopPanels = require(script.Parent.ShopPanels)
local CustomerSim = require(script.Parent.CustomerSim)
local WorkHud = require(script.Parent.WorkHud)

local BusinessController = {
	Name = "BusinessController",
	Priority = 100,
}

local TOGGLE_ACTION = "SkylineToggleBusiness"
local TOGGLE_KEY = Enum.KeyCode.M -- N = Garage, so the dashboard uses M (driving sinks M for the gearbox)

local function buildActive(): boolean
	local build = Registry.Find("BuildController")
	if build and type(build.IsActive) == "function" then
		local ok, active = pcall(build.IsActive, build)
		return ok and active == true
	end
	return false
end

function BusinessController:Open(bizId: string?)
	if buildActive() then
		return
	end
	Router.Open("Business", bizId and { BizId = bizId } or nil)
end

function BusinessController:GetOwned()
	local b = ClientData.Get("Businesses")
	return type(b) == "table" and b or {}
end

function BusinessController:Init()
	Router.Register("Business", {
		Title = "Business",
		Icon = "🏪",
		Kind = "window",
		Size = Vector2.new(720, 620),
		Build = Dashboard.Build,
	})
	Router.Register("BusinessShop", {
		Title = "Shop",
		Icon = "🛒",
		Kind = "window",
		Size = Vector2.new(560, 520),
		Build = ShopPanels.BuildShop,
	})
	Router.Register("JobOfferBusiness", {
		Title = "Job Offer",
		Icon = "💼",
		Kind = "window",
		Size = Vector2.new(440, 360),
		Build = ShopPanels.BuildOffer,
	})
	Router.AddHudButton("Business", "🏪", "Business", 35, function()
		if Router.IsOpen("Business") then
			Router.Close("Business")
		else
			BusinessController:Open()
		end
	end)
end

function BusinessController:Start()
	ContextActionService:BindAction(TOGGLE_ACTION, function(_, state)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		if Router.IsOpen("Business") then
			Router.Close("Business")
		else
			BusinessController:Open()
		end
		return Enum.ContextActionResult.Sink
	end, false, TOGGLE_KEY)

	local okSim, errSim = pcall(CustomerSim.Start)
	if not okSim then
		warn("[BusinessController] customers failed to start:", errSim)
	end
	local okHud, errHud = pcall(WorkHud.Start)
	if not okHud then
		warn("[BusinessController] work HUD failed to start:", errHud)
	end
end

return BusinessController
