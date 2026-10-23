// Read-only prerequisites for the hosted About job. Never installs packages,
// changes security policy, starts a browser session or selects a fallback binary.
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const CHROME='/opt/google/chrome/chrome';
const PROFILE='/etc/apparmor.d/chrome';
function aboutLaunchOptions(env=process.env){
  const hosted=!!(env.CI||env.GITHUB_ACTIONS);
  if(hosted&&env.CHROME!==CHROME)throw Error('Hosted About requires CHROME='+CHROME);
  return {headless:true,executablePath:env.CHROME||undefined,
    ...(hosted?{chromiumSandbox:true}:{}),args:['--enable-unsafe-swiftshader','--mute-audio']};
}
function verifyInstalledChrome({env=process.env,platform=process.platform,io=fs,exec=cp.execFileSync}={}){
  if(platform!=='linux')throw Error('Hosted Chrome verification requires Linux');
  if(env.CHROME!==CHROME)throw Error('Hosted About requires CHROME='+CHROME);
  const run=(command,args)=>String(exec(command,args,{encoding:'utf8',timeout:10000,maxBuffer:1024*1024,env:{...env,LC_ALL:'C'}})).trim();
  const file=(name,mode)=>{io.accessSync(name,mode);if(!io.statSync(name).isFile())throw Error('Required regular file: '+name);};
  file(CHROME,fs.constants.X_OK);
  if(io.realpathSync(CHROME)!==CHROME)throw Error('Chrome executable resolves outside its required path');
  const [status,packageVersion,...extra]=run('dpkg-query',['-W','-f=${Status}\n${Version}\n','google-chrome-stable']).split(/\r?\n/);
  if(status!=='install ok installed'||!/^\d+(?:\.\d+){3}-\S+$/.test(packageVersion||'')||extra.length)throw Error('google-chrome-stable is not installed with a known package version');
  if(run('dpkg-query',['-S',CHROME])!=='google-chrome-stable: '+CHROME)throw Error('Required Chrome executable is not owned by google-chrome-stable');
  const libraries=run('ldd',[CHROME]);
  if(/not found|not a dynamic executable|statically linked/i.test(libraries)||!/^\s*libc\.so\.\d+\s+=>\s+\//m.test(libraries))throw Error('Chrome linked libraries are missing or could not be verified');
  const fonts=['sans-serif','serif','monospace'].map(generic=>{
    const match=run('fc-match',['--format','%{family}\t%{file}\n',generic]);
    const fields=match.split('\t');
    if(fields.length!==2||!fields[0]||/[\r\n]/.test(match)||!path.posix.isAbsolute(fields[1]))throw Error('No usable fallback font for '+generic);
    file(fields[1],fs.constants.R_OK);
    return {generic,family:fields[0],file:fields[1]};
  });
  file(PROFILE,fs.constants.R_OK);
  const loadedProfile=run('sudo',['-n','cat','/sys/kernel/security/apparmor/profiles']).split(/\r?\n/).find(line=>/^chrome \((enforce|unconfined)\)$/.test(line));
  if(!loadedProfile)throw Error('Existing Chrome AppArmor profile is not loaded in an accepted mode');
  const version=run(CHROME,['--version']);
  if(version!=='Google Chrome '+packageVersion.replace(/-[^-]+$/,''))throw Error('Chrome version does not match its installed package');
  return {executable:CHROME,package:'google-chrome-stable',packageVersion,version,
    linkedLibrariesVerified:true,fonts,profileFile:PROFILE,loadedProfile};
}
if(require.main===module){
  try{console.log(JSON.stringify(verifyInstalledChrome(),null,2));}
  catch(error){console.error('About Chrome prerequisite failed: '+error.message);process.exitCode=1;}
}
module.exports={CHROME,PROFILE,aboutLaunchOptions,verifyInstalledChrome};
