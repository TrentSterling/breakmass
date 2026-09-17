// The pre-push gate. Runs every check in order and stops at the first failure.
//   node tools/gate.mjs            (local index.html)
//   node tools/gate.mjs <url>      (a hosted build)
// kernel-check : voxel kernel in Node (archetypes, mass, cut direction)
// look-check   : mouse look in three browsers (normal lock, lock never answers, lock dropped on click)
// verify --qa  : the in-page gameplay suite in headless Chrome
import {spawnSync} from 'node:child_process';
const target = process.argv[2];
const steps = [
  ['kernel-check', ['tools/kernel-check.mjs']],
  ['look-check', ['tools/look-check.mjs', ...(target && !/^https?:/.test(target) ? [target] : [])]],
  ['verify --qa', ['tools/verify.mjs', ...(target ? [target] : []), '--qa']],
];
const t0 = Date.now();
for (const [name, args] of steps) {
  console.log(`\n=== ${name}`);
  const base = Number(process.env.GATE_PORT || 9600); // set GATE_PORT per parallel checkout so headless Chromes never collide
  const r = spawnSync(process.execPath, args, {stdio: 'inherit', env: {...process.env, PORT: String(base + steps.findIndex(s => s[0] === name) * 10)}});
  if (r.status !== 0) { console.log(`\nGATE FAILED at ${name} after ${((Date.now() - t0) / 1000).toFixed(0)} s`); process.exit(1); }
}
console.log(`\nGATE OK in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
