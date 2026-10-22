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
const toolSource=html.match(/  function useTool\(\)\{[\s\S]*?\n  \}/)[0];
function blastAction({target=true,earned=false,onExplosion=()=>{}}={}){
  const contract=make();if(earned)contract.topple();
  const vector=a=>({toArray:()=>a});let explosions=0;
  const context={ready:true,testing:false,inputSuspended:false,tool:1,performance:{now:()=>1000},lastShot:-10,
    hitTest:()=>target?{point:vector([-60,0,60]),normal:vector([0,1,0])}:null,
    radius:.65,power:1,handsContract:contract,sandbox:{breach:h=>({point:h.point,radius:.65,directId:null})},
    V:(...p)=>p,explosion:()=>{explosions++;onExplosion(contract);return 0;},lastBlast:null,simTime:1,toast:()=>{}};
  vm.runInNewContext(toolSource+';useTool()',context);
  return {contract,explosions,blast:context.lastBlast};
}
test('Blast fails the attempt before an indirect chain can topple the tank',()=>{
  const r=blastAction({onExplosion:c=>{assert.equal(c.state.status,'failed');c.topple();}});
  assert.equal(r.explosions,1);assert.equal(r.blast.editRequests,0);
  assert.equal(r.contract.state.status,'failed');assert.equal(r.contract.state.reason,'Blast');
});
test('a harmless surface Blast still counts as tool use',()=>{
  const r=blastAction();assert.equal(r.explosions,1);assert.equal(r.contract.state.status,'failed');
});
test('empty-sky click creates no Blast and keeps the attempt eligible',()=>{
  const r=blastAction({target:false});assert.equal(r.explosions,0);assert.equal(r.blast,null);assert.equal(r.contract.state.status,'ready');
});
test('an actual surface Blast preserves completion already earned',()=>{
  const r=blastAction({earned:true});assert.equal(r.explosions,1);assert.equal(r.contract.state.status,'complete');
});
test('all executable inline scripts parse',()=>{
  let n=0;
  for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/type="(?:text\/plain|application\/ld\+json)"/.test(m[1]))continue;
    new vm.Script(m[2]);n++;
  }
  assert.ok(n>10);
});
