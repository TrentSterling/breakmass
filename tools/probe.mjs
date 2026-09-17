// Prints entity names, ids, voxel counts and a surface point for a name regex.
// node tools/probe.mjs "domino|Domino"
import {launch, until} from './cdp.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const re = process.argv[2] || '.';
const page = await launch({port: Number(process.env.PORT || 9391), width: 800, height: 500});
try {
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await until(() => page.eval('!!window.BREAKMASS && getComputedStyle(document.getElementById("loading")).display==="none"'), {timeout: 90000, label: 'boot'});
  const rows = await page.eval(`BREAKMASS.inspect().filter(e=>new RegExp(${JSON.stringify(re)}).test(e.name)).map(e=>{const p=BREAKMASS.materialProbe(e.id);return {id:e.id,name:e.name,count:e.count,anchored:e.anchored,dims:e.dims,point:p?.point.map(n=>+n.toFixed(2))};})`);
  for (const r of rows) console.log(JSON.stringify(r));
  console.log(rows.length, 'entities');
} finally { page.kill(); }
