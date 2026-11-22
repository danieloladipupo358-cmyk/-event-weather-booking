import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authService, type User, usingLocalDemoAuth } from '../services/authService'
import { AuthContext } from './context'

export type AuthValue = { user: User | null; loading: boolean; demoMode: boolean; login: typeof authService.login; register: typeof authService.register; logout: () => Promise<void> }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(false)
  useEffect(() => {
    let active = true
    authService.currentUser().then(current => { if (active) setUser(current) }).catch(() => { if (active) setUser(null) }).finally(() => { if (active) { setDemoMode(usingLocalDemoAuth()); setLoading(false) } })
    return () => { active = false }
  }, [])

  const login = useCallback(async (input: { email: string; password: string }) => {
    const current = await authService.login(input)
    setUser(current)
    setDemoMode(usingLocalDemoAuth())
    return current
  }, [])
  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const current = await authService.register(input)
    setUser(current)
    setDemoMode(usingLocalDemoAuth())
    return current
  }, [])
  const logout = useCallback(async () => {
    try { await authService.logout() } finally { setUser(null); setDemoMode(usingLocalDemoAuth()) }
  }, [])

  const value = useMemo(() => ({ user, loading, demoMode, login, register, logout }), [user, loading, demoMode, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
