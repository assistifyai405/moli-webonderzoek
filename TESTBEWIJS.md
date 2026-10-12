# Validation evidence — 0.2.0-beta.1

Local checks on **2026-10-12** used real Moli 1.1.16 binaries, the official stdio MCP SDK, controlled HTTP fixtures and separate host runtimes:

| Host | Runtime | Passed | Failed | Skipped |
|---|---|---:|---:|---:|
| Linux / WSL | Node 22.22.1, Python 3.14.4 | 40 | 0 | 0 |
| Native Windows | Node 24.19.0, Python 3.12.14 | 39 | 0 | 1 Linux-only namespace test |

The suites cover real static/dynamic browser content, tables/code/links, redirects, blocked private requests/subresources, empty/login/captcha/raw/HTTP errors, cancellation, deadlines, output/response limits, owned orphan cleanup, clean environment, evidence integrity/pagination, same-source comparison and settings incompatibility. Added beta checks cover origin preview/apply/backup/removal, invalid/private origins, writer conflicts and isolated-profile Codex connection that preserves unrelated TOML and refuses conflicts. MCP tests establish actual standalone discovery of five tools, not their presence in an existing chat.

Both host setup/doctor checks passed with real engine checksum verification. The provider-free demo additionally fetches the public Node.js source and retrieves saved evidence. A partial or uncertain state is disclosed, not scored as fully complete. No paid AI/TypeSafe call was made for this beta build.

`npm audit --omit=dev` reported zero known vulnerabilities at this check. This is not an independent security audit.

Public source and runtime packages exclude local paths/configuration, evidence and raw host logs. Release checks verify archive/member SHA-256 and run actual browser/MCP smoke calls from a fresh extraction. Exact generated package checks are distributed beside the release assets; source-level host counts are in [validation-summary.json](docs/validation-summary.json).

The GitHub Actions workflow is defined for ubuntu-24.04 and windows-latest. **No actual GitHub CI run is claimed before publication.** There is no external-user adoption/usability evidence. Native current-chat discovery, implicit activation and cloud/mobile access require separate destination checks.

Edge qualification previously failed within the chosen Windows containment; fallback remains off. Windows filesystem isolation is not qualified. No valid Chromium performance baseline or general memory-savings claim has been established. No LLM prompt-injection robustness benchmark was performed. See [LIMITS](docs/LIMITS.md).

Raw local test/demo logs remain on the development machine, outside the public package selection. Reproduce with `npm run setup`, `npm test`, `python scripts/package.py` and `python scripts/check-release.py --smoke`.
