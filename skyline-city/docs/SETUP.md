# SKYLINE CITY — Setup in Roblox Studio (step by step)

## 1. Install the tools (once)

1. **Roblox Studio** — https://create.roblox.com
2. **Rojo 7.4+** (syncs these files into Studio). Pick one:
   - With [Aftman](https://github.com/LPGhatguy/aftman) or [Rokit](https://github.com/rojo-rbx/rokit): `rokit add rojo-rbx/rojo` in this folder
   - Or download `rojo` from https://github.com/rojo-rbx/rojo/releases and put it on your PATH
3. **Rojo Studio plugin**: run `rojo plugin install`, or install "Rojo" from the Creator Store plugins.
4. (Recommended) VS Code + the **Luau Language Server** extension for autocomplete and type checking.

## 2. Create the place

1. Open Studio → **New → Baseplate**. Delete the default `Baseplate` and `SpawnLocation` (the project creates its own).
2. **File → Publish to Roblox** (choose a name like "SKYLINE CITY"). Saving needs a published place.
3. **Home → Game Settings**:
   - **Security** → turn ON *Enable Studio Access to API Services* (saving data in Studio) and *Allow HTTP Requests* (optional).
   - **Avatar** → Avatar Type **R15**. Leave scaling at the defaults.
   - **World** → leave gravity at 196.2.
   - **Places** → Server Fill → **Max Players 24** (the city has housing units for about 24 players; raise it after adding more plots).
4. Close Game Settings.

## 3. Sync the code

```bash
cd skyline-city
```

```bash
rojo serve
```

In Studio: **Plugins → Rojo → Connect** (localhost:34872). Every file in `src/` appears in Studio:

| Folder | Appears in Studio as |
|---|---|
| `src/server` | ServerScriptService › Server |
| `src/shared` | ReplicatedStorage › Shared |
| `src/client` | StarterPlayer › StarterPlayerScripts › Client |
| `src/first` | ReplicatedFirst › Loading |

Rojo also turns on **StreamingEnabled**, sets the lighting and adds a `ServerStorage.Assets` folder where your real 3D models go.

**Alternative (no Rojo, one time only):** `rojo build -o SkylineCity.rbxlx` then open the file in Studio.

## 4. Press Play

Press **Play**. On first run the server builds the whole greybox city: roads, highway, districts, plots, job stations, ATMs, dealership and so on. Check the Output window:

```
[SKYLINE CITY] server started with N services
```

- If you see `[ProfileStore] ... Using an in-memory MOCK store`, API access is off (step 2.3). The game still works, but nothing saves.
- To test with several players: **Test → Clients and Servers → 2 players → Start**.

### Keeping a hand-made city

The builder only runs when `Workspace.City` doesn't exist. To customise the map, press Play, select `Workspace.City` and copy it. Stop the game, paste it into Workspace and edit it in Edit mode. Keep the **tags and attributes** on the gameplay parts (see `docs/ARCHITECTURE.md` §7). You can also use the Tag Editor plugin or the built-in *Properties → Tags* section.

## 5. Gamepasses and developer products

See **docs/MONETIZATION.md**. Paste the IDs into `src/shared/Config/Monetization.luau` (and the clothing product IDs into `Config/Clothing.luau` if they're listed there).

## 6. Replace the greybox with real models

See **docs/ASSETS.md**. Put models in `ServerStorage.Assets/<Cars|Furniture|Buildings|NPCs|Clothing>` and name each one after its config id, for example `ServerStorage.Assets.Cars.porza_veloce`. The game uses your model instead of the procedural one. Car models must follow the rig in ARCHITECTURE §9.

## 7. Sounds and music

Paste audio asset ids into `src/shared/Config/Audio.luau`. Empty ids are skipped safely. Only use audio you have the rights to.

## 8. Change the numbers

Every price, wage, rent, interest rate and car stat is in `src/shared/Config/*.luau`:

| File | Controls |
|---|---|
| `Economy.luau` | starting cash, bank interest, daily rewards, wealth tiers, autosave |
| `Jobs.luau` | pay per task, raises per level, XP, slots |
| `Housing.luau` / `Furniture.luau` | rent, house prices, plot sizes, build limits, furniture prices |
| `Cars.luau` / `Brands.luau` / `Vehicles.luau` | car roster, prices, physics, fuel, garage slots, repair costs |
| `Dealership.luau` / `Tuning.luau` | finance, trade-in, paint/rims/upgrades prices and effects |
| `Businesses.luau` | lots, income, products, staff, upgrades |
| `Monetization.luau` / `Clothing.luau` | pass/product IDs, VIP perks, clothing catalogue |
| `World.luau` / `CityLayout.luau` / `Events.luau` | day length, weather, map layout, events |

## 9. Before you publish

- [ ] API Services on, real gamepass/product IDs pasted, `TestMode` off in `Config/Monetization.luau`
- [ ] Play-tested with 2+ players (Test → Clients and Servers)
- [ ] Tested on a phone in Studio's Device emulator (Test → Device) and with a controller
- [ ] Experience questionnaire filled in (Creator Dashboard → your experience → Audience → Maturity & compliance)
- [ ] Set the server size (Places → Max Players)

## Syntax check without Studio

```bash
python3 tools/luau_check.py src
```

This catches unbalanced blocks, brackets and strings. Studio's Script Analysis window (View → Script Analysis) shows type warnings.
