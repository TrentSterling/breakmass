// Rubble God preset regression check. Boots the real page headless, reads the
// live tuning object BEFORE touching anything (must be byte-identical to today's
// Sandbox numbers), applies the rubble-god preset through the public
// BREAKMASS.applyPreset bridge, prints the resulting live config, fires one real
// bomb-rain volley at an actual structure and counts the charges that land in the
// queue (not just the config number), then confirms the preset survives Rebuild
// district and that switching back to Sandbox restores the original config exactly.
// node tools/rubblegod-check.mjs [file.html]
import {launch, sleep, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const file = process.argv[2] || 'index.html';
const port = Number(process.env.PORT || 9755);
let failures = 0;
const check = (ok, msg) => {
  if (ok) console.log('ok   - ' + msg);
  else { failures++; console.log('FAIL - ' + msg); }
};

const page = await launch({port, width: 1000, height: 640});
try {
  await page.goto(pathToFileURL(resolve(file)).href);
  await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  await sleep(400);

  const sandboxBefore = await page.eval('BREAKMASS.tuning');
  console.log('\nSandbox (boot) tuning:', JSON.stringify(sandboxBefore));
  check(sandboxBefore.preset === 'sandbox', 'boots into the sandbox preset');
  const sb = sandboxBefore.config;
  check(sb.blastRadius === 2.8 && sb.blastPower === 1.5 && sb.pullStrength === 6 && sb.impactScale === 1.6,
    'sandbox pull/impact/radius/power are byte-identical to today (6x / 1.6x / 2.8m / 1.5x)');
  check(sb.shotgunPellets === 12 && sb.rainCount === 10 && sb.rainInterval === 0.05 && sb.rainCooldown === 0.8 && sb.failThreshold === 1,
    'sandbox pellet/rain/failure numbers are byte-identical to today (12 / 10 / 0.05 / 0.8 / 1)');
  check(sandboxBefore.budgetTarget === 384, 'sandbox adaptive budget target is byte-identical to today (384)');

  // Go through the real UI entry point (the preset button's click handler calls
  // exactly this), not the internal bridge directly, so the slider-driven vars
  // (radius/power/pull-strength/impact-scale) get exercised too.
  const applied = await page.eval('BREAKMASS_POWERS.apply("rubble-god")');
  check(applied === true, 'BREAKMASS_POWERS.apply("rubble-god") returns true');
  await sleep(200);

  const god = await page.eval('BREAKMASS.tuning');
  console.log('\nRubble God (applied live, no rebuild) tuning:', JSON.stringify(god));
  check(god.preset === 'rubble-god', 'preset switched to rubble-god');
  const gc = god.config;
  check(gc.pullStrength === 10, 'pull strength -> 10x');
  check(gc.impactScale === 2, 'impact damage -> 2x');
  check(gc.blastRadius === 4.5, 'blast radius -> 4.5m');
  check(gc.blastPower === 2.5, 'blast impulse -> 2.5x');
  check(gc.shotgunPellets === 16, 'shotgun -> 16 pellets');
  check(gc.rainCount === 14, 'bomb rain -> 14 charges');
  check(Math.abs(gc.rainInterval - 0.04) < 1e-9, 'bomb rain -> 40ms spacing');
  check(Math.abs(gc.rainCooldown - 0.6) < 1e-9, 'bomb rain -> 0.6s repeat cooldown');
  check(gc.failThreshold < 1 && gc.failThreshold > 0, 'structural failure threshold is more aggressive than sandbox (' + gc.failThreshold + ' < 1)');
  check(god.budgetTarget === 576, 'adaptive rubble budget target -> +50% (576)');
  check(god.budgetActive >= 576, 'adaptive rubble budget active value loosened immediately (no rebuild needed)');

  const liveSliders = await page.eval("({radius:+document.getElementById('radius').value,power:+document.getElementById('power').value,pull:+document.getElementById('pull-strength').value,impact:+document.getElementById('impact-scale').value})");
  console.log('Live slider-driven vars:', JSON.stringify(liveSliders));
  check(liveSliders.radius === 4.5 && liveSliders.power === 2.5 && liveSliders.pull === 10 && liveSliders.impact === 2,
    'the actual live gameplay vars (radius/power/pull-strength/impact-scale) match the preset, not just config');

  const summary = await page.eval("document.getElementById('power-summary').textContent");
  console.log('#power-summary:', summary);
  check(summary.includes('10.0') && summary.includes('2.0') && summary.includes('4.5'), '#power-summary reflects the new numbers');

  // Fire one real bomb-rain volley at an actual anchored structure and count the
  // charges that actually queue up, not just the config number.
  const target = await page.eval(
    '(function(){' +
    'var e = BREAKMASS.inspect().filter(function(o){return o.anchored && o.count > 200;})[0];' +
    'if (!e) return null;' +
    'var p = e.position;' +
    'return [p.x, p.y + Math.min(3, e.dims[1] * 0.3), p.z];' +
    '})()'
  );
  check(!!target, 'found an anchored structure to aim bomb rain at');
  let volley = null;
  if (target) {
    await page.eval('BREAKMASS.aimAt([' + target[0] + ', ' + target[1] + ', ' + target[2] + '], 9)');
    await sleep(300);
    // bombRain() refuses to start while paused, so start the volley first, then
    // pause in the SAME synchronous eval (no animation frame runs between the two
    // calls). That freezes dispatchRain() before it can consume the first (delay 0)
    // charge, so the next telemetry() tick reports the volley at its full size.
    const result = await page.eval('(() => { const started = BREAKMASS.bombRain(); BREAKMASS.pause(true); return {started}; })()');
    check(result.started === true, 'bombRain() found a valid hit and started a volley');
    await sleep(120);
    volley = await page.eval('BREAKMASS.stats.rainPending');
    console.log('Rubble God live bomb-rain volley charge count:', volley);
    check(volley === 14, 'live bomb-rain volley actually queued 14 charges (not just config.rainCount)');
    await page.eval('BREAKMASS.clearRain(); BREAKMASS.pause(false);');
  }

  // Rebuild district with Rubble God active: must survive.
  await page.eval('BREAKMASS.reset()');
  await sleep(200);
  const afterRebuild = await page.eval('BREAKMASS.tuning');
  console.log('\nTuning after Rebuild district (rubble-god still active):', JSON.stringify(afterRebuild));
  check(afterRebuild.preset === 'rubble-god' && afterRebuild.config.pullStrength === 10 && afterRebuild.budgetTarget === 576,
    'rubble-god preset survives Rebuild district');

  // Switch back to sandbox: config must be exactly what it was at boot.
  const applyBack = await page.eval('BREAKMASS_POWERS.apply("sandbox")');
  check(applyBack === true, 'BREAKMASS_POWERS.apply("sandbox") returns true');
  await sleep(200);
  const backToSandbox = await page.eval('BREAKMASS.tuning');
  console.log('\nBack to Sandbox tuning:', JSON.stringify(backToSandbox));
  check(JSON.stringify(backToSandbox.config) === JSON.stringify(sandboxBefore.config), 'switching back to sandbox restores byte-identical config');
  check(backToSandbox.budgetTarget === sandboxBefore.budgetTarget, 'switching back to sandbox restores the byte-identical adaptive budget target');

} catch (e) {
  failures++;
  console.error('ERROR: ' + (e.stack || e.message || e));
} finally {
  const tail = page.logs.slice(-40);
  if (tail.length) console.log('\n--- console tail ---\n' + tail.join('\n'));
  page.kill();
}

console.log(failures ? '\nRUBBLE GOD CHECK FAILED (' + failures + ')' : '\nRUBBLE GOD CHECK OK');
process.exit(failures ? 1 : 0);
