# CLAUDE.md, BREAKMASS

Single-file voxel destruction sandbox. Live at https://tront.xyz/breakmass/ (GitHub Pages, `main` root, `.nojekyll`).

## Read first

- `NOTES.md`: the handoff from the original ChatGPT sessions. Design intent, performance history, past regressions, and the do-not-touch list. It is authoritative on why things are the way they are.
- `ROADMAP.md`: current priority stack and known gaps.

## Rules

- Physics stays in the worker. No synchronous catch-up steps on the main thread. No global CCD on rubble.
- Never delete a visible mesh before its replacement is ready. Commit geometry transactionally.
- Soft budgets only. Degrade collision fidelity, never refuse a player-requested fracture.
- God Hand is the product. Default 6x, slider to 12x, and the slider must actually drive the spring.
- Tool order 1 to 8 is fixed (Rifle, Shotgun, Rocket, Blast, God Hand, Bomb rain, Chisel, Props). Muscle memory has formed.
- Every icon control has a visible text label. Panels closed by default. No SaaS-template UI.
- No em dashes in player-facing strings or docs. Discord links are `tront.xyz/discord/`.
- Never call kernel tests, mocks or screenshots a playtest. Label what was measured.

## Workflow

1. Edit `index.html` in place. Bump the version string (10 occurrences, `grep -c` the old one) and add a `CHANGELOG.md` entry.
2. `node tools/kernel-check.mjs` for kernel-only changes.
3. `node tools/verify.mjs --qa` before any push. It boots the real page in headless Chrome (SwiftShader WebGL) and runs the in-page QA harness. 10 of 10 is the bar.
4. Screenshots land in `tools/out/` (gitignored). `node tools/og-shot.mjs` regenerates `og-image.png`; bump `?v=` on the `og:image` meta so Discord refetches.
5. Freeze a copy in `versions/` when a build is worth diffing against later.
6. Commit and push. Pages deploys from `main` in about a minute. Re-run `verify.mjs` against the live URL.

## Public hooks

`window.BREAKMASS` exposes the game for QA: `stats`, `frames()`, `liveQueue`, `materialProbe(id)`, `blast(x,y,z,r)`, `cutTower()`, `cutBridge()`, `fireRocket()`, `bombRain()`, `grabAt(id, point)`, `aimAt(point, distance)`, `runSelfTests()`, `pullDiagnostics`, `impactDiagnostics`. `window.BREAKMASS_QA.run()` runs the gameplay suite; `?qa=1` runs it at boot.
