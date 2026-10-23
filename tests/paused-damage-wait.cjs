// Deterministic CPU scheduler/source tests. No browser, Rapier, input, or audio.
const {test,before}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let api;before(async()=>{api=await import('../tools/paused-damage-wait.mjs');});
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const runner=fs.readFileSync(path.join(__dirname,'../tools/smash-retry-check.mjs'),'utf8');
function snapshot(){return {at:0,ready:true,paused:true,scene:'district',simTime:2,score:{wreckageValue:100},impactEpochs:[2],
  queue:{commits:0,voxelPending:0,physicsBusy:false,errors:null,objects:[{id:2,rootId:2,count:100,pending:false,queued:0,needsConnectivity:false}]}};}
function clock(){
  let time=0,id=0;const timers=new Map(),receipts=[];
  return {receipts,timers,options:{now:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id)},
    advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}},
    elapse(ms){time+=ms;},get time(){return time;}};
}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
async function run(h,read,update=()=>{},options={}){
  let done=false,value,error;
  const p=api.waitForPausedDamage(read,h.receipts,'CPU damage drain',{...h.options,...options}).then(v=>{value=v;done=true;},e=>{error=e;done=true;});
  await flush();for(let i=0;!done&&i<500;i++){h.advance(50);update(h.time);await flush();}
  assert.ok(done,'finite watchdog settled');await p;assert.equal(h.timers.size,0,'all owned timers cleaned');return {value,error,receipt:h.receipts[0]};
}
test('already idle paused damage returns the exact snapshot without mutation',async()=>{
  const h=clock(),s=snapshot(),original=structuredClone(s),r=await run(h,()=>s);
  assert.equal(r.error,undefined);assert.equal(r.value,s);assert.deepEqual(s,original);assert.equal(r.receipt.passed,true);
});
for(const field of ['physicsBusy','commits','voxelPending','pending','queued','needsConnectivity'])test(field+' alone blocks completion until cleared',async()=>{
  const h=clock(),s=snapshot(),object=['pending','queued','needsConnectivity'].includes(field),owner=object?s.queue.objects[0]:s.queue;
  owner[field]=['physicsBusy','pending','needsConnectivity'].includes(field)?true:1;
  const r=await run(h,()=>structuredClone(s),t=>{if(t===350)owner[field]=typeof owner[field]==='boolean'?false:0;});
  assert.equal(r.error,undefined);assert.equal(r.receipt.passed,true);assert.equal(r.receipt.elapsedMs,350);assert.ok(r.receipt.samples.length>1);
});
test('constant score is insufficient while connectivity is still pending',async()=>{
  const h=clock(),s=snapshot();s.queue.objects[0].needsConnectivity=true;
  const r=await run(h,()=>s,()=>{},{timeoutMs:200});assert.match(r.error.message,/did not drain within 200/);assert.equal(r.receipt.passed,false);
});
test('never-resolving transport also hits the host watchdog',async()=>{
  const h=clock(),r=await run(h,()=>new Promise(()=>{}),()=>{},{timeoutMs:200});assert.match(r.error.message,/did not drain/);assert.equal(r.receipt.passed,false);
});
test('an idle response arriving after deadline cannot turn green before delayed timer delivery',async()=>{
  const h=clock(),r=await run(h,()=>{h.elapse(201);return snapshot();},()=>{},{timeoutMs:200});assert.match(r.error.message,/did not drain/);assert.equal(r.receipt.passed,false);
});
for(const kind of ['worker error','not ready','unpaused','malformed queue','scene change','generation change','generation cleared','time rollback'])test(kind+' fails closed with the last snapshot',async()=>{
  const h=clock(),s=snapshot();s.queue.physicsBusy=true;
  const r=await run(h,()=>structuredClone(s),t=>{if(t!==50)return;
    if(kind==='worker error')s.queue.errors='voxel failure';if(kind==='not ready')s.ready=false;if(kind==='unpaused')s.paused=false;
    if(kind==='malformed queue')s.queue.commits=NaN;if(kind==='scene change')s.scene='foundry';
    if(kind==='generation change')s.impactEpochs=[3];if(kind==='generation cleared')s.impactEpochs=[];if(kind==='time rollback')s.simTime=0;
  });assert.ok(r.error);assert.equal(r.receipt.passed,false);assert.ok(r.receipt.end);
});
test('transport exception is retained and propagated',async()=>{
  const h=clock(),r=await run(h,()=>{throw Error('CDP disconnected');});assert.equal(r.error.message,'CDP disconnected');assert.equal(r.receipt.error,'CDP disconnected');
});
for(const opts of [{timeoutMs:0},{timeoutMs:Infinity},{everyMs:0}])test('invalid timing configuration rejected '+JSON.stringify(opts),async()=>{
  const h=clock();await assert.rejects(api.waitForPausedDamage(()=>snapshot(),h.receipts,'bad',{...h.options,...opts}),/Invalid/);assert.equal(h.timers.size,0);
});

function sourceHarness(){
  const h=clock(),noop=()=>{},vector=()=>({copy(){return this;},applyQuaternion(){return this;},add(){return this;}});
  const entity={id:2,rootId:2,name:'Water tower',dims:[4,10,4],count:100,anchored:true,pending:true,queue:[],needsConnectivity:false,
    body:{rotation:()=>({}),translation:()=>({})}};
  const state={physics:{busy:true},worker:{pending:1},commitQueue:[],entities:new Map([[2,entity]]),ready:true,paused:true,simTime:2,
    performance:{now:()=>h.time},rebalanceRubble:noop,latestCommitFrameMs:0,now:0,wreckageValue:100,epoch:2,
    cameraMode:'fly',thirdPerson:false,player:{group:{visible:false},body:{setEnabled:noop}},cam:{},S:1,V:vector,Q:vector,
    input:{reset:noop},lookCapture:{cancel:noop},releaseGrab:noop,held:false,keys:new Set(),resetFlyAt:noop,syncCameraUI:noop,selectTool:noop,toast:noop,
    window:{BREAKMASS_UI:{close:noop}},document:{getElementById:()=>({getAttribute:()=> 'true'})},physicsError:null,runtimeFaults:[],damageStats:{surfaceCommits:0,settles:0,latencies:[]}};
  const focus=source.slice(source.indexOf('  function focusExperiment('),source.indexOf('  function configureStage('));
  const prefix=source.slice(source.indexOf('    const commitStart=performance.now();',source.indexOf('  function animate(now)')),source.indexOf('    if(ready&&!physicsError){',source.indexOf('  function animate(now)')));
  const scoreLine=source.split('\n').find(l=>l.includes('wreckageValue+=dustValue'));
  const score=scoreLine.slice(scoreLine.indexOf('wreckageValue+='),scoreLine.indexOf(';jobs++'))+';';
  const liveQueue=source.slice(source.indexOf('    get liveQueue(){'),source.indexOf('    materialProbe:id=>'));
  const context=vm.createContext(state);
  // Synthetic voxel results replace geometry/worker machinery; production queue
  // draining, score accumulation expression, and travel handler run unchanged.
  state.dustValue=dust=>dust;
  state.commit=result=>{state.result=result;vm.runInContext(score,context);entity.count-=result.removed;entity.pending=false;entity.needsConnectivity=result.more;entity.connectivitySince=0;};
  state.dispatchNextEdit=()=>{entity.pending=true;state.worker.pending=1;};
  vm.runInContext(focus+'\nconst F={'+liveQueue+'}; window.BREAKMASS=F;',context);
  Object.defineProperties(state.window.BREAKMASS,{stats:{get:()=>({simTime:state.simTime,t:h.time})},ready:{get:()=>state.ready},scenePreset:{value:'district'},
    scoreDiagnostics:{get:()=>({wreckageValue:state.wreckageValue})},impactDiagnostics:{get:()=>({audit:{traces:[{epoch:state.epoch}]}})}});
  return {h,state,entity,read:()=>JSON.parse(JSON.stringify(vm.runInContext('('+api.readPausedDamage.toString()+')()',context))),
    frame(dust,more){state.physics.busy=false;state.worker.pending=0;state.now=h.time;state.commitQueue.push({dust,removed:1,more});vm.runInContext('{'+prefix+'}',context);},
    focus:()=>vm.runInContext("focusExperiment('tank')",context)};
}
test('production drain and travel reproduce old snapshot failure; completion wait preserves strict equality',async()=>{
  const x=sourceHarness(),before=x.read();assert.equal(before.score.wreckageValue,100);
  x.h.advance(100);const oldEarned=x.read();x.h.advance(100);x.frame(25,true);x.h.advance(100);
  const beforeFocus=x.read();assert.equal(x.focus(),true);const oldArrived=x.read();
  assert.notEqual(oldArrived.score.wreckageValue,oldEarned.score.wreckageValue,'old fixed-delay equality fails');
  assert.deepEqual(oldArrived,beforeFocus,'actual focus handler does not alter score, material or generation');
  const r=await run(x.h,x.read,t=>{if(t===600)x.frame(5,false);});
  assert.equal(r.error,undefined);assert.equal(r.value.score.wreckageValue,130);assert.equal(r.receipt.start.queue.voxelPending,1);
  assert.equal(r.receipt.end.queue.objects[0].count,98);assert.deepEqual(r.receipt.end.impactEpochs,[2]);
  const earned=x.read();x.focus();x.h.advance(200);const arrived=x.read();
  assert.equal(arrived.score.wreckageValue,earned.score.wreckageValue);assert.deepEqual(arrived.queue.objects,earned.queue.objects);
  console.log('CPU source replay: old 100 -> 125 fails; drain through connectivity 130 -> 130 passes; epoch 2; material 100 -> 98 before travel. Synthetic voxel results, not a browser playtest.');
});
test('a real score reset after completion still fails the original strict equality',async()=>{
  const h=clock(),s=snapshot(),r=await run(h,()=>structuredClone(s));assert.equal(r.receipt.passed,true);
  const earned=r.value;s.score.wreckageValue=0;assert.notEqual(s.score.wreckageValue,earned.score.wreckageValue);
});
for(const writeFails of [false,true])test('production failure report and cleanup survive transport failure; writeFails='+writeFails,()=>{
  let report,killed=0;
  const tail=runner.slice(runner.lastIndexOf('}catch(error){'));
  const context={checks:[{passed:true}],dialogEvents:[],damageWaits:[{passed:true}],failure:null,baseline:false,out:'unused',
    page:{logs:[],kill:()=>killed++},writeFileSync:(file,json)=>{report=JSON.parse(json);if(writeFails)throw Error('write failed');}};
  assert.throws(()=>vm.runInNewContext("try{throw Error('transport failed');"+tail,context),writeFails?/write failed/:/transport failed/);
  assert.equal(report.passed,false);assert.match(report.failure,/transport failed/);assert.equal(killed,1);
});
test('source integration uses the existing boundary, preserves equality and retains failed wait receipts',()=>{
  assert.match(source,/async function quiet\(ms=20000\).*?!q\.commits&&!q\.voxelPending&&!q\.objects\.some\(e=>e\.pending\|\|e\.queued\|\|e\.needsConnectivity\)/);
  assert.match(runner,/waitForPausedDamage\(damageSnapshot,damageWaits,'earned throw before setup travel'\)/);
  assert.match(runner,/check\(arrived\.score\.wreckageValue===earned\.score\.wreckageValue,'existing setup travel preserves damage',travelEvidence\)/);
  assert.match(runner,/damageWaits\.every\(e=>e\.passed\)/);assert.match(runner,/before:\{state:earned,damage:beforeTravel\},after:\{state:arrived,damage:afterTravel\}/);
  assert.match(runner,/catch\(error\)\{failure=String\(error.stack\|\|error\);throw error;\}/);
  assert.match(runner,/&&damageWaits\.every\(e=>e\.passed\)&&!failure/);assert.match(runner,/finally\{page.kill\(\);\}/);
  assert.doesNotMatch(api.readPausedDamage.toString()+api.waitForPausedDamage.toString(),/\.pause\(|\.reset\(|\.step\(|dispatchEvent|\.click\(|\.shift\(|\.splice\(/);
});
