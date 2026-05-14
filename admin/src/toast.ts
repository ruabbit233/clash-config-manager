export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  let container = document.querySelector('.toast-container')
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => {
    toast.remove()
    if (container?.childNodes.length === 0) container.remove()
  }, 3000)
}
