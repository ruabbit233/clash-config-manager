import type { ApiClient } from './api'

export interface Page {
  mount(container: HTMLElement, api: ApiClient): void
  unmount(): void
  isDirty(): boolean
}
