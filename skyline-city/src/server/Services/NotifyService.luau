-- NotifyService: toasts and server-driven UI opening.
--
--   Notify:Send(player, text, kind?, duration?)    kind: "info" | "success" | "error" | "money" | "warning"
--   Notify:SendAll(text, kind?, duration?)
--   Notify:OpenUI(player, panelName, data?)        opens a client panel registered with UI Router
--   Notify:CloseUI(player, panelName)
--
-- Client side these arrive on the "Notify" and "UI" events and are handled by the UI Router.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Net = require(ReplicatedStorage:WaitForChild("Shared").Net)

local NotifyService = {
	Name = "NotifyService",
	Priority = 1,
}

function NotifyService:Send(player: Player, text: string, kind: string?, duration: number?)
	Net.Fire(player, "Notify", { Text = text, Kind = kind or "info", Duration = duration or 4 })
end

function NotifyService:SendAll(text: string, kind: string?, duration: number?)
	Net.FireAll("Notify", { Text = text, Kind = kind or "info", Duration = duration or 5 })
end

function NotifyService:OpenUI(player: Player, panel: string, data: any?)
	Net.Fire(player, "UI", "Open", panel, data)
end

function NotifyService:CloseUI(player: Player, panel: string)
	Net.Fire(player, "UI", "Close", panel)
end

function NotifyService:Init()
	Net.Declare("Notify")
	Net.Declare("UI")
end

return NotifyService
