# Scorecard

This is a self-assessment of each part of the game, scored out of 10, with the iteration history behind each score. Each score compares the game against what a browser game built entirely from procedural assets can reach. It does not compare against a AAA studio title. Where a part is still below 8.5, the reason is stated.

Screenshots are in `screenshots/final/`.

| # | Part | Score | Notes |
|---|------|:----:|-------|
| 1 | Terrain, sky and water | **8.5** | Heightfield with river carving and splat-mapped ground. A custom sky dome with clouds, plus drifting cloud shadows on the land. Fog, PMREM lighting, GTAO on high quality, chimney smoke, birds, sunlit motes, and a fire-reddened sky at Red Cliffs. |
| 2 | Vegetation | **8.5** | GPU grass and millet that follow the camera. Leaf-card trees with spherical normals and wind. Peach trees redrawn as twig sprays with five-petal blossoms. |
| 3 | Architecture and towns | **8.5** | Hip, gable and pyramid roofs with upturned eaves. Rammed-earth walls, gate and corner towers, Han watchtowers, yamen compounds, a pass fortress, an abdication altar and a chained fleet. Zhuo now has shopfront-lined main streets, worn street ground, a 12-stall market and street traffic. |
| 4 | Characters | **8** | Skinned procedural humanoids in correct Han dress, with sculpted face relief, 2× painted faces, robe pleats, rim light and baked occlusion. They carry everyday props (brooms, carrying poles, sacks, axes, rods, lanterns, standards), and you can create your own character with a live preview. Still stylised next to scanned or sculpted characters, which can't be loaded because the animation system is built on its own skeleton. |
| 5 | Animation | **8.5** | Keyframed clips plus everyday loops: sweeping, washing, chopping, clapping, juggling, the qin. Two-bone IK for polearms and **foot IK on slopes**, head and neck look-at, gait blending, greetings and insult gestures, and loops layered over seated or kneeling poses. |
| 6 | Combat | **8.5** | KCD-style four-direction attacks, attack tokens, perfect-block windows, ripostes, stamina, bleeding, and armour mitigation by damage type. Weapon trails, hit-stop, blood that lands, pools under the fallen, and archery. The lock-on camera swings wide so the foe stays visible. |
| 7 | AI and NPC life | **9** | Daily schedules, A* navigation and combat archetypes. Townsfolk work with their tools (brooms, carrying poles, sacks, axes, washing basins). They hawk wares, gossip in pairs, shelter from rain and react to drawn blades. They answer greetings and insults according to temperament and your reputation. Fistfights draw a cheering crowd, guards chase and confront criminals, and street encounters happen by chance. Distant townsfolk run at lower detail. |
| 8 | Battles | **8.5** | Lines and waves, charges and routs, your squad's orders and AI archers. **Standard-bearers** carry each army's banner behind the line, and in field battles and patrols an army **breaks and flees** when its general falls or its losses mount. |
| 9 | RPG systems | **8.5** | Skills that improve with use; Merit, Virtue and Renown; 13 ranks from Peasant to Emperor; inventory, trade and loot; hunger, sleep and medicine; side quests (bounties, patrols, liubo, inn beds). |
| 10 | Story | **9** | Seven chapters with historical figures and events, from a farmer in Lousang to the Peach Garden Oath, the Yellow Turbans, Hulao, Xiaopei, the campaign, Red Cliffs and the Xuchang abdication. The abdication follows the ritual of declining twice before accepting. Choices change Virtue and the endings. The autopilot plays every chapter through to the epilogue with no console errors. |
| 11 | Strategic campaign | **8.5** | A painted map of 14 provinces with income, recruiting, development and diplomacy. Historical events (Guandu, officers seeking a lord, Red Cliffs) and **yearly governing decisions**: floods, locusts, plague and Hua Tuo, the Black Mountain bandits, filial officials, refugees, harvests. Battles resolve automatically or are fought as 3D field battles. |
| 12 | UI and UX | **8.5** | Calligraphic title screen and character creation with a live preview. HUD with the Han calendar, compass, quest tracker, combat star, floating speech, a wanted badge and minigame overlays. Inventory, character, journal, map and guide panels (the guide includes records), plus loading-screen tips. |
| 13 | Audio | **8.5** | Everything is synthesised at runtime. Guqin music with slides and vibrato ornaments (吟猱) and an occasional xiao flute; war drums in battle; music quietens under dialogue. Formant-synthesised voices. Hoofbeats, bowstrings, dogs, cockcrow, the smith's hammer, cicadas, rain, distant battle, and a street qin player you can hear across the market. |
| 14 | Free roam | **9** | Weather, horses, hunting (deer, boar, hares, pheasants, rare tigers), fishing, horse races, archery butts, touhu, arm-wrestling, cockfights, liubo, scribe and granary work, woodcutting, the barber and tailor, a horse dealer, performers, shrines, crime and the law, a bounty board and patrols. Free travel between regions after the story. |
| 15 | Technical | **8.5** | Vite with three.js. Draw calls merged per material, instanced trees, pooled lights, throttled pathfinding, and level of detail for distant townsfolk. **Optional glTF/GLB asset pipeline** via a manifest. A headless autopilot plays the full story and is run as a regression after each round of changes. |

**Average: 8.6.** Characters (8) are the one part below 8.5. Truly realistic people would need sculpted or scanned meshes driven by the same skeleton. That's possible, but outside a fully procedural build.

## Iteration log (what moved the scores)

- **World:** The sky dome was replaced after the far plane clipped the Preetham sky. The river surface was made monotonic. Grass blades were made finer and lighter. Walled towns lost their grass and gained worn streets.
- **Towns:** The first Zhuo was an empty walled field (6/10). Adding shopfront rows, a denser plot grid, a doubled market and street traffic brought it to a lived-in county seat.
- **Characters:** Robe normals were fixed. The head was enlarged ×1.08. Vertex occlusion is baked in. The face shell now has relief, the face texture was redone at 2× with almond eyes and filled lips, and blush was toned down.
- **Combat:** Weapon directions were keyframed, the left arm uses IK on polearms, trails and hit-stop were added, and blood went from square points to round droplets with ground pools. The lock-on camera swings to the shoulder.
- **Story flow:** The autopilot found these stalls, and all are fixed:
  - the proclamation quest finished itself mid-cutscene;
  - a reused actor was left in another village;
  - the Guangzong and Xuchang assault markers led away from the defenders the script was waiting on;
  - starting a mission outside its chapter's region left you in the wrong region.
- **Audio:** The game went from foley and guqin only to voices, hooves, the village soundscape, xiao flute and music ducking.
- **Performance:** Fire lights are pooled, so they no longer force shader recompiles. A* runs on a throttle and with deadlines.

- **Town life (second pass):** The towns went from scenery to places to live. Added people at work with props and new animations, floating speech, greeting and antagonizing, fistfights with crowds, the law and theft, minigames and paid work, fishing, hunting, horse races, street encounters, character creation, a guide with records, and optional glTF art assets.
