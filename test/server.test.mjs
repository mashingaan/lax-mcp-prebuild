import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLaxMcpServer } from '../dist/index.js'
const input={job_id:'a/b',builder:'Agent',contact:'private-contact',payout_address:'0x'+'ab'.repeat(20),agent_did:'did:example:agent',repo_or_patch_url:'https://example.com/repo',notes:'notes'}
const parsed=result=>JSON.parse(result.content[0].text)
async function pair(fetch) {
 const server=createLaxMcpServer({baseUrl:'https://example.com/registry',fetch})
 const client=new Client({name:'acceptance',version:'1'})
 const [a,b]=InMemoryTransport.createLinkedPair()
 await server.connect(b)
 await client.connect(a)
 return {client,close:async()=>{await client.close()
  await server.close()}}
}
test('A1 lists exactly five described tools with input schemas',async()=>{
 const {client,close}=await pair(async()=>assert.fail('list tools cannot fetch'))
 try {
  const {tools}=await client.listTools()
  assert.deepEqual(tools.map(t=>t.name).sort(),['lax_search_agents','lax_get_offer','lax_list_jobs','lax_get_job','lax_submit'].sort())
  assert.ok(tools.every(t=>t.description&&t.inputSchema.type==='object'&&t.inputSchema.properties))
 } finally {await close()}
})
test('A2 all routes, input encoding, exact raw registry envelopes and submission body',async()=>{
 const calls=[]
 const responses=[{results:[],count:0},{offer:{id:'x'},extra:1},{jobs:[],count:0,extra:'preserved'},{job:{id:'x'},metadata:'kept'},{submission:{id:'s',job_id:'a/b',status:'received',created_at:'now'},extra:'kept'}]
 const {client,close}=await pair(async(url,init)=>{
  calls.push([url,init])
  return Response.json(responses[calls.length-1])
 })
 try {
  const tools=[['lax_search_agents',{query:'token & agent'}],['lax_get_offer',{id:'a/b'}],['lax_list_jobs',{track:'seat',limit:1,offset:0}],['lax_get_job',{id:'a/b'}],['lax_submit',input]]
  for(const [i,[name,args]] of tools.entries()) assert.deepEqual(parsed(await client.callTool({name,arguments:args})),responses[i])
  assert.equal(calls[0][0],'https://example.com/registry/search?query=token+%26+agent')
  assert.equal(calls[1][0],'https://example.com/registry/offers/a%2Fb')
  assert.equal(calls[2][0],'https://example.com/registry/jobs?track=seat&limit=1&offset=0')
  assert.equal(calls[3][0],'https://example.com/registry/jobs/a%2Fb')
  assert.equal(calls[4][0],'https://example.com/registry/jobs/a%2Fb/submissions')
  const {job_id,...body}=input
  assert.deepEqual(JSON.parse(calls[4][1].body),body)
  assert.equal(calls[4][1].headers['content-type'],'application/json')
 } finally {await close()}
})
test('A3 HTTP failures and network failures are tool errors and recovery works',async()=>{
 for(const name of ['lax_get_offer','lax_get_job','lax_submit']) {
  for(const status of [400,404,409,429,500,0]) {
   let count=0
   const {client,close}=await pair(async()=>{
    count++
    if(count===1) {
     if(status===0) throw new Error('private transport details')
     return Response.json({error:'registry rejection'},{status})
    }
    return Response.json(name==='lax_get_offer'?{offer:{id:'x'}}:name==='lax_get_job'?{job:{id:'x'}}:{submission:{id:'s',job_id:'j',status:'received',created_at:'now'}})
   })
   try {
    const args=name==='lax_submit'?input:{id:'x'}
    const failed=await client.callTool({name,arguments:args})
    assert.equal(failed.isError,true)
    assert.match(failed.content[0].text,new RegExp('HTTP '+status))
    assert.ok(failed.content[0].text.includes(status?'registry rejection':'Network request failed'))
    const success=await client.callTool({name,arguments:args})
    assert.notEqual(success.isError,true)
    assert.equal(count,2)
   } finally {await close()}
  }
 }
})
test('A4 bad inputs do not issue a registry request',async()=>{
 let calls=0
 const {client,close}=await pair(async()=>{calls++
  return Response.json({})})
 try {
  for(const [name,args] of [['lax_get_job',{}],['lax_get_offer',{id:''}],['lax_search_agents',{query:'x'.repeat(101)}],['lax_list_jobs',{limit:101}],['lax_submit',{...input,payout_address:'0xabc'}],['lax_submit',{...input,repo_or_patch_url:'http://example.com'}],['lax_submit',{...input,agent_did:'not-did'}]]) {
   let result, failure
   try {result=await client.callTool({name,arguments:args})} catch(error) {failure=error}
   if(failure) assert.equal(failure.code,-32602)
   else assert.equal(result.isError,true)
  }
  assert.equal(calls,0)
 } finally {await close()}
})
test('Concurrent requests retain separate JSON envelopes',async()=>{
 const {client,close}=await pair(async(url)=>{
  await new Promise(resolve=>setTimeout(resolve,url.endsWith('/one')?15:1))
  return Response.json({job:{id:url.split('/').pop()}})
 })
 try {
  const result=await Promise.all(['one','two'].map(id=>client.callTool({name:'lax_get_job',arguments:{id}})))
  assert.deepEqual(result.map(r=>parsed(r).job.id),['one','two'])
 } finally {await close()}
})

test('A3 uncooperative read fetch and JSON bodies time out, then recover', {timeout:2000},async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 for(const mode of ['fetch','body']) {
  let started
  const ready=new Promise(resolve=>{started=resolve})
  let calls=0
  const {client,close}=await pair(async()=>{
   calls++
   if(calls===1) {
    started()
    if(mode==='fetch') return new Promise(()=>{})
    return {ok:true,status:200,json:()=>new Promise(()=>{})}
   }
   return Response.json({offer:{id:'recovered'}})
  })
  try {
   const pending=client.callTool({name:'lax_get_offer',arguments:{id:'first'}})
   await ready
   await Promise.resolve()
   t.mock.timers.tick(15001)
   const result=await pending
   assert.equal(result.isError,true)
   assert.ok(result.content[0].text.includes('HTTP'))
   assert.deepEqual(parsed(await client.callTool({name:'lax_get_offer',arguments:{id:'second'}})),{offer:{id:'recovered'}})
  } finally {await close()}
 }
})
