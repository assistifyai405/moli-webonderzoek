// Recovery-first: move the known package to a sibling archive. Evidence stays
// in that archive. Never delete a caller-specified directory recursively.
import fs from 'node:fs/promises';import path from 'node:path';
const args=process.argv.slice(2),target=args[args.indexOf('--target')+1];
if(!args.includes('--target')||!target||!path.isAbsolute(target))throw new Error('Use --target ABSOLUTE_DIRECTORY and optionally --apply.');
const marker=JSON.parse(await fs.readFile(path.join(target,'.moli-install.json'),'utf8'));
if(path.resolve(marker.target)!==path.resolve(target))throw new Error('Installation marker does not match this directory.');
const archive=target+'.archived-'+Date.now();console.log(JSON.stringify({target,archive,evidence_preserved:true,global_config_changed:false},null,2));
if(args.includes('--apply'))await fs.rename(target,archive);
