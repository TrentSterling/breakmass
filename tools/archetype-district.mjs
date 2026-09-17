// Forces a whole-body fracture on real district buildings (not synthetic solid
// blocks) and records which archetype the kernel picked, the fragment count and
// size distribution, plus one screenshot per building for a human look.
//   node tools/archetype-district.mjs [file.html] [--shots]
import {launch, sleep, until} from './cdp.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2);
const arg = args.find(a => !a.startsWith('--')) || 'index.html';
const takeShots = args.includes('--shots') || true; // screenshots are the point of this harness
const target = /^https?:/.test(arg) ? arg : pathToFileURL(resolve(arg)).href;
const out = resolve('tools/out'); mkdirSync(out, {recursive: true});
const page = await launch({port: Number(process.env.PORT || 9725), width: 1280, height: 800});

// One target per real structure named in the lane brief. Regexes match the
// authored entity names in makeDistrict(); see index.html around line 1060.
const buildings = [
  {label: 'northstar', pattern: '^Northstar / five', seed: 42011},
  {label: 'switchboard', pattern: '^Switchboard / four', seed: 42012},
  {label: 'copperhouse', pattern: '^Copper House / three', seed: 42013},
  {label: 'watertower', pattern: '^02 / Water tower$', seed: 42014},
  {label: 'bridge', pattern: '^03 / The viaduct$', seed: 42015},
  {label: 'warehouse', pattern: '^06 / Loading warehouse$', seed: 42016},
];

async function quiet(timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const idle = await page.eval('(()=>{const q=BREAKMASS.liveQueue;return !q.commits&&!q.voxelPending&&!q.objects.some(e=>e.pending||e.queued||e.needsConnectivity);})()');
    if (idle) return true;
    await sleep(200);
  }
  return false;
}

const results = [];
try {
  console.log('goto', target);
  await page.goto(target);
  await until(() => page.eval('!!window.BREAKMASS && !!document.getElementById("loading") && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  console.log('boot ok', JSON.stringify(await page.eval('({v:BREAKMASS.version,boot:BREAKMASS_BOOT.stage})')));
  await page.eval("BREAKMASS.stopForInterface();BREAKMASS.pause(false)");
  await sleep(1500);

  for (const b of buildings) {
    const info = await page.eval(`(()=>{
      const re=new RegExp(${JSON.stringify(b.pattern)},'i');
      const e=BREAKMASS.inspect().find(x=>re.test(x.name)&&x.anchored);
      if(!e)return null;
      return {id:e.id,dims:e.dims,name:e.name,position:[e.position.x,e.position.y,e.position.z]};
    })()`);
    if (!info) { console.log(b.label, 'NOT FOUND'); results.push({label: b.label, pattern: b.pattern, error: 'not found'}); continue; }
    console.log('  info', JSON.stringify(info));

    const [dx, dy, dz] = info.dims, S = 0.25;
    const centerWorld = [info.position[0] + dx * S * 0.5, info.position[1] + dy * S * 0.5, info.position[2] + dz * S * 0.5];
    const probe = await page.eval(`BREAKMASS.materialProbe(${info.id})`);
    const aimPoint = probe && Array.isArray(probe.point) ? probe.point : centerWorld;
    const dist = Math.max(dx, dy, dz) * S * 1.5 + 10;
    await page.eval(`BREAKMASS.aimAt([${aimPoint.join(',')}],${dist})`);
    await page.eval(`BREAKMASS.orbitForTest(0.7,0.45)`);
    await sleep(250);

    const radius = Math.hypot(dx, dy, dz) / 2 + 2;
    const cutCenter = [dx / 2, dy / 2, dz / 2];
    const accepted = await page.eval(`BREAKMASS.edit(${info.id},{type:'fracture',center:[${cutCenter.join(',')}],radius:${radius},pieces:12,seed:${b.seed}})`);
    // lastFracture is a single global slot; a neighbouring building's rubble
    // impact-fracturing at the same time can overwrite it before we read it.
    // Poll tightly right after firing and take the FIRST record whose id is
    // ours, before any chain-reaction impact on a neighbour can land.
    let archInfo = null;
    for (let i = 0; i < 100 && !archInfo; i++) {
      const lf = await page.eval('BREAKMASS.lastFracture');
      if (lf && lf.id === info.id) archInfo = lf;
      else await sleep(100);
    }
    const drained = await quiet();
    await sleep(1200); // let rubble fall into frame before the shot

    let shotPath = null;
    if (takeShots) { shotPath = `${out}/archetype-${b.label}.png`; await page.shot(shotPath); }

    const summary = await page.eval(`(()=>{
      const frags=BREAKMASS.inspect().filter(e=>e.rootId===${info.id});
      const sizes=frags.map(e=>e.count).sort((a,b)=>b-a);
      return {fragments:frags.length,sizes,totalCount:sizes.reduce((a,b)=>a+b,0)};
    })()`);
    const row = {label: b.label, name: info.name, dims: info.dims, accepted, drained, archetype: archInfo && archInfo.archetype, regions: archInfo && archInfo.regions, via: archInfo && archInfo.via, ...summary, screenshot: shotPath};
    results.push(row);
    console.log(b.label.padEnd(12), JSON.stringify({archetype: row.archetype, fragments: row.fragments, sizes: row.sizes.slice(0, 8)}));
  }
  writeFileSync(`${out}/archetype-district.json`, JSON.stringify(results, null, 2));
  console.log('\nwrote', `${out}/archetype-district.json`);
} finally {
  console.log('--- console (' + page.logs.length + ')');
  for (const l of page.logs.slice(0, 40)) console.log(' ', l.slice(0, 300));
  page.kill();
}
