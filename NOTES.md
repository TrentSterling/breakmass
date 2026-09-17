# BREAKMASS — PROJECT HANDOFF / TRIBAL KNOWLEDGE

You are taking over development of BREAKMASS, a browser-based voxel destruction sandbox made primarily with Three.js + Rapier.

The latest baseline you should trust is:

BREAKMASS v0.11.2 — “Heavy Landing”

Treat the supplied latest source files as authoritative. This document explains the design intent, historical decisions, performance lessons, UX preferences, previous regressions, and where the project is supposed to go.

Do NOT resurrect older architecture just because it looks simpler.

---

# 1. WHAT BREAKMASS IS

BREAKMASS began as a clean-room experiment inspired by Teardown-style destruction, with ShatterVox used only as behavioral/reference inspiration rather than implementation code.

The project has since developed its own identity.

The fantasy is NOT merely:

“Shoot holes in voxel buildings.”

The actual hook is:

“THAT BUILDING IS MY WEAPON.”

The signature mechanic is the GOD HAND: grab buildings, structures, tanks, chunks, etc., rip them from their supports, swing them around, smash them into other structures, peel sections away, throw pieces, and generally abuse structural physics.

The game should feel like being an absurdly powerful destruction god in a physical city.

A useful marketing phrase we liked:

BREAKMASS
“The city is ammunition.”

Long-term, the project could evolve toward a third-person Noita-like sandbox with material simulation, but DO NOT jump there prematurely. The current rigid-body destruction sandbox needs to remain excellent first.

---

# 2. CORE DESIGN PRIORITIES

In priority order:

1. FUN DESTRUCTION
2. RESPONSIVE GOD HAND
3. SMOOTH FRAME PACING
4. IMMEDIATE CAUSE → EFFECT
5. READABLE / SATISFYING COLLAPSES
6. SIMPLE UX
7. SANDBOX FREEDOM
8. SIMULATION ACCURACY

Accuracy is deliberately below responsiveness.

If choosing between:
- a theoretically accurate solver that freezes the game
- a permissive approximation that looks convincing and stays smooth

choose the approximation.

We are absolutely willing to cheat physics.

We are NOT willing to:
- randomly refuse destruction because of hard budgets
- freeze the renderer behind physics
- have God Hand pulls mysteriously do nothing
- delay obvious high-energy destruction until a later collision
- turn every building into perfectly symmetrical cubes
- delete huge visible rubble piles just because a count limit was reached

---

# 3. PERFORMANCE HISTORY — VERY IMPORTANT

Early versions ran Rapier physics synchronously on the render/main thread.

This became awful once many rubble bodies collided.

The old render loop could perform multiple synchronous physics catch-up steps before rendering another frame. On heavy collapses this made the entire game appear frozen even on a powerful PC.

The major breakthrough was:

AUTHORITATIVE RAPIER PHYSICS MOVED TO A DEDICATED WORKER.

Do not undo this.

Current philosophy:

- Physics targets 60 Hz.
- Physics has ONE outstanding fixed tick.
- Do NOT queue catch-up physics steps indefinitely.
- Rendering continues using the latest completed physics state.
- If the simulation falls behind, simulation time may lag rather than freezing drawing.
- Voxel meshing/destruction also happens in workers.
- Main thread primarily handles rendering, input, UI, query state, commit/application, etc.

This change massively improved perceived smoothness.

The user explicitly reported the worker build was “SO MUCH SMOOTHER”.

---

# 4. CCD POLICY

Continuous collision detection was intentionally removed for normal rubble.

Do NOT turn full CCD back on globally.

Ordinary fast building fragments are allowed to occasionally tunnel rather than murdering CPU performance.

Rockets have their OWN explicit swept collision logic and therefore do not need normal building CCD.

General rule:

NO EXPENSIVE CCD ON LARGE COMPOUND RUBBLE.

---

# 5. VOXEL / RENDERING ARCHITECTURE

Never use one rigid body per voxel.

The project uses:

- voxel material volumes
- local dirty-region/chunk processing
- exposed-face meshing
- greedy surface merging
- worker-side geometry generation
- connected-component separation
- one rigid body per coherent detached piece
- compound box collision shapes

Historically chunks were around 12³ voxel cells.

Chunks are useful as EDITING units but should not automatically become rendering draw calls.

The renderer batches surfaces at the BODY/object level where possible.

An important anti-flicker rule:

KEEP THE OLD MESH VISIBLE UNTIL THE REPLACEMENT IS READY.

Then transactionally commit the new geometry.

Never:
delete visible mesh
→ wait for worker
→ create replacement

That caused ugly flicker in the reference implementation we were trying to outperform.

---

# 6. PHYSICS COLLISION REPRESENTATION

Visible voxel geometry may be irregular.

Collision geometry is allowed to be much cheaper.

This is intentional.

Dynamic rubble uses simplified compound box covers with a bounded complexity. Large moving structures were reduced from hundreds of collision boxes to roughly a couple dozen in many cases.

The project has used approximately a 24-box-per-piece collision target for large dynamic fragments.

VERY IMPORTANT RECENT FIX:

Newly separated irregular pieces previously had cheap collision boxes that could overlap neighboring fragments.

Rapier would then depenetrate those pieces violently and a collapsing building could appear to EXPLODE outward.

v0.11.2 fixes this by:

- generating collision boxes contained within surviving fragment material
- giving newly broken faces a tiny inward allowance (~4 mm)
- using zero restitution for newly separated rubble
- removing artificial outward scatter for collision-created fractures

Preserve this behavior.

A building collapsing under gravity should generally FALL INTO ITSELF, CRUSH, and SETTLE.

Becoming separate pieces should NOT grant the pieces free explosion energy.

Explosion forces, rockets, barrel blasts, God Hand throws, etc. may of course launch debris.

---

# 7. LIGHTWEIGHT RUBBLE / SOFT BUDGET PHILOSOPHY

There used to be hard destruction budgets which could reject edits entirely.

This was extremely frustrating.

The player could be yanking a building and receive something equivalent to:

“Physics budget reached.”

That is unacceptable for the God Hand fantasy.

Current philosophy is SOFT DEGRADATION.

When physics becomes expensive:

- simplify collision geometry
- demote old insignificant rubble
- allow low-value pieces to use cheaper motion
- tiny debris can stop colliding with tiny debris
- cosmetic chips can remain cosmetic
- old insignificant objects can become lightweight
- grabbing lightweight rubble may restore full physics if needed

Do NOT simply refuse a player-requested major fracture.

Meaningful structural rubble should generally remain visible.

If something must become less accurate to remain performant, that is fine.

The user explicitly prefers bad/inaccurate collision over slowdown.

---

# 8. GOD HAND — THE MAIN FEATURE

The tool is called:

GOD HAND

Do not call the player-facing tool “Magnet” anymore.

Internally magnet/grab terminology is fine.

The icon was changed from a horseshoe magnet to a hand suspending a block.

CURRENT DEFAULT:

God Hand selected at startup.

Default strength:
6×

Slider maximum:
12×

6× feels good to the user.

Earlier defaults around 3× were explicitly considered too weak.

There is also a “Rubble God” power preset around 10×.

Do NOT accidentally cap the internal controller at 6 while allowing the UI to display 12. Higher slider values must actually affect the grab spring/rip behavior.

God Hand behavior:

- Hold left click to grab.
- It can grab anchored structures.
- Pulling an anchored object builds structural tear intent.
- Weak connections/support bonds fail.
- Once released, the same grab transfers onto the fragment containing the original attachment voxel.
- The player should NOT have to release and catch the falling fragment again.
- Shift = peel a smaller/local section.
- X = throw held material.
- Wheel = grab reach.
- K = optional click-latch mode.
- Releasing RMB camera look must NOT release an active LMB grab.
- Dragging outside canvas/window boundaries must NOT accidentally release.
- Attachment should follow the actual material through repeated fractures.

The structural rip uses a cheap coarse support/bond graph, not FEM.

That is intentional.

It roughly considers:
- connected material
- support area
- material strength
- grip position
- pull direction
- leverage
- ground attachment

It should FEEL plausible, not be engineering software.

---

# 9. GOD HAND “STUCK BUILDING” HISTORY

There was a nasty case where a player at 12× could yank hard on a loose/jammed building and nothing happened.

Cause:

The jam fallback was looking too heavily at instantaneous velocity/progress.

Collision jitter could produce tiny motion spikes that repeatedly reset the stuck timer even though the building was effectively going nowhere.

Pending damage edits could also reset/interrupt the jam logic.

v0.11.1 changed this to evaluate USEFUL MOVEMENT OVER A SHORT WINDOW.

A sustained hard pull against an effectively wedged body should eventually fracture it rather than requiring infinite force.

Important behavior:

- actual meaningful translation/rotation cancels the fallback
- tiny oscillation should not
- pending edits must not permanently swallow the player’s intent
- releasing/changing grip cancels stale rip requests
- breakup retains the exact grab attachment if possible

Keep this.

If a player is pulling hard at 12× and a structure is genuinely stuck, the game should ultimately choose one:

MOVE
RIP
EXPLODE/BREAK

Never:
DO NOTHING FOREVER

---

# 10. CAMERA / AIMING

Default preferred camera is FIRST-PERSON FREE FLY.

The user prefers it over orbit.

WASD = fly
Space / Ctrl (or E/Q in some mappings) = rise/descend
Shift = boost except when needed as God Hand peel modifier

Mouse behavior is important:

WHEN MOUSE IS FREE:
- cursor stays visible
- weapon/tool aim follows cursor position

WHEN RMB IS HELD:
- pointer lock engages
- mouse cursor hides
- aiming switches to center crosshair
- camera rotation has unlimited movement and cannot get stuck at screen edges

WHEN RMB IS RELEASED:
- pointer lock ends
- cursor returns
- aim returns to cursor
- active LMB God Hand grip remains held

L may toggle persistent locked look.

Escape releases pointer lock.

V cycles:
Fly → Third person → Orbit

Orbit is optional/secondary.

Third-person historically had camera jitter.

One cause was interpolation history being overwritten when dispatching physics rather than when physics completed.

Do not reintroduce that.

Fly camera movement should remain render-time smooth and should not wait on physics.

---

# 11. FULLSCREEN STARTUP BUG HISTORY

There was a bug where launching/reloading while already in F11 fullscreen caused startup failure.

The error looked like a targeting self-test failure such as:

object 30 expected
hit object 1

Root cause was NOT fullscreen rendering.

Two authored structures shared/touched a face, and the startup targeting test was load-order dependent when equal-distance hits occurred.

That was fixed by deterministic tied-hit resolution and by testing each object’s own material without allowing an adjacent object to steal the startup probe.

Do not regress this.

---

# 12. IMPACT DESTRUCTION

The most important feel target:

A deliberate high-speed building slam should visibly break ON THAT FIRST IMPORTANT IMPACT.

Not:

slam
→ bounce intact
→ pause
→ second tiny collision
→ suddenly explode

Several older rules caused this:

- newborn-fragment grace windows
- damage cooldowns
- impact target limits
- asynchronous damage/fracture separation
- worker queues
- artificial fragment scatter

v0.11 improved this.

Current philosophy:

High-energy EXTERNAL impacts can bypass ordinary newborn/cooldown protections.

Those protections should still prevent fresh sibling rubble from instantly recursively destroying itself.

Impact processing should distinguish:
- gentle placement
- scraping
- normal collision
- deliberate hard slam
- catastrophic impact

Do not globally make every structure fragile.

We want:

gentle placement → survives
glancing hit → loses a corner / local damage
serious slam → obvious first-contact fracture
catastrophic building impact → major breakup

Impact fracture and visible major structural breakup should be processed as one urgent destruction transaction when practical.

Player-driven obvious destruction gets priority over low-value background analysis.

---

# 13. FRACTURE VISUALS

Early fractures looked too much like perfect rectangular grid cubes.

This was a major aesthetic complaint.

The destruction should reveal that it is voxel-based WITHOUT making every collapse resemble Minecraft chunks cut on perfectly even planes.

Current fracture work includes:

- varied fragment sizes
- stepped/sheared boundaries
- impact-direction influence
- chipped exposed break edges
- deterministic seeded irregularity
- attachment voxel protection

Do NOT simply add random noise everywhere.

Better target:

A collapsed building might produce:
- one big broken corner
- an irregular floor slab
- a long wall strip
- a few medium chunks
- smaller debris

not:
12 equally sized rectangular boxes

Some slab-like pieces are GOOD because buildings contain floors/walls.

The problem is repeated symmetry.

A useful future improvement is FRACTURE ARCHETYPES:

- wall shear
- floor pancake
- column snap
- tower buckle
- concrete corner spall
- beam fracture

These can all use the same underlying voxel system with different partition weighting.

This is a strong future direction.

---

# 14. WEAPONS / CURRENT TOOL ORDER

Current desired order:

1 — Rifle
2 — Shotgun
3 — Rocket
4 — Blast
5 — God Hand
6 — Bomb Rain
7 — Chisel
8 — Props

B also opens/selects props.

God Hand is selected at startup despite being key 5.

Do not casually change 1–5 again; muscle memory has formed.

Rifle:
- automatic
- fast destructive hits
- should feel generous

Shotgun:
- 12-ish pellets
- roughly 5 shots/sec after tuning
- destructive and repeatable

Rocket:
- powered
- NOT ballistic
- around 84 m/s historically
- gravity disabled
- explicit swept impact detection
- explosions should create large holes
- direct hit NOT required to ignite nearby barrels

Blast:
- direct god-powered spherical destruction
- current default has been around 2.8 m
- should cut the FULL radius shown by the preview
- should not secretly become weak against ordinary material unless explicitly designed

Bomb Rain:
- rapid
- approximately 10 charges in recent tuning
- roughly 50 ms spacing
- repeat interval around 0.8 sec
- capped intelligently without silently building giant backlogs

Props:
- spawn crates
- fuel drums
- wrecking cores
- dominoes
- slabs
etc.

---

# 15. EXPLOSIVE BARRELS

Fuel drums should behave generously.

Historical bugs included rockets exploding NEXT TO a barrel and doing nothing unless the barrel was directly hit.

This was fixed.

Splash ignition should look at actual barrel material/proximity rather than relying solely on a stale/general spatial bucket or center-of-mass distance.

Heavy crushing can also ignite/explode barrels.

Chain reactions are desirable.

If an explosive voxel object fractures, its explosive state should transfer to an appropriate surviving fragment rather than disappear or duplicate across every fragment.

---

# 16. DAMAGE QUEUES

Another historical failure:

rapid rockets/rifle fire would work for a while
→ then appear to deal zero damage
→ then a second later a huge amount of queued destruction would suddenly appear

Older code had bounded queues (e.g. ~24 edits per busy object) and expensive connectivity work mixed with immediate visible cuts.

We moved toward:

- weapon surface cuts committing quickly
- structural/connectivity analysis scheduled separately where appropriate
- coalescing overlapping redundant damage
- retaining distinct meaningful damage
- player-requested damage prioritized
- no arbitrary “24 hits then ignore everything”

Be very careful when changing this.

Immediate visual response matters.

The user should not need to stop firing before the building remembers it was shot.

---

# 17. UI / UX PHILOSOPHY

The user strongly dislikes generic “ChatGPT web app template” UI.

Avoid:
- giant cards
- excessive instructional copy
- dashboards always open
- icon-only controls
- huge explanatory panels
- tabs everywhere
- unnecessary buttons
- generic SaaS styling

Current successful direction:

- dark mode default
- compact game HUD
- tool hotbar
- panels CLOSED by default
- map / settings / props / help opened intentionally
- all buttons with icons MUST ALSO HAVE VISIBLE TEXT LABELS
- no icon-only controls that require hover
- Help/About is one straightforward page
- Rebuild is directly accessible
- diagnostics exist but are hidden under settings
- H can hide HUD
- day/night toggle
- branding links to tront.xyz
- credit Trent Sterling / Tront

Text selection was also fixed:

LEFT-CLICK DRAGGING AROUND THE GAME SHOULD NOT RANDOMLY HIGHLIGHT WEBPAGE TEXT.

HUD/game chrome uses user-select:none, except where deliberate copying/editing makes sense.

Preserve that.

---

# 18. BRAND

The retired title was FAULTLINE.

It should NOT appear anymore.

Current title:

BREAKMASS

Use:
BREAKMASS in logos
Breakmass in normal prose if desired.

Creator:
Tront / Trent Sterling

Main link:
https://tront.xyz

Portfolio:
https://trentsterling.com

Potential tagline:
“The city is ammunition.”

There was an intentional migration pass that removed old Faultline refs from:
- visible branding
- source labels
- workers
- saved preference keys
- exports
- filenames where practical
- credits

Do not reintroduce the old name.

---

# 19. WORLD / CURRENT ART DIRECTION

Current full map is a finite industrial demolition district, roughly around 112 × 104 metres.

Major zones:

01 — Breach Yard
02 — Concrete Heights
03 — The Foundry
04 — Physics Park

There are also smaller scene presets such as Foundry-only and Physics-Park-only for focused/performance-friendly play.

The world has:
- roads
- industrial buildings
- multi-storey voxel buildings
- chimneys
- silos
- tanks
- warehouses
- loading structures
- bridge/span structures
- containers
- barriers
- dominoes / physics props
- fuel drums
- cranes/gantries
- water towers
- destructible decorative structure

Visual palette has evolved into something like:

dark navy / blue-gray world
teal industrial surfaces
brick/orange-red
cream concrete
yellow accents
white structural pieces

Night/dark appearance is strong.

Do NOT turn it back into a sterile white test range.

Important model upgrades already added:
- more detailed water tower
- collars / shoulder / hatch / ladder / support shoes
- loading warehouse shutter/jamb/vent/window details
- more detailed cargo containers
- destructible details rather than fake decorative shells

The art should remain stylized, readable, low-poly/voxel, and gamey.

The missing reference video apparently helped improve visual quality earlier, but you do NOT have it.

Use the CURRENT BUILD as the visual baseline.

Do not “modern web template” the game presentation.

---

# 20. PLAYER EXPERIENCE / WHAT MAKES THIS FUN

The best moments are things like:

grab roof of building
→ yank until supports tear
→ swing entire upper structure
→ slam it into another building
→ both structures partially collapse
→ grab surviving chunk
→ throw it into fuel drums
→ chain reaction

That is the game.

The user has had real fun testing the recent build.

Do not lose that by overengineering.

The game has crossed from “interesting destruction tech” toward “something worth playing.”

We should now focus more on CONSISTENCY and GAMEPLAY PAYOFF than foundational engine rewrites.

---

# 21. THINGS NOT TO DO NEXT UNLESS REQUIRED

Avoid spending the next major iteration on:

- another physics-engine rewrite
- another huge world expansion
- 10 more conventional firearms
- giant UI redesign
- campaign architecture
- multiplayer
- full fluids everywhere
- expensive FEM stress
- exact rubble collision
- prettier debug telemetry

The foundation finally runs well.

Protect it.

---

# 22. HIGH-VALUE FUTURE DIRECTIONS

These are concepts we brainstormed, not promises or requirements.

Strongest near-term directions:

A. GOD HAND TWIST

Grab the top of a structure and twist/corkscrew it.

This could load torsional/shear stress into supports and tear pieces off.

This would reinforce the signature mechanic more than another gun.

B. GOD HAND CRUSH

Some input such as middle mouse / alternate action could compress or crush material around the grip.

Again: use approximations.

C. FRACTURE ARCHETYPES

Choose different breakup weighting based on geometry/material:
- wall shear
- slab pancake
- tower buckle
- beam snap
- corner spall

D. SIMPLE SCORE / DAMAGE STATS

Not RPG numbers.

Fun feedback such as:
- PROPERTY DAMAGE $2.4M
- CHAIN ×7
- BIGGEST IMPACT
- STRUCTURE COLLAPSE
- TOTAL MASS MOVED

This could add replayability without compromising the sandbox.

E. OPTIONAL DEMOLITION CHALLENGES

Examples:
- destroy tower using only God Hand
- cause $1M damage with one thrown structure
- chain three buildings
- collapse bridge without explosives
- throw water tank through warehouse

Short restartable objectives.
No narrative overhead required.

F. RUBBLE GOD MODE

A deliberately absurd variant:
- huge God Hand strength
- forgiving structural failure
- generous explosions
- heavy bomb rain
- relaxed concern about physical realism

G. EVENTUAL NOITA-LIKE MATERIAL SYSTEM

Do NOT simulate every material everywhere initially.

Start localized/active only:
- fuel
- water
- fire

Then perhaps sand/powder.

Rigid coherent structures should remain rigid bodies.
Active granular/fluid/heat cells should be a separate simulation coupled only where needed.

---

# 23. DEVELOPMENT / QA EXPECTATIONS

This project has had regressions because changes were sometimes “proved” with isolated mocks but never exercised in the actual game.

The user is DONE being the only QA person.

You must test proactively.

Before shipping a revision:

1. Run syntax/regression tests.
2. Run actual voxel worker tests.
3. Run browser input tests.
4. Test tool acquisition.
5. Test Rifle.
6. Test Shotgun.
7. Test Rocket splash.
8. Test Blast.
9. Test God Hand anchored yank.
10. Test God Hand loose grab.
11. Test grip through fracture.
12. Test RMB pointer lock while holding LMB grab.
13. Test hard building slam.
14. Test many simultaneous impacts.
15. Test chain-reaction barrels.
16. Test destruction under high rubble counts.
17. Test reset/rebuild.
18. Test startup in ordinary and fullscreen states if possible.
19. Measure performance rather than guessing.

If full Three.js + Rapier runtime cannot actually be started in your environment, SAY SO.

Do not call:
- kernel tests
- mocks
- UI screenshots
- isolated physics fixtures

a “complete gameplay playtest.”

They are useful, but label them accurately.

The user values MEASURED RECEIPTS.

Useful measurements:
- p50/p95/p99 frame time
- worst long frame
- physics worker solve time
- physics round trip
- voxel worker edit latency
- commit latency
- contact counts
- collider counts
- awake bodies
- queued edits
- damage request → visible break latency

Do NOT claim FPS gains based solely on fewer colliders or faster kernel work.

---

# 24. CLEAN-ROOM RULE

This started as a clean-room Teardown-like destruction project.

Do not copy ShatterVox/Teardown implementation code or assets.

Behavioral inspiration is fine.

Implement systems independently.

Current procedural scene/models/destruction architecture are original.

---

# 25. TECH STACK / RUNTIME NOTES

Current builds have generally used:

Three.js 0.180.x
Rapier 3D compat 0.17.x

External runtime dependencies are loaded from pinned CDNs with fallbacks.

The game remains a SINGLE HTML deliverable for convenient hosting.

Worker code is embedded and spawned as Blob/classic workers.

Classic workers were chosen because module-worker startup had trouble under opaque/file origins.

GitHub Pages / tront.xyz hosting is a normal target.

Local file:// behavior can differ between browsers.

Do not assume a worker requires hosting, but do test opaque-origin/local-file behavior when touching bootstrap code.

---

# 26. USER WORKING STYLE

When given an obvious improvement request:

DO THE WORK.

Do not make Trent choose between five microscopic implementation options.

Use engineering judgment.

He likes concise explanations and measurable evidence.

He is happy with aggressive iteration, but regression tolerance is now LOW because several earlier revisions broke working features.

Protect known-good systems.

If touching:
- targeting
- God Hand
- physics worker
- damage queue
- collision proxies
- camera interpolation

add focused regression coverage.

---

# 27. CURRENT BASELINE FEEL

As of v0.11.2:

- performance feels good
- worker physics was a huge success
- destruction is fun
- God Hand is fun
- 6× God Hand is a good default
- 12× feels appropriately powerful
- irregular fracture visuals are much improved
- barrel interactions are much better
- rockets feel good
- recent heavy-landing fix improved collapsing rubble
- the user is actively having fun testing it

Do not assume the project is broken and start over.

It is CLOSE.

The next stage should make the good interactions happen more consistently and make the sandbox more replayable.

---

# FINAL PRODUCT COMPASS

When unsure what to build or preserve, ask:

“Does this make it easier, faster, or more satisfying to grab a huge piece of the world and use it to destroy another huge piece of the world?”

If yes, it probably belongs in BREAKMASS.

If it makes the physics more academically correct while making that fantasy worse, it probably does not.

Protect performance.
Protect responsiveness.
Cheat freely.
Make structures CRUNCH.
Make the God Hand absurd.
Keep the interface out of the way.