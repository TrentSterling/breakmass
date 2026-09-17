// Headless verification for the score lane: blasts the tank, a building and
// the drum cluster, then prints the new WRECKAGE / CHAIN / BIGGEST IMPACT /
// MASS MOVED / COLLAPSES values plus the two new contract checkmarks. Not a
// playtest; measures window.BREAKMASS.scoreDiagnostics + the #contract DOM.
// node tools/score-check.mjs [file.html]
import {launch, sleep, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const file = process.argv[2] || 'index.html';
const page = await launch({port: Number(process.env.PORT || 9715), width: 1100, height: 700});
try {
  await page.goto(pathToFileURL(resolve(file)).href);
  await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  await sleep(600);

  const before = await page.eval('JSON.stringify(BREAKMASS.scoreDiagnostics)');
  const hudBefore = await page.eval(`JSON.stringify({
    wreckage: document.getElementById('score-wreckage').textContent,
    chain: document.getElementById('score-chain').textContent,
    impact: document.getElementById('score-impact').textContent,
    mass: document.getElementById('score-mass').textContent,
    collapses: document.getElementById('score-collapses').textContent,
    hands: document.getElementById('goal-hands').className,
    chain3: document.getElementById('goal-chain3').className,
  })`);

  // Cut the tank's legs: releases a structural fixture from an anchored root
  // (mass moved + wreckage from mass) and should eventually topple it (missionTower).
  await page.eval('BREAKMASS.cutTower()');
  await until(() => page.eval('BREAKMASS.inspect().some(e=>e.rootId===2&&!e.anchored&&e.count>100)'), {timeout: 8000, label: 'tank leg release'});
  await sleep(200);
  // Same technique tools/verify.mjs's hard-slam QA uses: set a known detached
  // piece's velocity directly for a guaranteed, fast, controlled ground slam.
  // This is the impactDamage.profile collision-energy path (distinct from the
  // blast/stress paths above), so it needs a real high-speed contact.
  const part = await page.eval('JSON.stringify(BREAKMASS.inspect().filter(e=>e.rootId===2&&!e.anchored).sort((a,b)=>b.count-a.count)[0])').then(JSON.parse);
  await page.eval(`BREAKMASS.setBodyMotion(${part.id},[${part.position.x},.3,${part.position.z}],[0,-24,0])`);
  await sleep(1500);

  // Rifle-scale voxel removal on a building for the dust-sampled wreckage path.
  await page.eval('BREAKMASS.blast(28,4,23,2.6)');
  await sleep(400);
  await page.eval('BREAKMASS.blast(28,7,20,2.6)');
  await sleep(400);

  // Drop a rocket near the drum cluster (Foundry, ~x -19 / z -18) to try to
  // splash-ignite several barrels at once for a chain.
  await page.eval('BREAKMASS.aimAt([-19,1,-18],14)');
  await sleep(200);
  await page.eval('BREAKMASS.blast(-19,0.5,-18,3.4)');
  await sleep(2000);
  // If that alone was not enough for a 3-chain, walk along the row.
  for (const x of [-22, -20, -18, -16]) {
    const chain = await page.eval('BREAKMASS.scoreDiagnostics.bestChain');
    if (chain >= 3) break;
    await page.eval(`BREAKMASS.blast(${x},0.5,-18,2.8)`);
    await sleep(900);
  }
  await sleep(1500);

  const after = await page.eval('JSON.stringify(BREAKMASS.scoreDiagnostics)');
  const hudAfter = await page.eval(`JSON.stringify({
    wreckage: document.getElementById('score-wreckage').textContent,
    chain: document.getElementById('score-chain').textContent,
    impact: document.getElementById('score-impact').textContent,
    impactTitle: document.getElementById('score-impact').title,
    mass: document.getElementById('score-mass').textContent,
    collapses: document.getElementById('score-collapses').textContent,
    hands: document.getElementById('goal-hands').className,
    chain3: document.getElementById('goal-chain3').className,
    tower: document.getElementById('goal-tower').className,
  })`);
  const removed = await page.eval('BREAKMASS.stats.removed');

  console.log(file, 'BEFORE', before, hudBefore);
  console.log(file, 'AFTER ', after, hudAfter);
  console.log('totalRemoved (voxels):', removed);
} finally {
  for (const l of page.logs.filter(l => /EXCEPTION|error/i.test(l))) console.log(' ', l.slice(0, 400));
  page.kill();
}
