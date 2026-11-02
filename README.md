# LAX MCP server prebuild

Node 20+, TypeScript and pinned MCP SDK 1.x. Implementation for agreed LAX MCP award OP2, job a14478ee-35f7-4457-843a-482f25af6dad. Registry publication and official milestone acceptance are verified separately from repository checks. No payments or wallet keys are supported.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
node dist/cli.js
node dist/cli.js --http --port 3000
```

Default transport is stdio, with no application logs on stdout. HTTP is stateless Streamable HTTP on http://127.0.0.1:3000/mcp, bound to loopback with Host and Origin restrictions. Set PORT instead of --port if preferred. This HTTP mode is a local agent tool, not a publicly authenticated deployment. GET/SSE sessions are not needed for the stateless JSON transport. Do not expose it publicly without authentication, network access controls and an explicit operator mandate.

## npm installation

For the published 0.1.0 release:

```sh
npm install -g @mashingaan/lax-mcp-prebuild@0.1.0
lax-mcp
lax-mcp --http --port 3000
```

Alternatively run without a global installation:

```sh
npx --yes --package @mashingaan/lax-mcp-prebuild@0.1.0 lax-mcp
```

The installed package includes built JavaScript and declarations. Consumers do not need TypeScript or a source checkout. `npm pack` builds from source before assembling the package. The export is available as `import { createLaxMcpServer } from '@mashingaan/lax-mcp-prebuild'`.

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

`lax_submit` is a legacy job submission, not a bid, token transfer or selected-job delivery. Examples do not make live requests. The operator must authorize actual writes. Reads are free and require no key. HTTP errors become isError tool results retaining the HTTP status and registry error message. Untrusted network error details are replaced to avoid leaking endpoint credentials. There is no contact, payout or header logging. Inputs are checked before fetch, including the OpenAPI track enum, builder length 2 to 80, and notes length at most 2000.

`createLaxMcpServer({baseUrl,fetch})` returns an unconnected SDK McpServer for in-memory tests or custom transports. Tool results preserve the raw JSON envelope, including additional registry metadata. Each request captures its own envelope to avoid concurrency races. The jobs client derives from our acceptance-tested LAX fork with dot-segment identifier rejection, with retries disabled in this MCP adapter so each tool operation issues at most one request. It neither changes nor publishes the upstream package.

## Acceptance and verification

- A1: exact five described tools and schemas, real SDK tools/list.
- A2: all routes, encoded IDs, optional parameters, JSON body without job_id, raw envelopes.
- A3: 400/404/409/429/500 and network failures, followed by recovery on the same server.
- A4: invalid id, URL, address, DID, query length and limits, with zero outbound requests.
- A5: actual stdio transport, mocked fetch preload, no sensitive stderr and no protocol parse errors.
- A6: actual stdio and Streamable HTTP SDK sessions, bin metadata and pack dry-run. The published version must additionally pass a clean registry installation and executable smoke test before M2 delivery.
- A7: Claude Desktop configuration and examples for every tool.

Tests are entirely offline, including subprocess transports. `npm test` builds before testing. `npm run test:mutations` checks seven planted defects in routes, query arguments, error handling, job selection, identifier validation and envelope preservation. Hosted CI runs Node 20/22 on Linux and Windows. No live registry submissions are made by tests. Direct read calls are bounded even when an injected fetch or JSON-body promise ignores AbortSignal, and the same server recovers for the next request.

M2 requires registry publication under the owner-authorized scope @mashingaan and a successful clean installation of that exact version. The agreed interface uses the exported factory and the lax-mcp executable. The name lax-mcp is occupied, and this prebuild's scoped name does not claim ownership of it. A registry job schema or PACT change belongs in the reused jobs adapter. Additional red-team tests exercise stalled fetch and body promises for every tool, cancellation and recovery, encoded path attacks, malformed and oversized HTTP requests, and Host/Origin rejection. Generic read query behavior omits an absent query and includes an explicitly empty one. The agreed contract and acceptance mapping are recorded in PACT.md. Hidden-test acceptance must be recorded by Kognai.
