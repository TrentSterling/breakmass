// Renders og-image.png (1200x630): boots the real game headlessly in Rubble God,
// wrecks the district through the public BREAKMASS hooks, parks the camera
// close to a half-destroyed hero building with chaos behind it, and screenshots
// mid-blast. node tools/og-shot.mjs   (env: PORT, SETTLE ms, HERO name regex)
import {launch, sleep, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const page = await launch({port: Number(process.env.PORT || 9351), width: 1200, height: 630});
const ev = (js) => page.eval(js);
try {
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await until(() => ev('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  await sleep(1200);
  await ev('document.body.classList.add("hidden-hud");BREAKMASS_POWERS.apply("rubble-god",{silent:true})');
  const hero = process.env.HERO || 'Northstar';
  const plan = await ev(`(()=>{
    const F=BREAKMASS,all=F.inspect();
    const hero=all.filter(e=>e.anchored&&new RegExp(${JSON.stringify(hero)}).test(e.name)).sort((a,b)=>b.count-a.count)[0]||all.filter(e=>e.anchored).sort((a,b)=>b.count-a.count)[0];
    const hp=F.materialProbe(hero.id);
    const others=all.filter(e=>e.anchored&&e.id!==hero.id&&e.count>1500).map(e=>({e,p:F.materialProbe(e.id)?.point})).filter(x=>x.p)
      .map(x=>({...x,d:Math.hypot(x.p[0]-hp.point[0],x.p[2]-hp.point[2])})).sort((a,b)=>a.d-b.d);
    const drums=all.filter(e=>e.explosive).map(e=>({e,p:F.materialProbe(e.id)?.point})).filter(x=>x.p).map(x=>({...x,d:Math.hypot(x.p[0]-hp.point[0],x.p[2]-hp.point[2])})).sort((a,b)=>a.d-b.d);
    return {hero:{id:hero.id,name:hero.name,count:hero.count,dims:hero.dims,top:hp.point},others:others.slice(0,8).map(x=>({id:x.e.id,name:x.e.name,p:x.p,d:+x.d.toFixed(1)})),drums:drums.slice(0,6).map(x=>({id:x.e.id,p:x.p,d:+x.d.toFixed(1)}))};
  })()`);
  console.log(JSON.stringify(plan));
  const H = plan.hero, top = H.top, height = H.dims[1] * .25;
  const base = [top[0], top[1] - height, top[2]];
  // Camera: low, close, three-quarter view of the hero; the rest of the yard behind it.
  await ev(`BREAKMASS.aimAt([${base[0]},${base[1] + height * .45},${base[2]}],${Math.max(16, height * 1.15 + 8)});BREAKMASS.orbitForTest(${Number(process.env.YAW || -0.6)},${Number(process.env.PITCH || 0.3)})`);
  // Background chaos first so it has time to fall.
  await ev('BREAKMASS.cutTower();BREAKMASS.cutBridge()');
  for (const o of plan.others.slice(0, 6)) await ev(`BREAKMASS.blast(${o.p[0]},${o.p[1] - 1.5},${o.p[2]},3.6)`);
  for (const d of plan.drums.slice(0, 3)) await ev(`BREAKMASS.blast(${d.p[0]},${d.p[1]},${d.p[2]},2.2)`);
  await sleep(900);
  // Hero: gut one corner and the middle floors, leave it standing and ragged.
  const hx = H.dims[0] * .25, hz = H.dims[2] * .25;
  const hits = [[base[0] + hx * .45, base[1] + height * .72, base[2] + hz * .45], [base[0] - hx * .4, base[1] + height * .4, base[2] + hz * .5], [base[0] + hx * .5, base[1] + height * .2, base[2] - hz * .3]];
  for (const h of hits) { await ev(`BREAKMASS.blast(${h[0]},${h[1]},${h[2]},3.4)`); await sleep(350); }
  await ev(`BREAKMASS.bombRain({point:{toArray:()=>[${plan.others[1]?.p[0] ?? base[0] + 12}, 2, ${plan.others[1]?.p[2] ?? base[2] - 12}]}})`);
  await sleep(Number(process.env.SETTLE || 2600));
  // Last-second flashes so the frame carries live blasts, then capture.
  await ev(`BREAKMASS.blast(${base[0] - hx * .5},${base[1] + height * .55},${base[2] - hz * .5},3.2)`);
  if (plan.drums[3]) await ev(`BREAKMASS.blast(${plan.drums[3].p[0]},${plan.drums[3].p[1]},${plan.drums[3].p[2]},2.2)`);
  await sleep(Number(process.env.FLASH || 260));
  await page.shot(resolve(process.env.OUT || 'og-image.png'));
  console.log('wrote', process.env.OUT || 'og-image.png');
} finally {
  for (const l of page.logs.filter(l => l.startsWith('EXCEPTION') || l.startsWith('error'))) console.log(' ', l.slice(0, 300));
  page.kill();
}
