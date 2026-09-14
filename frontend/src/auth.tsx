import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const API_BASE = 'http://localhost:8000'

export type AuthUser = { id: number; email: string; name: string | null }

type AuthContextValue = {
  token: string | null
  user: AuthUser | null
  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>
  updateProfile: (patch: { name?: string; email?: string }) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  /** Step-up check for sensitive settings pages - confirms the current password
   *  without touching the long-lived login session. Throws on a wrong password. */
  reauth: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return body?.detail ?? fallback
  } catch {
    return fallback
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('overflow.authToken'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('overflow.authUser')
    return raw ? JSON.parse(raw) : null
  })

  const persist = useCallback((nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem('overflow.authToken', nextToken)
    localStorage.setItem('overflow.authUser', JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
  }, [])

  const persistUser = useCallback((nextUser: AuthUser) => {
    localStorage.setItem('overflow.authUser', JSON.stringify(nextUser))
    setUser(nextUser)
  }, [])

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res, 'Could not create account'))
      const body = await res.json()
      persist(body.token, body.user)
    },
    [persist],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res, 'Could not log in'))
      const body = await res.json()
      persist(body.token, body.user)
    },
    [persist],
  )

  const logout = useCallback(() => {
    localStorage.removeItem('overflow.authToken')
    localStorage.removeItem('overflow.authUser')
    setToken(null)
    setUser(null)
  }, [])

  const authedFetch = useCallback(
    (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return fetch(`${API_BASE}${path}`, { ...init, headers })
    },
    [token],
  )

  const updateProfile = useCallback(
    async (patch: { name?: string; email?: string }) => {
      const res = await authedFetch('/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res, 'Could not update your profile'))
      persistUser(await res.json())
    },
    [authedFetch, persistUser],
  )

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await authedFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res, 'Could not change your password'))
    },
    [authedFetch],
  )

  const reauth = useCallback(
    async (password: string) => {
      const res = await authedFetch('/auth/reauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res, 'Incorrect password'))
    },
    [authedFetch],
  )

  const value = useMemo(
    () => ({ token, user, register, login, logout, authedFetch, updateProfile, changePassword, reauth }),
    [token, user, register, login, logout, authedFetch, updateProfile, changePassword, reauth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
