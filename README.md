# Moli Web Research

Local web research for AI assistants, with retrievable source evidence.

**0.2.0-beta.1 · x64 Windows and Linux/WSL · Node.js 22+ · Python 3.11+**

Read selected public pages, retain the rendered source and extracted text, and compare saved snapshots. Use the five tools through a standard stdio MCP client, or connect them to local Codex with a skill that can activate for relevant research tasks.

[Quick demo](docs/DEMO.md) · [Dutch guide](README.nl.md) · [Validation](TESTBEWIJS.md) · [Limits](docs/LIMITS.md) · [Upstream and licenses](THIRD-PARTY-NOTICES.md)

This is an independent integration built on [Moli by Lexmount](https://github.com/lexmount/moli). We did not build the browser engine. The wrapper adds selected-origin policy, bounded execution, local source evidence and snapshot comparison. No AI model or API subscription is included or required by this package; your assistant may have its own costs.

## What can I use it for?

- Read documentation and cite the exact source passages your assistant used.
- Gather a small set of public sources with explicit incomplete/blocked states.
- Retrieve passages that did not fit in the initial tool response.
- Compare two snapshots you explicitly captured at different times.

Example prompt after connection:

> Read https://nodejs.org/en with Moli. Explain the main features, cite the source, and tell me if the extraction is incomplete.

Moli Web Research reads provided URLs. Find URLs with your assistant's existing search tool. This beta is not a general search engine, an automated monitor, or a personal logged-in browser.

## Install from source

1. Download/extract the source release or clone this repository into a permanent folder.
2. Install **Node.js 22+** and **Python 3.11+** yourself if needed. Linux also requires `/usr/bin/bwrap` (bubblewrap) with functioning user/PID namespaces. This installer does not change host sandbox policy.
3. In that folder, run:

```sh
npm run setup
```

Setup installs exact lockfile dependencies with `npm ci --ignore-scripts`, downloads the pinned **Moli 1.1.16** asset for your host, verifies archive/binary SHA-256 and generates your local MCP paths. Nothing is installed globally. If Python is not discoverable, set `MOLI_PYTHON` to its absolute executable path and retry. Only x64 Windows and Linux are supported by this beta; macOS/ARM have not been qualified.

## Install the runtime ZIP

Extract the runtime ZIP into a permanent folder. It includes npm dependencies, Moli binaries and their license notices; Node and Python remain prerequisites.

```sh
node scripts/setup.mjs --skip-dependencies --skip-engine
```

This verifies the existing engine and host setup without downloading dependencies. ZIP extraction may remove Linux execute permissions; setup checks and restores the project engine's executable bit.

To make a separate copy without overwriting an existing folder:

```sh
node scripts/install.mjs --target ABSOLUTE_NEW_DIRECTORY
node scripts/install.mjs --target ABSOLUTE_NEW_DIRECTORY --apply
```

The first command previews, the second copies. Run commands from the installed copy afterward. Keep it in place while registered.

## Choose allowed websites

Only `https://example.com` and `https://nodejs.org` are selected initially. Add exact origins for the sources you want to research:

```sh
npm run origins -- list
npm run origins -- add https://docs.python.org
npm run origins -- add https://docs.python.org --apply
npm run origins -- remove https://docs.python.org --apply
```

Changes preview by default, keep a backup when applied and preserve other configuration. Restart/reconnect the MCP server afterward. There is no wildcard/all-web switch. Private/reserved IPs, local hosts, embedded credentials and nonstandard ports are refused. Domain names are resolved and checked again on every fetch: adding a name cannot authorize private DNS results.

Redirect destinations and required JavaScript/asset origins must also be selected. A blocked subrequest is reported; do not interpret a partial page as complete evidence. Avoid adding an origin merely to silence a warning.

## Connect to local Codex

Run from the permanent folder:

```sh
npm run connect
npm run connect -- --apply
```

The preview prints the Codex/skill destinations. Applying adds a user-level `mcp_servers.moli-webonderzoek` entry and a personal `moli-webonderzoek` skill. It preserves unrelated TOML and comments, stores a private backup before a config change, refuses a conflicting server or skill, and is idempotent for the same install. `CODEX_HOME` selects a custom Codex config directory; skills use the current host user's `.agents/skills` directory.

Reconnect/restart Codex and open a fresh chat. Ask it to list the five Moli tools and call `moli_status`, then read an allowed source. **Configuration is not proof of current-chat tool discovery.** Windows, WSL and remote clients can have different homes and tool catalogs; connect each intended host independently.

The skill description supports implicit activation for webpage research. It does not run a browser for every message and cannot guarantee the model always selects it. GitHub publication does not install anything for anyone. Web/mobile/cloud access is outside this local beta.

Alternatively, import the generated `.mcp.json` in a compatible MCP client. For Codex local plugin authoring, the existing `.codex-plugin/plugin.json` bundles the skill and generated config. Complete setup first, and choose either the direct MCP+skill route or the local plugin route to avoid duplicate registrations. Public plugin-directory submission is a separate process and has not been done.

Official references: [MCP configuration](https://developers.openai.com/codex/mcp), [skill discovery and implicit use](https://developers.openai.com/codex/skills), [plugin packaging](https://developers.openai.com/plugins/build/plugins).

## Five tools

| Tool | Purpose |
|---|---|
| `moli_status` | Actual engine, host, selected origins and limits; no network |
| `moli_read_page` | Read one URL, optional CSS content selector and timeout; save local evidence |
| `moli_read_pages` | Read up to ten URLs with a shared deadline |
| `moli_get_evidence` | Retrieve saved text by UUID with offset/limit |
| `moli_compare_evidence` | Compare two existing snapshots of the same source |

Check `state`, `warnings`, `truncated` and `cleanup_success`. Without a selector the result reports semantic uncertainty. A successful selector only confirms element presence. HTTP 200, source hashes and model confidence do not prove source truth.

## Try it without an AI provider

```sh
npm run doctor
npm run demo
npm test
```

The demo runs real MCP calls against the selected Node.js source, retrieves saved evidence and compares a snapshot with itself. It does not generate an AI summary. Self-comparison demonstrates the tool, not change detection across time. Site availability and content may change.

## Evidence and limits

Evidence stays in `data/evidence`: original rendered DOM, full normalized text, safe metadata and integrity hashes. Cookies and authentication headers are excluded. The store stops at 64 MiB rather than silently deleting data; there is no automatic retention UI.

Windows uses a suspended process attached to a private Job before execution, with bounded processes/memory and verified cleanup. **Windows filesystem isolation is not qualified.** Linux requires a bubblewrap mount/PID namespace but shares the network namespace to reach the policy proxy. This is not a full OS network sandbox. Use selected trusted public sources; see [the complete limits](docs/LIMITS.md).

The optional Edge/Chromium adapter remains disabled: the local qualification failed within the containment conditions. No performance or memory advantage over Chromium has been established for this wrapper.

Website content is untrusted data. The skill instructs the assistant to reject embedded attempts to change tasks, reveal secrets or invoke actions. This instruction does not establish general LLM prompt-injection resistance. Websites receive requests, and your AI provider may process returned passages. Local execution does not make the entire workflow private or offline.

## Recovery and contributing

To disconnect, remove only `mcp_servers.moli-webonderzoek` from your Codex configuration and the personal `moli-webonderzoek` skill you installed. Preserve unrelated configuration; a full old backup may predate other changes. Reconnect Codex afterward.

`node scripts/uninstall.mjs --target ABSOLUTE_INSTALL_DIRECTORY` previews archiving a marked installation; `--apply` moves it to a sibling archive with evidence intact. Disconnect before archiving. This does not uninstall Node/Python or delete your data.

See [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md), and [the beta test guide](docs/BETA-TEST.md). GitHub CI is defined for Windows and Linux; local test evidence and GitHub-run evidence are reported separately.

The wrapper is MIT licensed. Upstream Moli and bundled dependencies retain their original licenses and notices. See [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES.md).
