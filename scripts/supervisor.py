"""Private browser process supervisor. Input/output is a bounded JSON-lines IPC.

Linux: own session + subreaper + process-group cleanup; optional bwrap filesystem
isolation. Windows: launch suspended, assign a kill-on-close Job, then resume.
No existing browser process is attached. No arbitrary exception text is emitted.
"""
import base64, ctypes, json, os, signal, subprocess, sys, threading, time
from pathlib import Path

lock=threading.Lock()
def emit(value):
    with lock:
        try: print(json.dumps(value),flush=True)
        except BrokenPipeError: pass

def win_job():
    from ctypes import wintypes as w
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.CreateJobObjectW.argtypes=[ctypes.c_void_p,w.LPCWSTR];k.CreateJobObjectW.restype=w.HANDLE
    k.SetInformationJobObject.argtypes=[w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD];k.SetInformationJobObject.restype=w.BOOL
    k.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE];k.AssignProcessToJobObject.restype=w.BOOL
    k.TerminateJobObject.argtypes=[w.HANDLE,w.UINT];k.TerminateJobObject.restype=w.BOOL
    k.QueryInformationJobObject.argtypes=[w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD,ctypes.c_void_p];k.QueryInformationJobObject.restype=w.BOOL
    k.CloseHandle.argtypes=[w.HANDLE];k.CloseHandle.restype=w.BOOL
    class BASIC(ctypes.Structure):
        _fields_=[('PerProcessUserTimeLimit',ctypes.c_longlong),('PerJobUserTimeLimit',ctypes.c_longlong),('LimitFlags',w.DWORD),('MinimumWorkingSetSize',ctypes.c_size_t),('MaximumWorkingSetSize',ctypes.c_size_t),('ActiveProcessLimit',w.DWORD),('Affinity',ctypes.c_size_t),('PriorityClass',w.DWORD),('SchedulingClass',w.DWORD)]
    class IO(ctypes.Structure):_fields_=[(x,ctypes.c_ulonglong) for x in ['ReadOperationCount','WriteOperationCount','OtherOperationCount','ReadTransferCount','WriteTransferCount','OtherTransferCount']]
    class EXT(ctypes.Structure):_fields_=[('BasicLimitInformation',BASIC),('IoInfo',IO),('ProcessMemoryLimit',ctypes.c_size_t),('JobMemoryLimit',ctypes.c_size_t),('PeakProcessMemoryUsed',ctypes.c_size_t),('PeakJobMemoryUsed',ctypes.c_size_t)]
    class ACCOUNT(ctypes.Structure):_fields_=[(x,ctypes.c_longlong) for x in ['TotalUserTime','TotalKernelTime','ThisPeriodTotalUserTime','ThisPeriodTotalKernelTime']]+[(x,w.DWORD) for x in ['TotalPageFaultCount','TotalProcesses','ActiveProcesses','TotalTerminatedProcesses']]
    job=k.CreateJobObjectW(None,None)
    if not job:raise RuntimeError('job_create_failed')
    limits=EXT();limits.BasicLimitInformation.LimitFlags=0x2000|0x200|0x8 # kill-on-close, aggregate commit memory, process cap
    limits.JobMemoryLimit=512*1024*1024;limits.BasicLimitInformation.ActiveProcessLimit=32
    if not k.SetInformationJobObject(job,9,ctypes.byref(limits),ctypes.sizeof(limits)):raise RuntimeError('job_limits_failed')
    def assign(p):
        if not k.AssignProcessToJobObject(job,w.HANDLE(int(p._handle))):raise RuntimeError('job_assign_failed')
        # The only thread belongs to our suspended child. ResumeThread is a
        # documented API; the thread is located before any target code runs.
        class THREAD(ctypes.Structure):_fields_=[('dwSize',w.DWORD),('cntUsage',w.DWORD),('th32ThreadID',w.DWORD),('th32OwnerProcessID',w.DWORD),('tpBasePri',w.LONG),('tpDeltaPri',w.LONG),('dwFlags',w.DWORD)]
        k.CreateToolhelp32Snapshot.argtypes=[w.DWORD,w.DWORD];k.CreateToolhelp32Snapshot.restype=w.HANDLE
        k.Thread32First.argtypes=[w.HANDLE,ctypes.POINTER(THREAD)];k.Thread32Next.argtypes=k.Thread32First.argtypes
        k.OpenThread.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenThread.restype=w.HANDLE
        k.ResumeThread.argtypes=[w.HANDLE];k.ResumeThread.restype=w.DWORD
        snapshot=k.CreateToolhelp32Snapshot(4,0);t=THREAD();t.dwSize=ctypes.sizeof(t);ok=k.Thread32First(snapshot,ctypes.byref(t));resumed=False
        while ok:
            if t.th32OwnerProcessID==p.pid:
                h=k.OpenThread(2,False,t.th32ThreadID)
                if h:
                    resumed=k.ResumeThread(h)!=0xffffffff;k.CloseHandle(h)
                break
            ok=k.Thread32Next(snapshot,ctypes.byref(t))
        k.CloseHandle(snapshot)
        if not resumed:raise RuntimeError('resume_failed')
    def active():
        a=ACCOUNT()
        if not k.QueryInformationJobObject(job,1,ctypes.byref(a),ctypes.sizeof(a),None):return None
        return a.ActiveProcesses
    def peak():
        e=EXT()
        return e.PeakJobMemoryUsed if k.QueryInformationJobObject(job,9,ctypes.byref(e),ctypes.sizeof(e),None) else None
    return assign,lambda:k.TerminateJobObject(job,1),active,peak,lambda:k.CloseHandle(job)

def linux_members(pgid):
    found=[];rss=0;records=[]
    for f in Path('/proc').iterdir():
        if not f.name.isdigit():continue
        try:
            fields=(f/'stat').read_text().rsplit(')',1)[1].split()
            records.append((int(f.name),int(fields[1]),int(fields[2]),fields[0],int(fields[21])*os.sysconf('SC_PAGE_SIZE')))
        except (OSError,ValueError,IndexError):pass
    # Seed only with actual children of this private supervisor. Do not attach
    # an unrelated process merely because its PID reused the old group leader.
    owned={r[0] for r in records if r[1]==os.getpid()}
    # Bubblewrap creates a new session inside its PID namespace. Include the
    # whole descendant tree, not merely the wrapper's original process group.
    while True:
        expanded=owned|{r[0] for r in records if r[1] in owned}
        if expanded==owned:break
        owned=expanded
    for pid,_,_,state,memory in records:
        if pid in owned and state!='Z':found.append(pid);rss+=memory
    return found,rss

def main():
    raw=sys.stdin.readline(65536)
    config=json.loads(raw)
    if len(raw)>=65535:raise RuntimeError('oversize_config')
    command=config['command'];deadline=time.monotonic()+config['timeout_ms']/1000
    cancelled=threading.Event();limit=threading.Event();reason=['completed'];peak=0
    def cancel():
        for line in sys.stdin:
            if line.strip():cancelled.set();break
        cancelled.set() # parent EOF is cancellation, never leave a browser behind
    threading.Thread(target=cancel,daemon=True).start()
    if os.name=='nt':
        assign,kill,active,peak_job,close=win_job()
        p=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=config['env'],cwd=config['cwd'],creationflags=0x4|0x08000000)
        try:assign(p)
        except Exception:p.kill();p.wait();close();raise
    else:
        if ctypes.CDLL(None).prctl(36,1,0,0,0)!=0:raise RuntimeError('subreaper_unavailable')
        p=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=config['env'],cwd=config['cwd'],start_new_session=True)
        def kill():
            members=linux_members(p.pid)[0]
            try:
                if any(os.getpgid(pid)==p.pid for pid in members):os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            for pid in reversed(members):
                if pid not in linux_members(p.pid)[0]:continue
                try:os.kill(pid,signal.SIGKILL)
                except ProcessLookupError:pass
        active=lambda:len(linux_members(p.pid)[0]);peak_job=lambda:peak;close=lambda:None
    emit({'type':'started','pid':p.pid,'containment':'windows_job_suspended' if os.name=='nt' else 'linux_session_subreaper'})
    sizes={'stdout':0,'stderr':0}
    def read(stream,name,max_bytes):
        while True:
            chunk=stream.read1(16384)
            if not chunk:break
            sizes[name]+=len(chunk)
            if sizes[name]>max_bytes:limit.set();continue
            emit({'type':name,'data':base64.b64encode(chunk).decode()})
    threads=[threading.Thread(target=read,args=(p.stdout,'stdout',config.get('max_stdout',4194304))),threading.Thread(target=read,args=(p.stderr,'stderr',65536))]
    for t in threads:t.start()
    while p.poll() is None:
        if os.name!='nt':peak=max(peak,linux_members(p.pid)[1])
        if cancelled.is_set():reason[0]='cancelled';break
        if limit.is_set():reason[0]='output_limit';break
        if time.monotonic()>=deadline:reason[0]='timeout';break
        if os.name!='nt' and peak>512*1024*1024:reason[0]='memory_limit';break
        time.sleep(.025)
    # Always terminate remaining children, including after an ordinary parent exit.
    peak=max(peak,peak_job() or 0);kill()
    try:p.wait(timeout=2)
    except subprocess.TimeoutExpired:pass
    until=time.monotonic()+2
    remaining=active()
    while remaining not in (0,None) and time.monotonic()<until:
        if os.name!='nt':
            while True:
                try:
                    pid,_=os.waitpid(-1,os.WNOHANG)
                    if pid==0:break
                except ChildProcessError:break
        time.sleep(.02);remaining=active()
    for t in threads:t.join(timeout=1)
    cleanup=remaining==0 and p.poll() is not None and not any(t.is_alive() for t in threads)
    close()
    if limit.is_set() and reason[0]=='completed':reason[0]='output_limit'
    emit({'type':'done','exit_code':p.returncode,'reason':reason[0],'cleanup_success':cleanup,'cleanup_unknown':not cleanup,'remaining_processes':remaining,'peak_process_tree_bytes':peak,'memory_measure':'job_peak_commit' if os.name=='nt' else 'sampled_group_rss','sizes':sizes})
    for stream in [p.stdout,p.stderr]:stream.close()

if __name__=='__main__':
    try:main()
    except Exception:emit({'type':'fatal','reason':'supervisor_failed','cleanup_success':False,'cleanup_unknown':True});sys.exit(1)
