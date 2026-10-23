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
