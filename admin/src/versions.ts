import { ApiClient } from './api';
import { showToast } from './toast';
import * as Diff from 'diff';

export function renderVersions(container: HTMLElement, api: ApiClient): void {
  container.innerHTML = `
    <div>
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
        <select id="diff-from"></select>
        <select id="diff-to"></select>
        <button id="diff-btn">Compare</button>
      </div>
      <div id="diff-output" class="diff-view" style="display: none; white-space: pre-wrap; font-family: monospace;"></div>

      <table class="versions-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Message</th>
            <th>Hash</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="versions-tbody"></tbody>
      </table>
      <div style="margin-top: 1rem;">
        <button id="load-more-btn" style="display: none;">Load More</button>
      </div>
    </div>
  `;

  const tbody = document.getElementById('versions-tbody') as HTMLElement;
  const loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement;
  const fromSel = document.getElementById('diff-from') as HTMLSelectElement;
  const toSel = document.getElementById('diff-to') as HTMLSelectElement;
  const diffBtn = document.getElementById('diff-btn') as HTMLButtonElement;
  const diffOutput = document.getElementById('diff-output') as HTMLElement;

  let currentCursor: string | undefined;

  const loadVersions = async (reset = false) => {
    if (reset) {
      tbody.innerHTML = '';
      currentCursor = undefined;
      fromSel.innerHTML = '';
      toSel.innerHTML = '';
    }
    loadMoreBtn.disabled = true;
    try {
      const res = await api.listVersions(10, currentCursor);
      res.keys.forEach(v => {
        const tr = document.createElement('tr');
        const date = new Date(v.createdAt).toLocaleString();
        tr.innerHTML = `
          <td>${date}</td>
          <td>${v.message || '-'}</td>
          <td>${v.contentHash.substring(0, 8)}</td>
          <td><button class="btn-secondary btn-sm rollback-btn" data-id="${v.id}">Rollback</button></td>
        `;
        tbody.appendChild(tr);

        [fromSel, toSel].forEach(sel => {
          const opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = `${date} - ${v.contentHash.substring(0, 8)}`;
          sel.appendChild(opt.cloneNode(true));
        });

        const btn = tr.querySelector('.rollback-btn') as HTMLButtonElement;
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id')!;
          if (confirm(`Rollback to version ${id.substring(0, 8)}?`)) {
            try {
              await api.rollbackVersion(id);
              showToast('Rolled back successfully', 'success');
              loadVersions(true);
            } catch (err: unknown) {
              showToast(err instanceof Error ? err.message : String(err), 'error');
            }
          }
        });
      });

      currentCursor = res.cursor;
      loadMoreBtn.style.display = currentCursor ? 'inline-block' : 'none';
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      loadMoreBtn.disabled = false;
    }
  };

  loadMoreBtn.addEventListener('click', () => loadVersions(false));

  diffBtn.addEventListener('click', async () => {
    const fromId = fromSel.value;
    const toId = toSel.value;
    if (!fromId || !toId) return;

    diffBtn.disabled = true;
    diffOutput.style.display = 'block';
    diffOutput.textContent = 'Loading...';
    try {
      const [fromSnap, toSnap] = await Promise.all([
        api.getVersion(fromId),
        api.getVersion(toId),
      ]);
      const patch = Diff.createPatch('config.yaml', fromSnap.content, toSnap.content);

      diffOutput.innerHTML = '';
      const lines = patch.split('\n');
      lines.forEach(line => {
        const span = document.createElement('span');
        span.textContent = line + '\n';
        if (line.startsWith('+') && !line.startsWith('+++')) span.className = 'diff-addition';
        else if (line.startsWith('-') && !line.startsWith('---')) span.className = 'diff-deletion';
        diffOutput.appendChild(span);
      });
    } catch (e: unknown) {
      diffOutput.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      diffBtn.disabled = false;
    }
  });

  loadVersions(true);
}
