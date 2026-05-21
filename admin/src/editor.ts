import { ApiClient } from './api'
import { AuthError } from './auth'
import { EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { search } from '@codemirror/search'
import { showToast } from './toast'
import { t } from './i18n'
import { showConfirm, showPrompt } from './modal'
import { iconSave, iconRefresh, iconDownload, iconCheck, iconAlert } from './icons'
import { getElementById } from './dom'
import { getYamlDiagnostics, toCodeMirrorDiagnostics, type YamlIssue } from './yamlDiagnostics'
import { createYamlSearchPanel } from './searchPanel'
import type { Page } from './page'

const MAX_BANNER_ISSUES = 5

export function createEditorPage(onSaved?: () => void): Page {
  let activeView: EditorView | null = null
  let autosaveTimer: number | undefined
  let editorDirty = false

  return {
    mount(container: HTMLElement, api: ApiClient): void {
      container.innerHTML = `
    <div class="editor-page">
      <div class="editor-toolbar">
        <button id="editor-save" class="btn btn-primary">${iconSave} ${t.editor.save}</button>
        <button id="editor-reset" class="btn btn-secondary">${iconRefresh} ${t.editor.reset}</button>
        <button id="editor-download" class="btn btn-secondary">${iconDownload} ${t.editor.download}</button>
      </div>
      <div id="editor-status-banner" class="status-banner status-banner-valid" hidden></div>
      <div id="editor-wrapper"></div>
    </div>
  `

      const wrapper = getElementById<HTMLElement>('editor-wrapper')
      const saveBtn = getElementById<HTMLButtonElement>('editor-save')
      const resetBtn = getElementById<HTMLButtonElement>('editor-reset')
      const downloadBtn = getElementById<HTMLButtonElement>('editor-download')
      const banner = getElementById<HTMLDivElement>('editor-status-banner')

      let originalContent = ''

      const renderBanner = (issues: YamlIssue[]) => {
        banner.hidden = false
        banner.replaceChildren()

        const isValid = issues.length === 0
        banner.className = `status-banner ${isValid ? 'status-banner-valid' : 'status-banner-invalid'}`

        const head = document.createElement('div')
        head.className = 'status-banner-head'

        const icon = document.createElement('span')
        icon.className = 'status-banner-icon'
        icon.innerHTML = isValid ? iconCheck : iconAlert
        head.appendChild(icon)

        const title = document.createElement('span')
        title.className = 'status-banner-title'
        title.textContent = isValid
          ? t.editor.validYaml
          : t.editor.issuesFound({ count: issues.length })
        head.appendChild(title)

        banner.appendChild(head)

        if (isValid) return

        const list = document.createElement('ul')
        list.className = 'status-banner-issues'

        const visible = issues.slice(0, MAX_BANNER_ISSUES)
        for (const issue of visible) {
          const li = document.createElement('li')
          li.className = 'status-banner-issue'

          const locBtn = document.createElement('button')
          locBtn.type = 'button'
          locBtn.className = 'status-banner-loc'
          locBtn.textContent = t.editor.jumpToLocation({
            line: issue.line,
            column: issue.column,
          })
          locBtn.addEventListener('click', () => jumpTo(issue))

          const msg = document.createElement('span')
          msg.className = 'status-banner-msg'
          msg.textContent = issue.message

          li.appendChild(locBtn)
          li.appendChild(msg)
          list.appendChild(li)
        }

        if (issues.length > MAX_BANNER_ISSUES) {
          const more = document.createElement('li')
          more.className = 'status-banner-more'
          more.textContent = t.editor.moreIssuesHint({
            count: issues.length - MAX_BANNER_ISSUES,
          })
          list.appendChild(more)
        }

        banner.appendChild(list)
      }

      const jumpTo = (issue: YamlIssue) => {
        if (!activeView) return
        const pos = Math.min(issue.from, activeView.state.doc.length)
        activeView.dispatch({
          selection: { anchor: pos, head: pos },
          effects: EditorView.scrollIntoView(pos, { y: 'center' }),
        })
        activeView.focus()
      }

      const yamlLinter = linter((view): Diagnostic[] => {
        const source = view.state.doc.toString()
        const result = getYamlDiagnostics(source, view.state.doc)
        renderBanner(result.issues)
        return toCodeMirrorDiagnostics(result.issues)
      })

      const initEditor = (content: string) => {
        if (activeView) activeView.destroy()
        editorDirty = false

        const updateListener = EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const doc = update.state.doc.toString()
            localStorage.setItem('clash_admin_draft', doc)
            editorDirty = doc !== originalContent
          }
        })

        activeView = new EditorView({
          state: EditorState.create({
            doc: content,
            extensions: [
              basicSetup,
              search({ top: true, createPanel: createYamlSearchPanel }),
              yaml(),
              oneDark,
              lintGutter(),
              yamlLinter,
              updateListener,
            ],
          }),
          parent: wrapper,
        })

        const initial = getYamlDiagnostics(content, activeView.state.doc)
        renderBanner(initial.issues)
      }

      const loadConfig = async () => {
        try {
          const config = await api.getConfig()
          originalContent = config.content
          const draft = localStorage.getItem('clash_admin_draft')
          if (draft && draft !== originalContent) {
            if (await showConfirm(t.editor.draftRestore)) {
              initEditor(draft)
              editorDirty = true
              return
            } else {
              localStorage.removeItem('clash_admin_draft')
            }
          }
          initEditor(originalContent)
        } catch (e: unknown) {
          showToast(e instanceof Error ? e.message : String(e), 'error')
          if (!(e instanceof AuthError)) initEditor('')
        }
      }

      saveBtn.addEventListener('click', async () => {
        if (!activeView) {
          showToast(t.editor.notReady, 'error')
          return
        }
        const doc = activeView.state.doc.toString()
        const result = getYamlDiagnostics(doc, activeView.state.doc)
        if (!result.ok) {
          if (!(await showConfirm(t.editor.invalidSaveConfirm))) return
        }
        const msg = await showPrompt(
          t.editor.versionMessagePrompt,
          '',
          t.editor.versionMessageLabel,
        )
        const versionMsg = msg || undefined

        saveBtn.disabled = true
        try {
          await api.saveConfig(doc, versionMsg)
          localStorage.removeItem('clash_admin_draft')
          originalContent = doc
          editorDirty = false
          showToast(t.editor.configSaved, 'success')
          if (onSaved) onSaved()
        } catch (e: unknown) {
          showToast(e instanceof Error ? e.message : String(e), 'error')
        } finally {
          saveBtn.disabled = false
        }
      })

      resetBtn.addEventListener('click', async () => {
        if (await showConfirm(t.editor.discardConfirm)) {
          localStorage.removeItem('clash_admin_draft')
          await loadConfig()
        }
      })

      downloadBtn.addEventListener('click', () => {
        window.open('/download', '_blank')
      })

      if (autosaveTimer !== undefined) {
        window.clearInterval(autosaveTimer)
      }

      loadConfig()

      autosaveTimer = window.setInterval(() => {
        if (activeView && activeView.state.doc.toString() !== originalContent) {
          localStorage.setItem('clash_admin_draft', activeView.state.doc.toString())
        }
      }, 30000)
    },
    unmount(): void {
      if (autosaveTimer !== undefined) {
        window.clearInterval(autosaveTimer)
        autosaveTimer = undefined
      }
      if (activeView) {
        activeView.destroy()
        activeView = null
      }
    },
    isDirty(): boolean {
      return editorDirty
    },
  }
}
