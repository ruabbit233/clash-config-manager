import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/login.css'
import './styles/editor.css'
import './styles/versions.css'
import './styles/headers.css'
import './styles/responsive.css'
import { ApiClient } from './api'
import { getToken, isAuthenticated, clearToken } from './auth'
import { createLoginPage } from './login'
import { createEditorPage } from './editor'
import { createVersionsPage } from './versions'
import { createHeadersPage } from './headers'
import type { Page } from './page'
import { t } from './i18n'
import { showConfirm } from './modal'
import { iconShield, iconCode, iconClock, iconList, iconLogout, iconMenu } from './icons'
import { getElementById } from './dom'

const app = getElementById<HTMLDivElement>('app')
const api = new ApiClient('', getToken)

const layout = `
  <aside class="app-sidebar" id="sidebar">
    <div class="sidebar-brand">
      <span class="brand-icon">${iconShield}</span>
      <span class="brand-text">${t.app.title}</span>
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

logoutBtn.addEventListener('click', async () => {
  if (!(await showConfirm(t.app.logoutConfirm))) return
  try {
    await api.logout()
  } catch {
    clearToken()
  }
  clearToken()
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
  headerTitle.textContent = titles[target] || ''
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
    currentPage?.unmount()
    const page = createLoginPage()
    page.mount(mainContent, api)
    currentPage = page
    return
  }

  sidebar.style.display = ''
  const header = getElementById<HTMLElement>('app-header')
  header.style.display = ''

  if (hash === '#/editor' || hash === '#/') {
    updateNav('editor')
    updateHeaderTitle('editor')
    currentPage?.unmount()
    const page = createEditorPage()
    page.mount(mainContent, api)
    currentPage = page
  } else if (hash === '#/versions') {
    updateNav('versions')
    updateHeaderTitle('versions')
    currentPage?.unmount()
    const page = createVersionsPage()
    page.mount(mainContent, api)
    currentPage = page
  } else if (hash === '#/headers') {
    updateNav('headers')
    updateHeaderTitle('headers')
    currentPage?.unmount()
    const page = createHeadersPage()
    page.mount(mainContent, api)
    currentPage = page
  } else {
    window.location.hash = '#/editor'
  }
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
