import { ApiClient } from './api'
import { setToken, setExpiresAt } from './auth'
import { t } from './i18n'
import { iconShield, iconEye, iconEyeOff } from './icons'
import { getElementById } from './dom'
import type { Page } from './page'

export function createLoginPage(): Page {
  return {
    mount(container: HTMLElement, api: ApiClient): void {
      container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-brand">
          <div class="login-brand-icon">${iconShield}</div>
          <h1 class="login-brand-title">${t.login.title}</h1>
          <p class="login-brand-subtitle">${t.login.subtitle}</p>
        </div>
        <div class="login-form">
          <label class="form-label" for="login-password">${t.login.passwordLabel}</label>
          <div class="login-password-wrapper">
            <input type="password" id="login-password" class="login-input" placeholder="${t.login.passwordPlaceholder}" autocomplete="current-password" autofocus />
            <button type="button" id="login-toggle" class="login-toggle" aria-label="${t.login.showPassword}" aria-pressed="false">${iconEye}</button>
          </div>
          <button id="login-btn" class="btn btn-primary login-btn">${t.login.submit}</button>
        </div>
        <div id="login-error" class="login-error"></div>
      </div>
    </div>
  `

      const btn = getElementById<HTMLButtonElement>('login-btn')
      const input = getElementById<HTMLInputElement>('login-password')
      const toggle = getElementById<HTMLButtonElement>('login-toggle')
      const err = getElementById<HTMLDivElement>('login-error')

      input.focus()

      toggle.addEventListener('click', () => {
        const showing = input.type === 'text'
        input.type = showing ? 'password' : 'text'
        toggle.innerHTML = showing ? iconEye : iconEyeOff
        toggle.setAttribute('aria-pressed', String(!showing))
        toggle.setAttribute('aria-label', showing ? t.login.showPassword : t.login.hidePassword)
        input.focus()
      })

      btn.addEventListener('click', async () => {
        const password = input.value.trim()
        if (!password) {
          err.textContent = t.login.emptyPassword
          err.style.display = 'block'
          input.focus()
          return
        }

        try {
          btn.disabled = true
          btn.textContent = t.login.loading
          err.style.display = 'none'
          const { token, expiresAt } = await api.login(password)
          setToken(token)
          setExpiresAt(expiresAt)
          window.location.hash = '#/editor'
        } catch (e: unknown) {
          err.textContent = e instanceof Error ? e.message : String(e)
          err.style.display = 'block'
        } finally {
          btn.disabled = false
          btn.textContent = t.login.submit
        }
      })

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) btn.click()
      })
    },
    unmount(): void {},
    isDirty(): boolean {
      return false
    },
  }
}
