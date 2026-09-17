// Presses the right mouse button over the canvas and reports look-capture state + console errors.
// node tools/rmb-check.mjs [file.html]
import {launch, sleep, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const file = process.argv[2] || 'index.html';
const page = await launch({port: Number(process.env.PORT || 9461), width: 1000, height: 640});
try {
  await page.goto(pathToFileURL(resolve(file)).href);
  await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  await sleep(800);
  await page.front();
  const v = await page.eval('BREAKMASS.version');
  const before = await page.eval('JSON.stringify(BREAKMASS.lookState)');
  await page.mouse('mouseMoved', 500, 320);
  await page.mouse('mousePressed', 500, 320, 'right');
  await sleep(150);
  const during = await page.eval('JSON.stringify(BREAKMASS.lookState)');
  await page.mouse('mouseMoved', 560, 330, 'right');
  await sleep(100);
  const cam1 = await page.eval('JSON.stringify(BREAKMASS.cameraState)');
  await page.mouse('mouseReleased', 560, 330, 'right');
  await sleep(150);
  const after = await page.eval('JSON.stringify(BREAKMASS.lookState)');
  console.log(file, v, '\n before', before, '\n during', during, '\n cam', cam1.slice(0, 160), '\n after', after);
} finally {
  for (const l of page.logs.filter(l => /EXCEPTION|error/i.test(l))) console.log(' ', l.slice(0, 400));
  page.kill();
}
