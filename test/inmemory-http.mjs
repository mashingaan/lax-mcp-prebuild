import { Readable, Writable } from 'node:stream'

export function createInMemoryFetch(server, { origin = 'http://127.0.0.1', timeoutMs = 5000 } = {}) {
  const handler = server.listeners('request')[0]
  if (typeof handler !== 'function') throw new Error('Server has no request handler')
  return async function inMemoryFetch(input, init = {}) {
    const target = new URL(typeof input === 'string' ? input : String(input.url ?? input), origin)
    const method = String(init.method ?? 'POST').toUpperCase()
    const headers = {}
    for (const [key, value] of new Headers(init.headers ?? {})) headers[key.toLowerCase()] = value
    if (!headers.host) headers.host = target.host
    const payload = init.body == null ? '' : String(init.body)
    const req = Readable.from(payload === '' ? [] : [Buffer.from(payload, 'utf8')])
    req.url = target.pathname + target.search
    req.method = method
    req.headers = headers
    req.rawHeaders = Object.entries(headers).flat()
    req.httpVersion = '1.1'
    req.httpVersionMajor = 1
    req.httpVersionMinor = 1
    req.socket = { remoteAddress: '127.0.0.1', remotePort: 0, encrypted: false, setTimeout() {}, destroy() {} }
    req.connection = req.socket
    const chunks = []
    const collected = {}
    let code = 0
    let message = ''
    const res = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback() } })
    res.statusCode = 200
    res.writeHead = (nextCode, nextMessageOrHeaders, maybeHeaders) => {
      code = nextCode
      if (typeof nextMessageOrHeaders === 'string') message = nextMessageOrHeaders
      else if (nextMessageOrHeaders && typeof nextMessageOrHeaders === 'object') Object.assign(collected, nextMessageOrHeaders)
      if (maybeHeaders && typeof maybeHeaders === 'object') Object.assign(collected, maybeHeaders)
      return res
    }
    res.setHeader = (key, value) => { collected[String(key).toLowerCase()] = value }
    res.getHeader = key => collected[String(key).toLowerCase()]
    res.getHeaders = () => ({ ...collected })
    res.hasHeader = key => Object.hasOwn(collected, String(key).toLowerCase())
    res.removeHeader = key => { delete collected[String(key).toLowerCase()] }
    res.flushHeaders = () => {}
    res.addTrailers = () => {}
    Object.defineProperty(res, 'headersSent', { get: () => code !== 0 })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('In-memory HTTP handler timed out')), timeoutMs)
      timer.unref?.()
      res.on('finish', () => { clearTimeout(timer); resolve() })
      res.on('close', () => { clearTimeout(timer); resolve() })
      res.on('error', error => { clearTimeout(timer); reject(error) })
      try {
        handler(req, res)
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    })
    const text = Buffer.concat(chunks).toString('utf8')
    return new Response(text, { status: code || 200, statusText: message, headers: collected })
  }
}
