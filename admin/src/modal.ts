import { t } from './i18n';
import { iconX } from './icons';

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  return overlay;
}

function createCard(title: string): { card: HTMLDivElement; body: HTMLDivElement; footer: HTMLDivElement } {
  const card = document.createElement('div');
  card.className = 'modal-card';

  card.innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${title}</span>
      <button class="modal-close btn-icon">${iconX}</button>
    </div>
    <div class="modal-body"></div>
    <div class="modal-footer"></div>
  `;

  return {
    card,
    body: card.querySelector('.modal-body') as HTMLDivElement,
    footer: card.querySelector('.modal-footer') as HTMLDivElement,
  };
}

export function showConfirm(message: string, title: string = t.modal.confirm): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const { card, body, footer } = createCard(title);

    body.textContent = message;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = t.modal.cancel;

    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = t.modal.ok;

    footer.append(cancelBtn, okBtn);
    overlay.append(card);
    document.body.append(overlay);

    const close = (result: boolean) => {
      overlay.remove();
      resolve(result);
    };

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    card.querySelector('.modal-close')!.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close(false);
      }
    };
    document.addEventListener('keydown', onKey);

    okBtn.focus();
  });
}

export function showPrompt(message: string, defaultValue: string = '', title: string = t.modal.confirm): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const { card, body, footer } = createCard(title);

    const label = document.createElement('div');
    label.className = 'modal-message';
    label.textContent = message;

    const input = document.createElement('input');
    input.className = 'modal-input';
    input.value = defaultValue;

    body.append(label, input);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = t.modal.cancel;

    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = t.modal.ok;

    footer.append(cancelBtn, okBtn);
    overlay.append(card);
    document.body.append(overlay);

    const close = (result: string | null) => {
      overlay.remove();
      resolve(result);
    };

    cancelBtn.addEventListener('click', () => close(null));
    okBtn.addEventListener('click', () => close(input.value));
    card.querySelector('.modal-close')!.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value);
    });

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onEscape);
        close(null);
      }
    };
    document.addEventListener('keydown', onEscape);

    input.focus();
    input.select();
  });
}
