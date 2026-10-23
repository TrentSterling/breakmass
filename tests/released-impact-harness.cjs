// Deterministic source/CPU fixture. Bodies and contact events are mocked;
// this does not step Rapier, render, launch a browser or exercise desktop input.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const current=()=>fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/\r\n/g,'\n');
function between(html,a,b){const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return html.slice(i,j);}
function factory(html,name){const source=html.match(new RegExp('function '+name+'\\(\\)\\s*\\{[\\s\\S]*?\\n\\}'));assert.ok(source,name);return vm.runInNewContext(source[0]+';'+name+'()');}
class Vec{
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  copy(v){Object.assign(this,{x:v.x,y:v.y,z:v.z});return this;}
  clone(){return new Vec(this.x,this.y,this.z);}
  set(x,y,z){Object.assign(this,{x,y,z});return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  multiplyScalar(n){this.x*=n;this.y*=n;this.z*=n;return this;}
  cross(v){return this.set(this.y*v.z-this.z*v.y,this.z*v.x-this.x*v.z,this.x*v.y-this.y*v.x);}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
  negate(){return this.multiplyScalar(-1);}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
  applyQuaternion(){return this;} // Fixtures use identity rotation only.
  toArray(){return [this.x,this.y,this.z];}
}
function harness(html=current()){
  html=html.replace(/\r\n/g,'\n');const calls=[],metadata=[],requests=[],contacts=[];
  const c={V:(...a)=>new Vec(...a),Q:()=>({copy(){return this;},invert(){return this;}}),DT:1/60,S:.25,
    simTime:26/60,performance:{now:()=>c.simTime*1000,timeOrigin:0},grab:null,lastGrabRelease:'',tether:{visible:false},
    rubblePolicy:factory(html,'createRubblePolicy'),impactPolicy:factory(html,'createImpactPolicy'),impactDamage:factory(html,'createImpactDamage'),
    entities:new Map(),bodyEntity:new Map(),projectiles:new Map(),economy:{lightened:0,reactivated:0},adaptiveBudget:{active:128},lastBalanceAt:0,
    R:{RigidBodyType:{Fixed:'Fixed',Dynamic:'Dynamic'}},impactFracture:true,impactScale:1.6,fractures:0,bestImpactEnergy:0,
    epoch:1,impactSequence:0,impactAudit:{accepted:0,hardBypasses:0,rejected:0,reasons:{},traces:[],awaitingDraw:[]},
    physics:{busy:false,metadata:(body,data)=>metadata.push({id:body.handle,at:c.simTime,...data})},
    rebuildContactProxy:e=>{e.colliders=1;},sumColliders:e=>e.colliders,
    shortName:s=>s,localPoint:(_e,p)=>p.clone().multiplyScalar(4),impactEffects:()=>{},
    sandbox:{crushesFuel:()=>false},requestEdit:(e,op)=>{if(c.rejectEdit)return false;requests.push({entity:e.id,root:e.rootId,op,at:c.simTime});e.pending=true;return true;},
    events:{drainContactForceEvents:fn=>contacts.splice(0).forEach(fn)},
    world:{getCollider:id=>colliders.get(id),contactPair:(_a,_b,fn)=>fn({normal:()=>new Vec(0,-1,0),numSolverContacts:()=>1,solverContactPoint:()=>new Vec(8,0,7)},false)}
  };
  const colliders=new Map();
  function entity(id,options={}){
    const state={v:new Vec(0,-28,0),w:new Vec(),sleeping:false,type:'Dynamic'};
    const body={handle:id,linvel:()=>state.v,angvel:()=>state.w,isSleeping:()=>state.sleeping,isDynamic:()=>state.type==='Dynamic',mass:()=>421225,
      worldCom:()=>new Vec(8,10,7),rotation:()=>({x:0,y:0,z:0,w:1}),translation:()=>new Vec(8,30,7),
      setBodyType:type=>{state.type=type;calls.push({entity:id,at:c.simTime,tick:Math.round(c.simTime*60),type,stack:new Error().stack.split('\n').filter(s=>/lightenRubble|rebalanceRubble|activateRubble/.test(s)).map(s=>s.trim())});},
      setLinvel:v=>{state.v.copy(v);},setAngvel:v=>{state.w.copy(v);},wakeUp:()=>{state.sleeping=false;},applyImpulseAtPoint:()=>{}};
    const e={id,rootId:id,name:'Fixture',kind:'structure',dims:[40,83,36],count:40000,born:0,impactAt:-10,solidMass:421225,toughness:1,
      anchored:false,lightweight:false,pending:false,explosive:false,colliders:24,compactCollision:false,body,state,preV:state.v,preW:state.w,preCOM:new Vec(8,10,7),chunks:new Map(),...options};
    c.entities.set(id,e);c.bodyEntity.set(id,e);colliders.set(id,{handle:id,parent:()=>body});return e;
  }
  colliders.set(0,{handle:0,parent:()=>({isDynamic:()=>false})});
  const names=['lightenRubble','releaseGrab','activateRubble','rebalanceRubble','gatherImpacts','recordImpact','markImpactCommit','markImpactDraw'];
  const sources=names.map(name=>{const re=new RegExp('  function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n  \\}');const match=html.match(re);assert.ok(match,name);return match[0];}).join('\n');
  vm.createContext(c);vm.runInContext(sources,c);
  const api=Object.fromEntries(names.map(n=>[n,vm.runInContext(n,c)]));
  function groundContact(e){contacts.push({collider1:()=>e.id,collider2:()=>0,totalForceMagnitude:()=>421225*28*60,contactTime:()=>c.simTime*1000});api.gatherImpacts();}
  function colliderPressure(e){c.e={id:-1};c.protection=new Set();c.MAX_COLLIDERS=14000;c.predicted=13950;c.rescued=false;
    vm.runInContext(between(html,'    if(predicted>MAX_COLLIDERS-64){','    const admitted='),c);return c.predicted;}
  function fragmentPressure(){c.active=()=>[...c.entities.values()].filter(e=>!e.lightweight).length;c.structural=[{}];c.protection=new Set();
    vm.runInContext(between(html,'    let rescued=false;const activeTarget=','    let slots='),c);}
  return {html,c,api,calls,metadata,requests,entity,groundContact,colliderPressure,fragmentPressure};
}
function replay(html=current()){
  const h=harness(html),{c,api}=h;
  const target=h.entity(1000001,{rootId:57,name:'Northstar',count:31040});
  // Construct pressure at the hosted run's first demotion tick. Other bodies are
  // larger so the baseline's count-ordered eviction picks the released target.
  // This isolates the mechanism; it is not a reconstructed Rapier trajectory.
  for(let i=0;i<128;i++)h.entity(2000000+i);
  c.grab={entity:target};api.releaseGrab('mouse released');c.simTime=61/60;api.rebalanceRubble(2000);
  const beforeContact={lightweight:target.lightweight,colliders:target.colliders,type:target.state.type};
  c.simTime=86/60;h.groundContact(target);
  return {h,result:{scope:'Source/CPU model with scripted body pressure and ground contact, not a browser or Rapier playtest.',releaseTick:26,pressureTick:61,contactTick:86,target:{entity:target.id,root:target.rootId},beforeContact,
    targetDemotions:h.calls.filter(x=>x.entity===target.id),requestedTargets:h.requests.map(x=>({entity:x.entity,root:x.root})),impactTraces:c.impactAudit.traces.map(x=>({entity:x.entity,root:x.root,otherId:x.otherId,accepted:x.accepted,status:x.status})),rubble:c.rubblePolicy.releaseReport?.()||null}};
}
module.exports={current,between,factory,harness,replay,Vec};
