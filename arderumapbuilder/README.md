# Arderu Map Builder (Lua)

`arderumapbuilder` is now a pure FiveM Lua resource (client + server), with native gizmo editing and server-side persistence.

## Features

- Native `DrawGizmo` object edit flow
- Visible cursor in gizmo mode (no custom crosshair overlay)
- Click-to-select between placed objects while editing
- Map create/open/save/rename/delete/toggle visibility
- Active objects workspace with server persistence
- Custom model list persistence (`data/custom-models.json`)
- Existing NUI panel design preserved (`html/`)

## Structure

```text
arderumapbuilder/
- fxmanifest.lua
- shared.lua
- client.lua
- server.lua
- gizmo_dataview.lua
- html/
- data/
```

## Commands & Keybinds

- `F10`: open/close builder
- `/mapbuilder`, `/builder`
- `F2`: Panel <-> Freecam <-> Gizmo mode
- `Delete`: delete selected object
- `C`: clone selected object
- `Left Alt`: snap selected object to ground
- `Enter`: confirm current placement
- `Backspace`: cancel current placement

## Permission (optional)

Default: everyone can use.

To require ACE:

```cfg
setr arderumapbuilder_requireAce 1
add_ace group.admin arderumapbuilder.use allow
```
