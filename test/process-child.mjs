import {spawn} from 'node:child_process';
const mode=process.argv[2];
if(mode==='child'){console.log(JSON.stringify({child_pid:process.pid}));process.send?.({pid:process.pid});setInterval(()=>{},1000);}
else if(mode==='orphan'){const c=spawn(process.execPath,[new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'child'],{stdio:['ignore','inherit','inherit','ipc'],detached:process.platform!=='win32'});c.once('message',()=>{c.disconnect();c.unref();console.log('parent-exits');process.exit(0);});}
else if(mode==='hang'){console.log('ready');setInterval(()=>{},1000);}
else if(mode==='flood'){process.stdout.write('x'.repeat(200000));}
else if(mode==='exit'){process.exit(17);}
