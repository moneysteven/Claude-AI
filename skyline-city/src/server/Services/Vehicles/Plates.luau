-- Plates: licence-plate text helpers (server).
--
--   Plates.Generate() -> "ABC 123"            random plate in the Skyline City format
--   Plates.Clean(text) -> string?             sanitised plate (A-Z, 0-9, space; 1..8 chars) or nil
--   Plates.ForJob(jobModelId, userId) -> string   e.g. "PD 4821" for police cruisers

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Looks = require(ReplicatedStorage:WaitForChild("Shared").Vehicle.Looks)

local Plates = {}

local rng = Random.new()
-- letters that are easy to read on a small plate (no I / O / Q)
local LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"

local JOB_PREFIX = {
	job_police_cruiser = "PD",
	job_fire_truck = "FD",
	job_ambulance = "EMS",
	job_taxi = "CAB",
	job_tow_truck = "TOW",
	job_pizza_scooter = "PZA",
	job_construction_truck = "BLD",
}

local function letter(): string
	local i = rng:NextInteger(1, #LETTERS)
	return LETTERS:sub(i, i)
end

function Plates.Generate(): string
	return ("%s%s%s %03d"):format(letter(), letter(), letter(), rng:NextInteger(0, 999))
end

function Plates.Clean(text: any): string?
	return Looks.CleanPlate(text)
end

function Plates.ForJob(modelId: string, userId: number): string
	local prefix = JOB_PREFIX[modelId] or "CITY"
	return ("%s %04d"):format(prefix, (userId % 9000) + 1000)
end

return Plates
