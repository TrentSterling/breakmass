const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {current,between,factory,harness,replay}=require('./released-impact-harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
test('released Northstar survives pressure and requests its own ground fracture',()=>{
  const {h,result}=replay();assert.equal(result.beforeContact.lightweight,false);assert.equal(result.beforeContact.type,'Dynamic');
  assert.deepEqual(result.targetDemotions,[]);assert.deepEqual(result.requestedTargets,[{entity:1000001,root:57}]);
  assert.deepEqual(plain(result.impactTraces),[{entity:1000001,root:57,otherId:'ground',accepted:true,status:'requested'}]);
  const events=h.c.rubblePolicy.releaseReport().history.filter(x=>x.entity===1000001);
  assert.equal(events[0].tick,26);assert.equal(events[1].tick,86);assert.equal(events[1].reason,'impact');
  assert.equal(h.c.economy.lightened,1,'ordinary rubble still pays for the budget');
});
test('held and pending bodies retain their existing demotion protection',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};assert.equal(h.api.lightenRubble(e),false);
  h.c.grab=null;e.pending=true;assert.equal(h.api.lightenRubble(e),false);
});
test('fragment admission evicts ordinary rubble instead of the released weapon',()=>{
  const h=harness(),e=h.entity(1,{count:100}),old=h.entity(2);h.c.adaptiveBudget.active=2;
  h.c.grab={entity:e};h.api.releaseGrab();h.fragmentPressure();assert.equal(e.lightweight,false);assert.equal(old.lightweight,true);
  assert.equal(h.c.rubblePolicy.releaseReport().history.at(-1).reason,'fragment-admission');
});
test('reactivating another piece does not steal a released body slot',()=>{
  const h=harness(),e=h.entity(1,{count:100}),old=h.entity(2),light=h.entity(3,{lightweight:true});
  h.c.adaptiveBudget.active=2;h.c.grab={entity:e};h.api.releaseGrab();h.api.activateRubble(light);
  assert.equal(e.lightweight,false);assert.equal(old.lightweight,true);assert.equal(light.lightweight,false);
  assert.equal(h.c.rubblePolicy.releaseReport().history.at(-1).reason,'reactivation');
});
test('emergency collider pressure preserves dynamic contact damage while reducing shapes',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();const predicted=h.colliderPressure(e);
  assert.equal(e.lightweight,false);assert.equal(e.state.type,'Dynamic');assert.equal(e.compactCollision,true);assert.equal(e.colliders,1);
  assert.ok(predicted<=14000-64);assert.equal(h.metadata.length,0,'no damageable=false message');
  h.c.simTime=1;h.groundContact(e);assert.equal(h.requests[0].entity,e.id);
});
test('ordinary rubble retains its original collider-pressure downgrade',()=>{
  const h=harness(),e=h.entity(1);h.colliderPressure(e);assert.equal(e.lightweight,true);assert.equal(e.state.type,'Fixed');
  assert.equal(h.metadata.at(-1).damageable,false);assert.equal(h.c.rubblePolicy.releaseReport().history.at(-1).reason,'collider-pressure');
});
test('accepted target impact releases protection but pending fracture cannot be demoted',()=>{
  const {h}=replay(),e=h.c.entities.get(1000001);assert.equal(h.c.rubblePolicy.releasedProtected(e.id,h.c.simTime),false);
  assert.equal(e.pending,true);assert.equal(h.api.lightenRubble(e,'active-rebalance'),false);
  e.pending=false;assert.equal(h.api.lightenRubble(e,'active-rebalance'),true);
  const r=h.c.rubblePolicy.releaseReport().history.at(-1);assert.equal(r.entity,e.id);assert.equal(r.root,57);assert.equal(r.tick,86);assert.equal(r.reason,'active-rebalance');
});
test('an unrelated impact cannot resolve the protected target',()=>{
  const h=harness(),e=h.entity(1000001,{rootId:57}),other=h.entity(18);h.c.grab={entity:e};h.api.releaseGrab();
  h.c.simTime=1;h.groundContact(other);assert.equal(h.requests[0].entity,18);assert.equal(h.c.rubblePolicy.releasedProtected(e.id,1),true);
  assert.equal(h.api.lightenRubble(e),false);
});
test('another body with the same root cannot resolve this release',()=>{
  const h=harness(),e=h.entity(1000001,{rootId:57}),other=h.entity(1000002,{rootId:57});h.c.grab={entity:e};h.api.releaseGrab();
  h.c.simTime=1;h.groundContact(other);assert.equal(h.c.rubblePolicy.releasedProtected(e.id,1),true);
});
for(const rejected of ['slow-contact','edit-rejected'])test(rejected+' retains protection for a later real impact',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();h.c.simTime=1;
  if(rejected==='slow-contact')e.state.v.set(0,-1,0);else h.c.rejectEdit=true;
  h.groundContact(e);assert.equal(h.requests.length,0);assert.equal(h.c.rubblePolicy.releasedProtected(e.id,1),true);
});
test('six simulated seconds expire protection even when still moving',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();const until=h.c.simTime+6;
  h.c.simTime=until-1/60;assert.equal(h.api.lightenRubble(e),false);
  h.c.simTime=until;assert.equal(h.api.lightenRubble(e,'active-rebalance'),true);
  assert.equal(h.c.rubblePolicy.releaseReport().active.length,0);assert.equal(h.c.rubblePolicy.releaseReport().history.at(-2).reason,'expired');
});
test('paused simulation time does not consume the impact opportunity',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();
  for(let i=0;i<500;i++)assert.equal(h.api.lightenRubble(e),false);
  assert.equal(h.c.rubblePolicy.releaseReport().active.length,1);
});
test('sleeping after the short command grace resolves a gentle placement',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();e.state.sleeping=true;
  h.c.simTime+=.1;h.c.rubblePolicy.updateReleased(h.c.entities,h.c.simTime);assert.equal(h.api.lightenRubble(e),false);
  h.c.simTime+=.2;h.c.rubblePolicy.updateReleased(h.c.entities,h.c.simTime);assert.equal(h.api.lightenRubble(e),true);
  assert.equal(h.c.rubblePolicy.releaseReport().history.at(-2).reason,'sleeping');
});
test('a sleeping pending edit is not safe resolution',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();e.state.sleeping=true;e.pending=true;h.c.simTime=1;
  h.c.rubblePolicy.updateReleased(h.c.entities,1);assert.equal(h.c.rubblePolicy.releasedProtected(e.id,1),true);
});
test('ordinary stationary air state is not treated as safe while awake',()=>{
  const h=harness(),e=h.entity(1);e.state.v.set(0,0,0);h.c.grab={entity:e};h.api.releaseGrab();h.c.simTime=1;
  h.c.rubblePolicy.updateReleased(h.c.entities,1);assert.equal(h.api.lightenRubble(e),false);
});
test('capacity is four recent bodies with explicit oldest-release resolution',()=>{
  const h=harness();for(let i=1;i<=5;i++){h.c.grab={entity:h.entity(i)};h.api.releaseGrab();}
  const r=h.c.rubblePolicy.releaseReport();assert.deepEqual(plain(r.active.map(x=>x.entity)),[2,3,4,5]);
  assert.equal(r.history.find(x=>x.reason==='capacity').entity,1);assert.equal(h.api.lightenRubble(h.c.entities.get(1)),true);
});
test('duplicate release cannot allocate a second protection slot',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();h.api.releaseGrab();assert.equal(h.c.rubblePolicy.releaseReport().active.length,1);
});
test('the actual sling protects before its queued impulse and preserves its strength',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e,local:h.c.V(1,2,3)};
  Object.assign(h.c,{paused:false,slings:0,pointerRay:()=>({direction:h.c.V(0,0,-1)}),input:{reset:()=>{}},sound:()=>{},addShake:()=>{},toast:()=>{}});
  let impulse;e.body.applyImpulseAtPoint=(v,_p,wake)=>{assert.equal(h.c.rubblePolicy.releasedProtected(1,h.c.simTime),true);impulse=v.toArray();assert.equal(wake,true);};
  vm.runInContext(between(h.html,'  function throwGrab(){','  function gravityPulse(){')+';throwGrab();',h.c);
  assert.deepEqual(impulse,[0,0,-421225*18]);assert.equal(h.c.grab,null);assert.equal(h.c.slings,1);
});
test('actual reacquisition replaces release protection with existing grip ownership',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();
  Object.assign(h.c,{grabSequence:1,sound:()=>{},attachmentCandidate:x=>x,attachments:{pick:()=>({point:[1,2,3],cell:[1,2,3]})}});
  h.c.hit={entity:e,point:h.c.V(8,30,7),normal:h.c.V(0,1,0),distance:12};
  vm.runInContext(between(h.html,'  function startGrab(hit){','  function releaseGrab(')+';startGrab(hit);',h.c);
  assert.equal(h.c.grab.entity,e);assert.equal(h.c.rubblePolicy.releaseReport().active.length,0);assert.equal(h.api.lightenRubble(e),false);
});
test('exhausted active slots still admit new fragments as lightweight rubble',()=>{
  const h=harness();for(let i=1;i<=4;i++){h.c.grab={entity:h.entity(i)};h.api.releaseGrab();}
  h.c.adaptiveBudget.active=4;h.c.active=()=>[...h.c.entities.values()].filter(e=>!e.lightweight).length;
  h.c.protection=new Set();h.c.wantedGrip=null;h.c.requiredFuel=null;h.c.structural=[{id:10,count:100},{id:11,count:200}];
  vm.runInContext(between(h.html,'    let rescued=false;const activeTarget=','    let replaced='),h.c);
  assert.ok(h.c.structural.every(x=>x.lightweight));assert.ok([...h.c.entities.values()].every(x=>!x.lightweight));
});
for(const option of [{anchored:true},{lightweight:true},{kind:'chip'},{explosive:true}])test('ineligible release '+JSON.stringify(option)+' does not consume a slot',()=>{
  const h=harness(),e=h.entity(1,option);h.c.grab={entity:e};h.api.releaseGrab();assert.equal(h.c.rubblePolicy.releaseReport().active.length,0);
});
test('new fracture children have no inherited exemption',()=>{
  const h=harness(),e=h.entity(1,{rootId:57});h.c.grab={entity:e};h.api.releaseGrab();const child=h.entity(2,{rootId:57});
  assert.equal(h.api.lightenRubble(child,'fragment-admission'),true);assert.equal(h.api.lightenRubble(e),false);
});
test('removed objects and rebuild clear bounded state',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();h.c.entities.delete(e.id);h.c.rubblePolicy.updateReleased(h.c.entities,1);
  assert.equal(h.c.rubblePolicy.releaseReport().active.length,0);assert.equal(h.c.rubblePolicy.releaseReport().history.at(-1).reason,'removed');
  h.c.rubblePolicy.resetReleased();assert.equal(h.c.rubblePolicy.releaseReport().history.length,0);
  // Execute the actual reset line around its release/reset ordering.
  const source=h.html.match(/    epoch\+\+;const thisEpoch=epoch;[^\n]+/)[0];h.c.epoch=0;h.c.ready=true;h.c.held=true;h.c.worker=null;h.c.lookCapture=null;h.c.input=null;h.c.physics=null;
  h.c.grab={entity:h.entity(3)};vm.runInContext(source,h.c);assert.equal(h.c.rubblePolicy.releaseReport().active.length,0);assert.equal(h.c.rubblePolicy.releaseReport().history.length,0);
});
test('actual entity removal forgets its release record before deleting the body',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.c.sceneIndex={remove:()=>{}};h.c.fuelEntities=new Map();h.c.scene={remove:()=>{}};h.c.world.removeRigidBody=()=>{};h.c.worker={postMessage:()=>{}};
  vm.runInContext(between(h.html,'  function removeEntity(','  function snapshotBody(')+';removeEntity(entities.get(1));',h.c);
  assert.equal(h.c.entities.size,0);assert.equal(h.c.rubblePolicy.releaseReport().active.length,0);
});
test('diagnostics retain no entity objects and cannot mutate policy state',()=>{
  const h=harness(),e=h.entity(1);h.c.grab={entity:e};h.api.releaseGrab();const report=h.c.rubblePolicy.releaseReport();report.active[0].until=0;report.history.length=0;
  assert.equal(h.c.rubblePolicy.releasedProtected(1,1),true);assert.equal(h.c.rubblePolicy.releaseReport().history.length,1);
});
test('10,000 release cycles stay bounded and fully expire',()=>{
  const p=factory(current(),'createRubblePolicy');let peak=0;
  for(let id=1;id<=10000;id++){p.protectReleased({id,rootId:id,kind:'structure'},id/100);const r=p.releaseReport();peak=Math.max(peak,r.active.length);assert.ok(r.history.length<=64);}
  assert.equal(peak,4);p.updateReleased(new Map(),107);assert.equal(p.releaseReport().active.length,0);assert.ok(p.releaseReport().history.length<=64);p.resetReleased();assert.equal(p.releaseReport().history.length,0);
});
test('reset epochs and invalid time cannot retain permanent protection',()=>{
  for(const now of [-1,NaN,Infinity]){const p=factory(current(),'createRubblePolicy');p.protectReleased({id:1,kind:'structure'},1);assert.equal(p.releasedProtected(1,now),false);assert.equal(p.releaseReport().active.length,0);}
});
test('impact policies, budgets and QA success conditions remain unchanged',()=>{
  const p=factory(current(),'createRubblePolicy');assert.deepEqual(plain(p.config),{active:384,light:768,chip:48,colliders:14000,proxyBoxes:24});
  const html=current();assert.match(html,/impactShatters>breaks&&targetGroundFracture/);assert.match(html,/const wantsCCD=false/);
  assert.ok(html.includes("rubblePolicy.resolveReleased(e.id,simTime,'regrabbed')"));
  assert.match(html,/gatherImpacts\(\);\s*rubblePolicy.updateReleased\(entities,simTime\)/);
});
test('all executable inline scripts parse without a browser',()=>{
  for(const m of current().matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/application\/ld\+json/.test(m[1]))continue;new vm.Script(m[2]);
  }
});
