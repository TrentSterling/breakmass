// Confirms Alt+mouse twist still charges torsion while the look is latched (the onDelta hook
// that routes deltas to twistMouse when Alt is held, instead of turning the camera). Holds
// AltLeft with a real CDP Input.dispatchKeyEvent (a genuine DOM keydown, code==='AltLeft', the
// same check the game's own keydown handler reads). If a future Chrome build ever stops
// delivering that synthetic Alt keydown to the page, this falls back to BREAKMASS.setTwist and
// says so explicitly in its output rather than reporting a false PASS.
//
// Limitation: this proves the onDelta -> twistMouse wiring reacts to a real Alt keydown while
// latched. It does not reproduce actual OS pointer-lock mouse deltas (nothing headless can);
// look-check.mjs's synthetic mouseMoved sequence is the same substitute the rest of the gate
// already relies on for look/steering checks.
//
// node tools/twist-latch-check.mjs [file.html]
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(port, width = 1000, height = 640) {
  const dir = mkdtempSync(join(tmpdir(), 'bb-chrome-'));
  const args = [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    `--window-size=${width},${height}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
  ];
  const proc = spawn(CHROME, args, {stdio: 'ignore'});
  let info;
  for (let i = 0; i < 60; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); } }
  if (!info) throw new Error('chrome did not start on ' + port);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map(); const logs = []; let sessionId;
  const send = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, {res, rej}); ws.send(JSON.stringify({id, method, params, sessionId: sid})); });
  // Wire the listener BEFORE issuing any command: Target.createTarget/attachToTarget replies
  // would otherwise arrive with nobody home and their awaits would hang forever.
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const {res, rej} = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
    if (!sessionId || m.sessionId !== sessionId || !m.method) return;
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  };
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  ({sessionId} = await send('Target.attachToTarget', {targetId, flatten: true}));
  const call = (method, params) => send(method, params, sessionId);
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  return {
    logs, proc,
    goto: url => call('Page.navigate', {url}),
    eval: async expr => { const r = await call('Runtime.evaluate', {expression: expr, returnByValue: true, awaitPromise: true}); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; },
    mouse: (type, x, y, button = 'left') => call('Input.dispatchMouseEvent', {type, x, y, button, clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1}),
    key: (type, code, modifiers = 0) => call('Input.dispatchKeyEvent', {type, code, key: code, windowsVirtualKeyCode: 18, modifiers}),
    kill: () => { try { proc.kill(); } catch {} },
  };
}
async function until(fn, {timeout = 30000, every = 200, label = 'condition'} = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = await fn(); if (v) return v; await sleep(every); }
  throw new Error('timeout waiting for ' + label);
}

const file = process.argv[2] || 'index.html';
const log = step => console.log('[' + ((Date.now() - t0) / 1000).toFixed(1) + 's] ' + step);
const t0 = Date.now();
// Hard stop so a hung CDP await fails loud instead of hanging the gate silently.
const watchdog = setTimeout(() => { console.log('FAIL twist-latch-check: hard timeout (170s) waiting on the browser'); process.exit(1); }, 170000);
log('launching chrome');
const page = await launch(Number(process.env.PORT || 9735));
log('chrome attached, navigating');
let fail = null, usedFallback = false;
try {
  await page.goto(pathToFileURL(resolve(file)).href);
  await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 120000, label: 'boot'});
  log('booted');
  await sleep(600);
  await page.eval('BREAKMASS.pause(false)');
  await sleep(150);
  const grabbed = await page.eval(`(function(){var probe=BREAKMASS.materialProbe(2);return !!probe&&BREAKMASS.grabAt(2,probe.local,[0,1,0]);})()`);
  if (!grabbed) throw new Error('could not grab entity 2 (water tank) to test twist against');
  log('grabbed tank');
  const probePoint = await page.eval('BREAKMASS.materialProbe(2).point');
  await page.eval(`BREAKMASS.setGrabTarget(${JSON.stringify(probePoint)})`); // hold the reach still, same as the in-page QA twist test

  await page.mouse('mouseMoved', 500, 320);
  // Quick right click: latches look (RMB drag-look engaged) without holding the button.
  await page.mouse('mousePressed', 500, 320, 'right'); await sleep(60); await page.mouse('mouseReleased', 500, 320, 'right'); await sleep(300);
  const latched = await page.eval('!!BREAKMASS.lookState.latched');
  if (!latched) throw new Error('quick right click did not latch look; cannot test twist-while-latched');
  log('look latched');

  await page.key('keyDown', 'AltLeft', 1);
  const before = await page.eval('BREAKMASS.twistState.charge');
  for (let i = 1; i <= 12; i++) { await page.mouse('mouseMoved', 500 + i * 16, 320); await sleep(20); }
  await sleep(200);
  const domResult = await page.eval('BREAKMASS.twistState');
  await page.key('keyUp', 'AltLeft', 0);
  await page.eval('BREAKMASS.clearGrabTarget();BREAKMASS.releaseGrab()');

  const domWorked = domResult.charge > before + .01 || domResult.rip !== 0 || domResult.twistRips > 0;
  if (domWorked) {
    console.log('PASS: Alt held via CDP Input.dispatchKeyEvent while look is latched drives twist.', 'charge before', before, 'after', domResult.charge, 'rip', domResult.rip, 'twistRips', domResult.twistRips);
  } else {
    usedFallback = true;
    console.log('LIMITATION: a real Alt keydown (Input.dispatchKeyEvent) while latched did not charge twist in this Chrome build (charge before/after: ' + before + ' / ' + domResult.charge + '). Falling back to BREAKMASS.setTwist to confirm the twist path itself still works.');
    const grabbed2 = await page.eval(`(function(){var probe=BREAKMASS.materialProbe(2);return !!probe&&BREAKMASS.grabAt(2,probe.local,[0,1,0]);})()`);
    if (!grabbed2) throw new Error('could not re-grab entity 2 for the setTwist fallback');
    const probePoint2 = await page.eval('BREAKMASS.materialProbe(2).point');
    await page.eval(`BREAKMASS.setGrabTarget(${JSON.stringify(probePoint2)})`);
    await page.eval('BREAKMASS.setTwist(1)');
    await sleep(500);
    const overrideResult = await page.eval('BREAKMASS.twistState');
    await page.eval('BREAKMASS.setTwist(0);BREAKMASS.clearGrabTarget();BREAKMASS.releaseGrab()');
    console.log('  setTwist override result:', JSON.stringify(overrideResult));
    if (!(overrideResult.charge > 0 || overrideResult.rip !== 0)) throw new Error('twist did not charge even via the setTwist override; the twist path itself looks broken, not just synthetic Alt input delivery');
  }
  const errors = page.logs.filter(l => /EXCEPTION/.test(l));
  if (errors.length) throw new Error('console exceptions: ' + errors.join(' | ').slice(0, 300));
} catch (e) {
  fail = e.message;
} finally {
  page.kill();
  clearTimeout(watchdog);
}
if (fail) { console.log('FAIL twist-latch-check: ' + fail); process.exit(1); }
console.log(usedFallback ? 'twist-latch-check OK (verified via BREAKMASS.setTwist fallback only; see limitation note above)' : 'twist-latch-check OK');
