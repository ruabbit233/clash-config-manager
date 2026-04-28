import { ApiClient } from './api';
import { setToken, setExpiresAt } from './auth';

export function renderLogin(container: HTMLElement, api: ApiClient): void {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <h2 class="app-title">Login</h2>
        <input type="password" id="login-password" placeholder="Password" />
        <button id="login-btn">Submit</button>
        <div id="login-error" style="color: var(--error); display: none;"></div>
      </div>
    </div>
  `;

  const btn = document.getElementById('login-btn') as HTMLButtonElement;
  const input = document.getElementById('login-password') as HTMLInputElement;
  const err = document.getElementById('login-error') as HTMLDivElement;

  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      btn.textContent = 'Loading...';
      err.style.display = 'none';
      const { token, expiresAt } = await api.login(input.value);
      setToken(token);
      setExpiresAt(expiresAt);
      window.location.hash = '#/editor';
    } catch (e: any) {
      err.textContent = e.message;
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit';
    }
  });
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
}
