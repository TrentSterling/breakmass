# Adds twist + crush regression tests to the in-page QA harness (BREAKMASS_QA).
import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
anchor = "      await test('Sustained powered rockets commit progressive cuts and drain after ceasefire',async()=>{"
assert s.count(anchor) == 1
tests = r"""      await test('God Hand twist: torsion shears the water tank off its legs',async()=>{
        await F.reset();F.pause(false);await frames(6);await quiet();
        const tank=F.inspect().find(e=>e.id===2);assert(tank?.anchored,'Water tank missing or already loose');await aimEntity(2);
        const probe=F.materialProbe(2);assert(probe&&F.grabAt(2,probe.local,[0,1,0]),'Tank grip failed');
        F.setGrabTarget(probe.point); // Hold the reach still: only torsion may charge.
        const rips=F.pullDiagnostics.magnetRips,t=performance.now();F.setTwist(1);
        try{await waitFor(()=>F.pullDiagnostics.magnetRips>rips,'Twist shear rip',15000);}finally{F.setTwist(0);}
        const chargeMs=performance.now()-t;
        await waitFor(()=>F.grab&&!F.grab.anchored,'Sheared section stays in the grip',10000);
        const held=F.grab,state=F.twistState;F.clearGrabTarget();F.releaseGrab();await quiet();snap('04b-twist-shear');
        assert(state.twistRips>0,'Sheared piece received no torsion impulse');
        return {chargeMs,heldId:held.id,twistRips:state.twistRips,lastPull:F.pullDiagnostics.lastPull};
      });
      await test('God Hand crush: fractures around the grip and pulls the pieces inward',async()=>{
        await F.reset();F.pause(false);await frames(6);await quiet();
        const target=F.inspect().find(e=>e.anchored&&/Northstar/.test(e.name));assert(target,'Northstar missing');await aimEntity(target.id);
        const probe=F.materialProbe(target.id);assert(probe&&F.grabAt(target.id,probe.local,[0,1,0]),'Grip failed');F.setGrabTarget(probe.point);
        const shatters=F.impactDiagnostics.impactShatters,crushes=F.twistState.crushes,t=performance.now();
        assert(F.crush(),'Crush request rejected');
        await waitFor(()=>F.impactDiagnostics.impactShatters>shatters,'Crush fracture commit',12000);
        const commitMs=performance.now()-t,fracture=F.lastFracture;await frames(12);
        const pieces=F.inspect().filter(e=>e.rootId===target.rootId&&!e.anchored);
        assert(pieces.length>0,'Crush produced no loose pieces');assert(fracture?.via==='crush'&&fracture.archetype==='spall','Crush did not use the spall archetype: '+JSON.stringify(fracture));
        assert(F.grab?.id!=null,'Crush lost the grip');
        F.clearGrabTarget();F.releaseGrab();await quiet();snap('04c-crush');
        return {commitMs,pieces:pieces.length,crushes:F.twistState.crushes-crushes,fracture};
      });
"""
s = s.replace(anchor, tests + anchor)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('qa tests added')
