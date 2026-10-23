// Actual Blast/hand input regressions, including the reviewer's indirect fuel case.
// node tools/blast-contract-check.mjs [index.html] [--before]
// Camera placement uses the existing QA API; mouse actions use CDP, keys use DOM events.
import {authoredViews,viewBoundary} from './ui-boundaries.mjs';
import {readFuelWaitTrace,traceFuelWait} from './fuel-wait-trace.mjs';
import {launch, sleep, until} from './cdp.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const before=process.argv.includes('--before');
const file=process.argv.slice(2).find(x=>!x.startsWith('--'))||'index.html';
const out=resolve(process.env.EVIDENCE_DIR||'tools/out/blast-contract');mkdirSync(out,{recursive:true});
const checks=[],samples=[],boundaries=[],fuelWaits=[];
const views=authoredViews(file);
const page=await launch({port:Number(process.env.PORT||9785),width:1280,height:720});
const check=(ok,name,details)=>{checks.push({name,passed:!!ok,details});console.log((ok?'PASS ':'FAIL ')+name);if(!ok)throw Error(name);};
const key=(code,type='keydown')=>page.eval(`document.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)},{code:${JSON.stringify(code)},bubbles:true}))`);
const tap=async code=>{await key(code);await key(code,'keyup');};
const click=async(x=640,y=360)=>{await page.mouse('mouseMoved',x,y);await page.mouse('mousePressed',x,y);await page.mouse('mouseReleased',x,y);};
const state=()=>page.eval(`({score:BREAKMASS.scoreDiagnostics,blast:BREAKMASS.blastDiagnostics,barrels:BREAKMASS.stats.barrels,economy:BREAKMASS.stats.economy,target:BREAKMASS.targetAtPointer(),grab:BREAKMASS.grab,detail:document.getElementById('hands-detail').textContent})`);
async function retry(){
  await page.eval('BREAKMASS.retryHandsContract()');
  await until(()=>page.eval('BREAKMASS.ready&&BREAKMASS.scoreDiagnostics.handsContract.status==="ready"'),{timeout:60000,label:'fresh tank'});
  await page.eval('{BREAKMASS_UI.close();BREAKMASS_POWERS.apply("sandbox");const e=document.getElementById("radius");e.value=.65;e.dispatchEvent(new Event("input",{bubbles:true}));}');
  await viewBoundary(page,views.district.tank,boundaries,'Blast fresh tank view');
}
async function aim(point){
  await page.eval(`BREAKMASS_UI.close();BREAKMASS.aimAt(${JSON.stringify(point)},8)`);await viewBoundary(page,null,boundaries,'orbit aim published');await page.mouse('mouseMoved',640,360);
}
async function topple(){
  check(await page.eval('BREAKMASS.focusExperiment("tank")'),'tank remains available for hand topple');
  await viewBoundary(page,views.district.tank,boundaries,'Blast hand topple tank view');
  if(!await page.eval('document.getElementById("magnet-latch").checked'))await tap('KeyK');
  await click(640,330);check(!!(await state()).grab,'pointer acquires tank');
  await key('KeyE');try{await until(()=>page.eval('BREAKMASS.scoreDiagnostics.missionTower'),{timeout:20000,every:50,label:'tank topple'});}finally{await key('KeyE','keyup');}
  await tap('KeyX');await sleep(250);
}
async function capture(name){await page.eval('BREAKMASS_UI.open("help")');await sleep(200);await page.shot(out+'/'+name+'.png');await page.eval('BREAKMASS_UI.close()');}
try{
  await page.goto(pathToFileURL(resolve(file)).href);
  await until(()=>page.eval('!!window.BREAKMASS?.ready&&getComputedStyle(document.getElementById("loading")).display==="none"'),{timeout:90000,label:'boot'});
  for(let run=1;run<=(before?1:2);run++){
    await retry();await aim([-22.7,0,25.3]);await tap('Digit4');
    const target=(await state()).target;check(target?.id===null&&Math.abs(target.point[0]+22.7)<.01&&Math.abs(target.point[2]-25.3)<.01,'exact Fuel drum 4 ground target '+run,target);
    await click();await sleep(100);await viewBoundary(page,null,boundaries,'Blast telemetry published');const immediate=await state();samples.push({case:'indirect Blast '+run,immediate});
    check(immediate.blast?.editRequests===0&&immediate.blast?.directId===null,'ground Blast makes no direct voxel edit '+run,immediate.blast);
    check(immediate.economy.splashArmed>0,'actual Blast ignites adjacent fuel '+run);
    check(immediate.score.handsContract.status===(before?'ready':'failed'),'indirect Blast '+(before?'reproduces eligibility bypass':'fails attempt immediately')+' '+run,immediate.score);
    await until(()=>page.eval('BREAKMASS.stats.barrels>=6'),{timeout:15000,label:'six fuel detonations'});
    samples.at(-1).chain=await state();await capture('indirect-blast-'+run);
    await topple();const later=await state();samples.at(-1).afterHand=later;
    check(later.score.handsContract.status===(before?'complete':'failed'),'later hand topple '+(before?'reproduces false success':'cannot erase Blast failure')+' '+run,later.score);
    await capture('after-tool-chain-hand-'+run);
  }
  await retry();await tap('Digit4');check((await state()).score.handsContract.status==='ready','selecting Blast alone is allowed');
  await aim([0,1500,0]);check((await state()).target===null,'empty sky has no target');await click();await sleep(250);await viewBoundary(page,null,boundaries,'empty sky telemetry published');
  const sky=await state();samples.push({case:'empty sky',state:sky});
  check(sky.blast===null&&sky.score.handsContract.status==='ready'&&sky.economy.splashArmed===0,'no-target Blast makes no explosion and stays eligible');
  await aim([40,0,40]);check((await state()).target?.id===null,'empty ground is a valid surface',(await state()).target);await click();await sleep(400);await viewBoundary(page,null,boundaries,'empty ground telemetry published');
  const ground=await state();samples.push({case:'empty ground',state:ground});
  check(ground.blast?.editRequests===0&&ground.economy.splashArmed===0&&ground.barrels===0,'empty-ground Blast causes no material or fuel damage');
  check(ground.score.handsContract.status===(before?'ready':'failed'),'surface Blast '+(before?'previously remained eligible':'counts even without damage'),ground.score);
  await retry();
  // Throw a real district fuel drum into the nearby ground with God Hand,
  // before the tank falls. This catches an incorrect global explosion hook.
  const fuel=await page.eval('BREAKMASS.inspect().find(e=>e.id===36&&e.explosive)');check(!!fuel,'original Fuel drum 4 exists');
  await page.eval('BREAKMASS.orbitForTest(.65,1.2)'); // Clear the intervening wall and throw down at the cluster.
  await aim([fuel.position.x+fuel.dims[0]*.125,fuel.position.y+fuel.dims[1]*.125,fuel.position.z+fuel.dims[2]*.125]);
  await tap('Digit5');if(!await page.eval('document.getElementById("magnet-latch").checked'))await tap('KeyK');
  await traceFuelWait(since=>page.eval(`(${readFuelWaitTrace.toString()})(${JSON.stringify(since)})`),fuelWaits,async()=>{
    await click();check((await state()).grab?.id===36,'God Hand picks up original fuel drum',await state());
    await tap('KeyX');
    await until(()=>page.eval('BREAKMASS.stats.barrels>=2'),{timeout:20000,label:'hand-triggered fuel chain'});
  });
  const handChain=await state();samples.push({case:'valid hand chain',chain:handChain});
  check(!handChain.score.missionTower&&handChain.score.handsContract.status==='ready','hand-triggered explosions stay eligible before tank topple',handChain.score);
  await capture('valid-hand-chain');await topple();
  check((await state()).score.handsContract.status==='complete','hand chain followed by hand topple earns completion');
  await aim([-22.7,0,25.3]);await tap('Digit4');await click();await sleep(200);
  check((await state()).score.handsContract.status==='complete','later surface Blast preserves earned success');
  samples.at(-1).earned=await state();await capture('valid-earned-after-blast');
  check(!page.logs.some(x=>/EXCEPTION/.test(x)),'no uncaught browser exceptions');
}catch(error){console.error(error);checks.push({name:error.message,passed:false});process.exitCode=1;await page.shot(out+'/failure.png').catch(()=>{});}
finally{
  writeFileSync(out+'/report.json',JSON.stringify({before,file,scope:'Actual workers and tool input. Existing QA camera placement, CDP mouse and DOM keys. No direct explosion or contract mutation.',checks,samples,boundaries,fuelWaits,logs:page.logs},null,2));page.kill();
}
