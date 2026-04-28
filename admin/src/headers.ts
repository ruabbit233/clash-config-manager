import { ApiClient, HeadersConfig } from './api';
import { showToast } from './toast';

export function renderHeaders(container: HTMLElement, api: ApiClient): void {
  container.innerHTML = `
    <div style="margin-bottom: 1rem;">
      <button id="headers-save">Save</button>
      <button id="headers-reset" class="btn-secondary">Reset</button>
      <button id="headers-add" class="btn-secondary">+</button>
    </div>
    <div id="headers-list"></div>
  `;

  const list = document.getElementById('headers-list') as HTMLElement;
  const saveBtn = document.getElementById('headers-save') as HTMLButtonElement;
  const resetBtn = document.getElementById('headers-reset') as HTMLButtonElement;
  const addBtn = document.getElementById('headers-add') as HTMLButtonElement;

  const renderRow = (key = '', val = '') => {
    const row = document.createElement('div');
    row.className = 'header-row';
    row.innerHTML = `
      <input type="text" value="${key}" placeholder="Header-Name" class="h-key" />
      <input type="text" value="${val}" placeholder="Value" class="h-val" style="flex: 1;" />
      <button class="btn-danger h-del">×</button>
      <span class="h-err" style="color: var(--error); font-size: 0.8rem; display: none;">Invalid format</span>
    `;
    
    const keyInput = row.querySelector('.h-key') as HTMLInputElement;
    const errSpan = row.querySelector('.h-err') as HTMLSpanElement;
    
    keyInput.addEventListener('blur', () => {
      const valid = /^[a-zA-Z0-9-]+$/.test(keyInput.value);
      if (!valid && keyInput.value) {
        errSpan.style.display = 'block';
      } else {
        errSpan.style.display = 'none';
      }
    });

    row.querySelector('.h-del')!.addEventListener('click', () => row.remove());
    list.appendChild(row);
  };

  const loadHeaders = async () => {
    try {
      list.innerHTML = '';
      const headers = await api.getHeaders();
      for (const [k, v] of Object.entries(headers)) {
        renderRow(k, v);
      }
      if (Object.keys(headers).length === 0) renderRow();
    } catch(e: unknown) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  addBtn.addEventListener('click', () => renderRow());

  resetBtn.addEventListener('click', () => loadHeaders());

  saveBtn.addEventListener('click', async () => {
    const config: HeadersConfig = {};
    let hasError = false;
    
    list.querySelectorAll('.header-row').forEach(row => {
      const k = (row.querySelector('.h-key') as HTMLInputElement).value.trim();
      const v = (row.querySelector('.h-val') as HTMLInputElement).value.trim();
      if (k) {
        if (!/^[a-zA-Z0-9-]+$/.test(k)) hasError = true;
        else config[k] = v;
      }
    });

    if (hasError) {
      showToast('Please fix invalid header names', 'error');
      return;
    }

    try {
      saveBtn.disabled = true;
      await api.setHeaders(config);
      showToast('Headers saved successfully', 'success');
    } catch(e: unknown) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  loadHeaders();
}
