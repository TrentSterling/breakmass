# BREAKMASS Roadmap

Status as of v0.11.3 (2026-09-17). `NOTES.md` holds the long-form design history; this file is the short "where are we and what next" view.

## What exists (v0.11.x baseline)

- One-file game: Three.js 0.180 rendering, Rapier 0.17 physics in a dedicated worker, voxel kernel in a second worker pool, 0.25 m voxels, greedy surface meshing, compound box colliders capped around 24 per dynamic piece.
- District: Breach Yard, Concrete Heights, The Foundry, Physics Park. Roughly 112 x 104 m. Water tower, bridge span, silos, chimneys, warehouses, containers, dominoes, fuel drums, cranes. Foundry-only and Physics-Park-only presets.
- Tools: Rifle, Shotgun, Rocket (powered, swept), Blast, God Hand (default), Bomb rain, Chisel, Props. Sandbox and Rubble God power presets.
- God Hand: grab anchored or loose material, support-graph rips, grip follows the fragment through fractures, Shift peel, X throw, wheel reach, K click-latch, jam fallback that fractures a wedged body after a sustained pull.
- Impact destruction that breaks on the first meaningful slam, splash-ignited barrels with chain reactions, soft rubble budgets (lightweight rubble instead of refused edits).
- Demolition contract: topple the tank, drop the span, ignite three drums, plus shots and best chain. Hidden until 0.11.3, now visible bottom-left.
- QA: in-page QA harness (`BREAKMASS_QA.run()`), self-test suite, slam test, stress runner. Headless runners in `tools/`.

## What changed, 0.11.0 to 0.11.3

| Version | Change | Why |
|---|---|---|
| 0.11.1 | Jam detection uses net movement over a 0.22 s window, with a witness pose and cancellation | 12x pulls on a wedged building used to do nothing forever |
| 0.11.2 | Interior collider cover for new shards, 4 mm skin, zero restitution, no free scatter energy | Collapsing buildings exploded outward from sibling depenetration |
| 0.11.3 | Contract HUD shown, self-test assertion fixed, em dashes out of UI strings, OG meta, repo tooling | First public hosting at tront.xyz/breakmass |

## What still needs work (found during the 0.11.3 pass)

- The self-test's whole-body fracture expectation was wrong since at least 0.11.0, which means the QA suite had been reporting a failure nobody was reading. Run `node tools/verify.mjs --qa` before every push from now on.
- Fracture partitions shed one-to-four voxel crumbs along seams (3 of 19 fragments in the 24x32x20 test block). They are handled as chips, but they are part of the "everything becomes cubes" feel. Fracture archetypes should absorb crumbs into the neighbouring shard.
- `updateGameHUD` runs every frame and touches eight DOM nodes; cheap, but once the score layer lands it should update on change only.
- Rapier's `init` prints a deprecation warning about positional arguments. Harmless, but it will break on a future Rapier bump. Pass an options object when upgrading.
- The contract HUD is hidden under 980 px width. Touch layouts have no objective readout at all.
- No `og-image` regeneration on content change; `tools/og-shot.mjs` is manual.

## Priority stack (agreed 2026-09-17)

Engine architecture is frozen unless a regression forces it. The next work makes people want to keep screwing around with the destruction.

1. **Readable, juicy destruction.** Cause and effect, not more particles. Concrete cracks and chips before separating, supports groan before failing, metal crunches sharper, brittle materials shed smaller pieces, heavy impacts thud. A 100 to 200 ms stress pulse around the failing region so the player sees where the structure gave way.
2. **Fracture archetypes.** Same voxel kernel, different partition weighting chosen by geometry and material: walls shear into slabs, towers buckle vertically, floors pancake, concrete corners spall, beams snap into long sections. Kills the remaining procedural-cube look.
3. **God Hand as the signature mechanic.** Wheel is reach, Shift peels, X throws. Add twist (secondary input, corkscrew the top of a tower until supports shear) and crush (middle mouse, pull nearby voxels toward the grip and compact or break them). No gun number seven.
4. **Destruction score, stupid simple.** WRECKAGE $2.4M, CHAIN x7, BIGGEST IMPACT 18.2 MN, STRUCTURE COLLAPSE, TOTAL MASS MOVED 312 t. Reasons to try ridiculous things without ruining the sandbox.
5. **Demolition contracts.** Tiny scenarios on the same sandbox: tower with God Hand only, $1M with one thrown object, three buildings in one chain, bridge without explosives, water tank through the warehouse. Optional, instantly restartable, no dialogue, no campaign.
6. **Rubble God becomes a real mode.** Maximum strength, aggressive failure, huge explosions, absurd bomb rain, forgiving budgets. Sandbox keeps more structural integrity.
7. **Noita direction, carefully.** Three active substances in localized volumes first: fuel spreads and ignites, water falls and pours through holes, fire propagates into flammable voxels and weakens them. Simulate near active regions only. Sand next if it works.
8. **Scenes built around one gimmick each.** High-rise construction site with cranes and suspended loads. Refinery full of chain reactions. Hillside neighbourhood that tumbles downhill. A dam. A parking garage built to pancake. A shipyard with containers and gantries.

**Next up:** God Hand twist and crush plus fracture archetypes (items 3 and 2). Then the score layer (4), which turns the existing sandbox into a game without months of content.

**Not next:** more conventional firearms, more menus, another giant district, physics rewrites, multiplayer.

## The target moment

Grab the roof of a five-story building, twist, hear the lower supports crack, yank upward, rip the top three floors loose, throw the whole chunk through the building across the street. If BREAKMASS delivers that consistently, it is a game.
