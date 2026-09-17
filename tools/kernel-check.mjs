// Runs the voxel kernel (the in-page worker source) directly in Node, no browser.
// node tools/kernel-check.mjs [file.html]
import {readFileSync} from 'node:fs';
const file = process.argv[2] || 'index.html';
const html = readFileSync(file, 'utf8');
const src = html.split('<script id="voxel-worker-source" type="text/plain">')[1].split('</script>')[0];
const k = new Function(src + '\nreturn voxelKernel();')();
const q = m => k.handle(m);
const out = [];
q({type: 'init', volume: {id: 9004, dims: [24, 32, 20], data: new Uint8Array(24 * 32 * 20).fill(2), anchored: false, kind: 'structure'}});
const shatter = q({type: 'edit', id: 9004, op: {type: 'fracture', center: [12, 16, 10], radius: 30, pieces: 16, seed: 77, chips: 0, roughness: 0}});
out.push({file, count: shatter.count, fragments: shatter.fragments.length, removed: shatter.removed, sum: shatter.fragments.reduce((n, f) => n + f.count, 0) + shatter.count, kinds: shatter.fragments.map(f => f.kind + ':' + f.count).join(' ')});
console.log(JSON.stringify(out, null, 1));
