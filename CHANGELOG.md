# Changelog

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
