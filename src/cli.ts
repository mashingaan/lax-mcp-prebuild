#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createLaxMcpServer } from './index.js'
import { createLaxHttpServer } from './http.js'
async function main() {
  const args=process.argv.slice(2)
  let http=false
  let port=process.env.PORT ?? '3000'
  while(args.length) {
    const arg=args.shift()
    if(arg==='--http' && !http) http=true
    else if(arg==='--port' && args.length) port=args.shift()!
    else throw new Error('Usage: lax-mcp [--http [--port NUMBER]]')
  }
  if(!http) {
    await createLaxMcpServer().connect(new StdioServerTransport())
    return
  }
  if(!/^\d+$/.test(port) || Number(port)>65535 || Number(port)<1) throw new Error('Invalid port')
  const server=createLaxHttpServer()
  server.on('error',()=>{process.stderr.write('HTTP server failed\n')
    process.exitCode=1})
  server.listen(Number(port),'127.0.0.1',()=>process.stderr.write(`LAX MCP ready on loopback port ${port}\n`))
  for(const event of ['SIGINT','SIGTERM'] as const) process.once(event,()=>server.close())
}
main().catch(()=>{process.stderr.write('LAX MCP failed to start. Check command arguments and runtime.\n')
  process.exitCode=1})
