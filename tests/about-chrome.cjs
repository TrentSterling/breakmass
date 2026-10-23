const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {CHROME,PROFILE,aboutLaunchOptions,verifyInstalledChrome}=require('../tools/about-chrome.cjs');
function fixture(){
  const calls=[],access=[],outputs=new Map([
    ['dpkg-query -W','install ok installed\n155.0.8059.39-1\n'],
    ['dpkg-query -S','google-chrome-stable: '+CHROME+'\n'],
    ['ldd',' linux-vdso.so.1 (0x0001)\n libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x0002)\n'],
    ['sudo','other (enforce)\nchrome (unconfined)\n'],
    [CHROME,'Google Chrome 155.0.8059.39\n']
  ]);
  const options={env:{CI:'true',CHROME},platform:'linux',io:{accessSync:(p,mode)=>access.push({p,mode}),statSync:()=>({isFile:()=>true}),realpathSync:p=>p},exec:(command,args,opts)=>{
    calls.push({command,args,opts});
    if(command==='fc-match')return 'DejaVu '+args.at(-1)+'\t/usr/share/fonts/'+args.at(-1)+'.ttf\n';
    const key=command==='dpkg-query'?command+' '+args[0]:command;
    if(!outputs.has(key))throw Error('Unexpected command '+key);return outputs.get(key);
  }};
  return {options,calls,access,outputs,verify:()=>verifyInstalledChrome(options)};
}
test('hosted launch requires installed Chrome, sandbox, headless and mute',()=>{
  for(const marker of [{CI:'true'},{GITHUB_ACTIONS:'true'}])assert.deepEqual(aboutLaunchOptions({...marker,CHROME}),{headless:true,executablePath:CHROME,chromiumSandbox:true,args:['--enable-unsafe-swiftshader','--mute-audio']});
});
for(const chrome of [undefined,'','/usr/bin/google-chrome','/tmp/chromium',CHROME+' --no-sandbox'])test('hosted launch rejects missing or alternate CHROME '+String(chrome),()=>{
  assert.throws(()=>aboutLaunchOptions({CI:'true',CHROME:chrome}),/requires CHROME=/);
});
test('non-hosted launch settings are preserved, with no error-triggered fallback',()=>{
  assert.deepEqual(aboutLaunchOptions({}),{headless:true,executablePath:undefined,args:['--enable-unsafe-swiftshader','--mute-audio']});
  assert.equal(aboutLaunchOptions({CHROME:'/local/chrome'}).executablePath,'/local/chrome');
});
test('complete prerequisite evidence verifies only read-only commands and files',()=>{
  const f=fixture(),r=f.verify();assert.equal(r.version,'Google Chrome 155.0.8059.39');assert.equal(r.packageVersion,'155.0.8059.39-1');assert.equal(r.executable,CHROME);assert.equal(r.linkedLibrariesVerified,true);assert.equal(r.fonts.length,3);assert.equal(r.loadedProfile,'chrome (unconfined)');
  assert.deepEqual(f.calls.map(c=>c.command),['dpkg-query','dpkg-query','ldd','fc-match','fc-match','fc-match','sudo',CHROME]);
  assert.deepEqual(f.calls[0].args,['-W','-f=${Status}\n${Version}\n','google-chrome-stable']);
  assert.deepEqual(f.calls[6].args,['-n','cat','/sys/kernel/security/apparmor/profiles']);assert.deepEqual(f.calls[7].args,['--version']);
  for(const c of f.calls){assert.equal(c.opts.timeout,10000);assert.equal(c.opts.env.LC_ALL,'C');assert.equal(c.opts.maxBuffer,1024*1024);assert.equal(c.opts.shell,undefined);}
  assert.deepEqual(f.access.map(a=>a.p),[CHROME,'/usr/share/fonts/sans-serif.ttf','/usr/share/fonts/serif.ttf','/usr/share/fonts/monospace.ttf',PROFILE]);
  assert.equal(f.access[0].mode,fs.constants.X_OK);assert.ok(f.access.slice(1).every(a=>a.mode===fs.constants.R_OK));
});
test('existing enforced AppArmor profile is accepted without changing it',()=>{
  const f=fixture();f.outputs.set('sudo','chrome (enforce)\n');assert.equal(f.verify().loadedProfile,'chrome (enforce)');
});
test('non-Linux verification stops before any OS probe',()=>{
  const f=fixture();f.options.platform='win32';assert.throws(f.verify,/requires Linux/);assert.equal(f.calls.length,0);assert.equal(f.access.length,0);
});
test('wrong verification path stops before any OS probe',()=>{
  const f=fixture();f.options.env.CHROME='/tmp/chrome';assert.throws(f.verify,/requires CHROME=/);assert.equal(f.calls.length,0);
});
test('missing or non-executable Chrome is fatal',()=>{
  const f=fixture();f.options.io.accessSync=()=>{throw Error('EACCES');};assert.throws(f.verify,/EACCES/);assert.equal(f.calls.length,0);
});
test('a directory or redirected executable is fatal',()=>{
  const f=fixture();f.options.io.statSync=()=>({isFile:()=>false});assert.throws(f.verify,/regular file/);
  const g=fixture();g.options.io.realpathSync=()=>'/tmp/chrome';assert.throws(g.verify,/resolves outside/);
});
for(const status of ['deinstall ok config-files\n155.0.8059.39-1','install ok installed','install ok installed\nunknown','install ok installed\n155.0.8059.39-1\nextra'])test('absent or malformed package status fails: '+JSON.stringify(status),()=>{
  const f=fixture();f.outputs.set('dpkg-query -W',status);assert.throws(f.verify,/not installed/);
});
test('unowned executable fails despite an installed package',()=>{
  const f=fixture();f.outputs.set('dpkg-query -S','different-package: '+CHROME);assert.throws(f.verify,/not owned/);
});
for(const libs of ['', 'libc.so.6 => not found','statically linked','not a dynamic executable'])test('unverified linked libraries fail: '+JSON.stringify(libs),()=>{
  const f=fixture();f.outputs.set('ldd',libs);assert.throws(f.verify,/linked libraries/);
});
test('a missing library fails even when libc resolves',()=>{
  const f=fixture();f.outputs.set('ldd',f.outputs.get('ldd')+' libnss3.so => not found\n');assert.throws(f.verify,/linked libraries/);
});
for(const generic of ['sans-serif','serif','monospace'])test('missing fallback font is fatal: '+generic,()=>{
  const f=fixture(),exec=f.options.exec;f.options.exec=(c,a,o)=>c==='fc-match'&&a.at(-1)===generic?'':exec(c,a,o);assert.throws(f.verify,/fallback font/);
});
test('unreadable font file is fatal',()=>{
  const f=fixture(),access=f.options.io.accessSync;f.options.io.accessSync=(p,m)=>{if(p.endsWith('.ttf'))throw Error('Missing font file');access(p,m);};assert.throws(f.verify,/Missing font file/);
});
test('relative font path is not accepted',()=>{
  const f=fixture(),exec=f.options.exec;f.options.exec=(c,a,o)=>c==='fc-match'?'Family\tfont.ttf':exec(c,a,o);assert.throws(f.verify,/fallback font/);
});
test('missing profile file is fatal',()=>{
  const f=fixture(),access=f.options.io.accessSync;f.options.io.accessSync=(p,m)=>{if(p===PROFILE)throw Error('Missing profile');access(p,m);};assert.throws(f.verify,/Missing profile/);
});
for(const profiles of ['', 'chrome (complain)', 'other-chrome (enforce)', 'chrome (unconfined) extra'])test('unloaded or unexpected profile fails: '+JSON.stringify(profiles),()=>{
  const f=fixture();f.outputs.set('sudo',profiles);assert.throws(f.verify,/profile is not loaded/);
});
test('package and executable version mismatch fails',()=>{
  const f=fixture();f.outputs.set(CHROME,'Google Chrome 154.0.1.2');assert.throws(f.verify,/version does not match/);
});
for(const command of ['dpkg-query','ldd','fc-match','sudo',CHROME])test('probe failure or timeout is fatal without retry: '+command,()=>{
  const f=fixture(),exec=f.options.exec;let attempts=0;f.options.exec=(c,a,o)=>{if(c===command){attempts++;throw Error('probe timed out');}return exec(c,a,o);};assert.throws(f.verify,/probe timed out/);assert.equal(attempts,1);
});
test('About retains one browser launch and no sandbox-disable fallback',()=>{
  const s=fs.readFileSync(path.join(__dirname,'about-browser.cjs'),'utf8');assert.equal((s.match(/chromium\.launch\(/g)||[]).length,1);assert.ok(s.includes('chromium.launch(aboutLaunchOptions())'));assert.doesNotMatch(s,/--no-sandbox|--disable-setuid-sandbox|chromiumSandbox\s*:\s*false/);
});
