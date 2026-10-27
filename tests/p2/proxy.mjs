import { createServer, request } from 'node:http'
/** Controlled reverse proxy: strip only its mount; preserve browser-facing Host/Origin. */
export async function proxyFor(host, prefix = '/assistant/') {
  const sockets = new Set()
  const server = createServer((req, res) => {
    if (!req.url.startsWith(prefix)) {
      res.writeHead(404)
      res.end()
      return
    }
    const upstream = request(
      new URL(req.url.slice(prefix.length - 1), host.base),
      { method: req.method, headers: req.headers },
      (response) => {
        res.writeHead(response.statusCode, response.headers)
        response.pipe(res)
      },
    )
    upstream.on('error', () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith(prefix)) {
      socket.destroy()
      return
    }
    const upstream = request(new URL(req.url.slice(prefix.length - 1), host.base), {
      method: 'GET',
      headers: req.headers,
    })
    upstream.on('upgrade', (response, wire, upstreamHead) => {
      sockets.add(wire)
      wire.on('close', () => sockets.delete(wire))
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n')}\r\n\r\n`,
      )
      if (head.length) wire.write(head)
      if (upstreamHead.length) socket.write(upstreamHead)
      socket.pipe(wire)
      wire.pipe(socket)
      socket.on('error', () => wire.destroy())
      wire.on('error', () => socket.destroy())
    })
    upstream.on('error', () => socket.destroy())
    upstream.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}${prefix}`
  return {
    base,
    login: host.runtime.ctx.connection.authenticatedUrl(base),
    async dispose() {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
