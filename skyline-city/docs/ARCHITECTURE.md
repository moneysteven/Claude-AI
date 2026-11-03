# SKYLINE CITY — Architecture & Integration Contract

This document is the **contract** every system follows. If you add a system, follow it; if you change a
public API listed here, update this file.

## 1. Layout (Rojo)

| Rojo path | Studio location | What lives there |
|---|---|---|
| `src/shared` | `ReplicatedStorage.Shared` | Config modules, `Net`, `DataTemplate`, `Util/*`, shared math (`Build/`, `Vehicle/`) |
| `src/server` | `ServerScriptService.Server` | `Main.server.luau`, `Registry`, `Lib/*`, `Services/**` |
| `src/client` | `StarterPlayer.StarterPlayerScripts.Client` | `Main.client.luau`, `Registry`, `ClientData`, `UI/*`, `Controllers/**` |
| `src/first` | `ReplicatedFirst.Loading` | Loading screen |
| (project.json) | `ServerStorage.Assets.{Cars,Furniture,Buildings,NPCs,Clothing}` | Optional real 3D models that override procedural greybox ones |

All UI is built in code with `Client/UI/Kit` + `Client/UI/Router` (syncs cleanly with Rojo). `StarterGui` is intentionally empty.

## 2. Bootstrap

* **Server**: `Main.server.luau` requires every ModuleScript in `Services/` and one level of sub-folders whose
  name ends in `Service`. Each returns `{ Name, Priority?, Init?, Start? }`. All `Init` run (sorted by Priority,
  default 100), then all `Start` (each in its own thread). Helper modules next to services (not ending in `Service`) are ignored by the loader and `require`d by their service.
* **Client**: `Main.client.luau` does the same for `Controllers/` (names ending in `Controller`).
  `Start` runs after the first data sync (or 30 s).
* Peers: `Registry.Get("XService")` (errors if missing) / `Registry.Find("XService")` (nil if missing).
  Only call inside `Init`/`Start`/handlers, never at require time.

## 3. Networking (`Shared/Net`)

* Client → server requests: **one RemoteFunction per domain**, dispatched by action:
  `Net.HandleActions("Bank", { Deposit = function(player, payload) ... return { ok = true } end }, { rate = 6 })`
  Client: `local res = Net.Invoke("Bank", "Deposit", { Amount = 500 })` → always a table with `ok` and maybe `err`.
* Client → server fire-and-forget: `Net.On("VehicleAction", fn, { rate = 20 })` / `Net.Send("VehicleAction", ...)`.
* Server → client: `Net.Fire(player, "JobEvent", ...)`, `Net.FireAll(...)`. Call `Net.Declare(name)` in `Init` for every server→client event.
* Every handler is rate-limited (token bucket) and pcall-wrapped by Net. **Validate every field** with `Server/Lib/Guard`
  (`Guard.Money`, `Guard.Id`, `Guard.String`, `Guard.Near`, ...). Never trust client prices, positions, ids or amounts —
  look prices up in Config on the server.
* World interactions use **server-side ProximityPrompts** on tagged parts (Roblox enforces the distance);
  the server then opens UI with `NotifyService:OpenUI(player, panel, data)`. Remote handlers that act on a place
  (ATM, pump, shop) re-check distance with `Guard.NearTagged(player, tag, dist)`.

### Remote domains (RemoteFunction name → owner)
`Data` (DataService), `Bank`, `Wealth`, `Daily`, `Settings`, `Tutorial` (economy), `Jobs` (jobs), `Phone`, `Social`, `Moderation` (social),
`Housing`, `Build`, `RealEstate` (housing), `Vehicle`, `Fuel`, `Mechanic` (vehicles), `Dealership`, `Tuning` (dealership),
`Business` (business), `Shop`, `Clothing` (monetization), `World`, `Events` (world).

Events: `DataSync`, `Notify`, `UI` (core) · `VehicleAction` (c→s), `VehicleTelemetry` (c→s, unreliable) · `JobEvent` (s→c) ·
`PhoneEvent` (s→c) · `WorldEvent` (s→c) · `BuildEvent` (s→c).

## 4. Data (`Shared/DataTemplate`, `DataService`)

* Session-locked profiles (`Lib/ProfileStore`), autosave every 120 s, save on leave, BindToClose, retries + backoff.
* **Write only via** `DataService:Set/Update/Increment(player, "Dot.Path", value)` → automatically replicated to the owner.
  If you mutate a nested table in place, call `DataService:Replicate(player, "Path")`.
* Cash only via **EconomyService** (`AddCash`, `Pay`, `TrySpend`, `Charge`, `Transfer`, `GetPrice`).
* Keys are strings without dots; ids are generated like `h_1`, `v_7`, `b_2` from `Next*Number` counters.
* Every owned asset has a `Value` field (net-worth calculation).
* `DataService.Releasing` handlers must be **synchronous** (write session state into data before the final save).
* Client mirror: `ClientData.Get(path)`, `ClientData.OnChanged(path, fn)` (read-only).

## 5. Service API contract (cross-system calls)

Only these cross-system methods may be relied on by other systems.

### Core (implemented)
* `DataService` — see §4. `:SaveNow(player) -> bool`, `:OnLoaded(fn)`, `.Loaded`, `.Releasing`.
* `EconomyService` — `:GetCash`, `:CanAfford`, `:AddCash(p, n, reason)`, `:Pay(p, base, reason) -> paid`,
  `:TrySpend(p, n, reason)`, `:Charge(p, n, reason)` (wallet then bank), `:Transfer(a, b, n, reason)`,
  `:GetPrice(p, base, category)`, `:RegisterPayModifier(fn)`, `:RegisterPriceModifier(fn)`, `.Transaction`.
  Pay reasons for jobs start with `"Job:"`; business wages `"Wage:"`; passive business income `"Business:"`.
* `NotifyService` — `:Send(p, text, kind?, dur?)`, `:SendAll`, `:OpenUI(p, panel, data?)`, `:CloseUI(p, panel)`.

### Economy (BankService, WealthService, DailyRewardService, AntiExploitService, SettingsService, TutorialService)
* `BankService:GetBalances(p) -> {Cash, Bank, Savings}`
* `WealthService:GetNetWorth(p) -> number`, `:GetTier(p) -> tierTable`, `.TierChanged(p, newTier, oldTier)`
* `AntiExploitService:Whitelist(p, seconds)` — call **before** the server teleports a player or puts them in a fast vehicle.
  `:Flag(p, kind, detail)`.
* `TutorialService:Advance(p, stepId)` — systems report tutorial milestones: `"ClockIn"`, `"FirstPay"`, `"OpenPhone"`, `"Deposit"`, `"BuyCar"`, `"EnterBuild"`.

### World (WorldService, EventService)
* `WorldService:GetClock() -> number` (0–24), `:GetDay()`, `:GetWeek()`, `:IsNight()`, `:GetWeather() -> "Clear"|"Cloudy"|"Rain"|"Fog"`,
  `.HourChanged(hour)`, `.DayChanged(day)`, `.WeekChanged(week)`,
  `:GetDistrictAt(pos) -> string?`, `:IsInSafeZone(pos) -> bool`, `:Teleport(player, cframe)` (handles anti-exploit whitelist),
  `:GetSpawnCFrame() -> CFrame`.
* `EventService:GetActiveEvent() -> table?` (`{Id, Name, EndsAt, PayMultiplier?}`); registers a pay modifier for "Double Pay" events.
* `Shared/Config/CityLayout` (world-owned, static): `{ Bounds = {Min=Vector2, Max=Vector2}, Districts = {{Name, Center=Vector3, Size=Vector2, Color=Color3}}, POIs = {{Id, Name, Icon, Position=Vector3, Category}}, Roads = {{From=Vector3, To=Vector3, Width}} }` — used by the phone map / GPS.

### Jobs (JobService)
* `JobService:GetCurrentJob(p) -> jobId?`, `:ClockOut(p, reason?)`, `.TaskCompleted(p, jobId, pay)`.
* Job ids: `Pizza, Taxi, Police, Fire, Paramedic, Mechanic, Cashier, Chef, CarSales, RealEstate, Construction`.

### Housing (HousingService, BuildService, RealEstateService)
* `HousingService:GetActivePlot(p) -> plotPart?`, `:GetHome(p) -> {HouseId?, TierId, Plot}`, `:CanEnter(p, plotPart) -> bool`,
  `:GrantHouse(p, tierId, opts) -> houseId?` (used by real-estate transfers).
* `BuildService:RegisterContext(id, ctx)` / `:UnregisterContext(id)` / `:LoadBuild(id)` / `:ClearBuild(id)` where
  `ctx = { Owner = Player, Origin = CFrame (top-centre of the build surface), Size = Vector3, DataPath = "Housing.Owned.h_1.Build",
  Catalog = "House"|"Apartment"|"Business", MaxItems = number, Floors = number, CanBuild = function(player) -> bool, Folder = Instance }`.
  Businesses reuse this. Built items carry attribute `Function` (see §8) so other systems can find stoves, registers, beds, etc.
* Tier ids: `Studio, Apartment, Townhouse, Suburban, BeachVilla, Penthouse, Mansion, SkyApartment` (SkyApartment needs the `ExclusiveApartments` pass).

### Vehicles (VehicleService, FuelService, MechanicService)
* `VehicleService:GrantVehicle(p, modelId, opts?) -> uid?` (`opts = {Value, Paint, Finance, Plate}`), `:RemoveVehicle(p, uid) -> bool`,
  `:SpawnVehicle(p, uid, cframe?) -> (Model?, err?)`, `:DespawnVehicle(p)`, `:GetActiveVehicle(p) -> Model?`,
  `:GetOccupiedVehicle(p) -> (Model?, seat?)`, `:SpawnJobVehicle(p, modelId, cframe) -> Model?`, `:DespawnJobVehicle(p)`,
  `:SpawnTestDrive(p, modelId, cframe, seconds) -> Model?`, `:BuildDisplay(modelId, cframe, look?) -> Model` (anchored showroom copy),
  `:RefreshLook(p, uid)` (re-apply customisation to a spawned car), `:Repair(p, uid, amount?)`, `:GetCarValue(p, uid) -> number`,
  `.VehicleSpawned(p, model)`.
* Job vehicle model ids: `job_pizza_scooter, job_taxi, job_police_cruiser, job_fire_truck, job_ambulance, job_tow_truck, job_construction_truck`.

### Monetization (MonetizationService, VIPService, ClothingService)
* `MonetizationService:HasPass(p, key) -> bool` with keys `VIP, ExclusiveApartments, PremiumCarPark, ExtraHouse`;
  `.PassGranted(p, key)`. Sets player attributes `VIP` and `Pass_<key>`.
* VIP perks are applied by the consumer, reading `HasPass` (2x pay & 20 % furniture discount are registered by MonetizationService
  as Economy modifiers: pay reasons `"Job:"`, price category `"Furniture"`).

### Business (BusinessService)
* `BusinessService:GetEmployer(p) -> (ownerPlayer?, bizId?)`.

### Social (SocialService, PhoneService, ModerationService)
* `PhoneService:SendSystemMessage(p, fromName, text)` (bank alerts, rent reminders, job offers),
  `PhoneService:PostToFeed(p?, text)` (system or player posts).
* `SocialService:SetRPName(p, name)`; name tags are built from player attributes (§6).
* `ModerationService:IsBlocked(a, b) -> bool`, `:FilterText(text, fromPlayer, toPlayer?) -> string?` (TextService, nil on failure).

## 6. Player attributes (server sets, everyone reads)
`DataLoaded`, `IsNewPlayer`, `VIP`, `Pass_<key>`, `WealthTier` (1–6), `WealthTitle`, `NetWorth`, `JobId` (""), `JobLevel`,
`RPName`, `Bio`, `InVehicle` (bool), `Seatbelt` (bool), `InSafeZone` (bool), `District`, `HouseId`, `GroupName`, `AFK`, `EmployerName`.

## 7. CollectionService tags
Defined in `Shared/Config/World.Tags`. The procedural city (WorldBuilder) creates all of them; real models just need the same tag + attributes.
JobTarget `Kind`s: `Delivery` (Pizza), `Pickup`/`Dropoff` (Taxi), `PatrolPoint` (Police), `FireSpot` (Fire), `PatientSpot` (Paramedic),
`RepairSpot` (Mechanic), `Register` (Cashier), `Stove` (Chef), `Showroom` (CarSales), `Showing` (RealEstate), `ConstructionSite` (Construction).
With **StreamingEnabled**, clients must use `CollectionService:GetInstanceAddedSignal(tag)` and never assume a part exists.

## 8. Furniture `Function` ids
`Seat, Bed, Stove, Fridge, Sink, Shower, Toilet, TV, Register, DisplayRack, ClothingRack, DJBooth, Bar, Desk, Computer, Door, Window,
Light, Plant, Decoration, CarDisplay, Storage, Table, Gym`.

## 9. Car rig spec (procedural or real models)
```
Model <uid>                 PrimaryPart = Chassis, ModelStreamingMode = Atomic
  Attributes: CarUid, ModelId, OwnerUserId, IsJobVehicle, IsTestDrive, Locked, Engine (bool), Headlights (0 off/1 low/2 high),
              Indicator (""|"Left"|"Right"|"Hazard"), InteriorLight, Horn, RadioStation (""), Fuel (0..1), Health (0..100),
              RPM, Gear, Brake (bool), Reverse (bool), Window_FL/FR/RL/RR (0 up..1 down), Door_FL/FR/RL/RR, Hood, Trunk (bool),
              Sunroof (0..1), Roof (0 closed..1 open; convertibles), Siren (bool)
  Chassis   (Part, invisible, physics root, CanCollide true)
  DriveSeat (VehicleSeat; MaxSpeed=0, Torque=0 — used for sitting/occupancy only; custom physics reads input)
  Seats/    (Seat parts for passengers, named Passenger1..n)
  Body/     (visual parts, welded to Chassis, Massless; paintable parts have attribute Paint=true; glass has Glass=true)
  Wheels/   FL, FR, RL, RR  (cosmetic, Massless, CanCollide=false; Attribute Radius; positioned each frame by the driver's chassis via
            Motor6D "WheelMotor" C0 from Chassis); Chassis has Attachments WheelFL/WheelFR/WheelRL/WheelRR at the suspension top.
  Doors/    FL, FR, RL, RR  (Model; part "Door" joined to Chassis by Motor6D "Hinge"; child part "Window" joined by Motor6D "WindowMotor")
  Hood, Trunk (Part with Motor6D "Hinge") · Sunroof (Part, Motor6D "Slide") · Roof (Model, Motor6D "Fold"; convertibles)
  Lights/   Headlight_L/R (SpotLight), Taillight_L/R, Brake_L/R, Indicator_FL/FR/RL/RR, Reverse_L/R, Interior (PointLight), Underglow (PointLight)
  Mirrors/  Mirror_L, Mirror_R, Mirror_C
```
Animations (doors, windows, roof) are done **client-side** by `CarVisualsController` from attributes using `Motor6D.Transform`, so physics
is never touched. The driver's client owns the physics (network owner) and runs the raycast chassis (`DriveController`).
The server watches speed/position for anti-exploit, fuel and mileage (never trusts client telemetry for money).

`VehicleAction` actions (c→s): `Engine`, `Lights`, `HighBeam`, `Indicator(dir)`, `Hazard`, `Horn(bool)`, `Window(door, value?)`, `AllWindows(value)`,
`Door(door)`, `Hood`, `Trunk`, `Sunroof`, `Roof`, `InteriorLight`, `Radio(stationId|"off"|"next")`, `Seatbelt`, `Lock(bool?)`, `Siren`, `Exit`.

## 10. Coding rules
* Luau, `task.*` only (no `wait`, `spawn`, `delay`), no deprecated APIs.
* **No per-frame loops on the server.** Server loops tick at ≤ 5 Hz and are batched; client visuals may use RenderStepped/Heartbeat.
* Object pooling for repeated effects/NPCs (`Shared/Util/Pool`).
* Mobile-first UI: 44 px touch targets, `Router` windows, `ContextActionService` buttons for mobile/gamepad, keybinds on PC.
* Parody brands only — never a real car brand, logo or model name.
* Robux never sells unbeatable advantages; everything important is earnable with cash.
