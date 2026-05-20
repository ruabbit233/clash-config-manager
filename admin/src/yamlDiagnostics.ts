import type { Diagnostic } from '@codemirror/lint'
import type { Text } from '@codemirror/state'
import { parseDocument } from 'yaml'

export interface YamlIssue {
  from: number
  to: number
  line: number
  column: number
  message: string
  code?: string
}

export interface YamlDiagnostics {
  ok: boolean
  issues: YamlIssue[]
}

function stripTrailingSourceContext(raw: string): string {
  const firstLine = raw.split('\n', 1)[0] ?? raw
  return firstLine
    .replace(/\s+at line \d+, column \d+:?$/i, '')
    .replace(/:\s*$/, '')
    .trim()
}

function clampOffset(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return value > max ? max : value
}

function offsetFromLineCol(doc: Text, line: number, column: number): number {
  if (line < 1) return 0
  if (line > doc.lines) return doc.length
  const lineInfo = doc.line(line)
  const col = column < 1 ? 1 : column
  return clampOffset(lineInfo.from + col - 1, lineInfo.to)
}

/**
 * `parseDocument` collects every error instead of throwing on the first;
 * `err.pos` is preferred over `err.linePos` because the absolute offsets
 * already account for tabs, multibyte characters, and trailing newlines that
 * a manual line+column → offset conversion would mishandle.
 */
export function getYamlDiagnostics(source: string, doc?: Text): YamlDiagnostics {
  if (source.length === 0) {
    return { ok: true, issues: [] }
  }

  let parsed
  try {
    parsed = parseDocument(source, { prettyErrors: true })
  } catch (e: unknown) {
    return {
      ok: false,
      issues: [
        {
          from: 0,
          to: Math.min(source.length, 1),
          line: 1,
          column: 1,
          message: e instanceof Error ? e.message : String(e),
        },
      ],
    }
  }

  if (parsed.errors.length === 0) {
    return { ok: true, issues: [] }
  }

  const max = source.length
  const issues: YamlIssue[] = parsed.errors.map((err) => {
    const pos = err.pos
    const linePos = err.linePos
    let from: number
    let to: number

    if (Array.isArray(pos) && pos.length >= 1) {
      from = clampOffset(pos[0], max)
      to = clampOffset(pos[1] ?? pos[0] + 1, max)
    } else if (linePos && linePos[0] && doc) {
      from = offsetFromLineCol(doc, linePos[0].line, linePos[0].col)
      to = linePos[1]
        ? offsetFromLineCol(doc, linePos[1].line, linePos[1].col)
        : Math.min(from + 1, max)
    } else {
      from = 0
      to = Math.min(max, 1)
    }

    if (to <= from) to = Math.min(from + 1, max)

    const line = linePos?.[0]?.line ?? 1
    const column = linePos?.[0]?.col ?? 1

    return {
      from,
      to,
      line,
      column,
      message: stripTrailingSourceContext(err.message),
      code: err.code,
    }
  })

  return { ok: false, issues }
}

export function toCodeMirrorDiagnostics(issues: YamlIssue[]): Diagnostic[] {
  return issues.map((issue) => ({
    from: issue.from,
    to: issue.to,
    severity: 'error',
    message: issue.message,
    source: 'yaml',
  }))
}
