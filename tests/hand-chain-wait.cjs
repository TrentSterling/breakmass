// Deterministic CPU observers only; no browser, physics stepping, input or audio.
const {test,before}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let api,trace;before(async()=>{api=await import('../tools/hand-chain-wait.mjs');trace=await import('../tools/fuel-wait-trace.mjs');});
const clone=x=>JSON.parse(JSON.stringify(x));
const start=()=>({at:1000,frameAt:999,simTime:3/60,tick:3,ready:true,scene:'district',
  score:{missionTower:false,shotCount:0,handsContract:{status:'ready'}},queue:{errors:null},
  published:{barrels:0,slings:0,lastGrabRelease:''},impacts:[],fuels:[{id:36,rootId:36,count:72,armed:false,fuse:null}]});
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
function harness({frameMs=20641.3/52,change=()=>{},read,initial=start()}={}){
  let wall=0,id=0,reads=0;const timers=new Map(),receipts=[];
  const setTimer=(fn,ms)=>{timers.set(++id,{fn,at:wall+ms});return id;},clearTimer=id=>timers.delete(id);
  const sample=()=>{
    const s=start();s.tick=3+Math.floor(wall/frameMs);s.simTime=s.tick/60;s.at=1000+wall;s.frameAt=999+Math.floor(wall/frameMs)*frameMs;
    s.published.slings=Number(s.tick>=5);s.published.lastGrabRelease=s.tick>=5?'magnet sling':'';
    s.published.barrels=s.tick>=67?2:s.tick>=58?1:0;
    if(s.tick>=54)s.impacts=[{id:12,epoch:5,entity:36,root:36,contactAt:1000+51*frameMs,accepted:true,reason:'fuel-crush',status:'armed'}];
    if(s.tick>=58)s.fuels=[];change(s,wall);return s;
  };
  const h={receipts,timers,get wall(){return wall;},get reads(){return reads;},sample,elapse:ms=>{wall+=ms;},
    options:{now:()=>wall,setTimer,clearTimer},
    run(options={}){return api.waitForHandChain(()=>{reads++;return read?read(h):sample();},receipts,initial,{...h.options,...options});},
    async settle(p){let done=false,error,value;p.then(v=>{value=v;done=true;},e=>{error=e;done=true;});await flush();
      for(let guard=0;!done&&guard<2000;guard++){
        assert.ok(timers.size,'observer must have a finite pending timer');const [key,t]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
        wall=t.at;timers.delete(key);t.fn();await flush();
      }
      assert.equal(done,true,'bounded scheduler exhausted');assert.equal(timers.size,0,'observer timers cleaned');return {error,value};
    }
  };return h;
}
test('observed slow loop completes the whole two-drum chain after the old wall deadline',async()=>{
  const h=harness(),{error,value}=await h.settle(h.run());assert.equal(error,undefined);
  const r=h.receipts[0];assert.equal(r.passed,true);assert.equal(r.start.tick,3);assert.equal(r.end.tick,67);
  assert.equal(r.elapsedTicks,64);assert.ok(r.elapsedWallMs>20000&&r.elapsedWallMs<90000);assert.equal(value.published.barrels,2);
  assert.equal(r.targetImpact.entity,36);assert.equal(r.targetImpact.root,36);assert.equal(r.end.fuels.length,0);
  assert.deepEqual(api.handChainBudget,{ticks:90,wallMs:90000,everyMs:250});
});
test('first armed fuse and first detonation alone cannot complete the chain',async()=>{
  const h=harness();await h.settle(h.run());const r=h.receipts[0];
  assert.ok(r.samples.some(s=>s.tick===54&&s.barrels===0));assert.ok(r.samples.some(s=>s.tick===58&&s.barrels===1));
  assert.equal(r.samples.find(s=>s.barrels>=2).tick,67);
});
test('recorded insufficient progress ends failed at the wall watchdog',async()=>{
  const h=harness({change:s=>{s.tick=Math.min(s.tick,55);s.simTime=s.tick/60;s.published.barrels=0;s.fuels=start().fuels;}});
  const {error}=await h.settle(h.run());assert.match(error.message,/wall watchdog/);assert.equal(h.receipts[0].passed,false);assert.equal(h.receipts[0].elapsedTicks,52);assert.equal(h.wall,90000);
});
test('stalled real-loop clock cannot pass by elapsed wall time',async()=>{
  const h=harness({change:s=>Object.assign(s,start())});const {error}=await h.settle(h.run());
  assert.match(error.message,/wall watchdog/);assert.equal(h.receipts[0].elapsedTicks,0);assert.equal(h.wall,90000);
});
for(const [name,change] of [
  ['only one detonation',s=>s.published.barrels=Math.min(s.published.barrels,1)],
  ['unrelated body',s=>s.impacts.forEach(t=>t.entity=35)],
  ['wrong root',s=>s.impacts.forEach(t=>t.root=35)],
  ['pre-action contact',s=>s.impacts.forEach(t=>t.contactAt=999)],
  ['rejected impact',s=>s.impacts.forEach(t=>t.accepted=false)],
  ['ordinary fracture',s=>s.impacts.forEach(t=>t.status='drawn')],
  ['non-fuel impact',s=>s.impacts.forEach(t=>t.reason='impact')],
  ['original drum still present',s=>s.fuels=start().fuels],
  ['missing sling',s=>s.published.slings=0],
  ['wrong release',s=>s.published.lastGrabRelease='let go']
])test('wrong chain cannot pass: '+name,async()=>{
  const h=harness({change}),{error}=await h.settle(h.run());assert.match(error.message,/simulation budget/);
  assert.equal(h.receipts[0].passed,false);assert.equal(h.receipts[0].elapsedTicks,90);
});
test('previous impact cannot attribute later unrelated detonations',async()=>{
  const initial=start();initial.impacts=[{id:12,epoch:5}];
  const h=harness({initial,change:s=>{if(!s.impacts.length)s.impacts=[{id:12,epoch:5}];}});
  const {error}=await h.settle(h.run());assert.match(error.message,/simulation budget/);assert.equal(h.receipts[0].targetImpact,undefined);
});
for(const [name,change,pattern] of [
  ['lost eligibility',s=>s.score.handsContract.status='failed',/eligibility/],
  ['premature tank success',s=>s.score.missionTower=true,/eligibility/],
  ['tool shot',s=>s.score.shotCount=1,/eligibility/],
  ['runtime stopped',s=>s.ready=false,/not ready/],
  ['scene change',s=>s.scene='foundry',/not ready/],
  ['worker failure',s=>s.queue.errors='voxel worker failed',/voxel worker failed/],
  ['invalid tick',s=>s.tick=NaN,/Malformed/],
  ['malformed target list',s=>s.fuels=[{}],/Malformed/],
  ['invalid simulation time',s=>s.simTime=Infinity,/Malformed/],
  ['inconsistent clock',s=>s.simTime+=.5,/Malformed/],
  ['clock rollback',s=>{s.tick=2;s.simTime=2/60;},/backwards/],
  ['generation change',s=>{if(s.tick>=55)s.impacts[0].epoch=6;},/generation/]
])test(name+' fails before apparent success',async()=>{
  const h=harness({change}),{error}=await h.settle(h.run());assert.match(error.message,pattern);assert.equal(h.receipts[0].passed,false);
});
test('completion exactly at the simulation budget can pass',async()=>{
  const h=harness({change:s=>{if(s.tick<93)s.published.barrels=Math.min(s.published.barrels,1);}});
  const {error}=await h.settle(h.run());assert.equal(error,undefined);assert.equal(h.receipts[0].elapsedTicks,90);
});
test('completion observed after the tick budget fails',async()=>{
  const h=harness({change:(s,wall)=>{if(wall>0){s.tick=94;s.simTime=94/60;s.published={barrels:2,slings:1,lastGrabRelease:'magnet sling'};s.fuels=[];s.impacts=[{id:1,epoch:5,entity:36,root:36,contactAt:1100,accepted:true,reason:'fuel-crush',status:'armed'}];}}});
  const {error}=await h.settle(h.run());assert.match(error.message,/budget exceeded/);assert.equal(h.receipts[0].passed,false);
});
test('a stuck CDP read is bounded and its late result cannot change failure',async()=>{
  let finish;const h=harness({read:()=>new Promise(resolve=>{finish=resolve;})});
  const {error}=await h.settle(h.run());assert.match(error.message,/wall watchdog/);assert.equal(h.reads,1);
  const saved=JSON.stringify(h.receipts);finish(h.sample());await flush();assert.equal(JSON.stringify(h.receipts),saved);assert.equal(h.timers.size,0);
});
test('read rejection preserves the original failure and stops polling',async()=>{
  const failure=Error('CDP disconnected'),h=harness({read:()=>Promise.reject(failure)});
  const {error}=await h.settle(h.run());assert.equal(error,failure);assert.equal(h.reads,1);assert.equal(h.receipts[0].passed,false);
});
test('late successful read is rejected even before watchdog callback delivery',async()=>{
  const h=harness({read:h=>{h.elapse(90001);return h.sample();}});
  const {error}=await h.settle(h.run());assert.match(error.message,/wall watchdog/);assert.equal(h.receipts[0].passed,false);assert.equal(h.reads,1);
});
for(const options of [{ticks:Infinity},{ticks:0},{ticks:1.5},{wallMs:Infinity},{wallMs:0},{everyMs:0}])test('invalid finite budget rejected '+JSON.stringify(options),async()=>{
  const h=harness(),{error}=await h.settle(h.run(options));assert.match(error.message,/Invalid/);assert.equal(h.reads,0);
});
for(const change of [s=>s.published.barrels=2,s=>s.published.slings=1,s=>s.fuels=[],s=>{s.fuels[0].armed=true;s.fuels[0].fuse=.2;}])test('stale initial fixture is rejected before polling',async()=>{
  const initial=start();change(initial);const h=harness({initial}),{error}=await h.settle(h.run());assert.match(error.message,/fresh original/);assert.equal(h.reads,0);
});
test('snapshot reader observes published simulation and target identity without mutation',()=>{
  const g={stats:{t:900,simTime:.5,barrels:2,slings:1,lastGrabRelease:'magnet sling'},ready:true,scenePreset:'district',
    scoreDiagnostics:start().score,liveQueue:{errors:null},impactDiagnostics:{audit:{traces:[{id:12,epoch:5,entity:36}]}},
    inspect:()=>[{id:36,rootId:36,count:72,explosive:true},{id:35,explosive:true},{id:1,explosive:false}]};
  const saved=JSON.stringify(g),read=vm.runInNewContext('('+api.readHandChainProgress.toString()+')',{window:{BREAKMASS:g},performance:{now:()=>1000}});
  const s=read();assert.equal(s.tick,30);assert.equal(s.published.barrels,2);assert.deepEqual(clone(s.fuels),[{id:36,rootId:36,count:72}]);assert.equal(JSON.stringify(g),saved);
  assert.doesNotMatch(api.readHandChainProgress.toString()+api.waitForHandChain.toString(),/\.step\(|\.pause\(|\.reset\(|dispatchEvent|requestAnimationFrame|\.setBodyMotion/);
});
test('progress failure keeps both full diagnostic boundaries and original failure identity',async()=>{
  const h=harness({change:s=>s.published.barrels=0}),receipts=[];let reads=0,original;
  const full=s=>({...s,frames:[]});
  const p=trace.traceFuelWait(async()=>full(reads++?h.sample():start()),receipts,async baseline=>{
    try{await api.waitForHandChain(()=>h.sample(),h.receipts,baseline,h.options);}catch(error){original=error;throw error;}
  },h.options);
  const {error}=await h.settle(p);assert.equal(error,original);assert.equal(receipts[0].passed,false);assert.equal(receipts[0].actionPassed,false);assert.ok(receipts[0].start);assert.ok(receipts[0].end);assert.equal(reads,2);
});
