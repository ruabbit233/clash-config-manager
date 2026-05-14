import { describe, it, expect } from 'vitest'
import { generateToken, verifyToken } from './auth'

describe('auth', () => {
  const secret = 'test-secret-that-is-at-least-32-characters-long!'

  describe('generateToken', () => {
    it('should return a JWT string with three parts', async () => {
      const token = await generateToken(secret)
      const parts = token.split('.')
      expect(parts).toHaveLength(3)
    })

    it('should use HS256 algorithm', async () => {
      const token = await generateToken(secret)
      const [headerB64] = token.split('.')
      const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')))
      expect(header.alg).toBe('HS256')
      expect(header.typ).toBe('JWT')
    })

    it('should include exp and iat in payload', async () => {
      const token = await generateToken(secret)
      const [, payloadB64] = token.split('.')
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
      expect(typeof payload.exp).toBe('number')
      expect(typeof payload.iat).toBe('number')
      expect(payload.exp).toBeGreaterThan(payload.iat)
    })

    it('should respect custom expiry', async () => {
      const token = await generateToken(secret, 3600)
      const [, payloadB64] = token.split('.')
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
      expect(payload.exp - payload.iat).toBe(3600)
    })
  })

  describe('verifyToken', () => {
    it('should return payload for valid token', async () => {
      const token = await generateToken(secret)
      const payload = await verifyToken(secret, token)
      expect(payload).not.toBeNull()
      expect(typeof payload!.exp).toBe('number')
      expect(typeof payload!.iat).toBe('number')
    })

    it('should return null for expired token', async () => {
      const token = await generateToken(secret, -1)
      const payload = await verifyToken(secret, token)
      expect(payload).toBeNull()
    })

    it('should return null for wrong secret', async () => {
      const token = await generateToken(secret)
      const payload = await verifyToken('wrong-secret-that-is-also-at-least-32-chars', token)
      expect(payload).toBeNull()
    })

    it('should return null for malformed token', async () => {
      const payload = await verifyToken(secret, 'not.a.valid-token')
      expect(payload).toBeNull()
    })

    it('should return null for token with wrong structure', async () => {
      const payload = await verifyToken(secret, 'only-two-parts')
      expect(payload).toBeNull()
    })

    it('should return null for token with wrong algorithm', async () => {
      const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const payloadB64 = btoa(
        JSON.stringify({ exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000 }),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const fakeToken = `${header}.${payloadB64}.fakesignature`
      const result = await verifyToken(secret, fakeToken)
      expect(result).toBeNull()
    })
  })
})
