import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { localizeHostError } from '../../apps/web/src/model/host-errors'

const roots = [
  'packages/product/web-host/src',
  'packages/product/host-config/src',
  'packages/product/platform/src',
  'packages/product/agent-runtime/src',
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('product Host error translations', () => {
  it('covers static Chinese error and message literals in both additional languages', () => {
    const missing: string[] = []
    for (const file of roots.flatMap(sourceFiles)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      )
      const visit = (node: ts.Node) => {
        let message: ts.Expression | undefined
        if (ts.isNewExpression(node) && node.expression.getText(source) === 'Error')
          message = node.arguments?.[0]
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'message')
          message = node.initializer
        if (
          message &&
          (ts.isStringLiteral(message) || ts.isNoSubstitutionTemplateLiteral(message)) &&
          /[\u4e00-\u9fff]/.test(message.text)
        ) {
          for (const language of ['en', 'it'] as const) {
            if (localizeHostError(message.text, language) === message.text)
              missing.push(`${file}: ${language}: ${message.text}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(missing).toEqual([])
  })
})
