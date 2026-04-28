import { ApiClient } from './api';
import { AuthError } from './auth';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import * as yamlParser from 'yaml';
import { showToast } from './toast';

export function renderEditor(container: HTMLElement, api: ApiClient, onSaved?: () => void): void {
  container.innerHTML = `
    <div class="editor-toolbar">
      <button id="editor-save">Save</button>
      <button id="editor-reset" class="btn-secondary">Reset</button>
      <button id="editor-download" class="btn-secondary">Download</button>
      <span id="editor-status"></span>
    </div>
    <div id="editor-wrapper"></div>
  `;

  const wrapper = document.getElementById('editor-wrapper') as HTMLElement;
  const saveBtn = document.getElementById('editor-save') as HTMLButtonElement;
  const resetBtn = document.getElementById('editor-reset') as HTMLButtonElement;
  const downloadBtn = document.getElementById('editor-download') as HTMLButtonElement;
  const statusSpan = document.getElementById('editor-status') as HTMLSpanElement;

  let view: EditorView;
  let originalContent = '';

  const initEditor = (content: string) => {
    if (view) view.destroy();
    
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const doc = update.state.doc.toString();
        localStorage.setItem('clash_admin_draft', doc);
        try {
          yamlParser.parse(doc);
          statusSpan.textContent = 'Valid YAML';
          statusSpan.style.color = 'var(--success)';
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          statusSpan.textContent = 'Invalid YAML: ' + msg;
          statusSpan.style.color = 'var(--error)';
        }
      }
    });

    view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [basicSetup, yaml(), oneDark, updateListener]
      }),
      parent: wrapper
    });
  };

  const loadConfig = async () => {
    try {
      const config = await api.getConfig();
      originalContent = config.content;
      const draft = localStorage.getItem('clash_admin_draft');
      if (draft && draft !== originalContent) {
        if (confirm('Found unsaved draft. Restore it?')) {
          initEditor(draft);
          return;
        } else {
          localStorage.removeItem('clash_admin_draft');
        }
      }
      initEditor(originalContent);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
      if (!(e instanceof AuthError)) initEditor('');
    }
  };

  saveBtn.addEventListener('click', async () => {
    const doc = view.state.doc.toString();
    try {
      yamlParser.parse(doc);
    } catch (e: unknown) {
      if (!confirm('YAML is invalid. Save anyway?')) return;
    }
    const msg = prompt('Enter version message (optional):') || undefined;
    saveBtn.disabled = true;
    try {
      await api.saveConfig(doc, msg);
      localStorage.removeItem('clash_admin_draft');
      originalContent = doc;
      showToast('Config saved', 'success');
      if (onSaved) onSaved();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  resetBtn.addEventListener('click', () => {
    if (confirm('Discard changes and reload?')) {
      localStorage.removeItem('clash_admin_draft');
      loadConfig();
    }
  });

  downloadBtn.addEventListener('click', () => {
    window.open('/download', '_blank');
  });

  loadConfig();
  
  // Autosave Draft interval
  setInterval(() => {
    if (view && view.state.doc.toString() !== originalContent) {
      localStorage.setItem('clash_admin_draft', view.state.doc.toString());
    }
  }, 30000);
}
