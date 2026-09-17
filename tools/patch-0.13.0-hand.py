# v0.13.0 lane "hand": God Hand twist and crush get read. Twist: dust/chips shear off the
# grip along the shear plane while torsion charges on an anchored body, the creak's pitch
# rises with charge, and the commit fires a visible burst at the sheared seam plus a
# stronger torque so the piece actually corkscrews away. Crush: a short inward dust
# implosion lands on every request (including the 0.42 s pump repeat) alongside a heavier
# crunch, and the existing (previously unrendered) snapFlash now drives a real halo pulse.
# QA: inspect() exposes angvel so the twist test can assert the sheared piece is actually
# spinning, not just that a torque impulse was requested.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# sound(): an optional per-call pitch multiplier (rising creak while torsion charges).
# Default 1 leaves every existing call site untouched.
rep("""  function sound(type){
    if(!$('sound').checked||voices>36)return;""",
    """  function sound(type,pitch=1){
    if(!$('sound').checked||voices>36)return;""")
# Re-anchored: the juice lane (applied earlier this integration) already added the
# 'impact-metal'/'impact-concrete'/'impact-timber' entries to this same cfg table.
# Keep those intact; this lane only reweights 'crush' and adds the pitch multiplier.
rep("""      const cfg={rifle:[.095,2400,.21,145],shotgun:[.24,1700,.4,85],blast:[.7,540,.55,48],launch:[.3,900,.28,95],collapse:[.48,750,.25,62],creak:[.3,1500,.07,180],cut:[.08,2500,.1,0],rip:[.28,2200,.33,78],grab:[.12,800,.06,130],crush:[.34,880,.36,56],'impact-metal':[.12,2600,.26,140],'impact-concrete':[.34,560,.32,50],'impact-timber':[.09,2000,.16,0]}[type]||[.1,1200,.1,0];
      const [duration,freq,volume,bass]=cfg,t=audio.currentTime;""",
    """      const cfg={rifle:[.095,2400,.21,145],shotgun:[.24,1700,.4,85],blast:[.7,540,.55,48],launch:[.3,900,.28,95],collapse:[.48,750,.25,62],creak:[.3,1500,.07,180],cut:[.08,2500,.1,0],rip:[.28,2200,.33,78],grab:[.12,800,.06,130],crush:[.4,720,.44,40],'impact-metal':[.12,2600,.26,140],'impact-concrete':[.34,560,.32,50],'impact-timber':[.09,2000,.16,0]}[type]||[.1,1200,.1,0];
      const [duration,freqBase,volume,bassBase]=cfg,freq=freqBase*pitch,bass=bassBase*pitch,t=audio.currentTime;""")

# grabStep twist block: dust/chips along the shear plane while torsion charges on an
# anchored body, creak pitch rises with charge (same 0.32 s cadence, no new cooldown).
rep("""    if(twist&&e.anchored&&godPull&&!e.pending){
      g.twistCharge=Math.min(1,(g.twistCharge||0)+DT*Math.abs(twist)*(1.1+.12*pullStrength));
      if(simTime-(g.twistCreak||0)>.32){g.twistCreak=simTime;sound('creak');addShake(.02);}
      if(g.twistCharge>=1)requestMagnetRip(false,twist);
    }else if(g.twistCharge>0)g.twistCharge=Math.max(0,g.twistCharge-DT*1.4);""",
    """    if(twist&&e.anchored&&godPull&&!e.pending){
      g.twistCharge=Math.min(1,(g.twistCharge||0)+DT*Math.abs(twist)*(1.1+.12*pullStrength));
      if(simTime-(g.twistDust||0)>.055){
        g.twistDust=simTime;const shear=twistTangent(e,p,twist);
        for(let i=0;i<2;i++)cosmetic(p.clone().addScaledVector(shear,(Math.random()-.5)*.35),shear.clone().multiplyScalar(2.1+Math.random()*1.3).add(V((Math.random()-.5)*.5,Math.random()*.6,(Math.random()-.5)*.5)),.028+Math.random()*.03,i?0xb7ad8c:0xead8a7,.22+Math.random()*.18);
      }
      if(simTime-(g.twistCreak||0)>.32){g.twistCreak=simTime;sound('creak',1+g.twistCharge*.6);addShake(.02);}
      if(g.twistCharge>=1)requestMagnetRip(false,twist);
    }else if(g.twistCharge>0)g.twistCharge=Math.max(0,g.twistCharge-DT*1.4);""")

# pullFeedback twistRip branch: a visible burst at the sheared seam, and a stronger torque
# so the corkscrew is unmistakable (was 2.6, undershot ~1 rad/s on some fragment shapes).
rep("""        if(grab.twistRip){
          // The sheared section keeps corkscrewing: angular impulse about vertical.
          const dims=V(...e.dims).multiplyScalar(S),inertia=e.body.mass()*(dims.x*dims.x+dims.z*dims.z)/12;
          e.body.applyTorqueImpulse(V(0,(grab.twistRip>0?1:-1)*inertia*2.6,0),true);economy.twistRips++;
        }""",
    """        if(grab.twistRip){
          // The sheared section keeps corkscrewing: angular impulse about vertical.
          const dims=V(...e.dims).multiplyScalar(S),inertia=e.body.mass()*(dims.x*dims.x+dims.z*dims.z)/12;
          e.body.applyTorqueImpulse(V(0,(grab.twistRip>0?1:-1)*inertia*4.4,0),true);economy.twistRips++;
          const seam=grab.local.clone().applyQuaternion(Q().copy(e.body.rotation())).add(V().copy(e.body.translation()));
          for(let i=0;i<16;i++){const angle=Math.random()*Math.PI*2,spd=2+Math.random()*4;cosmetic(seam,V(Math.cos(angle)*spd,1+Math.random()*2.5,Math.sin(angle)*spd),.05+Math.random()*.06,i%3?0xf2b554:0xffecd0,.22+Math.random()*.28);}
          addShake(.1);
        }""")

# crushGrab(): a short inward implosion on every request (the 0.42 s repeat pumps it), plus
# the raised snapFlash keeps the grip halo pulsing (wired below).
rep("""    sound('crush');addShake(.14);impactEffects(p,V(0,1,0),14);g.snapFlash=simTime+.2;
    return true;
  }
  function throwGrab(){""",
    """    for(let i=0;i<10;i++){const angle=Math.random()*Math.PI*2,rad=r*(.55+Math.random()*.5),h=(Math.random()-.5)*r*.5,from=p.clone().add(V(Math.cos(angle)*rad,h,Math.sin(angle)*rad));cosmetic(from,p.clone().sub(from).normalize().multiplyScalar(3+Math.random()*3),.03+Math.random()*.035,i%3?0xb7ad8c:0x9f8a69,.12+Math.random()*.1,i%3===0);}
    sound('crush');addShake(.14);impactEffects(p,V(0,1,0),14);g.snapFlash=simTime+.22;
    return true;
  }
  function throwGrab(){""")

# Grip halo: snapFlash was set on rip-commit and on every crush but never actually drawn.
# Give it a real pulse (scale + opacity) so twist rips and crush pumps read as an impact.
rep("""      gripHalo.position.copy(b);gripHalo.quaternion.copy(camera.quaternion);gripHalo.scale.setScalar(Math.max(1,camera.position.distanceTo(b)*.015)*(1+charge*.4));""",
    """      const flash=Math.max(0,(grab.snapFlash||0)-simTime);
      gripHalo.position.copy(b);gripHalo.quaternion.copy(camera.quaternion);gripHalo.scale.setScalar(Math.max(1,camera.position.distanceTo(b)*.015)*(1+charge*.4+flash*2.6));gripHalo.material.opacity=Math.min(1,.9+flash*.4);""")

# inspect(): expose angular velocity so QA can assert the sheared piece is actually
# corkscrewing, not just that a torque impulse was requested.
rep("""rotation:e.body.rotation(),position:e.body.translation(),mass:e.body.mass(),sleeping:e.body.isSleeping()}))};""",
    """rotation:e.body.rotation(),position:e.body.translation(),angvel:e.body.angvel(),mass:e.body.mass(),sleeping:e.body.isSleeping()}))};""")

# QA: measure the actual spin, don't just trust the torque request.
rep("""        const held=F.grab,state=F.twistState;F.clearGrabTarget();F.releaseGrab();await quiet();snap('04b-twist-shear');
        assert(state.twistRips>0,'Sheared piece received no torsion impulse');
        return {chargeMs,heldId:held.id,twistRips:state.twistRips,lastPull:F.pullDiagnostics.lastPull};""",
    """        const held=F.grab,state=F.twistState,spun=F.inspect().find(x=>x.id===held.id);
        const av=spun?.angvel,angularVelocity=av?{x:av.x,y:av.y,z:av.z}:{x:0,y:0,z:0};
        F.clearGrabTarget();F.releaseGrab();await quiet();snap('04b-twist-shear');
        assert(state.twistRips>0,'Sheared piece received no torsion impulse');
        assert(Math.abs(angularVelocity.y)>=.9,'Sheared piece did not corkscrew: angvel.y='+angularVelocity.y.toFixed(2));
        return {chargeMs,heldId:held.id,twistRips:state.twistRips,angularVelocity,lastPull:F.pullDiagnostics.lastPull};""")

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
