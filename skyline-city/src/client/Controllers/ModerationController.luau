-- ModerationController: interacting with other players + local mute.
--
--   * Client-side ProximityPrompt "Interact" on every OTHER player's character (key T / gamepad D-pad up, see Config.Social.Interact) opens
--     the "PlayerActions" window: profile, message, call, add contact, invite to group, mute, block, report.
--     StreamingEnabled-safe: prompts are added when the character's HumanoidRootPart streams in.
--   * Mute is client-local (hides their chat, DMs, feed posts and calls for this session).
--
-- API (client):
--   ModerationController:OpenPlayer(userId)
--   ModerationController:IsMuted(userId) -> boolean
--   ModerationController:SetMuted(userId, muted)
--   ModerationController:IsBlocked(userId) -> boolean        (saved block list, Social.Blocked)
--   ModerationController.MuteChanged : Signal(userId, muted)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Signal = require(Shared.Util.Signal)
local Maid = require(Shared.Util.Maid)
local SocialConfig = require(Shared.Config.Social)

local Client = script.Parent.Parent
local ClientData = require(Client:WaitForChild("ClientData"))
local Router = require(Client:WaitForChild("UI"):WaitForChild("Router"))

local PlayerActionsPanel = require(script.Parent:WaitForChild("Social"):WaitForChild("PlayerActionsPanel"))

local ModerationController = {
	Name = "ModerationController",
	Priority = 20,
}
ModerationController.MuteChanged = Signal.new()

local PANEL = "PlayerActions"
local CFG = SocialConfig.Interact
local localPlayer = Players.LocalPlayer

local muted: { [number]: boolean } = {}
local playerMaids: { [Player]: any } = {}

---------------------------------------------------------------------------
-- API
---------------------------------------------------------------------------
function ModerationController:IsMuted(userId: number): boolean
	return muted[userId] == true
end

function ModerationController:SetMuted(userId: number, value: boolean)
	if type(userId) ~= "number" then
		return
	end
	muted[userId] = value and true or nil
	ModerationController.MuteChanged:Fire(userId, value == true)
end

function ModerationController:IsBlocked(userId: number): boolean
	local blocked = ClientData.Get("Social.Blocked")
	return type(blocked) == "table" and blocked[tostring(userId)] == true
end

function ModerationController:OpenPlayer(userId: number)
	if type(userId) ~= "number" or userId == localPlayer.UserId then
		return
	end
	local phone = Router.IsOpen("Phone")
	if phone then
		Router.Close("Phone")
	end
	Router.Open(PANEL, { UserId = userId })
end

---------------------------------------------------------------------------
-- Interact prompts on other characters
---------------------------------------------------------------------------
local function displayName(p: Player): string
	local rp = p:GetAttribute("RPName")
	if type(rp) == "string" and rp ~= "" then
		return rp
	end
	return p.DisplayName
end

local function setupCharacter(player: Player, character: Model, maid)
	local charMaid = Maid.new()
	maid:Give(charMaid)

	local function attach(root: BasePart)
		charMaid:Clean()
		local prompt = Instance.new("ProximityPrompt")
		prompt.Name = "SkylineInteract"
		prompt.ActionText = "Interact"
		prompt.ObjectText = displayName(player)
		prompt.KeyboardKeyCode = CFG.KeyboardKey
		prompt.GamepadKeyCode = CFG.GamepadKey
		prompt.MaxActivationDistance = CFG.Distance
		prompt.HoldDuration = 0
		prompt.RequiresLineOfSight = false
		prompt.Exclusivity = Enum.ProximityPromptExclusivity.OnePerButton
		prompt.UIOffset = Vector2.new(0, 40)
		prompt.Parent = root
		charMaid:Give(prompt)
		charMaid:Give(prompt.Triggered:Connect(function()
			ModerationController:OpenPlayer(player.UserId)
		end))
		local function refresh()
			prompt.ObjectText = displayName(player)
			prompt.Enabled = player:GetAttribute("InVehicle") ~= true and localPlayer:GetAttribute("InVehicle") ~= true
		end
		refresh()
		charMaid:Give(player:GetAttributeChangedSignal("RPName"):Connect(refresh))
		charMaid:Give(player:GetAttributeChangedSignal("InVehicle"):Connect(refresh))
		charMaid:Give(localPlayer:GetAttributeChangedSignal("InVehicle"):Connect(refresh))
	end

	local root = character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		attach(root)
	end
	-- streaming: the root may stream in (or back in) later
	maid:Give(character.ChildAdded:Connect(function(child)
		if child.Name == "HumanoidRootPart" and child:IsA("BasePart") then
			attach(child)
		end
	end))
end

local function watchPlayer(player: Player)
	if player == localPlayer then
		return
	end
	local maid = Maid.new()
	playerMaids[player] = maid
	local charMaid = Maid.new()
	maid:Give(charMaid)
	local function onCharacter(character: Model)
		charMaid:Clean()
		setupCharacter(player, character, charMaid)
	end
	if player.Character then
		task.spawn(onCharacter, player.Character)
	end
	maid:Give(player.CharacterAdded:Connect(onCharacter))
end

---------------------------------------------------------------------------
-- Lifecycle
---------------------------------------------------------------------------
function ModerationController:Init()
	Router.Register(PANEL, {
		Title = "Player",
		Icon = "👤",
		Kind = "window",
		Size = Vector2.new(440, 560),
		Build = function(content, data, ctx)
			return PlayerActionsPanel.Build(content, data, ctx, ModerationController)
		end,
	})
end

function ModerationController:Start()
	for _, p in ipairs(Players:GetPlayers()) do
		watchPlayer(p)
	end
	Players.PlayerAdded:Connect(watchPlayer)
	Players.PlayerRemoving:Connect(function(p)
		local maid = playerMaids[p]
		if maid then
			playerMaids[p] = nil
			maid:Clean()
		end
	end)
end

return ModerationController
