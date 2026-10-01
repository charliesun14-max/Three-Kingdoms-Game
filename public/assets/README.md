# Art assets (optional)

Everything in *Mandate of Heaven* is generated in code. Downloaded models and textures can replace any part of it. List them in `manifest.json` in this folder; `manifest.example.json` shows every slot that can be replaced. If there is no manifest, or a file fails to load, the procedural version is used and a warning appears in the browser console.

## Formats

- **Models: glTF 2.0, binary `.glb`**, with the textures embedded. `.gltf` with its `.bin` and images beside it also works.
  - Geometry compressed with Draco and Meshopt is supported, and so are KTX2/Basis and WebP textures. The decoders ship with the game, so it all works offline.
  - FBX, OBJ, Blend or Unity/Unreal packages don't work directly. Open them in Blender and use *File → Export → glTF 2.0 (.glb)*.
- **Textures: `.jpg` or `.png`**, tileable (seamless), sized 1024–2048 px. The game uses the colour (albedo/diffuse) map.

## Large files (over 25 MB)

GitHub's web page only accepts uploads up to **25 MB**, and plain Git rejects any file over **100 MB**. Two things get around that.

**1. Shrink the file first.** Most downloaded models are far bigger than a game needs: uncompressed geometry and 4K or 8K textures.
- Put the raw files in `assets-src/` at the top of the repository, keeping the same sub-folders (`props/`, `trees/` and so on).
- Run `npm run assets:optimize`. It writes compressed copies (Meshopt geometry, WebP textures capped at 2048 px) into `public/assets/` and prints the size before and after.
- Add `-- --texture-size 4096` for hero assets, or `-- --texture-size 1024` for small props.

**2. Use Git LFS for whatever is still big.** This repository's `.gitattributes` already sends `.glb`, `.gltf`, `.bin`, `.fbx`, `.blend`, `.ktx2`, `.hdr`/`.exr`, the images in this folder and everything in `assets-src/` to Git LFS, which takes files up to 2 GB each. Install it from https://git-lfs.com and run `git lfs install` once in a terminal. Then commit as usual:

```bash
git add public/assets assets-src
git commit -m "Add temple and pine models"
git push
```

GitHub Desktop handles LFS automatically. Check with `git lfs ls-files`: your models should be listed there. Note that your GitHub account's LFS storage and bandwidth quota applies (see *Settings → Billing*).

If you'd rather not keep the files in Git at all, the desktop game also loads an `assets/` folder placed **next to its executable** (beside the `.app` on macOS), or the folder opened by *Esc → Open my assets folder*. Its `manifest.json` is merged over this one entry by entry, so you can test or ship an art pack without rebuilding.

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

Characters keep their procedural skeleton, animation, clothing and hairstyles, but their **heads and hands can come from scanned models** (the `characters` section: `maleHead`, `femaleHead`, `maleHandL`, `maleHandR`). Each head is measured on load (crown, chin, nose tip), fitted to the skeleton's head and trimmed at the collar; hands are placed at the wrists. Skin textures are prepared by `node tools/assets/skin-textures.mjs` (beard shadow removed or thinned to stubble, irises and lips made natural, the tone normalised to a neutral that the game tints per character). Horses stay procedural.

## Good free sources (check each licence)

- Poly Haven: CC0 textures and models.
- ambientCG: CC0 textures.
- Quaternius and Kenney: CC0 low-poly packs.
- Sketchfab: filter by a downloadable CC licence, and choose glTF when downloading.
