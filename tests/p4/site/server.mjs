import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
const orders = new Map(),
  receipts = [],
  counts = new Map()
export async function startControlledSite(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/api/events' && req.method === 'POST') {
      let data = ''
      for await (const chunk of req) {
        data += chunk
        if (data.length > 32768) {
          res.writeHead(413).end()
          return
        }
      }
      receipts.push(JSON.parse(data))
      res.writeHead(204).end()
      return
    }
    if (url.pathname === '/api/evidence') {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          events: receipts,
          orders: [...orders.values()],
          counts: Object.fromEntries(counts),
        }),
      )
      return
    }
    if (url.pathname === '/api/order' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const value = JSON.parse(body),
        id = value.intent
      counts.set(id, (counts.get(id) ?? 0) + 1)
      if (!orders.has(id))
        orders.set(id, {
          id,
          status: 'reserved',
          paid: false,
          ticketed: false,
          amount: 35,
          currency: 'EUR',
          route: 'Milano → Roma',
          date: value.date,
        })
      if (value.fault === 'after-accept') {
        req.socket.destroy()
        return
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(orders.get(id)))
      return
    }
    if (url.pathname === '/api/order' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(orders.get(url.searchParams.get('intent')) ?? { status: 'not-found' }))
      return
    }
    if (url.pathname === '/frame') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end('<label>Frame note<input aria-label="Frame note"></label>')
      return
    }
    if (url.pathname === '/download') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="trip.txt"')
      res.end('Synthetic itinerary: Milano → Roma, EUR 35. Reservation only; unpaid; no ticket.')
      return
    }
    if (url.pathname !== '/') {
      res.writeHead(404).end()
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(await readFile(new URL('./site.html', import.meta.url)))
  })
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
if (process.argv[1]?.endsWith('/site/server.mjs')) {
  const site = await startControlledSite(Number(process.argv[2] ?? 0))
  console.log(JSON.stringify({ origin: site.origin }))
}
