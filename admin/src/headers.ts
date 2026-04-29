import { ApiClient, HeadersConfig } from './api';
import { showToast } from './toast';
import { t } from './i18n';
import { iconSave, iconRefresh, iconPlus, iconTrash } from './icons';

export function renderHeaders(container: HTMLElement, api: ApiClient): void {
  container.innerHTML = `
    <div class="headers-page">
      <div class="headers-toolbar">
        <button id="headers-save" class="btn btn-primary">${iconSave} ${t.headers.save}</button>
        <button id="headers-reset" class="btn btn-secondary">${iconRefresh} ${t.headers.reset}</button>
        <button id="headers-add" class="btn btn-secondary">${iconPlus} ${t.headers.add}</button>
      </div>
      <div class="headers-card" id="headers-list"></div>
    </div>
  `;

  const list = document.getElementById('headers-list') as HTMLElement;
  const saveBtn = document.getElementById('headers-save') as HTMLButtonElement;
  const resetBtn = document.getElementById('headers-reset') as HTMLButtonElement;
  const addBtn = document.getElementById('headers-add') as HTMLButtonElement;

  const renderRow = (key = '', val = '') => {
    const row = document.createElement('div');
    row.className = 'header-row';
    row.innerHTML = `
      <input type="text" value="${key}" placeholder="${t.headers.keyPlaceholder}" class="h-key" />
      <input type="text" value="${val}" placeholder="${t.headers.valuePlaceholder}" class="h-val" />
      <button class="h-del">${iconTrash}</button>
      <span class="h-err">${t.headers.invalidFormat}</span>
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
      showToast(t.headers.fixInvalid, 'error');
      return;
    }

    try {
      saveBtn.disabled = true;
      await api.setHeaders(config);
      showToast(t.headers.saved, 'success');
    } catch(e: unknown) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  loadHeaders();
}
