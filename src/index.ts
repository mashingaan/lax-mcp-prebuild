import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createJobsClient, LaxJobsError } from './jobs-client.js'
export interface LaxMcpOptions { baseUrl?: string, fetch?: typeof globalThis.fetch }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const id = z.string().min(1).refine(value => value.trim().length > 0 && value !== '.' && value !== '..', 'Identifier must be a path segment').describe('Registry identifier, URL encoded by the server')
const did = z.string().regex(/^did:[a-z0-9]+:\S+$/)
const payout = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const https = z.string().url().refine(value => new URL(value).protocol === 'https:', 'An https URL is required')
function boundedText(min: number, max: number) {
  return z.string().refine(value => {
    const size = Array.from(value).length
    return size >= min && size <= max
  }).meta({minLength:min,maxLength:max})
}
export function createLaxMcpServer(options: LaxMcpOptions = {}): McpServer {
  const baseUrl = (options.baseUrl ?? 'https://lax.kognai.ai/registry').replace(/\/+$/, '')
  const fetcher = options.fetch ?? globalThis.fetch
  // Validate baseUrl without issuing a request. No owner keys or payment support.
  createJobsClient({baseUrl,fetch:fetcher,retries:0})
  const server = new McpServer({name:'lax-mcp',version:'0.1.1'})
  const result = (body: unknown) => ({content:[{type:'text' as const,text:JSON.stringify(body)}]})
  const run = async (operation: () => Promise<unknown>) => {
    try {return result(await operation())} catch(error) {
      const status = error instanceof LaxJobsError ? error.status : 0
      const message = error instanceof LaxJobsError ? error.message : 'Registry request failed'
      return {isError:true,content:[{type:'text' as const,text:`HTTP ${status}: ${message}`}]}
    }
  }
  async function request(path: string, body?: Record<string, unknown>): Promise<unknown> {
    let response: Response
    const controller=new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
        reject(new LaxJobsError('Network request timed out',response?.status??0,'network'))
        controller.abort()
      },15000)}),(async()=>{
        try {response=await fetcher(`${baseUrl}${path}`,{
          method: body === undefined ? 'GET' : 'POST',
          signal: controller.signal,
          ...(body === undefined ? {} : {
            body: JSON.stringify(body),
            headers: {'content-type':'application/json'},
            redirect: 'error' as const
          })
        })}
        catch {throw new LaxJobsError('Network request failed',0,'network')}
        if (!response.ok) {
          let message = 'Registry HTTP ' + response.status
          try {
            const raw = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json())
            try {
              const data: unknown = JSON.parse(raw)
              if (object(data)) {
                if (typeof data.error === 'string') message = data.error
                else if (typeof data.message === 'string') message = data.message
              } else if (typeof data === 'string') message = data
            } catch {
              if (raw.trim()) message = raw
            }
          } catch { /* Keep status when the error body is unreadable. */ }
          throw new LaxJobsError(message,response.status,'bad_request')
        }
        try {return await response.json()} catch {
          throw new LaxJobsError('Registry returned invalid JSON',response.status,'invalid_response')
        }
      })()])
    } finally {if(timer!==undefined) clearTimeout(timer)}
  }
  server.registerTool('lax_search_agents',{
    description:'Search listed LAX agents by optional free text, at most 100 characters. Free read.',
    inputSchema:{query:boundedText(0,100).optional()}
  },async({query})=>run(()=>request(`/search${query===undefined?'':`?${new URLSearchParams({query})}`}`)))
  server.registerTool('lax_get_offer',{
    description:'Read one public agent offer by its registry identifier. Free read.',inputSchema:{id}
  },async({id})=>run(()=>request(`/offers/${encodeURIComponent(id)}`)))
  server.registerTool('lax_list_jobs',{
    description:'List registry jobs with optional track, limit and offset. Check bid deadlines separately.',
    inputSchema:{track:z.enum(['lax-agents','coding-agents','godman-protocols','templates','genesis-tools','seat']).optional(),limit:z.number().int().max(100).optional(),offset:z.number().int().optional()}
  },async(filter)=>run(()=>{
    const query = new URLSearchParams()
    for (const [key,value] of Object.entries(filter)) query.set(key,String(value))
    return request(query.size ? '/jobs?'+query : '/jobs')
  }))
  server.registerTool('lax_get_job',{
    description:'Read one job specification, acceptance criteria, ceiling and dates. Free read.',inputSchema:{id}
  },async({id})=>run(()=>request(`/jobs/${encodeURIComponent(id)}`)))
  server.registerTool('lax_submit',{
    description:'Submit a repository or patch to a legacy job submission route. Not a tender bid, payment or PACT delivery. Requires operator-authorized work.',
    inputSchema:{job_id:id,builder:boundedText(2,80),contact:z.string().min(1).refine(value => value.trim().length > 0),repo_or_patch_url:https,payout_address:payout,agent_did:did,notes:boundedText(0,2000).optional()}
  },async({job_id,...input})=>run(()=>request(`/jobs/${encodeURIComponent(job_id)}/submissions`,input)))
  return server
}
