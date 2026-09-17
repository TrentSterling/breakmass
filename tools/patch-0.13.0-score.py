# v0.13.0 score lane: stupid-simple destruction score plus two new demolition
# contracts, all inside the existing bottom-left #contract box. No new panels.
#
# Score lines (mono, small, DOM written only when a cached value changes):
#   WRECKAGE $X    - removed-voxel material value (dust-sampled, extrapolated
#                     over the edit's full removed count) plus a salvage value
#                     for structural mass ripped off an anchored root.
#   CHAIN xN        - reuses the existing bestChain counter (barrel chain reactions).
#   BIGGEST IMPACT  - peak impactDamage profile energy this session, shown in
#                     honest Joule-derived units (J / kJ / MJ) with a title
#                     attribute spelling out exactly what it measures.
#   MASS MOVED N t  - kg of structural pieces that detached from an anchored
#                     root this session (summed from body.mass() at mount time).
#   COLLAPSES N     - reuses the existing stressFailures counter.
#
# New contracts (both read existing counters only, both reset for free by the
# existing reset(), both instantly restartable via Rebuild):
#   "Tower, hands only"     - missionTower true AND shotCount is still 0 since
#                              the last rebuild. shotCount already covers Rifle,
#                              Shotgun, Rocket and Bomb rain; Blast and Chisel do
#                              not increment it today, so this checks "no gun/
#                              rocket/bomb fired", not literally every tool. See
#                              the lane report for that caveat.
#   "Three drums, one chain" - bestChain>=3. bestChain is only ever incremented
#                              inside detonateBarrel, so it is already a barrel-
#                              only counter; no new tracking needed.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# --- #contract markup: two new objectives + a new score block -------------
rep(
    '<div class="objective" id="goal-drums"><span class="check"></span> Ignite three drums <small id="drum-count">0/3</small></div>\n<div class="session">',
    '<div class="objective" id="goal-drums"><span class="check"></span> Ignite three drums <small id="drum-count">0/3</small></div>\n'
    '<div class="objective" id="goal-hands"><span class="check"></span> Tower, hands only <small>NO SHOTS FIRED</small></div>\n'
    '<div class="objective" id="goal-chain3"><span class="check"></span> Three drums, one chain <small>CHAIN ≥ 3</small></div>\n'
    '<div class="session">')
rep(
    '<span><b id="chain-count">—</b> BEST CHAIN</span></div></div><div id="status">',
    '<span><b id="chain-count">—</b> BEST CHAIN</span></div>'
    '<div class="score">'
    '<div><b id="score-wreckage">$0</b> WRECKAGE</div>'
    '<div><b id="score-chain">—</b> CHAIN</div>'
    '<div><b id="score-impact" title="Peak impact kinetic energy this session, half mass times speed squared, from the impact-damage profile. Joules-based, not a force.">—</b> BIGGEST IMPACT</div>'
    '<div><b id="score-mass">0 t</b> MASS MOVED</div>'
    '<div><b id="score-collapses">0</b> COLLAPSES</div>'
    '</div></div><div id="status">')

# --- CSS for the new score block, matching .session's existing look -------
rep(
    '#contract .session b{color:var(--text)}@media (max-width:980px){#contract{display:none}}',
    '#contract .session b{color:var(--text)}'
    '#contract .score{display:flex;flex-direction:column;gap:3px;margin-top:6px;padding-top:6px;border-top:1px solid var(--line);font-size:10px}'
    '#contract .score b{color:var(--gold);font-weight:700;margin-right:4px}'
    '@media (max-width:980px){#contract{display:none}}')

# --- Material price table + dust-sample valuation helper ------------------
# Reuses the kernel's own material palette (index-matched to `colors` above)
# and its toughness tiers as the objective source for who is "cheap" and who
# is "dear": materials 1/2/8 sit at kernel toughness ~1 (brick, concrete, thin
# sheet) and are cheap; 3/5/7/9 sit at toughness >=2.1 (steel-tier, load
# bearing) and are dear; 4/6 sit below toughness 1 (timber, glass) and are the
# in-between tier. This is a stylized price, not a currency model.
rep(
    "  const colors=[0,0xb86147,0xd8cdb9,0x287f83,0xae7c42,0x48545a,0x8bb5b4,0xefbb49,0xb94836,0x34444a];",
    "  const colors=[0,0xb86147,0xd8cdb9,0x287f83,0xae7c42,0x48545a,0x8bb5b4,0xefbb49,0xb94836,0x34444a];\n"
    "  const WRECKAGE_PRICE=[0,8,8,55,20,55,20,55,8,55]; // $ per removed voxel, index-matched to colors/toughness above.\n"
    "  const SALVAGE_PER_KG=2.2; // $/kg for structural mass ripped from an anchored root; tuned to the voxel price scale.\n"
    "  function dustValue(dust,removedCount){\n"
    "    if(!dust||!dust.length||!removedCount)return 0;\n"
    "    let sum=0;for(let i=0;i<dust.length;i++)sum+=WRECKAGE_PRICE[dust[i][3]]||0;\n"
    "    return sum/dust.length*removedCount;\n"
    "  }")

# --- New session counters --------------------------------------------------
rep(
    "  let resetResolve=null,frames=[],physicsMs=0,lastWorkerMs=0,lastCommitMs=0,lastLatencyMs=0,totalRemoved=0,jobs=0,droppedTime=0,budgetRejects=0,lastDirty=0;",
    "  let resetResolve=null,frames=[],physicsMs=0,lastWorkerMs=0,lastCommitMs=0,lastLatencyMs=0,totalRemoved=0,jobs=0,droppedTime=0,budgetRejects=0,lastDirty=0,wreckageValue=0,massMoved=0,bestImpactEnergy=0;")

# --- commit(): read-only mass-moved / wreckage-from-mass hook -------------
# Fires exactly when a structural child mounts off a source (`e`) that was
# still anchored, i.e. the moment material actually detaches from a fixture.
# Does not touch admission, collider budgeting or grip transfer above it.
rep(
    "child.parentShift=f.shift;child.impactAt=e.impactAt;newEntities.push(child);\n      if(result.failure&&f.kind==='structure'){",
    "child.parentShift=f.shift;child.impactAt=e.impactAt;newEntities.push(child);\n"
    "      if(e.anchored&&f.kind==='structure'){const kg=child.body.mass();massMoved+=kg;wreckageValue+=kg*SALVAGE_PER_KG;}\n"
    "      if(result.failure&&f.kind==='structure'){")

# --- commit(): removed-voxel wreckage value, next to totalRemoved ---------
rep(
    "    lastWorkerMs=result.ms;lastDirty=result.dirty;lastCommitMs=performance.now()-start;lastLatencyMs=performance.now()-(ctx.sent||start);totalRemoved+=result.removed;jobs++;",
    "    lastWorkerMs=result.ms;lastDirty=result.dirty;lastCommitMs=performance.now()-start;lastLatencyMs=performance.now()-(ctx.sent||start);totalRemoved+=result.removed;wreckageValue+=dustValue(result.dust,result.removed);jobs++;")

# --- biggest impact energy, next to lastImpact -----------------------------
rep(
    "        lastImpact={target:e.name,speed:p.speed,energy:p.energy,plannedPieces:plan.pieces,catastrophic:plan.catastrophic,time:simTime,traceId:trace.id};",
    "        lastImpact={target:e.name,speed:p.speed,energy:p.energy,plannedPieces:plan.pieces,catastrophic:plan.catastrophic,time:simTime,traceId:trace.id};bestImpactEnergy=Math.max(bestImpactEnergy,p.energy);")

# --- QA hook: expose the raw score counters, same pattern as the existing
# impactDiagnostics/rocketDiagnostics read-only getters.
rep(
    "get stats(){return {...stats,economy:{...economy},activeRubble:[...entities.values()].filter(e=>!e.anchored&&!e.lightweight&&e.kind!=='chip').length,lightRubble:[...entities.values()].filter(e=>e.lightweight).length}},",
    "get stats(){return {...stats,economy:{...economy},activeRubble:[...entities.values()].filter(e=>!e.anchored&&!e.lightweight&&e.kind!=='chip').length,lightRubble:[...entities.values()].filter(e=>e.lightweight).length}},\n"
    "    get scoreDiagnostics(){return {wreckageValue,massMoved,bestImpactEnergy,bestChain,stressFailures,shotCount,missionTower}},")

# --- reset(): clear the new counters alongside totalRemoved ---------------
rep(
    "    simTime=0;accumulator=0;totalRemoved=0;jobs=0;lastWorkerMs=lastCommitMs=lastLatencyMs=0;budgetRejects=0;frames=[];droppedTime=0;",
    "    simTime=0;accumulator=0;totalRemoved=0;jobs=0;lastWorkerMs=lastCommitMs=lastLatencyMs=0;budgetRejects=0;frames=[];droppedTime=0;wreckageValue=massMoved=bestImpactEnergy=0;")

# --- updateGameHUD(): cache-and-skip, plus the five new score lines and two
# new contract checks. Same completion semantics as before for the three
# original objectives; only the write-on-change behaviour and the new lines
# are added.
rep(
    """  function updateGameHUD(){
    $('goal-tower').classList.toggle('done',missionTower);$('goal-span').classList.toggle('done',missionBridge);$('goal-drums').classList.toggle('done',barrelsExploded>=3);
    $('drum-count').textContent=Math.min(3,barrelsExploded)+'/3';$('shot-count').textContent=shotCount.toLocaleString();$('chain-count').textContent=bestChain?'×'+bestChain:'—';
    $('damage-count').textContent=totalRemoved.toLocaleString();$('stress-count').textContent=stressFailures+' / '+fractures;
    $('objective-status').textContent=missionTower&&missionBridge&&barrelsExploded>=3?'YARD CLEARED · KEEP WRECKING':'DEMOLITION CONTRACT / OPTIONAL';
  }""",
    """  let hudCache={};
  function hudSet(id,value){if(hudCache[id]===value)return;hudCache[id]=value;$(id).textContent=value;}
  function hudToggle(key,el,cls,on){if(hudCache[key]===on)return;hudCache[key]=on;$(el).classList.toggle(cls,on);}
  function formatMoney(n){n=Math.max(0,n);if(n>=1e6)return'$'+(n/1e6).toFixed(1)+'M';if(n>=1e3)return'$'+(n/1e3).toFixed(1)+'K';return'$'+Math.round(n);}
  function formatEnergy(j){if(j>=1e6)return(j/1e6).toFixed(2)+' MJ';if(j>=1e3)return(j/1e3).toFixed(1)+' kJ';return Math.round(j)+' J';}
  function formatTonnes(kg){const t=kg/1000;return(t>=100?Math.round(t):t.toFixed(1))+' t';}
  function updateGameHUD(){
    hudToggle('doneTower','goal-tower','done',missionTower);
    hudToggle('doneSpan','goal-span','done',missionBridge);
    hudToggle('doneDrums','goal-drums','done',barrelsExploded>=3);
    hudToggle('doneHands','goal-hands','done',missionTower&&shotCount===0);
    hudToggle('doneChain3','goal-chain3','done',bestChain>=3);
    hudSet('drum-count',Math.min(3,barrelsExploded)+'/3');hudSet('shot-count',shotCount.toLocaleString());hudSet('chain-count',bestChain?'×'+bestChain:'—');
    hudSet('damage-count',totalRemoved.toLocaleString());hudSet('stress-count',stressFailures+' / '+fractures);
    hudSet('score-wreckage',formatMoney(wreckageValue));hudSet('score-chain',bestChain?'×'+bestChain:'—');
    hudSet('score-impact',bestImpactEnergy?formatEnergy(bestImpactEnergy):'—');hudSet('score-mass',formatTonnes(massMoved));hudSet('score-collapses',stressFailures.toLocaleString());
    hudSet('objective-status',missionTower&&missionBridge&&barrelsExploded>=3?'YARD CLEARED · KEEP WRECKING':'DEMOLITION CONTRACT / OPTIONAL');
  }""")

# --- displayStats(): call updateGameHUD unconditionally (still throttled to
# ~180ms by its only caller) instead of only while the settings/perf panel is
# open. Without this the #contract box - and the new score lines - would only
# ever refresh while the player has Settings > Performance & tests open.
rep(
    """  function displayStats(){
    drawAtlas();updateDebugGeometry();
    if(document.body.classList.contains('hidden-hud')||!document.body.classList.contains('settings-open')||!$('fold-stats').open)return;""",
    """  function displayStats(){
    drawAtlas();updateDebugGeometry();
    if(!document.body.classList.contains('hidden-hud'))updateGameHUD();
    if(document.body.classList.contains('hidden-hud')||!document.body.classList.contains('settings-open')||!$('fold-stats').open)return;""")
rep(
    "    $('status-left').textContent=S+'m voxels / '+stats.jobs+' edits / '+stats.chips+' physical chips / '+stats.dirtyChunks+' dirty chunks last edit';\n    updateGameHUD();\n    $('scene-count')",
    "    $('status-left').textContent=S+'m voxels / '+stats.jobs+' edits / '+stats.chips+' physical chips / '+stats.dirtyChunks+' dirty chunks last edit';\n    $('scene-count')")

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
