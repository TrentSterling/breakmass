# v0.12.3: mouse look works without pointer lock. Latched look rotates from raw mousemove
# deltas whether or not the browser grants the lock; a failed/slow lock no longer clears the
# latch; the lock is retried silently on later clicks; the cursor is hidden by CSS meanwhile.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# A refused or silent lock keeps the latch. Warn once, quietly.
rep("""  let disposed=false,expectedUnlock=false,failed=false,timer=0,serial=0;""",
    """  let disposed=false,expectedUnlock=false,failed=false,timer=0,serial=0,warned=false;""")
rep("""    failed=wanted();if(latched)latched=false;emit();
    if(failed)hooks.onError?.(error||new Error('Mouse capture was refused.'));""",
    """    failed=wanted();emit();
    if(failed&&!warned){warned=true;hooks.onError?.(new Error('Mouse capture is unavailable in this browser. Drag look is active; right click again to release.'));}""")
# Rotate from movement deltas whenever look is wanted, locked or not.
rep("""  on(doc,'mousemove',e=>{
    if(locked){
      if(wanted())hooks.onDelta?.(Number.isFinite(e.movementX)?e.movementX:0,Number.isFinite(e.movementY)?e.movementY:0);
    }else if(!wanted()&&e.target===canvas)point(e);
  });""",
    """  on(doc,'mousemove',e=>{
    if(locked||wanted())hooks.onDelta?.(Number.isFinite(e.movementX)?e.movementX:0,Number.isFinite(e.movementY)?e.movementY:0);
    else if(e.target===canvas)point(e);
  });""")
# Retry the lock on a later user gesture without changing the latch.
rep("""  return {get state(){return state();},setRight,toggle,cancel,""",
    """  function retry(){if(!disposed&&wanted()&&!locked&&!pending)request();}
  return {get state(){return state();},setRight,toggle,cancel,retry,""")
# Game side: the drag path must not double-rotate while latched; LMB retries the lock.
rep("""      if(lookCapture?.state.locked)return; // Locked deltas are consumed once by native mousemove.
      if(state.buttons&2){""",
    """      if(lookCapture?.state.locked||lookCapture?.state.latched)return; // Look deltas are consumed once by native mousemove.
      if(state.buttons&2){""")
rep("""    if((e.buttons&1)&&!(previous&1)){held=true;if(tool===3&&magnetLatch&&grab)releaseGrab('click-latch released');else useTool();}""",
    """    if((e.buttons&1)&&!(previous&1)){held=true;lookCapture?.retry();if(tool===3&&magnetLatch&&grab)releaseGrab('click-latch released');else useTool();}""")
# Hide the cursor over the arena while look is latched, lock or no lock.
rep("#mouse-look{display:none!important}", "#mouse-look{display:none!important}body.look-latched #view{cursor:none}")
rep("""    onState:state=>{
      $('mouse-look').setAttribute('aria-pressed',String(state.locked||state.latched));""",
    """    onState:state=>{
      document.body.classList.toggle('look-latched',!!(state.locked||state.latched));
      $('mouse-look').setAttribute('aria-pressed',String(state.locked||state.latched));""")

rep('0.12.2', '0.12.3', count=10)
assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
