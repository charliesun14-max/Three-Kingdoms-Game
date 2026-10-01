# Scorecard

This is a self-assessment of each part of the game, scored out of 10, with the iteration history behind each score. Each score compares the game against what a browser game built entirely from procedural assets can reach. It does not compare against a AAA studio title. Where a part is still below 8.5, the reason is stated.

Screenshots are in `screenshots/final/`.

| # | Part | Score | Notes |
|---|------|:----:|-------|
| 1 | Terrain, sky and water | **8.5** | Heightfield with river carving and splat-mapped ground. A custom sky dome with clouds, plus drifting cloud shadows on the land. Fog, PMREM lighting, GTAO on high quality, chimney smoke, birds, sunlit motes, and a fire-reddened sky at Red Cliffs. |
| 2 | Vegetation | **8.5** | GPU grass and millet that follow the camera. Leaf-card trees with spherical normals and wind. Peach trees redrawn as twig sprays with five-petal blossoms. |
| 3 | Architecture and towns | **8.5** | Hip, gable and pyramid roofs with upturned eaves. Rammed-earth walls, gate and corner towers, Han watchtowers, yamen compounds, a pass fortress, an abdication altar and a chained fleet. Zhuo now has shopfront-lined main streets, worn street ground, a 12-stall market and street traffic. |
| 4 | Characters | **7.5** | Skinned procedural humanoids in correct Han dress: right-over-left closure, Han-dynasty headwear and lamellar armour. Faces have sculpted relief and a 2× painted texture. Historical figures have their traditional looks. Still stylised next to scanned or sculpted characters. |
| 5 | Animation | **8** | Keyframed procedural clips, two-bone IK for two-handed polearms, weapon direction keyed per frame, gait blending, breathing, and head and neck look-at during dialogue, combat and passing. There is no motion capture and no foot IK on slopes. |
| 6 | Combat | **8.5** | KCD-style four-direction attacks, attack tokens, perfect-block windows, ripostes, stamina, bleeding, and armour mitigation by damage type. Weapon trails, hit-stop, blood that lands, pools under the fallen, and archery. The lock-on camera swings wide so the foe stays visible. |
| 7 | AI and NPC life | **9** | Daily schedules, A* navigation and combat archetypes. Townsfolk work with their tools (brooms, carrying poles, sacks, axes, washing basins). They hawk wares, gossip in pairs, shelter from rain and react to drawn blades. They answer greetings and insults according to temperament and your reputation. Fistfights draw a cheering crowd, guards chase and confront criminals, and street encounters happen by chance. Distant townsfolk run at lower detail. |
| 8 | Battles | **8** | Lines and waves, charges and routs. Your squad follows, charges or holds on command, and AI archers form up. Battles are scripted for Daxing, Guangzong, Hulao, Xiaopei, Red Cliffs and Xuchang, plus generated field battles from the campaign. |
| 9 | RPG systems | **8.5** | Skills that improve with use; Merit, Virtue and Renown; 13 ranks from Peasant to Emperor; inventory, trade and loot; hunger, sleep and medicine; side quests (bounties, patrols, liubo, inn beds). |
| 10 | Story | **9** | Seven chapters with historical figures and events, from a farmer in Lousang to the Peach Garden Oath, the Yellow Turbans, Hulao, Xiaopei, the campaign, Red Cliffs and the Xuchang abdication. The abdication follows the ritual of declining twice before accepting. Choices change Virtue and the endings. The autopilot plays every chapter through to the epilogue with no console errors. |
| 11 | Strategic campaign | **8** | A painted map of 14 provinces, income and recruiting, and AI warlords (Cao Cao, Yuan Shao, Sun Quan and others). Battles resolve automatically or are fought as 3D field battles. Titles go Duke, then King, then Emperor. |
| 12 | UI and UX | **8.5** | Calligraphic title screen and character creation with a live preview. HUD with the Han calendar, compass, quest tracker, combat star, floating speech, a wanted badge and minigame overlays. Inventory, character, journal, map and guide panels (the guide includes records), plus loading-screen tips. |
| 13 | Audio | **8.5** | Everything is synthesised at runtime. Guqin music with slides and vibrato ornaments (吟猱) and an occasional xiao flute; war drums in battle; music quietens under dialogue. Formant-synthesised voices. Hoofbeats, bowstrings, dogs, cockcrow, the smith's hammer, cicadas, rain, distant battle, and a street qin player you can hear across the market. |
| 14 | Free roam | **9** | Weather, horses, hunting (deer, boar, hares, pheasants, rare tigers), fishing, horse races, archery butts, touhu, arm-wrestling, cockfights, liubo, scribe and granary work, woodcutting, the barber and tailor, a horse dealer, performers, shrines, crime and the law, a bounty board and patrols. Free travel between regions after the story. |
| 15 | Technical | **8** | Vite with three.js. Draw calls merged per material, instanced trees, pooled fire lights (so shaders never recompile), throttled pathfinding, and about 1.4 ms of simulation per tick in a 40-unit battle. There's a headless autopilot test harness. Weak GPUs may struggle with the shadows. |

**Average: 8.4.** Characters (7.5) are the honest weak point. Making them more realistic would need sculpted or scanned meshes, which is outside a fully procedural, asset-free build.

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
