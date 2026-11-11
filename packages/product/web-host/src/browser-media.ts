import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { BrowserInputError } from '@tuai/browser-service'
import type { InputEnvelope } from '@tuai/browser-service/types'
import { SessionId } from '@deepseek-ai/dsh-session'

/** Dedicated binary media carrier, admitted by the existing Connection authority. */
export function mountBrowserMedia(ctx: Context) {
  // Socket close callbacks can outlive Cordis service registration.
  const browsers = ctx.browsers
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 128 * 1024,
    perMessageDeflate: false,
  })
  ctx.effect(() =>
    ctx.webServer.registerUpgrade({
      path: '/api/browser/media',
      handler: (req, socket, head) => {
        const admission = ctx.connection.admit(req)
        const origin = req.headers.origin
        if (
          'rejection' in admission ||
          admission.peer.principal.kind !== 'owner' ||
          !origin ||
          origin !== `${ctx.webServer.protocol}//${req.headers.host}`
        ) {
          socket.destroy()
          return
        }
        const url = new URL(req.url ?? '/', origin),
          browserId = url.searchParams.get('browserId'),
          sessionId = url.searchParams.get('sessionId')
        if (!browserId || !sessionId || ctx.conversationTrash.has(SessionId(sessionId))) {
          socket.destroy()
          return
        }
        const caller = { ownerId: browsers.ownerId, sessionId },
          peerId = admission.peer.id,
          connectionId = randomUUID()
        try {
          browsers.get(browserId, caller)
        } catch {
          socket.destroy()
          return
        }
        sockets.handleUpgrade(req, socket, head, (ws) => {
          let stopFrames: (() => void) | undefined,
            awaiting = false,
            pending: Buffer | undefined,
            stopped = false
          const send = (data: unknown) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
          }
          const pump = () => {
            if (
              !awaiting &&
              pending &&
              ws.readyState === WebSocket.OPEN &&
              ws.bufferedAmount < 2 * 1024 * 1024
            ) {
              const bytes = pending
              pending = undefined
              awaiting = true
              ws.send(bytes, { binary: true })
            }
          }
          const off = browsers.onChange(() => {
            try {
              send({ type: 'state', state: browsers.get(browserId, caller) })
            } catch {
              ws.close(1008, 'resource unavailable')
            }
          })
          ws.on('error', () => {
            ws.close()
          })
          ws.on('message', async (bytes, binary) => {
            if (binary || Buffer.byteLength(bytes.toString()) > 128 * 1024) {
              ws.close(1008, 'invalid message')
              return
            }
            let message: Record<string, unknown>
            try {
              message = JSON.parse(bytes.toString()) as Record<string, unknown>
            } catch {
              ws.close(1008, 'invalid JSON')
              return
            }
            if (message.type === 'frameAck') {
              awaiting = false
              pump()
              return
            }
            if (
              message.type !== 'input' ||
              typeof message.sequence !== 'number' ||
              typeof message.epoch !== 'number' ||
              typeof message.viewportVersion !== 'number' ||
              typeof message.pageId !== 'string'
            ) {
              ws.close(1008, 'invalid input')
              return
            }
            const sequence = message.sequence
            try {
              const value = await browsers.input(
                caller,
                {
                  browserId,
                  connectionId,
                  pageId: message.pageId,
                  controlEpoch: message.epoch,
                  sequence,
                  viewportVersion: message.viewportVersion,
                  input: message.input,
                } as InputEnvelope,
                peerId,
              )
              send({
                type: 'inputResult',
                sequence,
                status: 'executed',
                result: value,
                receivedAt: Date.now(),
              })
            } catch (error) {
              send({
                type: 'inputResult',
                sequence,
                status: error instanceof BrowserInputError ? error.status : 'rejected',
                error: error instanceof Error ? error.message.slice(0, 200) : 'INPUT_FAILED',
              })
            }
          })
          ws.on('close', () => {
            stopped = true
            off()
            stopFrames?.()
            pending = undefined
            browsers.removeView(browserId, connectionId)
          })
          try {
            send({
              type: 'welcome',
              connectionId,
              state: browsers.registerView(caller, browserId, peerId, connectionId),
            })
          } catch {
            ws.close(1008, 'view unavailable')
            return
          }
          void ctx.browsers
            .subscribeFrames(caller, browserId, connectionId, peerId, (meta, bytes) => {
              const header = Buffer.from(JSON.stringify({ ...meta, browserId, connectionId })),
                size = Buffer.alloc(4)
              size.writeUInt32BE(header.length)
              // One current frame and one pending frame per viewer; input never waits for decoding.
              pending = Buffer.concat([size, header, bytes])
              pump()
            })
            .then((stop) => {
              if (stopped) stop()
              else stopFrames = stop
            })
            .catch(() => send({ type: 'mediaError', error: 'BROWSER_DISCONNECTED' }))
        })
      },
    }),
  )
  ctx.effect(() => async () => {
    await Promise.all(
      [...sockets.clients].map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (socket.readyState === WebSocket.CLOSED) {
              resolve()
              return
            }
            socket.once('close', () => resolve())
            socket.terminate()
          }),
      ),
    )
    await new Promise<void>((resolve) => sockets.close(() => resolve()))
  })
}
