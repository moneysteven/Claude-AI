-- StreetlightController: switches Streetlight-tagged lights on at night, locally (StreamingEnabled-safe).
--   * tracks tagged Models / BaseParts through CollectionService added/removed signals
--   * every light inside (PointLight / SpotLight / SurfaceLight) + parts named "Lamp*" (neon glow)
--   * staggered switching for a natural look; LowGraphics keeps only the nearest N lights casting light

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local World = require(Shared.Config.World)
local Ambient = require(Shared.Config.Ambient)

local Client = script.Parent.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))

local WorldClock = require(script.Parent:WaitForChild("WorldClock"))

local StreetlightController = {
	Name = "StreetlightController",
	Priority = 150,
}

local CFG = Ambient.Streetlights
local rng = Random.new()

type Entry = { Inst: Instance, Lights: { Light }, Lamps: { BasePart }, On: boolean, Lit: boolean, Pos: Vector3, Conn: RBXScriptConnection? }
local entries: { [Instance]: Entry } = {}
local night = false
local lowGraphics = false

local function collect(inst: Instance): Entry
	local lights, lamps = {}, {}
	local function scan(d: Instance)
		if d:IsA("Light") then
			table.insert(lights, d)
		elseif d:IsA("BasePart") and string.sub(d.Name, 1, 4) == "Lamp" then
			table.insert(lamps, d)
		end
	end
	scan(inst)
	for _, d in ipairs(inst:GetDescendants()) do
		scan(d)
	end
	local pos = Vector3.zero
	if inst:IsA("BasePart") then
		pos = inst.Position
	elseif inst:IsA("Model") then
		pos = inst:GetPivot().Position
	end
	return { Inst = inst, Lights = lights, Lamps = lamps, On = false, Lit = false, Pos = pos }
end

local function setLit(e: Entry, lit: boolean)
	if e.Lit == lit then
		return
	end
	e.Lit = lit
	for _, l in ipairs(e.Lights) do
		if l.Parent then
			l.Enabled = lit
		end
	end
end

local function setOn(e: Entry, on: boolean)
	if e.On == on then
		return
	end
	e.On = on
	for _, p in ipairs(e.Lamps) do
		if p.Parent then
			p.Material = on and Enum.Material.Neon or Enum.Material.SmoothPlastic
			p.Color = on and CFG.LampOn or CFG.LampOff
		end
	end
	if not on then
		setLit(e, false)
	end
end

local function add(inst: Instance)
	if entries[inst] then
		return
	end
	local e = collect(inst)
	entries[inst] = e
	-- a model may still be streaming in: rescan when descendants arrive
	e.Conn = inst.DescendantAdded:Connect(function(d)
		if d:IsA("Light") then
			table.insert(e.Lights, d)
			d.Enabled = e.Lit
		elseif d:IsA("BasePart") and string.sub(d.Name, 1, 4) == "Lamp" then
			table.insert(e.Lamps, d)
			if e.On then
				d.Material = Enum.Material.Neon
				d.Color = CFG.LampOn
			end
		end
	end)
	if night then
		setOn(e, true)
		setLit(e, not lowGraphics)
	end
end

local function remove(inst: Instance)
	local e = entries[inst]
	if e and e.Conn then
		e.Conn:Disconnect()
	end
	entries[inst] = nil
end

local function focus(): Vector3?
	local cam = Workspace.CurrentCamera
	return cam and cam.CFrame.Position or nil
end

local function update()
	local nowNight = WorldClock.IsNight()
	if nowNight ~= night then
		night = nowNight
		for _, e in pairs(entries) do
			task.delay(rng:NextNumber(0, CFG.ToggleStagger), function()
				if entries[e.Inst] then
					setOn(e, night)
					if night and not lowGraphics then
						setLit(e, true)
					end
				end
			end)
		end
	end
	if night and lowGraphics then
		local f = focus()
		if not f then
			return
		end
		local list = {}
		for _, e in pairs(entries) do
			table.insert(list, { e, (e.Pos - f).Magnitude })
		end
		table.sort(list, function(a, b)
			return a[2] < b[2]
		end)
		for i, item in ipairs(list) do
			setLit(item[1], i <= CFG.LowGraphicsMaxLit)
		end
	end
end

function StreetlightController:Start()
	local tag = World.Tags.Streetlight
	lowGraphics = ClientData.Get("Settings.LowGraphics") == true
	ClientData.OnChanged("Settings.LowGraphics", function(v)
		lowGraphics = v == true
		if night then
			for _, e in pairs(entries) do
				setLit(e, not lowGraphics)
			end
		end
	end)
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		add(inst)
	end
	CollectionService:GetInstanceAddedSignal(tag):Connect(add)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(remove)
	night = false
	update()
	task.spawn(function()
		while true do
			task.wait(CFG.CheckInterval)
			pcall(update)
		end
	end)
end

return StreetlightController
