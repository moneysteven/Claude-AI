# 3D models and assets to make or get

Everything works out of the box with **procedural greybox** models generated from Parts. To make it look premium, add real models.
**Name each model after its config id** and put it in the matching `ServerStorage.Assets` folder. The game then uses it instead of the greybox.

> Creator Store: https://create.roblox.com/store → Models / Audio. Only use items that allow use in your experience. Check every
> model for **scripts** before inserting it: delete any you didn't expect (free models sometimes contain backdoors). Prefer low-poly,
> MeshPart-based models with fewer than ~5k triangles each for mobile.

## Cars — `ServerStorage.Assets.Cars/<modelId>` (highest impact)

Code can't sculpt a detailed car body, so this is where custom 3D work matters most. Make the cars in **Blender**, or commission original low-poly
cars. **Don't import ripped real cars and don't use real brand logos.** The parody brands (Bavaria Motors/BVM, Mercato, Lambretta, Porza,
Toyoda, Fjord, Teslo, Audex, Rangel Rover…) need original badges.

Each car model must follow the **rig in docs/ARCHITECTURE.md §9**: `Chassis` primary part, `DriveSeat`, `Body/`, `Wheels/FL..RR`,
`Doors/FL..RR` with separate `Door` + `Window` parts and Motor6D joints, `Hood`, `Trunk`, `Sunroof`, `Roof` (convertibles), `Lights/…`,
`Mirrors/…`. Paintable parts get the attribute `Paint = true`, glass gets `Glass = true`.

| Need | Creator Store search terms (starting points / reference) |
|---|---|
| Sedan, coupe, hatch | "low poly sedan", "low poly car mesh", "car body mesh" |
| SUV / offroad | "low poly SUV", "jeep mesh low poly" |
| Supercar / hypercar | "low poly sports car", "supercar mesh" |
| Pickup / van | "low poly pickup truck", "low poly van" |
| Classic / muscle | "classic car low poly", "muscle car mesh" |
| Scooter (pizza job) | "low poly scooter", "moped mesh" |
| Job vehicles | "low poly police car", "fire truck low poly", "ambulance low poly", "tow truck", "dump truck low poly" |
| Wheels / rims | "car wheel mesh", "rim mesh", "tire mesh" (rims are swappable per `Config/Tuning.Rims`) |
| Car interior | "car interior low poly", "steering wheel mesh" |

## Buildings and city — `ServerStorage.Assets.Buildings/<id>` or replace `Workspace.City`

| Need | Search terms |
|---|---|
| Skyscrapers / office towers | "modular skyscraper", "low poly office building", "city building kit" |
| Apartments / interiors | "apartment interior", "modular apartment", "elevator" |
| Houses (shell for tiers) | "modern house low poly", "suburban house", "beach villa", "mansion" |
| Shops / mall | "shopping mall", "store front", "food court" |
| Civic | "police station", "fire station", "hospital low poly" |
| Gas station | "gas station low poly", "fuel pump" |
| Car dealership | "car dealership", "car showroom", "turntable platform" |
| Industrial | "warehouse low poly", "construction crane", "scaffolding", "shipping container" |
| Roads | "road kit", "modular road", "highway road", "traffic light", "street lamp" |
| Beach / park | "palm tree low poly", "boardwalk", "lifeguard tower", "park bench", "fountain", "low poly trees" |
| Props | "ATM machine", "trash can", "fire hydrant", "bus stop", "street sign", "parking meter" |

## Furniture — `ServerStorage.Assets.Furniture/<itemId>`

The catalogue (`Config/Furniture.luau`) has 120+ items. Replace the most-used ones first: bed, sofa, TV, kitchen set, dining table,
fridge, shower, toilet, desk, office chair, lamps and plants. Search: "low poly sofa", "bed mesh", "kitchen set low poly", "modern furniture pack",
"bathroom set", "office furniture", "restaurant kitchen", "clothing rack", "DJ booth", "bar counter".
Keep the model's pivot at the bottom-centre and its size close to the config `Size`. Seats and beds need a `Seat` part.

## NPCs — `ServerStorage.Assets.NPCs`

Traffic and pedestrians use cheap procedural models for performance. Optionally add "low poly pedestrian" or "R15 dummy" models (with no scripts).

## Clothing and accessories

Robux-exclusive items (chains, watches, sunglasses, sneakers, designer outfits) can use real **catalog asset IDs** you own or uploaded
(`AssetId` in `Config/Clothing.luau`). Leave them at 0 to keep the procedural versions. Shirts and pants use `ShirtTemplate`/`PantsTemplate` ids.
Make your own on the Creator Dashboard → Avatar items. Search terms for meshes: "gold chain accessory", "watch accessory", "sunglasses".

## UI icons and audio

- UI uses emoji/text icons, so no image uploads are required. You can swap in your own icons later.
- Audio (`Config/Audio.luau`): engine loop, horn, indicator tick, door, rain, city ambience, cash register, radio tracks.
  Search the Creator Store **Audio** tab: "car engine loop", "car horn", "turn signal", "rain loop", "city ambience",
  "cash register", "lofi", "synthwave", "pop instrumental". Only use tracks marked free to use.

## Logo and thumbnails

The game icon (512×512) and thumbnails (1920×1080) are made outside the code: screenshot the city at sunset and add the SKYLINE CITY title.
