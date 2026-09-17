# BREAKMASS Roadmap

Status as of v0.13.0 (2026-09-17). `NOTES.md` holds the long-form design history; this file is the short "where are we and what next" view.

## What exists (v0.11.x baseline)

- One-file game: Three.js 0.180 rendering, Rapier 0.17 physics in a dedicated worker, voxel kernel in a second worker pool, 0.25 m voxels, greedy surface meshing, compound box colliders capped around 24 per dynamic piece.
- District: Breach Yard, Concrete Heights, The Foundry, Physics Park. Roughly 112 x 104 m. Water tower, bridge span, silos, chimneys, warehouses, containers, dominoes, fuel drums, cranes. Foundry-only and Physics-Park-only presets.
- Tools: Rifle, Shotgun, Rocket (powered, swept), Blast, God Hand (default), Bomb rain, Chisel, Props. Sandbox and Rubble God power presets.
- God Hand: grab anchored or loose material, support-graph rips, grip follows the fragment through fractures, Shift peel, X throw, wheel reach, K click-latch, jam fallback that fractures a wedged body after a sustained pull. Since 0.12.0: Q/E or Alt+mouse twist (torsion shear rip on anchored structures, spin on loose bodies) and middle-mouse crush (spall fracture around the grip, pieces implode toward the hand).
- Fracture archetypes (0.12.0): the kernel picks pancake, shear, buckle, snap, spall or shatter partitions from the shape of the material being broken.
- Impact destruction that breaks on the first meaningful slam, splash-ignited barrels with chain reactions, soft rubble budgets (lightweight rubble instead of refused edits).
- Demolition contract: topple the tank, drop the span, ignite three drums, plus shots and best chain. Hidden until 0.11.3, now visible bottom-left.
- QA: in-page QA harness (`BREAKMASS_QA.run()`), self-test suite, slam test, stress runner. Headless runners in `tools/`.

## What changed, 0.11.0 to 0.11.3

| Version | Change | Why |
|---|---|---|
| 0.11.1 | Jam detection uses net movement over a 0.22 s window, with a witness pose and cancellation | 12x pulls on a wedged building used to do nothing forever |
| 0.11.2 | Interior collider cover for new shards, 4 mm skin, zero restitution, no free scatter energy | Collapsing buildings exploded outward from sibling depenetration |
| 0.11.3 | Contract HUD shown, self-test assertion fixed, em dashes out of UI strings, OG meta, repo tooling | First public hosting at tront.xyz/breakmass |
| 0.12.0 | Fracture archetypes (pancake, shear, buckle, snap, spall, shatter), God Hand twist (Q/E, Alt+mouse) and crush (middle mouse) | Priority items 2 and 3: kill the procedural-cube look, make the hand the signature |

## What still needs work (found during the 0.11.3 pass)

- The self-test's whole-body fracture expectation was wrong since at least 0.11.0, which means the QA suite had been reporting a failure nobody was reading. Run `node tools/verify.mjs --qa` before every push from now on.
- Seam crumbs (one-to-four voxel chips along partition seams) still appear with every archetype. Absorb them into the neighbouring shard in the kernel.
- Archetype weights are first-pass numbers tuned in Node on solid blocks. Real buildings are hollow shells with floors; watch how `shear` and `buckle` read on the district towers and retune from screenshots.
- Twist on loose bodies is a pure angular-velocity drive. It should also load torsion into the neighbours of a held anchored piece (twisting a beam should stress the wall it sits in).
- ~~`updateGameHUD` runs every frame and touches eight DOM nodes; cheap, but once the score layer lands it should update on change only.~~ Done in 0.13.0: it now caches last-written values and only touches the DOM on change, and runs unconditionally during normal play instead of only while Settings > Performance & tests was open.
- Rapier's `init` prints a deprecation warning about positional arguments. Harmless, but it will break on a future Rapier bump. Pass an options object when upgrading.
- The contract HUD is hidden under 980 px width. Touch layouts have no objective readout at all.
- No `og-image` regeneration on content change; `tools/og-shot.mjs` is manual.

## Priority stack (agreed 2026-09-17)

Engine architecture is frozen unless a regression forces it. The next work makes people want to keep screwing around with the destruction.

1. **Readable, juicy destruction. DONE (0.13.0).** Supports groan before failing, a camera-facing stress pulse marks where a structure gave way, collapse and impact sounds are material-aware (metal/concrete/timber), catastrophic impacts layer an extra bass hit.
2. **Fracture archetypes.** Same voxel kernel, different partition weighting chosen by geometry and material: walls shear into slabs, towers buckle vertically, floors pancake, concrete corners spall, beams snap into long sections. Kills the remaining procedural-cube look.
3. **God Hand as the signature mechanic. DONE (0.13.0 pass 2).** Wheel is reach, Shift peels, X throws, twist and crush from 0.12.0 now read as real feedback: dust/chips shear off while torsion charges, a rising creak, a visible seam burst and a stronger corkscrew on rip, an inward dust implosion on every crush, and the grip halo actually pulses on both.
4. **Destruction score, stupid simple. DONE (0.13.0).** WRECKAGE, CHAIN, BIGGEST IMPACT (honest J/kJ/MJ units), MASS MOVED, COLLAPSES, all in the existing demolition contract box. Two new contracts: "Tower, hands only" and "Three drums, one chain".
5. **Demolition contracts.** Two shipped in 0.13.0 (above); the rest of the tiny-scenario list (bridge without explosives, water tank through the warehouse, etc.) is still open. Optional, instantly restartable, no dialogue, no campaign.
6. **Rubble God becomes a real mode.** Maximum strength, aggressive failure, huge explosions, absurd bomb rain, forgiving budgets. Sandbox keeps more structural integrity.
7. **Noita direction, carefully.** Three active substances in localized volumes first: fuel spreads and ignites, water falls and pours through holes, fire propagates into flammable voxels and weakens them. Simulate near active regions only. Sand next if it works.
8. **Scenes built around one gimmick each.** High-rise construction site with cranes and suspended loads. Refinery full of chain reactions. Hillside neighbourhood that tumbles downhill. A dam. A parking garage built to pancake. A shipyard with containers and gantries.

**Done in 0.12.0:** God Hand twist and crush plus fracture archetypes (items 3 and 2), first pass. **Done in 0.13.0:** juicy destruction feedback (1), God Hand twist/crush read (3, second pass), the destruction score plus two demolition contracts (4 and part of 5), fracture archetypes retuned on the real district (2), Rubble God as a real mode (6), and three measured main-thread perf cuts. **Next up:** the rest of the demolition contract list (5), then the Noita-direction active substances (7) and gimmick scenes (8).

**Not next:** more conventional firearms, more menus, another giant district, physics rewrites, multiplayer.

## The target moment

Grab the roof of a five-story building, twist, hear the lower supports crack, yank upward, rip the top three floors loose, throw the whole chunk through the building across the street. If BREAKMASS delivers that consistently, it is a game.
