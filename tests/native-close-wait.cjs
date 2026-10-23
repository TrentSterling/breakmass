// CPU scheduling/failure tests with explicit DOM and timer doubles. No browser.
const {test,before}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
let api;before(async()=>{api=await import('../tools/native-close-wait.mjs');});
function harness(){
  let now=0,nextTimer=0;const timers=new Map(),listeners=new Map();
  class Dialog{
    open=true;returnValue='cancel';
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);}
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);}
    emit(type,trusted=true){for(const fn of [...listeners.get(type)||[]])fn({isTrusted:trusted});}
  }
  const dialog=new Dialog(),window={},context=vm.createContext({window,document:{getElementById:()=>dialog},HTMLDialogElement:Dialog,
    performance:{now:()=>now},setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
  const page={eval:async code=>vm.runInContext(code,context)};
  return {dialog,window,timers,listeners,page,context,receipts:[],
    start:(timeout=5000)=>vm.runInContext(`(${api.installNativeCloseProbe.toString()})('CPU fixture',${timeout})`,context),
    advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
    elapseWithoutTimers(ms){now+=ms;},
    close(value='cancel',trusted=true){dialog.open=false;dialog.returnValue=value;dialog.emit('close',trusted);},
    idle(){assert.equal(timers.size,0);assert.equal([...listeners.values()].reduce((n,s)=>n+s.size,0),0);}};
}
test('listener precedes the click and waits beyond the old 100 ms delay for actual close',async()=>{
  const h=harness();h.start();const p=h.window.__breakmassCloseProbe;
  assert.equal(h.listeners.get('close').size,1);h.dialog.emit('click',false);h.dialog.open=false;
  h.advance(100);assert.equal(p.receipt.passed,false);assert.equal(p.receipt.events.length,2);
  h.advance(1100);h.close();const r=await p.result;
  assert.equal(r.passed,true);assert.deepEqual(Array.from(r.events,e=>e.phase),['armed','click','close','complete']);
  assert.deepEqual(Array.from(r.events,e=>e.at),[0,0,1200,1200]);assert.equal(r.events[2].trusted,true);h.idle();
});
test('hidden dialog without close delivery fails at the finite watchdog',async()=>{
  const h=harness();h.start();h.dialog.open=false;const p=h.window.__breakmassCloseProbe;
  h.advance(4999);assert.equal(p.receipt.events.length,1);h.advance(1);
  const r=await p.result;assert.equal(r.passed,false);assert.match(r.error,/timed out after 5000 ms/);assert.equal(r.events.at(-1).at,5000);h.idle();
});
test('a late close cannot turn an expired wait green or append another outcome',async()=>{
  const h=harness();h.start();const p=h.window.__breakmassCloseProbe;h.advance(5000);const r=await p.result,n=r.events.length;
  h.close();assert.equal(r.passed,false);assert.equal(r.events.length,n);h.idle();
});
test('late native close fails even when its task runs before a delayed timer callback',async()=>{
  const h=harness();h.start();h.elapseWithoutTimers(5001);h.close();const r=await h.window.__breakmassCloseProbe.result;
  assert.equal(r.passed,false);assert.match(r.error,/exceeded 5000 ms watchdog/);h.idle();
});
for(const [name,value,trusted,error] of [['forged close','cancel',false,/native close/],['rebuild instead of cancel','rebuild',true,/Expected cancellation/]])test(name+' fails closed',async()=>{
  const h=harness();h.start();h.close(value,trusted);const r=await h.window.__breakmassCloseProbe.result;
  assert.equal(r.passed,false);assert.match(r.error,error);h.idle();
});
test('a close event while the dialog stays open cannot pass',async()=>{
  const h=harness();h.start();h.dialog.emit('close');const r=await h.window.__breakmassCloseProbe.result;
  assert.equal(r.passed,false);assert.match(r.error,/remains open/);h.idle();
});
for(const timeout of [0,-1,Infinity,NaN])test('invalid watchdog '+timeout+' is rejected before listener installation',()=>{
  const h=harness();assert.throws(()=>h.start(timeout),/Invalid/);assert.equal(h.window.__breakmassCloseProbe,undefined);h.idle();
});
test('a closed dialog cannot be armed and has no leaked listener',()=>{
  const h=harness();h.dialog.open=false;assert.throws(()=>h.start(),/open native confirmation/);h.idle();
});
test('host wrapper records success and cleans the probe after native delivery',async()=>{
  const h=harness();await api.waitForNativeCancel(h.page,async()=>{
    assert.equal(h.listeners.get('close').size,1);h.dialog.emit('click',false);h.advance(300);h.close();
  },h.receipts,'ordinary cancel');
  assert.equal(h.receipts[0].passed,true);assert.equal(h.receipts[0].events.find(e=>e.phase==='close').at,300);
  assert.equal(h.window.__breakmassCloseProbe,undefined);h.idle();
});
test('host wrapper propagates a timeout and retains failed timing evidence',async()=>{
  const h=harness();await assert.rejects(api.waitForNativeCancel(h.page,async()=>h.advance(5000),h.receipts,'timeout'),/timed out/);
  assert.equal(h.receipts[0].passed,false);assert.equal(h.receipts[0].events.at(-1).at,5000);assert.equal(h.window.__breakmassCloseProbe,undefined);h.idle();
});
test('action failure cleans listeners and timers without swallowing the error',async()=>{
  const h=harness();await assert.rejects(api.waitForNativeCancel(h.page,async()=>{throw Error('click failed');},h.receipts,'action'),/click failed/);
  assert.equal(h.receipts[0].passed,false);assert.equal(h.receipts[0].error,'click failed');assert.equal(h.window.__breakmassCloseProbe,undefined);h.idle();
});
test('action failure after a delivered close still records failure',async()=>{
  const h=harness();await assert.rejects(api.waitForNativeCancel(h.page,async()=>{h.close();throw Error('transport failed');},h.receipts,'late action'),/transport failed/);
  assert.equal(h.receipts[0].passed,false);assert.equal(h.receipts[0].error,'transport failed');h.idle();
});
test('a pre-existing probe is neither overwritten nor cleaned by a rejected second wait',async()=>{
  const h=harness();h.start();const first=h.window.__breakmassCloseProbe;let acted=false;
  await assert.rejects(api.waitForNativeCancel(h.page,async()=>{acted=true;},h.receipts,'overlap'),/already active/);
  assert.equal(acted,false);assert.equal(h.receipts[0].passed,false);assert.equal(h.window.__breakmassCloseProbe,first);
  assert.equal(h.listeners.get('close').size,1);first.cancel('fixture cleanup');h.idle();
});
test('cleanup transport failure cannot produce a passing receipt',async()=>{
  const h=harness(),evaluate=h.page.eval;h.page.eval=async code=>{if(code.includes('delete window.__breakmassCloseProbe'))throw Error('cleanup transport failed');return evaluate(code);};
  await assert.rejects(api.waitForNativeCancel(h.page,async()=>h.close(),h.receipts,'cleanup'),/cleanup transport failed/);
  assert.equal(h.receipts[0].passed,false);h.idle();
});
test('both demonstrated fixed-delay patterns use the bounded helper and retain assertions',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const contract=read('tools/contract-check.mjs'),smash=read('tools/smash-retry-check.mjs'),native=read('tests/reset-confirmation-browser.mjs');
  assert.match(contract,/waitForNativeCancel\(page,.*contract-cancel-before-retry/);
  assert.match(contract,/check\(\(await state\(\)\)\.score\.handsContract\.status==='complete','cancel preserves earned attempt'\)/);
  assert.match(contract,/check\(await page\.eval\("document\.getElementById\('confirm-reset'\)\.open"\),'retry opens confirmation'\)/);
  assert.match(smash,/waitForNativeCancel\(page,.*smash-backdrop-before-rebuild/);
  assert.match(smash,/backdrop cancels retry/);assert.match(smash,/ordinary rebuild has no stale retry action/);
  assert.match(smash,/passed:checks\.every\(c=>c\.passed\)&&dialogEvents\.every\(e=>e\.passed\)/);
  assert.match(native,/const closing=p\.closed\(\);d\.querySelector\('\[value="cancel"\]'\)\.click\(\)/);
  assert.match(native,/Native close event timed out/);assert.match(native,/cancel\/reopen gap cannot replace the pending action/);
  assert.doesNotMatch(api.installNativeCloseProbe.toString(),/dispatchEvent|\.click\(|\.close\(|showModal|pendingReset/);
});
