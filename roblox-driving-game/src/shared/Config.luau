--!strict
-- Shared tuning values for the driving game.
-- Lives in ReplicatedStorage.DrivingShared so both server and client can read it.

local Config = {}

Config.Car = {
	-- Speeds are in studs/second (1 stud/s is roughly 1 km/h).
	MaxSpeed = 140,
	ReverseSpeed = 40,

	-- Accelerations are in studs/second^2. Motor torque is derived from the
	-- car's mass at runtime, so these stay valid if you change the car's size.
	Acceleration = 45,
	BrakeDeceleration = 110,
	CoastDeceleration = 10,
	HandbrakeDeceleration = 160,

	-- Steering angle (degrees) shrinks as speed rises so the car stays stable.
	MaxSteerAngle = 34,
	MinSteerAngle = 9,
	SteerSpeed = 6, -- how fast the wheel turns toward the input (per second)

	-- Suspension
	SuspensionTravel = 0.8, -- studs of travel up/down from rest
	SuspensionSag = 0.6, -- how far the springs compress under the car's weight
	SuspensionDamping = 0.45, -- 0 = bouncy, 1 = critically damped

	WheelRadius = 1.3,
	WheelWidth = 1.2,
	WheelFriction = 2,
}

Config.Race = {
	TotalLaps = 3, -- laps shown in the HUD; lap times are tracked forever
}

Config.Spawn = {
	Cooldown = 3, -- seconds between car spawns per player
}

Config.Track = {
	StraightLength = 420,
	TurnRadius = 160,
	RoadWidth = 54,
	ArcSegments = 28,
}

return Config
