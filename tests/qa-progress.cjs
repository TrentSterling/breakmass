// CPU/mock coverage of the exact opt-in QA helpers. No browser or physics runs.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/\r\n/g,'\n');
const qaStart=html.indexOf('(function installGameplayQA(){');
const qa=html.slice(qaStart,html.indexOf('</script>',qaStart));
function between(start,end){const a=qa.indexOf(start),b=qa.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return qa.slice(a,b);}
const helpers=between('  const simulationBudgets=','  async function run(');
const wrapper=between('    async function physicsWait(','    async function test(');
const testFunction=between('    async function test(','    try{\n      say(');
test('the complete opt-in gameplay QA script parses',()=>{new vm.Script(qa);});
function harness({frameMs=500,advance=true,update=()=>{}}={}){
  const state={wall:0,tick:100,epoch:1,ready:true,error:null,cancelled:false,sleeps:0};
  const context={performance:{now:()=>state.wall},sleep:async ms=>{state.wall+=ms;state.sleeps++;if(advance)state.tick=100+Math.floor(state.wall/frameMs);update(state);}};
  Object.defineProperty(context,'cancelled',{get:()=>state.cancelled});
  const api=vm.runInNewContext(helpers+';({waitForSimulation,targetGroundFracture,simulationBudgets});',context);
  const receipt={},read=()=>({tick:state.tick,simTime:state.tick/60,frameAt:state.wall,epoch:state.epoch,ready:state.ready,error:state.error});
  return {state,context,api,receipt,read,wait:(predicate,budget=api.simulationBudgets.twist)=>api.waitForSimulation(predicate,'case',budget,read,receipt)};
}
for(const [name,needed,frameMs,oldLimit] of [['twist',33,500,15000],['rain',37,450,12000]])test(name+' completes via observed loop progress after its old wall deadline',async()=>{
  const h=harness({frameMs});await h.wait(()=>h.state.tick>=100+needed,h.api.simulationBudgets[name]);
  assert.equal(h.receipt.passed,true);assert.equal(h.receipt.elapsedTicks,needed);assert.ok(h.receipt.elapsedWallMs>oldLimit);
  assert.equal(h.receipt.start.tick,100);assert.equal(h.receipt.end.tick,100+needed);assert.ok(h.state.sleeps>0);
});
test('insufficient progress cannot pass just because time elapsed',async()=>{
  const h=harness({update:s=>s.tick=Math.min(s.tick,120)});
  await assert.rejects(h.wait(()=>h.state.tick>=133),/wall watchdog/);
  assert.equal(h.receipt.passed,false);assert.equal(h.receipt.elapsedTicks,20);assert.equal(h.receipt.elapsedWallMs,60000);
});
test('a stalled simulation reaches the finite wall watchdog',async()=>{
  const h=harness({advance:false});await assert.rejects(h.wait(()=>false),/wall watchdog/);
  assert.equal(h.receipt.end.tick,h.receipt.start.tick);assert.equal(h.receipt.passed,false);assert.equal(h.state.sleeps,2000);
});
test('progress without the requested event fails at the tick budget',async()=>{
  const h=harness();await assert.rejects(h.wait(()=>false),/simulation budget exhausted/);
  assert.equal(h.receipt.elapsedTicks,60);assert.equal(h.receipt.passed,false);assert.equal(h.receipt.elapsedWallMs,30000);
});
test('completion at the tick boundary remains valid',async()=>{
  const h=harness();await h.wait(()=>h.state.tick===160);assert.equal(h.receipt.passed,true);
});
test('completion first observed after the tick budget is rejected',async()=>{
  const h=harness({update:s=>s.tick=161});await assert.rejects(h.wait(()=>h.state.tick===161),/simulation budget/);assert.equal(h.receipt.passed,false);
});
test('late wall completion cannot turn the timeout green',async()=>{
  const h=harness({advance:false,update:s=>{s.wall=60001;s.tick=133;}});
  await assert.rejects(h.wait(()=>h.state.tick===133),/wall watchdog/);assert.equal(h.receipt.passed,false);
});
test('a predicate that returns after the wall limit cannot pass',async()=>{
  const h=harness();await assert.rejects(h.wait(()=>{h.state.wall=60001;return true;}),/wall watchdog/);assert.equal(h.receipt.passed,false);
});
for(const [name,update,pattern] of [
  ['reset epoch',s=>s.epoch++,/epoch/],['clock rollback',s=>s.tick=99,/backwards/],
  ['invalid clock',s=>s.tick=NaN,/clock/],['runtime error',s=>s.error='worker failed',/worker failed/],
  ['runtime stopped',s=>s.ready=false,/not ready/],['cancelled',s=>s.cancelled=true,/cancelled/]
])test(name+' fails before an apparent completion is accepted',async()=>{
  const h=harness({advance:false,update});await assert.rejects(h.wait(()=>h.state.sleeps>0),pattern);assert.equal(h.receipt.passed,false);assert.ok(h.receipt.error);
});
test('predicate exceptions preserve a failed receipt and stop polling',async()=>{
  const h=harness();await assert.rejects(h.wait(()=>{throw Error('bad predicate');}),/bad predicate/);assert.equal(h.state.sleeps,0);assert.equal(h.receipt.passed,false);
});
test('non-finite budgets fail closed',async()=>{
  const h=harness();await assert.rejects(h.wait(()=>true,{ticks:Infinity,wallMs:60000}),/Invalid/);assert.equal(h.receipt.passed,false);
});

const target={entity:1000001,root:57,afterTraceId:10,launchedAt:1000};
const trace={id:11,epoch:4,entity:1000001,root:57,contactAt:1100,otherId:'ground',accepted:true,status:'drawn',commitAt:1150,visibleAt:1200,fragments:3};
for(const [name,change] of [
  ['unrelated root',{root:18}],['another body of the same root',{entity:1000002}],['old trace',{id:10}],
  ['pre-launch contact',{contactAt:999}],['building contact',{otherId:1}],['rejected hit',{accepted:false}],
  ['uncommitted request',{status:'requested',commitAt:undefined,visibleAt:undefined}],
  ['undrawn commit',{status:'committed',visibleAt:undefined}],['missing commit',{commitAt:undefined}],
  ['missing draw',{visibleAt:undefined}],['zero fragments',{fragments:0}],['fuel ignition',{status:'armed'}]
])test('slam attribution rejects '+name,()=>{
  const h=harness();assert.equal(h.api.targetGroundFracture([{...trace,...change}],target),undefined);
});
test('unrelated fractures cannot complete the slam wait',async()=>{
  const h=harness();const unrelated=[{...trace,root:18},{...trace,entity:1000002}];
  await assert.rejects(h.wait(()=>h.api.targetGroundFracture(unrelated,target),h.api.simulationBudgets.slam),/simulation budget/);
  assert.equal(h.receipt.elapsedTicks,120);assert.equal(h.receipt.passed,false);
});
test('a new committed and drawn target ground fracture completes with its identity',async()=>{
  const h=harness({frameMs:700});const result=await h.wait(()=>h.state.tick>=160&&h.api.targetGroundFracture([trace],target),h.api.simulationBudgets.slam);
  assert.equal(result,trace);assert.equal(result.entity,target.entity);assert.equal(result.root,target.root);assert.equal(h.receipt.passed,true);
});
test('physicsWait keeps failure diagnostics on the test entry',async()=>{
  const h=harness({advance:false}),item={};const snapshots=[];
  const context={...h.context,activeTest:item,qaEpoch:2,waitForSimulation:h.api.waitForSimulation,F:{ready:true,get stats(){return {simTime:h.state.tick/60,t:h.state.wall};},liveQueue:{errors:null}}};
  const run=vm.runInNewContext(wrapper+';physicsWait;',context);
  await assert.rejects(run(()=>false,'stalled',h.api.simulationBudgets.rain,()=>{const value={fired:7,pending:3};snapshots.push(value);return value;}),/watchdog/);
  assert.equal(item.waits.length,1);assert.equal(item.waits[0].passed,false);assert.equal(item.waits[0].start.epoch,2);
  assert.equal(item.waits[0].startState,snapshots[0]);assert.equal(item.waits[0].endState,snapshots[1]);
});
test('the actual test wrapper retains rejection as a failed case and releases input',async()=>{
  const report={tests:[]},calls=[];const run=vm.runInNewContext(testFunction+';test;',{
    cancelled:false,say:()=>{},performance:{now:()=>50},report,activeTest:null,
    F:{liveQueue:{errors:null},stopForInterface:()=>calls.push('stop')},release:()=>calls.push('release')});
  await run('failure',async()=>{throw Error('watchdog');});assert.equal(report.tests[0].passed,false);assert.match(report.tests[0].error,/watchdog/);assert.deepEqual(calls,['release','stop']);
});
test('rain wait failure releases the trigger and clears pending rain without swallowing failure',async()=>{
  const code=between('        try{await press(50);await physicsWait','        await quiet(30000);');
  const calls=[];const run=vm.runInNewContext('(async()=>{'+code+'})',{press:async()=>calls.push('press'),physicsWait:async()=>{throw Error('rain failed');},F:{stats:{rainFired:7},clearRain:()=>calls.push('clear')},fired:0,simulationBudgets:{rain:{}},release:()=>calls.push('release')});
  await assert.rejects(run(),/rain failed/);assert.deepEqual(calls,['press','release','clear']);
});
test('twist wait failure always releases the torsion override',async()=>{
  const code=between('        try{await physicsWait(()=>F.pullDiagnostics','        const chargeMs=');const calls=[];
  const run=vm.runInNewContext('(async()=>{'+code+'})',{physicsWait:async()=>{throw Error('twist failed');},simulationBudgets:{twist:{}},F:{setTwist:n=>calls.push(n)}});
  await assert.rejects(run(),/twist failed/);assert.deepEqual(calls,[0]);
});
test('slam preserves the global commit condition and all post-twist success assertions',()=>{
  assert.match(qa,/impactShatters>breaks&&targetGroundFracture/);
  for(const condition of ["F.grab&&!F.grab.anchored","state.twistRips>0","Math.abs(angularVelocity.y)>=.9","F.stats.rainFired-fired>=10"])assert.ok(qa.includes(condition),condition);
  assert.doesNotMatch(helpers,/physicsStep|world\.step|\.injectPhysics|\.pause\(|requestAnimationFrame/);
});

// Execute the authored district generator, not a hand-written list of obstacles.
const sceneContext=vm.createContext({});
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
for(const marker of ['function makeArena()','function voxelBuilder()','function polishDistrict('])vm.runInContext(scripts.find(s=>s.includes(marker)),sceneContext);
const authored=vm.runInContext('buildPlayableScene("district")',sceneContext);
const identity={x:0,y:0,z:0,w:1};
const objects=authored.volumes.map((v,i)=>({id:v.id||i+1,name:v.name,rootId:v.id||i+1,dims:v.dims,position:{x:v.origin[0],y:v.origin[1],z:v.origin[2]},rotation:identity}));
const released={id:1000001,rootId:57,dims:[40,83,36],position:{x:8,y:30,z:7},rotation:identity};
const fixtureApi=vm.runInNewContext(helpers+';({groundSlamFixture,slamBodyBounds});');
const plain=x=>JSON.parse(JSON.stringify(x));
const fixture=(body=released,others=objects,position)=>fixtureApi.groundSlamFixture(body,[...others,body],authored.preset,position);
test('old Northstar launch is obstructed by its own authored base',()=>{
  const f=fixture(released,objects,[8,30,7]);assert.equal(f.clear,false);assert.ok(f.blockers.some(o=>o.id===57));
});
test('central-crossing launch and full sweep clear all 181 authored bodies',()=>{
  const f=fixture();assert.equal(objects.length,181);assert.equal(f.checked,181);assert.equal(f.clear,true);assert.deepEqual(plain(f.blockers),[]);
  assert.deepEqual(plain(f.position),[-5,30,-5]);assert.deepEqual(plain(f.velocity),[0,-28,0]);
  assert.deepEqual(plain(f.launch),{min:[-5,30,-5],max:[5,50.75,4]});
  assert.deepEqual(plain(f.sweep),{min:[-6,0,-6],max:[6,51.75,5]});
  assert.deepEqual(plain(f.ground),{min:[-56,0,-52],max:[56,0,52]});assert.equal(f.margin,1);
});
test('clearance covers the full original tower as well as the observed released section',()=>{
  const f=fixture({...released,dims:[40,87,36]});assert.equal(f.clear,true);assert.equal(f.sweep.max[1],52.75);
});
for(const [name,position,anchored] of [['remaining base',[0,0,0],true],['mid-air debris',[0,15,0],false],['overhead beam',[0,45,0],true],['one-metre safety margin',[5.5,0,0],false]])test('ground-slam fixture rejects '+name+' anywhere in the sweep',()=>{
  const obstacle={id:999,rootId:999,name,dims:[1,1,1],rotation:identity,position:{x:position[0],y:position[1],z:position[2]},anchored};
  const f=fixture(released,[...objects,obstacle]);assert.equal(f.clear,false);assert.ok(f.blockers.some(o=>o.id===999));
});
test('rotated body bounds include all eight corners around its voxel origin',()=>{
  const body={...released,rotation:{x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2}};
  const b=fixtureApi.slamBodyBounds(body,[-5,30,-5]);
  for(const [actual,expected] of [[b.min,[-5,30,-15]],[b.max,[4,50.75,-5]]])actual.forEach((n,i)=>assert.ok(Math.abs(n-expected[i])<1e-10));
  assert.equal(fixture(body,[{...released,id:999,position:{x:0,y:10,z:-12},dims:[1,1,1]}]).clear,false);
});
test('rotated obstacles cannot hide outside their unrotated origin box',()=>{
  const obstacle={...released,id:999,dims:[48,4,4],position:{x:10,y:10,z:0},rotation:{x:0,y:1,z:0,w:0}};
  const f=fixture(released,[obstacle]);assert.equal(f.clear,false);assert.equal(f.blockers[0].id,999);
});
test('a sweep extending beyond the real pad fails even when no object blocks it',()=>{
  const f=fixture(released,[],[50,30,0]);assert.equal(f.onPad,false);assert.equal(f.clear,false);
});
test('a launch initially intersecting ground is rejected',()=>{assert.equal(fixture(released,[],[-5,-1,-5]).clear,false);});
for(const [name,change] of [['nonfinite position',{position:{x:NaN,y:0,z:0}}],['missing rotation',{rotation:null}],['nonunit rotation',{rotation:{x:0,y:0,z:0,w:2}}],['invalid extent',{dims:[40,Infinity,36]}]])test('clearance fails closed for '+name,()=>{
  assert.throws(()=>fixture(released,[{...released,id:999,...change}]),/Invalid ground-slam fixture pose/);
});
test('fixture records clearance before motion without changing attribution or budgets',()=>{
  const slam=between("      await test('Tall building yank", "      await test('God Hand twist");
  assert.ok(slam.indexOf('groundSlamFixture(body,F.inspect(),SCENE_PRESETS[F.scenePreset])')<slam.indexOf('F.setBodyMotion'));
  assert.ok(slam.indexOf('assert(fixture.clear')<slam.indexOf('F.setBodyMotion'));
  assert.match(slam,/activeTest\.fixture=fixture/);assert.match(slam,/position:fixture\.position,velocity:fixture\.velocity,fixture/);
  assert.match(slam,/entity:body\.id,root:target\.rootId/);assert.match(slam,/impactShatters>breaks&&targetGroundFracture/);
  assert.deepEqual(plain(harness().api.simulationBudgets),{twist:{ticks:60,wallMs:60000},rain:{ticks:60,wallMs:60000},slam:{ticks:120,wallMs:120000}});
  assert.doesNotMatch(slam,/prepareImpactTest|removeEntity|\.edit\(|\.blast\(|physicsStep|world\.step/);
  assert.match(html,/const S=\.25,DT=1\/60/);assert.match(html,/setBodyMotion:[^\n]*setAngvel\(V\(\),true\)/);
});
