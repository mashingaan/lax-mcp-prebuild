import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { request } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLaxMcpServer } from '../dist/index.js'
import { createLaxHttpServer } from '../dist/http.js'
import { createJobsClient } from '../dist/jobs-client.js'
const submission={job_id:'j',builder:'Agent',contact:'private-contact',repo_or_patch_url:'https://example.com/repo',payout_address:'0x'+'ab'.repeat(20),agent_did:'did:example:agent'}
async function pair(fetch) {
 const server=createLaxMcpServer({fetch})
 const client=new Client({name:'redteam',version:'1'})
 const [a,b]=InMemoryTransport.createLinkedPair()
 await server.connect(b)
 await client.connect(a)
 return {client,close:async()=>{await client.close()
  await server.close()}}
}
const success=name=>name==='lax_list_jobs'?{jobs:[],count:0}:name==='lax_get_job'?{job:{id:'j'}}:name==='lax_submit'?{submission:{id:'s',job_id:'j',status:'received',created_at:'now'}}:{ok:true}
test('A4 OpenAPI builder, notes and track boundaries reject before fetch',async()=>{
 let requests=0
 const {client,close}=await pair(async url=>{requests++
  return Response.json(success(url.endsWith('/jobs')?'lax_list_jobs':'lax_submit'))})
 try {
  const cases=[['lax_list_jobs',{track:'unknown-track'}],['lax_submit',{...submission,builder:'A'}],['lax_submit',{...submission,builder:'A'.repeat(81)}],['lax_submit',{...submission,notes:'n'.repeat(2001)}]]
  for(const [name,args] of cases) {
   const result=await client.callTool({name,arguments:args})
   assert.equal(result.isError,true,JSON.stringify(args))
   assert.equal(requests,0)
  }
  assert.equal(requests,0)
  for(const args of [{...submission,builder:'AB',notes:''},{...submission,builder:'A'.repeat(80),notes:'n'.repeat(2000)}]) {
   assert.notEqual((await client.callTool({name:'lax_submit',arguments:args})).isError,true)
  }
  assert.equal(requests,2)
 } finally {await close()}
})
test('A3 every tool times out stalled fetch and body, aborts and recovers without retry', {timeout:4000},async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 for(const name of ['lax_search_agents','lax_get_offer','lax_list_jobs','lax_get_job','lax_submit']) {
  for(const mode of ['fetch','body']) {
   let start,signal,requests=0
   const ready=new Promise(resolve=>{start=resolve})
   const {client,close}=await pair(async(url,init)=>{
    requests++
    if(requests===1) {
     signal=init.signal
     start()
     if(mode==='fetch') return new Promise(()=>{})
     return {ok:true,status:200,json:()=>new Promise(()=>{})}
    }
    return Response.json(success(name))
   })
   try {
    const args=name==='lax_submit'?submission:name==='lax_get_offer'||name==='lax_get_job'?{id:'j'}:{}
    const pending=client.callTool({name,arguments:args})
    await ready
    await Promise.resolve()
    t.mock.timers.tick(15001)
    const result=await pending
    assert.equal(result.isError,true,name+' '+mode)
    assert.match(result.content[0].text,/timed out/)
    assert.equal(signal.aborted,true)
    assert.equal(requests,1)
    assert.notEqual((await client.callTool({name,arguments:args})).isError,true)
    assert.equal(requests,2)
   } finally {await close()}
  }
 }
})
test('A4 adversarial identifiers cannot escape an encoded path segment',async()=>{
 const urls=[]
 const {client,close}=await pair(async url=>{urls.push(new URL(url))
  return Response.json({offer:{id:'ok'}})})
 try {
  for(const id of ['../private','%2e%2e','a?x=1#secret','a\\b','a/b']) {
   assert.notEqual((await client.callTool({name:'lax_get_offer',arguments:{id}})).isError,true)
   const url=urls.at(-1)
   assert.equal(url.pathname,'/registry/offers/'+encodeURIComponent(id))
   assert.equal(url.search,'')
   assert.equal(url.hash,'')
  }
  const previous=urls.length
  assert.equal((await client.callTool({name:'lax_get_offer',arguments:{id:'\ud800'}})).isError,true)
  assert.equal(urls.length,previous)
 } finally {await close()}
})
test('A6 malformed and oversized HTTP requests fail closed and server recovers',async()=>{
 let requests=0
 const server=createLaxHttpServer({fetch:async()=>{requests++
  return Response.json({jobs:[],count:0})}})
 server.listen(0,'127.0.0.1')
 await once(server,'listening')
 const url='http://127.0.0.1:'+server.address().port+'/mcp'
 try {
  const send=(body,headers={})=>fetch(url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...headers},body})
  assert.equal((await send('{')).status,400)
  assert.equal((await send('x'.repeat(65537))).status,413)
  const hostileStatus=await new Promise((resolve,reject)=>{
   const req=request(url,{method:'POST',headers:{host:'attacker.example'}},res=>{res.resume()
    resolve(res.statusCode)})
   req.on('error',reject)
   req.end('{}')
  })
  assert.equal(hostileStatus,403)
  assert.equal((await send('{}',{origin:'null'})).status,403)
  assert.equal(requests,0)
  const response=await send(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'lax_list_jobs',arguments:{}}}))
  assert.equal(response.status,200)
  assert.equal((await response.json()).result.isError,undefined)
  assert.equal(requests,1)
 } finally {await new Promise(resolve=>server.close(resolve))}
})

test('A4 reused jobs client independently enforces OpenAPI boundaries',async()=>{
 let requests=0
 const client=createJobsClient({retries:0,fetch:async url=>{requests++
  return Response.json(success(url.endsWith('/jobs')||url.includes('/jobs?')?'lax_list_jobs':'lax_submit'))}})
 for(const track of ['unknown-track',42,null]) await assert.rejects(client.listJobs({track}),/known registry track/)
 for(const builder of ['A','A'.repeat(81)]) await assert.rejects(client.submit('j',{...submission,builder}),/2 to 80/)
 await assert.rejects(client.submit('j',{...submission,notes:'n'.repeat(2001)}),/at most 2000/)
 assert.equal(requests,0)
 for(const track of ['lax-agents','coding-agents','godman-protocols','templates','genesis-tools','seat']) await client.listJobs({track})
 assert.equal(requests,6)
})
