// Runs the voxel kernel (the in-page worker source) directly in Node, no browser.
// node tools/kernel-check.mjs [file.html]
// Checks: whole-body fracture preserves mass; every archetype auto-selects from
// shape, partitions, and preserves mass; forced archetypes are honoured.
import {readFileSync} from 'node:fs';
const file = process.argv[2] || 'index.html';
const html = readFileSync(file, 'utf8');
const src = html.split('<script id="voxel-worker-source" type="text/plain">')[1].split('</script>')[0];
const k = new Function(src + '\nreturn voxelKernel();')();
const q = m => k.handle(m);
let failures = 0, id = 9000;
const check = (ok, msg) => { if (!ok) { failures++; console.log('  FAIL', msg); } };

function fracture(id, dims, op, fill = 2) {
  q({type: 'init', volume: {id, dims, data: new Uint8Array(dims[0] * dims[1] * dims[2]).fill(fill), anchored: false, kind: 'structure'}});
  const r = q({type: 'edit', id, op: {type: 'fracture', chips: 0, roughness: 0, ...op}});
  const total = dims[0] * dims[1] * dims[2];
  const sum = r.fragments.reduce((n, f) => n + f.count, 0) + r.count;
  const sizes = r.fragments.map(f => f.count).sort((a, b) => b - a);
  const extents = r.fragments.filter(f => f.kind === 'structure').map(f => f.dims);
  return {id, dims, archetype: r.fracture?.archetype, regions: r.fracture?.regions, requested: r.fracture?.requested, count: r.count, fragments: r.fragments.length, structures: r.fragments.filter(f => f.kind === 'structure').length, removed: r.removed, total, sum, sizes: sizes.slice(0, 6), extents: extents.slice(0, 5)};
}

// Real buildings are hollow shells with floors, not solid fill (see
// tools/archetype-district.mjs, which drives this same fracture path against
// the actual district). These two cases catch a regression that only shows
// up once the bounding box is mostly air: archetype selection reads ex/ey/ez
// from the shape's extents, which a hollow shell still has, but a bug that
// keyed off solid-cell FRACTION instead of extent would misfire here first.
function box(data, dims, x0, y0, z0, x1, y1, z1, m) {
  const [nx, ny] = dims;
  for (let z = Math.max(0, z0); z < Math.min(dims[2], z1); z++)
    for (let y = Math.max(0, y0); y < Math.min(ny, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(nx, x1); x++) data[x + nx * (y + ny * z)] = m;
}
function hollowTower(dims, floors, wall = 1) {
  const [nx, ny, nz] = dims, data = new Uint8Array(nx * ny * nz), floorH = Math.floor((ny - 3) / floors);
  box(data, dims, 0, 0, 0, nx, 2, nz, 2); // footing slab
  for (const x of [0, nx - wall]) for (const z of [0, nz - wall]) box(data, dims, x, 0, z, x + wall, ny, z + wall, 2); // corner columns, full height
  for (let f = 0; f < floors; f++) {
    const y = 2 + f * floorH;
    box(data, dims, 0, y, 0, nx, y + 1, nz, 2); // floor plate
    for (const z of [0, nz - wall]) box(data, dims, 0, y + 1, z, nx, y + floorH - 1, z + wall, wall); // exterior walls, window band left open
    for (const x of [0, nx - wall]) box(data, dims, x, y + 1, 0, x + wall, y + floorH - 1, nz, wall);
  }
  box(data, dims, 0, ny - 2, 0, nx, ny, nz, 2); // roof cap
  return data;
}
function hollowWarehouse(dims, wall = 1) {
  const [nx, ny, nz] = dims, data = new Uint8Array(nx * ny * nz);
  box(data, dims, 0, 0, 0, nx, 1, nz, 2); // floor slab
  for (const z of [0, nz - wall]) box(data, dims, 0, 1, z, nx, ny - 1, z + wall, wall);
  for (const x of [0, nx - wall]) box(data, dims, x, 1, 0, x + wall, ny - 1, nz, wall);
  box(data, dims, 0, ny - 1, 0, nx, ny, nz, 2); // roof, interior stays hollow
  return data;
}
function fractureData(id, dims, data, op) {
  q({type: 'init', volume: {id, dims, data, anchored: false, kind: 'structure'}});
  const r = q({type: 'edit', id, op: {type: 'fracture', chips: 0, roughness: 0, ...op}});
  const total = data.reduce((n, m) => n + (m ? 1 : 0), 0);
  const sum = r.fragments.reduce((n, f) => n + f.count, 0) + r.count;
  const sizes = r.fragments.map(f => f.count).sort((a, b) => b - a);
  return {id, dims, archetype: r.fracture?.archetype, regions: r.fracture?.regions, count: r.count, fragments: r.fragments.length, removed: r.removed, total, sum, sizes: sizes.slice(0, 6)};
}
{
  const dims = [14, 90, 14], data = hollowTower(dims, 5, 1);
  const r = fractureData(++id, dims, data, {center: [7, 45, 7], radius: 60, pieces: 12, seed: 41});
  console.log('hollow 5-floor tower'.padEnd(28), JSON.stringify({archetype: r.archetype, fragments: r.fragments, remaining: r.count, sizes: r.sizes, occupied: r.total}));
  check(r.sum === r.total && r.removed === 0, `hollow tower: mass ${r.sum} != ${r.total} (removed ${r.removed})`);
  check(r.archetype === 'buckle', `hollow tower: archetype ${r.archetype} != buckle`);
  check(r.fragments >= 2, 'hollow tower: no partition');
}
{
  const dims = [24, 20, 24], data = hollowWarehouse(dims, 1);
  const r = fractureData(++id, dims, data, {center: [12, 10, 12], radius: 40, pieces: 10, seed: 43});
  console.log('hollow warehouse'.padEnd(28), JSON.stringify({archetype: r.archetype, fragments: r.fragments, remaining: r.count, sizes: r.sizes, occupied: r.total}));
  check(r.sum === r.total && r.removed === 0, `hollow warehouse: mass ${r.sum} != ${r.total} (removed ${r.removed})`);
  check(r.archetype === 'shatter', `hollow warehouse: archetype ${r.archetype} != shatter`);
  check(r.fragments >= 2, 'hollow warehouse: no partition');
}

const cases = [
  ['legacy block (self-test shape)', [24, 32, 20], {center: [12, 16, 10], radius: 30, pieces: 16, seed: 77}, null],
  ['floor slab', [24, 3, 20], {center: [12, 1, 10], radius: 40, pieces: 8, seed: 5}, 'pancake'],
  ['thin wall', [24, 14, 2], {center: [12, 7, 1], radius: 40, pieces: 8, seed: 9}, 'shear'],
  ['tower', [6, 30, 6], {center: [3, 15, 3], radius: 40, pieces: 8, seed: 3}, 'buckle'],
  ['beam', [30, 3, 3], {center: [15, 1, 1], radius: 40, pieces: 6, seed: 11}, 'snap'],
  ['cube', [12, 12, 12], {center: [6, 6, 6], radius: 40, pieces: 8, seed: 21}, 'shatter'],
  ['corner hit on big block', [24, 24, 24], {center: [2, 22, 2], radius: 6, pieces: 6, seed: 31}, 'spall'],
  ['forced snap on cube', [12, 12, 12], {center: [6, 6, 6], radius: 40, pieces: 4, seed: 21, archetype: 'snap'}, 'snap'],
];
for (const [name, dims, op, expect] of cases) {
  const r = fracture(++id, dims, op);
  console.log(name.padEnd(28), JSON.stringify({archetype: r.archetype, structures: r.structures, fragments: r.fragments, remaining: r.count, sizes: r.sizes}));
  check(r.sum === r.total && r.removed === 0, `${name}: mass ${r.sum} != ${r.total} (removed ${r.removed})`);
  if (expect) check(r.archetype === expect, `${name}: archetype ${r.archetype} != ${expect}`);
  check(r.fragments >= 2, `${name}: no partition`);
  if (name === 'legacy block') check(r.structures === 16, `${name}: ${r.structures} structural shards, expected 16`);
  if (expect === 'snap') {
    // Beam sections should be cut across the long axis: every piece keeps the full short dims.
    const bad = r.extents.filter(d => d[1] < dims[1] || d[2] < dims[2]);
    check(bad.length === 0, `${name}: ${bad.length} pieces cut along the beam instead of across it ${JSON.stringify(bad)}`);
  }
  if (expect === 'pancake') {
    const thin = r.extents.filter(d => d[1] === dims[1]);
    check(thin.length >= r.extents.length * .6, `${name}: only ${thin.length}/${r.extents.length} pieces keep full slab thickness`);
  }
  if (expect === 'spall') check(r.sizes[0] > r.total * .8, `${name}: biggest survivor ${r.sizes[0]} too small (${r.total})`);
}
console.log(failures ? `${failures} FAILURE(S)` : 'kernel-check OK');
process.exit(failures ? 1 : 0);
