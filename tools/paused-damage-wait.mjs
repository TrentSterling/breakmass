// Test-only observation of the existing QA damage-drain boundary. Never steps,
// flushes, clears, or mutates the game. Paused physics may still have one result.
export function readPausedDamage() {
  const F=window.BREAKMASS,q=F.liveQueue,s=F.stats;
  return {at:performance.now(),ready:F.ready,paused:document.getElementById('pause').getAttribute('aria-pressed')==='true',
    scene:F.scenePreset,simTime:s.simTime,frameAt:s.t,score:F.scoreDiagnostics,
    // These are observed contact generations, not a new runtime epoch getter.
    impactEpochs:[...new Set(F.impactDiagnostics.audit.traces.map(t=>t.epoch))],
    queue:{commits:q.commits,voxelPending:q.voxelPending,physicsBusy:q.physicsBusy,errors:q.errors,objects:q.objects}};
}

export async function waitForPausedDamage(read,receipts,label,{timeoutMs=20000,everyMs=50,
  now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isFinite(everyMs)||everyMs<=0)throw Error('Invalid damage-drain watchdog');
  const started=now(),receipt={label,timeoutMs,passed:false,samples:[]};receipts.push(receipt);
  let watchdog,pollTimer,scene,epoch;
  const timeout=()=>Error(label+': damage queue did not drain within '+timeoutMs+' ms');
  const deadline=new Promise((_,reject)=>{watchdog=setTimer(()=>reject(timeout()),timeoutMs);});
  try {
    for(;;) {
      const s=await Promise.race([Promise.resolve().then(read),deadline]),q=s?.queue;
      receipt.end=s;receipt.start??=s;
      if(now()-started>=timeoutMs)throw timeout();
      if(!s?.ready||s.paused!==true)throw Error(label+': expected a ready, paused scene');
      if(!q||q.errors)throw Error(label+': runtime queue error: '+(q?.errors||'missing queue'));
      if(!Number.isFinite(s.simTime)||!Number.isFinite(s.score?.wreckageValue)||!Array.isArray(s.impactEpochs)||
        s.impactEpochs.some(e=>!Number.isInteger(e))||s.impactEpochs.length>1||typeof q.physicsBusy!=='boolean'||
        ![q.commits,q.voxelPending].every(n=>Number.isInteger(n)&&n>=0)||!Array.isArray(q.objects)||
        q.objects.some(e=>typeof e.pending!=='boolean'||typeof e.needsConnectivity!=='boolean'||!Number.isInteger(e.queued)||e.queued<0))throw Error(label+': malformed damage snapshot');
      scene??=s.scene;
      if(s.scene!==scene||s.simTime<receipt.start.simTime||(epoch!==undefined&&s.impactEpochs[0]!==epoch))throw Error(label+': scene or observed generation changed while waiting');
      epoch??=s.impactEpochs[0];
      receipt.samples.push({elapsedMs:now()-started,at:s.at,simTime:s.simTime,impactEpochs:s.impactEpochs,wreckageValue:s.score.wreckageValue,
        commits:q.commits,voxelPending:q.voxelPending,physicsBusy:q.physicsBusy,
        pending:q.objects.filter(e=>e.pending).length,queued:q.objects.reduce((n,e)=>n+e.queued,0),connectivity:q.objects.filter(e=>e.needsConnectivity).length});
      // Same predicate as BREAKMASS_QA.quiet(), plus the final outstanding tick.
      if(!q.physicsBusy&&!q.commits&&!q.voxelPending&&!q.objects.some(e=>e.pending||e.queued||e.needsConnectivity)) {
        receipt.passed=true;return s;
      }
      await Promise.race([new Promise(resolve=>{pollTimer=setTimer(resolve,everyMs);}),deadline]);
    }
  } catch(error) {
    receipt.error=String(error.message||error);throw error;
  } finally {
    clearTimer(watchdog);clearTimer(pollTimer);receipt.elapsedMs=now()-started;
  }
}
