// Test-only synchronization. Observe normal rendering/native events/promises;
// never step physics, set a camera, dispatch a fake close, or alter game state.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

export function authoredViews(file){
  const scripts=[...readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),ctx=vm.createContext({});
  for(const marker of ['function makeArena()','function voxelBuilder()','function polishDistrict(']){
    const script=scripts.find(s=>s.includes(marker));if(!script)throw Error('Missing authored scene source: '+marker);vm.runInContext(script,ctx);
  }
  const views={};
  for(const scene of ['district','foundry']){
    const volumes=vm.runInContext(`buildPlayableScene(${JSON.stringify(scene)}).volumes`,ctx);views[scene]={};
    for(const [name,pattern,yaw,distance] of [['tank',/Water tower/i,.65,24],['bridge',/viaduct/i,.9,25],['chimney',/STACK 1/i,.95,30]]){
      const e=volumes.find(e=>e.anchored&&pattern.test(e.name));if(!e)continue;
      const pitch=.27,target=Array.from(e.dims,(n,i)=>e.origin[i]+n*.25*(i===1?.65:.5));
      views[scene][name]={scene,mode:'fly',yaw,pitch,position:target.map((v,i)=>v+distance*[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)][i])};
    }
  }
  return views;
}

// Serialized into the page; all callbacks/timers belong only to this observer.
export function observePublishedView(expected,ms=5000){
  const start=performance.now(),game=window.BREAKMASS,firstFrame=Number.isFinite(game.stats.t)?game.stats.t:null;
  const receipt={passed:false,expected,startedAt:start,firstFrame,samples:[]};
  return new Promise(resolve=>{
    let timer,raf,done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(raf);receipt.passed=!error;receipt.error=error||null;receipt.finishedAt=performance.now();resolve(receipt);};
    const sample=()=>{if(done)return;try{
      const view=game.cameraState,s={at:performance.now(),frame:game.stats.t,ready:game.ready,scene:game.scenePreset,view};receipt.samples.push(s);
      if(s.at-start>=ms)return finish('View publication exceeded '+ms+' ms');
      if(game.liveQueue.errors)return finish('Runtime error: '+game.liveQueue.errors);
      const match=expected===null||(s.scene===expected.scene&&view.mode===expected.mode&&view.yaw===expected.yaw&&view.pitch===expected.pitch&&Array.isArray(view.position)&&view.position.length===3&&view.position.every((v,i)=>Number.isFinite(v)&&Math.abs(v-expected.position[i])<1e-8));
      if(s.ready&&Number.isFinite(s.frame)&&(firstFrame===null||s.frame>firstFrame)&&match)return finish();
      raf=requestAnimationFrame(sample);
    }catch(error){finish(String(error.message||error));}
    };
    if(!Number.isFinite(ms)||ms<=0)return finish('Invalid view watchdog');
    if(expected!==null&&(!expected||typeof expected.scene!=='string'||expected.mode!=='fly'||![expected.yaw,expected.pitch].every(Number.isFinite)||!Array.isArray(expected.position)||expected.position.length!==3||!expected.position.every(Number.isFinite)))return finish('Invalid authored viewpoint');
    timer=setTimeout(()=>finish('View publication timed out after '+ms+' ms'),ms);raf=requestAnimationFrame(sample);
  });
}

// Native close alone does not mean the async reset/focus operation has finished.
export function observeRebuild(method,args,ms){
  const g=window.BREAKMASS,d=document.getElementById('confirm-reset'),original=g[method],startedAt=performance.now();
  const receipt={passed:false,method,args,startedAt,events:[]};
  return new Promise(resolve=>{
    let done=false,called=false,closed=false,completed=false,timer,startTimer;
    const record=(phase,extra={})=>receipt.events.push({phase,at:performance.now(),ready:g.ready,...extra});
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(startTimer);d.removeEventListener('close',onClose);
      if(g[method]===wrapped)g[method]=original;else if(called&&!error)error='Rebuild observer ownership changed';
      receipt.passed=!error;receipt.error=error||null;record(error?'failed':'complete');resolve(receipt);};
    const maybe=()=>{if(performance.now()-startedAt>=ms)return finish('Rebuild watchdog exceeded');if(called&&closed&&completed)finish();};
    function wrapped(...actual){
      record('call',{actual});if(called||JSON.stringify(actual)!==JSON.stringify(args)||performance.now()-startedAt>=Math.min(5000,ms)){finish('Unexpected or late rebuild dispatch');return original.apply(this,actual);}
      called=true;if(closed)clearTimeout(startTimer);let result;try{result=original.apply(this,actual);}catch(error){finish(String(error.message||error));throw error;}
      Promise.resolve(result).then(value=>{record('resolved',{value});if(value===false)return finish('Rebuild returned false');completed=true;maybe();},error=>finish(String(error.message||error)));
      return result;
    }
    function onClose(event){record('close',{trusted:event.isTrusted,value:d.returnValue});
      if(!event.isTrusted||d.open||d.returnValue!=='rebuild'||performance.now()-startedAt>=Math.min(5000,ms))return finish('Expected timely native rebuild close');closed=true;if(called)clearTimeout(startTimer);maybe();}
    if(!Number.isFinite(ms)||ms<=0||typeof original!=='function'||!d.open)return finish('Cannot observe rebuild');
    g[method]=wrapped;d.addEventListener('close',onClose);record('armed');
    timer=setTimeout(()=>finish('Rebuild timed out after '+ms+' ms'),ms);
    startTimer=setTimeout(()=>finish('Native rebuild dispatch timed out after 5000 ms'),Math.min(5000,ms));
    try{d.querySelector('[value="rebuild"]').click();}catch(error){finish(String(error.message||error));}
  });
}

export async function observed(page,fn,args,receipts,label,ms){
  const receipt={label,passed:false};receipts.push(receipt);let timer;
  try{
    const result=await Promise.race([page.eval(`(${fn.toString()})(...${JSON.stringify(args)})`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+': host watchdog expired')),ms);})]);
    Object.assign(receipt,result);if(!result?.passed)throw Error(label+': '+(result?.error||'missing observer result'));return result;
  }catch(error){receipt.passed=false;receipt.error=String(error.message||error);throw error;}finally{clearTimeout(timer);}
}
export const viewBoundary=(page,expected,receipts,label)=>observed(page,observePublishedView,[expected,5000],receipts,label,5000);
export const rebuildBoundary=(page,method,args,receipts,label,ms)=>observed(page,observeRebuild,[method,args,ms],receipts,label,ms);
