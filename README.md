# BREAKMASS

The city is ammunition. A single-player voxel destruction sandbox by Tront (Trent Sterling).

Play: https://tront.xyz/breakmass/

Grab a building with the God Hand, rip it off its supports, swing it through the building next door. Rockets, shotgun, bomb rain and a blast tool for when hands are not enough.

## Files

| Path | What |
|---|---|
| `index.html` | The game. One file, no build step. Three.js 0.180 and Rapier 0.17 load from pinned CDNs (jsDelivr, unpkg fallback). |
| `versions/` | Frozen prior builds (v0.11.0, v0.11.1, v0.11.2) kept for diffing and regression hunting. |
| `NOTES.md` | Tribal knowledge handoff from the original ChatGPT sessions: design intent, performance history, regressions, do-not-touch list. Read it before changing anything structural. |
| `ROADMAP.md` | What exists, what changed in the 0.11.x line, what still needs work, and the agreed priority stack. |
| `CHANGELOG.md` | Per-version notes. |
| `tools/` | Zero-dependency headless verification (Chrome DevTools Protocol from Node). See below. |

## Controls

- `1` Rifle, `2` Shotgun, `3` Rocket, `4` Blast, `5` God Hand (default), `6` Bomb rain, `7` Chisel, `8` / `B` Props
- God Hand: hold left mouse to grab, wheel for reach, `Shift` to peel, `X` to throw, `K` for click-latch
- `WASD` fly, `Space` / `Ctrl` up and down, hold right mouse to look, `L` locks look, `V` cycles camera
- `T` quarter speed, `J` jetpack, `R` rebuild, `H` hide HUD, `P` pause, `M` world map

## Verifying a build

```
node tools/kernel-check.mjs           # voxel kernel in Node, no browser
node tools/verify.mjs --qa            # boots the real page headlessly, runs the in-page QA harness
node tools/verify.mjs https://tront.xyz/breakmass/ --qa   # same against the live site
node tools/og-shot.mjs                # regenerates og-image.png
```

`verify.mjs` launches Chrome headless with SwiftShader WebGL, so it proves the real Three.js, Rapier WASM and worker pipeline boot and run. It uses programmatic DOM input, not OS pointer lock, and software rendering frame times are not representative of a GPU. Treat it as a regression gate, not a playtest.

## Credits

Rendering: [Three.js](https://threejs.org). Physics: [Rapier](https://rapier.rs). Original procedural models and destruction code. Inspired by Teardown and Noita; not affiliated.

More games at https://tront.xyz. Discord: https://tront.xyz/discord/
