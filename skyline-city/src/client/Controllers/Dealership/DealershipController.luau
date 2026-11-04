-- DealershipController: registers the "Dealership" window and the "TestDrive" countdown HUD.
-- The server opens both (counter / display prompts → "Dealership"; test drive start → "TestDrive").
--
-- API (client):
--   DealershipController:Open(focusModelId?)   open the showroom (optionally on one car)
--   DealershipController:IsTestDriving() -> boolean

local Client = script:FindFirstAncestor("Client") :: Instance
local UI = Client:WaitForChild("UI")
local Router = require(UI:WaitForChild("Router"))

local CatalogPanel = require(script.Parent:WaitForChild("CatalogPanel"))
local TestDriveHud = require(script.Parent:WaitForChild("TestDriveHud"))
local DisplayTurntable = require(script.Parent:WaitForChild("DisplayTurntable"))

local DealershipController = {
	Name = "DealershipController",
	Priority = 60,
}

function DealershipController:Open(focus: string?)
	Router.Open("Dealership", { Focus = focus })
end

function DealershipController:IsTestDriving(): boolean
	return Router.IsOpen("TestDrive")
end

function DealershipController:Init()
	Router.Register("Dealership", {
		Title = "Skyline Motors",
		Icon = "🚘",
		Kind = "window",
		Size = Vector2.new(960, 640),
		Build = function(content, data, ctx)
			CatalogPanel.Build(content, data, ctx)
		end,
	})
	Router.Register("TestDrive", {
		Title = "Test drive",
		Kind = "custom",
		Layer = "HUD",
		Build = function(root, data, ctx)
			TestDriveHud.Build(root, data, ctx)
		end,
	})
end

function DealershipController:Start()
	DisplayTurntable.Start()
end

return DealershipController
