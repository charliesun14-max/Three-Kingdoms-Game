# assets-src: raw downloads go here

Copy art you downloaded (from Fab, Sketchfab, Poly Haven, ...) into this folder, **unchanged and still in its own folder**, under the kind of thing it should replace:

| Folder | What goes in it | Examples of what it can replace |
|---|---|---|
| `buildings/` | houses, towers, gates | farmhouse, tiled house, two-storey house, watchtower |
| `trees/` | trees and bushes | pine, elm, willow, peach, poplar, jujube, mulberry, shrub |
| `props/` | objects in towns and camps | well, wine jars, cart, haystack, market stall, low table, woodpile, millstone, weapon rack, training dummy, campfire, tent, command tent, broom, basket, archery target, guqin, paper lantern |
| `textures/` | tileable surface materials | grass, dry grass, loess soil, rock, dirt road, ploughed field, forest floor, roof tiles, thatch, mud brick, lime plaster, weathered wood, stone blocks |

Name each asset's folder after what it should replace, for example `props/well/` or `trees/pine/`. If you're not sure, any name is fine: say what it's for when you ask Claude to add it.

Usable formats: **.glb / .gltf** (best), **.fbx**, **.obj**, with their texture images beside them. Unreal Engine `.uasset` files cannot be used outside Unreal.

Model files and the images in this folder are stored with Git LFS automatically (see `.gitattributes`). `npm run assets:optimize` turns the `.glb`/`.gltf` files here into compressed copies in `public/assets/`; FBX and OBJ need converting first, which Claude can do for you.
