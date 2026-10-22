// Real-page regression checks using CDP input and the existing QA hooks.
// This is automated integration coverage, not a manual or performance playtest.
// node tools/smash-retry-check.mjs [index.html] [--baseline]
import {launch,sleep,until} from './cdp.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const baseline=process.argv.includes('--baseline');
const file=process.argv.slice(2).find(x=>!x.startsWith('--'))||'index.html';
const out=resolve(process.env.EVIDENCE_DIR||'tools/out/smash-retry');mkdirSync(out,{recursive:true});
const page=await launch({port:Number(process.env.PORT||9790),width:1280,height:720});
const checks=[];
const check=(ok,name,details)=>{checks.push({name,passed:!!ok,details});console.log((ok?'PASS ':'FAIL ')+name);if(!ok)throw Error(name);};
const click=selector=>page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
const key=(code,type='keydown')=>page.eval(`document.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)},{code:${JSON.stringify(code)},bubbles:true}))`);
const tap=async code=>{await key(code);await key(code,'keyup');};
const state=()=>page.eval(`({score:BREAKMASS.scoreDiagnostics,camera:BREAKMASS.cameraState,scene:BREAKMASS.scenePreset,ready:BREAKMASS.ready,tool:document.documentElement.dataset.tool,grip:BREAKMASS.grab,tuning:BREAKMASS.tuning,paused:document.getElementById('pause').getAttribute('aria-pressed'),slow:document.getElementById('slow-flag').textContent,objects:BREAKMASS.inspect().map(e=>({id:e.id,root:e.rootId,count:e.count,anchored:e.anchored}))})`);
const sameView=(a,b)=>a.mode===b.mode&&a.yaw===b.yaw&&a.pitch===b.pitch&&a.position.every((v,i)=>Math.abs(v-b.position[i])<.002);
const focus=async name=>{await click(`[data-experiment="${name}"]`);await sleep(200);return state();};
const closeDialog=value=>page.eval(`new Promise(resolve=>{const d=document.getElementById('confirm-reset');d.addEventListener('close',()=>resolve(true),{once:true});d.querySelector('button[value="${value}"]').click();})`);
async function confirmRebuild(){
  await closeDialog('rebuild');
  // Native dialog close is queued after click. Observe rebuild start before
  // accepting ready, which could otherwise still describe the old scene.
  await until(()=>page.eval('!BREAKMASS.ready'),{timeout:5000,every:10,label:'rebuild starts'});
  await until(()=>page.eval('BREAKMASS.ready'),{timeout:90000,label:'rebuild completes'});
  await sleep(250);
}
async function retry(name){
  await click('#atlas-toggle');await click(`[data-experiment-retry="${name}"]`);
  check(await page.eval("document.getElementById('confirm-reset').open"),name+' retry asks first');
  await confirmRebuild();return state();
}
try{
  await page.goto(pathToFileURL(resolve(file)).href);
  await until(()=>page.eval('!!window.BREAKMASS?.ready && getComputedStyle(document.getElementById("loading")).display==="none"'),{timeout:90000,label:'boot'});
  await sleep(300);
  const initial={};for(const name of ['chimney','bridge','tank'])initial[name]=await focus(name);
  await tap('KeyK');await page.mouse('mouseMoved',642,331);await page.mouse('mousePressed',642,331);await page.mouse('mouseReleased',642,331);
  check(await page.eval('BREAKMASS.grab?.rootId===2'),'pointer grabs tank');
  await key('KeyE');
  try{await until(()=>page.eval('BREAKMASS.grab && !BREAKMASS.grab.anchored'),{timeout:15000,every:50,label:'lift frees tank'});}finally{await key('KeyE','keyup');}
  await tap('KeyX');await until(()=>page.eval('BREAKMASS.scoreDiagnostics.missionTower'),{timeout:16000,label:'thrown tank topples'});
  check((await state()).score.handsContract.status==='complete','actual hand throw earns completion');
  await page.eval('BREAKMASS.pause(true)');await sleep(100);
  const earned=await state();await focus('tank');
  check((await state()).score.handsContract.status==='complete','existing setup travel preserves earned completion');
  check((await state()).score.wreckageValue===earned.score.wreckageValue,'existing setup travel preserves damage');
  await click('#atlas-toggle');await sleep(100);await page.shot(out+'/01-destroyed-setup-menu.png');
  const retries=await page.eval('document.querySelectorAll("[data-experiment-retry]").length');
  if(baseline){
    check(retries===0,'baseline has no direct same-setup retries');
    check((await state()).objects.filter(e=>e.root===2).some(e=>e.count!==initial.tank.objects.find(x=>x.id===2).count),'baseline focus returns to damaged tank material');
  }else{
    check(retries===3,'all three existing setups have a labelled retry');
    await click('[data-experiment-retry="tank"]');
    const beforeCancel=await state();await closeDialog('cancel');
    check(JSON.stringify((await state()).score)===JSON.stringify(beforeCancel.score),'cancel preserves earned success and score');
    check((await state()).paused==='true','cancel preserves pause');
    await click('[data-experiment-retry="bridge"]');await page.mouse('mousePressed',10,360);await page.mouse('mouseReleased',10,360);await sleep(100);
    check(!await page.eval('document.getElementById("confirm-reset").open'),'backdrop cancels retry');
    await click('#quick-rebuild');
    check(await page.eval('document.getElementById("reset-title").textContent==="Rebuild this scene?"'),'ordinary rebuild has no stale retry action');
    await closeDialog('cancel');
    await page.eval("BREAKMASS.applyPreset('rubble-god');document.getElementById('pull-strength').value='11';document.getElementById('pull-strength').dispatchEvent(new Event('input'));document.getElementById('sound').checked=false;document.getElementById('sound').dispatchEvent(new Event('change'));document.getElementById('slow').click()");
    const prefs=await page.eval("({pull:document.getElementById('pull-strength').value,latch:document.getElementById('magnet-latch').checked,sound:document.getElementById('sound').checked,preset:BREAKMASS.tuning.preset,slow:document.body.classList.contains('is-slow')})");
    for(const name of ['tank','bridge','chimney']){
      // Keep all mutations on the real game API and reset through visible UI.
      await page.eval("BREAKMASS.spawnAt('crate',[-3,0,40])");
      const fresh=await retry(name);
      check(sameView(fresh.camera,initial[name].camera),name+' restores matching initial camera',{before:initial[name].camera,after:fresh.camera});
      check(fresh.tool==='3'&&!fresh.grip&&fresh.paused==='false',name+' resumes with God Hand and no stale grip',fresh);
      check(fresh.score.wreckageValue===0&&fresh.score.shotCount===0&&fresh.score.bestChain===0&&fresh.score.handsContract.status==='ready',name+' clears score and starts a fresh contract');
      check(fresh.objects.length===initial[name].objects.length&&!fresh.objects.some(e=>e.root>=2000&&e.root<1000000),name+' restores fixtures and removes spawned props');
      const current=await page.eval("({pull:document.getElementById('pull-strength').value,latch:document.getElementById('magnet-latch').checked,sound:document.getElementById('sound').checked,preset:BREAKMASS.tuning.preset,slow:document.body.classList.contains('is-slow')})");
      check(JSON.stringify(current)===JSON.stringify(prefs),name+' preserves power, latch, sound and slow preferences',{before:prefs,after:current});
      if(name==='tank')await page.shot(out+'/02-restored-tank.png');
    }
    await page.eval("BREAKMASS.changeScene('foundry')");await sleep(200);const foundry=await focus('chimney');
    check(await page.eval("document.querySelector('[data-smash-row=chimney]').hidden===false && document.querySelector('[data-smash-row=tank]').hidden && document.querySelector('[data-smash-row=bridge]').hidden"),'Foundry shows only its chimney setup and retry');
    await click('#atlas-toggle');await click('[data-experiment-retry="chimney"]');
    check(await page.eval("document.getElementById('reset-explanation').textContent.includes('rebuilds the Foundry')"),'Foundry confirmation states correct scope');
    await confirmRebuild();
    const again=await state();check(again.scene==='foundry'&&sameView(again.camera,foundry.camera),'chimney retry retains Foundry scene and view');
    check(again.score.handsContract.status==='unavailable','Foundry retry does not invent a tank contract');
    await page.eval("BREAKMASS.changeScene('physics')");await sleep(100);
    check(await page.eval("[...document.querySelectorAll('[data-smash-row]')].every(row=>row.hidden)"),'Physics park hides unavailable setup rows');
    await click('#help-toggle');await click('#retry-hands');await confirmRebuild();
    check(sameView((await state()).camera,initial.tank.camera),'existing Help tank retry still restores district and matching view');
    check(await page.eval("BREAKMASS.retryExperiment('invalid').then(v=>v===false)"),'unknown setup cannot rebuild scene');
  }
  const errors=page.logs.filter(x=>/^EXCEPTION:|^error:/.test(x));check(errors.length===0,'no browser exceptions',errors);
}finally{
  writeFileSync(out+'/result.json',JSON.stringify({baseline,passed:checks.every(c=>c.passed),checks,logs:page.logs},null,2));page.kill();
}
