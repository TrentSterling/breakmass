// Headless capture for the juice lane's stress pulse (0.13.0). Follows the
// tools/verify.mjs pattern: boot the real page, call F.cutTower(), catch the
// collapse/failure commit, then screenshot. node tools/verify-juice.mjs [file.html]
import {launch, sleep, until} from './cdp.mjs';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const file = process.argv[2] || 'index.html';
const out = resolve('tools/out'); mkdirSync(out, {recursive: true});
const page = await launch({port: Number(process.env.PORT || 9705), width: 1280, height: 800});
try {
  await page.goto(pathToFileURL(resolve(file)).href);
  await until(() => page.eval('!!window.BREAKMASS && !!document.getElementById("loading") && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  await sleep(1500);
  // Orbit onto the water tower (id 2, world origin ~[-24,0,15]) so the pulse
  // fills the shot instead of the default wide district view.
  await page.eval('BREAKMASS.orbitForTest(.55,.1);BREAKMASS.aimAt([-21.5,6,17],11)');
  await sleep(700);
  const before = await page.eval('({stressFailures:BREAKMASS.stats.stressFailures||0,fractures:BREAKMASS.stats.fractures||0})');
  console.log('before', JSON.stringify(before));
  await page.eval('BREAKMASS.cutTower()');
  // cutTower() slices straight through every leg at once: the severed top can
  // either fall away immediately (STRUCTURE RELEASED, first commit) or leave a
  // weakened single support that overloads on a delayed settle -> stress edit
  // cascade (SUPPORT FAILURE, several hundred ms later). Poll the toast text,
  // then pause the sim the instant it changes: the 160 ms pulse is timed off
  // real dt, and a CDP round trip alone can eat most of that window, so
  // freezing sim time (effects(0) on the next frame) is what actually gets a
  // screenshot of it live instead of an empty one after the fact.
  const t0 = Date.now();
  await until(() => page.eval(`(()=>{const t=document.getElementById('toast').textContent;if(/RELEASED|FAILURE/.test(t)){BREAKMASS.pause(true);return true;}return false;})()`), {timeout: 15000, every: 10, label: 'collapse/failure commit'});
  const triggeredAfterMs = Date.now() - t0;
  await page.shot(`${out}/juice-pulse-live.png`);
  const live = await page.eval('({stressFailures:BREAKMASS.stats.stressFailures,fractures:BREAKMASS.stats.fractures,toast:document.getElementById("toast").textContent})');
  console.log('collapse/failure committed after', triggeredAfterMs, 'ms; stats', JSON.stringify(live));
  await page.eval('BREAKMASS.pause(false)');
  await sleep(400);
  await page.shot(`${out}/juice-pulse-faded.png`);
  const errors = page.logs.filter(l => /EXCEPTION/.test(l));
  console.log('exceptions', errors.length, errors.slice(0, 5).join(' | '));
} finally {
  console.log('--- console (' + page.logs.length + ')');
  for (const l of page.logs.slice(0, 60)) console.log(' ', l.slice(0, 300));
  page.kill();
}
