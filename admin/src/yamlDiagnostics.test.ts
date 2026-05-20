import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { getYamlDiagnostics, toCodeMirrorDiagnostics } from './yamlDiagnostics'

describe('getYamlDiagnostics', () => {
  it('returns ok for empty input', () => {
    const result = getYamlDiagnostics('')
    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('returns ok for valid YAML', () => {
    const source = 'foo: bar\nbaz:\n  - 1\n  - 2'
    const result = getYamlDiagnostics(source)
    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('reports MULTILINE_IMPLICIT_KEY with absolute offsets', () => {
    const source = 'foo:\nbar baz\n  qux: 1'
    const result = getYamlDiagnostics(source, Text.of(source.split('\n')))

    expect(result.ok).toBe(false)
    expect(result.issues).toHaveLength(1)

    const issue = result.issues[0]
    expect(issue.from).toBeGreaterThanOrEqual(0)
    expect(issue.to).toBeGreaterThan(issue.from)
    expect(issue.to).toBeLessThanOrEqual(source.length)
    expect(issue.line).toBeGreaterThanOrEqual(1)
    expect(issue.column).toBeGreaterThanOrEqual(1)
    expect(issue.code).toBe('MULTILINE_IMPLICIT_KEY')
    expect(issue.message).not.toContain('\n')
    expect(issue.message).not.toMatch(/at line \d+, column \d+/i)
  })

  it('collects multiple errors via parseDocument', () => {
    const source = '   bad indent:\nok: 1'
    const result = getYamlDiagnostics(source, Text.of(source.split('\n')))

    expect(result.ok).toBe(false)
    expect(result.issues.length).toBeGreaterThanOrEqual(2)
    for (const issue of result.issues) {
      expect(issue.from).toBeGreaterThanOrEqual(0)
      expect(issue.to).toBeGreaterThan(issue.from)
      expect(issue.message.length).toBeGreaterThan(0)
    }
  })

  it('clamps offsets that exceed document length', () => {
    const source = 'a:\nb:'
    const result = getYamlDiagnostics(source, Text.of(source.split('\n')))
    for (const issue of result.issues) {
      expect(issue.from).toBeLessThanOrEqual(source.length)
      expect(issue.to).toBeLessThanOrEqual(source.length)
    }
  })
})

describe('toCodeMirrorDiagnostics', () => {
  it('maps every issue to a Diagnostic with severity error', () => {
    const issues = [
      { from: 0, to: 5, line: 1, column: 1, message: 'first', code: 'X' },
      { from: 10, to: 12, line: 2, column: 1, message: 'second' },
    ]
    const diagnostics = toCodeMirrorDiagnostics(issues)

    expect(diagnostics).toHaveLength(2)
    expect(diagnostics[0]).toEqual({
      from: 0,
      to: 5,
      severity: 'error',
      message: 'first',
      source: 'yaml',
    })
    expect(diagnostics[1].severity).toBe('error')
    expect(diagnostics[1].source).toBe('yaml')
  })

  it('returns empty array for no issues', () => {
    expect(toCodeMirrorDiagnostics([])).toEqual([])
  })
})
