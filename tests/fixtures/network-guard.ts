// Model tests use loopback fixtures. Remote requests must be mocked explicitly.
const original = globalThis.fetch
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input)
  // Reserved .invalid probe is routed by the original egress test to its loopback proxy.
  if (
    !['127.0.0.1', 'localhost', '[::1]', 'dsk-probe.invalid', 'exa-probe.invalid'].includes(
      url.hostname,
    )
  ) {
    return Promise.reject(new Error(`测试禁止外部请求：${url.origin}`))
  }
  return original(input, options)
}
