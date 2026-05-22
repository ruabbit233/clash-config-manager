import { ApiClient } from './api'
import { AuthError } from './auth'
import { EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { search } from '@codemirror/search'
import { autocompletion } from '@codemirror/autocomplete'
import { parseDocument, stringify as yamlStringify } from 'yaml'
import { showToast } from './toast'
import { t } from './i18n'
import { showConfirm, showSaveDialog } from './modal'
import { renderMergeView } from './mergeView'
import {
  iconSave,
  iconRefresh,
  iconDownload,
  iconCheck,
  iconAlert,
  iconWand,
  iconChevronDown,
  iconChevronUp,
  iconX,
} from './icons'
import { getElementById } from './dom'
import { getYamlDiagnostics, toCodeMirrorDiagnostics, type YamlIssue } from './yamlDiagnostics'
import { createYamlSearchPanel } from './searchPanel'
import { clashCompletionSource } from './clashSchema'
import type { Page } from './page'

const DRAFT_KEY = 'clash_admin_draft'
const DRAFT_META_KEY = 'clash_admin_draft_meta'
const COLLAPSED_BANNER_THRESHOLD = 5
const SAVED_INDICATOR_MS = 1500

interface DraftMeta {
  savedAt: number
  forOriginalHash: string
}

const hashStr = (s: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

const readDraftMeta = (): DraftMeta | null => {
  try {
    const raw = localStorage.getItem(DRAFT_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DraftMeta>
    if (typeof parsed.savedAt !== 'number' || typeof parsed.forOriginalHash !== 'string')
      return null
    return parsed as DraftMeta
  } catch {
    return null
  }
}

const writeDraftMeta = (meta: DraftMeta): void => {
  localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta))
}

const clearDraft = (): void => {
  localStorage.removeItem(DRAFT_KEY)
  localStorage.removeItem(DRAFT_META_KEY)
}

export function createEditorPage(onSaved?: () => void): Page {
  let activeView: EditorView | null = null
  let autosaveTimer: number | undefined
  let savedFlashTimer: number | undefined
  let editorDirty = false

  return {
    mount(container: HTMLElement, api: ApiClient): void {
      container.innerHTML = `
    <div class="editor-page">
      <div class="editor-toolbar">
        <button id="editor-save" class="btn btn-primary" title="${t.editor.saveShortcutHint}">
          <span class="btn-state-default">${iconSave} <span class="btn-label">${t.editor.save}</span></span>
          <span class="btn-state-loading" hidden><span class="spinner spinner-inline"></span> <span class="btn-label">${t.editor.saving}</span></span>
          <span class="btn-state-saved" hidden>${iconCheck} <span class="btn-label">${t.editor.saved}</span></span>
        </button>
        <button id="editor-format" class="btn btn-secondary" title="${t.editor.formatHint}">${iconWand} ${t.editor.format}</button>
        <button id="editor-reset" class="btn btn-secondary">${iconRefresh} ${t.editor.reset}</button>
        <button id="editor-download" class="btn btn-secondary">${iconDownload} ${t.editor.download}</button>
      </div>
      <div id="editor-draft-banner" class="draft-banner" hidden></div>
      <div id="editor-status-banner" class="status-banner status-banner-valid" hidden></div>
      <div id="editor-wrapper"></div>
    </div>
  `

      const wrapper = getElementById<HTMLElement>('editor-wrapper')
      const saveBtn = getElementById<HTMLButtonElement>('editor-save')
      const formatBtn = getElementById<HTMLButtonElement>('editor-format')
      const resetBtn = getElementById<HTMLButtonElement>('editor-reset')
      const downloadBtn = getElementById<HTMLButtonElement>('editor-download')
      const banner = getElementById<HTMLDivElement>('editor-status-banner')
      const draftBanner = getElementById<HTMLDivElement>('editor-draft-banner')

      let originalContent = ''
      let bannerExpanded = false
      let bannerHidden = false

      const stateDefault = saveBtn.querySelector<HTMLSpanElement>('.btn-state-default')!
      const stateLoading = saveBtn.querySelector<HTMLSpanElement>('.btn-state-loading')!
      const stateSaved = saveBtn.querySelector<HTMLSpanElement>('.btn-state-saved')!

      const setSaveState = (state: 'default' | 'loading' | 'saved'): void => {
        stateDefault.hidden = state !== 'default'
        stateLoading.hidden = state !== 'loading'
        stateSaved.hidden = state !== 'saved'
        saveBtn.disabled = state === 'loading'
        saveBtn.classList.toggle('is-saving', state === 'loading')
        saveBtn.classList.toggle('is-saved', state === 'saved')
      }

      const renderBanner = (issues: YamlIssue[]) => {
        if (bannerHidden && issues.length > 0) {
          return
        }
        banner.hidden = false
        banner.replaceChildren()

        const isValid = issues.length === 0
        if (isValid) bannerHidden = false
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

        if (!isValid) {
          const actions = document.createElement('div')
          actions.className = 'status-banner-actions'

          if (issues.length > COLLAPSED_BANNER_THRESHOLD) {
            const expandBtn = document.createElement('button')
            expandBtn.type = 'button'
            expandBtn.className = 'status-banner-action'
            expandBtn.innerHTML = bannerExpanded
              ? `${iconChevronUp} ${t.editor.collapseIssues}`
              : `${iconChevronDown} ${t.editor.expandAllIssues({ count: issues.length })}`
            expandBtn.addEventListener('click', () => {
              bannerExpanded = !bannerExpanded
              renderBanner(issues)
            })
            actions.appendChild(expandBtn)
          }

          const dismissBtn = document.createElement('button')
          dismissBtn.type = 'button'
          dismissBtn.className = 'status-banner-action status-banner-dismiss'
          dismissBtn.setAttribute('aria-label', t.editor.bannerDismiss)
          dismissBtn.title = t.editor.bannerDismiss
          dismissBtn.innerHTML = iconX
          dismissBtn.addEventListener('click', () => {
            bannerHidden = true
            banner.hidden = true
          })
          actions.appendChild(dismissBtn)

          head.appendChild(actions)
        }

        banner.appendChild(head)

        if (isValid) return

        const list = document.createElement('ul')
        list.className = 'status-banner-issues'

        const cap = bannerExpanded ? issues.length : COLLAPSED_BANNER_THRESHOLD
        const visible = issues.slice(0, cap)
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

        if (!bannerExpanded && issues.length > COLLAPSED_BANNER_THRESHOLD) {
          const more = document.createElement('li')
          more.className = 'status-banner-more'
          more.textContent = t.editor.moreIssuesHint({
            count: issues.length - COLLAPSED_BANNER_THRESHOLD,
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

      const flashSaved = (): void => {
        setSaveState('saved')
        if (savedFlashTimer !== undefined) window.clearTimeout(savedFlashTimer)
        savedFlashTimer = window.setTimeout(() => {
          setSaveState('default')
          savedFlashTimer = undefined
        }, SAVED_INDICATOR_MS)
      }

      const saveConfig = async (): Promise<void> => {
        if (!activeView || saveBtn.disabled) {
          return
        }
        const doc = activeView.state.doc.toString()
        const result = getYamlDiagnostics(doc, activeView.state.doc)

        const dialogResult = await showSaveDialog({
          title: t.editor.saveDialogTitle,
          invalidWarning: result.ok ? undefined : t.editor.saveDialogInvalidWarning,
          messageLabel: t.editor.saveDialogMessageLabel,
          messagePlaceholder: t.editor.saveDialogMessagePlaceholder,
          confirmLabel: t.editor.saveDialogConfirm,
          cancelLabel: t.modal.cancel,
        })
        if (!dialogResult) return

        const versionMsg = dialogResult.message.length > 0 ? dialogResult.message : undefined

        setSaveState('loading')
        try {
          await api.saveConfig(doc, versionMsg)
          clearDraft()
          originalContent = doc
          editorDirty = false
          flashSaved()
          showToast(t.editor.configSaved, 'success')
          if (onSaved) onSaved()
        } catch (e: unknown) {
          setSaveState('default')
          showToast(e instanceof Error ? e.message : String(e), 'error')
        }
      }

      const formatYaml = (): void => {
        if (!activeView) return
        const doc = activeView.state.doc.toString()
        try {
          const parsed = parseDocument(doc, { prettyErrors: true })
          if (parsed.errors.length > 0) {
            showToast(t.editor.formatFailed, 'error')
            return
          }
          const formatted = yamlStringify(parsed.toJS({ maxAliasCount: -1 }), {
            indent: 2,
            lineWidth: 0,
          })
          if (formatted === doc) {
            showToast(t.editor.formatSuccess, 'info')
            return
          }
          activeView.dispatch({
            changes: { from: 0, to: activeView.state.doc.length, insert: formatted },
          })
          showToast(t.editor.formatSuccess, 'success')
        } catch (e: unknown) {
          showToast(e instanceof Error ? e.message : t.editor.formatFailed, 'error')
        }
      }

      const initEditor = (content: string) => {
        if (activeView) activeView.destroy()
        editorDirty = false
        bannerExpanded = false
        bannerHidden = false

        const updateListener = EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const doc = update.state.doc.toString()
            const dirty = doc !== originalContent
            editorDirty = dirty
            if (dirty) {
              localStorage.setItem(DRAFT_KEY, doc)
              writeDraftMeta({
                savedAt: Date.now(),
                forOriginalHash: hashStr(originalContent),
              })
            } else {
              clearDraft()
            }
          }
        })

        const editorKeymap = keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              void saveConfig()
              return true
            },
          },
          {
            key: 'Mod-Shift-f',
            preventDefault: true,
            run: () => {
              formatYaml()
              return true
            },
          },
        ])

        activeView = new EditorView({
          state: EditorState.create({
            doc: content,
            extensions: [
              editorKeymap,
              basicSetup,
              search({ top: true, createPanel: createYamlSearchPanel }),
              yaml(),
              autocompletion({ override: [clashCompletionSource], activateOnTyping: true }),
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

      const renderDraftBanner = (
        draft: string,
        meta: DraftMeta | null,
        serverHashChanged: boolean,
      ): void => {
        draftBanner.hidden = false
        draftBanner.replaceChildren()
        draftBanner.className = `draft-banner ${serverHashChanged ? 'draft-banner-stale' : ''}`

        const head = document.createElement('div')
        head.className = 'draft-banner-head'

        const title = document.createElement('span')
        title.className = 'draft-banner-title'
        title.textContent = t.editor.draftBannerTitle

        const ageMin = meta ? Math.floor((Date.now() - meta.savedAt) / 60000) : 0
        const hint = document.createElement('span')
        hint.className = 'draft-banner-hint'
        hint.textContent = t.editor.draftBannerHint({ ageMinutes: ageMin })

        head.append(title, hint)

        if (serverHashChanged) {
          const stale = document.createElement('span')
          stale.className = 'draft-banner-stale-tag'
          stale.textContent = t.editor.draftBannerStale
          head.appendChild(stale)
        }

        const actions = document.createElement('div')
        actions.className = 'draft-banner-actions'

        const restoreBtn = document.createElement('button')
        restoreBtn.className = 'btn btn-primary btn-sm'
        restoreBtn.textContent = t.editor.draftBannerRestore
        restoreBtn.addEventListener('click', () => {
          if (!activeView) return
          activeView.dispatch({
            changes: { from: 0, to: activeView.state.doc.length, insert: draft },
          })
          editorDirty = draft !== originalContent
          draftBanner.hidden = true
          showToast(t.editor.draftRestored, 'success')
        })

        const compareBtn = document.createElement('button')
        compareBtn.className = 'btn btn-secondary btn-sm'
        compareBtn.textContent = t.editor.draftBannerCompare
        compareBtn.addEventListener('click', () => {
          renderMergeView({
            title: t.editor.draftCompareTitle,
            leftLabel: t.editor.draftCompareLeft,
            rightLabel: t.editor.draftCompareRight,
            leftContent: originalContent,
            rightContent: draft,
          })
        })

        const discardBtn = document.createElement('button')
        discardBtn.className = 'btn btn-ghost btn-sm'
        discardBtn.textContent = t.editor.draftBannerDiscard
        discardBtn.addEventListener('click', () => {
          clearDraft()
          draftBanner.hidden = true
          showToast(t.editor.draftDiscarded, 'info')
        })

        actions.append(restoreBtn, compareBtn, discardBtn)
        draftBanner.append(head, actions)
      }

      const loadConfig = async () => {
        try {
          const config = await api.getConfig()
          originalContent = config.content
          initEditor(originalContent)

          const draft = localStorage.getItem(DRAFT_KEY)
          if (draft && draft !== originalContent) {
            const meta = readDraftMeta()
            const currentHash = hashStr(originalContent)
            const serverHashChanged = meta ? meta.forOriginalHash !== currentHash : false
            renderDraftBanner(draft, meta, serverHashChanged)
          } else if (draft === originalContent) {
            clearDraft()
          }
        } catch (e: unknown) {
          showToast(e instanceof Error ? e.message : String(e), 'error')
          if (!(e instanceof AuthError)) initEditor('')
        }
      }

      saveBtn.addEventListener('click', () => {
        void saveConfig()
      })

      formatBtn.addEventListener('click', () => formatYaml())

      resetBtn.addEventListener('click', async () => {
        if (await showConfirm(t.editor.discardConfirm)) {
          clearDraft()
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
        if (!activeView) return
        const doc = activeView.state.doc.toString()
        if (doc !== originalContent) {
          localStorage.setItem(DRAFT_KEY, doc)
          writeDraftMeta({
            savedAt: Date.now(),
            forOriginalHash: hashStr(originalContent),
          })
        }
      }, 30000)
    },
    unmount(): void {
      if (autosaveTimer !== undefined) {
        window.clearInterval(autosaveTimer)
        autosaveTimer = undefined
      }
      if (savedFlashTimer !== undefined) {
        window.clearTimeout(savedFlashTimer)
        savedFlashTimer = undefined
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
