# Roblox Driving Game

A starter driving game for Roblox: spawn a buggy, race around an oval circuit, and set lap records. All of it is built with code, so you don't need to make any models by hand.

## What's included

- **Track**: an oval circuit with red/white curbs, a start/finish gantry, invisible checkpoints and two jump ramps in the infield.
- **Cars**: physics buggies with motorized wheels, spring suspension and speed-sensitive front-wheel steering. Each car shows its driver's name.
- **Lap timing**: you must pass the checkpoints in order. The leaderboard shows Best Lap and Laps, and the server announces new track records.
- **HUD**: speedometer, lap timer, last/best/record times, and Spawn, Flip and Handbrake buttons, which also work on touch screens.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Throttle / brake / reverse | W/S or ↑/↓ | Triggers / left stick | Thumbstick |
| Steer | A/D or ←/→ | Left stick | Thumbstick |
| Handbrake (drift) | Shift | X | Handbrake button |
| Flip car upright | R | Y | Flip button |
| Spawn a new car | C | B | Spawn Car button |
| Get out | Space | A | Jump button |

## Project layout

```
src/shared/Config.luau              -> ReplicatedStorage.DrivingShared.Config   (ModuleScript)
src/server/GameServer.server.luau   -> ServerScriptService.DrivingServer.GameServer (Script)
src/server/TrackBuilder.luau        -> ServerScriptService.DrivingServer.TrackBuilder (ModuleScript)
src/server/CarFactory.luau          -> ServerScriptService.DrivingServer.CarFactory (ModuleScript)
src/server/RaceManager.luau         -> ServerScriptService.DrivingServer.RaceManager (ModuleScript)
src/client/DriveClient.client.luau  -> StarterPlayer.StarterPlayerScripts.DrivingClient.DriveClient (LocalScript)
```

## Setup option A: Rojo (recommended if you use VS Code)

1. Install [Rojo](https://rojo.space) and its Roblox Studio plugin.
2. In this folder, run `rojo serve`.
3. In Studio, open a new **Baseplate** place, click **Connect** in the Rojo plugin, and press **Play**.

## Setup option B: copy and paste into Studio

1. Create a new place from the **Baseplate** template.
2. In **ReplicatedStorage**, add a **Folder** named `DrivingShared`. Inside it, add a **ModuleScript** named `Config` and paste in `src/shared/Config.luau`.
3. In **ServerScriptService**, add a **Folder** named `DrivingServer`. Inside it, add:
   - a **Script** named `GameServer` (paste `GameServer.server.luau`)
   - **ModuleScripts** named `TrackBuilder`, `CarFactory` and `RaceManager` (paste the matching files)
4. In **StarterPlayer → StarterPlayerScripts**, add a **LocalScript** named `DriveClient` and paste in `DriveClient.client.luau`.
5. Press **Play**, then press **C** to spawn a car.

The names have to match exactly, because the scripts find each other by name.

> When the game starts, it deletes the template's `Baseplate` part so the grass doesn't flicker against it, and it builds the world in `Workspace.DrivingWorld`.

## Tuning

Everything you're likely to tweak is in `Config.luau`:

- `Car.MaxSpeed`, `Car.Acceleration`, `Car.BrakeDeceleration`: how fast the car is and how quickly it speeds up and stops.
- `Car.MaxSteerAngle` / `Car.MinSteerAngle`: steering lock at low and high speed.
- `Car.SuspensionSag`, `Car.SuspensionDamping`: softer or stiffer, bouncier or more settled suspension.
- `Car.WheelFriction`: grip. Lower it to make the car drift more.
- `Track.StraightLength`, `Track.TurnRadius`, `Track.RoadWidth`: size of the circuit.
- `Race.TotalLaps`: how many laps count as a full race.

Motor torque and spring stiffness are calculated from the car's mass, so you can resize the car in `CarFactory.luau` without retuning everything.

## How it works

- **Server** (`GameServer`): builds the track, creates the `DrivingRemotes` RemoteEvents, and spawns a car when a player asks for one (with a 3-second cooldown). It gives the player network ownership of their car, which lets their client run its physics. Only the owner can drive a car.
- **Client** (`DriveClient`): each frame, reads `VehicleSeat.ThrottleFloat` and `SteerFloat` and sets the wheel motors' speed and torque and the front struts' steering angle. Because the client owns the car's physics, the controls respond with no network lag.
- **RaceManager**: listens for car parts touching the checkpoints. Crossing the finish line after every checkpoint completes a lap. It sends lap data to each player's HUD.

## Ideas for next steps

- Engine sounds: add a `Sound` to the chassis and set its `PlaybackSpeed` from the car's speed.
- Better-looking cars: build a body in Studio and weld it to the `Chassis` in `CarFactory`.
- More tracks: write another builder like `TrackBuilder` (a figure-eight, a city grid, an off-road course).
- Save best laps between sessions with `DataStoreService`.
- Add a countdown start, so players race each other rather than only the clock.
