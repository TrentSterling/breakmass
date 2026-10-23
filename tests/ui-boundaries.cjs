// CPU event scheduling/source tests. No browser, physics, or desktop input.
const {test,before}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
let api,views;before(async()=>{api=await import('../tools/ui-boundaries.mjs');views=api.authoredViews(path.join(__dirname,'../index.html'));});
function harness(){
  let now=0,id=0;const timers=new Map(),frames=new Map(),listeners=new Set();
  const g={stats:{t:0},ready:true,scenePreset:'district',cameraState:{mode:'fly',yaw:.65,pitch:.27,position:[0.618852811706752,27.714983882591486,54.420606020775665]},liveQueue:{errors:null}};
  const d={open:true,returnValue:'rebuild',addEventListener:(type,f)=>listeners.add(f),removeEventListener:(type,f)=>listeners.delete(f),querySelector:()=>({click:()=>h.click()})};
  const context=vm.createContext({window:{BREAKMASS:g},document:{getElementById:()=>d},performance:{now:()=>now},
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  const h={g,d,timers,frames,listeners,context,click:()=>{},eval:s=>vm.runInContext(s,context),
    view:(expected=views.district.tank,ms=5000)=>h.eval('('+api.observePublishedView.toString()+')('+JSON.stringify(expected)+','+ms+')'),
    rebuild:(args=[],ms=60000)=>h.eval('('+api.observeRebuild.toString()+')("retryHandsContract",'+JSON.stringify(args)+','+ms+')'),
    close(trusted=true,value='rebuild'){d.open=false;d.returnValue=value;for(const f of [...listeners])f({isTrusted:trusted});},
    tick(ms=16,publish=true){now+=ms;if(publish)g.stats.t=now;const pending=[...frames];frames.clear();for(const [,f] of pending)f(now);},
    advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
    idle(){assert.equal(timers.size,0);assert.equal(frames.size,0);assert.equal(listeners.size,0);}};return h;
}
test('authored views independently match the recorded correct tank and the other setups',()=>{
  assert.deepEqual(views.district.tank.position,[-7.251734926607817,13.876554480531947,36.163817506639674]);
  assert.deepEqual(Object.keys(views.district).sort(),['bridge','chimney','tank']);assert.deepEqual(Object.keys(views.foundry),['chimney']);
});
test('exact old overview with new yaw/pitch cannot become the baseline before camera publication',async()=>{
  const h=harness(),p=h.view();h.tick(400);assert.equal(h.frames.size,1);h.g.cameraState={...views.district.tank};h.tick();const r=await p;
  assert.equal(r.passed,true);assert.equal(r.samples.length,2);assert.notDeepEqual(r.samples[0].view.position,r.expected.position);h.idle();
});
for(const kind of ['wrong position','empty position','wrong yaw','wrong pitch','wrong mode','wrong scene','not ready','no completed frame'])test(kind+' cannot pass and expires',async()=>{
  const h=harness();h.g.cameraState={...views.district.tank,position:[...views.district.tank.position]};
  if(kind==='wrong position')h.g.cameraState.position[0]+=.01;if(kind==='wrong yaw')h.g.cameraState.yaw+=.01;if(kind==='wrong pitch')h.g.cameraState.pitch+=.01;
  if(kind==='empty position')h.g.cameraState.position=[];
  if(kind==='wrong mode')h.g.cameraState.mode='orbit';if(kind==='wrong scene')h.g.scenePreset='foundry';if(kind==='not ready')h.g.ready=false;
  const p=h.view();h.tick(100,kind!=='no completed frame');h.advance(4900);const r=await p;assert.equal(r.passed,false);assert.match(r.error,/timed out/);h.idle();
});
test('a matching pose observed after deadline still fails before a delayed timer',async()=>{
  const h=harness();h.g.cameraState=views.district.tank;const p=h.view();h.tick(5001);assert.equal((await p).passed,false);h.idle();
});
test('frame-only observer requires real completed-frame progress',async()=>{
  const h=harness(),p=h.view(null);h.tick(50,false);assert.equal(h.frames.size,1);h.tick();assert.equal((await p).passed,true);h.idle();
});
test('runtime errors and accessor errors fail with cleanup',async()=>{
  for(const accessor of [false,true]){const h=harness();if(accessor)Object.defineProperty(h.g,'cameraState',{get(){throw Error('read failed');}});else h.g.liveQueue.errors='worker failed';const p=h.view();h.tick();assert.equal((await p).passed,false);h.idle();}
});
test('invalid view budget fails without scheduling',async()=>{const h=harness();assert.equal((await h.view(null,0)).passed,false);h.idle();});
test('boot with no telemetry must observe its first actual published view',async()=>{
  const h=harness();delete h.g.stats.t;h.g.cameraState=views.district.tank;const p=h.view();h.tick(50,false);assert.equal(h.frames.size,1);h.tick();const r=await p;assert.equal(r.firstFrame,null);assert.equal(r.passed,true);h.idle();
});
test('missing or malformed authored expectations fail instead of becoming frame-only waits',async()=>{
  for(const expected of [{}, {...views.district.tank,position:[NaN,0,0]}, {...views.district.tank,mode:'orbit'}]){const h=harness();assert.equal((await h.view(expected)).passed,false);h.idle();}
  const h=harness(),r=await h.eval('('+api.observePublishedView.toString()+')(undefined,5000)');assert.equal(r.passed,false);h.idle();
});
test('late cancelled animation callbacks cannot leak observers or change failure',async()=>{
  const h=harness(),p=h.view(),late=[...h.frames.values()][0];h.advance(5000);const r=await p,n=r.samples.length;
  h.g.cameraState=views.district.tank;late();assert.equal(r.passed,false);assert.equal(r.samples.length,n);h.idle();
});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
test('native close and ready alone cannot substitute for the actual rebuild promise',async()=>{
  const h=harness(),d=deferred();let calls=0;const original=h.g.retryHandsContract=()=>{calls++;return d.promise;};h.click=()=>{h.g.retryHandsContract();h.close();};
  const p=h.rebuild();h.advance(5500);await flush();assert.notEqual(h.g.retryHandsContract,original);d.resolve(true);const r=await p;
  assert.equal(r.passed,true);assert.equal(calls,1);assert.equal(h.g.retryHandsContract,original);assert.deepEqual(Array.from(r.events,e=>e.phase),['armed','call','close','resolved','complete']);h.idle();
});
test('ready old scene without a dispatch fails within the 5-second dispatch watchdog',async()=>{
  const h=harness(),original=h.g.retryHandsContract=()=>Promise.resolve(true);h.click=()=>h.close();const p=h.rebuild();h.advance(5000);
  const r=await p;assert.equal(r.passed,false);assert.match(r.error,/dispatch timed out/);assert.equal(h.g.retryHandsContract,original);h.idle();
});
test('dispatch without close delivery fails even if rebuild resolved',async()=>{
  const h=harness();h.g.retryHandsContract=()=>Promise.resolve(true);h.click=()=>h.g.retryHandsContract();const p=h.rebuild();await flush();h.advance(5000);assert.equal((await p).passed,false);h.idle();
});
for(const failure of ['stalled','reject','false','throw','forged close','cancel value','wrong args','duplicate call'])test('rebuild '+failure+' remains failed and restores methods',async()=>{
  const h=harness(),d=deferred();const original=h.g.retryHandsContract=()=>{if(failure==='throw')throw Error('rebuild broke');return d.promise;};
  h.click=()=>{h.g.retryHandsContract(...(failure==='wrong args'?['unexpected']:[]));if(failure==='duplicate call')h.g.retryHandsContract();h.close(failure!=='forged close',failure==='cancel value'?'cancel':'rebuild');};
  const p=h.rebuild([],10000);if(failure==='reject')d.reject(Error('worker rejected'));else if(failure==='false')d.resolve(false);else if(failure!=='stalled')d.resolve(true);
  await flush();h.advance(10000);const r=await p;assert.equal(r.passed,false);assert.equal(h.g.retryHandsContract,original);d.resolve(true);await flush();assert.equal(r.passed,false);h.idle();
});
test('completion arriving after elapsed deadline cannot pass before watchdog delivery',async()=>{
  const h=harness(),d=deferred();h.g.retryHandsContract=()=>d.promise;h.click=()=>{h.g.retryHandsContract();h.close();};const p=h.rebuild([],100);
  h.tick(101);d.resolve(true);assert.equal((await p).passed,false);h.idle();
});
for(const late of ['dispatch','close'])test('late '+late+' fails even ahead of its watchdog callback',async()=>{
  const h=harness(),d=deferred();h.g.retryHandsContract=()=>d.promise;h.click=()=>{if(late==='close')h.g.retryHandsContract();};const p=h.rebuild();
  h.tick(5001);if(late==='dispatch')h.g.retryHandsContract();h.close();d.resolve(true);const r=await p;assert.equal(r.passed,false);h.idle();
});
test('observer never overwrites a method replaced by another owner during rebuild',async()=>{
  const h=harness(),d=deferred(),foreign=()=>{};h.g.retryHandsContract=()=>d.promise;h.click=()=>{h.g.retryHandsContract();h.close();};
  const p=h.rebuild();h.g.retryHandsContract=foreign;d.resolve(true);const r=await p;assert.equal(r.passed,false);assert.match(r.error,/ownership/);assert.equal(h.g.retryHandsContract,foreign);h.idle();
});
test('host failure is retained rather than converted to green',async()=>{
  const receipts=[];await assert.rejects(api.observed({eval:async()=>{throw Error('transport failed');}},api.observePublishedView,[null,5000],receipts,'host',5000),/transport failed/);assert.equal(receipts[0].passed,false);
});
test('host watchdog covers a stuck evaluation',async()=>{
  const receipts=[];await assert.rejects(api.observed({eval:()=>new Promise(()=>{})},api.observePublishedView,[null,5],receipts,'host',5),/host watchdog/);assert.equal(receipts[0].passed,false);
});
test('host observer rejects failed and absent page receipts',async()=>{
  for(const result of [undefined,{passed:false,error:'wrong view'}]){const receipts=[];await assert.rejects(api.observed({eval:async()=>result},api.observePublishedView,[],receipts,'host',5000));assert.equal(receipts[0].passed,false);}
});
test('all four test suites retain their assertions and use explicit boundaries',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const contract=read('tools/contract-check.mjs'),smash=read('tools/smash-retry-check.mjs'),blast=read('tools/blast-contract-check.mjs'),native=read('tests/reset-confirmation-browser.mjs');
  assert.match(contract,/views.district.tank,boundaries,'authored initial tank view'/);assert.match(contract,/rebuildBoundary\(page,'retryHandsContract',\[\],boundaries,'contract retry rebuild',60000\)/);
  assert.match(smash,/rebuildBoundary.*90000/);assert.match(smash,/waitForPausedDamage\(damageSnapshot/);assert.match(smash,/waitForNativeCancel.*smash form cancel/);
  assert.match(blast,/viewBoundary\(page,null,boundaries,'orbit aim published'\)/);assert.match(native,/await p.view\('tank'\);await p.quiet\(\);const before/);
  assert.match(native,/eventsBeforeDelivery===0/);assert.match(native,/events.length===4&&events.every\(e=>e.trusted\)/);
  assert.doesNotMatch(api.observePublishedView.toString(),/\.step\(|\.reset\(|\.focusExperiment\(|dispatchEvent|\.set\(/);
  assert.doesNotMatch(api.observeRebuild.toString(),/dispatchEvent|\.close\(|\.showModal\(/);
});
test('production native-DOM probe serializes and runs its authored-view observer',async()=>{
  const native=fs.readFileSync(path.join(__dirname,'reset-confirmation-browser.mjs'),'utf8');
  const start=native.indexOf('const installed=await page.eval(`')+'const installed=await page.eval(`'.length;
  const template=native.slice(start,native.indexOf('`);',start));
  const damage=await import('../tools/paused-damage-wait.mjs');
  const code=new Function('views','observePublishedView','waitForPausedDamage','readPausedDamage','return `'+template+'`;')(views,api.observePublishedView,damage.waitForPausedDamage,damage.readPausedDamage);
  const h=harness();class Dialog{close(){}showModal(){}}
  Object.setPrototypeOf(h.d,Dialog.prototype);h.context.HTMLDialogElement=Dialog;
  for(const name of ['reset','retryExperiment','retryHandsContract','changeScene'])h.g[name]=()=>Promise.resolve(true);
  assert.equal(h.eval(code).native,true);const probe=h.context.window.__confirmationProbe;
  assert.equal(Object.keys(probe.originals).length,4);assert.equal(typeof probe.quiet,'function');h.g.cameraState=views.district.tank;
  const p=probe.view('tank');h.tick();await p;assert.equal(probe.boundaries[0].passed,true);
  // The production probe intentionally retains its event recorder until page teardown.
  h.listeners.clear();h.idle();
});
