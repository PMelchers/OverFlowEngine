import { test as base, request, type APIRequestContext } from '@playwright/test'

const API_BASE = process.env.API_BASE || 'http://localhost:8000'

type AuthUser = { id: number; email: string; name: string | null }
type RegisteredUser = { email: string; password: string; token: string; user: AuthUser }

async function registerUser(api: APIRequestContext): Promise<RegisteredUser> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const password = 'e2e-test-password'
  const res = await api.post(`${API_BASE}/auth/register`, { data: { email, password } })
  if (!res.ok()) throw new Error(`Could not register test user: ${res.status()} ${await res.text()}`)
  const body = await res.json()
  return { email, password, token: body.token, user: body.user }
}

/**
 * `signedInPage` gives a page that's already authenticated - it registers a fresh
 * user through the real API (one per test, so tests never collide on state) and
 * seeds the same localStorage keys the app itself writes on login, skipping the
 * UI round-trip through the auth modal for every test that needs a signed-in user.
 */
export const test = base.extend<{ signedInUser: RegisteredUser; signedInPage: import('@playwright/test').Page }>({
  signedInUser: async ({}, use) => {
    const api = await request.newContext()
    const registered = await registerUser(api)
    await api.dispose()
    await use(registered)
  },

  signedInPage: async ({ page, signedInUser }, use) => {
    await page.goto('/')
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('overflow.authToken', token)
        localStorage.setItem('overflow.authUser', JSON.stringify(user))
      },
      { token: signedInUser.token, user: signedInUser.user },
    )
    await page.reload()
    await use(page)
  },
})

export { expect } from '@playwright/test'
