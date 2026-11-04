-- JobPanels: Router panels "JobOffer", "Jobs" (phone app list) and "RepairOffer".
--   JobPanels.Register(controller)

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Format = require(Shared.Util.Format)
local Config = require(Shared.Config.Jobs)

local Client = script.Parent.Parent.Parent
local UI = Client:WaitForChild("UI")
local Kit = require(UI:WaitForChild("Kit"))
local Theme = require(UI:WaitForChild("Theme"))
local Router = require(UI:WaitForChild("Router"))
local Registry = require(Client:WaitForChild("Registry"))

local JobPanels = {}

local function chip(parent: Instance, text: string, color: Color3, order: number)
	local c = Kit.new("TextLabel", {
		Text = text,
		Font = Theme.FontBold,
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.Text,
		BackgroundColor3 = color,
		BackgroundTransparency = 0.2,
		Size = UDim2.fromOffset(0, 26),
		AutomaticSize = Enum.AutomaticSize.X,
		LayoutOrder = order,
		Parent = parent,
	})
	Kit.Corner(c, UDim.new(1, 0))
	Kit.new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), Parent = c })
	return c
end

local function xpBar(parent: Instance, xp: number, need: number, order: number)
	local bar = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 8), BackgroundColor3 = Theme.Colors.Background, LayoutOrder = order, Parent = parent })
	Kit.Corner(bar, UDim.new(1, 0))
	local frac = need > 0 and math.clamp(xp / need, 0, 1) or 1
	local fill = Kit.new("Frame", { Size = UDim2.fromScale(0, 1), BackgroundColor3 = Theme.Colors.AccentAlt, Parent = bar })
	Kit.Corner(fill, UDim.new(1, 0))
	Kit.Tween(fill, { Size = UDim2.fromScale(frac, 1) })
	return bar
end

-- Phone GPS if the phone exists; otherwise our own local beam.
function JobPanels.SetWaypoint(controller, position: Vector3?, label: string)
	if not position then
		Router.Notify("That station isn't on the map yet.", "warning")
		return
	end
	local phone = Registry.Find("PhoneController")
	if phone and phone.SetWaypoint then
		local ok = pcall(phone.SetWaypoint, phone, position, label)
		if ok then
			Router.Notify("📍 GPS set: " .. label, "info", 3)
			return
		end
	end
	controller:SetStationWaypoint(position, label)
	Router.Notify("📍 GPS set: " .. label, "info", 3)
end

local function buildOffer(content: Frame, offer, ctx, controller)
	if type(offer) ~= "table" or not offer.Id then
		Kit.Label("Job info unavailable.", { Parent = content })
		return
	end
	local scroll = Kit.Scroll({ Parent = content }, 10)
	local cfg = Config.Jobs[offer.Id] or {}

	local top = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 64), BackgroundTransparency = 1, LayoutOrder = 1, Parent = scroll })
	local icon = Kit.new("TextLabel", {
		Text = offer.Icon or "💼",
		TextSize = 40,
		BackgroundColor3 = cfg.UniformColor or Theme.Colors.SurfaceAlt,
		Size = UDim2.fromOffset(64, 64),
		Parent = top,
	})
	Kit.Corner(icon, UDim.new(0, 16))
	Kit.Label(("<b>%s</b>"):format(offer.Name or offer.Id), {
		TextSize = Theme.TextSize.Heading,
		Position = UDim2.fromOffset(76, 4),
		Size = UDim2.new(1, -76, 0, 26),
		Parent = top,
	})
	Kit.Label(("Level %d  •  %s"):format(offer.Level or 1, offer.Title or ""), {
		TextColor3 = Theme.Colors.TextDim,
		Position = UDim2.fromOffset(76, 32),
		Size = UDim2.new(1, -76, 0, 22),
		Parent = top,
	})
	xpBar(scroll, offer.XP or 0, offer.XPNext or 0, 2)
	Kit.Label(
		offer.XPNext and offer.XPNext > 0 and ("%d / %d XP to next level  •  %d tasks done"):format(offer.XP or 0, offer.XPNext, offer.Tasks or 0)
			or ("Max level!  •  %d tasks done"):format(offer.Tasks or 0),
		{ TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 3, Parent = scroll }
	)
	Kit.Label(offer.Description or "", { LayoutOrder = 4, Parent = scroll })

	local pay = Kit.Card({ LayoutOrder = 5, Parent = scroll })
	Kit.List(pay, 4)
	Kit.Label(("💵 <b>%s</b> per task at your level"):format(Format.Money(offer.Pay or 0)), { TextColor3 = Theme.Colors.Money, LayoutOrder = 1, Parent = pay })
	if offer.NextPay then
		Kit.Label(("Next level: %s per task"):format(Format.Money(offer.NextPay)), { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 2, Parent = pay })
	end
	Kit.Label("Tips, bonuses and commissions can add a lot more!", { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 3, Parent = pay })

	local chips = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 26), BackgroundTransparency = 1, LayoutOrder = 6, Parent = scroll })
	Kit.List(chips, 6, true)
	local slots = offer.Slots or { Used = 0, Max = 0 }
	local full = slots.Used >= slots.Max
	chip(chips, ("👥 %d/%d workers"):format(slots.Used, slots.Max), full and Theme.Colors.Danger or Theme.Colors.SurfaceAlt, 1)
	if offer.Vip then
		chip(chips, "👑 VIP 2x pay", Theme.Colors.VIP, 2)
	end
	if offer.HasVehicle then
		chip(chips, "🚗 Job vehicle", Theme.Colors.SurfaceAlt, 3)
	end
	if offer.Queue then
		Kit.Label(("⏳ You're #%d in line for a shift."):format(offer.Queue), { TextColor3 = Theme.Colors.Warning, LayoutOrder = 7, Parent = scroll })
	elseif full and not offer.Current then
		Kit.Label(
			offer.Vip and "Full — but VIP can still clock in!" or "Full right now — clocking in will put you in line (VIP skips the queue).",
			{ TextColor3 = Theme.Colors.Warning, TextSize = Theme.TextSize.Small, LayoutOrder = 7, Parent = scroll }
		)
	end
	if offer.CurrentJob and not offer.Current then
		local other = Config.Jobs[offer.CurrentJob]
		Kit.Label(("You'll clock out of %s first."):format(other and other.Name or offer.CurrentJob), {
			TextColor3 = Theme.Colors.TextDim,
			TextSize = Theme.TextSize.Small,
			LayoutOrder = 8,
			Parent = scroll,
		})
	end

	local main
	if offer.Current then
		main = Kit.Button("⏹ Clock Out", "danger", function()
			if controller:ClockOut() then
				ctx.Close()
			end
		end, { LayoutOrder = 20, Parent = scroll })
	else
		main = Kit.Button("✅ Clock In", "success", function()
			if controller:ClockIn(offer.Id) then
				ctx.Close()
			end
		end, { LayoutOrder = 20, Parent = scroll })
		if offer.Queue then
			Kit.Button("Leave the line", "ghost", function()
				Net.Invoke("Jobs", "LeaveQueue", {})
				ctx.Close()
			end, { LayoutOrder = 21, Parent = scroll })
		end
	end
	Kit.Button("📍 GPS to station", "secondary", function()
		JobPanels.SetWaypoint(controller, offer.Station, (offer.Icon or "") .. " " .. (offer.Name or ""))
	end, { LayoutOrder = 22, Parent = scroll })
	if Kit.IsGamepad() then
		GuiService.SelectedObject = main
	end
end

local function buildList(content: Frame, data, ctx, controller)
	local loading = Kit.Label("Loading jobs...", { TextColor3 = Theme.Colors.TextDim, Parent = content })
	local res = data
	if type(res) ~= "table" or not res.Jobs then
		res = Net.Invoke("Jobs", "List", {})
	end
	if not content.Parent then
		return
	end
	loading:Destroy()
	if not res.ok and not res.Jobs then
		Kit.Label(res.err or "Couldn't load jobs.", { TextColor3 = Theme.Colors.Danger, Parent = content })
		return
	end
	local scroll = Kit.Scroll({ Parent = content }, 8)
	if res.Vip then
		chip(scroll, "👑 VIP: 2x job pay + skip the line", Theme.Colors.VIP, 0)
	end
	local first
	for i, job in ipairs(res.Jobs or {}) do
		local cfg = Config.Jobs[job.Id] or {}
		local row = Kit.Card({ LayoutOrder = i, Parent = scroll })
		Kit.Stroke(row, job.Current and Theme.Colors.Success or Theme.Colors.Stroke, job.Current and 2 or 1, 0.2)
		local icon = Kit.new("TextLabel", {
			Text = job.Icon or "💼",
			TextSize = 28,
			BackgroundColor3 = cfg.UniformColor or Theme.Colors.Surface,
			Size = UDim2.fromOffset(48, 48),
			Parent = row,
		})
		Kit.Corner(icon, UDim.new(0, 12))
		local slots = job.Slots or { Used = 0, Max = 0 }
		Kit.Label(
			("<b>%s</b>%s\nLv %d %s  •  <font color=\"#58D678\">%s</font>/task  •  👥 %d/%d"):format(
				job.Name or job.Id,
				job.Current and "  <font color=\"#34C778\">● ON DUTY</font>" or "",
				job.Level or 1,
				job.Title or "",
				Format.Money(job.Pay or 0),
				slots.Used,
				slots.Max
			),
			{ TextSize = Theme.TextSize.Small + 1, Position = UDim2.fromOffset(58, 0), Size = UDim2.new(1, -170, 0, 48), Parent = row }
		)
		local gps = Kit.Button("📍", "secondary", function()
			JobPanels.SetWaypoint(controller, job.Station, (job.Icon or "") .. " " .. (job.Name or ""))
		end, { Size = UDim2.fromOffset(48, 44), AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -56, 0.5, 0), Parent = row })
		Kit.Button("ℹ️", "primary", function()
			Router.Open("JobOffer", job)
		end, { Size = UDim2.fromOffset(48, 44), AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, 0, 0.5, 0), Parent = row })
		first = first or gps
	end
	Kit.Label("Visit a job station and press the prompt to clock in. 📍 sets GPS to the nearest station.", {
		TextSize = Theme.TextSize.Small,
		TextColor3 = Theme.Colors.TextDim,
		LayoutOrder = 100,
		Parent = scroll,
	})
	if first and Kit.IsGamepad() then
		GuiService.SelectedObject = first
	end
end

local function buildRepair(content: Frame, data, ctx)
	if type(data) ~= "table" or not data.OfferId then
		Kit.Label("This offer is no longer available.", { Parent = content })
		return
	end
	local decided = false
	local body = Kit.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = content })
	Kit.List(body, 10)
	Kit.Label(("🔧 <b>%s</b> offers to repair your car."):format(data.MechanicName or "A mechanic"), { TextSize = Theme.TextSize.Heading, LayoutOrder = 1, Parent = body })
	local card = Kit.Card({ LayoutOrder = 2, Parent = body })
	Kit.List(card, 4)
	Kit.Label(("🚗 %s"):format(tostring(data.Car or "Your car")), { LayoutOrder = 1, Parent = card })
	Kit.Label(("❤️ Condition: %d%%"):format(data.Health or 0), { LayoutOrder = 2, TextColor3 = (data.Health or 0) < 40 and Theme.Colors.Danger or Theme.Colors.Warning, Parent = card })
	Kit.Label(("💵 Fee: <b>%s</b> (wallet, then bank)"):format(Format.Money(data.Fee or 0)), { LayoutOrder = 3, TextColor3 = Theme.Colors.Money, Parent = card })
	local timer = Kit.Label("", { TextSize = Theme.TextSize.Small, TextColor3 = Theme.Colors.TextDim, LayoutOrder = 3, Parent = body })

	local row = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 4, Parent = body })
	Kit.Button("Decline", "secondary", function()
		decided = true
		Net.Invoke("Jobs", "DeclineRepair", { OfferId = data.OfferId })
		ctx.Close()
	end, { Size = UDim2.new(0.5, -6, 1, 0), Parent = row })
	local accept = Kit.Button("✅ Accept", "success", function()
		decided = true
		local res = Net.Invoke("Jobs", "AcceptRepair", { OfferId = data.OfferId })
		Router.Result(res)
		ctx.Close()
	end, { Size = UDim2.new(0.5, -6, 1, 0), Position = UDim2.new(0.5, 6, 0, 0), Parent = row })
	if Kit.IsGamepad() then
		GuiService.SelectedObject = accept
	end

	ctx.Maid:Give(task.spawn(function()
		while content.Parent do
			local left = (data.Expires or 0) - Workspace:GetServerTimeNow()
			if left <= 0 then
				decided = true
				ctx.Close()
				return
			end
			timer.Text = ("Offer expires in %ds"):format(math.ceil(left))
			task.wait(0.5)
		end
	end))

	return function()
		if not decided then
			task.spawn(Net.Invoke, "Jobs", "DeclineRepair", { OfferId = data.OfferId })
		end
	end
end

function JobPanels.Register(controller)
	Router.Register("JobOffer", {
		Title = "Job",
		Icon = "💼",
		Kind = "window",
		Size = Vector2.new(480, 560),
		Build = function(content, data, ctx)
			return buildOffer(content, data, ctx, controller)
		end,
	})
	Router.Register("Jobs", {
		Title = "Jobs",
		Icon = "💼",
		Kind = "window",
		Size = Vector2.new(560, 600),
		Build = function(content, data, ctx)
			task.spawn(buildList, content, data, ctx, controller)
		end,
	})
	Router.Register("RepairOffer", {
		Title = "Repair Offer",
		Icon = "🔧",
		Kind = "window",
		Size = Vector2.new(420, 380),
		Build = function(content, data, ctx)
			return buildRepair(content, data, ctx)
		end,
	})
end

return JobPanels
