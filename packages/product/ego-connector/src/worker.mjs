// Runs only inside the installed Ego SDK's documented nodejs execution round.
const net = await import('node:net')
const crypto = await import('node:crypto')
const wire = net.createConnection(connectorConfig.socket)
await new Promise((resolve, reject) => {
  wire.once('connect', resolve)
  wire.once('error', reject)
})
let ending = false,
  epoch = connectorConfig.epoch,
  queue = [],
  cancelled = new Set(),
  wake
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
function send(header, bytes = Buffer.alloc(0)) {
  if (wire.destroyed) return
  const json = Buffer.from(JSON.stringify(header))
  const size = Buffer.alloc(8)
  size.writeUInt32BE(4 + json.length + bytes.length)
  size.writeUInt32BE(json.length, 4)
  wire.write(Buffer.concat([size, json, bytes]))
}
send({ type: 'hello', secret: connectorConfig.secret })
let inbound = ''
wire.on('data', (bytes) => {
  inbound += bytes.toString()
  if (inbound.length > 262144) {
    wire.destroy()
    return
  }
  for (;;) {
    const lineEnd = inbound.indexOf('\n')
    if (lineEnd < 0) break
    const line = inbound.slice(0, lineEnd)
    inbound = inbound.slice(lineEnd + 1)
    let command
    try {
      command = JSON.parse(line)
    } catch {
      wire.destroy()
      return
    }
    if (command.method === 'fence') {
      if (Number.isSafeInteger(command.epoch) && command.epoch > epoch) epoch = command.epoch
      send({ type: 'result', id: command.id, value: null })
    } else if (command.method === 'cancel') cancelled.add(command.params.id)
    else if (queue.length < 256) queue.push(command)
    else send({ type: 'result', id: command.id, error: 'EGO_QUEUE_LIMIT' })
    wake?.()
    wake = undefined
  }
})
wire.on('close', () => {
  ending = true
  wake?.()
})
wire.on('error', () => {
  ending = true
  wake?.()
})
const nativeCodes = new Set([
  'EGO_USER_CONTROL',
  'EGO_CONTROL_REVOKED',
  'EGO_TASK_SPACE_INACTIVE',
  'EGO_TASK_SPACE_UNASSIGNED',
  'EGO_TASK_SPACE_USER_CONTROLLED',
  'EGO_TASK_SPACE_NOT_AGENT_OWNED',
])
let task
try {
  task = connectorConfig.explicitNativeReturn
    ? await takeOverTaskSpace(connectorConfig.spaceId)
    : await taskSpace(connectorConfig.spaceId ?? connectorConfig.name)
} catch (error) {
  send({
    type: 'stopped',
    code: nativeCodes.has(error.code) ? 'EGO_NATIVE_HUMAN' : 'EGO_SPACE_UNAVAILABLE',
  })
  wire.end()
  throw error
}
let managed = await task.pages()
let current = connectorConfig.pageId
  ? managed.find((page) => page.label === connectorConfig.pageId)
  : managed[0]
if (connectorConfig.explicitNativeReturn) {
  // Native control may select or create another page. Resume that actual page,
  // rather than silently returning to the first (possibly stale) managed tab.
  const userPage = task.userPage()
  if (!userPage) throw new Error('EGO_NATIVE_PAGE_UNAVAILABLE')
  current = managed.find((page) => page.label === userPage.label) ?? (await task.adopt(userPage))
  managed = await task.pages()
}
if (!current) throw new Error('EGO_NO_MANAGED_PAGE')
let pageId = current.label,
  streaming = false,
  streamEpoch = 0,
  frameId = 0,
  streamStartedAt = 0
let viewport = { width: 1, height: 1, dpr: 1, version: 1 }
let observations = new Map(),
  heldKeys = new Map(),
  heldButtons = new Set()
const safeUrl = (value) => {
  try {
    const u = new URL(value)
    u.username = ''
    u.password = ''
    u.search = ''
    u.hash = ''
    return u.href
  } catch {
    return ''
  }
}
const scrub = (text) =>
  text
    .replace(/([?&](?:token|key|password|secret|code|session)[^=\s]*=)[^\s\]"']+/gi, '$1[redacted]')
    .replace(/(password[^\n]*?value[=:]\s*)[^\n]+/gi, '$1[redacted]')
function updateViewport(next) {
  if (next.width !== viewport.width || next.height !== viewport.height || next.dpr !== viewport.dpr)
    viewport = { ...next, version: viewport.version + 1 }
  return viewport
}
async function geometry() {
  const value = await current.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }))
  return updateViewport(value)
}
async function pages() {
  managed = await task.pages()
  const result = []
  for (const page of managed) {
    const info = await page.info()
    result.push({
      id: page.label,
      title: info.title,
      url: safeUrl(info.url),
      openedBy: page.openedBy,
    })
  }
  return result
}
function parseSnapshot(text) {
  const refs = [],
    lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      match = line.match(/\[ref=(\d+)(?:,|\])/)
    if (!match) continue
    const indent = line.length - line.trimStart().length
    let end = i + 1
    while (end < lines.length && lines[end].length - lines[end].trimStart().length > indent) end++
    const description = lines
      .slice(i, end)
      .map((value) => value.trim().replace(/ref=\d+,?\s*/g, ''))
      .join('\n')
    refs.push({
      id: '@' + match[1],
      signature: hash(description),
      role: line.trim().split(/[\s\[]/)[0],
      description,
    })
  }
  return refs
}
const normalized = (text) =>
  text
    .split('\n')
    .slice(1)
    .join('\n')
    .replace(/ref=\d+,?\s*/g, '')
async function semantics() {
  return current.evaluate(() => {
    const controls = []
    const scan = (root, offsetX = 0, offsetY = 0) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) scan(element.shadowRoot, offsetX, offsetY)
        const r = element.getBoundingClientRect(),
          style = getComputedStyle(element)
        if (!r.width || !r.height || style.visibility === 'hidden' || style.display === 'none')
          continue
        if (element.tagName === 'IFRAME') {
          try {
            if (element.contentDocument) scan(element.contentDocument, offsetX + r.x, offsetY + r.y)
          } catch {}
        }
        let role = element.getAttribute('role')
        if (!role) {
          if (element.tagName === 'BUTTON') role = 'button'
          else if (element.tagName === 'A' && element.hasAttribute('href')) role = 'anchor'
          else if (element.tagName === 'SELECT') role = 'combobox'
          else if (element.tagName === 'TEXTAREA') role = 'textbox'
          else if (element.tagName === 'INPUT')
            role =
              element.type === 'checkbox'
                ? 'checkbox'
                : element.type === 'radio'
                  ? 'radio'
                  : 'textbox'
        }
        if (!role) continue
        const name =
          element.getAttribute('aria-label') ??
          element.labels?.[0]?.textContent?.trim() ??
          (element.innerText ?? '').trim()
        controls.push({
          role,
          name,
          bounds: { x: r.x + offsetX, y: r.y + offsetY, width: r.width, height: r.height },
          sensitive: element.matches(
            'input[type=password],[autocomplete=one-time-code],[autocomplete*=cc-]',
          ),
          checked: ['checkbox', 'radio', 'switch'].includes(role)
            ? typeof element.checked === 'boolean'
              ? element.checked
              : element.getAttribute('aria-checked') === 'true'
            : undefined,
          disabled:
            element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
        })
        if (controls.length >= 1000) return
      }
    }
    scan(document)
    return controls
  })
}
async function evidenceSnapshot(controls) {
  controls ??= await semantics()
  const snapshot = scrub(await current.snapshot({ scope: 'full_page' }))
  const lines = snapshot.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (
      !controls.some((c) => c.sensitive && c.name && lines[i].includes('textbox "' + c.name + '"'))
    )
      continue
    const indent = lines[i].length - lines[i].trimStart().length
    let end = i + 1
    while (end < lines.length && lines[end].length - lines[end].trimStart().length > indent) end++
    lines.splice(i + 1, end - i - 1)
  }
  for (let i = 0; i < lines.length; i++) {
    if (!/\[ref=\d+/.test(lines[i])) continue
    const role = lines[i].trim().split(/[\s\[]/)[0],
      name = /"([^"]+)"/.exec(lines[i])?.[1]
    const matches = controls.filter(
      (control) => control.role === role && (!name || control.name === name),
    )
    if (matches.length === 1) {
      if (typeof matches[0].checked === 'boolean') lines[i] += ` [checked=${matches[0].checked}]`
      if (matches[0].disabled) lines[i] += ' [disabled=true]'
    }
  }
  return lines.join('\n')
}
async function observe() {
  const vp = await geometry() // Raw CDP used by media invalidates SDK refs; take the snapshot last.
  const info = await current.info()
  const controls = await semantics()
  const raw = await evidenceSnapshot(controls)
  const text = raw.slice(0, 64000)
  const value = {
    id: crypto.randomUUID(),
    pageId,
    url: safeUrl(info.url),
    title: info.title,
    text,
    fingerprint: hash(normalized(raw)),
    refs: parseSnapshot(text),
    truncated: raw.length > text.length || raw.includes('[more content below'),
    viewport: vp,
    observedAt: Date.now(),
  }
  for (const ref of value.refs) {
    const name = /"([^"]+)"/.exec(ref.description)?.[1]
    const matches = controls.filter(
      (control) => control.role === ref.role && (!name || control.name === name),
    )
    if (matches.length === 1) {
      ref.bounds = matches[0].bounds
      ref.sensitive = matches[0].sensitive
      ref.checked = matches[0].checked
      ref.disabled = matches[0].disabled
    }
  }
  observations.clear()
  observations.set(value.id, value)
  return value
}
async function target(action) {
  const previous = observations.get(action.observationId)
  if (!previous || previous.pageId !== pageId || action.pageId !== pageId)
    throw new Error('STALE_OBSERVATION')
  const raw = await evidenceSnapshot()
  if (hash(normalized(raw)) !== previous.fingerprint) {
    observations.clear()
    throw new Error('STALE_OBSERVATION')
  }
  const old = previous.refs.find((ref) => ref.id === action.ref)
  const fresh = old && parseSnapshot(raw).filter((ref) => ref.signature === old.signature)
  if (!fresh || fresh.length !== 1) throw new Error('TARGET_MISMATCH')
  return fresh[0].id
}
async function focus() {
  return current.evaluate(() => {
    let element = document.activeElement,
      offsetX = 0,
      offsetY = 0
    for (let depth = 0; depth < 16; depth++) {
      if (element?.shadowRoot?.activeElement) {
        element = element.shadowRoot.activeElement
        continue
      }
      if (element?.tagName === 'IFRAME') {
        try {
          const next = element.contentDocument?.activeElement
          if (next) {
            const r = element.getBoundingClientRect()
            offsetX += r.x
            offsetY += r.y
            element = next
            continue
          }
        } catch {}
      }
      break
    }
    const rect = element?.getBoundingClientRect()
    return {
      editable: !!element && (element.matches('input,textarea') || element.isContentEditable),
      sensitive:
        element?.matches('input[type=password],[autocomplete=one-time-code],[autocomplete*=cc-]') ??
        false,
      x: (rect?.x ?? 0) + offsetX,
      y: (rect?.y ?? 0) + offsetY,
      height: rect?.height ?? 0,
    }
  })
}
async function release() {
  for (const key of heldKeys.values())
    await current.cdp('Input.dispatchKeyEvent', { ...key, type: 'keyUp' })
  for (const button of heldButtons)
    await current.cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button,
      x: 0,
      y: 0,
      clickCount: 1,
    })
  heldKeys.clear()
  heldButtons.clear()
}
async function input(p, command) {
  if (p.type === 'release') {
    await release()
    return { status: 'executed' }
  }
  if (p.type === 'mouse' || p.type === 'wheel') {
    if (
      ![p.x, p.y].every(Number.isFinite) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x > viewport.width ||
      p.y > viewport.height
    )
      throw new Error('INPUT_COORDINATES')
    const args = {
      type: p.type === 'wheel' ? 'mouseWheel' : p.event,
      x: p.x,
      y: p.y,
      modifiers: p.modifiers ?? 0,
      button: p.button ?? 'none',
      buttons: p.buttons ?? 0,
      clickCount: p.clickCount ?? 1,
    }
    if (p.type === 'wheel') {
      args.deltaX = p.deltaX
      args.deltaY = p.deltaY
    }
    await current.cdp('Input.dispatchMouseEvent', args)
    if (p.event === 'mousePressed') heldButtons.add(p.button)
    if (p.event === 'mouseReleased') heldButtons.delete(p.button)
  } else if (p.type === 'text') await current.keyboard.insertText(p.text)
  else if (p.type === 'composition')
    await current.cdp('Input.imeSetComposition', {
      text: p.text,
      selectionStart: p.text.length,
      selectionEnd: p.text.length,
    })
  else if (p.type === 'key') {
    const args = {
      type: p.event === 'rawKeyDown' && p.key === 'Enter' ? 'keyDown' : p.event,
      key: p.key,
      code: p.code,
      windowsVirtualKeyCode: p.keyCode,
      nativeVirtualKeyCode: p.keyCode,
      modifiers: p.modifiers ?? 0,
      ...(p.event === 'rawKeyDown' && p.key === 'Enter'
        ? { text: '\r', unmodifiedText: '\r' }
        : {}),
    }
    if (p.event === 'rawKeyDown' && p.modifiers & 6) {
      const key = p.key.toLowerCase()
      const commands =
        key === 'a'
          ? ['selectAll']
          : key === 'z'
            ? [p.modifiers & 8 ? 'redo' : 'undo']
            : key === 'y'
              ? ['redo']
              : []
      if (commands.length) args.commands = commands
    }
    await current.cdp('Input.dispatchKeyEvent', args)
    if (p.event === 'rawKeyDown') heldKeys.set(p.code, args)
    else heldKeys.delete(p.code)
  } else if (p.type === 'copy' || p.type === 'cut') {
    const selection = await current.evaluate(() => {
      let e = document.activeElement
      while (e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement
      if (e?.matches('input[type=password],[autocomplete=one-time-code],[autocomplete*=cc-]'))
        return ''
      return e?.matches('input,textarea')
        ? e.value.slice(e.selectionStart, e.selectionEnd)
        : (getSelection()?.toString() ?? '')
    })
    const focused = await focus()
    const selectionDigest = hash(JSON.stringify({ pageId, epoch, selection, focus: focused }))
    if (p.type === 'cut') {
      if (p.selectionDigest !== selectionDigest) throw new Error('CUT_SELECTION_CHANGED')
      if (selection && focused.editable) {
        command.dispatched = true
        await current.keyboard.press('Backspace')
      }
    }
    return { status: 'executed', text: selection.slice(0, 100000), selectionDigest }
  } else throw new Error('INPUT_UNSUPPORTED')
  return {
    status: 'executed',
    ...(p.event === 'mouseReleased' || p.type === 'key' ? { focus: await focus() } : {}),
  }
}
async function act(action, command) {
  if (action.kind === 'switch') {
    const found = (await task.pages()).find((page) => page.label === action.pageId)
    if (!found) throw new Error('PAGE_NOT_AUTHORIZED')
    if (streaming) await current.cdp('Page.stopScreencast')
    await release()
    current = found
    pageId = found.label
    observations.clear()
    if (streaming) {
      streamEpoch++
      streamStartedAt = Date.now()
      await current.cdp('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
    }
    return observe()
  }
  if (action.pageId !== pageId) throw new Error('PAGE_MISMATCH')
  let ref
  if (['click', 'fill', 'select', 'check', 'download'].includes(action.kind))
    ref = await target(action)
  if (command.epoch !== epoch || cancelled.has(command.id)) throw new Error('CONTROL_EPOCH_STALE')
  if (command.params.leaseUntil <= Date.now()) throw new Error('TASK_LEASE_STALE')
  let receipt
  command.dispatched = !['wait', 'point'].includes(action.kind)
  if (action.kind === 'navigate') {
    receipt = await current.goto(action.url)
  } else if (action.kind === 'click')
    receipt = await current.click(ref, { label: 'execute reviewed page action' })
  else if (action.kind === 'fill') receipt = await current.fill(ref, action.value)
  else if (action.kind === 'select') receipt = await current.selectOption(ref, action.value)
  else if (action.kind === 'check') {
    const line = observations
      .get(action.observationId)
      ?.refs.find((item) => item.id === action.ref)
      ?.description.split('\n')[0]
    if (!line || !/checkbox|switch|radio/.test(line) || !/checked=(?:true|false)/.test(line))
      throw new Error('TARGET_NOT_CHECKABLE')
    const checked = /\bchecked(?:=true)?\b/.test(line) && !/checked=false|unchecked/.test(line)
    if (checked !== action.checked)
      receipt = await current.click(ref, { label: 'set reviewed checkbox state' })
    else command.dispatched = false
  } else if (action.kind === 'key') receipt = await current.keyboard.press(action.key)
  else if (action.kind === 'scroll') {
    await current.mouse.move(action.x ?? viewport.width / 2, action.y ?? viewport.height / 2)
    receipt = await current.mouse.wheel(action.deltaX ?? 0, action.deltaY ?? 0)
  } else if (action.kind === 'wait') {
    if (action.ref) {
      ref = await target(action)
      await current.waitForSelector(ref, { state: 'visible', timeout: 5000 })
    } else await current.waitForLoadState('domcontentloaded', { timeout: 5000 })
  } else if (action.kind === 'point') {
    if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) throw new Error('POINT_INVALID')
    // Resolve a visual point to live DOM semantics. Never click an opaque Canvas.
    return current.evaluate(
      ({ x, y }) => {
        const e = document.elementFromPoint(x, y)
        if (!e || e.closest('canvas')) return { supported: false }
        return {
          supported: true,
          tag: e.tagName,
          role: e.getAttribute('role'),
          text: (e.innerText ?? '').slice(0, 300),
        }
      },
      { x: action.x, y: action.y },
    )
  } else if (action.kind === 'download') {
    const waiting = current.waitForEvent('download', { timeout: 15000 })
    waiting.catch(() => {})
    await current.click(ref, { label: 'download reviewed task artifact' })
    const file = await waiting
    await file.saveAs(command.params.downloadPath)
    receipt = { downloaded: true, name: file.suggestedFilename() }
  } else throw new Error('ACTION_UNSUPPORTED')
  observations.clear()
  // A dispatch receipt is deliberately distinct from website acceptance.
  return {
    dispatched: command.dispatched,
    popups: receipt?.popups?.map((item) => ({ pageId: item.label })) ?? [],
    download: receipt?.downloaded === true ? receipt.name : null,
  }
}

async function execute(command) {
  try {
    command.dispatched = false
    if (
      ['act', 'input', 'capture'].includes(command.method) &&
      (!Number.isFinite(command.params.leaseUntil) || command.params.leaseUntil <= Date.now())
    )
      throw new Error('TASK_LEASE_STALE')
    if (command.epoch !== epoch || cancelled.has(command.id)) throw new Error('CONTROL_EPOCH_STALE')
    let value
    if (command.method === 'observe') value = await observe()
    else if (command.method === 'capture') {
      const previous = observations.get(command.params.observationId)
      if (!previous) throw new Error('STALE_OBSERVATION')
      const raw = await evidenceSnapshot()
      if (hash(normalized(raw)) !== previous.fingerprint) throw new Error('STALE_OBSERVATION')
      await current.screenshot({ path: command.params.path })
      value = null
    } else if (command.method === 'pages') value = await pages()
    else if (command.method === 'act') value = await act(command.params.action, command)
    else if (command.method === 'input') {
      if (
        command.params.input.type !== 'release' &&
        (command.params.pageId !== pageId || command.params.viewportVersion !== viewport.version)
      )
        throw new Error('VIEWPORT_STALE')
      command.dispatched = !['copy', 'cut'].includes(command.params.input.type)
      value = await input(command.params.input, command)
    } else if (command.method === 'stream') {
      if (command.params.enabled !== streaming) {
        streaming = command.params.enabled
        if (streaming) {
          for (const event of await current.events())
            if (event.method === 'Page.screencastFrame')
              await current.cdp('Page.screencastFrameAck', { sessionId: event.params.sessionId })
          streamStartedAt = Date.now()
        }
        await current.cdp(
          streaming ? 'Page.startScreencast' : 'Page.stopScreencast',
          streaming ? { format: 'png', everyNthFrame: 1 } : {},
        )
        if (streaming) streamEpoch++
        observations.clear()
      }
      value = null
    } else if (command.method === 'handoff') {
      await release()
      await task.handOff()
      value = null
      ending = true
    } else if (command.method === 'close') {
      if (streaming) await current.cdp('Page.stopScreencast')
      await release()
      if (command.params.finish) await task.finish({ keep: [] })
      value = null
      ending = true
    } else throw new Error('CONNECTOR_METHOD_UNSUPPORTED')
    send({ type: 'result', id: command.id, value })
    if (command.method === 'handoff') send({ type: 'native-handoff' })
  } catch (error) {
    const candidate = typeof error.code === 'string' ? error.code : error.message
    const code =
      typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(candidate)
        ? candidate
        : 'EGO_COMMAND_FAILED'
    send({
      type: 'result',
      id: command.id,
      error: String(code).slice(0, 200),
      dispatched: command.dispatched === true,
    })
    if (nativeCodes.has(error.code)) {
      send({ type: 'native-handoff', code: error.code })
      ending = true
    }
  } finally {
    cancelled.delete(command.id)
  }
}
try {
  const browserVersion = /chromium\s+([\d.]+)/i.exec(connectorConfig.cliVersion)?.[1] ?? 'unknown'
  await current.cdp('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  await current.cdp('Page.stopScreencast')
  await geometry()
  send({
    type: 'ready',
    value: {
      spaceId: task.spaceId,
      pageId,
      pages: await pages(),
      viewport,
      capabilities: {
        available: true,
        cliVersion: connectorConfig.cliVersion,
        browserVersion,
        semantic: typeof current.snapshot === 'function',
        png: true,
        directInput: typeof current.keyboard.insertText === 'function',
        nativeHandoff: typeof task.handOff === 'function',
        downloads: typeof current.waitForEvent === 'function',
      },
    },
  })
  while (!ending) {
    if (queue.length) {
      await execute(queue.shift())
      continue
    }
    if (streaming) {
      const events = await current.events()
      const frames = events.filter((event) => event.method === 'Page.screencastFrame')
      for (let i = 0; i < frames.length; i++) {
        const p = frames[i].params
        if (
          p.metadata.timestamp * 1000 >= streamStartedAt &&
          i === frames.length - 1 &&
          wire.writableLength < 2 * 1024 * 1024
        ) {
          const bytes = Buffer.from(p.data, 'base64')
          const width = p.metadata.deviceWidth,
            height = p.metadata.deviceHeight
          const vp = updateViewport({ width, height, dpr: bytes.readUInt32BE(16) / width })
          send(
            {
              type: 'frame',
              meta: {
                pageId,
                frameId: ++frameId,
                streamEpoch,
                captureAt: p.metadata.timestamp * 1000,
                receivedAt: Date.now(),
                pixelWidth: bytes.readUInt32BE(16),
                pixelHeight: bytes.readUInt32BE(20),
                viewport: vp,
                format: 'png',
              },
            },
            bytes,
          )
        }
        await current.cdp('Page.screencastFrameAck', { sessionId: p.sessionId })
      }
    }
    if (!queue.length && !ending)
      await new Promise((resolve) => {
        const timer = setTimeout(
          () => {
            wake = undefined
            resolve()
          },
          streaming ? 8 : 100,
        )
        wake = () => {
          clearTimeout(timer)
          resolve()
        }
      })
  }
} catch (error) {
  send({
    type: 'stopped',
    code:
      typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.code)
        ? error.code
        : 'EGO_CONNECTION_STOPPED',
  })
} finally {
  // Do not use any CDP cleanup after a native handoff or SDK rejection.
  wire.end()
}
