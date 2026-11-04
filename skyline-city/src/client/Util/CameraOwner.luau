-- CameraOwner: arbitration for Workspace.CurrentCamera between the client systems that script it.
--
-- Several systems drive the camera (drive chase cam, build-mode camera, tuning orbit, phone selfie).
-- Only the CURRENT owner (highest priority; latest wins on a tie) may write CameraType / CFrame.
-- When the last owner releases, the camera is handed back to Roblox (CameraType Custom, subject = Humanoid).
--
--   CameraOwner.Acquire(id, priority)   claim the camera (re-acquiring updates the priority)
--   CameraOwner.Release(id)             give it up; restores the default camera when nobody else holds it
--   CameraOwner.Current() -> string?    id of the active owner
--   CameraOwner.IsMine(id) -> boolean   true when `id` is the active owner (per-frame updates check this)
--   CameraOwner.Changed : Signal(currentId?)
--
-- Priorities (higher wins): Drive 10 < Build 20 < Orbit (tuning) 30 < Selfie 40.
--
-- VR safety: while VRService.VREnabled is true nobody is ever granted ownership (Current() stays nil and
-- IsMine() is false), so no system switches the headset to a Scriptable camera — a scripted camera in VR
-- causes motion sickness and breaks head tracking. Claims are still recorded, so if VR turns off the
-- highest claim takes over again. CameraOwner.IsVR() lets systems adapt (e.g. skip camera-only effects).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local VRService = game:GetService("VRService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Signal = require(Shared.Util.Signal)

local CameraOwner = {}
CameraOwner.Changed = Signal.new()

CameraOwner.Priority = {
	Drive = 10,
	Build = 20,
	Orbit = 30,
	Selfie = 40,
}

type Claim = { Id: string, Priority: number, Seq: number }

local claims: { Claim } = {}
local seq = 0
local current: string? = nil

local function isVR(): boolean
	local ok, enabled = pcall(function()
		return VRService.VREnabled
	end)
	return ok and enabled == true
end

local function recompute()
	local best: Claim? = nil
	if isVR() then
		-- never hand a scripted camera to anyone in VR (see header)
		if current ~= nil then
			current = nil
			CameraOwner.Changed:Fire(nil)
		end
		return
	end
	for _, c in ipairs(claims) do
		if not best or c.Priority > best.Priority or (c.Priority == best.Priority and c.Seq > best.Seq) then
			best = c
		end
	end
	local id = best and best.Id or nil
	if id ~= current then
		current = id
		CameraOwner.Changed:Fire(id)
	end
end

local function indexOf(id: string): number?
	for i, c in ipairs(claims) do
		if c.Id == id then
			return i
		end
	end
	return nil
end

-- Hands the camera back to the default Roblox character camera.
function CameraOwner.RestoreDefault()
	local cam = Workspace.CurrentCamera
	if not cam then
		return
	end
	cam.CameraType = Enum.CameraType.Custom
	local char = Players.LocalPlayer.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum then
		cam.CameraSubject = hum
	end
end

function CameraOwner.Acquire(id: string, priority: number?)
	local p = priority or CameraOwner.Priority[id] or 0
	seq += 1
	local i = indexOf(id)
	if i then
		claims[i].Priority = p
		claims[i].Seq = seq
	else
		table.insert(claims, { Id = id, Priority = p, Seq = seq })
	end
	recompute()
end

-- Returns true when the default camera was restored (nobody else owns it).
function CameraOwner.Release(id: string): boolean
	local i = indexOf(id)
	if i then
		table.remove(claims, i)
	end
	recompute()
	if current == nil then
		CameraOwner.RestoreDefault()
		return true
	end
	return false
end

function CameraOwner.Current(): string?
	return current
end

function CameraOwner.IsMine(id: string): boolean
	return current == id
end

function CameraOwner.IsHeld(id: string): boolean
	return indexOf(id) ~= nil
end

function CameraOwner.IsVR(): boolean
	return isVR()
end

-- VR can be toggled at runtime (headset connected): re-arbitrate and hand back the default camera
VRService:GetPropertyChangedSignal("VREnabled"):Connect(function()
	local before = current
	recompute()
	if isVR() and before ~= nil then
		CameraOwner.RestoreDefault()
	end
end)

return CameraOwner
