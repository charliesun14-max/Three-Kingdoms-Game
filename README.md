# 天命 · Mandate of Heaven — a Three Kingdoms RPG

An open-world, third-person RPG set at the end of the Eastern Han dynasty (184–220 AD), in the spirit of *Kingdom Come: Deliverance* but in Three Kingdoms China. You start as a peasant of **Lousang Village** in Zhuo Commandery, Liu Bei's own village. You fight in the Yellow Turban Rebellion, stand at Hulao Pass against Lü Bu, govern Xu Province, and can end up on the Dragon Throne.

It runs in the browser or as a desktop app for Windows, macOS and Linux. It is built with three.js and needs no external art or audio: terrain, Han-era architecture, characters, weapons, textures, music and sound effects are all generated in code. Downloaded 3D models can replace any part of the scenery (see *Art assets*).

## Play

### Download (no setup)

Open the repository's **Releases** page and download the build for your system:

| System | File | How to run it |
|---|---|---|
| Windows | `MandateOfHeaven-…-win-x64.exe` (installer) or `…-win-x64.zip` | Run the installer, or unzip and run `MandateOfHeaven.exe`. If SmartScreen warns about an unknown publisher, choose *More info → Run anyway*. |
| macOS | `…-mac-….dmg` | Drag the app to Applications. The build is unsigned, so the first time, right-click it and choose *Open*. |
| Linux | `…-linux-x86_64.AppImage` or `.tar.gz` | `chmod +x` the AppImage and run it. |

The builds are made by the **Desktop builds** workflow (`.github/workflows/desktop.yml`). To publish a new release, push a version tag: `git tag v1.0.0 && git push origin v1.0.0`. To get a test build without a release, open the Actions tab, choose *Desktop builds → Run workflow*, and download the files from the run page.

### Easiest way: double-click a launcher

1. Install **Node.js** (the "LTS" version) from https://nodejs.org. Just run the installer; you don't need to open Node.js afterwards.
2. Download the game:
   - On the repository's GitHub page, switch to the branch `claude/three-kingdoms-rpg-n2iewf`.
   - Click **Code → Download ZIP**, then unzip it.
3. Open the unzipped folder and double-click the launcher for your system:
   - **Windows:** `Play-Windows.bat`
   - **macOS:** `Play-Mac.command`. The first time, right-click it and choose *Open*.
   - **Linux:** `play-linux.sh`

The first launch downloads the game's tools (a few minutes). After that the game opens in its own window in seconds.

> The setup commands below go in a **terminal**: *Command Prompt* or *PowerShell* on Windows, *Terminal* on macOS. Don't type them into the "Node.js" app or a browser console. Those are JavaScript prompts, and they answer with errors such as `Uncaught SyntaxError: Invalid or unexpected token`.

### From a terminal

You need [Node.js](https://nodejs.org) 20 or newer, and [Git LFS](https://git-lfs.com) if the repository holds art assets.

Get the code:

```bash
git clone -b claude/three-kingdoms-rpg-n2iewf https://github.com/charliesun14-max/Three-Kingdoms-Game.git
cd Three-Kingdoms-Game
npm install
```

Play in a desktop window:

```bash
npm run desktop
```

Or play in your browser at http://127.0.0.1:5173:

```bash
npm run dev
```

Build the downloadable game yourself. The output goes to `release/`; use `dist:mac` or `dist:linux` for the other systems:

```bash
npm run dist:win
```

A dedicated GPU is recommended. You can change the graphics quality (Low/Medium/High) in the Esc menu. In the desktop app, F11 or Alt+Enter toggles fullscreen.

### Controls

| Action | Keys |
|---|---|
| Move / sprint / sneak | WASD · Shift · C |
| Draw or sheathe weapon | F |
| Attack | Left mouse. While locked on, **move the mouse to choose the cut** (left, right, overhead ↑, thrust ↓), or press Z / V / X / B |
| Block / perfect parry | Right mouse. Block just before the blow lands (the green light in the combat star) for a **perfect parry**, then strike at once for a **riposte** |
| Dodge · switch target | Space · Tab |
| Interact · talk · loot | E |
| Greet · antagonize the person in front of you | Q · T |
| Pick a pocket · rob a stall | Sneak (C) behind them, then E |
| Whistle for your horse | H |
| Bandage · medicine · eat | 1 · 2 · 3 |
| Order your squad (follow / charge / hold) | G |
| Inventory · Journal · Map · Character · Menu | I · J · M · P · Esc |

## Features

**World**
- Seven hand-laid regions built from procedural heightfields: Zhuo Commandery (Lousang, the walled county town of Zhuo, Zhang Fei's peach garden, the Juma River, Daxing Mountain), the siege of Guangzong, Hulao Pass, Xiaopei, the Red Cliffs on the Yangtze, Xuchang with its abdication altar, and a generated field-battle map.
- Han architecture: thatched mud-plaster farmhouses, tiled timber halls with curved hip roofs and upturned eaves, rammed-earth city walls with gate towers and corner towers, multi-storey watchtowers like those in Han tomb models, yamen compounds, market stalls, army camps with palisades, Yellow Turban camps, and tower ships.
- A day-night cycle with a cloud-filled sky, fog, stars and moon, animated river water, wind-blown GPU grass and millet, trees with leaf cards (pine, elm, poplar, willow, peach blossom, and the great mulberry of Lousang), firelight, and lanterns that glow at night.
- Weather that drifts between clear, overcast and rain. Rain darkens and wets the ground and brings its own sound.
- Horses: bay, chestnut, black, grey, white and Red Hare, with walk, trot and gallop gaits. There are no stirrups, as in the Han. Press H to whistle for your horse.

**Sound** (all synthesised at runtime)
- Guqin music built from Karplus-Strong plucked strings, with slides and vibrato ornaments (吟猱) and an occasional xiao flute. The music changes to war drums in battle and quietens under dialogue.
- Formant-synthesised voices: effort grunts, pain, death cries and battle shouts, pitched per character.
- Surroundings: wind, the river, town crowds, fire, birdsong and crickets, dogs, cockcrow at dawn, the smith's hammer, summer cicadas, rain, hoofbeats on road and grass, bowstrings and arrow strikes, and the clash of a battle in the distance.

**Characters and combat**
- Skinned procedural humanoids in Han dress: cross-collared robes closing to the right (右衽), wide sleeves, leg wraps, lamellar armour, helmets and official caps. Historical figures have their traditional looks: Guan Yu's red face, green headscarf and long beard; Zhang Fei's tiger whiskers; Liu Bei's large ears.
- Directional melee in the style of *Kingdom Come*:
  - four cuts, with the enemy's guarded side shown on the combat star
  - stamina, blocks, perfect parries and ripostes
  - bleeding and armour mitigation by damage type (slash, stab, blunt)
  - knockback, dodges, and a limit on how many enemies attack you at once (attack tokens)
  - enemies who flee or surrender (you choose to spare, rob or execute them)
- Real Han weapons: the ring-pommel dao, jian, spear, ji halberd, the Green Dragon Crescent Blade, the Serpent Spear and the Sky Piercer. Polearms are held two-handed using IK.
- Characters turn their heads toward whoever is speaking, the enemy they're fighting, or a passer-by who catches their eye.
- Archery: hold to draw and release to shoot. Arrows fly ballistically, and AI archers form up behind the line.
- Villagers follow daily schedules (farming, market, tavern, sleep) and use A* navigation. The towns have guards, merchants, a blacksmith and an innkeeper.

**Town life** (in the spirit of *Red Dead Redemption 2*)
- People at work, each with their tools: sweepers with brooms, porters with carrying poles, sack-carriers at the granary, washerwomen at the well, woodcutters, market women with baskets, fishermen on the riverbank, children chasing through the market.
- Street performers: a juggler with an audience, a qin player whose music you can hear across the market, and a storyteller with listeners who tells the old tales (the Feast at Hongmen, Han Xin, the Cowherd and the Weaver Girl, Jing Ke). You can tip them or pay for a story.
- People speak: hawkers cry their wares, passers-by stop to gossip, people complain about the rain, guards call the curfew, and everyone reacts when you walk the streets with a drawn blade.
- **Q** greets anyone and **T** antagonizes them. Greet the same person on three different days and they become friendly. Rank and reputation change how people answer you. Cowards cower, guards warn you, and tough men pick a fight: a non-lethal fistfight with a cheering crowd, which ends when one man yields.
- Law and crime: crimes are only reported if someone witnesses them, and bounties are kept per region. Guards chase and confront you, and you can pay, bribe, talk your way out, go to jail (days pass and the gaolers take a cut) or resist and be hunted. Sneak (**C**) behind someone to pick their pocket, or rob a merchant's stall when they look away. Stealing a horse from a dealer is a crime.
- Things to do:
  - games: touhu 投壺 (pitching arrows into a pot), arm-wrestling the tavern strongman, betting on cockfights 鬥雞, liubo dice, and the archery butts in the garrison yard and army camps;
  - paid work: carrying grain for the granary foreman, splitting firewood;
  - fishing: buy a bamboo rod and fish at any water's edge, from crucian carp up to the legendary golden carp;
  - services: hot meals at the inn (well fed: faster stamina), the barber (choose your beard), the tailor (commission a robe in any dye and cut), and the horse dealer outside the south gate;
  - charity and prayer: alms for beggars, who know the street rumours, and incense at the Earth God shrine (blessing: luck at games and slow healing).
- Street encounters: a purse-snatcher to chase down (then return the purse, or keep it), a lost child to walk back to their mother, a belligerent drunk, and a thug shaking down a vendor.
- Horse races: a six-flag course outside each county town against two riders, with a prize for the winner.
- Townsfolk shelter under the eaves when it pours, and the night watch walks the streets with paper lanterns.
- Hunting:
  - prey: sika deer (stags carry antlers), wild boar that charge, hares, and pheasants that burst into flight;
  - a single tiger haunts the most remote hills of each region;
  - animals sense you less when you sneak; skin your kills for meat, hides and trophies, roast them at a campfire, and sell the pelts.

**Your character**
- Create your character at the start of a New Journey:
  - **Name:** pick a Han family name and given name with their characters, or type your own. Your family name runs through the story: your mother, your sister, the village gossip, even the dynasty you may found.
  - **Looks:** complexion, build, beard, headwear and clothes, with a live preview in Lousang.
  - **Upbringing:**
    - farmer's son: hardy;
    - hunter's son: bow, stealth and a fishing rod;
    - poor scholar's grandson: speech, and better pay at the scribe's table;
    - smith's apprentice: strength and blade.
- The **Guide** tab explains town life and keeps your **Records**: fish caught, game hunted, fights, races, letters written and more.
- When the story is complete, the map lets you travel freely between all the regions of the story.

**RPG systems**
- Skills that improve with use (Strength, Agility, Vitality, Blade, Polearm, Unarmed, Defence, Speech, Leadership, Stealth).
- Merit (軍功), Virtue (德) and Renown (名望).
- An inventory with trading, equipment, food, bandages and wound medicine, hunger, looting, and sleeping to save.
- A rank ladder of 13 steps, from Peasant 農夫 to Emperor 皇帝.
- A squad of recruits who follow your orders.

**Story mode** (7 chapters, based on the *Records of the Three Kingdoms* and the *Romance of the Three Kingdoms*)
1. **The Yellow Sky Shall Rise:** village life, a Yellow Turban raid, Liu Yan's proclamation, meeting Liu Bei, Zhang Fei and Guan Yu, the **Peach Garden Oath**, training, and the Battle of Daxing Mountain.
2. **The Azure Sky Is Dead:** Lu Zhi's siege of Guangzong, the eunuch Zuo Feng's bribe, Dong Zhuo's ingratitude, and the storming of Guangzong.
3. **Tiger Trap Pass:** the eighteen lords, Guan Yu kills Hua Xiong "while the wine is warm", the **three heroes fight Lü Bu**, and the Imperial Jade Seal found in a well.
4. **Thrice Yielding Xu Province:** you become Chancellor of Pei, Lü Bu betrays Liu Bei, Gao Shun's Trap Crushers attack, and you and Liu Bei go different ways.
5. **The Deer Hunt of Warlords:** a strategic campaign across the 14 provinces against Cao Cao, Yuan Shao, Sun Quan and the others. It includes the Battle of Guandu and recruiting officers such as Zhao Yun and Xu Shu. You can fight each battle in person or let your generals auto-resolve it.
6. **The Red Cliffs:** Huang Gai's fire ships against Cao Cao's chained fleet, followed by the landing at Wulin.
7. **The Mandate of Heaven:** the storming of Xuchang, a final meeting with Cao Cao, Emperor Xian's abdication (you decline twice, following ritual custom), and your coronation at the altar, where you name your dynasty and era. The epilogue depends on your choices.

## Art assets (optional)

Everything is procedural. Downloaded **glTF 2.0 (`.glb`)** models and tileable **`.jpg`/`.png`** textures can replace any tree species, building type, prop or ground and material texture. List them in a `manifest.json`. See `public/assets/README.md` and `manifest.example.json` for the slots and conventions: metres, +Y up, front facing +Z.

There are two places assets can go:

- **Inside the game (shipped to every player):** put them in `public/assets/` and commit them. Model and texture files are stored with **Git LFS** (see `.gitattributes`), which takes files up to 2 GB each. That gets past the 25 MB limit of GitHub's web uploader and the 100 MB limit of plain Git.
- **Beside an installed copy (no rebuild):** the desktop game also reads an `assets/` folder next to its executable (next to the `.app` on macOS), and the folder that *Esc → Open my assets folder* opens. Files and manifest entries there override the built-in ones.

`npm run assets:optimize` compresses every model in `assets-src/` (Meshopt geometry, WebP textures up to 2048 px) and writes it to `public/assets/`. It often cuts a large download to a tenth of its size.

The assets already in the game are built by `npm run assets:build`: Blender scripts in `tools/blender/` pull single pieces out of large scenes, convert FBX/.blend files and decimate heavy meshes, `tools/assets/skin-textures.mjs` prepares the character skin atlases, `tools/assets/terrain-textures.mjs` turns the scanned surfaces into tileable 1–2K ground, rock, gravel, stone, brick and plank maps, and `tools/assets/build-assets.mjs` attaches the PBR textures and compresses everything.

## Moving to Unreal Engine

`npm run export:unreal` writes every region as Unreal Engine 5 Landscape heightmaps and paint layers, plus CSVs of every tree, building, prop and story spot in Unreal coordinates. `tools/unreal/import_world.py` places them in the editor. See [`docs/UNREAL_MIGRATION.md`](docs/UNREAL_MIGRATION.md) for what this engine can and cannot match, and a step-by-step port plan.

## Development

- `node tools/shoot.mjs <name> "<query>" [frames]` takes a headless screenshot, for example `play&mission=m7_daxing`, `scene=chars`, or `foes=3&attackAt=5:overhead`.
- `node tools/autotest.mjs [mission] [minutes]` runs the story autopilot (`?auto`), which plays every mission end to end and reports errors.
- `node tools/posecheck.mjs blade` prints hand positions for the animation keyframes.
- `electron/main.cjs` is the desktop wrapper. It serves the built game over `app://` and merges players' asset folders into `assets/`.

See `SCORECARD.md` for the quality review of each part.
