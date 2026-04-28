export class AuthError extends Error {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthError';
  }
}

export function getToken(): string | null {
  return localStorage.getItem('clash_admin_token');
}

export function setToken(token: string): void {
  localStorage.setItem('clash_admin_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('clash_admin_token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getExpiresAt(): string | null {
  return localStorage.getItem('clash_admin_expires');
}

export function setExpiresAt(expiresAt: string): void {
  localStorage.setItem('clash_admin_expires', expiresAt);
}

export function handleAuthError(_error: AuthError): void {
  clearToken();
  localStorage.removeItem('clash_admin_expires');
  window.location.hash = '#/login';
}
