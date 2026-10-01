# 天命 · Mandate of Heaven — a Three Kingdoms RPG

An open-world, third-person RPG set at the end of the Eastern Han dynasty (184–220 AD), in the spirit of *Kingdom Come: Deliverance* but in Three Kingdoms China. You start as a peasant of **Lousang Village** in Zhuo Commandery, Liu Bei's own village. You fight in the Yellow Turban Rebellion, stand at Hulao Pass against Lü Bu, govern Xu Province, and can end up on the Dragon Throne.

Everything is procedural and runs in the browser. It uses three.js and has no external art or audio assets: terrain, Han-era architecture, characters, weapons, textures, music and sound effects are all generated in code.

## Play

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # static build in dist/
```

A desktop browser with WebGL2 and a dedicated GPU is recommended. You can change the graphics quality (Low/Medium/High) in Settings.

### Controls

| Action | Keys |
|---|---|
| Move / sprint / sneak | WASD · Shift · C |
| Draw or sheathe weapon | F |
| Attack | Left mouse. While locked on, **move the mouse to choose the cut** (left, right, overhead ↑, thrust ↓), or press Z / V / X / B |
| Block / perfect parry | Right mouse. Block just before the blow lands (the green light in the combat star) for a **perfect parry**, then strike at once for a **riposte** |
| Dodge · switch target | Space · Tab |
| Interact · talk · loot | E |
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

## Development

- `node tools/shoot.mjs <name> "<query>" [frames]` takes a headless screenshot, for example `play&mission=m7_daxing`, `scene=chars`, or `foes=3&attackAt=5:overhead`.
- `node tools/autotest.mjs [mission] [minutes]` runs the story autopilot (`?auto`), which plays every mission end to end and reports errors.
- `node tools/posecheck.mjs blade` prints hand positions for the animation keyframes.

See `SCORECARD.md` for the quality review of each part.
