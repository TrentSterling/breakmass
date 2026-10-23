// Test-only evidence around the existing hand-chain action/wait. Reads existing
// frame history and live diagnostics; no new frame loop, physics step or input.
export function readFuelWaitTrace(sinceFrameAt=null){
  const F=window.BREAKMASS,s=F.stats,q=F.liveQueue;
  const frame=x=>({at:x.t,simTime:x.simTime,tick:Math.round(x.simTime*60),frameMs:x.frameMs,
    physicsBusy:x.physicsBusy,physicsRoundTripMs:x.physicsRoundTripMs,renderCpuMs:x.renderCpuMs,
    commitFrameMs:x.commitFrameMs,barrels:x.barrels,bestChain:x.bestChain,slings:x.slings,
    shots:x.shots,grabbedId:x.grabbedId,lastGrabRelease:x.lastGrabRelease,
    queued:x.queued,pending:x.pending,workerQueue:x.workerQueue,
    splashArmed:x.economy?.splashArmed,lastSplash:x.economy?.lastSplash});
  const history=F.frames(),selected=sinceFrameAt===null?[]:history.filter(x=>x.t>=sinceFrameAt);
  return {at:performance.now(),frameAt:s.t,simTime:s.simTime,tick:Math.round(s.simTime*60),
    ready:F.ready,scene:F.scenePreset,score:F.scoreDiagnostics,grab:F.grab,camera:F.cameraState,
    published:frame(s),queue:q,impacts:F.impactDiagnostics.audit.traces,
    fuels:F.inspect().filter(e=>e.explosive).map(e=>({id:e.id,rootId:e.rootId,count:e.count,
      armed:Number.isFinite(e.fuse),fuse:Number.isFinite(e.fuse)?e.fuse:null,
      position:e.position,rotation:e.rotation,pending:e.pending,queued:e.queued,sleeping:e.sleeping})),
    history:{requestedFrom:sinceFrameAt,oldestRetainedAt:history[0]?.t??null,
      truncated:sinceFrameAt!==null&&history.length>0&&history[0].t>sinceFrameAt},frames:selected.map(frame)};
}

export async function traceFuelWait(read,receipts,action,{snapshotMs=5000,
  now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const r={label:'hand-triggered fuel chain',passed:false,actionPassed:false,startedAt:now(),snapshotMs};receipts.push(r);
  let failure;
  const capture=async since=>{
    let timer;
    try{
      const s=await Promise.race([Promise.resolve().then(()=>read(since)),new Promise((_,reject)=>{timer=setTimer(()=>reject(Error('Fuel trace snapshot timed out')),snapshotMs);})]);
      if(!s||!Number.isFinite(s.at)||!Number.isFinite(s.frameAt)||!Number.isFinite(s.simTime)||!Number.isInteger(s.tick)||!Array.isArray(s.frames)||!Array.isArray(s.fuels))throw Error('Malformed fuel trace snapshot');
      return s;
    }finally{clearTimer(timer);}
  };
  try{
    if(!Number.isFinite(snapshotMs)||snapshotMs<=0)throw Error('Invalid fuel trace snapshot watchdog');
    r.start=await capture(null);r.actionStartedAt=now();
    await action();r.actionPassed=true;
  }catch(error){failure=error;r.actionError=String(error.stack||error);}
  finally{
    r.actionFinishedAt=now();
    if(r.start)try{r.end=await capture(r.start.frameAt);}catch(error){r.captureError=String(error.stack||error);failure??=error;}
    r.finishedAt=now();
    if(r.end){r.observedTicks=r.end.tick-r.start.tick;r.observedWallMs=r.end.at-r.start.at;}
    // Includes snapshot overhead; actionStartedAt/actionFinishedAt bound the
    // unchanged acquisition + throw + until. No diagnostic read is inserted
    // while holding the drum. History timestamps show actual progress.
    r.passed=!failure;
  }
  if(failure)throw failure;
  return r;
}
