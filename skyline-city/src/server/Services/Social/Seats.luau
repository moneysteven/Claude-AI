-- Seats (SocialService helper): RPSeat-tagged seats (benches, sofas, beds) + the character "Pose" attribute.
--
--   Seats.Setup()                         ProximityPrompts on every RPSeat (StreamingEnabled-safe: server side)
--   Seats.Sit(player, seat, sleep?) -> (ok, err)
--   Seats.SetPose(player, pose) -> (ok, err)     pose = "" | Config.Social.Poses key (not "Sleep": that needs a bed)
--   Seats.TrackCharacter(character) -> Maid      clears Sleep when the humanoid leaves the seat
--
-- Seat attribute Pose = "Sit" | "Sleep" decides the prompt ("Sit" / "Sleep"). Sleeping sets the character
-- attribute Pose = "Sleep"; every client renders poses procedurally (Client/Controllers/Social/PoseRenderer).

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Maid = require(Shared.Util.Maid)
local World = require(Shared.Config.World)
local SocialConfig = require(Shared.Config.Social)

local Guard = require(ServerScriptService:WaitForChild("Server").Lib.Guard)

local CFG = SocialConfig.Seats
local TAG = World.Tags.Seat

local Seats = {}

local prompts: { [Instance]: any } = {}

local function aliveHumanoid(player: Player): Humanoid?
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum and hum.Health > 0 then
		return hum
	end
	return nil
end

function Seats.Sit(player: Player, seat: any, sleep: boolean?): (boolean, string?)
	if typeof(seat) ~= "Instance" or not seat:IsA("Seat") or not CollectionService:HasTag(seat, TAG) then
		return false, "That's not a seat"
	end
	if not seat:IsDescendantOf(Workspace) then
		return false, "That's not a seat"
	end
	if not Guard.Near(player, seat, CFG.UseDistance) then
		return false, "Get closer first"
	end
	if player:GetAttribute("InVehicle") == true then
		return false, "Get out of your vehicle first"
	end
	local hum = aliveHumanoid(player)
	if not hum then
		return false, "Spawn in first"
	end
	if seat.Occupant and seat.Occupant ~= hum then
		return false, "Someone is already there"
	end
	if seat.Disabled then
		return false, "You can't use that right now"
	end
	if hum.SeatPart and hum.SeatPart ~= seat then
		return false, "Stand up first"
	end
	local wantSleep = sleep == true or seat:GetAttribute("Pose") == "Sleep"
	if seat.Occupant ~= hum then
		seat:Sit(hum)
	end
	local char = player.Character
	if char then
		char:SetAttribute("Pose", wantSleep and "Sleep" or "")
	end
	return true, nil
end

function Seats.SetPose(player: Player, pose: string): (boolean, string?)
	local char = player.Character
	local hum = aliveHumanoid(player)
	if not char or not hum then
		return false, "Spawn in first"
	end
	if pose == "" then
		if char:GetAttribute("Pose") == "Sleep" and hum.SeatPart then
			return true, nil -- leaving a bed is done by jumping
		end
		char:SetAttribute("Pose", "")
		return true, nil
	end
	if not SocialConfig.Poses[pose] or pose == "Sleep" then
		return false, "Unknown pose"
	end
	if player:GetAttribute("InVehicle") == true or hum.SeatPart then
		return false, "You can't do that while seated"
	end
	char:SetAttribute("Pose", pose)
	return true, nil
end

function Seats.TrackCharacter(character: Model)
	local maid = Maid.new()
	local hum = character:WaitForChild("Humanoid", 10)
	if hum and hum:IsA("Humanoid") then
		maid:Give(hum:GetPropertyChangedSignal("SeatPart"):Connect(function()
			if hum.SeatPart == nil and character:GetAttribute("Pose") == "Sleep" then
				character:SetAttribute("Pose", "")
			end
		end))
		maid:Give(hum.Died:Connect(function()
			character:SetAttribute("Pose", "")
		end))
	end
	return maid
end

local function addSeat(inst: Instance)
	if prompts[inst] or not inst:IsA("Seat") then
		return
	end
	local sleep = inst:GetAttribute("Pose") == "Sleep"
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "SkylineSeatPrompt"
	prompt.ActionText = sleep and "Sleep" or "Sit"
	prompt.ObjectText = sleep and "Bed" or "Seat"
	prompt.MaxActivationDistance = CFG.PromptDistance
	prompt.HoldDuration = CFG.PromptHoldSeconds
	prompt.RequiresLineOfSight = false
	prompt.Exclusivity = Enum.ProximityPromptExclusivity.OneGlobally
	prompt.Enabled = inst.Occupant == nil
	prompt.Parent = inst
	local maid = Maid.new()
	maid:Give(prompt)
	maid:Give(prompt.Triggered:Connect(function(player: Player)
		Seats.Sit(player, inst, sleep)
	end))
	maid:Give(inst:GetPropertyChangedSignal("Occupant"):Connect(function()
		prompt.Enabled = inst.Occupant == nil
	end))
	maid:Give(inst:GetAttributeChangedSignal("Pose"):Connect(function()
		sleep = inst:GetAttribute("Pose") == "Sleep"
		prompt.ActionText = sleep and "Sleep" or "Sit"
		prompt.ObjectText = sleep and "Bed" or "Seat"
	end))
	prompts[inst] = { prompt = prompt, maid = maid }
end

local function removeSeat(inst: Instance)
	local entry = prompts[inst]
	if entry then
		prompts[inst] = nil
		entry.maid:Clean()
	end
end

function Seats.Setup()
	CollectionService:GetInstanceAddedSignal(TAG):Connect(addSeat)
	CollectionService:GetInstanceRemovedSignal(TAG):Connect(removeSeat)
	for _, inst in ipairs(CollectionService:GetTagged(TAG)) do
		addSeat(inst)
	end
end

return Seats
