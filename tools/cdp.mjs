// Tiny Chrome DevTools Protocol driver. Zero deps (Node 20+: global fetch + WebSocket).
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function launch({port, width = 1280, height = 800, headless = true} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bb-chrome-'));
  const args = [
    headless ? '--headless=new' : '', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    `--window-size=${width},${height}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
  ].filter(Boolean);
  const proc = spawn(CHROME, args, {stdio: 'ignore'});
  let info;
  for (let i = 0; i < 60; i++) {
    try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); }
  }
  if (!info) throw new Error('chrome did not start on ' + port);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const {res, rej} = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) for (const l of listeners) l(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, {res, rej}); ws.send(JSON.stringify({id, method, params, sessionId})); });
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const logs = [];
  listeners.push(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  const call = (method, params) => send(method, params, sessionId);
  await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  const page = {
    logs, proc, dir,
    goto: url => call('Page.navigate', {url}),
    eval: async (expr) => { const r = await call('Runtime.evaluate', {expression: expr, returnByValue: true, awaitPromise: true}); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; },
    shot: async (file) => { const {data} = await call('Page.captureScreenshot', {format: 'png'}); const fs = await import('node:fs'); fs.writeFileSync(file, Buffer.from(data, 'base64')); return file; },
    mouse: (type, x, y, button = 'left') => call('Input.dispatchMouseEvent', {type, x, y, button, clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1}),
    front: () => call('Page.bringToFront'),
    kill: () => { try { proc.kill(); } catch {} },
  };
  return page;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function until(fn, {timeout = 30000, every = 250, label = 'condition'} = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = await fn(); if (v) return v; await sleep(every); }
  throw new Error('timeout waiting for ' + label);
}
