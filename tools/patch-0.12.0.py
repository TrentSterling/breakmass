# v0.12.0: fracture archetypes (kernel), God Hand twist (Q/E, Alt+mouse) and
# crush (middle mouse). Every replacement asserts its anchor exists exactly once.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# ---------------------------------------------------------------- kernel: archetypes
rep("""    let state=(cut.seed|0)||12345;
    function rand(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
    const coordinate=(a,d)=>d===0?a%nx:d===1?((a/nx)|0)%ny:(a/xy)|0;""",
"""    let state=(cut.seed|0)||12345;
    function rand(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
    const coordinate=(a,d)=>d===0?a%nx:d===1?((a/nx)|0)%ny:(a/xy)|0;
    // Fracture archetypes: same partition machinery, different weighting picked
    // from the SHAPE of the material being broken (or forced by cut.archetype).
    //   pancake  thin horizontal slab -> floor plates stacked/cut in plan
    //   shear    thin vertical wall   -> stepped diagonal slabs, never across the thin axis
    //   buckle   tall column/tower    -> horizontal sections that shear, lower ones split more
    //   snap     long beam            -> few long sections cut across the long axis
    //   spall    local surface damage -> small pieces peel off, big remainder survives
    //   shatter  default block        -> the original mixed partition
    const bounds=[nx,ny,nz,0,0,0];
    for(const a of cells){const x=a%nx,y=((a/nx)|0)%ny,z=(a/xy)|0;if(x<bounds[0])bounds[0]=x;if(y<bounds[1])bounds[1]=y;if(z<bounds[2])bounds[2]=z;if(x>bounds[3])bounds[3]=x;if(y>bounds[4])bounds[4]=y;if(z>bounds[5])bounds[5]=z;}
    const ex=bounds[3]-bounds[0]+1,ey=bounds[4]-bounds[1]+1,ez=bounds[5]-bounds[2]+1,horizontalMax=Math.max(ex,ez),horizontalMin=Math.min(ex,ez);
    const wholeBody=cells.length>=v.data.length*.6||cut.radius*2>=Math.max(nx,ny,nz);
    let archetype=typeof cut.archetype==='string'?cut.archetype:null;
    if(!archetype){
      if(!wholeBody&&cells.length<420)archetype='spall';
      else if(ey<=Math.max(3,horizontalMax*.28)&&horizontalMin>=6)archetype='pancake';
      else if(horizontalMin<=Math.max(3,horizontalMax*.28)&&ey>=6)archetype='shear';
      else if(ey>=horizontalMax*1.8&&ey>=10)archetype='buckle';
      else if(horizontalMax>=ey*2.2&&horizontalMax>=horizontalMin*2.2&&horizontalMax>=10)archetype='snap';
      else archetype='shatter';
    }
    const thinAxis=horizontalMin===ex?0:2,longAxis=horizontalMax===ex?0:2;
    const profile={
      pancake:{axisBias:[.7,2.4,.7],slabChance:.6,target:[.25,.5],shearScale:.35,amplitudeScale:.6},
      shear:{axisBias:[thinAxis===0?0:1.7,1,thinAxis===2?0:1.7],slabChance:.1,target:[.2,.5],shearScale:1.7,amplitudeScale:1.3},
      buckle:{axisBias:[.55,2.2,.55],slabChance:.4,target:[.22,.55],shearScale:1.25,amplitudeScale:1},
      snap:{axisBias:[longAxis===0?2.8:.35,.35,longAxis===2?2.8:.35],slabChance:.55,target:[.3,.4],shearScale:.5,amplitudeScale:.6},
      spall:{axisBias:[1,1,1],slabChance:.12,target:[.1,.25],shearScale:1.2,amplitudeScale:1.2},
      shatter:{axisBias:[1,1,1],slabChance:.16,target:[.22,.72],shearScale:1,amplitudeScale:1}
    }[archetype]||{axisBias:[1,1,1],slabChance:.16,target:[.22,.72],shearScale:1,amplitudeScale:1};
    labels.archetype=archetype;""")

rep("""      const order=[0,1,2].map(d=>({d,score:(hi[d]-lo[d])*(.75+rand()*.45+.18*Math.abs(axis[d]||0))})).sort((a,b)=>b.score-a.score);
      let halves=null;
      for(const {d} of order){
        if(hi[d]===lo[d])continue;
        const u=(d+1)%3,w=(d+2)%3,slab=rand()<.16;
        const su=slab?0:(.18+rand()*.42)*(rand()<.5?-1:1),sw=slab?0:(.12+rand()*.30)*(rand()<.5?-1:1);
        const patch=5+Math.floor(rand()*5),amplitude=slab?0:Math.min(1.25,(hi[d]-lo[d])*.07),seed=state|0;""",
"""      const order=[0,1,2].map(d=>({d,score:(hi[d]-lo[d])*(.75+rand()*.45+.18*Math.abs(axis[d]||0))*profile.axisBias[d]})).filter(o=>o.score>0).sort((a,b)=>b.score-a.score);
      let halves=null;
      for(const {d} of order){
        if(hi[d]===lo[d])continue;
        const u=(d+1)%3,w=(d+2)%3,slab=rand()<profile.slabChance;
        const su=slab?0:(.18+rand()*.42)*profile.shearScale*(rand()<.5?-1:1),sw=slab?0:(.12+rand()*.30)*profile.shearScale*(rand()<.5?-1:1);
        const patch=5+Math.floor(rand()*5),amplitude=slab?0:Math.min(1.25,(hi[d]-lo[d])*.07*profile.amplitudeScale),seed=state|0;""")

rep("""        const target=current.length*(.22+rand()*.5);let sum=0,at=0;""",
    """        const target=current.length*(profile.target[0]+rand()*(profile.target[1]-profile.target[0]));let sum=0,at=0;""")

rep("""fracture:fracture?{regions:groups.length,requested:fracture.pieces}:null,ms:performance.now()-start};""",
    """fracture:fracture?{regions:groups.length,requested:fracture.pieces,archetype:labels?.archetype||null}:null,ms:performance.now()-start};""")

# ---------------------------------------------------------------- main thread state
rep("economy={rescuedEdits:0,lightened:0,reactivated:0,recycled:0,jamBreaks:0,splashArmed:0,lastAdmission:null,lastSplash:null",
    "economy={rescuedEdits:0,lightened:0,reactivated:0,recycled:0,jamBreaks:0,splashArmed:0,twistRips:0,crushes:0,lastAdmission:null,lastSplash:null")

# Edit context carries crush intent; commit implodes the new pieces toward the grip.
rep("e.context={pullSerial:op.type==='pull'?op.gripSerial:null,yankSerial:op.yankSerial??null,yankWitness:op.yankWitness??null,",
    "e.context={pullSerial:op.type==='pull'?op.gripSerial:null,yankSerial:op.yankSerial??null,yankWitness:op.yankWitness??null,crushPoint:first.crushPoint??op.crushPoint??null,crushRadius:first.crushRadius??op.crushRadius??null,")

rep("""    // Rebind before deleting the old body. No render/physics frame sees a
    // dangling handle, stale local point, or a vanished tether.
    transferGrab(liveGrip,wantedGrip);""",
"""    if(ctx.crushPoint){
      // Crush: freshly broken material implodes toward the grip instead of scattering.
      const cp=V(...ctx.crushPoint),reach=ctx.crushRadius||1;
      for(const c of newEntities){
        if(c.anchored)continue;const com=V().copy(c.body.worldCom()),d=cp.clone().sub(com),dist=d.length();if(dist<.02)continue;d.normalize();
        const speed=Math.min(6,(c.kind==='chip'?4.5:2.6)*(1+.5*(1-Math.min(1,dist/(reach+.5)))));
        if(c.lightweight){c.lightV.addScaledVector(d,speed);c.lightSettled=false;}else c.body.applyImpulse(d.multiplyScalar(c.body.mass()*speed),true);
      }
      if(result.fracture)lastFracture={archetype:result.fracture.archetype,regions:result.fracture.regions,via:'crush',id:e.id,time:simTime};
    }else if(result.fracture)lastFracture={archetype:result.fracture.archetype,regions:result.fracture.regions,via:ctx.yankSerial?'yank':ctx.impactIds?.length?'impact':'edit',id:e.id,time:simTime};
    // Rebind before deleting the old body. No render/physics frame sees a
    // dangling handle, stale local point, or a vanished tether.
    transferGrab(liveGrip,wantedGrip);""")

rep("bestChain=0,lastBoom=-10,fractures=0,stressFailures=0,queuedDrops=0",
    "bestChain=0,lastBoom=-10,fractures=0,stressFailures=0,queuedDrops=0,lastFracture=null,twistMouse=0,lastPointerX=null,twistInput=0")

# ---------------------------------------------------------------- grab state + twist + crush
rep("grab={entity:e,local:V(...anchor.point).multiplyScalar(S),cell:anchor.cell,distance:hit.distance,serial:++grabSequence,charge:0,gestureAge:0,ripCooldown:0,focusSpent:false};",
    "grab={entity:e,local:V(...anchor.point).multiplyScalar(S),cell:anchor.cell,distance:hit.distance,serial:++grabSequence,charge:0,gestureAge:0,ripCooldown:0,focusSpent:false,twistCharge:0,twistRip:0,twistCreak:0,lastCrush:-9};")

rep("""  function requestMagnetRip(sling=false){
    const g=grab,e=g?.entity;
    if(!g||!e||!godPull||paused||inputSuspended||!entities.has(e.id))return false;
    if(sling)g.slingAfterRip=true;
    // One proposal per body. Pull intents are reevaluated from the LIVE grip,
    // never queued and duplicated onto every resulting fragment.
    if(e.pending){worker.promote?.(e.id);return false;}
    const p=g.local.clone().applyQuaternion(Q().copy(e.body.rotation())).add(V().copy(e.body.translation()));
    const direction=g.slingAfterRip?pointerRay().direction.clone():(g.goal||p).clone().sub(p);
    if(direction.lengthSq()<1e-8)return false;
    direction.normalize();""",
"""  // Horizontal tangent of the grip point about the body's vertical axis: the
  // direction a corkscrew twist loads the supports in. Sign picks the handedness.
  function twistTangent(e,p,sign){
    const q=Q().copy(e.body.rotation()),center=V(...e.dims).multiplyScalar(S*.5).applyQuaternion(q).add(V().copy(e.body.translation()));
    const arm=p.clone().sub(center);arm.y=0;
    if(arm.lengthSq()<.04)arm.set(1,0,0);
    return V(0,1,0).cross(arm).normalize().multiplyScalar(sign>0?1:-1).add(V(0,.22,0)).normalize();
  }
  function requestMagnetRip(sling=false,twist=0){
    const g=grab,e=g?.entity;
    if(!g||!e||!godPull||paused||inputSuspended||!entities.has(e.id))return false;
    if(sling)g.slingAfterRip=true;
    // One proposal per body. Pull intents are reevaluated from the LIVE grip,
    // never queued and duplicated onto every resulting fragment.
    if(e.pending){worker.promote?.(e.id);return false;}
    const p=g.local.clone().applyQuaternion(Q().copy(e.body.rotation())).add(V().copy(e.body.translation()));
    const direction=twist?twistTangent(e,p,twist):g.slingAfterRip?pointerRay().direction.clone():(g.goal||p).clone().sub(p);
    if(direction.lengthSq()<1e-8)return false;
    direction.normalize();if(twist){g.twistRip=twist;g.twistCharge=0;}""")

rep("""      if(!grab.entity.anchored){
        const e=grab.entity,point=grab.local.clone().applyQuaternion(Q().copy(e.body.rotation())).add(V().copy(e.body.translation()));
        e.body.applyImpulseAtPoint(direction.multiplyScalar(e.body.mass()*Math.min(7,2.2*pullStrength)),point,true);
      }
    }""",
"""      if(!grab.entity.anchored){
        const e=grab.entity,point=grab.local.clone().applyQuaternion(Q().copy(e.body.rotation())).add(V().copy(e.body.translation()));
        e.body.applyImpulseAtPoint(direction.multiplyScalar(e.body.mass()*Math.min(7,2.2*pullStrength)),point,true);
        if(grab.twistRip){
          // The sheared section keeps corkscrewing: angular impulse about vertical.
          const dims=V(...e.dims).multiplyScalar(S),inertia=e.body.mass()*(dims.x*dims.x+dims.z*dims.z)/12;
          e.body.applyTorqueImpulse(V(0,(grab.twistRip>0?1:-1)*inertia*2.6,0),true);economy.twistRips++;
        }
      }
      grab.twistRip=0;
    }""")

rep("""    const focused=keys.has('ShiftLeft')||keys.has('ShiftRight');
    const yank=magnetControl.step(g,{extension,dt:DT,anchored:e.anchored,focused,enabled:godPull,suspended:inputSuspended,pending:e.pending,strength:pullStrength});
    if(yank||g.slingAfterRip&&!e.pending)requestMagnetRip();""",
"""    const focused=keys.has('ShiftLeft')||keys.has('ShiftRight');
    const yank=magnetControl.step(g,{extension,dt:DT,anchored:e.anchored,focused,enabled:godPull,suspended:inputSuspended,pending:e.pending,strength:pullStrength});
    if(yank||g.slingAfterRip&&!e.pending)requestMagnetRip();
    // TWIST. Q/E or Alt + mouse X corkscrew the held material about vertical.
    // Anchored: torsion charges a shear rip. Loose: drive angular velocity.
    const altHeld=keys.has('AltLeft')||keys.has('AltRight');
    let twist=(Number(keys.has('KeyE'))-Number(keys.has('KeyQ')))+(altHeld?Math.max(-1,Math.min(1,twistMouse*.045)):0);
    twistMouse=0;twist=Math.max(-1,Math.min(1,twist));if(inputSuspended||paused)twist=0;twistInput=twist;
    if(twist&&e.anchored&&godPull&&!e.pending){
      g.twistCharge=Math.min(1,(g.twistCharge||0)+DT*Math.abs(twist)*(1.1+.12*pullStrength));
      if(simTime-(g.twistCreak||0)>.32){g.twistCreak=simTime;sound('creak');addShake(.02);}
      if(g.twistCharge>=1)requestMagnetRip(false,twist);
    }else if(g.twistCharge>0)g.twistCharge=Math.max(0,g.twistCharge-DT*1.4);
    if(!e.anchored&&twist){
      const dims=V(...e.dims).multiplyScalar(S),inertia=Math.max(1e-3,b.mass()*(dims.x*dims.x+dims.z*dims.z)/12);
      const target=twist*(1.6+.28*pullStrength),current=b.angvel().y;
      b.applyTorqueImpulse(V(0,Math.max(-inertia*40*DT,Math.min(inertia*40*DT,inertia*(target-current)*9*DT)),0),true);
      if(simTime-(g.twistCreak||0)>.5){g.twistCreak=simTime;sound('creak');}
    }
    // CRUSH. Holding middle mouse keeps compacting around the grip.
    if((mouseButtons&4)&&simTime-(g.lastCrush||-9)>.42)crushGrab();""")

rep("""  function throwGrab(){""",
"""  // CRUSH: fracture a small region around the grip (spall archetype) and pull
  // the pieces and any nearby loose rubble inward. No explosive charge; the
  // hand supplies the force. Works on anchored walls (crater + chunks) and on
  // held loose bodies (they compact against the grip).
  function crushGrab(){
    const g=grab,e=g?.entity;
    if(!g||!e||paused||inputSuspended||!godPull||!entities.has(e.id))return false;
    if(simTime-(g.lastCrush||-9)<.42)return false;
    if(e.pending){worker.promote?.(e.id);return false;}
    const q=Q().copy(e.body.rotation()),p=g.local.clone().applyQuaternion(q).add(V().copy(e.body.translation()));
    const r=Math.min(2.8,1.15+.14*pullStrength),pieces=Math.max(3,Math.min(9,Math.round(e.count/380)));
    // The queue rebuilds ops per cut, so crush intent rides on the cut itself.
    const op={type:'batch',chips:5,ops:[{type:'fracture',center:g.local.clone().multiplyScalar(1/S).toArray(),radius:r/S,pieces,seed:e.id*131+Math.round(simTime*60),uniform:true,archetype:'spall',scatterEnergy:0,impactAxis:[0,-1,0],sourceCount:e.count,priority:90,crushPoint:p.toArray(),crushRadius:r}]};
    if(!requestEdit(e,op,0))return false;
    g.lastCrush=simTime;economy.crushes++;
    for(const id of sceneIndex.query(p.toArray(),r*2.2)){
      const o=entities.get(id);if(!o||o.anchored||o===e||o.pending)continue;
      const com=V().copy(o.body.worldCom()),d=p.clone().sub(com),dist=d.length();if(dist>r*2.2||dist<.05)continue;d.normalize();
      const speed=(o.kind==='chip'?5:2.2)/(1+dist/(r+1));
      if(o.lightweight){o.lightV.addScaledVector(d,speed);o.lightSettled=false;}else o.body.applyImpulse(d.multiplyScalar(o.body.mass()*speed),true);
    }
    sound('crush');addShake(.14);impactEffects(p,V(0,1,0),14);g.snapFlash=simTime+.2;
    return true;
  }
  function throwGrab(){""")

# Middle mouse while gripping crushes instead of starting a camera pan drag.
rep("""    if((e.buttons&6)&&!(previous&6))drag={x:e.clientX,y:e.clientY,pan:!!(e.buttons&4)};
    if(!(e.buttons&6))drag=null;""",
"""    if((e.buttons&4)&&!(previous&4)&&grab&&tool===3){crushGrab();}
    else if((e.buttons&6)&&!(previous&6))drag={x:e.clientX,y:e.clientY,pan:!!(e.buttons&4)};
    if(!(e.buttons&6))drag=null;""")

# Q/E twist while gripping instead of flying up/down; Alt is a held modifier, not a browser menu key.
rep("up:Number(keys.has('Space')||keys.has('KeyE'))-Number(keys.has('ControlLeft')||keys.has('ControlRight')||keys.has('KeyQ')),",
    "up:Number(keys.has('Space')||(!grab&&keys.has('KeyE')))-Number(keys.has('ControlLeft')||keys.has('ControlRight')||(!grab&&keys.has('KeyQ'))),")
rep("const move=V(Math.cos(cam.yaw)*dx-Math.sin(cam.yaw)*dz,Number(keys.has('KeyE'))-Number(keys.has('KeyQ')),-Math.sin(cam.yaw)*dx-Math.cos(cam.yaw)*dz);",
    "const move=V(Math.cos(cam.yaw)*dx-Math.sin(cam.yaw)*dz,Number(!grab&&keys.has('KeyE'))-Number(!grab&&keys.has('KeyQ')),-Math.sin(cam.yaw)*dx-Math.cos(cam.yaw)*dz);")
rep("""  document.addEventListener('keydown',e=>{
    if($('confirm-reset').open||e.defaultPrevented||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||e.target.closest?.('.panel'))return;""",
"""  document.addEventListener('keydown',e=>{
    if((e.code==='AltLeft'||e.code==='AltRight')&&!$('confirm-reset').open&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){if(tool===3)e.preventDefault();keys.add(e.code);return;}
    if($('confirm-reset').open||e.defaultPrevented||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||e.target.closest?.('.panel'))return;""")

# Mouse X deltas feed Alt-twist in both free-pointer and locked-look modes.
rep("""    const p=arenaPointerCoordinates(ev.clientX,ev.clientY,canvas.getBoundingClientRect());pointerNDC.set(p.x,p.y);pointerInside=p.inside;edgeX=p.edgeX;edgeY=p.edgeY;
  }""",
"""    const p=arenaPointerCoordinates(ev.clientX,ev.clientY,canvas.getBoundingClientRect());pointerNDC.set(p.x,p.y);pointerInside=p.inside;edgeX=p.edgeX;edgeY=p.edgeY;
    if(Number.isFinite(ev.clientX)){if(lastPointerX!=null&&(keys.has('AltLeft')||keys.has('AltRight')))twistMouse+=ev.clientX-lastPointerX;lastPointerX=ev.clientX;}
  }""")

# Pull meter shows torsion too.
rep("""    $('pull-meter').classList.toggle('visible',!!grab&&(grab.entity.anchored||grab.charge>0));document.body.classList.toggle('pulling',!!grab&&(grab.entity.anchored||grab.charge>0));
    if(grab){
      const charge=grab.charge||0;
      $('pull-fill').style.width=(charge*100)+'%';$('pull-fill').style.transform='none';
      $('pull-state').textContent=inputSuspended?'Grip held':grab.entity.pending&&charge>=1?'Snapping…':charge>.02?'Pull · '+Math.round(charge*100)+'%':godPull?'Pull to snap':'Rip disabled';""",
"""    $('pull-meter').classList.toggle('visible',!!grab&&(grab.entity.anchored||grab.charge>0||grab.twistCharge>0));document.body.classList.toggle('pulling',!!grab&&(grab.entity.anchored||grab.charge>0||grab.twistCharge>0));
    if(grab){
      const twisting=(grab.twistCharge||0)>(grab.charge||0),charge=Math.max(grab.charge||0,grab.twistCharge||0);
      $('pull-fill').style.width=(charge*100)+'%';$('pull-fill').style.transform='none';
      $('pull-state').textContent=inputSuspended?'Grip held':grab.entity.pending&&charge>=1?(twisting?'Shearing…':'Snapping…'):twisting?'Twist · '+Math.round(charge*100)+'%':charge>.02?'Pull · '+Math.round(charge*100)+'%':godPull?'Pull to snap · Q/E twist · MMB crush':'Rip disabled';""")

# Sound for crush.
rep("rip:[.28,2200,.33,78],grab:[.12,800,.06,130]}", "rip:[.28,2200,.33,78],grab:[.12,800,.06,130],crush:[.34,880,.36,56]}")

# Hints and help copy.
rep("'Pull to rip · Shift peel · X throw · K latch'", "'Pull to rip · Shift peel · Q/E twist · MMB crush · X throw'")
rep("'God hand. Pull to rip supports · Shift: peel a section · X: rip + throw · K: latch.'",
    "'God hand. Pull to rip supports · Q/E or Alt+mouse: twist until supports shear · Middle mouse: crush around the grip · Shift: peel · X: rip + throw · K: latch.'")
rep('title="God hand · 5 · Pull to rip / Shift to peel"', 'title="God hand · 5 · Pull to rip / Q E twist / MMB crush"')
rep('aria-label="God hand · 5 · Pull to rip / Shift to peel"', 'aria-label="God hand · 5 · Pull to rip / Q E twist / MMB crush"')

# Public hooks for QA and scripts.
rep("    releaseGrab:()=>releaseGrab(),edit:(id,op)=>requestEdit(entities.get(id),op,0),",
    "    releaseGrab:()=>releaseGrab(),edit:(id,op)=>requestEdit(entities.get(id),op,0),\n"
    "    setTwist:rate=>{twistOverride=Number.isFinite(rate)?Math.max(-1,Math.min(1,rate)):0;},crush:()=>crushGrab(),get lastFracture(){return lastFracture?{...lastFracture}:null;},get twistState(){const g=grab;return {input:twistInput,override:twistOverride,charge:g?.twistCharge||0,rip:g?.twistRip||0,twistRips:economy.twistRips,crushes:economy.crushes};},")
rep("lastFracture=null,twistMouse=0,lastPointerX=null,twistInput=0", "lastFracture=null,twistMouse=0,lastPointerX=null,twistInput=0,twistOverride=0")
rep("    twistMouse=0;twist=Math.max(-1,Math.min(1,twist));if(inputSuspended||paused)twist=0;twistInput=twist;",
    "    twistMouse=0;if(twistOverride)twist=twistOverride;twist=Math.max(-1,Math.min(1,twist));if(inputSuspended||paused)twist=0;twistInput=twist;")


# Alt + mouse in locked look twists instead of yawing the camera.
rep("onDelta:(dx,dy)=>{cam.yaw-=dx*.0025;", "onDelta:(dx,dy)=>{if(grab&&(keys.has('AltLeft')||keys.has('AltRight'))){twistMouse+=dx;return;}cam.yaw-=dx*.0025;")

# Version bump.
rep('0.11.3', '0.12.0', count=10)

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(orig), '->', len(s))
