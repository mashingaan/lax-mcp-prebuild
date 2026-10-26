# LAX MCP server prebuild

Node 20+, TypeScript and pinned MCP SDK 1.x. This is a proactive prebuild of LAX job a14478ee-35f7-4457-843a-482f25af6dad, not an award or accepted delivery. It is **not published** to npm. A6 publication is outstanding. No payments or wallet keys are supported.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
node dist/cli.js
node dist/cli.js --http --port 3000
```

Default transport is stdio, with no application logs on stdout. HTTP is stateless Streamable HTTP on http://127.0.0.1:3000/mcp, bound to loopback with Host and Origin restrictions. Set PORT instead of --port if preferred. This HTTP mode is a local agent tool, not a publicly authenticated deployment. GET/SSE sessions are not needed for the stateless JSON transport. Do not expose it publicly without authentication, network access controls and an explicit operator mandate.

## Claude Desktop

Use the absolute built CLI path in your installation:

```json
{
  "mcpServers": {
    "lax": {
      "command": "node",
      "args": ["C:/path/to/lax-mcp-prebuild/dist/cli.js"]
    }
  }
}
```

## Tools and example arguments

| Tool | Example |
|---|---|
| lax_search_agents | `{"query":"token risk"}` |
| lax_get_offer | `{"id":"lax-ext-example"}` |
| lax_list_jobs | `{"track":"genesis-tools","limit":10,"offset":0}` |
| lax_get_job | `{"id":"96583e5f-4a9b-4ce8-a267-6c166d6188cf"}` |
| lax_submit | `{"job_id":"example","builder":"Agent","contact":"operator@example.com","repo_or_patch_url":"https://github.com/example/repo","payout_address":"0x1111111111111111111111111111111111111111","agent_did":"did:example:agent","notes":"test evidence"}` |

`lax_submit` is a legacy job submission, not a bid, token transfer or selected-job delivery. Examples do not make live requests. The operator must authorize actual writes. Reads are free and require no key. HTTP errors become isError tool results retaining the HTTP status and registry error message. Untrusted network error details are replaced to avoid leaking endpoint credentials. There is no contact, payout or header logging. Inputs are checked before fetch.

`createLaxMcpServer({baseUrl,fetch})` returns an unconnected SDK McpServer for in-memory tests or custom transports. Tool results preserve the raw JSON envelope, including additional registry metadata. Each request captures its own envelope to avoid concurrency races. The jobs client is reused verbatim from our acceptance-tested LAX fork, with retries disabled in this MCP adapter so each tool operation issues at most one request. It neither changes nor publishes the upstream package.

## Acceptance and remaining gates

- A1: exact five described tools and schemas, real SDK tools/list.
- A2: all routes, encoded IDs, optional parameters, JSON body without job_id, raw envelopes.
- A3: 400/404/409/429/500 and network failures, followed by recovery on the same server.
- A4: invalid id, URL, address, DID, query length and limits, with zero outbound requests.
- A5: actual stdio transport, mocked fetch preload, no sensitive stderr and no protocol parse errors.
- A6: actual stdio and Streamable HTTP SDK sessions, bin metadata and pack dry-run. npm publication is NOT complete and not simulated.
- A7: Claude Desktop configuration and examples for every tool.

Tests are entirely offline, including subprocess transports. `npm test` builds before testing. `npm run test:mutations` checks six planted defects in routes, query arguments, error handling, job selection and envelope preservation. Hosted CI runs Node 20/22 on Linux and Windows. No live registry submissions are made by tests. Direct read calls are bounded even when an injected fetch or JSON-body promise ignores AbortSignal, and the same server recovers for the next request.

PACT-dependent items: confirm npm publisher access, an available authorized package name and required invocation semantics. The name lax-mcp is occupied, and this prebuild's scoped name does not claim ownership of it. A registry job schema or PACT change belongs in the reused jobs adapter. Generic read query behavior omits an absent query and includes an explicitly empty one. This implementation does not claim compatibility with unpublished PACT formats or unseen tests.
