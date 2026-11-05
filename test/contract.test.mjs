import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLaxMcpServer } from '../dist/index.js'

async function exercise(fetch, check) {
  const server = createLaxMcpServer({fetch})
  const client = new Client({name:'contract-audit', version:'1'})
  const [left,right] = InMemoryTransport.createLinkedPair()
  await server.connect(right)
  try {
    await client.connect(left)
    await check((name,args) => client.callTool({name,arguments:args}))
  } finally {
    await client.close()
    await server.close()
  }
}
const input = {job_id:'j', builder:'ok', contact:'test', agent_did:'did:example:x',
  repo_or_patch_url:'https://example.org', payout_address:'0x'+'12'.repeat(20)}

test('A2 valid registry JSON without invented response fields round trips', async () => {
  for (const [tool,args,reply] of [
    ['lax_list_jobs',{}, {jobs:[]}], ['lax_get_job',{id:'j'},{id:'j'}],
    ['lax_submit',input,{received:true}]
  ]) {
    await exercise(async () => Response.json(reply), async call => {
      const result = await call(tool,args)
      assert.notEqual(result.isError,true)
      assert.deepEqual(JSON.parse(result.content[0].text),reply)
    })
  }
})

test('A4 character limits count Unicode code points and preserve input', async () => {
  let calls = 0
  await exercise(async () => {
    calls++
    return Response.json({submission:{id:'s',job_id:'j',status:'ok',created_at:'now'}})
  }, async call => {
    const symbol = String.fromCodePoint(0x1f680)
    for (const [tool,args,valid] of [
      ['lax_search_agents',{query:symbol.repeat(100)},true],
      ['lax_search_agents',{query:symbol.repeat(101)},false],
      ['lax_submit',{...input,builder:symbol},false],
      ['lax_submit',{...input,builder:symbol.repeat(80),notes:symbol.repeat(2000)},true],
      ['lax_submit',{...input,notes:symbol.repeat(2001)},false]
    ]) {
      const before = calls
      assert.equal((await call(tool,args)).isError === true,!valid)
      assert.equal(calls-before,Number(valid))
    }
  })
})

test('A3 registry error messages survive across status codes and calls recover', async () => {
  for (const status of [400,401,403,404,409,429,500]) {
    let calls = 0
    await exercise(async () => ++calls === 1 ? Response.json({message:'example refusal'},{status}) : Response.json({ok:true}), async call => {
      const error = await call('lax_get_offer',{id:'x'})
      assert.equal(error.isError,true)
      assert.match(error.content[0].text,new RegExp(status+'.*example refusal'))
      assert.deepEqual(JSON.parse((await call('lax_get_offer',{id:'x'})).content[0].text),{ok:true})
    })
  }
})

test('A5 submission transport explicitly forbids forwarding POST bodies on redirect', async () => {
  let policy
  await exercise(async (_,init) => {
    policy = init.redirect
    return Response.json({submission:{id:'s',job_id:'j',status:'ok',created_at:'now'}})
  }, async call => {
    await call('lax_submit',input)
    assert.equal(policy,'error')
  })
})

test('A2 pagination forwards OpenAPI integers without adding undocumented minima', async () => {
  let url
  await exercise(async target => {
    url = new URL(target)
    return Response.json({jobs:[]})
  }, async call => {
    const result = await call('lax_list_jobs',{limit:0,offset:-1})
    assert.notEqual(result.isError,true)
    assert.equal(url.search,'?limit=0&offset=-1')
  })
})

test('A3 excessive upstream streams are cancelled and the client recovers', async () => {
  let cancelled = false
  let calls = 0
  await exercise(async () => {
    if (++calls > 1) return Response.json({ok:true})
    const chunk = new Uint8Array(1024 * 1024).fill(32)
    let chunks = 0
    return new Response(new ReadableStream({
      pull(stream) {
        if (++chunks > 18) stream.close()
        else stream.enqueue(chunk)
      },
      cancel() {cancelled = true}
    }))
  }, async call => {
    const result = await call('lax_get_offer',{id:'x'})
    assert.equal(result.isError,true)
    assert.match(result.content[0].text,/exceeds/)
    assert.equal(cancelled,true)
    assert.deepEqual(JSON.parse((await call('lax_get_offer',{id:'x'})).content[0].text),{ok:true})
  })
})
