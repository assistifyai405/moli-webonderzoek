import path from 'node:path';
import {ROOT} from '../src/process.mjs';
import {editOrigins} from '../src/config.mjs';
const [action='list',origin,...flags] = process.argv.slice(2);
try {
  if (flags.some(v=>v!=='--apply') || action==='list' && origin !== undefined) throw new Error('Usage: node scripts/origins.mjs list | add ORIGIN [--apply] | remove ORIGIN [--apply]');
  console.log(JSON.stringify(await editOrigins(path.join(ROOT,'config.json'),action,origin,{apply:flags.includes('--apply')}),null,2));
} catch(e) { console.error(e.message); process.exitCode=1; }
