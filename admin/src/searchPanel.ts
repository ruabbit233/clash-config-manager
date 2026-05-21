import type { EditorView, Panel } from '@codemirror/view'
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from '@codemirror/search'
import { t } from './i18n'
import {
  iconArrowDown,
  iconArrowUp,
  iconCaseSensitive,
  iconRegex,
  iconReplace,
  iconReplaceAll,
  iconSearch,
  iconWholeWord,
  iconX,
} from './icons'

const MAX_COUNT = 1000

export function createYamlSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div')
  dom.className = 'yaml-search-panel'

  const findRow = document.createElement('div')
  findRow.className = 'yaml-search-row'

  const findFieldWrap = document.createElement('div')
  findFieldWrap.className = 'yaml-search-field'

  const findIcon = document.createElement('span')
  findIcon.className = 'yaml-search-field-icon'
  findIcon.setAttribute('aria-hidden', 'true')
  findIcon.innerHTML = iconSearch

  const findInput = document.createElement('input')
  findInput.type = 'text'
  findInput.className = 'yaml-search-input'
  findInput.placeholder = t.search.findPlaceholder
  findInput.setAttribute('main-field', 'true')
  findInput.setAttribute('aria-label', t.search.findPlaceholder)

  const counter = document.createElement('span')
  counter.className = 'yaml-search-counter'

  const optionsGroup = document.createElement('div')
  optionsGroup.className = 'yaml-search-options'

  const caseBtn = makeToggle(iconCaseSensitive, t.search.caseSensitive)
  const wordBtn = makeToggle(iconWholeWord, t.search.wholeWord)
  const regexBtn = makeToggle(iconRegex, t.search.regex)
  optionsGroup.append(caseBtn.el, wordBtn.el, regexBtn.el)

  findFieldWrap.append(findIcon, findInput, counter, optionsGroup)

  const navGroup = document.createElement('div')
  navGroup.className = 'yaml-search-nav'

  const prevBtn = makeIconBtn(iconArrowUp, t.search.prev)
  const nextBtn = makeIconBtn(iconArrowDown, t.search.next)
  const closeBtn = makeIconBtn(iconX, t.search.close)
  closeBtn.classList.add('yaml-search-close')
  navGroup.append(prevBtn, nextBtn, closeBtn)

  findRow.append(findFieldWrap, navGroup)

  const replaceRow = document.createElement('div')
  replaceRow.className = 'yaml-search-row yaml-search-row-replace'

  const replaceFieldWrap = document.createElement('div')
  replaceFieldWrap.className = 'yaml-search-field'

  const replaceIcon = document.createElement('span')
  replaceIcon.className = 'yaml-search-field-icon'
  replaceIcon.setAttribute('aria-hidden', 'true')
  replaceIcon.innerHTML = iconReplace

  const replaceInput = document.createElement('input')
  replaceInput.type = 'text'
  replaceInput.className = 'yaml-search-input'
  replaceInput.placeholder = t.search.replacePlaceholder
  replaceInput.setAttribute('aria-label', t.search.replacePlaceholder)

  replaceFieldWrap.append(replaceIcon, replaceInput)

  const replaceActions = document.createElement('div')
  replaceActions.className = 'yaml-search-nav'

  const replaceOneBtn = makeIconBtn(iconReplace, t.search.replace)
  const replaceAllBtn = makeIconBtn(iconReplaceAll, t.search.replaceAll)
  replaceActions.append(replaceOneBtn, replaceAllBtn)

  replaceRow.append(replaceFieldWrap, replaceActions)

  dom.append(findRow, replaceRow)

  let currentValid = true
  let suppressUpdate = false

  const buildQuery = (): SearchQuery =>
    new SearchQuery({
      search: findInput.value,
      caseSensitive: caseBtn.pressed,
      wholeWord: wordBtn.pressed,
      regexp: regexBtn.pressed,
      replace: replaceInput.value,
    })

  const commitQuery = () => {
    const query = buildQuery()
    currentValid = query.valid || query.search.length === 0
    suppressUpdate = true
    view.dispatch({ effects: setSearchQuery.of(query) })
    suppressUpdate = false
    refreshCounter(query)
    findInput.classList.toggle('is-invalid', !currentValid)
  }

  const refreshCounter = (query: SearchQuery) => {
    if (query.search.length === 0) {
      counter.textContent = ''
      counter.classList.remove('is-empty', 'is-invalid')
      return
    }
    if (!query.valid) {
      counter.textContent = t.search.invalidRegex
      counter.classList.remove('is-empty')
      counter.classList.add('is-invalid')
      return
    }

    const { total, currentIndex } = countMatches(view, query)
    counter.classList.remove('is-invalid')

    if (total === 0) {
      counter.textContent = t.search.noResults
      counter.classList.add('is-empty')
      return
    }
    counter.classList.remove('is-empty')
    counter.textContent = t.search.matchCount({
      index: currentIndex >= 0 ? currentIndex + 1 : 1,
      total,
    })
  }

  findInput.addEventListener('input', commitQuery)
  replaceInput.addEventListener('input', commitQuery)

  const runCommand = (cmd: (v: EditorView) => boolean) => {
    if (!currentValid || findInput.value.length === 0) return
    cmd(view)
  }

  prevBtn.addEventListener('click', () => runCommand(findPrevious))
  nextBtn.addEventListener('click', () => runCommand(findNext))
  caseBtn.el.addEventListener('click', () => {
    caseBtn.toggle()
    commitQuery()
  })
  wordBtn.el.addEventListener('click', () => {
    wordBtn.toggle()
    commitQuery()
  })
  regexBtn.el.addEventListener('click', () => {
    regexBtn.toggle()
    commitQuery()
  })

  replaceOneBtn.addEventListener('click', () => runCommand(replaceNext))
  replaceAllBtn.addEventListener('click', () => runCommand(replaceAll))

  closeBtn.addEventListener('click', () => closeSearchPanel(view))

  dom.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearchPanel(view)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.target === replaceInput) {
        runCommand(replaceNext)
      } else if (e.shiftKey) {
        runCommand(findPrevious)
      } else {
        runCommand(findNext)
      }
    }
  })

  dom.addEventListener('mousedown', (e) => {
    e.stopPropagation()
  })

  const handleOutsideClick = (e: MouseEvent) => {
    const target = e.target as Node | null
    if (!target) return
    if (dom.contains(target)) return
    if (view.dom.contains(target)) {
      closeSearchPanel(view)
    }
  }
  view.dom.addEventListener('mousedown', handleOutsideClick)

  return {
    dom,
    top: true,
    mount() {
      const initial = getSearchQuery(view.state)
      caseBtn.set(initial.caseSensitive)
      wordBtn.set(initial.wholeWord)
      regexBtn.set(initial.regexp)
      findInput.value = initial.search
      replaceInput.value = initial.replace
      refreshCounter(initial)
      findInput.focus()
      findInput.select()
    },
    update(update) {
      if (suppressUpdate) return
      const query = getSearchQuery(update.state)
      const prevQuery = getSearchQuery(update.startState)
      if (
        update.docChanged ||
        update.selectionSet ||
        query.search !== prevQuery.search ||
        query.caseSensitive !== prevQuery.caseSensitive ||
        query.wholeWord !== prevQuery.wholeWord ||
        query.regexp !== prevQuery.regexp ||
        query.replace !== prevQuery.replace
      ) {
        if (query.search !== findInput.value) findInput.value = query.search
        if (query.replace !== replaceInput.value) replaceInput.value = query.replace
        if (query.caseSensitive !== caseBtn.pressed) caseBtn.set(query.caseSensitive)
        if (query.wholeWord !== wordBtn.pressed) wordBtn.set(query.wholeWord)
        if (query.regexp !== regexBtn.pressed) regexBtn.set(query.regexp)
        refreshCounter(query)
      }
    },
    destroy() {
      view.dom.removeEventListener('mousedown', handleOutsideClick)
    },
  }
}

function makeIconBtn(svg: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'yaml-search-btn'
  btn.setAttribute('aria-label', label)
  btn.title = label
  btn.innerHTML = svg
  return btn
}

interface ToggleControl {
  el: HTMLButtonElement
  pressed: boolean
  toggle(): void
  set(value: boolean): void
}

function makeToggle(svg: string, label: string): ToggleControl {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'yaml-search-toggle'
  el.setAttribute('aria-pressed', 'false')
  el.setAttribute('aria-label', label)
  el.title = label
  el.innerHTML = svg

  const control: ToggleControl = {
    el,
    pressed: false,
    toggle() {
      control.pressed = !control.pressed
      el.setAttribute('aria-pressed', String(control.pressed))
      el.classList.toggle('is-active', control.pressed)
    },
    set(value: boolean) {
      control.pressed = value
      el.setAttribute('aria-pressed', String(value))
      el.classList.toggle('is-active', value)
    },
  }
  return control
}

function countMatches(
  view: EditorView,
  query: SearchQuery,
): { total: number; currentIndex: number } {
  if (!query.valid || query.search.length === 0) {
    return { total: 0, currentIndex: -1 }
  }

  const cursor = query.getCursor(view.state) as Iterator<{ from: number; to: number }>
  const selectionFrom = view.state.selection.main.from
  const selectionTo = view.state.selection.main.to

  let total = 0
  let currentIndex = -1

  while (true) {
    const step = cursor.next()
    if (step.done) break
    const { from, to } = step.value
    if (currentIndex === -1 && from === selectionFrom && to === selectionTo) {
      currentIndex = total
    }
    total += 1
    if (total >= MAX_COUNT) break
  }

  return { total, currentIndex }
}
