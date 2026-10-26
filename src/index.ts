import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createJobsClient, LaxJobsError } from './jobs-client.js'
export interface LaxMcpOptions { baseUrl?: string, fetch?: typeof globalThis.fetch }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const id = z.string().min(1).describe('Registry identifier, URL encoded by the server')
const did = z.string().regex(/^did:[a-z0-9]+:\S+$/)
const payout = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const https = z.string().url().refine(value => new URL(value).protocol === 'https:', 'An https URL is required')
export function createLaxMcpServer(options: LaxMcpOptions = {}): McpServer {
  const baseUrl = (options.baseUrl ?? 'https://lax.kognai.ai/registry').replace(/\/+$/, '')
  const fetcher = options.fetch ?? globalThis.fetch
  // Validate baseUrl without issuing a request. No owner keys or payment support.
  createJobsClient({baseUrl,fetch:fetcher,retries:0})
  const server = new McpServer({name:'lax-mcp',version:'0.1.0'})
  const result = (body: unknown) => ({content:[{type:'text' as const,text:JSON.stringify(body)}]})
  const run = async (operation: () => Promise<unknown>) => {
    try {return result(await operation())} catch(error) {
      const status = error instanceof LaxJobsError ? error.status : 0
      const message = error instanceof LaxJobsError ? error.message : 'Registry request failed'
      return {isError:true,content:[{type:'text' as const,text:`HTTP ${status}: ${message}`}]}
    }
  }
  async function read(path: string): Promise<unknown> {
    let response: Response
    try {response = await fetcher(`${baseUrl}${path}`,{method:'GET',signal:AbortSignal.timeout(15000)})}
    catch {throw new LaxJobsError('Network request failed',0,'network')}
    let data: unknown
    try {data=await response.json()} catch {throw new LaxJobsError('Registry returned invalid JSON',response.status,'invalid_response')}
    if(!response.ok) throw new LaxJobsError(object(data)&&typeof data.error==='string'?data.error:`Registry HTTP ${response.status}`,response.status,'bad_request')
    return data
  }
  // Capture the original JSON envelope per call, preserving additional registry
  // metadata while sharing the tested jobs client's validation and transport.
  async function jobs(operation: (client: ReturnType<typeof createJobsClient>) => Promise<unknown>): Promise<unknown> {
    let envelope: unknown
    const capture: typeof fetch = async (url,init) => {
      const response = await fetcher(url,init)
      return new Proxy(response, {get(target,key) {
        if(key==='json') return async()=>{envelope=await target.json()
          return envelope}
        const value=Reflect.get(target,key,target)
        return typeof value==='function'?value.bind(target):value
      }})
    }
    await operation(createJobsClient({baseUrl,fetch:capture,retries:0}))
    return envelope
  }
  server.registerTool('lax_search_agents',{
    description:'Search listed LAX agents by optional free text, at most 100 characters. Free read.',
    inputSchema:{query:z.string().max(100).optional()}
  },async({query})=>run(()=>read(`/search${query===undefined?'':`?${new URLSearchParams({query})}`}`)))
  server.registerTool('lax_get_offer',{
    description:'Read one public agent offer by its registry identifier. Free read.',inputSchema:{id}
  },async({id})=>run(()=>read(`/offers/${encodeURIComponent(id)}`)))
  server.registerTool('lax_list_jobs',{
    description:'List registry jobs with optional track, limit and offset. Check bid deadlines separately.',
    inputSchema:{track:z.string().optional(),limit:z.number().int().min(1).max(100).optional(),offset:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()}
  },async(filter)=>run(()=>jobs(c=>c.listJobs(filter))))
  server.registerTool('lax_get_job',{
    description:'Read one job specification, acceptance criteria, ceiling and dates. Free read.',inputSchema:{id}
  },async({id})=>run(()=>jobs(c=>c.getJob(id))))
  server.registerTool('lax_submit',{
    description:'Submit a repository or patch to a legacy job submission route. Not a tender bid, payment or PACT delivery. Requires operator-authorized work.',
    inputSchema:{job_id:id,builder:z.string().min(1),contact:z.string().min(1),repo_or_patch_url:https,payout_address:payout,agent_did:did,notes:z.string().optional()}
  },async({job_id,...input})=>run(()=>jobs(c=>c.submit(job_id,input))))
  return server
}
