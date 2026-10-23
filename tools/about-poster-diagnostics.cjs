// Failure-only evidence for the existing About poster assertion. No image loads,
// scrolling, retries, decoding or runtime changes are performed by this observer.
const fs=require('node:fs');
const mediaPattern=/^\/games\/media\/(craftmine-2025|smear-2026|inkride-2026|tiny-treads-2026|tinyrise-2026)\.webp$/;
function posterUrl(value){
  try{const u=new URL(value);if(!mediaPattern.test(u.pathname))return null;
    const v=u.searchParams.get('v');return u.origin+u.pathname+(v&&/^[a-f0-9]{12}$/.test(v)?'?v='+v:'');
  }catch{return null;}
}
function trackPosterRequests(page,{now=()=>performance.now(),limit=100}={}){
  const started=now(),events=[],requests=new Map();let next=0,dropped=0,stopped=false;
  const record=(phase,request,extra={})=>{const url=posterUrl(request.url());if(!url)return;
    if(events.length>=limit){dropped++;return;}
    if(!requests.has(request))requests.set(request,++next);
    events.push({phase,atMs:now()-started,id:requests.get(request),url,...(typeof extra==='function'?extra():extra)});
  };
  const listeners={
    request:r=>record('request',r,()=>({type:r.resourceType(),redirectedFrom:posterUrl(r.redirectedFrom()?.url())})),
    response:r=>record('response',r.request(),()=>({status:r.status(),type:r.headers()['content-type']||null})),
    requestfinished:r=>record('finished',r),
    requestfailed:r=>record('failed',r,()=>({error:String(r.failure()?.errorText||'unknown').slice(0,200)}))
  };
  for(const [name,listener] of Object.entries(listeners))page.on(name,listener);
  return {events,get dropped(){return dropped;},stop(){if(stopped)return;stopped=true;for(const [name,listener] of Object.entries(listeners))page.off(name,listener);requests.clear();}};
}
// Serialized into the page only after the original wait has failed.
function readPosterFailureState(){
  const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
  const pane=document.querySelector('.tront-discovery'),paneRect=rect(pane);
  const intersects=(a,b)=>!!a&&!!b&&a.width>0&&a.height>0&&a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;
  const viewport={width:innerWidth,height:innerHeight,top:0,left:0,right:innerWidth,bottom:innerHeight};
  return {at:performance.now(),readyState:document.readyState,visibility:document.visibilityState,
    selected:[...document.querySelectorAll('[data-tront-discovery-game]')].map(e=>e.getAttribute('data-tront-discovery-game')),
    pane:pane?{rect:paneRect,scrollTop:pane.scrollTop,scrollHeight:pane.scrollHeight,clientHeight:pane.clientHeight}:null,viewport,
    images:[...document.querySelectorAll('.tront-discovery__poster')].map(i=>{const r=rect(i),style=getComputedStyle(i);return {
      game:i.closest('[data-tront-discovery-game]')?.getAttribute('data-tront-discovery-game'),
      src:i.src,currentSrc:i.currentSrc,complete:i.complete,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,
      loading:i.loading,decoding:i.decoding,rect:r,intersectsViewport:intersects(r,viewport),intersectsPane:intersects(r,paneRect),
      display:style.display,visibility:style.visibility,disclosureOpen:i.closest('details')?.open??null};}),
    resources:performance.getEntriesByType('resource').filter(r=>/\/games\/media\/[^/]+\.webp(?:\?|$)/.test(r.name)).map(r=>({
      url:r.name,initiatorType:r.initiatorType,startTime:r.startTime,responseEnd:r.responseEnd,duration:r.duration,
      transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize,responseStatus:r.responseStatus??null}))};
}
async function waitForPostersWithDiagnostics(page,observer,mode,file,wait,{snapshotMs=5000,
  setTimer=setTimeout,clearTimer=clearTimeout,write=(file,r)=>fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n')}={}){
  try{return await wait();}
  catch(original){
    const receipt={mode,passed:false,originalError:String(original.stack||original),network:observer.events.slice(),droppedNetworkEvents:observer.dropped};let timer;
    try{
      if(!Number.isFinite(snapshotMs)||snapshotMs<=0)throw Error('Invalid poster snapshot budget');
      const state=await Promise.race([Promise.resolve().then(()=>page.evaluate(readPosterFailureState)),
        new Promise((_,reject)=>{timer=setTimer(()=>reject(Error('Poster state snapshot timed out')),snapshotMs);})]);
      if(!state||!Array.isArray(state.images)||!Array.isArray(state.resources))throw Error('Missing poster state snapshot');
      // Only these public media paths and their known hash query are recorded.
      state.images=state.images.map(i=>({...i,src:posterUrl(i.src),currentSrc:posterUrl(i.currentSrc)}));
      state.resources=state.resources.map(r=>({...r,url:posterUrl(r.url)})).filter(r=>r.url);
      receipt.state=state;
    }catch(error){receipt.snapshotError=String(error.message||error);}
    finally{clearTimer(timer);}
    try{write(file,receipt);}catch(error){console.error('Could not save About poster evidence: '+error.message);}
    throw original;
  }finally{observer.stop();}
}
module.exports={posterUrl,trackPosterRequests,readPosterFailureState,waitForPostersWithDiagnostics};
