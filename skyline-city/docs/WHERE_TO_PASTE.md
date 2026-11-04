# Where every script goes in Roblox Studio

**You do not need this if you open `SkylineCity.rbxlx`** — that file already has every script in the right place.
Use this list only if you want to paste scripts by hand (or to find a script inside Studio).

How to read it: `ServerScriptService → Server → Services → BankService` means: in the Explorer, inside **ServerScriptService** make a **Folder** named `Server`, inside it a Folder `Services`, and inside that a script named `BankService` of the type shown. Script names must match exactly (no `.luau` ending).

- **Script** = server Script  •  **LocalScript** = client LocalScript  •  **ModuleScript** = ModuleScript
- Every name in the path that is not the last one is a **Folder**.

Total: 260 scripts.

| File in this repo | Put it in Studio at | Type |
|---|---|---|
| `src/shared/DataTemplate.luau` | ReplicatedStorage → Shared → DataTemplate | **ModuleScript** |
| `src/shared/Net.luau` | ReplicatedStorage → Shared → Net | **ModuleScript** |
| `src/shared/Build/BuildMath.luau` | ReplicatedStorage → Shared → Build → BuildMath | **ModuleScript** |
| `src/shared/Build/FurnitureBuilder.luau` | ReplicatedStorage → Shared → Build → FurnitureBuilder | **ModuleScript** |
| `src/shared/Build/Serializer.luau` | ReplicatedStorage → Shared → Build → Serializer | **ModuleScript** |
| `src/shared/Config/Ambient.luau` | ReplicatedStorage → Shared → Config → Ambient | **ModuleScript** |
| `src/shared/Config/AntiExploit.luau` | ReplicatedStorage → Shared → Config → AntiExploit | **ModuleScript** |
| `src/shared/Config/Audio.luau` | ReplicatedStorage → Shared → Config → Audio | **ModuleScript** |
| `src/shared/Config/Brands.luau` | ReplicatedStorage → Shared → Config → Brands | **ModuleScript** |
| `src/shared/Config/Businesses.luau` | ReplicatedStorage → Shared → Config → Businesses | **ModuleScript** |
| `src/shared/Config/Cars.luau` | ReplicatedStorage → Shared → Config → Cars | **ModuleScript** |
| `src/shared/Config/CityLayout.luau` | ReplicatedStorage → Shared → Config → CityLayout | **ModuleScript** |
| `src/shared/Config/Clothing.luau` | ReplicatedStorage → Shared → Config → Clothing | **ModuleScript** |
| `src/shared/Config/Dealership.luau` | ReplicatedStorage → Shared → Config → Dealership | **ModuleScript** |
| `src/shared/Config/Driving.luau` | ReplicatedStorage → Shared → Config → Driving | **ModuleScript** |
| `src/shared/Config/Economy.luau` | ReplicatedStorage → Shared → Config → Economy | **ModuleScript** |
| `src/shared/Config/Events.luau` | ReplicatedStorage → Shared → Config → Events | **ModuleScript** |
| `src/shared/Config/Furniture.luau` | ReplicatedStorage → Shared → Config → Furniture | **ModuleScript** |
| `src/shared/Config/Housing.luau` | ReplicatedStorage → Shared → Config → Housing | **ModuleScript** |
| `src/shared/Config/Jobs.luau` | ReplicatedStorage → Shared → Config → Jobs | **ModuleScript** |
| `src/shared/Config/Monetization.luau` | ReplicatedStorage → Shared → Config → Monetization | **ModuleScript** |
| `src/shared/Config/Phone.luau` | ReplicatedStorage → Shared → Config → Phone | **ModuleScript** |
| `src/shared/Config/Social.luau` | ReplicatedStorage → Shared → Config → Social | **ModuleScript** |
| `src/shared/Config/Tuning.luau` | ReplicatedStorage → Shared → Config → Tuning | **ModuleScript** |
| `src/shared/Config/Tutorial.luau` | ReplicatedStorage → Shared → Config → Tutorial | **ModuleScript** |
| `src/shared/Config/Vehicles.luau` | ReplicatedStorage → Shared → Config → Vehicles | **ModuleScript** |
| `src/shared/Config/World.luau` | ReplicatedStorage → Shared → Config → World | **ModuleScript** |
| `src/shared/Util/Format.luau` | ReplicatedStorage → Shared → Util → Format | **ModuleScript** |
| `src/shared/Util/Maid.luau` | ReplicatedStorage → Shared → Util → Maid | **ModuleScript** |
| `src/shared/Util/Pool.luau` | ReplicatedStorage → Shared → Util → Pool | **ModuleScript** |
| `src/shared/Util/Signal.luau` | ReplicatedStorage → Shared → Util → Signal | **ModuleScript** |
| `src/shared/Util/Table.luau` | ReplicatedStorage → Shared → Util → Table | **ModuleScript** |
| `src/shared/Vehicle/Looks.luau` | ReplicatedStorage → Shared → Vehicle → Looks | **ModuleScript** |
| `src/shared/Vehicle/TorqueCurve.luau` | ReplicatedStorage → Shared → Vehicle → TorqueCurve | **ModuleScript** |
| `src/shared/Vehicle/Units.luau` | ReplicatedStorage → Shared → Vehicle → Units | **ModuleScript** |
| `src/shared/Vehicle/VehicleStats.luau` | ReplicatedStorage → Shared → Vehicle → VehicleStats | **ModuleScript** |
| `src/shared/World/RoadGraph.luau` | ReplicatedStorage → Shared → World → RoadGraph | **ModuleScript** |
| `src/first/Loading.client.luau` | ReplicatedFirst → Loading → Loading | **LocalScript** |
| `src/server/Main.server.luau` | ServerScriptService → Server → Main | **Script** |
| `src/server/Registry.luau` | ServerScriptService → Server → Registry | **ModuleScript** |
| `src/server/Lib/Guard.luau` | ServerScriptService → Server → Lib → Guard | **ModuleScript** |
| `src/server/Lib/ProfileStore.luau` | ServerScriptService → Server → Lib → ProfileStore | **ModuleScript** |
| `src/server/Services/AntiExploitService.luau` | ServerScriptService → Server → Services → AntiExploitService | **ModuleScript** |
| `src/server/Services/BankService.luau` | ServerScriptService → Server → Services → BankService | **ModuleScript** |
| `src/server/Services/DailyRewardService.luau` | ServerScriptService → Server → Services → DailyRewardService | **ModuleScript** |
| `src/server/Services/DataService.luau` | ServerScriptService → Server → Services → DataService | **ModuleScript** |
| `src/server/Services/EconomyService.luau` | ServerScriptService → Server → Services → EconomyService | **ModuleScript** |
| `src/server/Services/ModerationService.luau` | ServerScriptService → Server → Services → ModerationService | **ModuleScript** |
| `src/server/Services/NotifyService.luau` | ServerScriptService → Server → Services → NotifyService | **ModuleScript** |
| `src/server/Services/PhoneService.luau` | ServerScriptService → Server → Services → PhoneService | **ModuleScript** |
| `src/server/Services/SettingsService.luau` | ServerScriptService → Server → Services → SettingsService | **ModuleScript** |
| `src/server/Services/SocialService.luau` | ServerScriptService → Server → Services → SocialService | **ModuleScript** |
| `src/server/Services/TutorialService.luau` | ServerScriptService → Server → Services → TutorialService | **ModuleScript** |
| `src/server/Services/WealthService.luau` | ServerScriptService → Server → Services → WealthService | **ModuleScript** |
| `src/server/Services/Business/BizMath.luau` | ServerScriptService → Server → Services → Business → BizMath | **ModuleScript** |
| `src/server/Services/Business/BizState.luau` | ServerScriptService → Server → Services → Business → BizState | **ModuleScript** |
| `src/server/Services/Business/BusinessService.luau` | ServerScriptService → Server → Services → Business → BusinessService | **ModuleScript** |
| `src/server/Services/Business/Income.luau` | ServerScriptService → Server → Services → Business → Income | **ModuleScript** |
| `src/server/Services/Business/Ledger.luau` | ServerScriptService → Server → Services → Business → Ledger | **ModuleScript** |
| `src/server/Services/Business/Lots.luau` | ServerScriptService → Server → Services → Business → Lots | **ModuleScript** |
| `src/server/Services/Business/Shell.luau` | ServerScriptService → Server → Services → Business → Shell | **ModuleScript** |
| `src/server/Services/Business/Staff.luau` | ServerScriptService → Server → Services → Business → Staff | **ModuleScript** |
| `src/server/Services/Business/Stations.luau` | ServerScriptService → Server → Services → Business → Stations | **ModuleScript** |
| `src/server/Services/Economy/WealthBoards.luau` | ServerScriptService → Server → Services → Economy → WealthBoards | **ModuleScript** |
| `src/server/Services/Housing/BuildService.luau` | ServerScriptService → Server → Services → Housing → BuildService | **ModuleScript** |
| `src/server/Services/Housing/BuildValidator.luau` | ServerScriptService → Server → Services → Housing → BuildValidator | **ModuleScript** |
| `src/server/Services/Housing/FurnitureFactory.luau` | ServerScriptService → Server → Services → Housing → FurnitureFactory | **ModuleScript** |
| `src/server/Services/Housing/HouseShell.luau` | ServerScriptService → Server → Services → Housing → HouseShell | **ModuleScript** |
| `src/server/Services/Housing/HousingService.luau` | ServerScriptService → Server → Services → Housing → HousingService | **ModuleScript** |
| `src/server/Services/Housing/Interactables.luau` | ServerScriptService → Server → Services → Housing → Interactables | **ModuleScript** |
| `src/server/Services/Housing/PlotManager.luau` | ServerScriptService → Server → Services → Housing → PlotManager | **ModuleScript** |
| `src/server/Services/Housing/RealEstateService.luau` | ServerScriptService → Server → Services → Housing → RealEstateService | **ModuleScript** |
| `src/server/Services/Jobs/CarSales.luau` | ServerScriptService → Server → Services → Jobs → CarSales | **ModuleScript** |
| `src/server/Services/Jobs/Cashier.luau` | ServerScriptService → Server → Services → Jobs → Cashier | **ModuleScript** |
| `src/server/Services/Jobs/Chef.luau` | ServerScriptService → Server → Services → Jobs → Chef | **ModuleScript** |
| `src/server/Services/Jobs/Construction.luau` | ServerScriptService → Server → Services → Jobs → Construction | **ModuleScript** |
| `src/server/Services/Jobs/Fire.luau` | ServerScriptService → Server → Services → Jobs → Fire | **ModuleScript** |
| `src/server/Services/Jobs/JobService.luau` | ServerScriptService → Server → Services → Jobs → JobService | **ModuleScript** |
| `src/server/Services/Jobs/Mechanic.luau` | ServerScriptService → Server → Services → Jobs → Mechanic | **ModuleScript** |
| `src/server/Services/Jobs/Npc.luau` | ServerScriptService → Server → Services → Jobs → Npc | **ModuleScript** |
| `src/server/Services/Jobs/Paramedic.luau` | ServerScriptService → Server → Services → Jobs → Paramedic | **ModuleScript** |
| `src/server/Services/Jobs/Pizza.luau` | ServerScriptService → Server → Services → Jobs → Pizza | **ModuleScript** |
| `src/server/Services/Jobs/Police.luau` | ServerScriptService → Server → Services → Jobs → Police | **ModuleScript** |
| `src/server/Services/Jobs/Props.luau` | ServerScriptService → Server → Services → Jobs → Props | **ModuleScript** |
| `src/server/Services/Jobs/RealEstate.luau` | ServerScriptService → Server → Services → Jobs → RealEstate | **ModuleScript** |
| `src/server/Services/Jobs/Targets.luau` | ServerScriptService → Server → Services → Jobs → Targets | **ModuleScript** |
| `src/server/Services/Jobs/Taxi.luau` | ServerScriptService → Server → Services → Jobs → Taxi | **ModuleScript** |
| `src/server/Services/Jobs/Uniform.luau` | ServerScriptService → Server → Services → Jobs → Uniform | **ModuleScript** |
| `src/server/Services/Monetization/ClothingFactory.luau` | ServerScriptService → Server → Services → Monetization → ClothingFactory | **ModuleScript** |
| `src/server/Services/Monetization/ClothingService.luau` | ServerScriptService → Server → Services → Monetization → ClothingService | **ModuleScript** |
| `src/server/Services/Monetization/Cosmetics.luau` | ServerScriptService → Server → Services → Monetization → Cosmetics | **ModuleScript** |
| `src/server/Services/Monetization/Elevators.luau` | ServerScriptService → Server → Services → Monetization → Elevators | **ModuleScript** |
| `src/server/Services/Monetization/MonUtil.luau` | ServerScriptService → Server → Services → Monetization → MonUtil | **ModuleScript** |
| `src/server/Services/Monetization/MonetizationService.luau` | ServerScriptService → Server → Services → Monetization → MonetizationService | **ModuleScript** |
| `src/server/Services/Monetization/Receipts.luau` | ServerScriptService → Server → Services → Monetization → Receipts | **ModuleScript** |
| `src/server/Services/Monetization/VIPService.luau` | ServerScriptService → Server → Services → Monetization → VIPService | **ModuleScript** |
| `src/server/Services/Social/Groups.luau` | ServerScriptService → Server → Services → Social → Groups | **ModuleScript** |
| `src/server/Services/Social/NameTags.luau` | ServerScriptService → Server → Services → Social → NameTags | **ModuleScript** |
| `src/server/Services/Social/Parties.luau` | ServerScriptService → Server → Services → Social → Parties | **ModuleScript** |
| `src/server/Services/Social/Seats.luau` | ServerScriptService → Server → Services → Social → Seats | **ModuleScript** |
| `src/server/Services/Vehicles/CarActions.luau` | ServerScriptService → Server → Services → Vehicles → CarActions | **ModuleScript** |
| `src/server/Services/Vehicles/CarBody.luau` | ServerScriptService → Server → Services → Vehicles → CarBody | **ModuleScript** |
| `src/server/Services/Vehicles/CarBuilder.luau` | ServerScriptService → Server → Services → Vehicles → CarBuilder | **ModuleScript** |
| `src/server/Services/Vehicles/CarCabin.luau` | ServerScriptService → Server → Services → Vehicles → CarCabin | **ModuleScript** |
| `src/server/Services/Vehicles/CarDetails.luau` | ServerScriptService → Server → Services → Vehicles → CarDetails | **ModuleScript** |
| `src/server/Services/Vehicles/CarKit.luau` | ServerScriptService → Server → Services → Vehicles → CarKit | **ModuleScript** |
| `src/server/Services/Vehicles/CarLayout.luau` | ServerScriptService → Server → Services → Vehicles → CarLayout | **ModuleScript** |
| `src/server/Services/Vehicles/CarLooks.luau` | ServerScriptService → Server → Services → Vehicles → CarLooks | **ModuleScript** |
| `src/server/Services/Vehicles/CarRig.luau` | ServerScriptService → Server → Services → Vehicles → CarRig | **ModuleScript** |
| `src/server/Services/Vehicles/CarScooter.luau` | ServerScriptService → Server → Services → Vehicles → CarScooter | **ModuleScript** |
| `src/server/Services/Vehicles/DealershipService.luau` | ServerScriptService → Server → Services → Vehicles → DealershipService | **ModuleScript** |
| `src/server/Services/Vehicles/FuelService.luau` | ServerScriptService → Server → Services → Vehicles → FuelService | **ModuleScript** |
| `src/server/Services/Vehicles/Garage.luau` | ServerScriptService → Server → Services → Vehicles → Garage | **ModuleScript** |
| `src/server/Services/Vehicles/MechanicService.luau` | ServerScriptService → Server → Services → Vehicles → MechanicService | **ModuleScript** |
| `src/server/Services/Vehicles/Occupancy.luau` | ServerScriptService → Server → Services → Vehicles → Occupancy | **ModuleScript** |
| `src/server/Services/Vehicles/Plates.luau` | ServerScriptService → Server → Services → Vehicles → Plates | **ModuleScript** |
| `src/server/Services/Vehicles/SafeZones.luau` | ServerScriptService → Server → Services → Vehicles → SafeZones | **ModuleScript** |
| `src/server/Services/Vehicles/Showcase.luau` | ServerScriptService → Server → Services → Vehicles → Showcase | **ModuleScript** |
| `src/server/Services/Vehicles/Spawner.luau` | ServerScriptService → Server → Services → Vehicles → Spawner | **ModuleScript** |
| `src/server/Services/Vehicles/TuningService.luau` | ServerScriptService → Server → Services → Vehicles → TuningService | **ModuleScript** |
| `src/server/Services/Vehicles/VehicleService.luau` | ServerScriptService → Server → Services → Vehicles → VehicleService | **ModuleScript** |
| `src/server/Services/Vehicles/Watchdog.luau` | ServerScriptService → Server → Services → Vehicles → Watchdog | **ModuleScript** |
| `src/server/Services/Vehicles/Dealer/Catalog.luau` | ServerScriptService → Server → Services → Vehicles → Dealer → Catalog | **ModuleScript** |
| `src/server/Services/Vehicles/Dealer/Common.luau` | ServerScriptService → Server → Services → Vehicles → Dealer → Common | **ModuleScript** |
| `src/server/Services/Vehicles/Dealer/Displays.luau` | ServerScriptService → Server → Services → Vehicles → Dealer → Displays | **ModuleScript** |
| `src/server/Services/Vehicles/Dealer/Finance.luau` | ServerScriptService → Server → Services → Vehicles → Dealer → Finance | **ModuleScript** |
| `src/server/Services/Vehicles/Dealer/TestDrive.luau` | ServerScriptService → Server → Services → Vehicles → Dealer → TestDrive | **ModuleScript** |
| `src/server/Services/Vehicles/Dealer/TuningPricing.luau` | ServerScriptService → Server → Services → Vehicles → Dealer → TuningPricing | **ModuleScript** |
| `src/server/Services/World/Access.luau` | ServerScriptService → Server → Services → World → Access | **ModuleScript** |
| `src/server/Services/World/Buildings.luau` | ServerScriptService → Server → Services → World → Buildings | **ModuleScript** |
| `src/server/Services/World/EventService.luau` | ServerScriptService → Server → Services → World → EventService | **ModuleScript** |
| `src/server/Services/World/Gameplay.luau` | ServerScriptService → Server → Services → World → Gameplay | **ModuleScript** |
| `src/server/Services/World/Props.luau` | ServerScriptService → Server → Services → World → Props | **ModuleScript** |
| `src/server/Services/World/RoadBuilder.luau` | ServerScriptService → Server → Services → World → RoadBuilder | **ModuleScript** |
| `src/server/Services/World/Weather.luau` | ServerScriptService → Server → Services → World → Weather | **ModuleScript** |
| `src/server/Services/World/WorldBuilder.luau` | ServerScriptService → Server → Services → World → WorldBuilder | **ModuleScript** |
| `src/server/Services/World/WorldService.luau` | ServerScriptService → Server → Services → World → WorldService | **ModuleScript** |
| `src/server/Services/World/Zones.luau` | ServerScriptService → Server → Services → World → Zones | **ModuleScript** |
| `src/server/Services/World/Builders/AutoStrip.luau` | ServerScriptService → Server → Services → World → Builders → AutoStrip | **ModuleScript** |
| `src/server/Services/World/Builders/Beach.luau` | ServerScriptService → Server → Services → World → Builders → Beach | **ModuleScript** |
| `src/server/Services/World/Builders/Civic.luau` | ServerScriptService → Server → Services → World → Builders → Civic | **ModuleScript** |
| `src/server/Services/World/Builders/Downtown.luau` | ServerScriptService → Server → Services → World → Builders → Downtown | **ModuleScript** |
| `src/server/Services/World/Builders/Industrial.luau` | ServerScriptService → Server → Services → World → Builders → Industrial | **ModuleScript** |
| `src/server/Services/World/Builders/Mall.luau` | ServerScriptService → Server → Services → World → Builders → Mall | **ModuleScript** |
| `src/server/Services/World/Builders/Park.luau` | ServerScriptService → Server → Services → World → Builders → Park | **ModuleScript** |
| `src/server/Services/World/Builders/Streets.luau` | ServerScriptService → Server → Services → World → Builders → Streets | **ModuleScript** |
| `src/server/Services/World/Builders/Suburbs.luau` | ServerScriptService → Server → Services → World → Builders → Suburbs | **ModuleScript** |
| `src/client/ClientData.luau` | StarterPlayer → StarterPlayerScripts → Client → ClientData | **ModuleScript** |
| `src/client/Main.client.luau` | StarterPlayer → StarterPlayerScripts → Client → Main | **LocalScript** |
| `src/client/Registry.luau` | StarterPlayer → StarterPlayerScripts → Client → Registry | **ModuleScript** |
| `src/client/Controllers/BankController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → BankController | **ModuleScript** |
| `src/client/Controllers/DailyRewardController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → DailyRewardController | **ModuleScript** |
| `src/client/Controllers/EmoteController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → EmoteController | **ModuleScript** |
| `src/client/Controllers/HUDController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → HUDController | **ModuleScript** |
| `src/client/Controllers/ModerationController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → ModerationController | **ModuleScript** |
| `src/client/Controllers/PhoneController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → PhoneController | **ModuleScript** |
| `src/client/Controllers/SettingsController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → SettingsController | **ModuleScript** |
| `src/client/Controllers/SocialController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → SocialController | **ModuleScript** |
| `src/client/Controllers/TutorialController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → TutorialController | **ModuleScript** |
| `src/client/Controllers/WealthController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → WealthController | **ModuleScript** |
| `src/client/Controllers/Business/BizWidgets.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Business → BizWidgets | **ModuleScript** |
| `src/client/Controllers/Business/BusinessController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Business → BusinessController | **ModuleScript** |
| `src/client/Controllers/Business/CustomerSim.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Business → CustomerSim | **ModuleScript** |
| `src/client/Controllers/Business/Dashboard.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Business → Dashboard | **ModuleScript** |
| `src/client/Controllers/Business/ShopPanels.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Business → ShopPanels | **ModuleScript** |
| `src/client/Controllers/Business/StartFlow.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Business → StartFlow | **ModuleScript** |
| `src/client/Controllers/Business/WorkHud.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Business → WorkHud | **ModuleScript** |
| `src/client/Controllers/Dealership/CarPreview.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → CarPreview | **ModuleScript** |
| `src/client/Controllers/Dealership/CatalogPanel.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → CatalogPanel | **ModuleScript** |
| `src/client/Controllers/Dealership/ColorPicker.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → ColorPicker | **ModuleScript** |
| `src/client/Controllers/Dealership/DealerUI.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → DealerUI | **ModuleScript** |
| `src/client/Controllers/Dealership/DealershipController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → DealershipController | **ModuleScript** |
| `src/client/Controllers/Dealership/DisplayTurntable.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → DisplayTurntable | **ModuleScript** |
| `src/client/Controllers/Dealership/LookPreview.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → LookPreview | **ModuleScript** |
| `src/client/Controllers/Dealership/OrbitCamera.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → OrbitCamera | **ModuleScript** |
| `src/client/Controllers/Dealership/TestDriveHud.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → TestDriveHud | **ModuleScript** |
| `src/client/Controllers/Dealership/TuningController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → TuningController | **ModuleScript** |
| `src/client/Controllers/Dealership/TuningPanel.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Dealership → TuningPanel | **ModuleScript** |
| `src/client/Controllers/Economy/BankPanel.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Economy → BankPanel | **ModuleScript** |
| `src/client/Controllers/Economy/Confetti.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Economy → Confetti | **ModuleScript** |
| `src/client/Controllers/Economy/UIBits.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Economy → UIBits | **ModuleScript** |
| `src/client/Controllers/Housing/BuildCamera.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Housing → BuildCamera | **ModuleScript** |
| `src/client/Controllers/Housing/BuildController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Housing → BuildController | **ModuleScript** |
| `src/client/Controllers/Housing/BuildPreview.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Housing → BuildPreview | **ModuleScript** |
| `src/client/Controllers/Housing/BuildState.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Housing → BuildState | **ModuleScript** |
| `src/client/Controllers/Housing/BuildUI.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Housing → BuildUI | **ModuleScript** |
| `src/client/Controllers/Housing/HousingController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Housing → HousingController | **ModuleScript** |
| `src/client/Controllers/Housing/RealEstateController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Housing → RealEstateController | **ModuleScript** |
| `src/client/Controllers/Housing/RealEstateTabs.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Housing → RealEstateTabs | **ModuleScript** |
| `src/client/Controllers/Jobs/JobController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → JobController | **ModuleScript** |
| `src/client/Controllers/Jobs/JobEffects.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → JobEffects | **ModuleScript** |
| `src/client/Controllers/Jobs/JobPanels.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → JobPanels | **ModuleScript** |
| `src/client/Controllers/Jobs/JobTracker.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → JobTracker | **ModuleScript** |
| `src/client/Controllers/Jobs/JobWaypoint.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → JobWaypoint | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Choice.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Choice | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Common.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Common | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Cpr.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Cpr | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Cuff.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Cuff | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Hammer.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Hammer | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Listings.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Listings | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Parts.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Parts | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Recipe.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Recipe | **ModuleScript** |
| `src/client/Controllers/Jobs/Minigames/Register.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Jobs → Minigames → Register | **ModuleScript** |
| `src/client/Controllers/Phone/AppKit.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → AppKit | **ModuleScript** |
| `src/client/Controllers/Phone/CameraApp.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → CameraApp | **ModuleScript** |
| `src/client/Controllers/Phone/Contacts.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → Contacts | **ModuleScript** |
| `src/client/Controllers/Phone/FeedApp.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → FeedApp | **ModuleScript** |
| `src/client/Controllers/Phone/MapApp.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → MapApp | **ModuleScript** |
| `src/client/Controllers/Phone/Messages.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → Messages | **ModuleScript** |
| `src/client/Controllers/Phone/PhoneState.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → PhoneState | **ModuleScript** |
| `src/client/Controllers/Phone/ProfileApp.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → ProfileApp | **ModuleScript** |
| `src/client/Controllers/Phone/Waypoint.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Phone → Waypoint | **ModuleScript** |
| `src/client/Controllers/Shop/ClothingController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Shop → ClothingController | **ModuleScript** |
| `src/client/Controllers/Shop/ItemPreview.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Shop → ItemPreview | **ModuleScript** |
| `src/client/Controllers/Shop/ShopController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Shop → ShopController | **ModuleScript** |
| `src/client/Controllers/Shop/ShopWidgets.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Shop → ShopWidgets | **ModuleScript** |
| `src/client/Controllers/Shop/VIPController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Shop → VIPController | **ModuleScript** |
| `src/client/Controllers/Social/PlayerActionsPanel.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Social → PlayerActionsPanel | **ModuleScript** |
| `src/client/Controllers/Social/PoseRenderer.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Social → PoseRenderer | **ModuleScript** |
| `src/client/Controllers/Social/VoiceZones.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Social → VoiceZones | **ModuleScript** |
| `src/client/Controllers/Vehicle/CarVisualsController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → CarVisualsController | **ModuleScript** |
| `src/client/Controllers/Vehicle/DashboardController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → DashboardController | **ModuleScript** |
| `src/client/Controllers/Vehicle/DriveController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → DriveController | **ModuleScript** |
| `src/client/Controllers/Vehicle/GarageController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → GarageController | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/Actions.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → Actions | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/CarControlsPanel.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → CarControlsPanel | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/Chassis.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → Chassis | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/DashboardUI.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → DashboardUI | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/DriveAudio.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → DriveAudio | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/DriveInput.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → DriveInput | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/Mirrors.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → Mirrors | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/MobileControls.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → MobileControls | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/Powertrain.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → Powertrain | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/Suspension.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → Suspension | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/Tires.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → Tires | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/Upgrades.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → Upgrades | **ModuleScript** |
| `src/client/Controllers/Vehicle/Drive/VehicleCamera.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Drive → VehicleCamera | **ModuleScript** |
| `src/client/Controllers/Vehicle/Garage/FuelPanel.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Garage → FuelPanel | **ModuleScript** |
| `src/client/Controllers/Vehicle/Garage/GaragePanel.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Garage → GaragePanel | **ModuleScript** |
| `src/client/Controllers/Vehicle/Garage/RepairPanel.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Garage → RepairPanel | **ModuleScript** |
| `src/client/Controllers/Vehicle/Garage/Widgets.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Garage → Widgets | **ModuleScript** |
| `src/client/Controllers/Vehicle/Visuals/CarAnimator.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Visuals → CarAnimator | **ModuleScript** |
| `src/client/Controllers/Vehicle/Visuals/CarLights.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Visuals → CarLights | **ModuleScript** |
| `src/client/Controllers/Vehicle/Visuals/CarSounds.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Visuals → CarSounds | **ModuleScript** |
| `src/client/Controllers/Vehicle/Visuals/Radio.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → Vehicle → Visuals → Radio | **ModuleScript** |
| `src/client/Controllers/World/AmbientController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → AmbientController | **ModuleScript** |
| `src/client/Controllers/World/EventController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → EventController | **ModuleScript** |
| `src/client/Controllers/World/EventFx.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → EventFx | **ModuleScript** |
| `src/client/Controllers/World/NavGraph.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → NavGraph | **ModuleScript** |
| `src/client/Controllers/World/NpcModels.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → NpcModels | **ModuleScript** |
| `src/client/Controllers/World/PedestrianController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → PedestrianController | **ModuleScript** |
| `src/client/Controllers/World/StreetlightController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → StreetlightController | **ModuleScript** |
| `src/client/Controllers/World/TrafficController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → TrafficController | **ModuleScript** |
| `src/client/Controllers/World/VipDoors.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → VipDoors | **ModuleScript** |
| `src/client/Controllers/World/WeatherController.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → WeatherController | **ModuleScript** |
| `src/client/Controllers/World/WorldClock.luau` | StarterPlayer → StarterPlayerScripts → Client → Controllers → World → WorldClock | **ModuleScript** |
| `src/client/UI/Kit.luau` | StarterPlayer → StarterPlayerScripts → Client → UI → Kit | **ModuleScript** |
| `src/client/UI/Router.luau` | StarterPlayer → StarterPlayerScripts → Client → UI → Router | **ModuleScript** |
| `src/client/UI/Theme.luau` | StarterPlayer → StarterPlayerScripts → Client → UI → Theme | **ModuleScript** |
| `src/client/Util/CameraOwner.luau` | StarterPlayer → StarterPlayerScripts → Client → Util → CameraOwner | **ModuleScript** |
