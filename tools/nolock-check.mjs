import {launch, sleep, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const page = await launch({port: 9511, width: 1000, height: 640});
try {
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  await sleep(800); await page.front();
  await page.eval('document.getElementById("view").requestPointerLock=()=>new Promise(()=>{}); window.__toasts=[];const t=document.getElementById("toast");new MutationObserver(()=>__toasts.push(t.textContent)).observe(t,{childList:true,characterData:true,subtree:true});');
  const st = async (l) => console.log(l.padEnd(16), await page.eval('JSON.stringify({...BREAKMASS.lookState,yaw:+BREAKMASS.cameraState.yaw.toFixed(3),cursor:getComputedStyle(document.getElementById("view")).cursor,grab:!!BREAKMASS.grab})'));
  await page.mouse('mouseMoved', 500, 320);
  await page.mouse('mousePressed', 500, 320, 'right'); await sleep(100); await page.mouse('mouseReleased', 500, 320, 'right'); await sleep(200);
  await st('after RMB');
  await sleep(1500); await st('after 1.5 s');
  for (let i = 0; i < 10; i++) { await page.mouse('mouseMoved', 500 + i * 12, 320); await sleep(30); }
  await st('after move');
  await page.mouse('mousePressed', 620, 320, 'left'); await sleep(150); await st('LMB down');
  await page.mouse('mouseReleased', 620, 320, 'left'); await sleep(200); await st('LMB up');
  for (let i = 0; i < 10; i++) { await page.mouse('mouseMoved', 620 - i * 12, 320); await sleep(30); }
  await st('after move 2');
  await page.mouse('mousePressed', 500, 320, 'right'); await sleep(100); await page.mouse('mouseReleased', 500, 320, 'right'); await sleep(200);
  await st('RMB again');
  console.log('toasts', await page.eval('JSON.stringify(window.__toasts)'));
} finally { for (const l of page.logs.filter(l => /EXCEPTION|error/i.test(l))) console.log(' ', l.slice(0, 300)); page.kill(); }
