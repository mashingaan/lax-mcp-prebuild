# Agreed award OP2

Source: authenticated GET /registry/jobs/a14478ee-35f7-4457-843a-482f25af6dad/pact, checked 2026-11-02T08:48:16.774Z, HTTP 200, status agreed.
PACT id: pact-OP2-a838c71e. Deal hash: 10dd11214e59689e6c236bd5ccaaf62254cfba319c5cbebc4123fbcf8a52b61f.
The complete authenticated response is preserved separately with SHA256 16d010b2167c7d247fb6eabd351aee37f494aab3fe1deed7cb64c226735962e5.
The agreed PACT controls this delivery. It has no separate interface_fixed or kit hash field.

## Fixed interface

- TypeScript, MCP SDK 1.x, Node 20 or later.
- Export createLaxMcpServer(options?) returning an unconnected SDK McpServer or Server.
- Options: baseUrl defaults to https://lax.kognai.ai/registry, fetch defaults to globalThis.fetch.
- lax_search_agents {query?}, at most 100 characters, GET /search with optional query.
- lax_get_offer {id}, GET /offers/<id>.
- lax_list_jobs {track?,limit?,offset?}, GET /jobs.
- lax_get_job {id}, GET /jobs/<id>.
- lax_submit {job_id,builder,contact,repo_or_patch_url,payout_address,agent_did,notes?}, POST /jobs/<job_id>/submissions with JSON excluding job_id.
- Return registry JSON as text content. HTTP or network failure returns isError with status and message, without breaking subsequent calls.
- A bin, lax-mcp, defaults to stdio. --http serves Streamable HTTP, --port or PORT selects the port.
- No contact, payout address or header logs. Only protocol messages on stdout in stdio mode.
- Hidden tests use an SDK client, in-memory transport and injected fetch without network.

## M1 checklist

Due 2026-11-03T01:37:30.675Z. Value 55.50 USDC on Base after explicit acceptance.

| Requirement | Candidate classification | Evidence |
|---|---|---|
| Exported factory and five described tools with schemas | Satisfied and tested | A1 SDK tools/list, package smoke |
| Three read tools: search, list jobs, get job | Satisfied and tested | A2 route/envelope assertions, read-only live smoke |
| At least one test named for A1 through A7 | Satisfied and tested | server.test.mjs and transports.test.mjs |
| Public repository and exact commit | Verify against hosted CI before delivery | GitHub main and Acceptance workflow |
| M1 hidden tests and two reviewers | External, not claimed passed | Official delivery acceptance only |

## M2 checklist

Due 2026-11-06T20:00:00Z. Value 129.50 USDC on Base after explicit acceptance.

| Criterion | Candidate classification | Evidence |
|---|---|---|
| A1 five described tools and schemas | Satisfied and tested | SDK list assertion |
| A2 all five registry routes and answers | Satisfied and tested | Exact URL/body/envelope assertions |
| A3 status/message failures and recovery | Satisfied and tested | HTTP/network/invalid JSON/timeout tests |
| A4 reject invalid input before request | Satisfied and tested | Missing/malformed parameter and zero-request tests |
| A5 logging and stdio discipline | Satisfied and tested | Actual SDK subprocess protocol and stderr checks |
| A6 stdio and Streamable HTTP | Satisfied and tested | Actual SDK clients, CLI exit and package smoke |
| A6 npm publication with executable | Pending registry verification | Owner npm login is available, publication requires owner 2FA and registry install smoke |
| A7 README Claude Desktop configuration and all examples | Satisfied and tested | README review and A7 test |
| M2 hidden tests and two reviewers | External, not claimed passed | Official delivery acceptance only |

## Packaging and license

Package @mashingaan/lax-mcp-prebuild, executable lax-mcp. The contract gives lax-mcp as an executable example and does not mandate an unscoped package name.
MIT for the MCP adapter, Apache-2.0 for the reused jobs client with LICENSE.jobs-client and NOTICE.md retained.
README documents source and npm installation, both transports, injected factory use, and all five tools. Registry evidence is recorded separately after publication.

Only owner message signatures are used for official deliveries. No payments, transactions, approvals or wallet secrets are required.
