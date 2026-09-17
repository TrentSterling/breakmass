// Perf-lane profiling helper. Boots the real page in headless Chrome, takes a
// CPU profile (CDP Profiler domain) across a short BREAKMASS_STRESS run, then
// prints self time per named function so the real hot spots can be identified
// by evidence instead of guessing. Does not replace tools/stress-measure.mjs,
// which is the receipts script for before/after frame-time percentiles.
// Zero deps: node tools/profile-hotspots.mjs [url] [seconds]
import {spawn} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch({port, width = 1280, height = 800}) {
  const dir = mkdtempSync(join(tmpdir(), 'bb-prof-'));
  const args = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    `--window-size=${width},${height}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'];
  const proc = spawn(CHROME, args, {stdio: 'ignore'});
  let info;
  for (let i = 0; i < 60; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); } }
  if (!info) throw new Error('chrome did not start on ' + port);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const {res, rej} = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, {res, rej}); ws.send(JSON.stringify({id, method, params, sessionId})); });
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const call = (method, params) => send(method, params, sessionId);
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  return {
    call, proc,
    goto: url => call('Page.navigate', {url}),
    eval: async expr => { const r = await call('Runtime.evaluate', {expression: expr, returnByValue: true, awaitPromise: true}); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; },
    kill: () => { try { proc.kill(); } catch {} },
  };
}
async function until(fn, {timeout = 30000, every = 250} = {}) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { const v = await fn(); if (v) return v; await sleep(every); } throw new Error('timeout'); }

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const arg = args[0] || 'index.html';
const seconds = Number(args[1] || 8);
const target = /^https?:/.test(arg) ? arg : pathToFileURL(resolve(arg)).href;
const out = resolve('tools/out'); mkdirSync(out, {recursive: true});
const page = await launch({port: Number(process.env.PORT || 9746)});
try {
  console.log('goto', target);
  await page.goto(target);
  await until(() => page.eval('!!window.BREAKMASS && !!document.getElementById("loading") && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000});
  console.log('boot ok');
  await page.call('Profiler.enable');
  await page.call('Profiler.setSamplingInterval', {interval: 100});
  await page.call('Profiler.start');
  // Fire-and-forget the stress workload; we only need coverage of the hot loop,
  // not its full result, so a shorter run than the receipts script is fine here.
  const runPromise = page.eval(`window.BREAKMASS_STRESS.run(window,{seconds:${seconds}}).catch(e=>({error:e.message}))`);
  await runPromise;
  const {profile} = await page.call('Profiler.stop');
  writeFileSync(`${out}/profile-${Date.now()}.cpuprofile`, JSON.stringify(profile));

  // Aggregate self time per function name (ignore anonymous/system nodes' url-less noise).
  const nodesById = new Map(profile.nodes.map(n => [n.id, n]));
  const hitCounts = new Map(); // functionName -> hitCount
  for (const n of profile.nodes) {
    const name = n.callFrame.functionName || '(anonymous)';
    hitCounts.set(name, (hitCounts.get(name) || 0) + (n.hitCount || 0));
  }
  const totalHits = [...hitCounts.values()].reduce((a, b) => a + b, 0);
  const sampleMs = (profile.endTime - profile.startTime) / 1e3 / Math.max(1, profile.samples?.length || totalHits);
  const rows = [...hitCounts.entries()].filter(([, h]) => h > 0).sort((a, b) => b[1] - a[1]).slice(0, 30)
    .map(([name, hits]) => ({name, hits, selfMs: +(hits * sampleMs).toFixed(2), pct: +(100 * hits / totalHits).toFixed(1)}));
  console.log('TOTAL SAMPLES', totalHits, 'DURATION s', ((profile.endTime - profile.startTime) / 1e6).toFixed(2));
  console.log('TOP SELF TIME');
  for (const r of rows) console.log(`  ${r.selfMs.toString().padStart(8)} ms  ${r.pct.toString().padStart(5)}%  x${r.hits.toString().padStart(5)}  ${r.name}`);
  const watch = ['telemetry', 'renderBodies', 'effects', 'displayStats', 'updateStressMarkers', 'animate', 'updateAimReticle', 'drawAtlas', 'updateGameHUD'];
  console.log('WATCHED FUNCTIONS');
  for (const w of watch) { const r = rows.find(r => r.name === w) || hitCounts.has(w) ? {name: w, hits: hitCounts.get(w) || 0, selfMs: +((hitCounts.get(w) || 0) * sampleMs).toFixed(2), pct: +(100 * (hitCounts.get(w) || 0) / totalHits).toFixed(1)} : null; if (r) console.log(`  ${w}: ${r.selfMs} ms self (${r.pct}%)`); else console.log(`  ${w}: 0 samples`); }
} finally {
  page.kill();
}
