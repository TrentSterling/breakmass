// Renders og-image.png (1200x630): boots the real game headlessly, wrecks a few
// things through the public BREAKMASS hooks, hides the HUD and screenshots.
// node tools/og-shot.mjs   (env: PORT, SETTLE ms)
import {launch, sleep, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const page = await launch({port: Number(process.env.PORT || 9351), width: 1200, height: 630});
try {
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  await sleep(1500);
  await page.eval('document.body.classList.add("hidden-hud")');
  // Tank (root 2) and span (root 3) lose their supports; the biggest nearby
  // structures take blasts so there is real rubble in frame.
  const plan = await page.eval(`(()=>{
    const F=BREAKMASS,tank=F.materialProbe(2),span=F.materialProbe(3);
    const big=F.liveQueue.objects.filter(o=>o.count>600&&o.rootId!==2&&o.rootId!==3);
    const near=big.map(o=>({o,p:F.materialProbe(o.id)?.point})).filter(x=>x.p).map(x=>({...x,d:Math.hypot(x.p[0]-tank.point[0],x.p[2]-tank.point[2])})).filter(x=>x.d<22).sort((a,b)=>a.d-b.d).slice(0,4);
    F.aimAt([tank.point[0],Math.max(2,tank.point[1]-6),tank.point[2]],30);
    F.cutTower();F.cutBridge();
    for(const x of near){F.blast(x.p[0],x.p[1]-1,x.p[2],3.4);}
    return {tank:tank.point,span:span?.point,blasted:near.map(x=>[x.o.id,x.o.count,x.d.toFixed(1)])};
  })()`);
  console.log(JSON.stringify(plan));
  await sleep(1200);
  await page.eval('(()=>{const t=BREAKMASS.materialProbe(2);if(t)BREAKMASS.blast(t.point[0],t.point[1]-2,t.point[2],2.6);})()');
  await sleep(Number(process.env.SETTLE || 4200));
  await page.shot(resolve('og-image.png'));
  console.log('wrote og-image.png');
} finally {
  for (const l of page.logs.filter(l => l.startsWith('EXCEPTION') || l.startsWith('error'))) console.log(' ', l.slice(0, 300));
  page.kill();
}
