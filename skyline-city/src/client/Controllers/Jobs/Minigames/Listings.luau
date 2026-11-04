-- Real estate: pick which listing to show the client.

local Common = require(script.Parent.Common)
local Kit, Theme = Common.Kit, Common.Theme
local Format = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared").Util.Format)

local Listings = {}

function Listings.Build(body: Frame, data, mg)
	Common.Heading(body, data.Title or "Listings", 1)
	local card = Kit.Card({ LayoutOrder = 2, Parent = body })
	Kit.Label(data.Prompt or "", { Font = Theme.FontBold, Parent = card })
	Common.Sub(body, "Choose the home that matches what they want.", 3)

	local first
	for i, l in ipairs(data.Listings or {}) do
		local row = Kit.Card({ LayoutOrder = 10 + i, Parent = body })
		Kit.Label(("%s <b>%s</b>\n<font color=\"#58D678\">%s</font>  •  %d studs away"):format(l.Icon or "🏠", l.Tier or "?", Format.Money(l.Price or 0), l.Distance or 0), {
			Size = UDim2.new(1, -120, 0, 48),
			Parent = row,
		})
		local b = Kit.Button("Show", "primary", function()
			mg.Send({ Index = l.Index })
		end, { Size = UDim2.fromOffset(104, 44), AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, 0, 0.5, 0), Parent = row })
		first = first or b
	end
	Common.SelectFirst(first)
end

return Listings
