// Model tests use loopback fixtures. Remote requests must be mocked explicitly.
const original = globalThis.fetch
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    return Promise.reject(new Error(`测试禁止外部请求：${url.origin}`))
  }
  return original(input, options)
}
