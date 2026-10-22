# Hands-only tank contract review

Baseline: `64bb29d` (public v0.13.1). Candidate: v0.13.3 on
`codex/breakmass-challenge-20261022`. This is a local review checkpoint;
publication is outside this pass.

## Finding from actual play

Played the current public build at 1280 x 720 with native in-app browser inputs.
From the starting tank view: K for click latch, click the tank, hold E to rise,
then X to throw. The tank ripped free and the hands-only checkmark was earned.
Selecting Rocket and firing once erased that earned checkmark. The tank throw
and its chain reaction already worked and remain the core interaction.

The baseline calculates the checkbox from `missionTower && shotCount === 0`
every frame. That also permits non-shooting tools such as Blast and Chisel to
earn a purported hands-only completion. This pass gives the existing contract
a clear attempt lifecycle, rather than adding a new mode or challenge system.

## Resulting behavior

- A hand topple completes the attempt permanently until the next rebuild.
- Using another destructive tool, props, gravity shove or a diagnostic fixture
  cut before success fails it. Selecting a tool alone does not. Hand-triggered
  barrel chains remain valid.
- Blast counts when it hits any surface, including empty ground with no damage.
  An empty-sky click with no target creates no blast and stays eligible.
- Help shows the failure reason and contains Retry tank contract. It uses the
  existing confirmation dialog and warns that all district damage and spawned
  props will be cleared. Cancel preserves the result.
- Confirmed retry rebuilds the district, resumes play at the same tank view and
  selects God Hand. It retains power settings and existing control preferences.
- Foundry and Physics Park have no tank; the contract says Whole district and
  the Help retry can load that scene.
- About describes the actual existing flight bindings: WASD, Space/E up,
  Ctrl/Q down, right-mouse look. Q/E were valid aliases, not broken controls.

The physics worker, voxel worker and impact policy sources remain byte-for-byte
identical after newline normalization. Tool order, two camera modes, power
presets, persistent rubble, screenshot capture and preference storage are
unchanged. The game identifies itself as single-player; no multiplayer system
was added or removed.

## Reproduction and verification

CPU: `node --test tests/hands-contract.cjs tests/about-contract.cjs` and
`node tools/kernel-check.mjs`.

Actual-page integration: `node tools/contract-check.mjs`. For comparison,
run the same script with an exported v0.13.1 `index.html` and `--baseline`.
`PORT` chooses an isolated CDP port; `EVIDENCE_DIR` chooses the output folder.
It compares the same scene, 1280 x 720 viewport, default Sandbox powers,
latched tank grab, E rise until topple, X throw and one rocket. It records
camera and contract state plus screenshots. Physics outcomes and elapsed wall
time are not claimed to be identical.

The independent review of `def3802` found a Blast loophole: radius 0.65 on ground
at (-22.7, 0, 25.3) ignited Fuel drum 4 without direct voxel edits. The v0.13.3
correction counts the player's surface-targeted Blast before its effects, rather
than checking the number of cuts or changing the shared explosion function.
`node tools/blast-contract-check.mjs` reproduces that precise chain twice, then
topples the tank with the hand and requires the attempt to remain failed. It
also tests empty sky, harmless ground, a real hand-thrown fuel chain before the
tank falls, and earned completion after later Blast use. Use `--before` with
an exported `def3802` page to record the old bypass under matching conditions.

The contract runner uses CDP mouse events and synthetic DOM keyboard input.
Those are integration checks, separate from the native-input self-play.
`node tools/gate.mjs` runs the inherited mouse-look and gameplay regressions.
Its `verify.mjs` runner does not propagate a failing QA report as an exit code,
so inspect `tools/out/qa.json` as well as the gate console result.

No performance gain or cross-device behavior is claimed. A separate checkpoint
receipt beside this checkout records completed runs, native screenshots,
Library identity and any remaining limitations for the independent reviewer.
