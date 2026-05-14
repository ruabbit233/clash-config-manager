import { ApiClient } from './api';
import { AuthError } from './auth';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import * as yamlParser from 'yaml';
import { showToast } from './toast';
import { t } from './i18n';
import { showConfirm, showPrompt } from './modal';
import { iconSave, iconRefresh, iconDownload, iconCheck, iconAlert } from './icons';
import { getElementById } from './dom';

let activeView: EditorView | null = null;
let autosaveTimer: number | undefined;

export function renderEditor(container: HTMLElement, api: ApiClient, onSaved?: () => void): void {
  container.innerHTML = `
    <div class="editor-page">
      <div class="editor-toolbar">
        <button id="editor-save" class="btn btn-primary">${iconSave} ${t.editor.save}</button>
        <button id="editor-reset" class="btn btn-secondary">${iconRefresh} ${t.editor.reset}</button>
        <button id="editor-download" class="btn btn-secondary">${iconDownload} ${t.editor.download}</button>
        <span id="editor-status" class="editor-status"></span>
      </div>
      <div id="editor-wrapper"></div>
    </div>
  `;

  const wrapper = getElementById<HTMLElement>('editor-wrapper');
  const saveBtn = getElementById<HTMLButtonElement>('editor-save');
  const resetBtn = getElementById<HTMLButtonElement>('editor-reset');
  const downloadBtn = getElementById<HTMLButtonElement>('editor-download');
  const statusSpan = getElementById<HTMLSpanElement>('editor-status');

  let originalContent = '';

  const initEditor = (content: string) => {
    if (activeView) activeView.destroy();
    
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const doc = update.state.doc.toString();
        localStorage.setItem('clash_admin_draft', doc);
        try {
          yamlParser.parse(doc);
          statusSpan.innerHTML = `<span class="status-dot valid"></span> ${iconCheck} ${t.editor.validYaml}`;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          const escaped = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          statusSpan.innerHTML = `<span class="status-dot invalid"></span> ${iconAlert} ${t.editor.invalidYaml}: ${escaped}`;
        }
      }
    });

    activeView = new EditorView({
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
        if (await showConfirm(t.editor.draftRestore)) {
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
    if (!activeView) {
      showToast(t.editor.notReady, 'error');
      return;
    }
    const doc = activeView.state.doc.toString();
    try {
      yamlParser.parse(doc);
    } catch (e: unknown) {
      if (!(await showConfirm(t.editor.invalidSaveConfirm))) return;
    }
    const msg = await showPrompt(t.editor.versionMessagePrompt, '', t.editor.versionMessageLabel);
    const versionMsg = msg || undefined;
    
    saveBtn.disabled = true;
    try {
      await api.saveConfig(doc, versionMsg);
      localStorage.removeItem('clash_admin_draft');
      originalContent = doc;
      showToast(t.editor.configSaved, 'success');
      if (onSaved) onSaved();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  resetBtn.addEventListener('click', async () => {
    if (await showConfirm(t.editor.discardConfirm)) {
      localStorage.removeItem('clash_admin_draft');
      await loadConfig();
    }
  });

  downloadBtn.addEventListener('click', () => {
    window.open('/download', '_blank');
  });

  if (autosaveTimer !== undefined) {
    window.clearInterval(autosaveTimer);
  }
  if (activeView) {
    activeView.destroy();
    activeView = null;
  }

  loadConfig();

  // Autosave Draft interval
  autosaveTimer = window.setInterval(() => {
    if (activeView && activeView.state.doc.toString() !== originalContent) {
      localStorage.setItem('clash_admin_draft', activeView.state.doc.toString());
    }
  }, 30000);
}
