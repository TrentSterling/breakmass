// CPU checks of the actual reset UI handler with explicitly queued dialog events.
// No browser, GPU, input injection, audio or physics simulation. The HTML spec
// removes `open` before queuing `close`: https://html.spec.whatwg.org/multipage/interactive-elements.html#close-the-dialog
// BREAKMASS_HTML may point at an older index.html to reproduce the regression.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(process.env.BREAKMASS_HTML||path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('\n  let pending',html.indexOf('  function tool(i){'));
const end=html.indexOf("  $('theme-toggle').onclick=themeToggle;",start);
assert.ok(start>=0&&end>start,'reset UI source boundaries exist');
const source=html.slice(start,end);
const setups=html.match(/const SMASH_SETUPS=Object\.freeze\(\{[^\n]+\}\);/)[0];
const scenes=html.match(/const SCENE_PRESETS=Object\.freeze\(\{[\s\S]*?\n\}\);/)[0];

function harness(scene='district'){
  const elements=new Map(),queue=[],actions=[],trace=[];
  const $=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',value:'',listeners:{},
      addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);},
      emit(type,event={}){for(const listener of this.listeners[type]||[])listener({target:this,...event});}});
    return elements.get(id);
  };
  const dialog=$('confirm-reset');
  Object.assign(dialog,{open:false,returnValue:'',showCount:0,
    showModal(){assert.equal(this.open,false);this.open=true;this.showCount++;trace.push('show');},
    close(value){
      if(!this.open)return;
      this.open=false;if(value!==undefined)this.returnValue=value;
      trace.push('close('+this.returnValue+') queued');
      queue.push(()=>{trace.push('deliver close('+this.returnValue+')');this.emit('close');});
    },
    getBoundingClientRect:()=>({left:100,right:400,top:100,bottom:300})
  });
  const buttons=Object.fromEntries(['tank','chimney','bridge'].map(name=>[name,{dataset:{experimentRetry:name}}]));
  const game={ready:true,scenePreset:scene,stopForInterface(){trace.push('stop input');}};
  for(const method of ['retryExperiment','retryHandsContract','changeScene','reset']){
    game[method]=(...args)=>{actions.push([method,...args]);trace.push([method,...args].join(' '));};
  }
  const context={$,window:{BREAKMASS:game},document:{pointerLockElement:null,
    querySelectorAll(selector){assert.equal(selector,'[data-experiment-retry]');return Object.values(buttons);}},
    closePanels(){trace.push('close panels');},focusCanvas(){trace.push('focus canvas');}};
  const confirm=vm.runInNewContext(setups+'\n'+scenes+'\n'+source+'\nconfirmReset;',context);
  return {$,dialog,game,buttons,confirm,actions,trace,queue,
    flush(){assert.ok(queue.length,'a close event is queued');queue.shift()();},
    finish(value='rebuild'){dialog.close(value);this.flush();}};
}

for(const name of ['tank','chimney','bridge'])test(name+' confirmation dispatches its setup once',()=>{
  const h=harness();h.buttons[name].onclick();
  assert.equal(h.dialog.open,true);assert.match(h.$('reset-title').textContent,/^Retry /);
  assert.match(h.$('reset-explanation').textContent,/whole district/);
  assert.match(h.$('reset-explanation').textContent,/Power settings stay/);
  assert.deepEqual(h.actions,[]);h.finish();
  assert.deepEqual(h.actions,[['retryExperiment',name,'district']]);
});

test('Foundry chimney keeps its scene in both explanation and dispatch',()=>{
  const h=harness('foundry');h.buttons.chimney.onclick();
  assert.match(h.$('reset-explanation').textContent,/rebuilds the Foundry/);h.finish();
  assert.deepEqual(h.actions,[['retryExperiment','chimney','foundry']]);
});

test('Help tank retry dispatches the existing contract route',()=>{
  const h=harness('physics');h.$('retry-hands').onclick();
  assert.equal(h.$('reset-title').textContent,'Retry the tank contract?');h.finish();
  assert.deepEqual(h.actions,[['retryHandsContract']]);
});

test('ordinary rebuild keeps the generic reset route',()=>{
  const h=harness();h.confirm();assert.equal(h.$('reset-title').textContent,'Rebuild this scene?');h.finish();
  assert.deepEqual(h.actions,[['reset']]);
});

test('scene select confirms and dispatches its selected scene',()=>{
  const h=harness();h.$('scene-select').onchange({target:{value:'foundry'}});
  assert.equal(h.$('reset-title').textContent,'Load Foundry only?');h.finish();
  assert.deepEqual(h.actions,[['changeScene','foundry']]);
});

test('cancelling a scene load restores selection without rebuilding',()=>{
  const h=harness('foundry');h.$('scene-select').value='physics';
  h.$('scene-select').onchange({target:{value:'physics'}});h.finish('cancel');
  assert.equal(h.$('scene-select').value,'foundry');assert.deepEqual(h.actions,[]);
  h.buttons.bridge.onclick();h.finish();assert.deepEqual(h.actions,[['retryExperiment','bridge','district']]);
});

test('Escape-style close without a result preserves the attempt',()=>{
  const h=harness();h.buttons.tank.onclick();h.dialog.close();h.flush();
  assert.deepEqual(h.actions,[]);h.confirm();h.finish();assert.deepEqual(h.actions,[['reset']]);
});

test('backdrop cancels while an interior click does not',()=>{
  const h=harness();h.buttons.bridge.onclick();
  h.dialog.emit('click',{clientX:200,clientY:200});assert.equal(h.dialog.open,true);
  h.dialog.emit('click',{clientX:10,clientY:200});assert.equal(h.dialog.open,false);
  h.flush();assert.deepEqual(h.actions,[]);
});

test('not-ready and unknown setup requests cannot open a confirmation',()=>{
  const h=harness();h.game.ready=false;h.buttons.tank.onclick();assert.equal(h.dialog.open,false);
  h.game.ready=true;for(const name of ['missing','toString','__proto__'])h.confirm(null,false,name);
  assert.equal(h.dialog.open,false);assert.deepEqual(h.trace,[]);
});

test('a still-open confirmation cannot be replaced by another route',()=>{
  const h=harness();h.buttons.tank.onclick();h.buttons.bridge.onclick();h.confirm('physics');h.finish();
  assert.equal(h.dialog.showCount,1);assert.deepEqual(h.actions,[['retryExperiment','tank','district']]);
});

test('the closing gap cannot reopen a cancelled confirmation',()=>{
  const h=harness();h.buttons.tank.onclick();h.dialog.close('cancel');h.buttons.bridge.onclick();
  assert.equal(h.dialog.open,false,'wait for the queued close before accepting a new request');
  assert.equal(h.dialog.showCount,1);h.flush();assert.deepEqual(h.actions,[]);
  h.buttons.bridge.onclick();h.finish();assert.deepEqual(h.actions,[['retryExperiment','bridge','district']]);
});

test('cancel then immediate retry never loses its setup to generic reset',()=>{
  const h=harness();h.buttons.tank.onclick();h.dialog.close('cancel');h.buttons.bridge.onclick();h.flush();
  // A blocked request can be retried after close is delivered. An incorrectly
  // reopened dialog must retain its action instead of falling through to reset.
  if(!h.dialog.open)h.buttons.bridge.onclick();h.finish();
  assert.deepEqual(h.actions,[['retryExperiment','bridge','district']],h.trace.join('\n'));
});

test('an accepted action survives a second request before close delivery',()=>{
  const h=harness('foundry');h.buttons.chimney.onclick();h.dialog.close('rebuild');
  h.$('retry-hands').onclick();h.flush();
  assert.deepEqual(h.actions,[['retryExperiment','chimney','foundry']],h.trace.join('\n'));
  assert.equal(h.dialog.open,false);
});

test('two quick close attempts cannot dispatch two destructive actions',()=>{
  const h=harness();h.buttons.tank.onclick();h.dialog.close('cancel');
  h.buttons.bridge.onclick();h.dialog.close('rebuild');
  while(h.queue.length)h.flush();
  assert.deepEqual(h.actions,[],h.trace.join('\n'));
  h.buttons.bridge.onclick();h.finish();assert.deepEqual(h.actions,[['retryExperiment','bridge','district']]);
});

test('a stray close with no pending request cannot rebuild',()=>{
  const h=harness();h.dialog.returnValue='rebuild';h.dialog.emit('close');assert.deepEqual(h.actions,[]);
});

test('a duplicate close after completion cannot rebuild again',()=>{
  const h=harness();h.buttons.tank.onclick();h.finish();h.dialog.emit('close');
  assert.deepEqual(h.actions,[['retryExperiment','tank','district']]);
});
