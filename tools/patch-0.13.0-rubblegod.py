# v0.13.0 rubblegod lane: Rubble God becomes a real mode, not just 4 nudged sliders.
# Sandbox stays byte-identical. New knobs (shotgun pellets, bomb-rain volley shape,
# structural failure threshold, adaptive rubble budget target) move from hardcoded
# constants into createSandboxTuning's per-preset config, and BREAKMASS_POWERS'
# preset switch (button click, quick-toggle, or a saved choice restored on boot)
# pushes the active preset into that config through one new window.BREAKMASS.applyPreset
# bridge, so it takes effect immediately and survives Rebuild district.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# 1) createSandboxTuning: presets, not one frozen config. Sandbox numbers unchanged;
# Rubble God gets its own blast/pull/impact/pellet/rain/failure/budget numbers. config
# is exposed as a getter so every existing `sandbox.config.X` read site (breach,
# rainPlan, shotgun, rain cooldown/interval, the QA blast default) picks up whichever
# preset is active without needing to change those call sites.
rep("""function createSandboxTuning(){
  const config=Object.freeze({blastRadius:2.8,blastPower:1.5,pullStrength:6,impactScale:1.6,shotgunInterval:.20,rainCount:10,rainInterval:.05,rainCooldown:.8,rainRadius:6.5,rainHeight:26,rainSpeed:36});
  function crushesFuel({speed,impulse,mass}){return Number.isFinite(speed)&&Number.isFinite(impulse)&&Number.isFinite(mass)&&mass>0&&speed>=2.15&&impulse/mass>=1.8;}
  function breach(hit,radius=config.blastRadius){
    if(!hit?.point||!hit?.normal)return null;
    const r=Math.max(.65,Math.min(6,Number(radius)||config.blastRadius));
    return {point:hit.point.map((x,i)=>x-hit.normal[i]*.28),radius:r,directId:hit.id??null,uniform:true};
  }
  function rainPlan(point){
    if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))return [];
    return Array.from({length:config.rainCount},(_,i)=>{
      const angle=i*2.399963229728653,rad=i?config.rainRadius*Math.sqrt(i/(config.rainCount-1)):0;
      return {origin:[point[0]+Math.cos(angle)*rad,point[1]+config.rainHeight,point[2]+Math.sin(angle)*rad],delay:i*config.rainInterval};
    });
  }
  return {config,crushesFuel,breach,rainPlan};
}
if(typeof module!=='undefined')module.exports=createSandboxTuning;""",
    """function createSandboxTuning(){
  // Sandbox keys/values are identical to the single config object this replaces.
  // shotgunPellets, failThreshold and budgetTarget are new: they name constants that
  // used to be hardcoded elsewhere (12 pellets, ratio>1, the 384 rubble budget seed)
  // so Rubble God can override them too. Sandbox's own numbers do not move.
  const sandboxDefaults=Object.freeze({blastRadius:2.8,blastPower:1.5,pullStrength:6,impactScale:1.6,shotgunPellets:12,shotgunInterval:.20,rainCount:10,rainInterval:.05,rainCooldown:.8,rainRadius:6.5,rainHeight:26,rainSpeed:36,failThreshold:1,budgetTarget:384});
  const presets=Object.freeze({
    sandbox:sandboxDefaults,
    'rubble-god':Object.freeze({...sandboxDefaults,blastRadius:4.5,blastPower:2.5,pullStrength:10,impactScale:2,shotgunPellets:16,rainCount:14,rainInterval:.04,rainCooldown:.6,failThreshold:.65,budgetTarget:576})
  });
  let currentName='sandbox',config=presets.sandbox;
  function setPreset(name){if(presets[name]){currentName=name;config=presets[name];}return config;}
  function crushesFuel({speed,impulse,mass}){return Number.isFinite(speed)&&Number.isFinite(impulse)&&Number.isFinite(mass)&&mass>0&&speed>=2.15&&impulse/mass>=1.8;}
  function breach(hit,radius=config.blastRadius){
    if(!hit?.point||!hit?.normal)return null;
    const r=Math.max(.65,Math.min(6,Number(radius)||config.blastRadius));
    return {point:hit.point.map((x,i)=>x-hit.normal[i]*.28),radius:r,directId:hit.id??null,uniform:true};
  }
  function rainPlan(point){
    if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))return [];
    return Array.from({length:config.rainCount},(_,i)=>{
      const angle=i*2.399963229728653,rad=i?config.rainRadius*Math.sqrt(i/(config.rainCount-1)):0;
      return {origin:[point[0]+Math.cos(angle)*rad,point[1]+config.rainHeight,point[2]+Math.sin(angle)*rad],delay:i*config.rainInterval};
    });
  }
  return {get config(){return config},get preset(){return currentName},setPreset,presets,crushesFuel,breach,rainPlan};
}
if(typeof module!=='undefined')module.exports=createSandboxTuning;""")

# 2) BREAKMASS_POWERS: Rubble God's slider preset gets the bigger blast radius/impulse.
# Pull strength (10x) and impact damage (2x) were already at the target numbers.
rep("""  const presets=Object.freeze({sandbox:Object.freeze({...defaults}),'rubble-god':Object.freeze({...defaults,'pull-strength':10,'impact-scale':2,radius:3.8,power:2.2})});""",
    """  const presets=Object.freeze({sandbox:Object.freeze({...defaults}),'rubble-god':Object.freeze({...defaults,'pull-strength':10,'impact-scale':2,radius:4.5,power:2.5})});""")

# render() is the single choke point every preset switch, quick-toggle and boot-time
# restore already runs through (assign() always ends by calling it). Push the active
# named preset into the game's own tuning object from there so switching mid-game
# applies immediately, and restoring a saved choice on boot applies before first reset().
rep("""    $('power-summary').textContent=v['pull-strength'].toFixed(1)+'× pull · '+v['impact-scale'].toFixed(1)+'× impact · '+v.radius.toFixed(1)+' m blast';
    $('power-value').textContent=v.power.toFixed(1)+'×';
  }""",
    """    $('power-summary').textContent=v['pull-strength'].toFixed(1)+'× pull · '+v['impact-scale'].toFixed(1)+'× impact · '+v.radius.toFixed(1)+' m blast';
    $('power-value').textContent=v.power.toFixed(1)+'×';
    if(current==='sandbox'||current==='rubble-god')window.BREAKMASS?.applyPreset?.(current);
  }""")

# 3) Adaptive rubble budget: expose the starting/target value as a knob instead of a
# bare 384 literal, so Rubble God can seed it +50% forgiving. Sandbox's target (384)
# and every existing active/min/max/decay number are untouched.
rep("""function createAdaptiveBudget(){
  let active=384,ema=0,samples=0,last=0;
  return {get active(){return active;},get solveEMA(){return ema;},
    sample(ms,now){if(!Number.isFinite(ms)||ms<0)return;ema=samples++?ema*.92+ms*.08:ms;
      if(now-last<400||samples<12)return;last=now;
      if(ema<5)active=Math.min(4096,active+32);
      else if(ema>11)active=Math.max(128,Math.floor(active*.88));
    },reset(){active=384;ema=0;samples=0;last=0;}
  };
}""",
    """function createAdaptiveBudget(){
  let target=384,active=384,ema=0,samples=0,last=0;
  return {get active(){return active;},get solveEMA(){return ema;},get target(){return target;},
    sample(ms,now){if(!Number.isFinite(ms)||ms<0)return;ema=samples++?ema*.92+ms*.08:ms;
      if(now-last<400||samples<12)return;last=now;
      if(ema<5)active=Math.min(4096,active+32);
      else if(ema>11)active=Math.max(128,Math.floor(active*.88));
    },reset(){active=target;ema=0;samples=0;last=0;},
    // Loosening (a higher target) applies at once so a mid-game preset switch is felt
    // immediately; tightening only lowers the ceiling, it never yanks rubble that is
    // already allowed to stay active. reset() (Rebuild) always snaps to the target.
    setTarget(next){if(!Number.isFinite(next)||next<=0)return;target=Math.round(next);if(active<target)active=target;}
  };
}""")

# 4) The one structural-failure knob. The real per-cell removal gate (stress ratio>1
# against the material's compression/tension capacity) lives in the physics-worker
# kernel and is intentionally left untouched. This is the main-thread gate that arms
# the failure countdown (toast + e.failAt) once a support is overloaded; arming it
# earlier means less latency between a real worker-side overload and the eventual
# 'stress' edit landing, and earlier warning/creak feedback for the player.
rep("""  function setStress(e,value){
    const was=e.stress?.ratio>1;e.stress=value||null;
    // Groan before the give-way: audible warning once ratio crosses ~0.8, cooled
    // down so a sustained overload does not spam the noise synth every commit.
    if(e.anchored&&structuralFailure&&value?.ratio>.8&&simTime-e.creakAt>1.6){e.creakAt=simTime;sound('creak');}
    if(e.anchored&&structuralFailure&&value?.ratio>1){
      if(!Number.isFinite(e.failAt))e.failAt=simTime+Math.max(.2,.75/Math.sqrt(value.ratio));
      if(!was)toast('OVERLOADED · '+e.name+' · support about to give',2);
    }else e.failAt=Infinity;
  }""",
    """  function setStress(e,value){
    const failThreshold=sandbox.config.failThreshold;
    const was=e.stress?.ratio>failThreshold;e.stress=value||null;
    // Groan before the give-way: audible warning once ratio crosses ~0.8, cooled
    // down so a sustained overload does not spam the noise synth every commit.
    if(e.anchored&&structuralFailure&&value?.ratio>.8&&simTime-e.creakAt>1.6){e.creakAt=simTime;sound('creak');}
    if(e.anchored&&structuralFailure&&value?.ratio>failThreshold){
      if(!Number.isFinite(e.failAt))e.failAt=simTime+Math.max(.2,.75/Math.sqrt(value.ratio));
      if(!was)toast('OVERLOADED · '+e.name+' · support about to give',2);
    }else e.failAt=Infinity;
  }""")

# 5) Scattergun pellet count read from config (12 sandbox, 16 rubble-god) instead of
# a bare literal.
rep("""    const edits=new Map(),pellets=scatter?12:1;shotCount++;""",
    """    const edits=new Map(),pellets=scatter?sandbox.config.shotgunPellets:1;shotCount++;""")

# 6) Bomb rain: the toast already reads sandbox.config.rainCooldown for its own gate;
# its charge count was still a hardcoded '10' that would go stale under Rubble God's
# 14-charge volleys. Text matches config, so Sandbox's toast is unchanged.
rep("""    rainQueue=sandbox.rainPlan(hit.point.toArray()).map(x=>({...x,due:simTime+x.delay}));lastRain=simTime;
    toast('Bomb rain · 10 charges inbound',2);return true;""",
    """    rainQueue=sandbox.rainPlan(hit.point.toArray()).map(x=>({...x,due:simTime+x.delay}));lastRain=simTime;
    toast('Bomb rain · '+sandbox.config.rainCount+' charges inbound',2);return true;""")

# 7) Bridge: BREAKMASS_POWERS lives in its own closure and cannot see `sandbox` or
# `adaptiveBudget`. applyPreset is the one new public hook that lets a preset switch
# reach the game's own tuning object; `tuning` is a QA read of the resulting live
# values (same spirit as the existing pullDiagnostics/impactDiagnostics getters).
rep("""  window.BREAKMASS={version:'0.13.0',physicsMode,notify:toast,""",
    """  window.BREAKMASS={version:'0.13.0',physicsMode,notify:toast,
    applyPreset:name=>{if(!sandbox.presets[name])return false;sandbox.setPreset(name);adaptiveBudget.setTarget(sandbox.config.budgetTarget);return true;},
    get tuning(){return {preset:sandbox.preset,config:{...sandbox.config},budgetTarget:adaptiveBudget.target,budgetActive:adaptiveBudget.active};},""")

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
