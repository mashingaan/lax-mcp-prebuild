import { createServer } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createLaxMcpServer, type LaxMcpOptions } from './index.js'
export function createLaxHttpServer(options: LaxMcpOptions = {}) {
  return createServer(async(req,res)=>{
    const finish = (status: number, text: string) => {res.writeHead(status,{'content-type':'application/json'})
      res.end(JSON.stringify({error:text}))}
    if(req.url!=='/mcp') return finish(404,'Not found')
    if(req.headers.origin) {
      try {
        if(!['localhost','127.0.0.1','[::1]'].includes(new URL(req.headers.origin).hostname)) return finish(403,'Origin refused')
      } catch {return finish(403,'Origin refused')}
    }
    const host = req.headers.host?.split(':')[0]
    if(host!=='localhost' && host!=='127.0.0.1') return finish(403,'Host refused')
    if(req.method!=='POST') return finish(405,'Use POST for stateless Streamable HTTP')
    let server: ReturnType<typeof createLaxMcpServer> | undefined
    let transport: StreamableHTTPServerTransport | undefined
    try {
      const chunks: Buffer[]=[]
      let size=0
      for await(const chunk of req) {
        size+=chunk.length
        if(size>65536) return finish(413,'Request too large')
        chunks.push(Buffer.from(chunk))
      }
      const body: unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      server=createLaxMcpServer(options)
      transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true})
      const close = () => {void transport?.close().then(()=>server?.close()).catch(()=>{})}
      res.on('close',close)
      await server.connect(transport)
      await transport.handleRequest(req,res,body)
    } catch {
      await transport?.close().catch(()=>{})
      await server?.close().catch(()=>{})
      if(!res.headersSent) finish(400,'Invalid MCP request')
      else res.end()
    }
  })
}
