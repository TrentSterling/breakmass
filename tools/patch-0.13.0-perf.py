# perf lane: measured main-thread wins, no physics/worker/gameplay changes.
#
# 1) telemetry() built its ~90-key stats snapshot via Object.assign(stats,{literal})
#    and then cloned it a SECOND time every frame for the `frames` history via
#    {...stats,t:...}. That is two full object allocations of the same data every
#    single rendered frame, unconditionally (not gated to the HUD's 180ms cadence).
#    Now it is built once as `entry`, `stats` is updated in place via
#    Object.assign(stats,entry), and `frames` stores that same entry. Field values
#    and nesting are unchanged; `stats` gains a harmless `t` field it did not have
#    before (nothing asserts its exact key set).
# 2) renderBodies() walked entities.values() twice every frame: once to lerp
#    position/rotation, once more (a `e.count>200` subset) to check the tower/span
#    mission flags. The mission check only reads e.curQ/e.body.worldCom(), neither
#    of which the lerp write touches, so folding it into the first loop is a pure
#    iteration-count cut with identical per-entity results.
# 3) effects() wrote $('hitmarker').style.opacity and toggled two classLists every
#    single frame regardless of whether the value had changed since last frame
#    (hitFlash sits at 0 and grab is unset most of the time). Both are now gated to
#    only touch the DOM when the computed value actually differs from last frame.
#
# No change to physicsStep/finishPhysicsStep, the worker protocol, commit(), the
# damage queue, camera/look, Q/E flight, or God Hand grab/rip/jam logic.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# 1) telemetry(): build the frame snapshot once, reuse it for both `stats` and `frames`.
rep("""    Object.assign(stats,{overflowFlights,analyticProjectiles,damagePipeline:{surfaceCommits:damageStats.surfaceCommits,settles:damageStats.settles,roughChips:damageStats.roughChips,maxQueue:damageStats.maxQueue,coalesced:damageQueue.coalesced,maxLatencyMs:damageStats.maxLatencyMs,lastLatencies:[...damageStats.latencies],voxelOldestMs:worker?.oldestMs||0},activeTarget:adaptiveBudget.active,solveEMA:adaptiveBudget.solveEMA,economy:{...economy},lightRubble,activeRubble,physicsMode,solverIterations,physicsError,physicsBusy:!!physics?.busy,solveMs:physicsMs,physicsRoundTripMs:physics?.stats.roundTripMs||0,physicsApplyMs:physics?.stats.applyMs||0,queryMs:physics?.stats.queryMs||0,physicsCommandMs:physics?.stats.commandMs||0,physicsEventMs:physics?.stats.eventMs||0,contactEvents:physics?.stats.rawEvents||0,manifoldReads:physics?.stats.manifoldReads||0,filteredSlowContacts:physics?.stats.slowRejected||0,contactPairDrops:physics?.stats.droppedPairs||0,commitFrameMs:latestCommitFrameMs,renderCpuMs:lastRenderCpuMs,rawColliderCount,godPull,pullStrength,magnetRips,magnetBonds,lastPull,grabCharge:grab?.charge||0,grabAnchored:!!grab?.entity.anchored,lastImpact,impactShatters,impactRegions,impactScale,rocketsFired,rocketHits,rocketExpired,lastRocket,worldObjects:entities.size,initialObjectCount,initialVoxelCount,workers:worker?.count||0,workerQueue:worker?.pending||0,sourceChunks,visibleSurfaces,spatialBins:sceneIndex.bins,spawnCount,slings,pulses,inputSuspended,captured:!!input?.state.owned,magnetLatch,jetpack,grabTransfers,grabReanchors,grabbedId:grab?.entity.id??null,lastGrabRelease,shots:shotCount,barrels:barrelsExploded,bestChain,stressFailures,impactFractures:fractures,queued,queuedDrops,simTime,frameMs,physicsMs,workerMs:lastWorkerMs,commitMs:lastCommitMs,editLatencyMs:lastLatencyMs,awake,sleeping,chips,colliderCount,voxels,pending,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,jobs,removed:totalRemoved,dirtyChunks:lastDirty,droppedSimMs:droppedTime*1000,budgetRejects,projectiles:projectiles.size,mode:cameraMode,cameraPosition:camera.position.toArray(),rainPending:rainQueue.length,rainFired,lastBlast});
    frames.push({...stats,t:performance.now()});if(frames.length>1800)frames.shift();""",
    """    // Built once and reused for both `stats` (in place) and the `frames` history
    // entry: the old code cloned this same ~90-key object a second time every
    // frame via {...stats}. Field values and nesting are unchanged.
    const entry={overflowFlights,analyticProjectiles,damagePipeline:{surfaceCommits:damageStats.surfaceCommits,settles:damageStats.settles,roughChips:damageStats.roughChips,maxQueue:damageStats.maxQueue,coalesced:damageQueue.coalesced,maxLatencyMs:damageStats.maxLatencyMs,lastLatencies:[...damageStats.latencies],voxelOldestMs:worker?.oldestMs||0},activeTarget:adaptiveBudget.active,solveEMA:adaptiveBudget.solveEMA,economy:{...economy},lightRubble,activeRubble,physicsMode,solverIterations,physicsError,physicsBusy:!!physics?.busy,solveMs:physicsMs,physicsRoundTripMs:physics?.stats.roundTripMs||0,physicsApplyMs:physics?.stats.applyMs||0,queryMs:physics?.stats.queryMs||0,physicsCommandMs:physics?.stats.commandMs||0,physicsEventMs:physics?.stats.eventMs||0,contactEvents:physics?.stats.rawEvents||0,manifoldReads:physics?.stats.manifoldReads||0,filteredSlowContacts:physics?.stats.slowRejected||0,contactPairDrops:physics?.stats.droppedPairs||0,commitFrameMs:latestCommitFrameMs,renderCpuMs:lastRenderCpuMs,rawColliderCount,godPull,pullStrength,magnetRips,magnetBonds,lastPull,grabCharge:grab?.charge||0,grabAnchored:!!grab?.entity.anchored,lastImpact,impactShatters,impactRegions,impactScale,rocketsFired,rocketHits,rocketExpired,lastRocket,worldObjects:entities.size,initialObjectCount,initialVoxelCount,workers:worker?.count||0,workerQueue:worker?.pending||0,sourceChunks,visibleSurfaces,spatialBins:sceneIndex.bins,spawnCount,slings,pulses,inputSuspended,captured:!!input?.state.owned,magnetLatch,jetpack,grabTransfers,grabReanchors,grabbedId:grab?.entity.id??null,lastGrabRelease,shots:shotCount,barrels:barrelsExploded,bestChain,stressFailures,impactFractures:fractures,queued,queuedDrops,simTime,frameMs,physicsMs,workerMs:lastWorkerMs,commitMs:lastCommitMs,editLatencyMs:lastLatencyMs,awake,sleeping,chips,colliderCount,voxels,pending,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,jobs,removed:totalRemoved,dirtyChunks:lastDirty,droppedSimMs:droppedTime*1000,budgetRejects,projectiles:projectiles.size,mode:cameraMode,cameraPosition:camera.position.toArray(),rainPending:rainQueue.length,rainFired,lastBlast,t:performance.now()};
    Object.assign(stats,entry);
    frames.push(entry);if(frames.length>1800)frames.shift();""")

# 2) renderBodies(): fold the mission-flag subset loop into the lerp loop (one
#    entities.values() walk instead of two; the mission check's reads are
#    independent of the lerp writes, so per-entity order does not matter).
rep("""  function renderBodies(alpha){
    for(const e of entities.values())if(!e.anchored){e.group.position.lerpVectors(e.prevP,e.curP,alpha);e.group.quaternion.slerpQuaternions(e.prevQ,e.curQ,alpha)}
    for(const p of projectiles.values()){
      p.mesh.position.lerpVectors(p.prev,p.cur,alpha);p.mesh.userData.flame.scale.y=.8+.35*Math.sin(simTime*63);
      if(simTime-p.trailAt>.045){p.trailAt=simTime;cosmetic(p.mesh.position.clone().addScaledVector(p.direction,-.55),p.direction.clone().multiplyScalar(-1.5).add(V(0,.3,0)),.08,0xbcb5a0,.36,true);}
    }
    player.group.position.lerpVectors(player.prev,player.cur,alpha);
    player.weapon.position.z=.38-recoil*.11;player.weapon.rotation.x=thirdPerson?cam.pitch*.75:0;
    for(const e of entities.values())if(!e.anchored&&e.count>200){
      if(e.rootId===2&&(e.curQ.x*e.curQ.x+e.curQ.z*e.curQ.z>.07||e.body.worldCom().y<4.2))missionTower=true;
      if(e.rootId===3&&e.body.worldCom().y<2.3)missionBridge=true;
    }
  }""",
    """  function renderBodies(alpha){
    for(const e of entities.values())if(!e.anchored){
      e.group.position.lerpVectors(e.prevP,e.curP,alpha);e.group.quaternion.slerpQuaternions(e.prevQ,e.curQ,alpha);
      if(e.count>200){
        if(e.rootId===2&&(e.curQ.x*e.curQ.x+e.curQ.z*e.curQ.z>.07||e.body.worldCom().y<4.2))missionTower=true;
        if(e.rootId===3&&e.body.worldCom().y<2.3)missionBridge=true;
      }
    }
    for(const p of projectiles.values()){
      p.mesh.position.lerpVectors(p.prev,p.cur,alpha);p.mesh.userData.flame.scale.y=.8+.35*Math.sin(simTime*63);
      if(simTime-p.trailAt>.045){p.trailAt=simTime;cosmetic(p.mesh.position.clone().addScaledVector(p.direction,-.55),p.direction.clone().multiplyScalar(-1.5).add(V(0,.3,0)),.08,0xbcb5a0,.36,true);}
    }
    player.group.position.lerpVectors(player.prev,player.cur,alpha);
    player.weapon.position.z=.38-recoil*.11;player.weapon.rotation.x=thirdPerson?cam.pitch*.75:0;
  }""")

# 3) effects(): only touch the DOM when the computed value actually changed since
#    last frame. hitFlash sits at 0 and grab is unset most of the time, so this
#    skips a style write and two classList writes on the vast majority of frames.
rep("""  let missionTower=false,missionBridge=false,lastImpactSound=-10,hitFlash=0,flashLife=0,testing=false;""",
    """  let missionTower=false,missionBridge=false,lastImpactSound=-10,hitFlash=0,flashLife=0,testing=false,lastHitOpacity=-1,lastPulling=false;""")
rep("""    hitFlash=Math.max(0,hitFlash-dt);$('hitmarker').style.opacity=String(Math.min(1,hitFlash*12));
    gripHalo.visible=!!grab;
    $('pull-meter').classList.toggle('visible',!!grab&&(grab.entity.anchored||grab.charge>0||grab.twistCharge>0));document.body.classList.toggle('pulling',!!grab&&(grab.entity.anchored||grab.charge>0||grab.twistCharge>0));""",
    """    hitFlash=Math.max(0,hitFlash-dt);const hitOpacity=Math.min(1,hitFlash*12);
    if(hitOpacity!==lastHitOpacity){lastHitOpacity=hitOpacity;$('hitmarker').style.opacity=String(hitOpacity);}
    gripHalo.visible=!!grab;
    const pulling=!!grab&&(grab.entity.anchored||grab.charge>0||grab.twistCharge>0);
    if(pulling!==lastPulling){lastPulling=pulling;$('pull-meter').classList.toggle('visible',pulling);document.body.classList.toggle('pulling',pulling);}""")

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
