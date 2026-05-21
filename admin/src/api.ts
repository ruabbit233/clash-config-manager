import { AuthError, handleAuthError } from './auth'
import type { HeadersConfig, VersionListItem, VersionSnapshot } from '@shared/types'

export interface LoginResponse {
  token: string
  expiresAt: string
}
export interface ConfigResponse {
  content: string
  versionId: string
  updatedAt: string
}
export interface SaveConfigResponse {
  versionId: string
  contentHash: string
  createdAt: string
}
export interface UpdateVersionResponse {
  id: string
  message: string
  createdAt: string
  contentHash: string
}

export class ApiClient {
  private baseUrl: string
  private getToken: () => string | null

  constructor(baseUrl: string, getToken: () => string | null) {
    this.baseUrl = baseUrl
    this.getToken = getToken
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {})
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json')
    }
    const token = this.getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
    })

    if (!res.ok) {
      if (res.status === 401) {
        handleAuthError()
        throw new AuthError()
      }
      const errText = await res.text()
      let errMsg = res.statusText
      try {
        const errJson = JSON.parse(errText)
        errMsg = errJson.error || errJson.message || errMsg
      } catch {
        if (errText) errMsg = errText
      }
      throw new Error(errMsg)
    }

    if (res.status === 204) return {} as T
    return await res.json()
  }

  async login(password: string): Promise<LoginResponse> {
    return this.fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  }

  async logout(): Promise<void> {
    await this.fetch<void>('/api/auth/logout', { method: 'POST' })
  }

  async verifyToken(token: string): Promise<{ valid: boolean; expiresAt: string }> {
    return this.fetch<{ valid: boolean; expiresAt: string }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  }

  async getConfig(): Promise<ConfigResponse> {
    return this.fetch<ConfigResponse>('/api/config')
  }

  async saveConfig(content: string, message?: string): Promise<SaveConfigResponse> {
    return this.fetch<SaveConfigResponse>('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ content, message }),
    })
  }

  async listVersions(
    limit?: number,
    cursor?: string,
  ): Promise<{ keys: VersionListItem[]; cursor?: string }> {
    const params = new URLSearchParams()
    if (limit) params.set('limit', limit.toString())
    if (cursor) params.set('cursor', cursor)
    return this.fetch<{ keys: VersionListItem[]; cursor?: string }>(
      `/api/versions?${params.toString()}`,
    )
  }

  async getVersion(id: string): Promise<VersionSnapshot> {
    return this.fetch<VersionSnapshot>(`/api/versions/${id}`)
  }

  async rollbackVersion(id: string): Promise<SaveConfigResponse> {
    return this.fetch<SaveConfigResponse>(`/api/versions/${id}/rollback`, {
      method: 'POST',
    })
  }

  async updateVersionMessage(id: string, message: string): Promise<UpdateVersionResponse> {
    return this.fetch<UpdateVersionResponse>(`/api/versions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ message }),
    })
  }

  async deleteVersion(id: string): Promise<void> {
    await this.fetch<void>(`/api/versions/${id}`, { method: 'DELETE' })
  }

  async getHeaders(): Promise<HeadersConfig> {
    return this.fetch<HeadersConfig>('/api/headers')
  }

  async setHeaders(headers: HeadersConfig): Promise<void> {
    return this.fetch<void>('/api/headers', {
      method: 'PUT',
      body: JSON.stringify(headers),
    })
  }
}
