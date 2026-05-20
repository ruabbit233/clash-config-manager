import { iconCheck, iconAlert } from './icons'

type ToastType = 'success' | 'error' | 'info'

const TOAST_DURATION_MS = 3000

const ICONS: Record<ToastType, string> = {
  success: iconCheck,
  error: iconAlert,
  info: iconAlert,
}

export function showToast(message: string, type: ToastType = 'info') {
  let container = document.querySelector<HTMLDivElement>('.toast-container')
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }

  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')

  const icon = document.createElement('span')
  icon.className = 'toast-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = ICONS[type]

  const messageEl = document.createElement('span')
  messageEl.className = 'toast-message'
  messageEl.textContent = message

  toast.append(icon, messageEl)
  container.appendChild(toast)

  setTimeout(() => {
    toast.remove()
    if (container && container.childNodes.length === 0) container.remove()
  }, TOAST_DURATION_MS)
}
