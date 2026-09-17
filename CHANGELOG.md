# Changelog

## 0.13.0 (2026-09-17) God Hand feedback, destruction juice, a score, tuned fractures, Rubble God

- **God Hand twist:** dust/chips kick off the shear plane while torsion charges on an anchored grab, and the creak's pitch rises with charge.
- **God Hand twist:** the shear-rip commit now bursts visibly at the sheared seam and spins the freed piece harder (measured about 4.3 rad/s), so the corkscrew is unmistakable.
- **God Hand crush:** every request (including the 0.42s pump repeat) throws a short inward dust implosion, and the crunch sound got heavier.
- The grip halo now actually pulses on a twist rip or a crush hit (the snapFlash field existed but was never rendered before).
- Added a brief camera-facing stress-pulse ring at the exact point a support fails or a structure whole-body-collapses, scaled by camera distance so it reads as a localized marker instead of a screen-filling disc.
- Anchored structures now groan (creak sound) once their stress ratio passes about 0.8, well before the "SUPPORT FAILURE" toast, cooled down per-object so a sustained overload does not spam audio.
- Collapse and fracture-impact sounds are now material-aware (sharper metal crunch, duller bass-heavy concrete thud, light timber clatter) picked by the dominant material (by volume) of the pieces that just broke.
- Catastrophic impacts (impactDamage's own threshold) now layer an extra heavy bass hit on top of the material sound.
- Added a five-line destruction score (WRECKAGE, CHAIN, BIGGEST IMPACT, MASS MOVED, COLLAPSES) to the existing bottom-left demolition contract box.
- Added two new demolition contracts: "Tower, hands only" and "Three drums, one chain", both instantly restartable via Rebuild.
- Fixed the demolition contract box (including the three original objectives) only refreshing while Settings > Performance & tests was open; it now updates during normal play.
- **perf:** telemetry() builds its per-frame stats snapshot once instead of cloning it twice (Object.assign + frames.push now share one object).
- **perf:** renderBodies() walks entities once per frame instead of twice (tower/bridge mission check folded into the lerp loop).
- **perf:** effects() and updateGameHUD() only touch the DOM when a value actually changed since last frame, instead of writing every frame unconditionally.
- QA: the twist test now measures and asserts the sheared piece's real angular velocity instead of only checking a torque impulse was requested; added a read-only `BREAKMASS.scoreDiagnostics` getter.
- **Fracture archetypes tuned on the real district:** the kernel now reads hollow shells the way it reads solid blocks, so towers buckle into stacked sections, walls shear into slabs and floors pancake instead of drifting toward equal cubes. Added two hollow-shell cases (a five-floor tower and a warehouse) to the kernel test.
- **Rubble God is a real mode now:** 10x pull, 2x impact, 4.5 m blast at 2.5x impulse, a 16-pellet shotgun, a 14-charge bomb rain at 40 ms spacing, rockets with a wider blast, supports that give way sooner (failure threshold 0.65 vs 1.0), and a 50 percent bigger rubble budget so more wreckage stays live. Sandbox keeps its exact old numbers as the controllable baseline; the preset summary text reflects whichever mode is active.
- tools: added `stress-measure.mjs`, `profile-hotspots.mjs`, `verify-juice.mjs`, `score-check.mjs`, `twist-latch-check.mjs`, `archetype-district.mjs` and `rubblegod-check.mjs` for this round's receipts.

## 0.12.5 (2026-09-17) Hold-right drag look is back, plus a real gate

- **Hold right mouse to look, like the original.** Release to stop. A quick right click (under 300 ms, barely moved) latches look on instead; click again or Escape releases. Raw mouse motion steers in every case; pointer lock is only a bonus when the browser grants it.
- **Look deltas come from `pointermove`, not `mousemove`.** Browsers stop sending compatibility mouse events while a button is held once pointerdown is cancelled, which is why the camera froze during a left drag whenever the lock was absent.
- The old duplicate drag-look path in the pointer binding is gone; the look capture owns all rotation.
- **Gate:** `node tools/gate.mjs` runs the kernel checks, the three-browser mouse-look suite (`tools/look-check.mjs`: lock granted, lock never answers, lock dropped on click) and the in-page QA suite, and fails on the first regression. It runs before every push from now on.

## 0.12.4 (2026-09-17) A lock the browser drops on a click is ignored

- Trent's browser grants pointer lock on the right click and then releases it on the next left click. Every earlier build treated that browser-initiated unlock as an Escape: latch cleared, grab released, input reset. That is the "left click kills mouse look" and "can't move while left-clicking" pair.
- Now an unlock that happens during or right after a mouse button press is ignored: look stays latched and keeps steering from raw mouse motion, the grip stays, nothing resets. An unlock with no mouse button involved is still treated as Escape. Right click still toggles.
- No more lock retry on left click.
- `tools/clickdrop-check.mjs` simulates that browser (exits the lock on every left mousedown) and asserts look, grab and steering survive.

## 0.12.3 (2026-09-17) Mouse look no longer depends on pointer lock

- Root cause of every look complaint this session: on some machines the browser never grants pointer lock and never says so. The game used to wait for it (1.8 s originally, 0.7 s in 0.12.1) and then drop the latch, which looked like "right click does nothing" and later like "left click kills mouse look" because the grab click landed inside that window.
- Now a right click latches look immediately and the camera rotates from raw mouse movement whether or not the lock arrives. If the lock is granted it takes over (cursor warps to center, unlimited travel). If not, the cursor is hidden over the arena and can drift to the screen edge; right click again re-centers. The lock is retried silently on later clicks.
- A refused lock warns once instead of on every attempt, and never clears the latch.

## 0.12.2 (2026-09-17)

- **Right click toggles mouse look.** One click locks the cursor and looks; click again or press Escape to release. No more hold-to-look, no more Lock-look button.

## 0.12.1 (2026-09-17) Feel fixes from Trent's play session

- **Q / E fly up and down again while holding a building.** 0.12.0 had put twist on Q / E, which broke the core lift move (grab a roof, press E to rise). Twist is now Alt plus sideways mouse only.
- **Orbit camera removed from the controls.** Fly and third person only. V toggles between them, the camera menu lists two modes, district overview stays in fly. Middle drag no longer pans; middle mouse is crush while gripping and nothing otherwise. The orbit math survives only behind the QA and screenshot hooks.
- **Right-button look responds immediately.** Right-drag now rotates the camera while the pointer-lock request is still pending or refused, instead of ignoring the mouse for up to 1.8 s. Lock timeout cut to 0.7 s. If the lock is granted, it takes over as before.
- **Fewer buttons.** The Lock-look button left the topbar. L still latches look, Escape releases, and the help panel says so.
- HUD copy back to the short form ("Pull to rip · Shift peel · X throw", "Pull to snap"). Twist and crush are described in Help only.

## 0.12.0 (2026-09-17) God Hand twist and crush, fracture archetypes

- **Fracture archetypes.** The voxel kernel now picks a partition profile from the shape of the material being broken (or `cut.archetype` forces one): `pancake` for thin horizontal slabs (floor plates), `shear` for thin walls (stepped diagonal slabs, never cut across the thin axis), `buckle` for tall columns and towers (stacked sheared sections), `snap` for long beams (a few long sections cut across the beam), `spall` for small local damage (small pieces peel off, the big remainder survives), `shatter` for everything else (the original mixed partition, unchanged). Same seams, crumbs and mass rules as before. `result.fracture.archetype` reports the choice; `BREAKMASS.lastFracture` exposes it.
- **God Hand twist.** Q / E, or hold Alt and move the mouse sideways, corkscrews the held material about vertical. On an anchored structure torsion charges a shear rip through the same support graph the pull uses, with the tangential direction as the load; the sheared section keeps spinning off with an angular impulse. On a loose body it drives angular velocity directly. Q / E stop flying you up and down only while something is gripped. The pull meter reads "Twist" while torsion charges.
- **God Hand crush.** Middle mouse while gripping fractures a small region around the grip with the spall archetype, no explosive charge, then pulls the new pieces and any nearby loose rubble inward toward the hand. Hold to keep compacting. Middle mouse still pans the camera when nothing is held.
- New QA coverage: kernel archetype checks in `tools/kernel-check.mjs` (eight shapes, mass and cut-direction assertions) and two in-page tests (twist shears the water tank off its legs; crush fractures around the grip without losing it).
- Hooks: `BREAKMASS.setTwist(rate)`, `BREAKMASS.crush()`, `BREAKMASS.twistState`, `BREAKMASS.lastFracture`. Economy counters `twistRips` and `crushes`.

## 0.11.3 (2026-09-17) Polish pass, first public hosting

- Demolition contract HUD is visible again. It was fully wired (tank toppled, span dropped, three drums, shots, best chain) but hidden by a CSS rule and had no styling. Now a compact bottom-left block that hides with `H` and on narrow screens.
- Self-test fix: the whole-body fracture check demanded exactly 16 fragments, but the partition seams legitimately shed a few one-to-four voxel crumb chips on top of the 16 structural shards (identical in v0.11.0 through v0.11.2, mass preserved exactly). The check now asserts 16 structural shards, crumbs under chip size, and no lost material. The in-page QA suite passes 10 of 10 again.
- Player-facing strings no longer use em dashes (toasts, title, status text). Stat placeholders and code comments untouched.
- Social meta: canonical URL, `og:url`, `og:image` (1200x630 render), Twitter card.
- Repo tooling: `tools/verify.mjs` (headless boot plus QA harness over CDP), `tools/kernel-check.mjs` (voxel kernel in Node), `tools/og-shot.mjs`.

## 0.11.2 "Heavy Landing"

- Freshly separated fragments get collision boxes chosen from inside their own material (`interiorCover`) instead of an outward-filled tiled envelope, so siblings never overlap on the first solver step and collapses stop exploding outward.
- New shards get a 4 mm inward collider skin, zero restitution, and density scaled to keep mass exact.
- Emergency single-shape physics fallback uses the largest interior cuboid rather than the full bounds.
- Crush and God Hand jam fractures no longer inject hidden scatter energy. The hand spring and gravity supply the force.

## 0.11.1

- God Hand jam detection rewritten: net material movement over a 0.22 s sliding window instead of instantaneous velocity, so contact jitter cannot reset the stuck timer forever and pending voxel edits cannot swallow a hard pull.
- Jam fractures carry a witness pose and are cancelled if the grip is released, replaced, turned away, or the body starts moving on its own.
- Jam fracture is a priority-100 live-grip transaction, serviced before routine damage work.
- `pullDiagnostics` reports jam state, reason and window for QA.

## 0.11.0

- Baseline: worker physics, worker voxel meshing, irregular fractures, God Hand with support-graph rips, Sandbox and Rubble God presets, industrial district with four zones, rockets, shotgun, rifle, blast, bomb rain, chisel, props, in-page QA harness and slam test.
