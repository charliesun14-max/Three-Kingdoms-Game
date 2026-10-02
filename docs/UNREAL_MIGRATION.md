# Moving Mandate of Heaven to Unreal Engine 5

## Can the current build look like Sengoku Dynasty?

No, not on par. It can get closer, and the scanned assets have closed a lot of the gap, but the remaining
difference comes from the engine, not from the art.

Mandate of Heaven runs on three.js (WebGL 2) inside Electron. Sengoku Dynasty is built on Unreal Engine with
photogrammetry assets, dense foliage, dynamic global illumination and motion-captured animation. The current
build already does these:

- Scanned PBR materials on the terrain, rocks and buildings.
- 8K shadow maps on Ultra.
- Ground-truth ambient occlusion and height fog.
- Instanced vegetation and wind.

What WebGL 2 cannot do, whatever assets you give it:

| Feature | Unreal Engine 5 | This engine |
| --- | --- | --- |
| Geometry | Nanite: millions of triangles per scanned rock, house or tree, streamed and LODed automatically | Every scan is decimated to a few thousand triangles; a forest of full-detail trees will not fit |
| Lighting | Lumen: real-time bounce light, sky occlusion, light through leaves and doorways | Bounce light is faked with ambient light and screen-space AO, so interiors and forest floors look flat |
| Shadows | Virtual shadow maps: sharp shadows from every leaf at any distance | One cascade-less 8K map over ~190 m; far shadows are soft or missing |
| Textures | Virtual texturing: 4K–8K maps everywhere, streamed | Everything must sit in VRAM at once, so 1–2K maps |
| Foliage | Grass and trees by the hundred thousand with GPU culling | A few thousand trees; grass in a ring around the camera |
| Characters | MetaHumans, motion matching, mocap retargeting, cloth and hair simulation | Procedural bodies with scanned heads and hands; hand-keyed animation |
| Performance | Native C++ and DX12 / Vulkan | JavaScript draw submission on one CPU thread |

If Sengoku Dynasty-level visuals are the goal, port the game to **Unreal Engine 5.5 or later**. Keep this
build as the playable design reference: the story, systems, maps and balance are all worked out in it.

## What carries over

| Part of the game | Carries over? | How |
| --- | --- | --- |
| Region terrain (heightfields, roads, fields, rivers, woods) | Yes | `tools/unreal/export-world.mjs` writes Landscape heightmaps and paint layers |
| Positions of trees, buildings, rocks, props, market goods and story spots | Yes | Same exporter: `trees.csv`, `placements.csv`, `world.json`; placed by `tools/unreal/import_world.py` |
| Your Fab and Megascans downloads | Yes, at full quality | Add them from the Fab panel inside Unreal (Nanite enabled), or drag the FBX files from `assets-src/downloaded` into the Content Browser |
| Music | Yes | Import the `.ogg` / `.wav` files |
| Story, quests, dialogue, items, NPC rosters | As data | They live in `src/story`, `src/rpg` and `src/life`; port them to DataTables / DataAssets |
| Gameplay code (combat, AI, RPG, UI, saving) | No | Rewrite in C++ / Blueprints; the JavaScript serves as the specification. See the mapping below |

## Step by step

### 0. Install

1. Install the Epic Games Launcher, then Unreal Engine 5.5 or later.
2. Install Visual Studio 2022 with the *Game development with C++* workload.
3. Leave about 200 GB of free disk space.
4. In the Launcher, link your Fab account so your library appears inside the editor.

### 1. Create the project

1. Choose *Games › Third Person › C++*, Desktop, Maximum quality, with no starter content.
2. In *Edit › Plugins*, enable:
   - **Python Editor Script Plugin**
   - **Procedural Content Generation Framework (PCG)**
   - **Water**
   - **Fab**
   - **MetaHuman**
3. In *Project Settings › Rendering*, check that these are on (they are the 5.x defaults):
   - Dynamic Global Illumination: **Lumen**
   - Reflections: **Lumen**
   - Shadow Map Method: **Virtual Shadow Maps**
   - Anti-aliasing: **TSR**
4. For RTX laptops, also add NVIDIA's DLSS plugin.

### 2. Export the world from this repository

```
npm install
node tools/unreal/export-world.mjs            # all story regions
node tools/unreal/export-world.mjs zhuo       # or just one
```

Each `unreal-export/<region>/` folder holds:

- `heightmap.png` and `heightmap.r16`, already resampled to a size Unreal accepts.
- Seven paint layers: grass, road, field, town, woods, wet and rock.
- `trees.csv` and `placements.csv` in Unreal coordinates (centimetres, Z up) with Unreal yaw.
- `world.json`, which adds the river and road polylines.
- `IMPORT.txt`, with the exact Location, Scale and Resolution to type into the Landscape importer.

### 3. Build the Landscape

1. Open *Landscape mode › Manage › New › Import from File* and pick `heightmap.png`.
2. Enter the Location, Scale and Resolution from `IMPORT.txt`.
3. Create a landscape material with seven *Landscape Layer Blend* layers named like the weight maps. Use full-resolution surfaces from `assets-src/downloaded`:
   - **grass:** brown mud and leaves, plus Fab grass.
   - **road:** gravel from the trench patch.
   - **woods:** Ground024.
   - **rock:** mossy stone.
   - **town:** packed earth or gravel.
4. Import each `weight_<layer>.png` into its layer.
5. Add **Landscape Grass Types** on the grass and woods layers. Your *Grass Vegitation Mix* and any Fab grass work here, which gives Sengoku-style dense grass.

### 4. Bring in the assets

1. Open the Fab panel (*Window › Fab*), find each pack in *My Library* and click **Add to Project**. Megascans arrive with Nanite enabled at full detail; no decimation is needed.
2. Copy `tools/unreal/asset_map.example.json` to `asset_map.json`.
3. Fill in an Unreal asset path for each tree species, building kind and prop. Right-click an asset and choose *Copy Reference*.

### 5. Place everything

1. Edit `REGION_DIR` at the top of `tools/unreal/import_world.py`.
2. Run it with *Tools › Execute Python Script*. It spawns buildings, rocks, scanned props and market goods, and turns the game's named spots (such as `liuBeiHome`, `oathAltar` and `stall3`) into Target Points, so quests can be rebuilt on them.
3. Anything without a mapped asset is listed in the Output Log.

For whole forests, set `MAX_TREES = 0` and scatter trees with PCG instead:

1. Create a struct with the fields `Species` (Name), `X`, `Y`, `Z`, `Yaw` and `Scale` (Float).
2. Import `trees.csv` as a DataTable of that struct.
3. Build a PCG graph: *Load Data Table* › *Filter by attribute (Species)* › *Static Mesh Spawner*, with one branch per species. It draws everything as instanced foliage.

### 6. Water, sky and weather

- Draw the river with the Water plugin's **Water Body River** spline, following the `river` points in `world.json` (Z is the water surface).
- For sky and weather, use **Sky Atmosphere**, **Volumetric Cloud** and **Exponential Height Fog** (Volumetric Fog on). *Ultra Dynamic Sky* on Fab is a popular paid shortcut for day/night and weather.

### 7. Characters

1. Make Han-dynasty faces in **MetaHuman Creator** (or start from the scanned heads you bought).
2. Dress them in period clothing. Fab has Hanfu and robe packs; Marvelous Designer works for custom garments.
3. For locomotion, start from Epic's free **Game Animation Sample**: 500+ mocap animations with motion matching, retargetable to MetaHumans.
4. For weapons and combat, use Fab packs (spear, dao, jian) or mocap, played through Animation Montages.

### 8. Rewrite the gameplay

| Here (JavaScript) | In Unreal |
| --- | --- |
| `entities/PlayerController.js`, `CameraController.js`, `Riding.js` | Character + Enhanced Input + spring-arm camera; Mount component for horses |
| `combat/Combat.js` (directional KCD-style attacks and blocks), `Weapons.js`, `Archery.js` | C++ combat component on the **Gameplay Ability System**: abilities per attack direction, montages with notify windows for parry and perfect block |
| `entities/AI.js`, army battles | **StateTree** or Behavior Trees with EQS; **Mass Entity** for large battles and crowds |
| `life/` (Population, Life, Activities, Barks, Social, Law, Wildlife, Livestock) | **Smart Objects** for jobs and benches, Mass crowds and StateTree schedules, DataTables of bark lines |
| `story/`, `rpg/` (quests, dialogue, items, progression) | A quest subsystem in C++ reading DataTables / DataAssets; dialogue as DataTables or a dialogue plugin |
| `ui/UI.js` | UMG with CommonUI |
| `audio/Audio.js` | MetaSounds: the procedural clucks, bells, crowd babble and guqin translate directly |
| `world/Settlements.js` (procedural towns) | PCG graphs, or the placements exported above, edited by hand |
| Save games | `USaveGame` |

### 9. Plan

Rough solo estimates, assuming the asset packs you already own:

| Milestone | Estimate |
| --- | --- |
| Vertical slice: Lousang village and the Zhuo countryside with walking, talking, one quest and Sengoku-level visuals | 6–10 weeks |
| Combat and the Daxing Mountain battle | +6–8 weeks |
| Remaining regions and the full story | several months |

Build and profile on the target RTX 3000–5000 laptops early. Run Lumen and Nanite at the High scalability
preset with DLSS Quality, and keep grass density in check.

## Working with Claude on the port

This cloud environment cannot run the Unreal Editor (it needs a Windows or Linux GPU desktop), so nothing
here can be compiled or play-tested in Unreal. What I can do:

- Write the C++ modules (combat component, quest subsystem, AI tasks).
- Write editor Python scripts and DataTable exports of the story, items and dialogue.
- Keep the exporter in sync with the game.

Once you create the Unreal project, push it to its own GitHub repository with Git LFS, so `.uasset` and
`.umap` files are stored in LFS. Add that repository to a Claude session and the C++ side can be written
there while you test in the editor.
