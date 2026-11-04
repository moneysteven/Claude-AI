-- Stations (server helper): built furniture inside a business (counted by `Function` attribute) and the
-- server-side ProximityPrompts on shop stations (registers / bars / desks) so customers can buy.
--
--   Stations.Watch(biz, onPrompt)       attaches prompts to shop stations now and whenever BuildService (re)creates
--                                       items in biz.BuildFolder. onPrompt(player, biz, model). Cleaned via biz.Maid.
--   Stations.Scan(biz)                  recounts biz.Stations ({ [Function] = n }) and biz.DecorCount
--   Stations.Missing(biz) -> { {Function, Have, Need} }   required stations not built yet
--   Stations.Models(biz, fn) -> { Model }
--   Stations.NearAny(player, biz, functions, dist) -> Model?   nearest matching built item within dist

local Guard = require(game:GetService("ServerScriptService").Server.Lib.Guard)
local BizState = require(script.Parent.BizState)

local Config = BizState.Config

local Stations = {}

local function models(biz): { Model }
	local out = {}
	local folder = biz.BuildFolder
	if not folder or not folder.Parent then
		return out
	end
	for _, m in ipairs(folder:GetChildren()) do
		if m:IsA("Model") then
			table.insert(out, m)
		end
	end
	return out
end

function Stations.Models(biz, fn: string): { Model }
	local out = {}
	for _, m in ipairs(models(biz)) do
		if m:GetAttribute("Function") == fn then
			table.insert(out, m)
		end
	end
	return out
end

function Stations.Scan(biz)
	local counts = {}
	local decor = 0
	for _, m in ipairs(models(biz)) do
		local fn = m:GetAttribute("Function")
		if type(fn) == "string" then
			counts[fn] = (counts[fn] or 0) + 1
			if Config.Decor.Functions[fn] and m:GetAttribute("Category") ~= "Structure" then
				decor += 1
			end
		end
	end
	biz.Stations = counts
	biz.DecorCount = decor
	return counts
end

function Stations.Missing(biz): { { Function: string, Have: number, Need: number } }
	local t = Config.Types[biz.TypeId]
	local out = {}
	if not t then
		return out
	end
	local counts = biz.Stations or Stations.Scan(biz)
	for fn, need in pairs(t.Required) do
		local have = counts[fn] or 0
		if have < need then
			table.insert(out, { Function = fn, Have = have, Need = need })
		end
	end
	table.sort(out, function(a, b)
		return a.Function < b.Function
	end)
	return out
end

function Stations.NearAny(player: Player, biz, functions: { string }, dist: number): Model?
	local set = {}
	for _, fn in ipairs(functions) do
		set[fn] = true
	end
	local pos = Guard.RootPosition(player)
	if not pos then
		return nil
	end
	local best, bestD = nil, dist
	for _, m in ipairs(models(biz)) do
		local fn = m:GetAttribute("Function")
		if fn and set[fn] then
			local d = (m:GetPivot().Position - pos).Magnitude
			if d <= bestD then
				best, bestD = m, d
			end
		end
	end
	return best
end

local function promptPart(model: Model): BasePart?
	local best: BasePart? = nil
	local bestVol = -1
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			local v = d.Size.X * d.Size.Y * d.Size.Z
			if v > bestVol then
				best, bestVol = d, v
			end
		end
	end
	return best
end

local function attach(biz, model: Instance, onPrompt)
	if not model:IsA("Model") then
		return
	end
	local t = Config.Types[biz.TypeId]
	local fn = model:GetAttribute("Function")
	if not t or type(fn) ~= "string" or not table.find(t.ShopFunctions, fn) then
		return
	end
	local part = promptPart(model)
	if not part or part:FindFirstChild("BizShopPrompt") then
		return
	end
	local rec = BizState.RecOf(biz)
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "BizShopPrompt"
	prompt.ActionText = "Shop"
	prompt.ObjectText = BizState.DisplayName(rec, biz.Owner)
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = Config.General.PromptDistance
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = part
	prompt.Triggered:Connect(function(player)
		onPrompt(player, biz, model)
	end)
end

-- Rename the prompts after the business name changes.
function Stations.RefreshPrompts(biz)
	local rec = BizState.RecOf(biz)
	local name = BizState.DisplayName(rec, biz.Owner)
	local folder = biz.BuildFolder
	if not folder then
		return
	end
	for _, d in ipairs(folder:GetDescendants()) do
		if d:IsA("ProximityPrompt") and d.Name == "BizShopPrompt" then
			d.ObjectText = name
		end
	end
end

function Stations.Watch(biz, onPrompt)
	local folder = biz.BuildFolder
	if not folder then
		return
	end
	for _, m in ipairs(folder:GetChildren()) do
		attach(biz, m, onPrompt)
	end
	local queued = false
	biz.Maid:Give(folder.ChildAdded:Connect(function(m)
		-- BuildService sets attributes before parenting, but defer anyway so the model is complete
		task.defer(function()
			if m.Parent == folder then
				attach(biz, m, onPrompt)
			end
		end)
		if not queued then
			queued = true
			task.delay(0.5, function()
				queued = false
				Stations.Scan(biz)
			end)
		end
	end))
	biz.Maid:Give(folder.ChildRemoved:Connect(function()
		if not queued then
			queued = true
			task.delay(0.5, function()
				queued = false
				Stations.Scan(biz)
			end)
		end
	end))
	Stations.Scan(biz)
end

return Stations
