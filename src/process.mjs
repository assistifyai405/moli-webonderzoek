import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function cleanEnv(temp) {
  const env={HOME:temp,USERPROFILE:temp,TMP:temp,TEMP:temp,TMPDIR:temp,LANG:'C.UTF-8',PATH:process.platform==='win32'?'C:\\Windows\\System32':'/usr/bin:/bin',MOLI_LAYOUT:'false',MOLI_RESOURCE:'false'};
  if(process.platform==='win32') {env.SystemRoot=process.env.SystemRoot??'C:\\Windows';env.WINDIR=env.SystemRoot;env.SystemDrive=env.SystemRoot.slice(0,2);env.LOCALAPPDATA=temp;env.APPDATA=temp;}
  return env;
}
export function pythonPath() {
  const configured=process.env.MOLI_PYTHON;
  if(configured && path.isAbsolute(configured) && fs.existsSync(configured))return configured;
  const candidate=process.platform==='win32'?path.join(process.env.USERPROFILE??'', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'/usr/bin/python3';
  return candidate;
}
export function sandboxCommand(binary,args,{temp,sandbox=true}={}) {
  if (process.platform!=='linux'||!sandbox)return [binary,...args];
  const bwrap='/usr/bin/bwrap'; if(!fs.existsSync(bwrap))throw new Error('filesystem_sandbox_unavailable');
  const cmd=[bwrap,'--die-with-parent','--unshare-user','--unshare-pid','--new-session','--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/home','--setenv','HOME','/tmp','--chdir','/tmp'];
  if(fs.existsSync('/lib64'))cmd.push('--ro-bind','/lib64','/lib64');
  for(const f of ['/etc/ssl','/etc/resolv.conf','/etc/hosts','/etc/nsswitch.conf'])if(fs.existsSync(f))cmd.push('--ro-bind',f,f);
  cmd.push('--ro-bind',path.dirname(binary),'/engine','--',`/engine/${path.basename(binary)}`,...args);return cmd;
}
export async function runSupervised({command,temp,timeoutMs=20000,signal,maxStdout=4194304}) {
  if(signal?.aborted)return {reason:'cancelled',cleanup_success:true,stdout:'',stderr:''};
  const proc=spawn(pythonPath(),[path.join(ROOT,'scripts/supervisor.py')],{env:cleanEnv(temp),cwd:temp,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout=[],stderr=[],done,started,closed=false;
  const abort=()=>{if(!closed)proc.stdin.write('{"cancel":true}\n',()=>{});};
  proc.stdin.on('error',()=>{});signal?.addEventListener('abort',abort,{once:true});
  const lines=readline.createInterface({input:proc.stdout});
  lines.on('line',line=>{try {const v=JSON.parse(line);if(v.type==='stdout')stdout.push(Buffer.from(v.data,'base64'));else if(v.type==='stderr')stderr.push(Buffer.from(v.data,'base64'));else if(v.type==='started')started=v;else if(v.type==='done'||v.type==='fatal')done=v;}catch{done={reason:'invalid_supervisor_output',cleanup_success:false};}});
  // IPC remains open until the supervisor completes; EOF would cancel it.
  proc.stdin.write(JSON.stringify({command,cwd:temp,env:cleanEnv(temp),timeout_ms:timeoutMs,max_stdout:maxStdout})+'\n');
  const timer=setTimeout(abort,timeoutMs+3000);
  const hard=setTimeout(()=>{proc.kill();},timeoutMs+8000);
  await new Promise(resolve=>{proc.once('error',()=>{done={reason:'supervisor_unavailable',cleanup_success:false};resolve();});proc.once('close',resolve);});
  closed=true;clearTimeout(timer);clearTimeout(hard);signal?.removeEventListener('abort',abort);lines.close();proc.stdin.destroy();
  return {...(done??{reason:'supervisor_lost',cleanup_success:false,cleanup_unknown:true}),pid:started?.pid,containment:started?.containment,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')};
}
