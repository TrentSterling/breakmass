# v0.12.1: feel fixes after Trent's play session.
#  - Q/E fly up/down restored while gripping (twist is Alt + mouse only)
#  - orbit camera removed from player controls (fly + third person only)
#  - right-drag look works while a pointer-lock request is pending; shorter lock timeout
#  - Lock-look topbar button hidden (L still latches); HUD copy back to the short form
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# 1. Twist input: Alt + mouse only. Q/E go back to flight.
rep("    let twist=(Number(keys.has('KeyE'))-Number(keys.has('KeyQ')))+(altHeld?Math.max(-1,Math.min(1,twistMouse*.045)):0);",
    "    let twist=altHeld?Math.max(-1,Math.min(1,twistMouse*.045)):0;")
rep("    // TWIST. Q/E or Alt + mouse X corkscrew the held material about vertical.",
    "    // TWIST. Hold Alt and move the mouse sideways to corkscrew the held material about vertical.")
rep("up:Number(keys.has('Space')||(!grab&&keys.has('KeyE')))-Number(keys.has('ControlLeft')||keys.has('ControlRight')||(!grab&&keys.has('KeyQ'))),",
    "up:Number(keys.has('Space')||keys.has('KeyE'))-Number(keys.has('ControlLeft')||keys.has('ControlRight')||keys.has('KeyQ')),")
rep("const move=V(Math.cos(cam.yaw)*dx-Math.sin(cam.yaw)*dz,Number(!grab&&keys.has('KeyE'))-Number(!grab&&keys.has('KeyQ')),-Math.sin(cam.yaw)*dx-Math.cos(cam.yaw)*dz);",
    "const move=V(Math.cos(cam.yaw)*dx-Math.sin(cam.yaw)*dz,Number(keys.has('KeyE'))-Number(keys.has('KeyQ')),-Math.sin(cam.yaw)*dx-Math.cos(cam.yaw)*dz);")

# 2. Orbit is gone from the player's controls. The internal orbit math stays only for the QA/OG hooks (aimAt).
rep('<option value="third">Third person</option><option value="orbit">Orbit</option></select>', '<option value="third">Third person</option></select>')
rep("    cameraMode=typeof mode==='string'&&['fly','third','orbit'].includes(mode)?mode:({fly:'third',third:'orbit',orbit:'fly'})[cameraMode];",
    "    cameraMode=typeof mode==='string'&&['fly','third'].includes(mode)?mode:(cameraMode==='fly'?'third':'fly');")
rep("  function mode(value){const name={fly:'Fly',third:'Third person',orbit:'Orbit'}[value]||'Fly';$('mode').classList.toggle('active',value==='third');$('mode').querySelector('.button-label').textContent=name;$('mode').title='Camera: '+name+' · V cycles modes';",
    "  function mode(value){const name={fly:'Fly',third:'Third person'}[value]||'Fly';$('mode').classList.toggle('active',value==='third');$('mode').querySelector('.button-label').textContent=name;$('mode').title='Camera: '+name+' · V toggles fly / third person';")
rep("    if(id<0){if(cameraMode!=='orbit')changeMode('orbit');else reframe();}else reframe();",
    "    if(cameraMode==='orbit')changeMode('fly');reframe();")
rep("""'<div id="mode-tag">Orbit</div><div><b>Hold right mouse</b> orbit with captured cursor</div><div><b>Middle drag</b> pan</div><div><b>Wheel / WASD</b> zoom / move orbit center</div>';""",
    """'<div id="mode-tag">Free flight</div><div><b>WASD</b> fly in the view direction</div><div><b>Hold right mouse</b> look · L latches look</div>';""")
# Right button only drives drag-look; middle button is crush (with a grip) or nothing.
rep("""    if((e.buttons&4)&&!(previous&4)&&grab&&tool===3){crushGrab();}
    else if((e.buttons&6)&&!(previous&6))drag={x:e.clientX,y:e.clientY,pan:!!(e.buttons&4)};
    if(!(e.buttons&6))drag=null;""",
"""    if((e.buttons&4)&&!(previous&4)&&grab&&tool===3)crushGrab();
    if((e.buttons&2)&&!(previous&2))drag={x:e.clientX,y:e.clientY};
    if(!(e.buttons&2))drag=null;""")

# 3. Right-drag look must respond immediately, even while the pointer-lock request is still pending or refused.
rep("""      if(lookCapture?.state.locked||lookCapture?.state.pending)return; // Locked deltas are consumed once by native mousemove.
      if(state.buttons&6){if(!drag)drag={x:e.clientX,y:e.clientY,pan:!!(state.buttons&4)};const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;if(drag.pan&&cameraMode==='orbit')pan(dx,dy);else{cam.yaw-=dx*.005;cam.pitch=THREE.MathUtils.clamp(cam.pitch+dy*.004,cameraMode==='orbit'?.06:-1.5,1.42);}}""",
"""      if(lookCapture?.state.locked)return; // Locked deltas are consumed once by native mousemove.
      if(state.buttons&2){if(!drag)drag={x:e.clientX,y:e.clientY};const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;cam.yaw-=dx*.005;cam.pitch=THREE.MathUtils.clamp(cam.pitch+dy*.004,cameraMode==='orbit'?.06:-1.5,1.42);}""")
rep("    timer=win.setTimeout(()=>reject(new Error('Mouse capture timed out.'),id),1800);",
    "    timer=win.setTimeout(()=>reject(new Error('Mouse capture timed out.'),id),700);")

# 4. Fewer buttons: the Lock-look button leaves the topbar (L key and the help text remain).
rep("#pull-fill{transform-origin:left center}", "#pull-fill{transform-origin:left center}#mouse-look{display:none!important}")

# 5. HUD copy back to the short form; twist and crush live in Help only.
rep("'Pull to rip · Shift peel · Q/E twist · MMB crush · X throw'", "'Pull to rip · Shift peel · X throw'")
rep("godPull?'Pull to snap · Q/E twist · MMB crush':'Rip disabled'", "godPull?'Pull to snap':'Rip disabled'")
rep("'God hand. Pull to rip supports · Q/E or Alt+mouse: twist until supports shear · Middle mouse: crush around the grip · Shift: peel · X: rip + throw · K: latch.'",
    "'God hand. Pull to rip supports · Shift: peel · X: rip + throw · Alt + mouse: twist · Middle mouse: crush · K: latch.'")
rep('title="God hand · 5 · Pull to rip / Q E twist / MMB crush"', 'title="God hand · 5 · Pull to rip / Shift to peel"')
rep('aria-label="God hand · 5 · Pull to rip / Q E twist / MMB crush"', 'aria-label="God hand · 5 · Pull to rip / Shift to peel"')

# 6. Version.
rep('0.12.0', '0.12.1', count=10)

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(orig), '->', len(s))
