# SKYLINE CITY

City roleplay and lifestyle game for Roblox, written in Luau (260 scripts).

## Getting it into Roblox Studio

**Easiest: open the ready-made place file.** No pasting needed.

1. Build it with `python3 tools/build_place.py`, which writes `SkylineCity.rbxlx` (or use the copy you were sent).
2. Open Roblox Studio, then **File → Open from File…** and pick `SkylineCity.rbxlx`.
3. **File → Publish to Roblox**.
4. Go to **Home → Game Settings → Security** and turn on **Enable Studio Access to API Services**, so that saving works.
5. Press **Play**.

**For developers: Rojo.** Run `rojo serve` and connect the Rojo Studio plugin. `default.project.json` describes the layout.

**By hand:** see [docs/WHERE_TO_PASTE.md](docs/WHERE_TO_PASTE.md) for the exact Studio location and script type of every file.

## More docs

- [docs/SETUP.md](docs/SETUP.md): setup and the checklist before publishing
- [docs/MONETIZATION.md](docs/MONETIZATION.md): setting up gamepasses and developer products
- [docs/ASSETS.md](docs/ASSETS.md): 3D models to replace the greybox city
- [docs/CONTROLS.md](docs/CONTROLS.md): controls for PC, mobile and controller
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code fits together

## Status

Every script passes the syntax and structure checker (`python3 tools/luau_check.py src`). The game has **not yet been play-tested in Studio**, so expect some runtime bugs on first launch. Check the Output window and report any errors you see.
