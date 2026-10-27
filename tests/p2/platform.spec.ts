import { describe, it, expect } from 'vitest'
import {
  createDesktopPlatform,
  createDesktopHandler,
  createRemotePlatform,
} from '../../packages/product/platform/src/index.ts'
const host = { id: 'test-host', os: 'darwin' as const, executionLocation: 'local' as const }
describe('P2 受控 Desktop 桥', () => {
  it('校验 frame、方法、Host、路径与一次性身份', async () => {
    const frame = {},
      opened: string[] = []
    const handler = createDesktopHandler({
      host,
      generation: 4,
      acceptsSender: (s) => s === frame,
      allowsPath: (p) => p.path === '/授权',
      chooseDirectory: async () => ({ hostId: host.id, path: '/授权' }),
      openPath: async (p) => {
        opened.push(p.path)
      },
    })
    const bridge = { invoke: (r) => handler.handle(frame, r) },
      platform = createDesktopPlatform(host, bridge, 4)
    expect(await platform.chooseDirectory()).toEqual({
      available: true,
      value: { hostId: host.id, path: '/授权' },
    })
    expect(await platform.openPath({ hostId: 'other', path: '/授权' })).toMatchObject({
      available: false,
      code: 'wrong_host',
    })
    expect(await platform.openPath({ hostId: host.id, path: '/etc' })).toMatchObject({
      available: false,
    })
    expect(await platform.openPath({ hostId: host.id, path: '/授权' })).toMatchObject({
      available: true,
    })
    expect(opened).toEqual(['/授权'])
    const request = {
      version: 1,
      requestId: 'once',
      generation: 4,
      hostId: host.id,
      method: 'openPath',
      path: { hostId: host.id, path: '/授权' },
    }
    expect(await handler.handle({}, request)).toMatchObject({ available: false })
    await handler.handle(frame, request)
    expect(await handler.handle(frame, request)).toMatchObject({ result: { available: false } })
    expect(
      await handler.handle(frame, { ...request, method: 'eval', requestId: 'evil' }),
    ).toMatchObject({ available: false })
    expect(
      await handler.handle(frame, { ...request, generation: 3, requestId: 'old' }),
    ).toMatchObject({ available: false })
    expect(opened).toHaveLength(2)
  })
  it('旧回执失效，远程与 Web 返回 unavailable', async () => {
    let resolve: (value: unknown) => void = () => {}
    const bridge = {
      invoke: async (r) =>
        new Promise((done) => {
          resolve = (value) => done({ ...r, result: { available: true, value } })
        }),
    }
    const platform = createDesktopPlatform(host, bridge, 2),
      pending = platform.chooseDirectory()
    platform.dispose()
    resolve({ hostId: host.id, path: '/授权' })
    expect(await pending).toMatchObject({ available: false })
    expect(
      await createDesktopPlatform(
        { ...host, executionLocation: 'remote' },
        bridge,
        2,
      ).chooseDirectory(),
    ).toMatchObject({ available: false })
    expect(
      await createRemotePlatform({ ...host, executionLocation: 'remote' }).chooseDirectory(),
    ).toMatchObject({ available: false, code: 'unavailable' })
  })
})
