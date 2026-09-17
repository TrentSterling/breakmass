import io, re
p = 'ROADMAP.md'; s = io.open(p, encoding='utf-8').read()
def rep(old, new):
    global s
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new)
rep("Status as of v0.11.3 (2026-09-17).", "Status as of v0.12.0 (2026-09-17).")
rep("| 0.11.3 | Contract HUD shown, self-test assertion fixed, em dashes out of UI strings, OG meta, repo tooling | First public hosting at tront.xyz/breakmass |",
    "| 0.11.3 | Contract HUD shown, self-test assertion fixed, em dashes out of UI strings, OG meta, repo tooling | First public hosting at tront.xyz/breakmass |\n"
    "| 0.12.0 | Fracture archetypes (pancake, shear, buckle, snap, spall, shatter), God Hand twist (Q/E, Alt+mouse) and crush (middle mouse) | Priority items 2 and 3: kill the procedural-cube look, make the hand the signature |")
rep("- God Hand: grab anchored or loose material, support-graph rips, grip follows the fragment through fractures, Shift peel, X throw, wheel reach, K click-latch, jam fallback that fractures a wedged body after a sustained pull.",
    "- God Hand: grab anchored or loose material, support-graph rips, grip follows the fragment through fractures, Shift peel, X throw, wheel reach, K click-latch, jam fallback that fractures a wedged body after a sustained pull. Since 0.12.0: Q/E or Alt+mouse twist (torsion shear rip on anchored structures, spin on loose bodies) and middle-mouse crush (spall fracture around the grip, pieces implode toward the hand).\n"
    "- Fracture archetypes (0.12.0): the kernel picks pancake, shear, buckle, snap, spall or shatter partitions from the shape of the material being broken.")
s, n = re.subn(r"^- Fracture partitions shed one-to-four voxel crumbs.*$",
    "- Seam crumbs (one-to-four voxel chips along partition seams) still appear with every archetype. Absorb them into the neighbouring shard in the kernel.\n"
    "- Archetype weights are first-pass numbers tuned in Node on solid blocks. Real buildings are hollow shells with floors; watch how `shear` and `buckle` read on the district towers and retune from screenshots.\n"
    "- Twist on loose bodies is a pure angular-velocity drive. It should also load torsion into the neighbours of a held anchored piece (twisting a beam should stress the wall it sits in).",
    s, flags=re.M)
assert n == 1
rep("**Next up:** God Hand twist and crush plus fracture archetypes (items 3 and 2). Then the score layer (4), which turns the existing sandbox into a game without months of content.",
    "**Done in 0.12.0:** God Hand twist and crush plus fracture archetypes (items 3 and 2), first pass. **Next up:** tune the archetypes on the real district, then the score layer (4), which turns the existing sandbox into a game without months of content.")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

p = 'CLAUDE.md'; s = io.open(p, encoding='utf-8').read()
rep("`runSelfTests()`, `pullDiagnostics`, `impactDiagnostics`.", "`runSelfTests()`, `pullDiagnostics`, `impactDiagnostics`, `setTwist(rate)`, `crush()`, `twistState`, `lastFracture`.")
rep("2. `node tools/kernel-check.mjs` for kernel-only changes.", "2. `node tools/kernel-check.mjs` for kernel changes (archetype selection, mass conservation, cut direction).")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('docs updated')
