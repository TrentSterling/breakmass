const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.match(/function createHandsContract\(\)\{[\s\S]*?\n\}/)[0];
const make=()=>vm.runInNewContext(source+';createHandsContract()');
test('earned contract survives every later sandbox tool',()=>{
  for(const tool of ['Rifle','Shotgun','Rocket','Blast','Bomb rain','Chisel','Props','Gravity shove']){
    const c=make();c.topple();c.disqualify(tool);assert.equal(c.state.status,'complete');
  }
});
test('failed attempt cannot become complete when the tank falls later',()=>{
  const c=make();c.disqualify('Rocket');c.topple();c.disqualify('Blast');
  assert.equal(c.state.status,'failed');assert.equal(c.state.reason,'Rocket');
});
test('rebuild clears prior result and allows a fresh success',()=>{
  const c=make();c.disqualify('Blast');c.reset();assert.equal(c.state.status,'ready');
  c.topple();assert.equal(c.state.status,'complete');c.reset();assert.equal(c.state.reason,'');
});
test('scenes without tank are unavailable until district is rebuilt',()=>{
  const c=make();c.reset(false);c.topple();c.disqualify('Rocket');assert.equal(c.state.status,'unavailable');
  c.reset(true);assert.equal(c.state.status,'ready');
});
test('diagnostics cannot mutate the contract',()=>{
  const c=make();c.state.status='complete';assert.equal(c.state.status,'ready');
});
test('all executable inline scripts parse',()=>{
  let n=0;
  for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/type="(?:text\/plain|application\/ld\+json)"/.test(m[1]))continue;
    new vm.Script(m[2]);n++;
  }
  assert.ok(n>10);
});
