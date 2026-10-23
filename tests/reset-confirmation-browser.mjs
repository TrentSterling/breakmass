// Real game document, native HTMLDialogElement and form submission in hosted CI.
// No mocked close events, replaced dialog methods, OS input or audio checks.
// The existing suites separately cover actual hand throws and destruction.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {authoredViews,observePublishedView} from '../tools/ui-boundaries.mjs';
import {readPausedDamage,waitForPausedDamage} from '../tools/paused-damage-wait.mjs';
import {launch,until} from '../tools/cdp.mjs';

if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'){
  throw Error('Native confirmation checks require a Linux GitHub-hosted runner; no local browser was launched.');
}
const file=resolve(process.argv[2]||'index.html'),out=resolve('tools/out/native-confirmation');
mkdirSync(out,{recursive:true});
const views=authoredViews(file);
const checks=[],report={commit:process.env.GITHUB_SHA,sourceSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),
  scope:'Actual game and native dialog scheduling in muted headless Chromium on a GitHub-hosted Linux runner. DOM button activation, not human input or performance qualification.',passed:false,checks};
let page;
const check=(ok,name,details)=>{checks.push({name,passed:!!ok,details});assert.ok(ok,name);console.log('PASS '+name);};
const sameView=(a,b)=>a.mode===b.mode&&a.yaw===b.yaw&&a.pitch===b.pitch&&a.position.every((v,i)=>Math.abs(v-b.position[i])<.002);
try{
  page=await launch({port:Number(process.env.PORT||9795),width:1280,height:720});
  await page.goto(pathToFileURL(file).href);
  await until(()=>page.eval('!!window.BREAKMASS?.ready && getComputedStyle(document.getElementById("loading")).display==="none"'),{timeout:90000,label:'boot'});
  const installed=await page.eval(`(()=>{
    const game=window.BREAKMASS,dialog=document.getElementById('confirm-reset');
    const probe=window.__confirmationProbe={calls:[],events:[],completion:Promise.resolve(),originals:{}};
    probe.wait=(promise,ms,label)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]).finally(()=>clearTimeout(timer));};
    probe.frames=()=>probe.wait(new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),5000,'render frames');
    probe.rebuilt=()=>probe.wait(probe.completion,90000,'rebuild');
    probe.views=${JSON.stringify(views)};probe.boundaries=[];probe.damageWaits=[];
    probe.view=async(name,scene='district')=>{const r=await (${observePublishedView.toString()})(probe.views[scene][name],5000);probe.boundaries.push(r);if(!r.passed)throw Error(r.error);};
    probe.quiet=()=>(${waitForPausedDamage.toString()})(()=>(${readPausedDamage.toString()})(),probe.damageWaits,'native DOM paused snapshot');
    probe.snapshot=()=>{
      const {mode,position,yaw,pitch}=game.cameraState,{preset,config,budgetTarget}=game.tuning;
      return {scene:game.scenePreset,camera:{mode,position,yaw,pitch},score:game.scoreDiagnostics,tuning:{preset,config,budgetTarget},
        paused:document.getElementById('pause').getAttribute('aria-pressed'),tool:document.documentElement.dataset.tool,
        objects:game.inspect().map(e=>({id:e.id,root:e.rootId,count:e.count}))};
    };
    probe.closed=()=>new Promise((resolve,reject)=>{
      const listener=e=>{clearTimeout(timer);resolve({trusted:e.isTrusted,value:dialog.returnValue});};
      const timer=setTimeout(()=>{dialog.removeEventListener('close',listener);reject(Error('Native close event timed out'));},5000);
      dialog.addEventListener('close',listener,{once:true});
    });
    // Record routing while delegating to the original methods and real rebuilds.
    for(const name of ['reset','retryExperiment','retryHandsContract','changeScene']){
      const original=probe.originals[name]=game[name];
      game[name]=function(...args){
        probe.calls.push([name,...args]);
        const result=original.apply(this,args);probe.completion=Promise.resolve(result);return result;
      };
    }
    dialog.addEventListener('close',e=>probe.events.push({trusted:e.isTrusted,value:dialog.returnValue}));
    return {version:game.version,native:dialog instanceof HTMLDialogElement && dialog.close===HTMLDialogElement.prototype.close && dialog.showModal===HTMLDialogElement.prototype.showModal};
  })()`);
  report.version=installed.version;check(installed.native,'actual native dialog methods are intact');

  const cancelled=await page.eval(`(async()=>{
    const p=__confirmationProbe,d=document.getElementById('confirm-reset'),g=BREAKMASS;
    g.focusExperiment('bridge');await p.view('bridge');const bridgeView=g.cameraState;
    g.focusExperiment('tank');g.pause(true);await p.view('tank');await p.quiet();const before=p.snapshot();
    document.querySelector('[data-experiment-retry="tank"]').click();const opened=d.open;
    const closing=p.closed();d.querySelector('[value="cancel"]').click();
    const hiddenBeforeDelivery=!d.open,eventsBeforeDelivery=p.events.length;
    document.querySelector('[data-experiment-retry="bridge"]').click();const reopenBlocked=!d.open;
    const event=await closing;await p.frames();
    return {opened,hiddenBeforeDelivery,eventsBeforeDelivery,reopenBlocked,event,before,after:p.snapshot(),calls:p.calls,bridgeView};
  })()`);
  check(cancelled.opened&&cancelled.hiddenBeforeDelivery&&cancelled.eventsBeforeDelivery===0,'form cancel hides dialog before native close event delivery',cancelled.event);
  check(cancelled.reopenBlocked,'cancel/reopen gap cannot replace the pending action');
  check(cancelled.event.trusted&&cancelled.calls.length===0,'native cancel dispatches no reset or retry',cancelled.calls);
  check(JSON.stringify(cancelled.before)===JSON.stringify(cancelled.after),'cancel preserves scene, camera, score, objects, pause and tuning');

  const retried=await page.eval(`(async()=>{
    const p=__confirmationProbe,d=document.getElementById('confirm-reset');
    document.querySelector('[data-experiment-retry="bridge"]').click();const reopened=d.open;
    const closing=p.closed();document.getElementById('confirm-rebuild-button').click();
    const event=await closing;await p.rebuilt();await p.view('bridge');
    return {reopened,event,calls:p.calls,after:p.snapshot(),ready:BREAKMASS.ready};
  })()`);
  check(retried.reopened&&retried.event.trusted,'retry reopens after native cancellation completes');
  check(JSON.stringify(retried.calls)===JSON.stringify([['retryExperiment','bridge','district']]),'span confirmation dispatches exactly one span retry, never generic reset',retried.calls);
  check(retried.ready&&sameView(retried.after.camera,cancelled.bridgeView),'actual span rebuild restores the matching starting view',retried.after.camera);
  check(retried.after.tool==='3'&&retried.after.paused==='false'&&retried.after.score.handsContract.status==='ready','actual retry resumes with God Hand and a fresh contract');

  const accepted=await page.eval(`(async()=>{
    const p=__confirmationProbe,d=document.getElementById('confirm-reset'),g=BREAKMASS;
    await g.changeScene('foundry');g.focusExperiment('chimney');g.pause(true);await p.view('chimney','foundry');await p.quiet();
    const expected=g.cameraState;p.calls=[];const eventCount=p.events.length;
    document.querySelector('[data-experiment-retry="chimney"]').click();
    const closing=p.closed();document.getElementById('confirm-rebuild-button').click();
    const hiddenBeforeDelivery=!d.open,eventsBeforeDelivery=p.events.length-eventCount;
    document.getElementById('retry-hands').click();const reopenBlocked=!d.open;
    const event=await closing;await p.rebuilt();await p.view('chimney','foundry');
    return {hiddenBeforeDelivery,eventsBeforeDelivery,reopenBlocked,event,expected,calls:p.calls,after:p.snapshot(),ready:g.ready};
  })()`);
  check(accepted.hiddenBeforeDelivery&&accepted.eventsBeforeDelivery===0&&accepted.reopenBlocked,'confirm/reopen gap keeps the accepted request reserved');
  check(accepted.event.trusted&&JSON.stringify(accepted.calls)===JSON.stringify([['retryExperiment','chimney','foundry']]),'accepted native confirmation executes its original Foundry retry once',accepted.calls);
  check(accepted.ready&&accepted.after.scene==='foundry'&&sameView(accepted.after.camera,accepted.expected),'actual Foundry retry preserves the selected scene and view');

  const noResult=await page.eval(`(async()=>{
    const p=__confirmationProbe,d=document.getElementById('confirm-reset');
    BREAKMASS.pause(true);await p.frames();await p.quiet();const before=p.snapshot();p.calls=[];
    document.querySelector('[data-experiment-retry="chimney"]').click();const defaultValue=d.returnValue;
    const closing=p.closed();d.close();const event=await closing;await p.frames();
    return {defaultValue,event,calls:p.calls,before,after:p.snapshot()};
  })()`);
  check(noResult.defaultValue==='cancel'&&noResult.event.trusted&&noResult.event.value==='cancel','native close without a result does not reuse earlier rebuild consent');
  check(noResult.calls.length===0&&JSON.stringify(noResult.before)===JSON.stringify(noResult.after),'native close without a result preserves the current attempt');

  const events=await page.eval('__confirmationProbe.events');report.events=events;
  check(events.length===4&&events.every(e=>e.trusted),'four real native close events were delivered',events);
  check(!page.logs.some(x=>/^EXCEPTION:|^error:/.test(x)),'no uncaught browser errors',page.logs);
  await page.shot(out+'/after-native-confirmations.png');report.passed=true;
}catch(error){
  report.error=String(error.stack||error);process.exitCode=1;
  await page?.shot(out+'/failure.png').catch(()=>{});
}finally{
  report.logs=page?.logs||[];
  if(page)Object.assign(report,await page.eval('({boundaries:window.__confirmationProbe?.boundaries,damageWaits:window.__confirmationProbe?.damageWaits})').catch(()=>({})));
  if(page)await page.eval(`(()=>{const p=window.__confirmationProbe;if(p)for(const [name,original] of Object.entries(p.originals))BREAKMASS[name]=original;})()`).catch(()=>{});
  page?.kill();writeFileSync(out+'/result.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,checks:checks.length,error:report.error||null}));
}
