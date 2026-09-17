// Simulates a browser that DROPS pointer lock on every left mousedown (what Trent's browser does).
// Expect: look stays latched, the grab survives, the camera still turns while the left button is held.
import {launch, sleep, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const page = await launch({port: Number(process.env.PORT || 9531), width: 1000, height: 640});
try {
  await page.goto(pathToFileURL(resolve(process.argv[2] || 'index.html')).href);
  await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  await sleep(800); await page.front();
  await page.eval('document.addEventListener("mousedown",e=>{if(e.button===0&&document.pointerLockElement)document.exitPointerLock();},true);window.__toasts=[];const t=document.getElementById("toast");new MutationObserver(()=>__toasts.push(t.textContent)).observe(t,{childList:true,characterData:true,subtree:true});');
  const st = async (l) => console.log(l.padEnd(16), await page.eval('JSON.stringify({...BREAKMASS.lookState,yaw:+BREAKMASS.cameraState.yaw.toFixed(3),cursor:getComputedStyle(document.getElementById("view")).cursor,grab:!!BREAKMASS.grab})'));
  await page.mouse('mouseMoved', 500, 320);
  await page.mouse('mousePressed', 500, 320, 'right'); await sleep(100); await page.mouse('mouseReleased', 500, 320, 'right'); await sleep(250);
  await st('after RMB');
  await page.mouse('mousePressed', 500, 320, 'left'); await sleep(200); await st('LMB down');
  for (let i = 0; i < 10; i++) { await page.mouse('mouseMoved', 500 + i * 12, 320, 'left'); await sleep(30); }
  await st('LMB drag');
  await page.mouse('mouseReleased', 620, 320, 'left'); await sleep(200); await st('LMB up');
  await page.mouse('mousePressed', 620, 320, 'right'); await sleep(100); await page.mouse('mouseReleased', 620, 320, 'right'); await sleep(250);
  await st('RMB again');
  console.log('toasts', await page.eval('JSON.stringify(window.__toasts)'));
} finally { for (const l of page.logs.filter(l => /EXCEPTION|error/i.test(l))) console.log(' ', l.slice(0, 300)); page.kill(); }
