import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type Socket, type Server } from 'node:net'
import { readFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ConnectorReady, ConnectorStart, EgoConnectorPort, MediaFrame } from './types.ts'
export type * from './types.ts'

export class ConnectorError extends Error {
  constructor(
    readonly code: string,
    readonly dispatched: boolean,
  ) {
    super(code)
  }
}

/** Only this process boundary can call Ego. No renderer or tool sees SDK/CDP handles. */
export class EgoConnector implements EgoConnectorPort {
  private server: Server | undefined
  private child: ChildProcessWithoutNullStreams | undefined
  private sockets = new Set<Socket>()
  private wire: Socket | undefined
  private socketPath: string | undefined
  private epoch = 0
  private nextId = 0
  private pending = new Map<number, { resolve(value: unknown): void; reject(e: Error): void }>()
  private frames = new Set<(meta: MediaFrame, bytes: Uint8Array) => void>()
  private stopped = new Set<(code: string) => void>()
  private closing = false
  constructor(private readonly executable = 'ego-browser') {}
  async start(options: ConnectorStart): Promise<ConnectorReady> {
    if (this.child || this.server) throw new ConnectorError('CONNECTOR_ALREADY_STARTED', false)
    this.closing = false
    this.epoch = options.epoch
    const secret = randomBytes(32).toString('hex')
    this.socketPath = join(tmpdir(), `tz-ego-${randomUUID()}.sock`)
    const ready = Promise.withResolvers<ConnectorReady>()
    void ready.promise.catch(() => {})
    const fail = (code: string) => {
      ready.reject(new ConnectorError(code, false))
      this.fail(code)
    }
    this.server = createServer((socket) => {
      this.sockets.add(socket)
      socket.setTimeout(5000, () => socket.destroy())
      socket.once('close', () => this.sockets.delete(socket))
      let authenticated = false,
        buffer = Buffer.alloc(0)
      if (this.wire) {
        socket.destroy()
        return
      }
      socket.on('error', () => {
        socket.destroy()
      })
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk])
        if (buffer.length > 20 * 1024 * 1024) {
          socket.destroy()
          return
        }
        while (buffer.length >= 8) {
          const length = buffer.readUInt32BE(0),
            headerSize = buffer.readUInt32BE(4)
          if (length < 4 || length > 18 * 1024 * 1024 || headerSize > length - 4) {
            socket.destroy()
            return
          }
          if (buffer.length < length + 4) return
          const packet = buffer.subarray(0, length + 4)
          buffer = buffer.subarray(length + 4)
          let message: Record<string, unknown>
          try {
            message = JSON.parse(packet.subarray(8, 8 + headerSize).toString()) as Record<
              string,
              unknown
            >
          } catch {
            socket.destroy()
            return
          }
          if (!authenticated) {
            const supplied =
              typeof message.secret === 'string' ? Buffer.from(message.secret) : Buffer.alloc(0)
            if (
              message.type !== 'hello' ||
              supplied.length !== secret.length ||
              !timingSafeEqual(supplied, Buffer.from(secret))
            ) {
              socket.destroy()
              return
            }
            authenticated = true
            socket.setTimeout(0)
            this.wire = socket
            continue
          }
          if (message.type === 'ready') ready.resolve(message.value as ConnectorReady)
          else if (message.type === 'result' && typeof message.id === 'number') {
            const waiting = this.pending.get(message.id)
            this.pending.delete(message.id)
            if (typeof message.error === 'string')
              waiting?.reject(new ConnectorError(message.error, message.dispatched === true))
            else waiting?.resolve(message.value)
          } else if (message.type === 'frame') {
            const meta = message.meta as MediaFrame
            const bytes = packet.subarray(8 + headerSize)
            if (
              meta?.format !== 'png' ||
              !Number.isSafeInteger(meta.frameId) ||
              bytes.length < 24 ||
              bytes.readUInt32BE(0) !== 0x89504e47
            ) {
              socket.destroy()
              return
            }
            for (const listener of this.frames) listener(meta, bytes)
          } else if (message.type === 'native-handoff') fail('EGO_NATIVE_HUMAN')
          else if (message.type === 'stopped')
            fail(typeof message.code === 'string' ? message.code : 'EGO_DISCONNECTED')
        }
      })
      socket.on('close', () => {
        if (this.wire === socket) {
          this.wire = undefined
          if (!this.closing) fail('EGO_DISCONNECTED')
        }
      })
    })
    try {
      await new Promise<void>((resolve, reject) => {
        this.server!.once('error', reject)
        this.server!.listen(this.socketPath!, resolve)
      })
      await chmod(this.socketPath, 0o600)
      const version = spawnSync(this.executable, ['--version'], {
        timeout: 5000,
        maxBuffer: 4096,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      if (version.error || version.status !== 0)
        throw new ConnectorError('EGO_EXECUTABLE_UNAVAILABLE', false)
      const cliVersion = (version.stdout + version.stderr).trim().slice(0, 200)
      const source = await readFile(new URL('./worker.mjs', import.meta.url), 'utf8')
      this.child = spawn(this.executable, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] })
      this.child.stdin.on('error', () => fail('EGO_CONNECTOR_INPUT_CLOSED'))
      this.child.stdout.resume()
      this.child.stderr.resume() // Never copy SDK logs, page data, or paths to ordinary logs.
      this.child.once('error', () => fail('EGO_EXECUTABLE_UNAVAILABLE'))
      this.child.once('exit', () => {
        if (!this.closing) fail('EGO_CONNECTOR_EXITED')
      })
      this.child.stdin.end(
        `const connectorConfig=${JSON.stringify({ ...options, socket: this.socketPath, secret, cliVersion })};\n${source}`,
      )
      return await Promise.race([
        ready.promise,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new ConnectorError('EGO_CONNECT_TIMEOUT', false)),
            15_000,
          )
          ready.promise.finally(() => clearTimeout(timer)).catch(() => {})
        }),
      ])
    } catch (error) {
      await this.close()
      throw error
    }
  }
  async call<T>(
    method: string,
    params: Record<string, unknown>,
    epoch: number,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted()
    if (!this.wire || this.wire.destroyed) throw new ConnectorError('EGO_DISCONNECTED', false)
    const id = ++this.nextId
    const waiting = Promise.withResolvers<unknown>()
    const abort = () => {
      this.pending.delete(id)
      this.wire?.write(
        JSON.stringify({ method: 'cancel', params: { id }, epoch: this.epoch }) + '\n',
      )
      waiting.reject(new ConnectorError('EGO_ACTION_INTERRUPTED', true))
    }
    const timer = setTimeout(abort, 20_000)
    this.pending.set(id, waiting)
    signal?.addEventListener('abort', abort, { once: true })
    this.wire.write(JSON.stringify({ id, method, params, epoch }) + '\n')
    try {
      return (await waiting.promise) as T
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  async fence(epoch: number): Promise<void> {
    if (epoch <= this.epoch) throw new ConnectorError('CONTROL_EPOCH_STALE', false)
    this.epoch = epoch
    await this.call('fence', {}, epoch)
  }
  onFrame(listener: (meta: MediaFrame, bytes: Uint8Array) => void): () => void {
    this.frames.add(listener)
    return () => {
      this.frames.delete(listener)
    }
  }
  onStop(listener: (code: string) => void): () => void {
    this.stopped.add(listener)
    return () => {
      this.stopped.delete(listener)
    }
  }
  private fail(code: string) {
    for (const entry of this.pending.values()) entry.reject(new ConnectorError(code, true))
    this.pending.clear()
    if (!this.closing) for (const listener of this.stopped) listener(code)
  }
  async close(finish: boolean = false): Promise<void> {
    this.closing = true
    if (this.wire && !this.wire.destroyed) {
      try {
        await this.call('close', { finish }, this.epoch)
      } catch {
        /* Results stay unknown; cleanup never replays an operation. */
      }
    }
    this.fail('CONNECTOR_CLOSED')
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    this.wire = undefined
    this.child?.kill()
    this.child = undefined
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    this.server = undefined
    if (this.socketPath) await rm(this.socketPath, { force: true })
    this.socketPath = undefined
    this.frames.clear()
    this.stopped.clear()
  }
}
