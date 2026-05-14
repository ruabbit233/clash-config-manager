import { ApiClient } from './api'
import { showToast } from './toast'
import * as Diff from 'diff'
import { t } from './i18n'
import { showConfirm, showPrompt } from './modal'
import { iconCompare, iconEdit } from './icons'
import { getElementById } from './dom'

export function renderVersions(container: HTMLElement, api: ApiClient): void {
  container.innerHTML = `
    <div class="versions-page">
      <div class="diff-section">
        <div class="diff-selects">
          <select id="diff-from" class="diff-select">
            <option value="" disabled selected>${t.versions.selectFrom}</option>
          </select>
          <select id="diff-to" class="diff-select">
            <option value="" disabled selected>${t.versions.selectTo}</option>
          </select>
          <button id="diff-btn" class="btn btn-primary">
            ${iconCompare}
            ${t.versions.compare}
          </button>
        </div>
        <div id="diff-output" class="diff-view" hidden></div>
      </div>

      <div class="versions-section">
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>${t.versions.date}</th>
                <th>${t.versions.message}</th>
                <th>${t.versions.hash}</th>
                <th>${t.versions.actions}</th>
              </tr>
            </thead>
            <tbody id="versions-tbody"></tbody>
          </table>
        </div>
        <div class="load-more-wrapper">
          <button id="load-more-btn" class="btn btn-secondary" hidden>${t.versions.loadMore}</button>
        </div>
      </div>
    </div>
  `

  const tbody = getElementById<HTMLElement>('versions-tbody')
  const loadMoreBtn = getElementById<HTMLButtonElement>('load-more-btn')
  const fromSel = getElementById<HTMLSelectElement>('diff-from')
  const toSel = getElementById<HTMLSelectElement>('diff-to')
  const diffBtn = getElementById<HTMLButtonElement>('diff-btn')
  const diffOutput = getElementById<HTMLElement>('diff-output')

  let currentCursor: string | undefined
  const pageSize = 10
  const loadedIds = new Set<string>()

  const loadVersions = async (reset = false) => {
    if (reset) {
      tbody.innerHTML = ''
      currentCursor = undefined
      loadedIds.clear()
      loadMoreBtn.hidden = true
      fromSel.innerHTML = `<option value="" disabled selected>${t.versions.selectFrom}</option>`
      toSel.innerHTML = `<option value="" disabled selected>${t.versions.selectTo}</option>`
    }
    if (!reset && !currentCursor) return
    loadMoreBtn.disabled = true
    try {
      const res = await api.listVersions(pageSize, currentCursor)
      res.keys.forEach((v) => {
        if (loadedIds.has(v.id)) return
        loadedIds.add(v.id)
        const tr = document.createElement('tr')
        const date = new Date(v.createdAt).toLocaleString('zh-CN')
        const shortHash = v.contentHash.substring(0, 8)

        const tdDate = document.createElement('td')
        tdDate.textContent = date

        const tdMessage = document.createElement('td')
        tdMessage.textContent = v.message || '-'

        const tdHash = document.createElement('td')
        const spanHash = document.createElement('span')
        spanHash.className = 'mono'
        spanHash.textContent = shortHash
        tdHash.appendChild(spanHash)

        const tdAction = document.createElement('td')
        tdAction.className = 'version-actions'

        const editBtn = document.createElement('button')
        editBtn.className = 'btn btn-secondary btn-sm edit-msg-btn'
        editBtn.setAttribute('data-id', v.id)
        editBtn.innerHTML = `${iconEdit} ${t.versions.editMessage}`

        const btn = document.createElement('button')
        btn.className = 'btn btn-secondary btn-sm rollback-btn'
        btn.setAttribute('data-id', v.id)
        btn.textContent = t.versions.rollback
        tdAction.appendChild(editBtn)
        tdAction.appendChild(btn)

        tr.appendChild(tdDate)
        tr.appendChild(tdMessage)
        tr.appendChild(tdHash)
        tr.appendChild(tdAction)

        tbody.appendChild(tr)
        ;[fromSel, toSel].forEach((sel) => {
          const opt = document.createElement('option')
          opt.value = v.id
          opt.textContent = `${date} - ${shortHash}`
          sel.appendChild(opt.cloneNode(true))
        })

        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id')!
          if (await showConfirm(t.versions.rollbackConfirm(id.substring(0, 8)))) {
            try {
              await api.rollbackVersion(id)
              showToast(t.versions.rollbackSuccess, 'success')
              loadVersions(true)
            } catch (err: unknown) {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            }
          }
        })

        editBtn.addEventListener('click', async () => {
          const id = editBtn.getAttribute('data-id')!
          const newMsg = await showPrompt(
            t.versions.editMessagePrompt,
            v.message,
            t.versions.editMessageLabel,
          )
          if (newMsg !== null && newMsg !== v.message) {
            try {
              await api.updateVersionMessage(id, newMsg)
              tdMessage.textContent = newMsg || '-'
              v.message = newMsg
              showToast(t.versions.editMessageSuccess, 'success')
            } catch (err: unknown) {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            }
          }
        })
      })

      const nextCursor = res.cursor
      const cursorAdvanced = Boolean(nextCursor) && nextCursor !== currentCursor
      currentCursor = cursorAdvanced ? nextCursor : undefined
      loadMoreBtn.hidden = !currentCursor
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      loadMoreBtn.disabled = false
    }
  }

  loadMoreBtn.addEventListener('click', () => loadVersions(false))

  diffBtn.addEventListener('click', async () => {
    const fromId = fromSel.value
    const toId = toSel.value
    if (!fromId || !toId) return

    diffBtn.disabled = true
    diffOutput.hidden = false
    diffOutput.innerHTML = `<div class="spinner"></div> ${t.versions.loading}`
    try {
      const [fromSnap, toSnap] = await Promise.all([api.getVersion(fromId), api.getVersion(toId)])
      const patch = Diff.createPatch('config.yaml', fromSnap.content, toSnap.content)

      diffOutput.innerHTML = ''
      const lines = patch.split('\n')
      lines.forEach((line) => {
        const span = document.createElement('span')
        span.textContent = line + '\n'
        if (line.startsWith('+') && !line.startsWith('+++')) span.className = 'diff-addition'
        else if (line.startsWith('-') && !line.startsWith('---')) span.className = 'diff-deletion'
        diffOutput.appendChild(span)
      })
    } catch (e: unknown) {
      diffOutput.textContent = `${t.versions.error}${e instanceof Error ? e.message : String(e)}`
    } finally {
      diffBtn.disabled = false
    }
  })

  loadVersions(true)
}
