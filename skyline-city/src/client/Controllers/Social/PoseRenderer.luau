-- PoseRenderer (Social helper): renders procedural poses on EVERY character whose model has attribute Pose
-- ("SitGround" | "Lay" | "Sleep" | "Salute"). The server sets the attribute; each client draws it locally by
-- overriding R15 Motor6D.Transform after the Animator runs (RunService.PreSimulation), so no animation assets
-- are needed and the pose looks the same for everyone. R6 / custom rigs are skipped gracefully.
--
--   PoseRenderer.Start()
--   PoseRenderer.Poses     -- the joint tables (tweak angles here)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local SocialConfig = require(Shared.Config.Social)

local PoseRenderer = {}

local rad = math.rad
local A = CFrame.Angles

-- Joint name -> Transform. Joints not listed keep their animation (e.g. legs keep walking while saluting),
-- unless the pose sets Full = true, in which case every listed-or-not core joint is reset to identity first.
PoseRenderer.Poses = {
	SitGround = {
		Full = true,
		Joints = {
			Root = CFrame.new(0, -1.95, 0) * A(rad(-4), 0, 0),
			LeftHip = A(rad(88), rad(-8), 0),
			RightHip = A(rad(88), rad(8), 0),
			LeftKnee = A(rad(-18), 0, 0),
			RightKnee = A(rad(-18), 0, 0),
			LeftShoulder = A(rad(14), 0, rad(-6)),
			RightShoulder = A(rad(14), 0, rad(6)),
			LeftElbow = A(rad(20), 0, 0),
			RightElbow = A(rad(20), 0, 0),
			Waist = A(rad(-6), 0, 0),
		},
	},
	Lay = {
		Full = true,
		Joints = {
			Root = CFrame.new(0, -2.45, 0) * A(rad(90), 0, 0),
			LeftShoulder = A(0, 0, rad(-8)),
			RightShoulder = A(0, 0, rad(8)),
			LeftHip = A(0, 0, rad(-3)),
			RightHip = A(0, 0, rad(3)),
			Neck = A(rad(-10), 0, 0),
		},
	},
	Sleep = { -- in a bed (the humanoid is seated; we flatten it)
		Full = true,
		Joints = {
			Root = CFrame.new(0, -0.35, 0.2) * A(rad(90), 0, 0),
			LeftShoulder = A(0, 0, rad(-6)),
			RightShoulder = A(0, 0, rad(6)),
			LeftHip = A(0, 0, 0),
			RightHip = A(0, 0, 0),
			LeftKnee = A(0, 0, 0),
			RightKnee = A(0, 0, 0),
			Neck = A(rad(-12), rad(10), 0),
		},
	},
	Salute = {
		Full = false,
		Joints = {
			RightShoulder = A(0, rad(30), 0) * A(0, 0, rad(92)),
			RightElbow = A(0, 0, rad(118)),
			RightWrist = A(0, 0, rad(-10)),
		},
	},
}

local CORE_JOINTS = {
	"Root",
	"Waist",
	"Neck",
	"LeftShoulder",
	"RightShoulder",
	"LeftElbow",
	"RightElbow",
	"LeftWrist",
	"RightWrist",
	"LeftHip",
	"RightHip",
	"LeftKnee",
	"RightKnee",
	"LeftAnkle",
	"RightAnkle",
}

type Entry = {
	character: Model,
	pose: string,
	joints: { [string]: Motor6D },
	blend: number,
}

local active: { [Model]: Entry } = {}
local watched: { [Model]: { RBXScriptConnection } } = {}
local stepConn: RBXScriptConnection? = nil

local function collectJoints(character: Model): { [string]: Motor6D }
	local out = {}
	for _, d in ipairs(character:GetDescendants()) do
		if d:IsA("Motor6D") then
			out[d.Name] = d
		end
	end
	return out
end

local function isR15(character: Model): boolean
	local hum = character:FindFirstChildOfClass("Humanoid")
	return hum ~= nil and hum.RigType == Enum.HumanoidRigType.R15
end

local step -- forward

local function ensureStep()
	if stepConn then
		return
	end
	stepConn = RunService.PreSimulation:Connect(function(dt)
		step(dt)
	end)
end

local function stopIfIdle()
	if stepConn and next(active) == nil then
		stepConn:Disconnect()
		stepConn = nil
	end
end

local function resetJoints(entry: Entry)
	for _, j in pairs(entry.joints) do
		if j.Parent then
			j.Transform = CFrame.identity
		end
	end
end

local function refresh(character: Model)
	local pose = character:GetAttribute("Pose")
	local def = type(pose) == "string" and PoseRenderer.Poses[pose] or nil
	local entry = active[character]
	if not def or not isR15(character) then
		if entry then
			active[character] = nil
			resetJoints(entry)
		end
		stopIfIdle()
		return
	end
	if entry then
		entry.pose = pose :: string
		entry.blend = 0
		entry.joints = collectJoints(character)
	else
		active[character] = { character = character, pose = pose :: string, joints = collectJoints(character), blend = 0 }
	end
	ensureStep()
end

step = function(dt: number)
	local cam = Workspace.CurrentCamera
	local camPos = cam and cam.CFrame.Position or Vector3.zero
	local maxDist = SocialConfig.PoseRenderDistance
	for character, entry in pairs(active) do
		if character.Parent == nil then
			active[character] = nil
		else
			local root = character:FindFirstChild("HumanoidRootPart")
			if root and root:IsA("BasePart") and (root.Position - camPos).Magnitude <= maxDist then
				local def = PoseRenderer.Poses[entry.pose]
				if def then
					entry.blend = math.min(1, entry.blend + dt * 6)
					local alpha = entry.blend
					if def.Full then
						for _, name in ipairs(CORE_JOINTS) do
							local j = entry.joints[name]
							if j and not def.Joints[name] then
								j.Transform = j.Transform:Lerp(CFrame.identity, alpha)
							end
						end
					end
					for name, cf in pairs(def.Joints) do
						local j = entry.joints[name]
						if j and j.Parent then
							j.Transform = j.Transform:Lerp(cf, alpha)
						end
					end
				end
			end
		end
	end
	stopIfIdle()
end

local function watchCharacter(character: Model)
	if watched[character] then
		return
	end
	local conns = {}
	watched[character] = conns
	table.insert(conns, character:GetAttributeChangedSignal("Pose"):Connect(function()
		refresh(character)
	end))
	-- streaming: limbs may arrive after the model; re-collect joints when Motor6Ds appear
	table.insert(conns, character.DescendantAdded:Connect(function(d)
		if d:IsA("Motor6D") then
			local entry = active[character]
			if entry then
				entry.joints = collectJoints(character)
			end
		end
	end))
	table.insert(conns, character.AncestryChanged:Connect(function(_, parent)
		if parent == nil then
			for _, c in ipairs(conns) do
				c:Disconnect()
			end
			watched[character] = nil
			active[character] = nil
		end
	end))
	refresh(character)
end

local function watchPlayer(player: Player)
	if player.Character then
		task.spawn(watchCharacter, player.Character)
	end
	player.CharacterAdded:Connect(watchCharacter)
end

function PoseRenderer.Start()
	for _, p in ipairs(Players:GetPlayers()) do
		watchPlayer(p)
	end
	Players.PlayerAdded:Connect(watchPlayer)
end

return PoseRenderer
