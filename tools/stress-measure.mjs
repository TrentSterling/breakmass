// Perf-lane measurement harness. Boots the real page in headless Chrome and runs
// the in-page BREAKMASS_STRESS workload (same fixture the game itself uses for its
// benchmark export), then reports p50/p95/p99/max for frameMs, renderCpuMs,
// commitFrameMs and physicsRoundTripMs. SwiftShader software GL inflates absolute
// render time; only use this to compare two builds against each other, never as an
// absolute FPS claim. Zero deps: node tools/stress-measure.mjs [url] [seconds]
import {launch, sleep, until} from './cdp.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const arg = args[0] || 'index.html';
const seconds = Number(args[1] || process.env.STRESS_SECONDS || 20);
const target = /^https?:/.test(arg) ? arg : pathToFileURL(resolve(arg)).href;
const out = resolve('tools/out'); mkdirSync(out, {recursive: true});
const page = await launch({port: Number(process.env.PORT || 9745), width: 1280, height: 800});
try {
  console.log('goto', target);
  await page.goto(target);
  await until(() => page.eval('!!window.BREAKMASS && !!document.getElementById("loading") && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  console.log('boot ok', JSON.stringify(await page.eval('({v:BREAKMASS.version,boot:BREAKMASS_BOOT.stage,errors:BREAKMASS_BOOT.errors,info:BREAKMASS.runtimeInfo()})')));
  console.log(`running BREAKMASS_STRESS.run for ${seconds}s...`);
  const report = await page.eval(`window.BREAKMASS_STRESS.run(window,{seconds:${seconds}}).catch(e=>({error:e.message,stack:e.stack}))`);
  if (report.error) throw new Error('stress run failed: ' + report.error + '\n' + (report.stack || ''));
  const dist = (key) => {
    const vals = report.samples.map(s => s[key]).filter(Number.isFinite).sort((a, b) => a - b);
    const at = p => vals[Math.min(vals.length - 1, Math.floor((vals.length - 1) * p))] ?? null;
    return {n: vals.length, p50: at(.5), p95: at(.95), p99: at(.99), max: at(1)};
  };
  const summary = {
    version: report.version, physicsMode: report.physicsMode, actualSeconds: report.actualSeconds,
    simulationHz: report.simulationHz, stallsOver50ms: report.stallsOver50ms, stallsOver100ms: report.stallsOver100ms,
    frameMs: dist('frameMs'), renderCpuMs: dist('renderCpuMs'), commitFrameMs: dist('commitFrameMs'),
    physicsRoundTripMs: dist('physicsRoundTripMs'), solveMs: dist('solveMs' in (report.samples[0] || {}) ? 'solveMs' : 'physicsMs'),
    queryMs: dist('queryMs'), worldObjects: report.peaks?.bodies, colliders: report.peaks?.colliders,
    activeStructural: report.peaks?.activeStructural, awake: report.peaks?.awake,
  };
  console.log('SUMMARY', JSON.stringify(summary, null, 2));
  writeFileSync(`${out}/stress-summary.json`, JSON.stringify(summary, null, 2));
  writeFileSync(`${out}/stress-full.json`, JSON.stringify(report, null, 2));
} finally {
  console.log('--- console (' + page.logs.length + ')');
  for (const l of page.logs.slice(0, 60)) console.log(' ', l.slice(0, 300));
  page.kill();
}
