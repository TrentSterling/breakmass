// Test-only observation of the real loop. Hosted run 39946112848 advanced 52
// ticks in 20.64 s: release published at 5, fuel 36 armed at 54, wait ended at 55.
// 49 release-to-impact ticks + ceil(.06*60)=4 + ceil(.135*60)=9 = 62 ticks
// for the expected two-drum chain, conditional on splash reach. From the trace
// start (tick 3) this is 64. Allow 90 ticks (26 headroom), never just the first
// fuse. The separate 90 s watchdog bounds stalled/slow reads and loops; neither
// budget proves acceptable player-facing latency or guarantees a chain.
export const handChainBudget=Object.freeze({ticks:90,wallMs:90000,everyMs:250});

export function readHandChainProgress(){
  const F=window.BREAKMASS,s=F.stats;
  return {at:performance.now(),frameAt:s.t,simTime:s.simTime,tick:Math.round(s.simTime*60),
    ready:F.ready,scene:F.scenePreset,score:F.scoreDiagnostics,queue:{errors:F.liveQueue.errors},
    published:{barrels:s.barrels,slings:s.slings,lastGrabRelease:s.lastGrabRelease},
    impacts:F.impactDiagnostics.audit.traces,
    fuels:F.inspect().filter(e=>e.id===36&&e.explosive).map(e=>({id:e.id,rootId:e.rootId,count:e.count}))};
}

export async function waitForHandChain(read,receipts,start,{ticks=handChainBudget.ticks,
  wallMs=handChainBudget.wallMs,everyMs=handChainBudget.everyMs,
  now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const began=now(),r={label:'hand-triggered fuel chain',passed:false,budget:{ticks,wallMs,everyMs},samples:[]};receipts.push(r);
  let watchdog,pollTimer,epoch,lastTick,lastAt,lastFrame;
  const expired=()=>Error(r.label+': wall watchdog expired after '+wallMs+' ms');
  const compact=s=>({at:s.at,frameAt:s.frameAt,tick:s.tick,simTime:s.simTime,barrels:s.published.barrels,
    slings:s.published.slings,lastGrabRelease:s.published.lastGrabRelease,score:s.score,fuels:s.fuels,
    impactEpochs:[...new Set(s.impacts.map(t=>t.epoch))]});
  const validate=s=>{
    if(!s||![s.at,s.frameAt,s.simTime].every(Number.isFinite)||!Number.isInteger(s.tick)||s.tick<0||
      Math.abs(s.tick/60-s.simTime)>1e-8||!Array.isArray(s.impacts)||!Array.isArray(s.fuels)||
      s.fuels.some(e=>!e||![e.id,e.rootId,e.count].every(n=>Number.isInteger(n)&&n>=0))||
      !s.queue||![s.published?.barrels,s.published?.slings].every(n=>Number.isInteger(n)&&n>=0)||
      s.impacts.some(t=>!Number.isInteger(t.id)||!Number.isInteger(t.epoch)))throw Error('Malformed hand-chain progress');
    if(s.queue.errors)throw Error('Hand-chain runtime error: '+s.queue.errors);
    if(s.ready!==true||s.scene!=='district')throw Error('Hand-chain scene is not ready');
    if(s.score?.missionTower!==false||s.score?.handsContract?.status!=='ready'||s.score?.shotCount!==0)throw Error('Hand-chain eligibility changed');
    const epochs=[...new Set(s.impacts.map(t=>t.epoch))];
    if(epochs.length>1||(epoch!==undefined&&epochs[0]!==epoch))throw Error('Hand-chain observed generation changed');
    epoch??=epochs[0];
    if(s.tick<lastTick||s.at<lastAt||s.frameAt<lastFrame)throw Error('Hand-chain clock moved backwards');
    lastTick=s.tick;lastAt=s.at;lastFrame=s.frameAt;
  };
  try{
    if(!Number.isInteger(ticks)||ticks<=0||!Number.isFinite(wallMs)||wallMs<=0||!Number.isFinite(everyMs)||everyMs<=0)throw Error('Invalid hand-chain budget');
    validate(start);r.start=compact(start);
    if(start.published.barrels!==0||start.published.slings!==0||!start.fuels.some(e=>e.id===36&&e.rootId===36&&e.count>0&&e.armed===false&&e.fuse===null))throw Error('Expected fresh original Fuel drum 4');
    const afterId=Math.max(0,...start.impacts.map(t=>t.id));
    const deadline=new Promise((_,reject)=>{watchdog=setTimer(()=>reject(expired()),wallMs);});
    for(;;){
      const s=await Promise.race([Promise.resolve().then(read),deadline]);
      if(now()-began>=wallMs)throw expired();
      validate(s);r.end=compact(s);r.elapsedTicks=s.tick-start.tick;r.samples.push(r.end);
      if(r.elapsedTicks>ticks)throw Error('Hand-chain simulation budget exceeded');
      r.targetImpact??=s.impacts.find(t=>t.id>afterId&&t.epoch===epoch&&t.entity===36&&t.root===36&&
        t.contactAt>=start.at&&t.contactAt<=s.at&&t.accepted===true&&t.reason==='fuel-crush'&&t.status==='armed');
      // Preserve barrels>=2 and the post-wait eligibility assertions. Also reject
      // unrelated explosions: require the newly thrown target's accepted impact
      // and removal, plus publication of the actual sling. Never step physics.
      if(s.published.barrels>=2&&r.targetImpact&&s.published.slings>start.published.slings&&
        s.published.lastGrabRelease==='magnet sling'&&!s.fuels.some(e=>e.id===36)){
        r.passed=true;return s;
      }
      if(r.elapsedTicks===ticks)throw Error('Hand-chain simulation budget exhausted');
      await Promise.race([new Promise(resolve=>{pollTimer=setTimer(resolve,everyMs);}),deadline]);
    }
  }catch(error){r.error=String(error.message||error);throw error;}
  finally{clearTimer(watchdog);clearTimer(pollTimer);r.elapsedWallMs=now()-began;}
}
