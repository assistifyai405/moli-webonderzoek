# Execution and claim boundaries

- Five local stdio MCP tools. No search engine, automatic monitor, login, uploads, purchases or browser profile import.
- x64 Windows and Linux/WSL only. Node 22+, Python 3.11+. Linux requires bubblewrap with usable user/PID namespaces. No macOS/ARM qualification.
- Exact selected HTTP(S) origins, default standard ports. DNS is checked for public addresses and pinned per transport connection. Redirects, scripts and frames are gated by the per-fetch proxy. No wildcard or tool argument to broaden policy.
- HTTPS CONNECT exposes target and wire bytes to the proxy, not HTTP methods or payloads inside TLS. JavaScript may issue network requests. This is not a guarantee of read-only network activity.
- Maximum 10 batch URLs, 2 active fetches, 1 per host, queue 32. Readiness <=15 seconds, subprocess <=20 seconds, batch <=60 seconds including queue/DNS, followed by bounded cleanup.
- Response <=2 MiB, stdout <=4 MiB, stderr <=64 KiB, proxy wire budget <=16 MiB/fetch, <=64 proxy sockets. Proxy request counts include CONNECT tunnels and plain HTTP requests, not every logical HTTPS request.
- Windows: suspended Job assignment before execution, kill-on-close, <=32 processes, <=512 MiB aggregate job commit. The browser uses the user's account; complete filesystem isolation is not qualified.
- Linux: bubblewrap mount/PID namespaces, temporary working directory and no mounted personal folders. The network namespace is shared; policy is not a full OS egress sandbox. Supervisor samples process-tree RSS and kills above 512 MiB; this is not a hard cgroup quota. No hard total CPU quota.
- Cleanup handles only owned processes. Unknown cleanup is a failure and never authorizes fallback. Browser environment excludes inherited provider keys, personal HOME and proxy settings.
- Edge fallback stays disabled because qualification failed in the tested containment. Native engine vulnerabilities are outside this qualification.
- Tool text/batch response <=20,000 characters. Full text is paginated from local evidence; storage <=64 MiB. No automatic deletion or retention UI.
- Diff is a bounded summary of added/removed lines, not a complete ordered/multiplicity-aware diff. Engine/extractor/settings mismatches report uncertainty.
- Hashes detect accidental corruption, not source truth or an attacker rewriting local evidence. Saved original DOM may contain website-provided personal data.
- Website instructions are untrusted data. No LLM prompt-injection robustness benchmark has been performed. Existing AI providers may process source passages.
- Local standalone MCP success does not establish native chat discovery, implicit invocation, cloud/web/mobile reachability, popularity or production readiness.
