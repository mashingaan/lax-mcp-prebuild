import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createLaxHttpServer } from '../dist/http.js'
test('A5 A6 actual stdio SDK transport has no sensitive logs and no network',async()=>{
 const client=new Client({name:'stdio-test',version:'1'})
 const transport=new StdioClientTransport({command:process.execPath,args:['--import',new URL('./mock-fetch.mjs',import.meta.url).href,fileURLToPath(new URL('../dist/cli.js',import.meta.url))],stderr:'pipe'})
 let stderr=''
 const errors=[]
 client.onerror=error=>errors.push(error.message)
 try {
  await client.connect(transport)
  transport.stderr?.on('data',chunk=>{stderr+=chunk.toString()})
  assert.equal((await client.listTools()).tools.length,5)
  const result=await client.callTool({name:'lax_submit',arguments:{job_id:'test',builder:'Agent',contact:'SECRET_CONTACT',payout_address:'0x'+'ab'.repeat(20),repo_or_patch_url:'https://example.com/repo',agent_did:'did:example:agent'}})
  assert.notEqual(result.isError,true)
  assert.doesNotMatch(stderr,/SECRET_CONTACT|abababab|authorization|headers/i)
  assert.deepEqual(errors,[])
 } finally {await client.close()}
})
test('A6 actual Streamable HTTP SDK initializes, lists and calls tools',async()=>{
 let calls=0
 const server=createLaxHttpServer({fetch:async()=>{calls++
  return Response.json({jobs:[],count:0})}})
 server.listen(0,'127.0.0.1')
 await once(server,'listening')
 const base=`http://127.0.0.1:${server.address().port}`
 const client=new Client({name:'http-test',version:'1'})
 try {
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')))
  assert.equal((await client.listTools()).tools.length,5)
  const result=await client.callTool({name:'lax_list_jobs',arguments:{limit:1}})
  assert.deepEqual(JSON.parse(result.content[0].text),{jobs:[],count:0})
  assert.equal(calls,1)
  assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'})).status,403)
  assert.equal((await fetch(base+'/missing')).status,404)
 } finally {
  await client.close()
  await new Promise(resolve=>server.close(resolve))
 }
})
test('A6 packaging metadata and A7 configuration/examples are present',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'))
 assert.equal(pkg.bin['lax-mcp'],'dist/cli.js')
 assert.match(pkg.dependencies['@modelcontextprotocol/sdk'],/^1\./)
 const readme=readFileSync('README.md','utf8')
 for(const name of ['mcpServers','lax_search_agents','lax_get_offer','lax_list_jobs','lax_get_job','lax_submit']) assert.ok(readme.includes(name))
 assert.ok(readme.includes('not published'))
})
