// Headless smoke + QA run for BREAKMASS. Zero deps: node tools/verify.mjs [url]
// Boots the real page in headless Chrome (SwiftShader WebGL), waits for the
// district to load, screenshots it, then runs the in-page QA harness.
import {launch, sleep, until} from './cdp.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const arg = process.argv.slice(2).find(a => !a.startsWith('--')) || 'index.html';
const target = /^https?:/.test(arg) ? arg : pathToFileURL(resolve(arg)).href;
const out = resolve('tools/out'); mkdirSync(out, {recursive: true});
const page = await launch({port: Number(process.env.PORT || 9333), width: 1280, height: 800});
try {
  console.log('goto', target);
  await page.goto(target);
  await until(() => page.eval('!!window.BREAKMASS && !!document.getElementById("loading") && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  console.log('boot ok', JSON.stringify(await page.eval('({v:BREAKMASS.version,boot:BREAKMASS_BOOT.stage,errors:BREAKMASS_BOOT.errors,info:BREAKMASS.runtimeInfo()})')));
  await sleep(4000);
  await page.shot(`${out}/boot.png`);
  console.log('stats', JSON.stringify(await page.eval('BREAKMASS.stats')).slice(0, 600));
  const frames = await page.eval('(()=>{const f=BREAKMASS.frames();const ms=f.slice(-120).map(x=>x.frameMs??x.ms??0);return {n:f.length,avg:ms.reduce((a,b)=>a+b,0)/Math.max(1,ms.length),keys:Object.keys(f[0]||{})}})()');
  console.log('frames', JSON.stringify(frames));
  if (process.argv.includes('--qa')) {
    console.log('running QA...');
    const report = await page.eval('BREAKMASS_QA.run({reset:true}).then(r=>({passed:r.passed,tests:r.tests.map(t=>({name:t.name,passed:t.passed,error:t.error||null,ms:t.ms})),errors:r.errors,samples:r.samples?.length}))');
    console.log(JSON.stringify(report, null, 1));
    writeFileSync(`${out}/qa.json`, JSON.stringify(report, null, 2));
    await page.shot(`${out}/after-qa.png`);
  }
} finally {
  console.log('--- console (' + page.logs.length + ')');
  for (const l of page.logs.slice(0, 60)) console.log(' ', l.slice(0, 300));
  page.kill();
}
