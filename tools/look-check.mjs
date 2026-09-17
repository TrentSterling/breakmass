// Mouse-look regression gate. Runs three browser scenarios and FAILS (exit 1) on any regression:
//   normal   : the browser grants pointer lock
//   nolock   : requestPointerLock never answers (stubbed)
//   clickdrop: the browser exits the lock on every left mousedown (Trent's browser)
// Each scenario asserts: hold-right drag turns the camera and releases on mouseup; a quick right
// click latches look; a left click while latched keeps look AND keeps the grab; the camera still
// turns while the left button is held; a second quick right click releases.
// node tools/look-check.mjs [file.html]
import {launch, sleep, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const file = process.argv[2] || 'index.html';
const scenarios = {
  normal: '',
  nolock: 'document.getElementById("view").requestPointerLock=()=>new Promise(()=>{});',
  clickdrop: 'document.addEventListener("mousedown",e=>{if(e.button===0&&document.pointerLockElement)document.exitPointerLock();},true);',
};
let failures = 0, port = Number(process.env.PORT || 9551);
for (const [name, stub] of Object.entries(scenarios)) {
  const page = await launch({port: port++, width: 1000, height: 640});
  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); };
  try {
    await page.goto(pathToFileURL(resolve(file)).href);
    await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
    await sleep(600); await page.front();
    if (stub) await page.eval(stub);
    const st = () => page.eval('({...BREAKMASS.lookState,yaw:BREAKMASS.cameraState.yaw,grab:!!BREAKMASS.grab})');
    const move = async (x0, x1, button) => { for (let i = 0; i <= 8; i++) { await page.mouse('mouseMoved', x0 + (x1 - x0) * i / 8, 320, button); await sleep(25); } };
    await page.mouse('mouseMoved', 500, 320);
    // 1. Hold right and drag.
    const y0 = (await st()).yaw;
    await page.mouse('mousePressed', 500, 320, 'right'); await sleep(120);
    await move(500, 620, 'right'); await sleep(80);
    const dragging = await st();
    check(Math.abs(dragging.yaw - y0) > 0.05, `${name}: hold-right drag did not turn the camera`);
    await page.mouse('mouseReleased', 620, 320, 'right'); await sleep(250);
    const afterDrag = await st();
    check(!afterDrag.latched && !afterDrag.locked && !afterDrag.right, `${name}: drag release left look on ${JSON.stringify(afterDrag)}`);
    // 2. Quick right click latches.
    await page.mouse('mousePressed', 620, 320, 'right'); await sleep(60); await page.mouse('mouseReleased', 620, 320, 'right'); await sleep(300);
    const latched = await st();
    check(latched.latched, `${name}: quick right click did not latch ${JSON.stringify(latched)}`);
    // 3. Left click + drag while latched keeps look, keeps the grab, keeps steering.
    await sleep(900); // past any lock timeout
    const y1 = (await st()).yaw;
    await page.mouse('mousePressed', 620, 320, 'left'); await sleep(150);
    const down = await st();
    check(down.latched, `${name}: left click dropped the latch`);
    check(down.grab, `${name}: left click did not grab (grip lost to an input reset?)`);
    await move(620, 500, 'left'); await sleep(80);
    const steer = await st();
    check(steer.latched && steer.grab, `${name}: latch or grab lost during left drag ${JSON.stringify(steer)}`);
    check(Math.abs(steer.yaw - y1) > 0.05, `${name}: camera did not turn while left button held`);
    await page.mouse('mouseReleased', 500, 320, 'left'); await sleep(200);
    // 4. Second quick right click releases.
    await page.mouse('mousePressed', 500, 320, 'right'); await sleep(60); await page.mouse('mouseReleased', 500, 320, 'right'); await sleep(300);
    const released = await st();
    check(!released.latched && !released.locked, `${name}: second right click did not release ${JSON.stringify(released)}`);
    const errors = page.logs.filter(l => /EXCEPTION/.test(l));
    check(!errors.length, `${name}: exceptions ${errors.join(' | ').slice(0, 300)}`);
  } catch (e) { fails.push(`${name}: ${e.message}`); }
  finally { page.kill(); }
  console.log((fails.length ? 'FAIL ' : 'PASS ') + name.padEnd(10) + (fails.length ? '\n  ' + fails.join('\n  ') : ''));
  failures += fails.length;
}
console.log(failures ? `look-check: ${failures} failure(s)` : 'look-check OK');
process.exit(failures ? 1 : 0);
