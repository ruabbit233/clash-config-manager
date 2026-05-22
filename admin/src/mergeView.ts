import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { iconCopy, iconX } from './icons'
import { t } from './i18n'
import { showToast } from './toast'

export interface MergeViewOptions {
  title: string
  leftLabel: string
  rightLabel: string
  leftContent: string
  rightContent: string
  copyLabel?: string
  closeLabel?: string
}

const READONLY_EXTENSIONS = [
  yaml(),
  oneDark,
  EditorView.editable.of(false),
  EditorState.readOnly.of(true),
]

export function renderMergeView(opts: MergeViewOptions): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'

  const card = document.createElement('div')
  card.className = 'modal-card modal-card-lg merge-view-card'

  card.innerHTML = `
    <div class="modal-header">
      <span class="modal-title"></span>
      <div class="merge-header-actions">
        <button class="btn btn-secondary btn-sm merge-copy-btn"></button>
        <button class="modal-close btn-icon" aria-label="${t.modal.close}">${iconX}</button>
      </div>
    </div>
    <div class="merge-view-labels">
      <span class="merge-view-label"></span>
      <span class="merge-view-label"></span>
    </div>
    <div class="merge-view-host modal-body modal-body-pane"></div>
  `

  const titleEl = card.querySelector<HTMLSpanElement>('.modal-title')!
  titleEl.textContent = opts.title

  const labels = card.querySelectorAll<HTMLSpanElement>('.merge-view-label')
  labels[0].textContent = opts.leftLabel
  labels[1].textContent = opts.rightLabel

  const copyBtn = card.querySelector<HTMLButtonElement>('.merge-copy-btn')!
  copyBtn.innerHTML = `${iconCopy} <span>${opts.copyLabel ?? t.versions.diffCopy}</span>`

  const host = card.querySelector<HTMLDivElement>('.merge-view-host')!

  overlay.appendChild(card)
  document.body.appendChild(overlay)

  const merge = new MergeView({
    parent: host,
    a: { doc: opts.leftContent, extensions: READONLY_EXTENSIONS },
    b: { doc: opts.rightContent, extensions: READONLY_EXTENSIONS },
    revertControls: undefined,
    highlightChanges: true,
    gutter: true,
    collapseUnchanged: { margin: 3, minSize: 4 },
  })

  copyBtn.addEventListener('click', async () => {
    const lines: string[] = []
    lines.push(`--- ${opts.leftLabel}`)
    lines.push(`+++ ${opts.rightLabel}`)
    lines.push('')
    lines.push(`# left`)
    lines.push(opts.leftContent)
    lines.push(``)
    lines.push(`# right`)
    lines.push(opts.rightContent)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast(t.versions.diffCopied, 'success')
    } catch {
      showToast(t.versions.error, 'error')
    }
  })

  const close = (): void => {
    document.removeEventListener('keydown', onKey)
    merge.destroy()
    overlay.remove()
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey)

  card.querySelector<HTMLButtonElement>('.modal-close')!.addEventListener('click', close)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })
}
