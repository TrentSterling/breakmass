# v0.13.0 juice lane: readable, satisfying destruction feedback. All additions are
# cosmetic/audio only; no tool order, camera, God Hand, physics worker, damage queue,
# collision proxy or boot/targeting path changes.
#   a) a 120-200ms stress pulse (camera-facing ring) at the failing region when a
#      support failure or whole-body collapse commits, at result.failure.center or
#      the already-computed fracture centre.
#   b) a groan/creak sound in setStress when an anchored object's stress ratio rises
#      above ~0.8, with a per-entity cooldown so it cannot spam.
#   c) material-aware impact/collapse sounds: sharper crunch for metal, duller
#      bass-heavy thud for concrete, light clatter for timber, chosen by the
#      dominant material (by volume) of the fractured/failed structural fragments.
#   d) an extra heavy bass thud (reusing the existing 'collapse' cfg) layered on
#      top of the material sound for catastrophic impacts (impactDamage
#      profile.catastrophic), threaded from gatherImpacts through postEdit's
#      context so it survives to commit() without any global-state race.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# --- (a) stress pulse mesh + trigger, alongside the other one-shot cosmetic meshes.
rep(
"""  const gripHalo=new THREE.Mesh(new THREE.RingGeometry(.13,.19,24),new THREE.MeshBasicMaterial({color:0xf8cd68,transparent:true,opacity:.9,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
  gripHalo.visible=false;gripHalo.renderOrder=12;scene.add(gripHalo);""",
"""  const gripHalo=new THREE.Mesh(new THREE.RingGeometry(.13,.19,24),new THREE.MeshBasicMaterial({color:0xf8cd68,transparent:true,opacity:.9,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
  gripHalo.visible=false;gripHalo.renderOrder=12;scene.add(gripHalo);
  // Stress pulse: a brief camera-facing ring flashed at a failure/collapse centre
  // so the player can read WHERE a structure gave way. Cosmetic only, one shot.
  // Scaled by distance to camera (like gripHalo) so it reads as a localized
  // marker up close instead of a screen-filling disc, and stays legible far away.
  const stressPulseMat=new THREE.MeshBasicMaterial({color:0xff6a3c,transparent:true,opacity:0,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const stressPulse=new THREE.Mesh(new THREE.RingGeometry(.7,1,28),stressPulseMat);stressPulse.visible=false;stressPulse.renderOrder=13;stressPulse.frustumCulled=false;scene.add(stressPulse);
  const STRESS_PULSE_DUR=.16;let stressPulseLife=0,stressPulseScale=1;
  function triggerStressPulse(point,scale=1){stressPulse.position.copy(point);stressPulseLife=STRESS_PULSE_DUR;stressPulseScale=Math.max(.5,scale);}""",
)
rep(
"""    drawTracers(dt);flashLife=Math.max(0,flashLife-dt);flashLight.intensity=flashLife*120;""",
"""    drawTracers(dt);flashLife=Math.max(0,flashLife-dt);flashLight.intensity=flashLife*120;
    if(stressPulseLife>0){stressPulseLife=Math.max(0,stressPulseLife-dt);const t=1-stressPulseLife/STRESS_PULSE_DUR,near=Math.max(.4,camera.position.distanceTo(stressPulse.position)*.045);stressPulse.quaternion.copy(camera.quaternion);stressPulse.scale.setScalar(near*stressPulseScale*(1+t*1.4));stressPulseMat.opacity=(1-t)*.85;stressPulse.visible=stressPulseLife>0;}else if(stressPulse.visible)stressPulse.visible=false;""",
)

# --- (b) groan/creak on stress ratio > 0.8, cooldown per entity. failAt/toast logic unchanged.
rep(
"""  function setStress(e,value){
    const was=e.stress?.ratio>1;e.stress=value||null;
    if(e.anchored&&structuralFailure&&value?.ratio>1){
      if(!Number.isFinite(e.failAt))e.failAt=simTime+Math.max(.2,.75/Math.sqrt(value.ratio));
      if(!was){sound('creak');toast('OVERLOADED · '+e.name+' · support about to give',2)}
    }else e.failAt=Infinity;
  }""",
"""  function setStress(e,value){
    const was=e.stress?.ratio>1;e.stress=value||null;
    // Groan before the give-way: audible warning once ratio crosses ~0.8, cooled
    // down so a sustained overload does not spam the noise synth every commit.
    if(e.anchored&&structuralFailure&&value?.ratio>.8&&simTime-e.creakAt>1.6){e.creakAt=simTime;sound('creak');}
    if(e.anchored&&structuralFailure&&value?.ratio>1){
      if(!Number.isFinite(e.failAt))e.failAt=simTime+Math.max(.2,.75/Math.sqrt(value.ratio));
      if(!was)toast('OVERLOADED · '+e.name+' · support about to give',2);
    }else e.failAt=Infinity;
  }""",
)
rep(
"""stress:packet.stress||null,failAt:Infinity,lightweight:""",
"""stress:packet.stress||null,failAt:Infinity,creakAt:-Infinity,lightweight:""",
)

# --- (c) material picker: dominant material (by box volume) of the fractured pieces,
# mirroring the kernel's HEX/rho/compression/tension tables (index 1-9). The ductile,
# high tension/compression group reads as metal, the lightest/least dense id as
# timber, the rest (brittle, weak in tension) as concrete/masonry.
rep(
"""  let audio=null,noiseBuffer=null,master=null,voices=0;
  function sound(type){""",
"""  const MATERIAL_CLASS={3:'metal',5:'metal',7:'metal',9:'metal',4:'timber'};
  function dominantMaterialClass(fragments){
    const vol=new Float64Array(10);
    for(const f of fragments)for(const pk of f.packets||[]){const b=pk.boxes;for(let i=0;i+6<b.length;i+=7){const id=b[i+6]|0;if(id>=1&&id<=9)vol[id]+=b[i+3]*b[i+4]*b[i+5];}}
    let bestId=0,bestVol=0;for(let id=1;id<=9;id++)if(vol[id]>bestVol){bestVol=vol[id];bestId=id;}
    return MATERIAL_CLASS[bestId]||'concrete';
  }
  let audio=null,noiseBuffer=null,master=null,voices=0;
  function sound(type){""",
)
rep(
"""crush:[.34,880,.36,56]}[type]||[.1,1200,.1,0];""",
"""crush:[.34,880,.36,56],'impact-metal':[.12,2600,.26,140],'impact-concrete':[.34,560,.32,50],'impact-timber':[.09,2000,.16,0]}[type]||[.1,1200,.1,0];""",
)

# --- (d) thread impactDamage's catastrophic flag from gatherImpacts through postEdit's
# context so commit() can react to it without touching shared/global impact state.
rep(
"""      const fracture=plan.op.ops.find(o=>o.type==='fracture'),center=fracture?.center||contacts[0].point;
      Object.assign(plan.op,{priority:95,impactIds:[trace.id],contactAt:c.contactAt,center:[...center],radius:Math.max(...plan.op.ops.map(o=>Math.hypot(...o.center.map((x,i)=>x-center[i]))+o.radius))});""",
"""      const fracture=plan.op.ops.find(o=>o.type==='fracture'),center=fracture?.center||contacts[0].point;
      Object.assign(plan.op,{priority:95,impactIds:[trace.id],contactAt:c.contactAt,center:[...center],radius:Math.max(...plan.op.ops.map(o=>Math.hypot(...o.center.map((x,i)=>x-center[i]))+o.radius)),catastrophic:plan.catastrophic});""",
)
rep(
"""power:amount,scatterEnergy:Math.max(0,...cuts.map(c=>c.scatterEnergy||0)),sent:performance.now(),firstImpactAt,priority:op.priority,impactIds:op.impactIds?[...op.impactIds]:null};""",
"""power:amount,scatterEnergy:Math.max(0,...cuts.map(c=>c.scatterEnergy||0)),sent:performance.now(),firstImpactAt,priority:op.priority,impactIds:op.impactIds?[...op.impactIds]:null,catastrophic:!!op.catastrophic};""",
)
rep(
"""    const op=ops.length===1?{...ops[0]}:{type:'batch',ops};
    op.surfaceOnly=surfaceOnly;op.chips=surfaceOnly?0:Math.min(3,Math.max(...chosen.map(q=>q.chips||0)));""",
"""    const op=ops.length===1?{...ops[0]}:{type:'batch',ops};
    op.surfaceOnly=surfaceOnly;op.chips=surfaceOnly?0:Math.min(3,Math.max(...chosen.map(q=>q.chips||0)));op.catastrophic=ops.some(o=>o.catastrophic);""",
)

# --- commit(): wire (a) and (c)/(d) into the three existing collapse-sound call
# sites (impact fracture, support failure, whole-body release). No new branches,
# no change to which commits play a sound, only what plays and the added pulse.
rep(
"""    if(ctx.impactIds?.length&&result.fracture&&simTime-lastImpactSound>.09){sound('collapse');lastImpactSound=simTime;addShake(.16);}""",
"""    if(ctx.impactIds?.length&&result.fracture&&simTime-lastImpactSound>.09){
      sound(structural.length?'impact-'+dominantMaterialClass(structural):'collapse');
      if(ctx.catastrophic)sound('collapse'); // extra heavy bass layer on a catastrophic hit
      lastImpactSound=simTime;addShake(.16);
    }""",
)
rep(
"""    if(result.failure){stressFailures++;sound('collapse');addShake(.24);toast('SUPPORT FAILURE · '+e.name+' · '+Math.round(result.failure.ratio*100)+'% utilization',2.5)}
    else if(!result.pull&&!ctx.impactIds?.length&&structural.some(f=>f.count>250)){sound('collapse');addShake(.14);toast('STRUCTURE RELEASED · '+e.name,2)}""",
"""    if(result.failure){
      stressFailures++;sound(structural.length?'impact-'+dominantMaterialClass(structural):'collapse');addShake(.24);
      toast('SUPPORT FAILURE · '+e.name+' · '+Math.round(result.failure.ratio*100)+'% utilization',2.5);
      triggerStressPulse(V(...result.failure.center).multiplyScalar(S).applyQuaternion(snap.q).add(snap.p),1);
    }else if(!result.pull&&!ctx.impactIds?.length&&structural.some(f=>f.count>250)){
      sound(structural.length?'impact-'+dominantMaterialClass(structural):'collapse');addShake(.14);
      toast('STRUCTURE RELEASED · '+e.name,2);
      // A settle-triggered release carries no edit centre (ctx.localCenter is
      // only set on the cut that requested it), so `center` degrades to the
      // parent's origin corner. The just-mounted pieces' own COM is a far
      // better read on WHERE the structure actually let go.
      triggerStressPulse(newEntities.length?newEntities.reduce((sum,c)=>sum.add(V().copy(c.body.worldCom())),V()).multiplyScalar(1/newEntities.length):center,1.5);
    }""",
)

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
