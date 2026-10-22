// Real page integration checks. CDP mouse + DOM keyboard input; not a human playtest.
// node tools/contract-check.mjs [index.html] [--baseline]
import {launch, sleep, until} from './cdp.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const baseline=process.argv.includes('--baseline');
const file=process.argv.slice(2).find(x=>!x.startsWith('--'))||'index.html';
const out=resolve(process.env.EVIDENCE_DIR||'tools/out/contracts');mkdirSync(out,{recursive:true});
const page=await launch({port:Number(process.env.PORT||9780),width:1280,height:720});
const checks=[];
const check=(ok,name,details)=>{checks.push({name,passed:!!ok,details});console.log((ok?'PASS ':'FAIL ')+name);if(!ok)throw Error(name);};
const key=(code,type='keydown')=>page.eval(`document.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)},{code:${JSON.stringify(code)},bubbles:true}))`);
const state=()=>page.eval(`({score:BREAKMASS.scoreDiagnostics,hands:document.getElementById('goal-hands').className,status:document.getElementById('hands-status')?.textContent,camera:BREAKMASS.cameraState,scene:BREAKMASS.scenePreset,ready:BREAKMASS.ready,tool:document.documentElement.dataset.tool})`);
const tap=async code=>{await key(code);await key(code,'keyup');};
const shot=async digit=>{await tap('Digit'+digit);await page.mouse('mouseMoved',640,330);await page.mouse('mousePressed',640,330);await page.mouse('mouseReleased',640,330);};
async function retry(){
  await page.eval("document.getElementById('help-toggle').click();document.getElementById('retry-hands').click()");
  check(await page.eval("document.getElementById('confirm-reset').open"),'retry opens confirmation');
  await page.eval("document.getElementById('confirm-rebuild-button').click()");
  await until(async()=>{const s=await state();return s.ready&&s.score.shotCount===0&&s.score.handsContract?.status==='ready';},{timeout:60000,label:'retry rebuild'});
  await sleep(100);
}
try{
  await page.goto(pathToFileURL(resolve(file)).href);
  await until(()=>page.eval('!!window.BREAKMASS?.ready && getComputedStyle(document.getElementById("loading")).display==="none"'),{timeout:90000,label:'boot'});await sleep(400);
  check(await page.eval('BREAKMASS.physicsMode==="worker"'),'physics stays in worker');
  const start=await state();await page.shot(out+'/01-start.png');
  await tap('KeyK');await page.mouse('mouseMoved',640,330);await page.mouse('mousePressed',640,330);await page.mouse('mouseReleased',640,330);
  check(await page.eval('!!BREAKMASS.grab'),'real pointer acquires tank');
  await key('KeyE');
  try{await until(()=>page.eval('BREAKMASS.scoreDiagnostics.missionTower'),{timeout:16000,every:50,label:'hand topple'});}finally{await key('KeyE','keyup');}
  await sleep(100);
  check((await state()).hands.includes('done'),'hand topple earns contract');await page.shot(out+'/02-earned.png');
  await tap('KeyX');await shot(3);
  await until(async()=>{const s=await state();return s.score.shotCount>0&&s.hands.includes('done')===!baseline;},{timeout:8000,label:'contract HUD after rocket'});
  const afterShot=await state();
  check(afterShot.score.shotCount>0,'rocket still fires after hand throw');
  check(afterShot.hands.includes('done')===!baseline,baseline?'baseline reproduces lost completion':'earned completion survives later rocket');
  await page.shot(out+'/03-after-rocket.png');
  if(!baseline){
    await page.eval("document.getElementById('help-toggle').click();document.getElementById('retry-hands').click();document.querySelector('#confirm-reset button[value=cancel]').click()");
    await sleep(100);check((await state()).score.handsContract.status==='complete','cancel preserves earned attempt');
    await page.eval("document.getElementById('help-toggle').click()");
    await retry();const fresh=await state();
    check(fresh.tool==='3'&&fresh.scene==='district'&&!fresh.score.missionTower,'retry restores tank and God Hand');
    check(fresh.camera.position.every((v,i)=>Math.abs(v-start.camera.position[i])<0.001)&&fresh.camera.yaw===start.camera.yaw&&fresh.camera.pitch===start.camera.pitch,'retry returns to matching tank viewpoint',{start:start.camera,retry:fresh.camera});
    await shot(3);await sleep(100);check((await state()).score.handsContract.status==='failed','rocket before success fails attempt');
    await page.shot(out+'/04-failed.png');
    await retry();await shot(4);await sleep(100);check((await state()).score.handsContract.reason==='Blast','Blast cannot bypass hands-only rule');
    await retry();await shot(7);await sleep(100);check((await state()).score.handsContract.reason==='Chisel','Chisel cannot bypass hands-only rule');
    await retry();await tap('Digit1');check((await state()).score.handsContract.status==='ready','selecting a weapon alone keeps attempt eligible');
    await shot(1);await sleep(100);check((await state()).score.handsContract.reason==='Rifle','Rifle invalidates on firing');
    await retry();await shot(2);await sleep(100);check((await state()).score.handsContract.reason==='Shotgun','Shotgun invalidates on firing');
    await retry();await shot(6);await sleep(100);check((await state()).score.handsContract.reason==='Bomb rain','Bomb rain invalidates when requested');
    await retry();await tap('KeyG');check((await state()).score.handsContract.reason==='Gravity shove','gravity shove invalidates attempt');
    await retry();
    check(await page.eval("!!BREAKMASS.spawnAt('crate',[-3,0,40])"),'valid prop spawn still works');
    check((await state()).score.handsContract.reason==='Props','spawned props cannot bypass hands-only rule');
    await page.eval("BREAKMASS.changeScene('foundry')");check((await state()).score.handsContract.status==='unavailable','tank absent in Foundry is explicit');
    await retry();check((await state()).scene==='district','retry from Foundry loads district');
    for(const [code,direction] of [['KeyE',1],['KeyQ',-1],['Space',1],['ControlLeft',-1]]){
      const before=(await state()).camera.position[1];await key(code);await sleep(250);await key(code,'keyup');await sleep(120);
      check(((await state()).camera.position[1]-before)*direction>0.2,code+' flight alias moves in the expected direction');
    }
    await page.eval("document.getElementById('help-toggle').click()");await page.shot(out+'/05-help.png');
  }
  check(!page.logs.some(x=>/EXCEPTION/.test(x)),'no uncaught browser exceptions');
  writeFileSync(out+'/report.json',JSON.stringify({baseline,file,scope:'Actual workers and pointer targeting; synthetic keyboard/CDP mouse. Self-play separately recorded.',checks,start,afterShot,logs:page.logs},null,2));
}catch(error){writeFileSync(out+'/failure.json',JSON.stringify({error:error.message,checks,state:await state().catch(()=>null),logs:page.logs},null,2));process.exitCode=1;}
finally{page.kill();}
