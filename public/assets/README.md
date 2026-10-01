# Art assets (optional)

Everything in *Mandate of Heaven* is generated in code. Downloaded models and textures can replace any part of it. List them in `manifest.json` in this folder; `manifest.example.json` shows every slot that can be replaced. If there is no manifest, or a file fails to load, the procedural version is used and a warning appears in the browser console.

## Formats

- **Models: glTF 2.0, binary `.glb`**, with the textures embedded. `.gltf` with its `.bin` and images beside it also works.
  - Geometry compressed with Draco and Meshopt is supported, and so are KTX2/Basis textures.
  - FBX, OBJ, Blend or Unity/Unreal packages don't work directly. Open them in Blender and use *File → Export → glTF 2.0 (.glb)*.
- **Textures: `.jpg` or `.png`**, tileable (seamless), sized 1024–2048 px. The game uses the colour (albedo/diffuse) map.

## Conventions

- Units are **metres**, and **+Y is up**. Blender's glTF exporter converts from Z-up automatically.
- Models are placed with the bottom of their bounding box on the ground and centred on their footprint. Set `"anchor": "origin"` to keep the model's own origin instead.
- **Buildings** are scaled to the footprint the town plan gives them (`"fit": true`, the default). The front door should face **+Z** in the model; use `"rotY"` (degrees) to correct it. Doors, colliders and walking paths still come from the town plan.
- **Trees** are instanced in the thousands. Keep each one under about 5k triangles, with no more than 2–3 materials. Leaves should use alpha-tested (cutout) materials.
- **Hand props** (broom, rod, lantern, axe) need their grip at the origin, with the handle running along **+Y**. Use `rotX`/`rotZ` to fix the orientation.
- Per-entry options:
  - `scale`;
  - `rotX`, `rotY`, `rotZ` (degrees);
  - `y` (vertical offset);
  - `castShadow`;
  - `fit` (buildings only);
  - `anchor`.
- Give a list of entries to provide variants. Each tree, building or prop picks one of them.

Characters and horses stay procedural, because their animation system is built around their own skeletons.

## Good free sources (check each licence)

- Poly Haven: CC0 textures and models.
- ambientCG: CC0 textures.
- Quaternius and Kenney: CC0 low-poly packs.
- Sketchfab: filter by a downloadable CC licence, and choose glTF when downloading.
