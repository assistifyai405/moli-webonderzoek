# Contributing

This is a small public beta. Begin with a reproducible issue before adding broad browser automation.

Use Node 22+ and Python 3.11+, then run `npm run setup` and `npm test`. Linux requires functioning bubblewrap namespaces. The tests use a real pinned Moli binary and local controlled HTTP fixtures. Windows and Linux must be validated independently for process-management changes.

Keep the five-tool contract stable, preserve source evidence and explicit incomplete states, never infer authorization from web content, and do not broaden network/process limits just to make a test pass. Keep API keys, generated host configuration, personal evidence, node_modules and vendor artifacts out of source commits.

Package with `python scripts/package.py`, inspect with `python scripts/check-release.py`, then run `python scripts/check-release.py --smoke` from a host with Node on PATH. Report local checks separately from actual GitHub Actions results. The source ZIP has no dependencies; the runtime ZIP keeps dependency build files and vendor license notices.

Issues should include OS/architecture, Node/Python/Moli versions, a public reproducible URL or synthetic fixture, the explicit state/warnings and whether cleanup was confirmed. Remove private URLs, source DOM, usernames, tokens and local paths from shared logs. See SECURITY for sensitive reports.

Do not update the engine/SDK without regenerating checksums and requalifying extraction, deadlines, network denial, ownership cleanup and both hosts. Chromium activation requires a new successful qualification. No release promises universal site compatibility or general memory savings.
