import { ApiClient, HeadersConfig } from './api';
import { showToast } from './toast';
import { t } from './i18n';
import { iconSave, iconRefresh, iconPlus, iconTrash } from './icons';
import { getElementById, querySelectorRequired } from './dom';

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

  const list = getElementById<HTMLElement>('headers-list');
  const saveBtn = getElementById<HTMLButtonElement>('headers-save');
  const resetBtn = getElementById<HTMLButtonElement>('headers-reset');
  const addBtn = getElementById<HTMLButtonElement>('headers-add');

  const renderRow = (key = '', val = '') => {
    const row = document.createElement('div');
    row.className = 'header-row';
    
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.value = key;
    keyInput.placeholder = t.headers.keyPlaceholder;
    keyInput.className = 'h-key';

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.value = val;
    valInput.placeholder = t.headers.valuePlaceholder;
    valInput.className = 'h-val';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'h-del';
    delBtn.innerHTML = iconTrash;
    delBtn.setAttribute('aria-label', t.headers.deleteRow);

    const errSpan = document.createElement('span');
    errSpan.className = 'h-err';
    errSpan.textContent = t.headers.invalidFormat;

    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(delBtn);
    row.appendChild(errSpan);
    
    keyInput.addEventListener('blur', () => {
      const valid = /^[a-zA-Z0-9-]+$/.test(keyInput.value);
      if (!valid && keyInput.value) {
        errSpan.style.display = 'block';
      } else {
        errSpan.style.display = 'none';
      }
    });

    delBtn.addEventListener('click', () => row.remove());
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
      const k = querySelectorRequired<HTMLInputElement>(row, '.h-key').value.trim();
      const v = querySelectorRequired<HTMLInputElement>(row, '.h-val').value.trim();
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
