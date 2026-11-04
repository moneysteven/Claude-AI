-- Confetti (client helper): pooled 2D confetti bursts on any ScreenGui / Frame.
--
--   Confetti.Burst(parent, count?, colors?)   -- pieces fall + spin for ~3 s, then return to the pool
-- Respects the LowGraphics setting (LocalPlayer attribute) by spawning fewer pieces.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Pool = require(ReplicatedStorage:WaitForChild("Shared").Util.Pool)

local Confetti = {}

local DEFAULT_COLORS = {
	Color3.fromRGB(255, 90, 90),
	Color3.fromRGB(255, 200, 60),
	Color3.fromRGB(88, 214, 120),
	Color3.fromRGB(64, 156, 255),
	Color3.fromRGB(190, 110, 255),
	Color3.fromRGB(255, 255, 255),
}
local LIFETIME = 3.2
local GRAVITY = 0.55 -- screen heights per second^2

local pool = Pool.new(function()
	local f = Instance.new("Frame")
	f.BorderSizePixel = 0
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.ZIndex = 50
	return f
end, 40, 300)

type Piece = { frame: Frame, x: number, y: number, vx: number, vy: number, rot: number, vr: number, age: number, wobble: number }

local active: { Piece } = {}
local conn: RBXScriptConnection? = nil
local rng = Random.new()

local function step(dt: number)
	for i = #active, 1, -1 do
		local p = active[i]
		p.age += dt
		if p.age >= LIFETIME or not p.frame.Parent then
			pool:Release(p.frame)
			table.remove(active, i)
		else
			p.vy += GRAVITY * dt
			p.vx *= 0.985
			p.x += (p.vx + math.sin(p.age * 6 + p.wobble) * 0.04) * dt
			p.y += p.vy * dt
			p.rot += p.vr * dt
			p.frame.Position = UDim2.fromScale(p.x, p.y)
			p.frame.Rotation = p.rot
			local fade = math.clamp((LIFETIME - p.age) / 0.6, 0, 1)
			p.frame.BackgroundTransparency = 1 - fade
		end
	end
	if #active == 0 and conn then
		conn:Disconnect()
		conn = nil
	end
end

function Confetti.Burst(parent: Instance, count: number?, colors: { Color3 }?)
	local n = count or 90
	if Players.LocalPlayer:GetAttribute("LowGraphics") == true then
		n = math.max(12, math.floor(n * 0.3))
	end
	local palette = colors or DEFAULT_COLORS
	for _ = 1, n do
		local f = pool:Get() :: Frame
		local w = rng:NextInteger(6, 14)
		f.Size = UDim2.fromOffset(w, rng:NextInteger(4, 9))
		f.BackgroundColor3 = palette[rng:NextInteger(1, #palette)]
		f.BackgroundTransparency = 0
		f.Visible = true
		local fromLeft = rng:NextNumber() < 0.5
		local piece: Piece = {
			frame = f,
			x = fromLeft and rng:NextNumber(0.0, 0.15) or rng:NextNumber(0.85, 1.0),
			y = rng:NextNumber(0.55, 0.8),
			vx = (fromLeft and 1 or -1) * rng:NextNumber(0.15, 0.45),
			vy = -rng:NextNumber(0.55, 1.05),
			rot = rng:NextNumber(0, 360),
			vr = rng:NextNumber(-540, 540),
			age = rng:NextNumber(0, 0.15),
			wobble = rng:NextNumber(0, math.pi * 2),
		}
		f.Position = UDim2.fromScale(piece.x, piece.y)
		f.Parent = parent
		table.insert(active, piece)
	end
	if not conn then
		conn = RunService.RenderStepped:Connect(step)
	end
end

return Confetti
