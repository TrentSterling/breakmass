const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {posterUrl,trackPosterRequests,readPosterFailureState,waitForPostersWithDiagnostics}=require('../tools/about-poster-diagnostics.cjs');
const media='https://tront.xyz/games/media/craftmine-2025.webp';
const request=(url=media,from=null,error='net::ERR_FAILED')=>({url:()=>url,resourceType:()=> 'image',redirectedFrom:()=>from,failure:()=>({errorText:error})});
const response=(r,status)=>({request:()=>r,status:()=>status,headers:()=>({'content-type':'image/webp'})});
const noListeners=page=>{for(const name of ['request','response','requestfinished','requestfailed'])assert.equal(page.listenerCount(name),0);};
const state=()=>({selected:['craftmine','smear','inkride'],images:[{src:media,currentSrc:media,complete:false,naturalWidth:0}],resources:[]});

test('poster URL evidence keeps only known paths and version hashes',()=>{
  assert.equal(posterUrl(media+'?v=6548c556b7e9'),media+'?v=6548c556b7e9');
  assert.equal(posterUrl(media+'?token=private&v=bad#private'),media);
  assert.equal(posterUrl(media.replace('https://','https://user:secret@')),media);
  for(const url of ['',undefined,'/games/media/craftmine-2025.webp','https://example.com/private',media+'.mp4'])assert.equal(posterUrl(url),null);
});
test('all five catalog posters are observed',()=>{
  for(const name of ['craftmine-2025','smear-2026','inkride-2026','tiny-treads-2026','tinyrise-2026']){
    const url='https://tront.xyz/games/media/'+name+'.webp';assert.equal(posterUrl(url),url);
  }
});
test('redirect, HTTP response, completion and network failure remain correlated',()=>{
  const page=new EventEmitter();let now=10;
  const observer=trackPosterRequests(page,{now:()=>now});
  const first=request('http://127.0.0.1:1234/games/media/craftmine-2025.webp?v=6548c556b7e9'),second=request(media,first);
  now=12;page.emit('request',first);page.emit('response',response(first,302));page.emit('requestfinished',first);
  now=15;page.emit('request',second);page.emit('response',response(second,404));page.emit('requestfailed',second);
  assert.deepEqual(observer.events.map(e=>[e.phase,e.id,e.atMs]),[['request',1,2],['response',1,2],['finished',1,2],['request',2,5],['response',2,5],['failed',2,5]]);
  assert.equal(observer.events[3].redirectedFrom,first.url());assert.equal(observer.events[4].status,404);assert.equal(observer.events[5].error,'net::ERR_FAILED');
  observer.stop();observer.stop();noListeners(page);
});
test('successful response and finished event are evidence, not a test verdict',()=>{
  const page=new EventEmitter(),observer=trackPosterRequests(page),r=request();
  page.emit('request',r);page.emit('response',response(r,200));page.emit('requestfinished',r);
  assert.equal(observer.events[1].status,200);assert.equal(observer.events[1].type,'image/webp');assert.equal(observer.events[2].phase,'finished');
  assert.equal(observer.passed,undefined);observer.stop();
});
test('unrelated requests never read or retain unrelated metadata',()=>{
  const page=new EventEmitter(),observer=trackPosterRequests(page),fail=()=>{throw Error('must not read');};
  const r={url:()=> 'https://example.com/private?token=secret',resourceType:fail,redirectedFrom:fail,failure:fail};
  page.emit('request',r);page.emit('response',{request:()=>r,status:fail,headers:fail});page.emit('requestfailed',r);page.emit('requestfinished',r);
  assert.deepEqual(observer.events,[]);observer.stop();
});
test('request evidence has a finite cap and bounded failure text',()=>{
  const page=new EventEmitter(),observer=trackPosterRequests(page);
  page.emit('requestfailed',request(media,null,'x'.repeat(300)));
  for(let i=0;i<110;i++)page.emit('request',request());
  assert.equal(observer.events.length,100);assert.equal(observer.dropped,11);assert.equal(observer.events[0].error.length,200);
  observer.stop();page.emit('request',request());assert.equal(observer.dropped,11);noListeners(page);
});

function domState({panePresent=true}={}){
  const box=(x,y,width,height)=>({x,y,width,height,top:y,bottom:y+height,left:x,right:x+width});
  const cards=['craftmine','smear','inkride'].map(id=>({getAttribute:()=>id}));
  const boxes=[box(10,120,200,120),box(10,650,200,120),box(10,900,200,120)];
  const pane={getBoundingClientRect:()=>box(0,100,740,560),scrollTop:0,scrollHeight:900,clientHeight:560};
  const images=cards.map((card,i)=>Object.freeze({src:media,currentSrc:i===2?'':media,complete:i===0,naturalWidth:i===0?640:0,naturalHeight:i===0?360:0,loading:'lazy',decoding:'async',getBoundingClientRect:()=>boxes[i],closest:s=>s==='details'?{open:true}:card}));
  const resource={name:media,initiatorType:'img',startTime:12,responseEnd:44,duration:32,transferSize:18,encodedBodySize:16,decodedBodySize:16,responseStatus:200};
  const context={document:{readyState:'complete',visibilityState:'visible',querySelector:()=>panePresent?pane:null,querySelectorAll:s=>s==='.tront-discovery__poster'?images:cards},innerWidth:1280,innerHeight:800,getComputedStyle:()=>({display:'block',visibility:'visible'}),performance:{now:()=>500,getEntriesByType:()=>[resource,{name:'https://example.com/private'}]}};
  return JSON.parse(JSON.stringify(vm.runInNewContext('('+readPosterFailureState.toString()+')()',context)));
}
test('failure snapshot reads exact selected cards, image state and clipping geometry',()=>{
  const result=domState();assert.deepEqual(result.selected,['craftmine','smear','inkride']);
  assert.equal(result.images[0].complete,true);assert.equal(result.images[0].naturalWidth,640);assert.equal(result.images[0].loading,'lazy');assert.equal(result.images[0].decoding,'async');
  assert.equal(result.images[1].complete,false);assert.equal(result.images[2].currentSrc,'');assert.equal(result.images[0].disclosureOpen,true);
  assert.deepEqual(result.images.map(i=>[i.intersectsViewport,i.intersectsPane]),[[true,true],[true,true],[false,false]]);
  assert.equal(result.pane.scrollTop,0);assert.equal(result.pane.clientHeight,560);assert.equal(result.viewport.height,800);
  assert.equal(result.resources.length,1);assert.equal(result.resources[0].responseStatus,200);assert.equal(result.resources[0].duration,32);
});
test('missing pane is retained without creating or scrolling content',()=>{
  const result=domState({panePresent:false});assert.equal(result.pane,null);assert.ok(result.images.every(i=>!i.intersectsPane));
});

function failureHarness(evaluate){
  const page=new EventEmitter();page.evaluate=evaluate;
  const observer=trackPosterRequests(page),original=Error('Timeout 60000ms exceeded');let timer,cleared,writes=0,receipt;
  const options={setTimer:(fn,ms)=>{assert.equal(ms,5000);timer=fn;return 7;},clearTimer:id=>{cleared=id;},write:(_file,r)=>{writes++;receipt=r;}};
  return {page,observer,original,options,get timer(){return timer;},get cleared(){return cleared;},get receipt(){return receipt;},get writes(){return writes;},run:()=>waitForPostersWithDiagnostics(page,observer,'desktop','failure.json',()=>Promise.reject(original),options)};
}
test('successful original wait runs once and never snapshots or writes',async()=>{
  const page=new EventEmitter();page.evaluate=()=>{throw Error('no diagnostic evaluate on pass');};const observer=trackPosterRequests(page);let calls=0;
  const result=await waitForPostersWithDiagnostics(page,observer,'desktop','failure.json',()=>{calls++;return 'original value';},{write:()=>{throw Error('no write on pass');}});
  assert.equal(calls,1);assert.equal(result,'original value');noListeners(page);
});
test('original timeout remains failed after useful bounded evidence is written',async()=>{
  const h=failureHarness(async()=>state());h.page.emit('requestfailed',request());
  await assert.rejects(h.run(),e=>e===h.original);assert.equal(h.receipt.passed,false);assert.equal(h.receipt.mode,'desktop');assert.equal(h.receipt.network[0].phase,'failed');
  assert.equal(h.receipt.state.images[0].complete,false);assert.equal(h.writes,1);assert.equal(h.cleared,7);noListeners(h.page);
});
test('successful image state after timeout cannot retroactively pass the test',async()=>{
  const h=failureHarness(async()=>({images:[{src:media,currentSrc:media,complete:true,naturalWidth:640}],resources:[]}));
  await assert.rejects(h.run(),e=>e===h.original);assert.equal(h.receipt.passed,false);assert.equal(h.receipt.state.images[0].naturalWidth,640);
});
test('image and resource evidence strips unrelated queries and resource URLs',async()=>{
  const h=failureHarness(async()=>({images:[{src:media+'?private=secret',currentSrc:media+'?v=6548c556b7e9&secret=value'}],resources:[{url:media+'?private=secret'},{url:'https://example.com/private'}]}));
  await assert.rejects(h.run(),e=>e===h.original);assert.equal(h.receipt.state.images[0].src,media);assert.equal(h.receipt.state.resources.length,1);assert.doesNotMatch(JSON.stringify(h.receipt),/secret|private/);
});
for(const [label,evaluate,message] of [
  ['page evaluation rejects',()=>Promise.reject(Error('Target closed')),'Target closed'],
  ['snapshot is missing',()=>null,'Missing poster state snapshot'],
  ['snapshot has malformed resources',()=>({images:[],resources:null}),'Missing poster state snapshot']
])test(label+' preserves original failure and network receipt',async()=>{
  const h=failureHarness(evaluate);h.page.emit('request',request());await assert.rejects(h.run(),e=>e===h.original);
  assert.equal(h.receipt.snapshotError,message);assert.equal(h.receipt.network.length,1);assert.equal(h.cleared,7);noListeners(h.page);
});
test('stalled page evaluation stops at finite diagnostic watchdog without retry',async()=>{
  let resolve,calls=0;const h=failureHarness(()=>{calls++;return new Promise(r=>{resolve=r;});});
  const pending=h.run(),rejected=assert.rejects(pending,e=>e===h.original);await Promise.resolve();await Promise.resolve();
  assert.equal(typeof h.timer,'function');h.timer();await rejected;
  assert.equal(h.receipt.snapshotError,'Poster state snapshot timed out');assert.equal(h.writes,1);assert.equal(calls,1);assert.equal(h.cleared,7);noListeners(h.page);
  resolve(state());await Promise.resolve();assert.equal(h.writes,1);assert.equal(h.receipt.state,undefined);
});
test('write failure cannot replace the original assertion failure',async()=>{
  const h=failureHarness(async()=>state());h.options.write=()=>{throw Error('disk full');};
  const old=console.error,messages=[];console.error=message=>messages.push(message);
  try{await assert.rejects(h.run(),e=>e===h.original);}finally{console.error=old;}
  assert.match(messages[0],/Could not save About poster evidence: disk full/);noListeners(h.page);
});
test('production integration preserves the exact original predicate and 60-second timeout',()=>{
  const source=fs.readFileSync(path.join(__dirname,'about-browser.cjs'),'utf8');
  assert.ok(source.includes('page.setDefaultTimeout(60000);'));
  assert.ok(source.includes("page.waitForFunction(()=>[...document.querySelectorAll('.tront-discovery__poster')].every(i=>i.complete&&i.naturalWidth>0)))"));
  assert.ok(source.indexOf('trackPosterRequests(page)')<source.indexOf('await page.goto('));
  assert.ok(source.includes('finally {for(const observer of posterObservers)observer.stop();await browser.close();server.close();}'));
});
