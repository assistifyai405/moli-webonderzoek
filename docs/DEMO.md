# A two-minute source-evidence demo

After setup, run `npm run demo`. It uses real stdio MCP calls, reads `https://nodejs.org/en`, prints an excerpt and evidence UUID, retrieves another text section and compares the saved snapshot with itself. No model/API key is needed.

The Node.js website receives the request. Text, warnings and status can vary with the site; do not expect a scripted success transcript. A selector is intentionally omitted to show semantic uncertainty. The demo exits with an error if no evidence was stored or cleanup is unconfirmed.

Once connected to Codex, try:

> Read https://nodejs.org/en with Moli using selector main. Explain the main features and cite the source. Tell me about warnings or missing content.

Then:

> Show the saved source passages behind your first claim using moli_get_evidence.

For a real change comparison, explicitly save the same source later with the same selector/engine, then ask:

> Compare these two evidence UUIDs, quote the changed passages, and distinguish extraction differences from website changes.

The example above is a suggested interaction, not a claim that current-chat activation or future source changes were tested. A self-comparison cannot demonstrate monitoring. See the local browser/MCP evidence in TESTBEWIJS.
