import './style.css';
import { ApiClient } from './api';
import { getToken, isAuthenticated, clearToken } from './auth';
import { renderLogin } from './login';
import { renderEditor } from './editor';
import { renderVersions } from './versions';
import { renderHeaders } from './headers';

const app = document.getElementById('app')!;
const api = new ApiClient('', getToken);

const layout = `
  <header class="app-header">
    <div class="app-title">Clash Config Manager</div>
    <div id="user-info" style="display: none;">
      <button id="logout-btn" class="btn-secondary">Logout</button>
    </div>
  </header>
  <nav class="nav-tabs" id="nav-tabs" style="display: none;">
    <a href="#/editor" class="nav-tab" data-target="editor">Editor</a>
    <a href="#/versions" class="nav-tab" data-target="versions">Versions</a>
    <a href="#/headers" class="nav-tab" data-target="headers">Headers</a>
  </nav>
  <main class="main-content" id="main-content"></main>
`;

app.innerHTML = layout;
const mainContent = document.getElementById('main-content')!;
const navTabs = document.getElementById('nav-tabs')!;
const userInfo = document.getElementById('user-info')!;
const logoutBtn = document.getElementById('logout-btn')!;

logoutBtn.addEventListener('click', () => {
  clearToken();
  window.location.hash = '#/login';
});

function updateNav(activeId: string) {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-target') === activeId);
  });
}

function router() {
  const hash = window.location.hash || '#/editor';
  
  if (!isAuthenticated() && hash !== '#/login') {
    window.location.hash = '#/login';
    return;
  }

  if (hash === '#/login') {
    navTabs.style.display = 'none';
    userInfo.style.display = 'none';
    renderLogin(mainContent, api);
    return;
  }

  navTabs.style.display = 'flex';
  userInfo.style.display = 'block';

  if (hash === '#/editor' || hash === '#/') {
    updateNav('editor');
    renderEditor(mainContent, api);
  } else if (hash === '#/versions') {
    updateNav('versions');
    renderVersions(mainContent, api);
  } else if (hash === '#/headers') {
    updateNav('headers');
    renderHeaders(mainContent, api);
  } else {
    window.location.hash = '#/editor';
  }
}

window.addEventListener('hashchange', router);
router();
