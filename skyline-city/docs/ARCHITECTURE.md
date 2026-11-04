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
* Every handler is rate-limited (token bucket) and pcall-wrapped by Net. Rate-limit hits call the single legacy hook
  `Net.OnRateLimited` (owned by AntiExploitService) and fire `Net.RateLimited : Signal(player, remoteName)` for anyone else.
* **Validate every field** with `Server/Lib/Guard`
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

Notable actions beyond the obvious CRUD ones (each domain's service file lists all of them in its header):
* `Tutorial.Continue {Step}` — completes the current step only when it is `Manual` or `ClientReport`; `Tutorial.Skip {}`, `Tutorial.GetState {}`.
* `Jobs.GetOffer {JobId}`, `Jobs.LeaveQueue`, `Jobs.Act {Op, TaskId, ...}` (dispatched on `payload.Op`), `Jobs.AcceptRepair/DeclineRepair {OfferId}`.
  `JobEvent` kinds: `State`, `Task`, `TaskEnded`, `Paid`, `LevelUp`, `Progress`, `Queue` (Queue Ready carries `Station: Vector3`).
* `PhoneEvent` kinds: `Message`, `Feed`, `FeedLike`, `Ping`, `GroupInvite`, `Group`, `Party`, `PartyEnded`.
* `BuildEvent` kinds: `Buildable(list)`, `State(ctxId, state)`, `SessionEnded(ctxId, reason)`.
* `WorldEvent` kinds: `EventStart(info)`, `EventEnd({Id})`, `Fade({Text})` (before elevator teleports).

### Router panels (client) that servers open with `NotifyService:OpenUI(player, name, data)`
`Bank {ViaPhone, Place, Tab, TargetUserId}`, `DailyReward`, `Leaderboard`, `TierUp {TierId, Name, Reward, Color}` (custom, Modal), `Settings`,
`JobOffer`, `Jobs {ViaPhone}`, `RepairOffer`, `JobMinigame` (custom), `Phone {App, AppData}` (custom), `PlayerActions {UserId}`, `RealEstate {Tab}`,
`BuildMode` (custom), `Garage`, `FuelPump`, `Repair`, `CarControls`, `Dealership`, `TestDrive` (custom, HUD), `Tuning` (custom),
`Business {BizId?|LotId?}`, `BusinessShop`, `JobOfferBusiness`, `Shop {Tab}`, `ShopCelebrate` (custom, Modal), `Clothing {Tab}`, `CityEvents`.
Clients can check optional peer panels with `Router.IsRegistered(name)`.

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
  `:GetPrice(p, base, category)`, `:RegisterPayModifier(fn)`, `:RegisterPriceModifier(fn)`,
  `:MoveCashToBank(p, n) -> bool` / `:MoveBankToCash(p, n) -> bool` (BankService only; no lifetime stats, Transaction kind `"bank"`),
  `.Transaction(p, delta, reason, kind)` with kind `"earn"|"spend"|"transfer"|"purchase"|"bank"`.
  Pay reasons for jobs start with `"Job:"`; business wages `"Wage:"`; passive business income `"Business:"`.
  Reasons starting `"Robux:"`, `"Admin:"` or `"Reward:"` (daily / tutorial / wealth-tier rewards) skip the earn-rate watchdog.
* `NotifyService` — `:Send(p, text, kind?, dur?)`, `:SendAll`, `:OpenUI(p, panel, data?)`, `:CloseUI(p, panel)`.

### Economy (BankService, WealthService, DailyRewardService, AntiExploitService, SettingsService, TutorialService)
* `BankService:GetBalances(p) -> {Cash, Bank, Savings}`, `:GetStatement(p)`, `.BalanceChanged(p)`
* `WealthService:GetNetWorth(p) -> number`, `:GetTier(p) -> tierTable`, `.TierChanged(p, newTier, oldTier)`, `:MarkDirty(p)`,
  `:GetTopList() -> {{Rank, UserId, Name, NetWorth, TierId}}`. Net worth = Cash + Bank + Savings + Σ `Value` of `Housing.Owned`,
  `Vehicles` (minus `Finance.Remaining`) and `Businesses`.
* `DailyRewardService:GetStatus(p)`, `SettingsService:Get(p, key)`, `AntiExploitService:GetStrikes(p)` / `:GetLog()`.
* `AntiExploitService:Whitelist(p, seconds)` — call **before** the server teleports a player or puts them in a fast vehicle.
  `:Flag(p, kind, detail)`.
* `TutorialService:Advance(p, stepId) -> bool` — systems report tutorial milestones: `"ClockIn"`, `"FirstPay"`, `"OpenPhone"`, `"Deposit"`, `"BuyCar"`, `"EnterBuild"`
  (only the current step completes; aliases such as `OpenGarage` → `BuyCar`). `:GetState(p)`. Steps live in `Config/Tutorial`.
* Config modules owned by economy: `Config/Economy` (incl. `Bank`, `WealthTiers`, `Daily`), `Config/AntiExploit` (incl. `SpamIgnoreRemotes`
  for high-rate remotes and `MaxVehicleSpeed` in studs/s), `Config/Tutorial`.

### World (WorldService, EventService)
* `WorldService:GetClock() -> number` (0–24), `:GetDay()`, `:GetWeek()`, `:IsNight()`, `:GetWeather() -> "Clear"|"Cloudy"|"Rain"|"Fog"`,
  `.HourChanged(hour)`, `.DayChanged(day)`, `.WeekChanged(week)`,
  `:GetDistrictAt(pos) -> string?`, `:IsInSafeZone(pos) -> bool`, `:Teleport(player, cframe)` (handles anti-exploit whitelist),
  `:GetSpawnCFrame() -> CFrame`.
  Extras: `:GetWeatherIntensity()`, `:IsCityReady()`, `:SetWeather(name)` (admin/testing).
* `EventService:GetActiveEvent() -> table?` (`{Id, Name, Icon, Description, StartedAt, EndsAt, EndsIn, PayMultiplier?, Discount?, PriceCategory?, Zone?, Spot?}`);
  registers a pay modifier for "Double Pay" events. `.EventStarted(info)` / `.EventEnded(info)`. Event ids live in `Config/Events`.
* World-owned extras: `Config/Ambient`, `Shared/World/RoadGraph`. Workspace attributes `Clock, ClockAt, ClockRate, Day, Week, Night,
  Weather, WeatherIntensity, Event, EventEndsAt, CityReady, CityDecorReady`.
* `Shared/Config/CityLayout` (world-owned, static): `{ Bounds = {Min=Vector2, Max=Vector2}, Districts = {{Name, Center=Vector3, Size=Vector2, Color=Color3}}, POIs = {{Id, Name, Icon, Position=Vector3, Category}}, Roads = {{From=Vector3, To=Vector3, Width}} }` — used by the phone map / GPS.

### Jobs (JobService)
* `JobService:GetCurrentJob(p) -> jobId?`, `:ClockOut(p, reason?)`, `.TaskCompleted(p, jobId, pay)`.
  Extras: `:ClockIn(p, jobId) -> (ok, err?, queuePos?)`, `:GetJobLevel(p, jobId)`, `.ClockedIn(p, jobId)`, `.ClockedOut(p, jobId, reason)`.
* Job ids: `Pizza, Taxi, Police, Fire, Paramedic, Mechanic, Cashier, Chef, CarSales, RealEstate, Construction`.

### Housing (HousingService, BuildService, RealEstateService)
* `HousingService:GetActivePlot(p) -> plotPart?`, `:GetHome(p) -> {HouseId?, TierId, Plot}`, `:CanEnter(p, plotPart) -> bool`,
  `:GrantHouse(p, tierId, opts) -> houseId?` (used by real-estate transfers).
* `BuildService:RegisterContext(id, ctx)` / `:UnregisterContext(id)` / `:LoadBuild(id)` / `:ClearBuild(id)` where
  `ctx = { Owner = Player, Origin = CFrame (top-centre of the build surface), Size = Vector3, DataPath = "Housing.Owned.h_1.Build",
  Catalog = "House"|"Apartment"|"Business", MaxItems = number, Floors = number, CanBuild = function(player) -> bool, Folder = Instance }`.
  Businesses reuse this. Built items carry attribute `Function` (see §8) so other systems can find stoves, registers, beds, etc.
  Optional ctx fields: `Label`, `CanUse(player) -> bool`, `LockHost`, `SurfaceRoot`, `OnItemsChanged(valueDelta)`, `FloorHeight`.
  Extra methods: `:GetContext(id)`, `:GetModels(id)`, `:FindByFunction(id, fn)`, `:GetMaxItems(id)`, `:RefreshContext(id)`,
  `:RefreshPermissions()`, `:WipeBuild(id, refundFraction?) -> refund`, `:SellBackValue(build) -> number`.
* HousingService extras: `:GetHome(p)` also returns `ContextId, Origin, Size`; `:RemoveHouse`, `:RestoreHouse`, `:GetSlotInfo`, `:HasRentDebt`,
  `:GetHouseRecord`, `:AddGuestKey/RemoveGuestKey`, `:Teleport(p, cf)`, `:GetHomeEntrance(owner)`; signals `.HomeChanged(p, home)`,
  `.HouseRemoved(p, houseId, reason)`, `.WeekTick(week)`. `RealEstateService:UnlistHouse(p, houseId, reason?)`, `:GetTenancies(p)`.
  `Housing.Rented` may also hold `Build, Locked, Roommates, Builders, Name`.
* Tier ids: `Studio, Apartment, Townhouse, Suburban, BeachVilla, Penthouse, Mansion, SkyApartment` (SkyApartment needs the `ExclusiveApartments` pass).

### Vehicles (VehicleService, FuelService, MechanicService)
* `VehicleService:GrantVehicle(p, modelId, opts?) -> uid?` (`opts = {Value, Paint, Finance, Plate}`), `:RemoveVehicle(p, uid) -> bool`,
  `:SpawnVehicle(p, uid, cframe?) -> (Model?, err?)`, `:DespawnVehicle(p)`, `:GetActiveVehicle(p) -> Model?`,
  `:GetOccupiedVehicle(p) -> (Model?, seat?)`, `:SpawnJobVehicle(p, modelId, cframe) -> Model?`, `:DespawnJobVehicle(p)`,
  `:SpawnTestDrive(p, modelId, cframe, seconds) -> Model?`, `:BuildDisplay(modelId, cframe, look?) -> Model` (anchored showroom copy),
  `:RefreshLook(p, uid)` (re-apply customisation to a spawned car), `:Repair(p, uid, amount?)`, `:GetCarValue(p, uid) -> number`,
  `.VehicleSpawned(p, model)`. Extras: `:GetGarageSlots(p)`, `:GetOwnedCount(p)`, `:GetVehicleInfo(model)`.
  `opts.Finance` keeps `{Remaining, Payment, PaymentsLeft, Missed, Since, Total}`; `opts.IgnoreLimit` bypasses the garage-size check.
* `FuelService:Quote(p)`, `:IsRefueling(p)`; `MechanicService:GetRepairCost(p, uid)`; `DealershipService:IsTestDriving(p)`, `:GetFinanceSummary(p)`.
* `Config/Tuning.Upgrades[cat][level]` has a `[0]` stock entry; `Vehicles[uid].Upgrades = {Engine, Turbo, Brakes, Suspension, Transmission}` levels
  (mirrored on spawned cars as `Up_<cat>` attributes). Look ids (finish `Pearlescent`, spoilers `GT`/`SwanNeck`, `Paint.Exclusive`) come from `Config/Tuning`.
* VehicleService refuses to seat players whose `Cuffed` attribute is true.
* Pass parking perks (`Vehicles/Showcase` helper, tunables in `Config/Vehicles.VipParking` / `.Showcase`): `Vehicle.ParkVip {Uid}` delivers a VIP's
  car for free to their session-reserved bay in the VIP Car Park; `Vehicle.SetShowcase {Uid?}` (Premium Car Park) saves `Vehicles.<uid>.Showcase = true`
  and shows an anchored copy on a Meet Lot showroom pad while the owner is online. `Vehicle.List` also returns `Vip, VipBay, ShowcaseUid, ShowcaseLive`.
* Job vehicle model ids: `job_pizza_scooter, job_taxi, job_police_cruiser, job_fire_truck, job_ambulance, job_tow_truck, job_construction_truck`.

### Monetization (MonetizationService, VIPService, ClothingService)
* `MonetizationService:HasPass(p, key) -> bool` with keys `VIP, ExclusiveApartments, PremiumCarPark, ExtraHouse`;
  `.PassGranted(p, key)`. Sets player attributes `VIP` and `Pass_<key>`.
* `MonetizationService:GetOwnedPasses(p)`, `:RegisterProductHandler(key, handler)`; `VIPService:IsVip(p)`, `:GetDailyStatus(p)`, `:ClaimDaily(p)`;
  `ClothingService:Owns/GrantItem/RevokeItem/Equip/Unequip/Refresh/GetEquipped`. MonetizationService alone sets `MarketplaceService.ProcessReceipt`.
* VIP perks are applied by the consumer, reading `HasPass` (2x pay & 20 % furniture discount are registered by MonetizationService
  as Economy modifiers: pay reasons `"Job:"`, price category `"Furniture"`).

### Business (BusinessService)
* `BusinessService:GetEmployer(p) -> (ownerPlayer?, bizId?)`. Extras: `:GetBusinesses(p)`, `:GetLoaded(p, bizId)`.
  Business build data lives at `Businesses.<bizId>.Build` (BuildService ctx `Catalog = "Business"`).

### Social (SocialService, PhoneService, ModerationService)
* `PhoneService:SendSystemMessage(p, fromName, text)` (bank alerts, rent reminders, job offers),
  `PhoneService:PostToFeed(p?, text)` (system or player posts).
* `SocialService:SetRPName(p, name)`; name tags are built from player attributes (§6).
* `ModerationService:IsBlocked(a, b) -> bool` (Player or UserId), `:FilterText(text, fromPlayer, toPlayer?) -> string?` (TextService, nil on failure),
  `:IsAdmin(p)`. `SocialService:SetBio`, `:GetGroupOf(p)`, `:OnBlocked(p, userId)`.

## 6. Player attributes (server sets, everyone reads)
`DataLoaded`, `IsNewPlayer`, `VIP`, `Pass_<key>`, `WealthTier` (1–6), `WealthTitle`, `NetWorth`, `JobId` (""), `JobLevel`,
`RPName`, `Bio`, `InVehicle` (bool), `Seatbelt` (bool), `InSafeZone` (bool), `District`, `HouseId`, `GroupName`, `AFK`, `EmployerName`,
`JobTitle`, `Cuffed` (bool; Police roleplay arrest), `Wanted` (bool; set 60 s after hitting a pedestrian at speed outside safe zones, cleared on arrest),
`HideVipTag` (bool), employee attributes `BizRole`, `BizWage`, `BizEmployerLot`, `BizEmployerKey`.
Client-only: LocalPlayer attribute `LowGraphics` (bool, SettingsController); SoundService SoundGroups `Music`, `SFX`, `Radio` (created client-side if missing).

## 7. CollectionService tags
Defined in `Shared/Config/World.Tags`. The procedural city (WorldBuilder) creates all of them; real models just need the same tag + attributes.
JobTarget `Kind`s: `Delivery` (Pizza), `Pickup`/`Dropoff` (Taxi), `PatrolPoint` (Police), `FireSpot` (Fire), `PatientSpot` (Paramedic),
`RepairSpot` (Mechanic), `Register` (Cashier), `Stove` (Chef), `Showroom` (CarSales), `Showing` (RealEstate), `ConstructionSite` (Construction).
Paramedic also uses Kind `Dropoff` (hospital ambulance bay).
With **StreamingEnabled**, clients must use `CollectionService:GetInstanceAddedSignal(tag)` and never assume a part exists.

Optional / extra attributes: `ApartmentUnit` `HasShell=true` (the model already has walls; Housing skips its interior shell); occupied plots get
`OwnerUserId, OwnerName, HouseName, Locked, Occupied, ContextId`; `TuningShop` `ShopName`; `Dealership` `DealerName`; `MechanicBay` `Bay`;
`VIPDoor` `InsideCFrame/OutsideCFrame`; `VIPArea` `ExitCFrame`; `Elevator` `Label`; `Leaderboard` `BoardTitle`, `Face`;
`PartyZone` `Zone` ("Beach"|"Park"|"Club"), `Active`, `Name`. Vehicle-perk markers (tag names in `Config/Vehicles`, server-only):
`VipParkingBay` (`Bay` index; invisible volumes in the VIP Car Park) and `PremiumShowcasePad` (`Pad` index; Meet Lot pads). Runtime tags (not built by WorldBuilder): `DealershipDisplayCar`
(showroom car models: `ModelId, DisplaySlot, IsDisplay`) and `SkylineVehicle` (every spawned car).

Ownership: World (`World/Access`) does Elevator rides and the VIPDoor prompt; Monetization does the pass purchase offer on elevators,
VIPArea enforcement and VIPDoor collision. Each tagged part gets at most one prompt per purpose.

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
Rig extensions: Motor6D attributes `OpenAxis/OpenAngle/Drop/SlideDistance/Lift/FoldAngle`; lamp attributes `LampKind/OnColor/OffColor/SirenGroup`;
Chassis attachments `Entry_<door>` and `SoundEmitter`; model attributes `Up_<upgrade>`, `Plate`, `Paint`, `Underglow`, `EngineDead`, `Refueling`;
CollectionService tag `SkylineVehicle`.

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
* Scripted cameras go through `Client/Util/CameraOwner` (Drive 10 < Build 20 < Orbit 30 < Selfie 40) and only write the camera while
  `IsMine(id)`. In VR (`VRService.VREnabled`) CameraOwner never grants ownership, so the headset keeps the default VR camera.
  Keybinds and conflict rules: `docs/CONTROLS.md`.
* Parody brands only — never a real car brand, logo or model name.
* Robux never sells unbeatable advantages; everything important is earnable with cash.
