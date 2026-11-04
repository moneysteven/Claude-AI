-- Mechanic diagnosis: read the symptoms, select the matching parts, then replace them.

local Common = require(script.Parent.Common)
local Kit, Theme = Common.Kit, Common.Theme

local Parts = {}

function Parts.Build(body: Frame, data, mg)
	local need = data.Need or 2
	local selected: { [string]: boolean } = {}

	Common.Heading(body, "🔧 Diagnose the car", 1)
	local card = Kit.Card({ LayoutOrder = 2, Parent = body })
	Kit.List(card, 4)
	Kit.Label("<b>Customer says:</b>", { TextColor3 = Theme.Colors.TextDim, LayoutOrder = 0, Parent = card })
	for i, s in ipairs(data.Symptoms or {}) do
		Kit.Label("• " .. s, { LayoutOrder = i, Parent = card })
	end

	local status = Kit.Label(("Select %d part(s)"):format(need), {
		TextXAlignment = Enum.TextXAlignment.Center,
		Font = Theme.FontBold,
		LayoutOrder = 3,
		Parent = body,
	})

	local grid = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 4, Parent = body })
	Kit.new("UIGridLayout", {
		CellSize = UDim2.new(0.5, -5, 0, 48),
		CellPadding = UDim2.fromOffset(10, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = grid,
	})

	local function count(): number
		local n = 0
		for _, v in pairs(selected) do
			if v then
				n += 1
			end
		end
		return n
	end

	local first
	for i, p in ipairs(data.Parts or {}) do
		local b
		b = Kit.Button(("%s %s"):format(p.Icon or "", p.Name or p.Id), "secondary", function()
			selected[p.Id] = not selected[p.Id]
			b.BackgroundColor3 = selected[p.Id] and Theme.Colors.Accent or Theme.Colors.SurfaceAlt
			status.Text = ("Selected %d / %d"):format(count(), need)
		end, { LayoutOrder = i, TextSize = Theme.TextSize.Small + 1, Parent = grid })
		first = first or b
	end
	Common.SelectFirst(first)

	Kit.Button("🛠️ Replace Parts", "success", function()
		local list = {}
		for id, v in pairs(selected) do
			if v then
				table.insert(list, id)
			end
		end
		if #list == 0 then
			mg.Notify("Select the faulty parts first", "warning")
			return
		end
		local res = mg.Send({ Parts = list })
		if not res.ok then
			Common.Shake(grid)
		end
	end, { LayoutOrder = 10, Parent = body })
end

return Parts
