import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/login.css'
import './styles/editor.css'
import './styles/versions.css'
import './styles/headers.css'
import './styles/responsive.css'
import './styles/sprint2.css'
import { ApiClient, ApiError } from './api'
import { getToken, isAuthenticated, clearToken } from './auth'
import { createLoginPage } from './login'
import { createEditorPage } from './editor'
import { createVersionsPage } from './versions'
import { createHeadersPage } from './headers'
import type { Page } from './page'
import { t } from './i18n'
import { showConfirm, showPrompt } from './modal'
import { showToast } from './toast'
import { iconShield, iconCode, iconClock, iconList, iconLogout, iconMenu } from './icons'
import { getElementById } from './dom'

const app = getElementById<HTMLDivElement>('app')
const selectedSubscriptionKey = 'clash_admin_subscription'
const savedSubscription = localStorage.getItem(selectedSubscriptionKey) || ''
let selectedSubscription = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(savedSubscription)
  ? savedSubscription
  : ''
let api = new ApiClient('', getToken, selectedSubscription)

const layout = `
  <aside class="app-sidebar" id="sidebar">
    <div class="sidebar-brand">
      <span class="brand-icon">${iconShield}</span>
      <span class="brand-text">${t.app.title}</span>
    </div>
    <div class="subscription-picker">
      <label for="subscription-select">${t.subscriptions.label}</label>
      <select id="subscription-select" disabled></select>
      <button id="subscription-add" class="btn btn-secondary btn-sm" disabled>${t.subscriptions.add}</button>
      <button id="subscription-copy" class="btn btn-ghost btn-sm">${t.subscriptions.copy}</button>
      <code id="subscription-path"></code>
    </div>
    <nav class="sidebar-nav">
      <a href="#/editor" class="nav-item" data-target="editor">
        <span class="nav-icon">${iconCode}</span>
        <span>${t.nav.editor}</span>
      </a>
      <a href="#/versions" class="nav-item" data-target="versions">
        <span class="nav-icon">${iconClock}</span>
        <span>${t.nav.versions}</span>
      </a>
      <a href="#/headers" class="nav-item" data-target="headers">
        <span class="nav-icon">${iconList}</span>
        <span>${t.nav.headers}</span>
      </a>
    </nav>
    <div class="sidebar-footer">
      <button class="nav-item" id="logout-btn">
        <span class="nav-icon">${iconLogout}</span>
        <span>${t.app.logout}</span>
      </button>
    </div>
  </aside>
  <div class="app-main">
  <header class="app-header" id="app-header">
    <div class="header-left">
      <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="${t.app.openMenu}" aria-expanded="false">${iconMenu}</button>
      <span class="header-title" id="header-title"></span>
    </div>
    <div class="header-actions" id="header-actions"></div>
  </header>
    <main class="app-content" id="main-content"></main>
  </div>
`

app.innerHTML = layout

const mainContent = getElementById<HTMLElement>('main-content')
const sidebar = getElementById<HTMLElement>('sidebar')
const headerTitle = getElementById<HTMLElement>('header-title')
const logoutBtn = getElementById<HTMLButtonElement>('logout-btn')
const mobileMenuBtn = getElementById<HTMLButtonElement>('mobile-menu-btn')

let backdrop: HTMLDivElement | null = null
let currentPage: Page | null = null
const subscriptionSelect = getElementById<HTMLSelectElement>('subscription-select')
const subscriptionAdd = getElementById<HTMLButtonElement>('subscription-add')
const subscriptionPath = getElementById<HTMLElement>('subscription-path')
let subscriptionsLoaded = false
let subscriptionsLoading = false

const renderSubscriptions = (names: string[]) => {
  const options = [new Option(t.subscriptions.defaultName, '')]
  const allNames = new Set(names)
  if (selectedSubscription) allNames.add(selectedSubscription)
  for (const name of [...allNames].sort()) options.push(new Option(name, name))
  subscriptionSelect.replaceChildren(...options)
  subscriptionSelect.value = selectedSubscription
  subscriptionPath.textContent = api.publicPath
}

const loadSubscriptions = async () => {
  if (subscriptionsLoaded || subscriptionsLoading) return
  subscriptionsLoading = true
  try {
    const subscriptions = await api.listSubscriptions()
    renderSubscriptions(subscriptions.map((item) => item.name))
    subscriptionsLoaded = true
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    subscriptionsLoading = false
    subscriptionSelect.disabled = false
    subscriptionAdd.disabled = false
  }
}

const selectSubscription = (name: string, openEditor = false) => {
  selectedSubscription = name
  localStorage.setItem(selectedSubscriptionKey, name)
  // Each mounted page keeps its own client, including while requests are in flight.
  api = new ApiClient('', getToken, name)
  renderSubscriptions(
    Array.from(subscriptionSelect.options, (option) => option.value).filter(Boolean),
  )
  if (openEditor && window.location.hash !== '#/editor') {
    currentPage?.unmount()
    currentPage = null
    window.location.hash = '#/editor'
  } else {
    router()
  }
}

subscriptionSelect.addEventListener('change', async () => {
  const next = subscriptionSelect.value
  subscriptionSelect.value = selectedSubscription
  if (next === selectedSubscription) return
  subscriptionSelect.disabled = true
  try {
    if (hasUnsavedChanges() && !(await showConfirm(t.app.unsavedLeave))) return
    selectSubscription(next)
  } finally {
    subscriptionSelect.disabled = false
  }
})

subscriptionAdd.addEventListener('click', async () => {
  subscriptionAdd.disabled = true
  try {
    const input = await showPrompt(t.subscriptions.namePrompt, '', t.subscriptions.add)
    if (input === null) return
    const name = input.trim()
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) {
      showToast(t.subscriptions.invalidName, 'error')
      return
    }
    if (hasUnsavedChanges() && !(await showConfirm(t.app.unsavedLeave))) return
    await api.createSubscription(name)
    selectSubscription(name, true)
    showToast(t.subscriptions.created, 'success')
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 409
        ? t.subscriptions.exists
        : error instanceof Error
          ? error.message
          : String(error)
    showToast(message, 'error')
  } finally {
    subscriptionAdd.disabled = false
  }
})

getElementById<HTMLButtonElement>('subscription-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(new URL(api.publicPath, window.location.origin).href)
    showToast(t.subscriptions.copied, 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error')
  }
})

renderSubscriptions([])

logoutBtn.addEventListener('click', async () => {
  if (!(await showConfirm(t.app.logoutConfirm))) return
  try {
    await api.logout()
  } catch {
    clearToken()
  }
  clearToken()
  subscriptionsLoaded = false
  window.location.hash = '#/login'
})

mobileMenuBtn.addEventListener('click', () => {
  const isOpen = sidebar.classList.toggle('sidebar-open')
  mobileMenuBtn.setAttribute('aria-expanded', String(isOpen))
  mobileMenuBtn.setAttribute('aria-label', isOpen ? t.app.closeMenu : t.app.openMenu)
  if (isOpen) {
    backdrop = document.createElement('div')
    backdrop.className = 'sidebar-backdrop'
    backdrop.addEventListener('click', closeSidebar)
    app.appendChild(backdrop)
  } else {
    closeSidebar()
  }
})

function closeSidebar() {
  sidebar.classList.remove('sidebar-open')
  mobileMenuBtn.setAttribute('aria-expanded', 'false')
  mobileMenuBtn.setAttribute('aria-label', t.app.openMenu)
  if (backdrop) {
    backdrop.remove()
    backdrop = null
  }
}

function updateNav(activeId: string) {
  document.querySelectorAll('.nav-item[data-target]').forEach((tab) => {
    tab.classList.toggle('active', tab.getAttribute('data-target') === activeId)
  })
}

function updateHeaderTitle(target: string) {
  const titles: Record<string, string> = {
    editor: t.nav.editor,
    versions: t.nav.versions,
    headers: t.nav.headers,
  }
  headerTitle.textContent = `${titles[target] || ''} · ${selectedSubscription || t.subscriptions.defaultName}`
}

function router() {
  const hash = window.location.hash || '#/editor'
  closeSidebar()

  if (!isAuthenticated() && hash !== '#/login') {
    window.location.hash = '#/login'
    return
  }

  if (hash === '#/login') {
    sidebar.style.display = 'none'
    const header = getElementById<HTMLElement>('app-header')
    header.style.display = 'none'
    mainContent.classList.add('app-content--login')
    currentPage?.unmount()
    const page = createLoginPage()
    page.mount(mainContent, api)
    currentPage = page
    return
  }

  sidebar.style.display = ''
  void loadSubscriptions()
  const header = getElementById<HTMLElement>('app-header')
  header.style.display = ''
  mainContent.classList.remove('app-content--login')

  if (hash === '#/editor' || hash === '#/') {
    updateNav('editor')
    updateHeaderTitle('editor')
    setContentMode('pane')
    currentPage?.unmount()
    const page = createEditorPage()
    page.mount(mainContent, api)
    currentPage = page
  } else if (hash === '#/versions') {
    updateNav('versions')
    updateHeaderTitle('versions')
    setContentMode('flow')
    currentPage?.unmount()
    const page = createVersionsPage()
    page.mount(mainContent, api)
    currentPage = page
  } else if (hash === '#/headers') {
    updateNav('headers')
    updateHeaderTitle('headers')
    setContentMode('flow')
    currentPage?.unmount()
    const page = createHeadersPage()
    page.mount(mainContent, api)
    currentPage = page
  } else {
    window.location.hash = '#/editor'
  }
}

function setContentMode(mode: 'flow' | 'pane'): void {
  mainContent.classList.toggle('app-content--pane', mode === 'pane')
}

/** Check if any page has unsaved changes */
function hasUnsavedChanges(): boolean {
  return currentPage?.isDirty() ?? false
}

let currentHash = window.location.hash || '#/editor'
let pendingNavigation: string | null = null

async function navigateTo(newHash: string): Promise<void> {
  if (newHash === currentHash) return

  if (newHash !== '#/login' && hasUnsavedChanges()) {
    if (!(await showConfirm(t.app.unsavedLeave))) return
  }

  pendingNavigation = newHash
  window.location.hash = newHash
}

window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges()) {
    e.preventDefault()
  }
})

function setupNavigationGuards() {
  document.querySelectorAll<HTMLAnchorElement>('.nav-item[data-target]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      const target = link.getAttribute('data-target')!
      const hashMap: Record<string, string> = {
        editor: '#/editor',
        versions: '#/versions',
        headers: '#/headers',
      }
      navigateTo(hashMap[target] || '#/editor')
    })
  })
}

setupNavigationGuards()

window.addEventListener('hashchange', async () => {
  const newHash = window.location.hash || '#/editor'

  if (pendingNavigation === newHash) {
    pendingNavigation = null
    currentHash = newHash
    router()
    return
  }

  if (newHash !== '#/login' && hasUnsavedChanges()) {
    if (await showConfirm(t.app.unsavedLeave)) {
      currentHash = newHash
      router()
    } else {
      window.location.hash = currentHash
    }
    return
  }

  currentHash = newHash
  router()
})

router()
