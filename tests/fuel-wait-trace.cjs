// Source/CPU replay only. No browser, real physics, input or audio.
const {test,before}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/\r\n/g,'\n');
let api;before(async()=>{api=await import('../tools/fuel-wait-trace.mjs');});
const snapshot=(tick=20)=>({at:tick*500,frameAt:tick*500-1,simTime:tick/60,tick,frames:[],fuels:[]});
function fakeTimers(){let id=0;const timers=new Map();return {timers,setTimer:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimer:id=>timers.delete(id),fire(){for(const {f} of [...timers.values()])f();}};}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
test('source-derived ignition delays are measured in completed simulation ticks',()=>{
  const arm=html.slice(html.indexOf('  function armBarrel('),html.indexOf('  function detonateBarrel('));
  const splash=html.slice(html.indexOf('  function fuelSplash('),html.indexOf('  // Observe net material',html.indexOf('  function fuelSplash(')));
  const ctx={simTime:0,entities:new Map([[36,{id:36,explosive:true}],[35,{id:35,explosive:true}]])};
  const run=vm.runInNewContext(arm+splash+';({armBarrel,fuelSplash});',ctx),first=ctx.entities.get(36),second=ctx.entities.get(35);
  run.armBarrel(first,.06);const reach=run.fuelSplash(0,3.1).reach,delay=run.fuelSplash(reach,3.1).delay;
  assert.ok(Math.abs(reach-5.765)<1e-12);assert.equal(delay,.135);assert.equal(run.fuelSplash(reach+.001,3.1),null);
  let firstTick,lastTick;for(let tick=1;tick<=13;tick++){
    ctx.simTime+=1/60;
    if(first.fuse<=ctx.simTime&&!firstTick){firstTick=tick;ctx.entities.delete(36);run.armBarrel(second,delay);}
    if(second.fuse<=ctx.simTime){lastTick=tick;break;}
  }
  assert.equal(firstTick,4);assert.equal(lastTick,13);
  // Conditional on a qualifying impact and splash reach. This does not model
  // the actual throw trajectory, contact tick, neighbor motion or hosted speed.
  assert.match(html,/armBarrel\(e,\.06\)/);assert.match(html,/let fuelBudget=3,stressBudget=2/);
  assert.match(html,/e\.explosive&&e\.fuse<=simTime&&fuelBudget>0/);
});
test('fuel snapshot retains ticks, frame history, ignition IDs, timers and queue without mutation',()=>{
  const frames=[{t:100,simTime:.1,economy:{}},{t:200,simTime:.2,barrels:1,economy:{splashArmed:2,lastSplash:{ids:[35,37]}}},{t:300,simTime:.3,barrels:2,economy:{}}];
  const g={stats:frames[2],liveQueue:{commits:2,voxelPending:1,physicsBusy:true,errors:null},frames:()=>frames,ready:true,scenePreset:'district',scoreDiagnostics:{handsContract:{status:'ready'}},grab:null,cameraState:{mode:'orbit'},impactDiagnostics:{audit:{traces:[{entity:36,root:36,epoch:3,status:'armed',contactAt:150}]}},inspect:()=>[{id:35,explosive:true,fuse:.35,position:{x:1,y:2,z:3}},{id:37,explosive:true,fuse:Infinity},{id:1,explosive:false}]};
  const before=JSON.stringify({frames,stats:g.stats,queue:g.liveQueue});
  const read=vm.runInNewContext('('+api.readFuelWaitTrace.toString()+')',{window:{BREAKMASS:g},performance:{now:()=>320}});
  const start=read();assert.equal(start.frames.length,0);assert.equal(start.tick,18);
  const end=read(200);assert.equal(end.frames.length,2);assert.deepEqual(Array.from(end.frames[0].lastSplash.ids),[35,37]);
  assert.equal(end.fuels[0].armed,true);assert.equal(end.fuels[0].fuse,.35);assert.equal(end.fuels[1].armed,false);assert.equal(end.fuels[1].fuse,null);
  assert.equal(end.queue.commits,2);assert.equal(end.impacts[0].entity,36);assert.equal(end.history.truncated,false);
  assert.equal(read(50).history.truncated,true);assert.equal(JSON.stringify({frames,stats:g.stats,queue:g.liveQueue}),before);
});
test('successful unchanged action records both boundaries without reads inside the action',async()=>{
  const events=[],receipts=[],timers=fakeTimers();let n=0;
  const r=await api.traceFuelWait(async since=>{events.push(['read',since]);return snapshot(n++?33:20);},receipts,async()=>{events.push(['grab'],['throw'],['until']);},{...timers,now:()=>42});
  assert.deepEqual(events,[['read',null],['grab'],['throw'],['until'],['read',9999]]);
  assert.equal(r.passed,true);assert.equal(r.actionPassed,true);assert.equal(r.observedTicks,13);assert.equal(r.observedWallMs,6500);assert.equal(timers.timers.size,0);
});
test('original timeout identity survives final diagnostic capture',async()=>{
  const error=Error('timeout waiting for hand-triggered fuel chain'),receipts=[];let n=0;
  await assert.rejects(api.traceFuelWait(async()=>snapshot(n++?30:20),receipts,async()=>{throw error;}),e=>e===error);
  assert.equal(receipts[0].passed,false);assert.equal(receipts[0].actionPassed,false);assert.equal(receipts[0].observedTicks,10);assert.ok(receipts[0].end);
});
test('final diagnostic failure never replaces an existing gameplay failure',async()=>{
  const error=Error('chain failed'),receipts=[];let n=0;
  await assert.rejects(api.traceFuelWait(async()=>{if(n++)throw Error('capture broke');return snapshot();},receipts,async()=>{throw error;}),e=>e===error);
  assert.match(receipts[0].captureError,/capture broke/);assert.match(receipts[0].actionError,/chain failed/);
});
test('missing final evidence cannot make an otherwise successful action green',async()=>{
  const receipts=[];let n=0;
  await assert.rejects(api.traceFuelWait(async()=>n++?null:snapshot(),receipts,async()=>{}),/Malformed/);
  assert.equal(receipts[0].actionPassed,true);assert.equal(receipts[0].passed,false);
});
for(const end of [false,true])test((end?'final':'initial')+' stuck snapshot has a finite watchdog and no leaked timers',async()=>{
  const receipts=[],t=fakeTimers();let calls=0,actionCalls=0;
  const p=api.traceFuelWait(()=>{calls++;return end&&calls===1?snapshot():new Promise(()=>{});},receipts,async()=>{actionCalls++;},t);
  const rejected=assert.rejects(p,/snapshot timed out/);await flush();assert.equal(t.timers.size,1);assert.equal([...t.timers.values()][0].ms,5000);t.fire();await rejected;
  assert.equal(t.timers.size,0);assert.equal(actionCalls,end?1:0);assert.equal(receipts[0].passed,false);
});
test('invalid watchdog fails before reads or actions',async()=>{
  let calls=0;const receipts=[];await assert.rejects(api.traceFuelWait(()=>calls++,receipts,()=>calls++,{snapshotMs:Infinity}),/Invalid/);assert.equal(calls,0);
});
test('late snapshot resolution cannot turn a failed trace green',async()=>{
  let finish;const receipts=[],t=fakeTimers();const p=api.traceFuelWait(()=>new Promise(r=>{finish=r;}),receipts,async()=>{},t);
  const rejected=assert.rejects(p,/timed out/);await flush();t.fire();await rejected;const saved=JSON.stringify(receipts);finish(snapshot());await flush();assert.equal(JSON.stringify(receipts),saved);
});
test('real runner keeps exact acquisition and throw plus reviewed progress wait inside the trace',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../tools/blast-contract-check.mjs'),'utf8');
  const action=source.match(/await traceFuelWait\([\s\S]*?async start=>\{([\s\S]*?)\n  \}\);/)[1].trim().replace(/\r?\n\s*/g,'\n');
  assert.equal(action,"await click();check((await state()).grab?.id===36,'God Hand picks up original fuel drum',await state());\nawait tap('KeyX');\nawait waitForHandChain(()=>page.eval(`(${readHandChainProgress.toString()})()`),handChainWaits,start);");
  assert.match(source,/checks,samples,boundaries,fuelWaits,handChainWaits,logs:page.logs/);
  assert.match(source,/!handChain.score.missionTower&&handChain.score.handsContract.status==='ready'/);
  assert.match(source,/\(await state\(\)\).score.handsContract.status==='complete','hand chain followed by hand topple earns completion'/);
  assert.doesNotMatch(api.readFuelWaitTrace.toString(),/\.step\(|\.pause\(|\.reset\(|dispatchEvent|setTimeout|requestAnimationFrame/);
});
