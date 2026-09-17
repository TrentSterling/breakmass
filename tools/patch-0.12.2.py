# v0.12.2: right click toggles mouse look (click to lock, click again or Escape to release).
import io, re
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# Behaviour: a right-button PRESS toggles the latch. Release does nothing.
rep("    lookCapture?.setRight(!!(e.buttons&2),e);",
    "    if((e.buttons&2)&&!(previous&2))lookCapture?.toggle(e); // Right click toggles locked look; Escape releases.")

# Copy.
rep("Hold right mouse to lock and look; release to aim freely.<br/>Escape releases the mouse.",
    "Right click locks the mouse to look; right click again or Escape releases it.")
rep("<strong>Move the mouse to aim.</strong> Hold right mouse to hide and lock the cursor, then look freely. Release right mouse to get your cursor back.",
    "<strong>Move the mouse to aim.</strong> Right click to lock the cursor and look freely. Right click again to get your cursor back.")
rep("<div><b>Hold right mouse</b> look · L toggles locked look</div>", "<div><b>Right click</b> toggles mouse look</div>")
rep("<div><b>Hold right mouse</b> look · release to aim freely · L latches look</div>", "<div><b>Right click</b> toggles mouse look · Escape releases</div>", count=2)
rep("<div><b>Hold right mouse</b> look · L latches look</div>", "<div><b>Right click</b> toggles mouse look · Escape releases</div>")
rep("'Hold right mouse to look · L latches mouse look'", "'Right click toggles mouse look'")

rep('0.12.1', '0.12.2', count=10)
assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
