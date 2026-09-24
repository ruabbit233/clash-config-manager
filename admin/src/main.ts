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
import type { Subscription } from '@shared/types'
import { t } from './i18n'
import { showConfirm, showPrompt, showSubscriptionDialog } from './modal'
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
      <div class="subscription-actions">
        <button id="subscription-add" class="btn btn-secondary btn-sm" disabled>${t.subscriptions.add}</button>
        <button id="subscription-rename" class="btn btn-ghost btn-sm" disabled>${t.subscriptions.rename}</button>
        <button id="subscription-delete" class="btn btn-ghost btn-sm" disabled>${t.subscriptions.delete}</button>
        <button id="subscription-copy" class="btn btn-ghost btn-sm">${t.subscriptions.copy}</button>
      </div>
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
const subscriptionRename = getElementById<HTMLButtonElement>('subscription-rename')
const subscriptionDelete = getElementById<HTMLButtonElement>('subscription-delete')
const subscriptionPath = getElementById<HTMLElement>('subscription-path')
let subscriptionsLoaded = false
let subscriptionsLoading = false
let subscriptionBusy = false
const subscriptions = new Map<string, Subscription>()

const selectedSubscriptionName = () =>
  subscriptions.get(selectedSubscription)?.name ||
  selectedSubscription ||
  t.subscriptions.defaultName

const updateSubscriptionControls = () => {
  const disabled = subscriptionBusy || subscriptionsLoading
  subscriptionSelect.disabled = disabled
  subscriptionAdd.disabled = disabled
  subscriptionRename.disabled = disabled || !selectedSubscription
  subscriptionDelete.disabled = disabled || !selectedSubscription
}

const renderSubscriptions = () => {
  const options = [new Option(t.subscriptions.defaultName, '')]
  const items = [...subscriptions.values()].sort((a, b) => a.name.localeCompare(b.name))
  for (const item of items) options.push(new Option(`${item.name} · ${item.path}`, item.path))
  if (selectedSubscription && !subscriptions.has(selectedSubscription)) {
    options.push(new Option(selectedSubscription, selectedSubscription))
  }
  subscriptionSelect.replaceChildren(...options)
  subscriptionSelect.value = selectedSubscription
  subscriptionPath.textContent = api.publicPath
  updateSubscriptionControls()
  const target = window.location.hash.slice(2) || 'editor'
  updateHeaderTitle(target)
}

const loadSubscriptions = async () => {
  if (subscriptionsLoaded || subscriptionsLoading) return
  subscriptionsLoading = true
  updateSubscriptionControls()
  try {
    const items = await api.listSubscriptions()
    subscriptions.clear()
    for (const item of items) subscriptions.set(item.path, item)
    subscriptionsLoaded = true
    if (selectedSubscription && !subscriptions.has(selectedSubscription) && !hasUnsavedChanges()) {
      selectSubscription('')
    } else {
      renderSubscriptions()
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    subscriptionsLoading = false
    updateSubscriptionControls()
  }
}

const selectSubscription = (path: string, openEditor = false) => {
  selectedSubscription = path
  localStorage.setItem(selectedSubscriptionKey, path)
  // Each mounted page keeps its own client, including while requests are in flight.
  api = new ApiClient('', getToken, path)
  renderSubscriptions()
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
  if (next === selectedSubscription || subscriptionBusy) return
  subscriptionBusy = true
  updateSubscriptionControls()
  try {
    if (hasUnsavedChanges() && !(await showConfirm(t.app.unsavedLeave))) return
    selectSubscription(next)
  } finally {
    subscriptionBusy = false
    updateSubscriptionControls()
  }
})

subscriptionAdd.addEventListener('click', async () => {
  if (subscriptionBusy) return
  subscriptionBusy = true
  updateSubscriptionControls()
  try {
    const input = await showSubscriptionDialog()
    if (!input) return
    if (hasUnsavedChanges() && !(await showConfirm(t.app.unsavedLeave))) return
    const item = await api.createSubscription(input.name, input.path)
    subscriptions.set(item.path, item)
    selectSubscription(item.path, true)
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
    subscriptionBusy = false
    updateSubscriptionControls()
  }
})

subscriptionRename.addEventListener('click', async () => {
  if (!selectedSubscription || subscriptionBusy) return
  const client = api
  const name = selectedSubscriptionName()
  subscriptionBusy = true
  updateSubscriptionControls()
  try {
    const input = await showPrompt(t.subscriptions.renamePrompt, name, t.subscriptions.rename)
    if (input === null || input.trim() === name) return
    if (!input.trim() || input.trim().length > 128 || /\p{Cc}/u.test(input)) {
      showToast(t.subscriptions.invalidName, 'error')
      return
    }
    const item = await client.renameSubscription(input.trim())
    subscriptions.set(item.path, item)
    // Renaming leaves the mounted editor and any unsaved changes intact.
    renderSubscriptions()
    showToast(t.subscriptions.renamed, 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    subscriptionBusy = false
    updateSubscriptionControls()
  }
})

subscriptionDelete.addEventListener('click', async () => {
  if (!selectedSubscription || subscriptionBusy) return
  const client = api
  const path = selectedSubscription
  const name = selectedSubscriptionName()
  subscriptionBusy = true
  updateSubscriptionControls()
  try {
    if (!(await showConfirm(t.subscriptions.deleteConfirm({ name, path })))) return
    mainContent.inert = true
    await client.deleteSubscription()
    if (selectedSubscription === path) {
      currentPage?.unmount()
      currentPage = null
      selectSubscription('')
    }
    subscriptions.delete(path)
    localStorage.removeItem(`clash_admin_draft:${path}`)
    localStorage.removeItem(`clash_admin_draft_meta:${path}`)
    renderSubscriptions()
    showToast(t.subscriptions.deleted, 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    mainContent.inert = false
    subscriptionBusy = false
    updateSubscriptionControls()
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

renderSubscriptions()

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
  headerTitle.textContent = `${titles[target] || ''} · ${selectedSubscriptionName()}`
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
