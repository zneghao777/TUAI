import { z } from 'zod'
const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._:@-]+$/)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const coordinate = z.number().finite().min(0).max(32768)
export const summarySchema = z.strictObject({
  merchant: z.string().min(1).max(300),
  itinerary: z.string().min(1).max(2000),
  dataScope: z.string().min(1).max(2000),
  amount: z.string().min(1).max(80),
  currency: z.string().min(1).max(20),
  terms: z.string().min(1).max(2000),
  action: z.string().min(1).max(500),
})
export const reviewSchema = z.strictObject({
  kind: z.enum(['read', 'local_change', 'external_submit', 'sensitive', 'unsupported']),
  reason: z.string().min(1).max(2000),
  evidenceQuotes: z.array(z.string().min(1).max(2000)).min(1).max(12),
  summary: summarySchema.optional(),
})
export const actionSchema = z.strictObject({
  kind: z.enum([
    'navigate',
    'click',
    'fill',
    'select',
    'check',
    'key',
    'scroll',
    'wait',
    'switch',
    'download',
    'point',
  ]),
  pageId: id,
  observationId: id.optional(),
  ref: z
    .string()
    .regex(/^@\d+$/)
    .optional(),
  value: z.string().max(10000).optional(),
  url: z.string().max(4096).optional(),
  key: z.string().max(100).optional(),
  checked: z.boolean().optional(),
  x: coordinate.optional(),
  y: coordinate.optional(),
  deltaX: z.number().finite().min(-10000).max(10000).optional(),
  deltaY: z.number().finite().min(-10000).max(10000).optional(),
})
export const actionRequestSchema = z.strictObject({
  browserId: id,
  executionId: id,
  fence: count,
  controlEpoch: count,
  operationId: id,
  observationId: id,
  action: actionSchema,
})
export const controlSchema = z.strictObject({
  browserId: id,
  requestId: id,
  expectedRevision: count,
  controlEpoch: count,
  connectionId: id,
  pageId: id.optional(),
  action: z.enum(['take', 'return', 'native-handoff', 'reconnect', 'cancel', 'switch-page']),
})
const modifiers = z.number().int().min(0).max(15).optional()
export const inputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('mouse'),
    x: coordinate,
    y: coordinate,
    event: z.enum(['mousePressed', 'mouseReleased', 'mouseMoved']),
    button: z.enum(['none', 'left', 'right', 'middle']),
    buttons: z.number().int().min(0).max(7),
    clickCount: z.number().int().min(0).max(3),
    modifiers,
  }),
  z.strictObject({
    type: z.literal('wheel'),
    x: coordinate,
    y: coordinate,
    deltaX: z.number().finite().min(-10000).max(10000),
    deltaY: z.number().finite().min(-10000).max(10000),
    modifiers,
  }),
  z.strictObject({ type: z.literal('text'), text: z.string().min(1).max(10000) }),
  z.strictObject({ type: z.literal('composition'), text: z.string().max(10000) }),
  z.strictObject({
    type: z.literal('key'),
    event: z.enum(['rawKeyDown', 'keyUp']),
    key: z.string().min(1).max(80),
    code: z.string().min(1).max(80),
    keyCode: z.number().int().min(0).max(255),
    modifiers,
  }),
  z.strictObject({ type: z.literal('copy') }),
  z.strictObject({ type: z.literal('cut'), selectionDigest: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.strictObject({ type: z.literal('release') }),
])
export const inputEnvelopeSchema = z.strictObject({
  browserId: id,
  pageId: id,
  connectionId: id,
  controlEpoch: count,
  sequence: count.positive(),
  viewportVersion: count,
  input: inputSchema,
})
export const approvalSchema = z.strictObject({
  browserId: id,
  transactionId: id,
  version: count,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(['approve', 'reject']),
  requestId: id,
  expectedRevision: count,
  controlEpoch: count,
})
