# v0.12.4: a pointer lock the BROWSER drops during a mouse click is ignored. Look stays
# latched (raw mouse deltas keep steering), the grab stays, input is not reset. Only Escape
# (an unlock with no mouse button involved) or a right click releases look.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

rep("""  let disposed=false,expectedUnlock=false,failed=false,timer=0,serial=0,warned=false;""",
    """  let disposed=false,expectedUnlock=false,failed=false,timer=0,serial=0,warned=false,buttonsDown=0,lastButtonAt=-1e9;""")
rep("""      const expected=expectedUnlock;expectedUnlock=false;restoreCursor();
      if(wasLocked&&!expected){right=latched=false;hooks.onCancel?.('mouse capture ended');}""",
    """      const expected=expectedUnlock;expectedUnlock=false;
      // Some browsers drop the lock on the next mouse click. That is not the
      // player asking to stop looking: keep the latch, keep the grip, keep
      // steering from raw motion. An unlock with no button involved is Escape.
      const clickDropped=wasLocked&&!expected&&wanted()&&(buttonsDown||performance.now()-lastButtonAt<400);
      if(clickDropped){failed=true;if(!warned){warned=true;hooks.onError?.(new Error('The browser released the mouse on a click. Look continues without capture; right click releases it.'));}emit();return;}
      restoreCursor();
      if(wasLocked&&!expected){right=latched=false;hooks.onCancel?.('mouse capture ended');}""")
rep("""  on(win,'mouseup',e=>{if(e.button===2||right&&!(e.buttons&2))setRight(false,e);},true);""",
    """  on(win,'mousedown',e=>{buttonsDown=e.buttons||1;lastButtonAt=performance.now();},true);
  on(win,'pointerdown',e=>{buttonsDown=e.buttons||1;lastButtonAt=performance.now();},true);
  on(win,'mouseup',e=>{buttonsDown=e.buttons||0;lastButtonAt=performance.now();if(e.button===2||right&&!(e.buttons&2))setRight(false,e);},true);
  on(win,'pointerup',e=>{buttonsDown=e.buttons||0;lastButtonAt=performance.now();},true);""")
# No lock retry on left click: if the browser drops the lock on clicks, re-requesting on the same click just thrashes.
rep("""    if((e.buttons&1)&&!(previous&1)){held=true;lookCapture?.retry();if(tool===3&&magnetLatch&&grab)releaseGrab('click-latch released');else useTool();}""",
    """    if((e.buttons&1)&&!(previous&1)){held=true;if(tool===3&&magnetLatch&&grab)releaseGrab('click-latch released');else useTool();}""")
rep('0.12.3', '0.12.4', count=10)
assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
