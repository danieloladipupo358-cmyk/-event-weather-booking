import { apiRequest } from './api'
import { ApiError } from './api'
import { demoAuthService } from './demoAuthService'

export type User = { id: string; name: string; email: string; role: 'CUSTOMER' | 'ADMIN'; createdAt: string }
type AuthResponse = { user: User }
let localDemoMode = false
export const usingLocalDemoAuth = () => localDemoMode

async function withDemoFallback<T>(request: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (localDemoMode) return fallback()
  try { return await request() }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 0) throw error
    localDemoMode = true
    return fallback()
  }
}

export const authService = {
  async currentUser() {
    if (demoAuthService.hasSession()) { localDemoMode = true; return demoAuthService.currentUser() }
    return withDemoFallback(async () => (await apiRequest<AuthResponse>('/auth/me')).user, () => demoAuthService.currentUser())
  },
  register(input: { name: string; email: string; password: string }) {
    return withDemoFallback(async () => (await apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) })).user, () => demoAuthService.register(input))
  },
  login(input: { email: string; password: string }) {
    return withDemoFallback(async () => (await apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) })).user, () => demoAuthService.login(input))
  },
  async logout() {
    if (localDemoMode) { demoAuthService.logout(); return }
    try { await apiRequest<void>('/auth/logout', { method: 'POST' }) }
    catch (error) { if (!(error instanceof ApiError) || error.status !== 0) throw error; demoAuthService.logout(); localDemoMode = true }
  },
}
