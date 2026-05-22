import { ApiClient, ApiError } from './api'
import { showToast } from './toast'
import { t } from './i18n'
import { showConfirm, showPrompt, showVersionPreview } from './modal'
import { renderMergeView } from './mergeView'
import { formatRelativeTime, formatAbsoluteTime } from './timeFormat'
import { iconCompare, iconEdit, iconEye, iconTrash, iconSearch, iconClockArrow } from './icons'
import { getElementById } from './dom'
import type { VersionListItem } from '@shared/types'
import type { Page } from './page'

const RELATIVE_TIME_REFRESH_MS = 30_000

export function createVersionsPage(): Page {
  return {
    mount(container: HTMLElement, api: ApiClient): void {
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
      </div>

      <div class="versions-section">
        <div class="versions-toolbar">
          <div class="versions-search">
            <span class="versions-search-icon">${iconSearch}</span>
            <input id="versions-search" class="versions-search-input" type="text" placeholder="${t.versions.searchPlaceholder}" />
          </div>
          <button id="time-format-toggle" class="btn btn-ghost btn-sm" title="${t.versions.timeAbsoluteToggle}">
            ${iconClockArrow}
            <span id="time-format-label">${t.versions.timeAbsoluteToggle}</span>
          </button>
        </div>
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
          <div id="versions-empty" class="versions-empty" hidden>${t.versions.filterEmpty}</div>
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
      const searchInput = getElementById<HTMLInputElement>('versions-search')
      const timeToggle = getElementById<HTMLButtonElement>('time-format-toggle')
      const emptyHint = getElementById<HTMLDivElement>('versions-empty')

      let currentCursor: string | undefined
      const pageSize = 10
      const loadedItems: VersionListItem[] = []
      const loadedIds = new Set<string>()
      const dateCells = new Map<string, HTMLTableCellElement>()
      let useRelativeTime = true
      let filterText = ''
      let timeRefreshInterval: number | undefined

      const matchesFilter = (v: VersionListItem): boolean => {
        if (filterText.length === 0) return true
        const q = filterText.toLowerCase()
        return v.message.toLowerCase().includes(q) || v.contentHash.toLowerCase().includes(q)
      }

      const formatDate = (iso: string): string => {
        const d = new Date(iso)
        return useRelativeTime ? formatRelativeTime(d) : formatAbsoluteTime(d)
      }

      const refreshAllDates = (): void => {
        for (const v of loadedItems) {
          const cell = dateCells.get(v.id)
          if (cell) cell.textContent = formatDate(v.createdAt)
        }
      }

      const renderEmpty = (): void => {
        const visibleRows = tbody.querySelectorAll<HTMLTableRowElement>('tr:not(.is-hidden)').length
        emptyHint.hidden = visibleRows > 0
      }

      const applyFilter = (): void => {
        for (const v of loadedItems) {
          const cell = dateCells.get(v.id)
          if (!cell) continue
          const tr = cell.closest('tr')
          if (!tr) continue
          tr.classList.toggle('is-hidden', !matchesFilter(v))
        }
        renderEmpty()
      }

      const refreshSelectOptions = (): void => {
        const visible = loadedItems.filter(matchesFilter)
        const populate = (sel: HTMLSelectElement, placeholder: string): void => {
          const previous = sel.value
          sel.innerHTML = `<option value="" disabled ${previous ? '' : 'selected'}>${placeholder}</option>`
          for (const v of visible) {
            const opt = document.createElement('option')
            opt.value = v.id
            opt.textContent =
              `${formatDate(v.createdAt)} - ${v.contentHash.substring(0, 8)} ${v.message ? '· ' + v.message : ''}`.trim()
            if (v.id === previous) opt.selected = true
            sel.appendChild(opt)
          }
        }
        populate(fromSel, t.versions.selectFrom)
        populate(toSel, t.versions.selectTo)
      }

      const buildRow = (v: VersionListItem): HTMLTableRowElement => {
        const tr = document.createElement('tr')
        const shortHash = v.contentHash.substring(0, 8)

        const tdDate = document.createElement('td')
        tdDate.textContent = formatDate(v.createdAt)
        tdDate.title = formatAbsoluteTime(new Date(v.createdAt))
        dateCells.set(v.id, tdDate)

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
        editBtn.innerHTML = `${iconEdit} ${t.versions.editMessage}`

        const previewBtn = document.createElement('button')
        previewBtn.className = 'btn btn-secondary btn-sm preview-btn'
        previewBtn.innerHTML = `${iconEye} ${t.versions.preview}`

        const rollbackBtn = document.createElement('button')
        rollbackBtn.className = 'btn btn-secondary btn-sm rollback-btn'
        rollbackBtn.textContent = t.versions.rollback

        const deleteBtn = document.createElement('button')
        deleteBtn.className = 'btn btn-danger btn-sm delete-version-btn'
        deleteBtn.innerHTML = `${iconTrash} ${t.versions.delete}`

        tdAction.append(editBtn, previewBtn, rollbackBtn, deleteBtn)
        tr.append(tdDate, tdMessage, tdHash, tdAction)

        rollbackBtn.addEventListener('click', async () => {
          if (await confirmRollback(v.id)) {
            try {
              await api.rollbackVersion(v.id)
              showToast(t.versions.rollbackSuccess, 'success')
              loadVersions(true)
            } catch (err: unknown) {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            }
          }
        })

        editBtn.addEventListener('click', async () => {
          const newMsg = await showPrompt(
            t.versions.editMessagePrompt,
            v.message,
            t.versions.editMessageLabel,
          )
          if (newMsg !== null && newMsg !== v.message) {
            try {
              await api.updateVersionMessage(v.id, newMsg)
              tdMessage.textContent = newMsg || '-'
              v.message = newMsg
              refreshSelectOptions()
              showToast(t.versions.editMessageSuccess, 'success')
            } catch (err: unknown) {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            }
          }
        })

        deleteBtn.addEventListener('click', async () => {
          if (await showConfirm(t.versions.deleteConfirm({ id: v.id.substring(0, 8) }))) {
            try {
              await api.deleteVersion(v.id)
              showToast(t.versions.deleteSuccess, 'success')
              loadVersions(true)
            } catch (err: unknown) {
              const msg =
                err instanceof ApiError && err.code === 'is_current'
                  ? t.versions.deleteCurrentForbidden
                  : err instanceof Error
                    ? err.message
                    : String(err)
              showToast(msg, 'error')
            }
          }
        })

        previewBtn.addEventListener('click', async () => {
          previewBtn.disabled = true
          try {
            const [snapshot, current] = await Promise.all([api.getVersion(v.id), api.getConfig()])
            const isCurrent = current.versionId === v.id
            const identicalToCurrent = !isCurrent && current.content === snapshot.content
            const diffPatch = ''

            const action = await showVersionPreview({
              title: t.versions.previewTitle({ id: v.id.substring(0, 8) }),
              originalContent: snapshot.content,
              diffPatch,
              isCurrent,
              identicalToCurrent,
              rollbackLabel: t.versions.rollback,
              closeLabel: t.versions.previewClose,
              contentTabLabel: t.versions.previewTabContent,
              diffTabLabel: t.versions.previewTabDiff,
              identicalNotice: t.versions.previewIdenticalToCurrent,
              isCurrentNotice: t.versions.previewIsCurrent,
            })

            if (action === 'rollback') {
              if (await confirmRollback(v.id)) {
                try {
                  await api.rollbackVersion(v.id)
                  showToast(t.versions.rollbackSuccess, 'success')
                  loadVersions(true)
                } catch (err: unknown) {
                  showToast(err instanceof Error ? err.message : String(err), 'error')
                }
              }
            }
          } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : String(err), 'error')
          } finally {
            previewBtn.disabled = false
          }
        })

        return tr
      }

      const confirmRollback = async (id: string): Promise<boolean> => {
        return showConfirm(t.versions.rollbackConfirm({ id: id.substring(0, 8) }))
      }

      const renderSkeleton = (count: number): void => {
        for (let i = 0; i < count; i += 1) {
          const tr = document.createElement('tr')
          tr.className = 'versions-skeleton-row'
          for (let c = 0; c < 4; c += 1) {
            const td = document.createElement('td')
            const sk = document.createElement('span')
            sk.className = 'skeleton skeleton-line'
            td.appendChild(sk)
            tr.appendChild(td)
          }
          tbody.appendChild(tr)
        }
      }

      const removeSkeletons = (): void => {
        tbody.querySelectorAll('.versions-skeleton-row').forEach((el) => el.remove())
      }

      const loadVersions = async (reset = false): Promise<void> => {
        if (reset) {
          tbody.innerHTML = ''
          loadedItems.length = 0
          loadedIds.clear()
          dateCells.clear()
          currentCursor = undefined
          loadMoreBtn.hidden = true
          renderSkeleton(5)
        }
        if (!reset && !currentCursor) return
        loadMoreBtn.disabled = true
        try {
          const res = await api.listVersions(pageSize, currentCursor)
          if (reset) removeSkeletons()
          for (const v of res.keys) {
            if (loadedIds.has(v.id)) continue
            loadedIds.add(v.id)
            loadedItems.push(v)
            const tr = buildRow(v)
            if (!matchesFilter(v)) tr.classList.add('is-hidden')
            tbody.appendChild(tr)
          }

          const nextCursor = res.cursor
          const cursorAdvanced = Boolean(nextCursor) && nextCursor !== currentCursor
          currentCursor = cursorAdvanced ? nextCursor : undefined
          loadMoreBtn.hidden = !currentCursor

          refreshSelectOptions()
          renderEmpty()
        } catch (e: unknown) {
          if (reset) removeSkeletons()
          showToast(e instanceof Error ? e.message : String(e), 'error')
        } finally {
          loadMoreBtn.disabled = false
        }
      }

      loadMoreBtn.addEventListener('click', () => loadVersions(false))

      searchInput.addEventListener('input', () => {
        filterText = searchInput.value.trim()
        applyFilter()
        refreshSelectOptions()
      })

      timeToggle.addEventListener('click', () => {
        useRelativeTime = !useRelativeTime
        refreshAllDates()
        refreshSelectOptions()
      })

      diffBtn.addEventListener('click', async () => {
        const fromId = fromSel.value
        const toId = toSel.value
        if (!fromId || !toId) return
        if (fromId === toId) {
          showToast(t.versions.sameVersionWarning, 'error')
          return
        }

        diffBtn.disabled = true
        try {
          const [fromSnap, toSnap] = await Promise.all([
            api.getVersion(fromId),
            api.getVersion(toId),
          ])
          if (fromSnap.content === toSnap.content) {
            showToast(t.versions.diffEmpty, 'info')
            return
          }
          const fromDate = formatAbsoluteTime(new Date(fromSnap.createdAt))
          const toDate = formatAbsoluteTime(new Date(toSnap.createdAt))
          renderMergeView({
            title: t.versions.compare,
            leftLabel: `${fromDate} - ${fromSnap.contentHash.substring(0, 8)}`,
            rightLabel: `${toDate} - ${toSnap.contentHash.substring(0, 8)}`,
            leftContent: fromSnap.content,
            rightContent: toSnap.content,
          })
        } catch (e: unknown) {
          showToast(`${t.versions.error}${e instanceof Error ? e.message : String(e)}`, 'error')
        } finally {
          diffBtn.disabled = false
        }
      })

      loadVersions(true)

      timeRefreshInterval = window.setInterval(() => {
        if (useRelativeTime) refreshAllDates()
      }, RELATIVE_TIME_REFRESH_MS)
      ;(this as unknown as { __cleanup?: () => void }).__cleanup = () => {
        if (timeRefreshInterval !== undefined) {
          window.clearInterval(timeRefreshInterval)
          timeRefreshInterval = undefined
        }
      }
    },
    unmount(): void {
      const cleanup = (this as unknown as { __cleanup?: () => void }).__cleanup
      if (cleanup) cleanup()
    },
    isDirty(): boolean {
      return false
    },
  }
}
