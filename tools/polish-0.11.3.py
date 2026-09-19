import sys
# One-shot polish edits for index.html (v0.11.2 -> v0.11.3). Idempotent-ish: each
# replacement asserts the old text exists exactly once (or N times where noted).
import re, sys, io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:70]!r}, found {n}'
    s = s.replace(old, new)

# 1. Self-test: partition seams can shed a few crumb chips; assert on structural shards + mass.
rep("assert(shatter.count===0&&shatter.fragments.length===16,'Whole-body fracture retires parent and crops every shard');",
    "const shards=shatter.fragments.filter(f=>f.kind==='structure'),crumbs=shatter.fragments.filter(f=>f.kind!=='structure');\n"
    "      assert(shatter.count===0&&shards.length===16&&crumbs.every(f=>f.count<24),'Whole-body fracture retires parent and crops every shard');")

# 2. Em dashes out of player-visible strings (placeholders and comments stay).
rep("<title>BREAKMASS — Physics Destruction Sandbox by Tront</title>", "<title>BREAKMASS: Physics Destruction Sandbox by Tront</title>")
rep("'SUPPORT FAILURE — '", "'SUPPORT FAILURE · '")
rep("'OVERLOADED — '", "'OVERLOADED · '")
rep("'ROCKET — '", "'ROCKET · '")
rep("'GRIP LOST — no surviving material within 0.75m.'", "'GRIP LOST: no surviving material within 0.75m.'")
rep("'SUSPENDED — awaiting pointer'", "'SUSPENDED: awaiting pointer'")
rep("' — keep it going'", "' · keep it going'")
rep("'YARD CLEARED — KEEP WRECKING'", "'YARD CLEARED · KEEP WRECKING'")
rep("'SELF-TEST PASS — '", "'SELF-TEST PASS · '")
rep("'SELF-TEST FAILED — '", "'SELF-TEST FAILED · '")
rep("'SLING — '", "'SLING · '")
rep("'GOD HAND · CLICK-LATCH — click to attach / release. Escape always releases.'", "'GOD HAND · CLICK-LATCH: click to attach / release. Escape always releases.'")
rep("'GOD HAND · HOLD — release the left button to let go.'", "'GOD HAND · HOLD: release the left button to let go.'")

# 3. Social / canonical meta for tront.xyz/breakmass.
rep('<meta property="og:type" content="website"/>',
    '<meta property="og:type" content="website"/><meta property="og:url" content="https://tront.xyz/breakmass/"/>'
    '<meta property="og:image" content="https://tront.xyz/breakmass/og-image.png?v=1"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/>'
    '<meta name="twitter:card" content="summary_large_image"/><link rel="canonical" href="https://tront.xyz/breakmass/"/>')

# 4. Demolition contract HUD: it was fully wired (updateGameHUD) but hidden by CSS and unstyled.
rep('#status,#contract{display:none!important}',
    '#status{display:none!important}'
    '#contract{position:fixed;left:var(--edge);bottom:var(--bottom);z-index:4;background:var(--panel);border-radius:3px;box-shadow:var(--shadow);padding:8px 10px 7px;font:11px var(--mono);color:var(--muted);user-select:none;pointer-events:none;min-width:200px}'
    '#objective-status{color:var(--gold);font-weight:700;letter-spacing:.5px;margin-bottom:5px;font-size:10px}'
    '.objective{display:flex;align-items:center;gap:7px;padding:2px 0;color:var(--text)}'
    '.objective small{margin-left:auto;padding-left:12px;color:var(--muted);font-size:9px;letter-spacing:.4px}'
    '.objective .check{width:10px;height:10px;border:1px solid var(--muted);border-radius:2px;flex-shrink:0}'
    '.objective.done{color:var(--muted);text-decoration:line-through}.objective.done .check{background:var(--gold);border-color:var(--gold)}'
    '#contract .session{display:flex;gap:14px;margin-top:6px;padding-top:6px;border-top:1px solid var(--line);font-size:10px}#contract .session b{color:var(--text)}'
    '@media (max-width:980px){#contract{display:none}}')
rep('.hidden-hud #session-flags{display:none!important}', '.hidden-hud #session-flags,.hidden-hud #contract{display:none!important}')

# 5. Version bump.
rep('0.11.2', '0.11.3', count=10)

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(orig), '->', len(s))
# ---- SEO About block (prose, crosslinks, JSON-LD) so the page is not just a canvas to Google ----
import subprocess
subprocess.run([sys.executable, 'C:/trontstack/seo/about.py', 'breakmass'], check=True)
