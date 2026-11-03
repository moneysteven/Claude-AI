#!/usr/bin/env python3
"""
Build a Roblox place file (SkylineCity.rbxlx) from default.project.json WITHOUT Rojo.

    python3 tools/build_place.py            -> writes SkylineCity.rbxlx next to default.project.json

Open the .rbxlx in Roblox Studio (File > Open from File), then File > Publish to Roblox.
Follows Rojo's file rules: folders -> Folder, *.server.luau -> Script, *.client.luau -> LocalScript,
other *.luau -> ModuleScript, init(.server/.client).luau turns the folder itself into that script.
"""
import json
import os
import sys
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Property types for the $properties used in default.project.json
PROP_TYPES = {
    "StreamingEnabled": "bool", "StreamingMinRadius": "int", "StreamingTargetRadius": "int",
    "Gravity": "float", "Anchored": "bool", "Locked": "bool", "Size": "Vector3", "Position": "Vector3",
    "Color": "Color3", "Material": "token", "TopSurface": "token", "BottomSurface": "token",
    "ClockTime": "float", "GeographicLatitude": "float", "Brightness": "float",
    "EnvironmentDiffuseScale": "float", "EnvironmentSpecularScale": "float", "GlobalShadows": "bool",
    "RespectFilteringEnabled": "bool", "CharacterAutoLoads": "bool", "ResetPlayerGuiOnSpawn": "bool",
    "CameraMaxZoomDistance": "float", "CharacterWalkSpeed": "float", "CharacterJumpPower": "float",
    "LoadCharacterAppearance": "bool",
}
TOKENS = {
    "Material": {"Grass": 1280, "Plastic": 256, "SmoothPlastic": 272, "Concrete": 816, "Asphalt": 1376},
    "TopSurface": {"Smooth": 0}, "BottomSurface": {"Smooth": 0},
}

ref_counter = [0]


def ref():
    ref_counter[0] += 1
    return f"RBX{ref_counter[0]:08d}"


def prop_xml(name, value):
    t = PROP_TYPES.get(name)
    if t is None:
        print(f"warning: unknown property type for {name}, skipped", file=sys.stderr)
        return ""
    if t == "bool":
        return f'<bool name="{name}">{"true" if value else "false"}</bool>'
    if t == "int":
        return f'<int name="{name}">{int(value)}</int>'
    if t == "float":
        return f'<float name="{name}">{float(value)}</float>'
    if t == "Vector3":
        x, y, z = value
        nm = "size" if name == "Size" else name
        return f'<Vector3 name="{nm}"><X>{x}</X><Y>{y}</Y><Z>{z}</Z></Vector3>'
    if t == "Color3":
        r, g, b = value
        packed = 0xFF000000 | (round(r * 255) << 16) | (round(g * 255) << 8) | round(b * 255)
        return f'<Color3uint8 name="Color3uint8">{packed}</Color3uint8>'
    if t == "token":
        return f'<token name="{name}">{TOKENS[name][value]}</token>'
    return ""


def item(cls, name, props_xml="", children=None, source=None):
    parts = [f'<Item class="{cls}" referent="{ref()}"><Properties>']
    parts.append(f'<string name="Name">{escape(name)}</string>')
    parts.append(props_xml)
    if source is not None:
        safe = source.replace("]]>", "]]]]><![CDATA[>")
        parts.append(f'<ProtectedString name="Source"><![CDATA[{safe}]]></ProtectedString>')
    parts.append("</Properties>")
    for c in children or []:
        parts.append(c)
    parts.append("</Item>")
    return "".join(parts)


def script_class(filename):
    if filename.endswith(".server.luau") or filename.endswith(".server.lua"):
        return "Script", filename.rsplit(".server.", 1)[0]
    if filename.endswith(".client.luau") or filename.endswith(".client.lua"):
        return "LocalScript", filename.rsplit(".client.", 1)[0]
    if filename.endswith(".luau") or filename.endswith(".lua"):
        return "ModuleScript", filename.rsplit(".", 1)[0]
    return None, None


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def build_path(path, name):
    """Return XML for a filesystem path mounted as instance `name`."""
    if os.path.isfile(path):
        cls, _ = script_class(os.path.basename(path))
        return item(cls, name, source=read(path)) if cls else None
    children = []
    init_cls, init_src = "Folder", None
    for entry in sorted(os.listdir(path)):
        full = os.path.join(path, entry)
        if entry.startswith("."):
            continue
        if os.path.isfile(full):
            cls, base = script_class(entry)
            if not cls:
                continue
            if base == "init":
                init_cls, init_src = cls, read(full)
                continue
            children.append(item(cls, base, source=read(full)))
        else:
            sub = build_path(full, entry)
            if sub:
                children.append(sub)
    return item(init_cls, name, children=children, source=init_src)


def build_node(name, node):
    children = []
    for key, val in node.items():
        if key.startswith("$"):
            continue
        children.append(build_node(key, val))
    props = "".join(prop_xml(k, v) for k, v in node.get("$properties", {}).items())
    if "$path" in node:
        x = build_path(os.path.join(ROOT, node["$path"]), name)
        # inject extra children declared next to $path (rare)
        if children:
            x = x[: -len("</Item>")] + "".join(children) + "</Item>"
        return x
    cls = node.get("$className", name)
    return item(cls, name, props, children)


def main():
    project = json.loads(read(os.path.join(ROOT, "default.project.json")))
    top = []
    for key, val in project["tree"].items():
        if key.startswith("$"):
            continue
        top.append(build_node(key, val))
    xml = '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" version="4">' + "".join(top) + "</roblox>"
    out = os.path.join(ROOT, "SkylineCity.rbxlx")
    with open(out, "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"wrote {out} ({len(xml)//1024} KB)")


if __name__ == "__main__":
    main()
