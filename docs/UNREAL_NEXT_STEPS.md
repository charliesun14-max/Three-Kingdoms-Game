# Unreal port: hand-off for a local Claude session

Read this first if you are a Claude session running on the developer's own computer with a connection to the
Unreal Editor. The background is in `docs/UNREAL_MIGRATION.md`.

## Where things stand

- An Unreal Engine 5.5+ project exists (Third Person template, Blueprint). The Python Editor Script Plugin is enabled.
- The **Zhuo** landscape has been imported from `unreal-export/zhuo/heightmap.png` with the values in
  `unreal-export/zhuo/IMPORT.txt`: Location (-80000, -80000, 10630.6), Scale (158.7302, 158.7302, 39.34), 1009x1009.
- A Player Start sits at Lousang village (X -34000, Y 25000, Z 2500), and the GameMode override is BP_ThirdPersonGameMode.
- The landscape has **no material yet**, so it is grey.
- The developer is new to Unreal. Explain each step plainly and do as much as possible through the editor connection.

## Next tasks, in order

1. **Landscape material with seven paint layers.**
   - The layers are named `grass`, `road`, `field`, `town`, `woods`, `wet` and `rock` (Landscape Layer Blend, weight-blended).
   - Build the surfaces from the scans in `assets-src/downloaded`:

     | Layer | Scan |
     | --- | --- |
     | grass | Poly Haven brown_mud_leaves (4K) plus a green tint, until Fab grass is added |
     | road | the trench-patch gravel; a seamless 1K version is `public/assets/textures/gravel_*.webp` |
     | woods | Ground024 |
     | rock | MI_Mossy_Stone_Wall from the Mountain village Textures folder; use world-aligned (triplanar) projection |
     | town | packed loess: a warm brown tint over the gravel |
     | field | furrowed soil |
     | wet | darker mud and gravel |

   - Create a Landscape Layer Info asset for each layer and import `unreal-export/zhuo/weight_<layer>.png` into it.
2. **Landscape grass:** add Landscape Grass Types on the `grass` and `woods` layers using the Grass Vegitation Mix pack
   (`assets-src/downloaded/Grass_Vegitation_Mix-*`) or Fab grass.
3. **Assets:**
   - Import the developer's Fab library items: Megascans with Nanite, the mobile broadleaf tree and the Medieval Banquet pack.
   - Copy `tools/unreal/asset_map.example.json` to `tools/unreal/asset_map.json` and fill in the asset paths.
4. **Placement:**
   - Set `REGION_DIR` in `tools/unreal/import_world.py` to `<repo>/unreal-export/zhuo` and run it.
   - For full forests, use PCG over `trees.csv` (struct with Species, X, Y, Z, Yaw, Scale) instead of individual actors.
   - The game's building kinds (`farmhouse`, `tiled`, `twoStorey`, `watchtower`) have no Unreal meshes yet. Han-style buildings need modelling or Fab assets.
5. **River and sky:**
   - Draw a Water Body River spline through `river` in `unreal-export/zhuo/world.json`; points are UE centimetres and Z is the water surface.
   - Set up Sky Atmosphere, Volumetric Cloud and Exponential Height Fog with Volumetric Fog.
6. **Then:** characters (MetaHuman plus the Game Animation Sample) and the gameplay port listed in `docs/UNREAL_MIGRATION.md`.

## Coordinates

Game coordinates are metres, Y up. Unreal coordinates are centimetres, Z up.

- UE.X = x × 100
- UE.Y = z × 100
- UE.Z = y × 100
- UE yaw = 90° − game yaw

Every CSV in `unreal-export/` is already converted to Unreal coordinates.
