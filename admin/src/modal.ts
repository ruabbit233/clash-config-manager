import { t } from './i18n'
import { iconX } from './icons'
import { querySelectorRequired } from './dom'

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  return overlay
}

function createCard(title: string): {
  card: HTMLDivElement
  body: HTMLDivElement
  footer: HTMLDivElement
} {
  const card = document.createElement('div')
  card.className = 'modal-card'

  card.innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${title}</span>
      <button class="modal-close btn-icon" aria-label="${t.modal.close}">${iconX}</button>
    </div>
    <div class="modal-body"></div>
    <div class="modal-footer"></div>
  `

  return {
    card,
    body: querySelectorRequired<HTMLDivElement>(card, '.modal-body'),
    footer: querySelectorRequired<HTMLDivElement>(card, '.modal-footer'),
  }
}

export function showConfirm(message: string, title: string = t.modal.confirm): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = createOverlay()
    const { card, body, footer } = createCard(title)

    body.textContent = message

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn btn-secondary'
    cancelBtn.textContent = t.modal.cancel

    const okBtn = document.createElement('button')
    okBtn.className = 'btn btn-primary'
    okBtn.textContent = t.modal.ok

    footer.append(cancelBtn, okBtn)
    overlay.append(card)
    document.body.append(overlay)

    const close = (result: boolean) => {
      overlay.remove()
      resolve(result)
    }

    cancelBtn.addEventListener('click', () => close(false))
    okBtn.addEventListener('click', () => close(true))
    querySelectorRequired<HTMLButtonElement>(card, '.modal-close').addEventListener('click', () =>
      close(false),
    )
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false)
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey)
        close(false)
      }
    }
    document.addEventListener('keydown', onKey)

    okBtn.focus()
  })
}

export function showPrompt(
  message: string,
  defaultValue: string = '',
  title: string = t.modal.confirm,
): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = createOverlay()
    const { card, body, footer } = createCard(title)

    const label = document.createElement('div')
    label.className = 'modal-message'
    label.textContent = message

    const input = document.createElement('input')
    input.className = 'modal-input'
    input.value = defaultValue

    body.append(label, input)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn btn-secondary'
    cancelBtn.textContent = t.modal.cancel

    const okBtn = document.createElement('button')
    okBtn.className = 'btn btn-primary'
    okBtn.textContent = t.modal.ok

    footer.append(cancelBtn, okBtn)
    overlay.append(card)
    document.body.append(overlay)

    const close = (result: string | null) => {
      overlay.remove()
      resolve(result)
    }

    cancelBtn.addEventListener('click', () => close(null))
    okBtn.addEventListener('click', () => close(input.value))
    querySelectorRequired<HTMLButtonElement>(card, '.modal-close').addEventListener('click', () =>
      close(null),
    )
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null)
    })

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) close(input.value)
    })

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onEscape)
        close(null)
      }
    }
    document.addEventListener('keydown', onEscape)

    input.focus()
    input.select()
  })
}

export type VersionPreviewAction = 'rollback' | 'close'

export interface VersionPreviewOptions {
  title: string
  originalContent: string
  diffPatch: string
  isCurrent: boolean
  identicalToCurrent: boolean
  rollbackLabel: string
  closeLabel: string
  contentTabLabel: string
  diffTabLabel: string
  identicalNotice: string
  isCurrentNotice: string
}

export function showVersionPreview(opts: VersionPreviewOptions): Promise<VersionPreviewAction> {
  return new Promise((resolve) => {
    const overlay = createOverlay()
    const card = document.createElement('div')
    card.className = 'modal-card modal-card-lg'

    card.innerHTML = `
      <div class="modal-header">
        <span class="modal-title"></span>
        <button class="modal-close btn-icon" aria-label="${t.modal.close}">${iconX}</button>
      </div>
      <div class="modal-tabs" role="tablist">
        <button class="modal-tab is-active" role="tab" data-tab="content"></button>
        <button class="modal-tab" role="tab" data-tab="diff"></button>
      </div>
      <div class="modal-body modal-body-pane">
        <pre class="preview-pane preview-pane-content"></pre>
        <div class="preview-pane preview-pane-diff" hidden></div>
      </div>
      <div class="modal-footer"></div>
    `

    querySelectorRequired<HTMLSpanElement>(card, '.modal-title').textContent = opts.title
    const contentTab = querySelectorRequired<HTMLButtonElement>(card, '[data-tab="content"]')
    const diffTab = querySelectorRequired<HTMLButtonElement>(card, '[data-tab="diff"]')
    contentTab.textContent = opts.contentTabLabel
    diffTab.textContent = opts.diffTabLabel

    const contentPane = querySelectorRequired<HTMLPreElement>(card, '.preview-pane-content')
    contentPane.textContent = opts.originalContent

    const diffPane = querySelectorRequired<HTMLDivElement>(card, '.preview-pane-diff')
    if (opts.isCurrent || opts.identicalToCurrent) {
      const notice = document.createElement('div')
      notice.className = 'preview-notice'
      notice.textContent = opts.isCurrent ? opts.isCurrentNotice : opts.identicalNotice
      diffPane.appendChild(notice)
    } else {
      const lines = opts.diffPatch.split('\n')
      for (const line of lines) {
        const span = document.createElement('span')
        span.textContent = line + '\n'
        if (line.startsWith('+') && !line.startsWith('+++')) span.className = 'diff-addition'
        else if (line.startsWith('-') && !line.startsWith('---')) span.className = 'diff-deletion'
        diffPane.appendChild(span)
      }
    }

    const switchTab = (tab: 'content' | 'diff') => {
      contentTab.classList.toggle('is-active', tab === 'content')
      diffTab.classList.toggle('is-active', tab === 'diff')
      contentPane.hidden = tab !== 'content'
      diffPane.hidden = tab !== 'diff'
    }

    contentTab.addEventListener('click', () => switchTab('content'))
    diffTab.addEventListener('click', () => switchTab('diff'))

    const footer = querySelectorRequired<HTMLDivElement>(card, '.modal-footer')

    const closeBtn = document.createElement('button')
    closeBtn.className = 'btn btn-secondary'
    closeBtn.textContent = opts.closeLabel

    const rollbackBtn = document.createElement('button')
    rollbackBtn.className = 'btn btn-primary'
    rollbackBtn.textContent = opts.rollbackLabel
    rollbackBtn.disabled = opts.isCurrent

    footer.append(closeBtn, rollbackBtn)
    overlay.append(card)
    document.body.append(overlay)

    const close = (result: VersionPreviewAction) => {
      document.removeEventListener('keydown', onKey)
      overlay.remove()
      resolve(result)
    }

    closeBtn.addEventListener('click', () => close('close'))
    rollbackBtn.addEventListener('click', () => close('rollback'))
    querySelectorRequired<HTMLButtonElement>(card, '.modal-close').addEventListener('click', () =>
      close('close'),
    )
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close')
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close('close')
    }
    document.addEventListener('keydown', onKey)

    closeBtn.focus()
  })
}
