# v0.12.5: hold right mouse = drag look (the original feel). A quick right click (under
# 300 ms, barely moved) toggles latched look. Raw mouse deltas steer in both cases; pointer
# lock is only a bonus. The old duplicate drag path in the pointer binding is removed.
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

rep("""  let disposed=false,expectedUnlock=false,failed=false,timer=0,serial=0,warned=false,buttonsDown=0,lastButtonAt=-1e9;""",
    """  let disposed=false,expectedUnlock=false,failed=false,timer=0,serial=0,warned=false,buttonsDown=0,lastButtonAt=-1e9,rightDownAt=0,rightMoved=0;""")
rep("""  function setRight(value,e){
    const next=!!value;if(next===right)return;
    if(next&&!locked&&!pending)point(e);
    right=next;
    if(right)request();
    else if(!latched){failed=false;unlock();restoreCursor();}
    emit();
  }""",
    """  // Hold right = drag look while held. A quick right click (short, barely moved)
  // toggles latched look instead. Either way raw deltas steer; the lock is a bonus.
  function setRight(value,e){
    const next=!!value;if(next===right)return;
    if(next){if(!locked&&!pending)point(e);right=true;rightDownAt=performance.now();rightMoved=0;request();emit();return;}
    right=false;
    const quick=performance.now()-rightDownAt<300&&rightMoved<8;
    if(quick)latched=!latched;
    if(latched){if(!locked)request();}
    else{failed=false;unlock();restoreCursor();}
    emit();
  }""")
rep("""    if(locked||wanted())hooks.onDelta?.(Number.isFinite(e.movementX)?e.movementX:0,Number.isFinite(e.movementY)?e.movementY:0);
    else if(e.target===canvas)point(e);""",
    """    if(locked||wanted()){const mx=Number.isFinite(e.movementX)?e.movementX:0,my=Number.isFinite(e.movementY)?e.movementY:0;if(right)rightMoved+=Math.abs(mx)+Math.abs(my);hooks.onDelta?.(mx,my);}
    else if(e.target===canvas)point(e);""")
# Game side: right button state flows straight into the capture (the original wiring).
rep("""    if((e.buttons&2)&&!(previous&2))lookCapture?.toggle(e); // Right click toggles locked look; Escape releases.""",
    """    lookCapture?.setRight(!!(e.buttons&2),e); // Hold right = drag look; quick right click toggles latched look.""")
rep("""    if((e.buttons&2)&&!(previous&2))drag={x:e.clientX,y:e.clientY};
    if(!(e.buttons&2))drag=null;""", """""")
# The pointer binding no longer rotates the camera itself; the capture owns all look deltas.
rep("""    onMove:(e,state)=>{
      if(lookCapture?.state.locked||lookCapture?.state.latched)return; // Look deltas are consumed once by native mousemove.
      if(state.buttons&2){if(!drag)drag={x:e.clientX,y:e.clientY};const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;cam.yaw-=dx*.005;cam.pitch=THREE.MathUtils.clamp(cam.pitch+dy*.004,cameraMode==='orbit'?.06:-1.5,1.42);}
    }""",
    """    onMove:()=>{ /* Look deltas are owned by the look capture (raw mousemove, lock or not). */ }""")
# Copy.
rep("Right click locks the mouse to look; right click again or Escape releases it.",
    "Hold right mouse to look. A quick right click locks look on; click again or Escape releases it.")
rep("<strong>Move the mouse to aim.</strong> Right click to lock the cursor and look freely. Right click again to get your cursor back.",
    "<strong>Move the mouse to aim.</strong> Hold right mouse to look around. A quick right click keeps look on; click again to get your cursor back.")
rep("<div><b>Right click</b> toggles mouse look</div>", "<div><b>Hold right mouse</b> look · quick right click latches it</div>")
rep("<div><b>Right click</b> toggles mouse look · Escape releases</div>", "<div><b>Hold right mouse</b> look · quick right click latches · Escape releases</div>", count=3)
rep("'Right click toggles mouse look'", "'Hold right mouse to look · quick right click latches'")

rep("  on(doc,'mousemove',e=>{\n    if(locked||wanted()){const mx=Number.isFinite(e.movementX)?e.movementX:0,my=Number.isFinite(e.movementY)?e.movementY:0;if(right)rightMoved+=Math.abs(mx)+Math.abs(my);hooks.onDelta?.(mx,my);}\n    else if(e.target===canvas)point(e);\n  });",
    "  // pointermove, not mousemove: compatibility mouse events stop while a button is\n  // held (the arena cancels pointerdown), and pointer events carry movementX too.\n  on(doc,'pointermove',e=>{\n    if(e.pointerType&&e.pointerType!=='mouse'&&e.pointerType!=='pen')return;\n    if(locked||wanted()){const mx=Number.isFinite(e.movementX)?e.movementX:0,my=Number.isFinite(e.movementY)?e.movementY:0;if(right)rightMoved+=Math.abs(mx)+Math.abs(my);hooks.onDelta?.(mx,my);}\n    else if(e.target===canvas)point(e);\n  });")
rep('0.12.4', '0.12.5', count=10)
assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
