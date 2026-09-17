# Lane archetypes: widen the pancake/shear/buckle partition-fraction target
# ranges in fractureLabels()'s profile table. Verified on the real district
# (tools/archetype-district.mjs): hollow towers already auto-select buckle,
# thin walls already auto-select shear (kernel-check), and the flat viaduct
# already auto-selects pancake -- the SELECTION thresholds were fine. What
# read wrong was the SIZE distribution: buckle/shear/pancake used a narrow
# target band close to 50/50 (e.g. buckle's [.22,.55]), so repeated halving
# on a hollow shell converged toward many similarly-sized sections (Northstar
# buckle: 5227,3833,3744,3699,3227,3070,... -- a flat ramp, not "a few big,
# some medium, small debris"). shatter's much wider [.22,.72] band already
# produced the desired variety (Copper House shatter: 6854,2397,1839,1605...).
# Widening the three narrow bands toward shatter's without changing axisBias
# (which is what gives buckle its horizontal-banding look and shear its
# vertical-stack look) keeps the stacked/sheared silhouette but lets pieces
# vary. archetype SELECTION logic is untouched.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

rep("""      pancake:{axisBias:[.7,2.4,.7],slabChance:.6,target:[.25,.5],shearScale:.35,amplitudeScale:.6},
      shear:{axisBias:[thinAxis===0?0:1.7,1,thinAxis===2?0:1.7],slabChance:.1,target:[.2,.5],shearScale:1.7,amplitudeScale:1.3},
      buckle:{axisBias:[.55,2.2,.55],slabChance:.4,target:[.22,.55],shearScale:1.25,amplitudeScale:1},""",
    """      pancake:{axisBias:[.7,2.4,.7],slabChance:.6,target:[.16,.6],shearScale:.35,amplitudeScale:.6},
      shear:{axisBias:[thinAxis===0?0:1.7,1,thinAxis===2?0:1.7],slabChance:.1,target:[.15,.62],shearScale:1.7,amplitudeScale:1.3},
      buckle:{axisBias:[.55,2.2,.55],slabChance:.4,target:[.15,.64],shearScale:1.25,amplitudeScale:1},""")
assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
