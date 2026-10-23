# Physics progress in gameplay QA

This is a correction to the opt-in test harness, not a gameplay or performance
change. The animation loop, physics worker, tool logic and game version remain
unchanged. The tests observe normal frames; they never step physics themselves.

Hosted run 39916638721 compared live `dab69052` and candidate `7a72ef52`
sequentially on one Ubuntu 24.04 VM, installed Chrome 155, SwiftShader, 1280x800,
with the same driver and fresh profiles. Both passed 9/12 and failed the same
three wall-clock waits. Artifact 12485303115 retains the failures and telemetry;
its SHA-256 is `8f505f2679edba03b6d5f3f8c277ae9a0cc3e0b2597ad30691c44930a5a4d5ff`.

The worker advances at most one fixed 1/60-second tick per animation frame.
Measured frame medians during those waits were 433-733 ms. Twist had only 29/27
ticks available through the final retained frame, including an outstanding tick,
against 33 needed by the existing charge expression. Rain reached seven of ten
charges. Source replay at the actual simulation origins matched all retained
rain states and needed 37 ticks, including floating-point interval rounding.

| Wait | Simulation budget | Wall watchdog | Rationale |
| --- | ---: | ---: | --- |
| Twist shear | 60 ticks / 1 s | 60 s | 33 charge ticks plus normal commit time; observed 517 ms frame median |
| Ten rain charges | 60 ticks / 1 s | 60 s | 37 dispatch ticks at the observed origins; observed 433-450 ms frame median |
| Target ground fracture | 120 ticks / 2 s | 120 s | Existing launch is 30 m high at -28 m/s; allow fall, contact, commit and draw; observed 683-733 ms frame median |

These are functional test budgets, not acceptable player-facing latency targets.
Completion must satisfy the predicate within both limits. Advancing ticks without
the event fails; insufficient or absent progress ends at the wall watchdog.
Cancellation, runtime errors, readiness loss and a reversed/reset clock fail
closed. Browser/job process deadlines remain an outer bound if JavaScript itself
stops executing. UI and queue-drain deadlines are unchanged.

The slam still requires the global fracture counter to increase, and now also
requires a new accepted trace for the released body's exact entity and root,
contacting `ground` after launch, with committed fragments and a submitted draw.
This rejects prior false positives from Billboard root 18 and Workshop root 1.
An unrelated body of the same root cannot satisfy it either.

Each wait records its start/end wall time, simulation tick, frame timestamp, QA
reset epoch, elapsed ticks, outcome and relevant state. Slam records the launch
identity, requested position/velocity, retained body pose and impact traces.
These survive failures in `qa-telemetry.json`; a failed case stays failed.
Rain queues and the twist override are released in `finally` paths.

`node --test tests/qa-progress.cjs` uses the actual extracted QA helper and case
cleanup code with mocked clocks/observations. It is CPU coverage, not a browser,
Rapier, human-play or performance qualification. Hosted gameplay, contract,
Blast/valid-hand-chain, retry and native DOM confirmation gates are still required
before release. The old diagnostic comparison remains pinned to its original
sources; a new hosted comparison needs separately reviewed orchestration.
