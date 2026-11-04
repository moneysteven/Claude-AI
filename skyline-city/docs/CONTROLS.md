# SKYLINE CITY — Controls

Every keybind in the game, who owns it, and how conflicts are resolved. Mobile players use the on-screen
buttons (HUD side bar, contextual action button, driving pedals / wheel); everything below also has a touch
button somewhere.

## How conflicts are resolved

All bindings go through `ContextActionService`. When two actions share a key, the one with the higher
priority runs first; if it returns `Sink` the other never sees the key, if it returns `Pass` the next one runs.

| Priority | Who | Notes |
|---|---|---|
| 3300 | Tuning orbit camera (`Dealership/OrbitCamera`) | Sinks the driving keys while the tuning sheet is open |
| 3200 | End test drive (`Dealership/TestDriveHud`) | Only during a test drive |
| 3150 | Job action (`Jobs/JobController`) | Sinks only while a job action is available, otherwise passes |
| 3100 | Driving (`Vehicle/Drive/DriveInput`, `Config/Driving.ActionPriority`) | Bound only while you sit in a DriveSeat |
| 3020 | Build mode (`Housing/BuildController`) | Only inside build mode |
| 2010 | Enter build mode with B (`Housing/HousingController`) | Only while standing in an area you may build in |
| 2000 (Default) | Every other on-foot shortcut and panel shortcut | Panel shortcuts are bound only while that panel is open |
| 1000 (Low) | Phone P / ButtonY (`PhoneController`) | Gets ButtonY only when nothing contextual sinks it, and passes it while a ButtonY ProximityPrompt (e.g. a house light switch) is on screen |

Router closes the open window with ButtonB. While a menu has a selected gamepad object, the D-pad and the face
buttons belong to that menu: driving face-button actions, the emote wheel and the City Events shortcut pass.

## On foot

| Action | PC | Gamepad | Owner |
|---|---|---|---|
| Move / jump | WASD, Space | Left stick, A | Roblox |
| World prompts (ATM, job station, pump, store, elevator…) | E | X | server ProximityPrompts |
| House light switch | F | Y | Housing prompts |
| Talk to / act on another player | T | D-pad up | ModerationController prompt (`Config/Social.Interact`) |
| Phone | P | Y (low priority) | PhoneController (`Config/Phone.UI`) |
| Emote wheel | B | D-pad down | EmoteController (`Config/Social.EmoteKey`) |
| Build mode (inside your plot / business) | B (wins over emotes there) | Build HUD button | HousingController |
| Job action (deliver, board, hose…) | G | Y | JobController (`Config/Jobs.Keybinds`) |
| Collapse job tracker (while clocked in) | J | L1 | JobController |
| Business work task (next to a matching station) | F | Y | Business/WorkHud |
| Garage | N | Garage HUD button | GarageController (`Config/Vehicles.UI.GarageKey`) |
| Business dashboard | M | Business HUD button | BusinessController |
| Homes / real estate | H | Homes HUD button | RealEstateController |
| Wealth leaderboard | L | HUD wealth chip | WealthController |
| Shop | F2 | Shop HUD button | ShopController (`Config/Monetization.UI.ShopKey`) |
| Wardrobe | F3 | Wardrobe HUD button | ClothingController (`Config/Clothing.UI.WardrobeKey`) |
| City events | F4 | D-pad right (while an event runs) | EventController (`Config/Events.UI`) |
| Close window | Esc / ✕ | B | Router |

## Inside panels (bound only while the panel is open)

| Panel | Shortcuts |
|---|---|
| Bank, Settings and other tabbed economy panels | L1 / R1 switch tabs; D-pad left/right move a focused slider |
| Daily reward | Y claims |
| Shop | Y claims the VIP daily bonus; Q / E or L1 / R1 switch tabs |
| Wardrobe | Q / E or L1 / R1 switch tabs |
| Garage | L1 / R1 select car, X spawn / park, Y call to you |
| Fuel pump | L1 / R1 change the amount, X pay / stop |
| Repair | X confirm |
| Dealership | `[` / `]` or L1 / R1 browse, `;` or Y sort, `'` or X class filter |
| Tuning | `[` / `]` or L1 / R1 change section, Enter or Y confirm, B close, Z / X rotate the car |
| Phone map | Right stick pan, L1 / R1 zoom |
| Phone camera (photo mode) | B exit, X selfie / rear, D-pad filters, L1 / R1 zoom, Y pose, A shutter |
| Job minigames | per minigame (number keys for the register, etc.) |

## Build mode

1-7 tools (Select, Place, Wall, Move, Rotate, Delete, Paint) · R / T or R1 / L1 rotate · X / Delete or X delete ·
Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo · G grid · F free placement · C or Y catalog · PageUp / PageDown or D-pad
up / down change floor · Enter or Select confirm · Backspace or B cancel · Start exits. Camera: WASD / arrows /
left stick pan, Q / E or right stick rotate, wheel / triggers zoom.

## Driving (only while seated as the driver)

| Action | PC | Gamepad |
|---|---|---|
| Throttle / brake & reverse / steer | W, S, A / D (or arrows) | RT, LT, left stick |
| Handbrake | Space | X |
| Shift up / down (manual) | E / Q | D-pad up / down |
| Manual gearbox on/off | M | L3 |
| Cruise control | C | L1 |
| Lights (off → low → high) | L | car menu |
| Horn | H | A |
| Indicators left / right, hazards | Z / X, V | D-pad left / right |
| Interior light, engine, seatbelt | I, K, G | car menu |
| Radio, roof | R, U | car menu |
| Windows FL / FR / RL / RR, all | 1 / 2 / 3 / 4, 5 | car menu |
| Exit vehicle | F | B |
| Car controls menu | O | Select (works while a menu is open) |
| Siren (job vehicles) | N | car menu |
| Camera mode, look behind, mirror | Y, LeftAlt, B | R1, R3, — |
| Lock | J | car menu |
| End test drive | Backspace | Y |

While seated, the job action (G / Y) takes priority over the seatbelt when a job action is available
(taxi pick-up / drop-off), and the phone still opens with P / Y.

## Camera ownership

`Client/Util/CameraOwner` decides who may script `Workspace.CurrentCamera`. Highest priority wins:
Drive (10) < Build (20) < Tuning orbit (30) < Phone selfie (40). In VR (`VRService.VREnabled`) nobody is granted the camera, so the default VR camera is never replaced by a Scriptable one. When the last owner releases, the camera
returns to the default Roblox camera (CameraType Custom, subject = your Humanoid). If you are still driving,
the drive camera resumes on the next frame.
