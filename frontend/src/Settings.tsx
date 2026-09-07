import { ArrowLeft, Check, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { useTheme } from './theme'

type Credential = {
  id: number
  provider: string
  label: string
  api_key_masked: string
  verified: boolean
  created_at: string
}

// Mirrors backend/app/providers.py:detect_provider - a live preview only,
// the backend re-detects from the key itself and is the source of truth.
function detectProviderPreview(key: string): string | null {
  const k = key.trim()
  if (!k) return null
  if (k.toLowerCase().startsWith('test')) return 'test'
  if (k.startsWith('sk-ant-')) return 'anthropic'
  if (k.startsWith('sk-')) return 'openai'
  if (k.startsWith('AIza')) return 'google'
  return 'other'
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function Settings({ onBack }: { onBack: () => void }) {
  const { user, logout, authedFetch, updateProfile, changePassword } = useAuth()
  const { theme, toggleTheme } = useTheme()

  // --- Profile ---
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileError(null)
    setProfileSaved(false)
    setProfileSaving(true)
    try {
      await updateProfile({ name, email })
      setProfileSaved(true)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not update your profile')
    } finally {
      setProfileSaving(false)
    }
  }

  // --- Password ---
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSaved(false)
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match')
      return
    }
    setPasswordSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change your password')
    } finally {
      setPasswordSaving(false)
    }
  }

  // --- API keys ---
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [credentialsLoading, setCredentialsLoading] = useState(true)
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [credentialSaving, setCredentialSaving] = useState(false)
  const detectedProvider = detectProviderPreview(apiKey)

  const loadCredentials = async () => {
    setCredentialsLoading(true)
    try {
      const res = await authedFetch('/credentials')
      if (!res.ok) throw new Error('Could not load API keys')
      setCredentials(await res.json())
    } catch (err) {
      setCredentialError(err instanceof Error ? err.message : 'Could not load API keys')
    } finally {
      setCredentialsLoading(false)
    }
  }

  useEffect(() => {
    loadCredentials()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addCredential = async (e: React.FormEvent) => {
    e.preventDefault()
    setCredentialError(null)
    setCredentialSaving(true)
    try {
      const res = await authedFetch('/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, api_key: apiKey }),
      })
      // Clear the key out of this form immediately regardless of outcome, so
      // it never lingers on screen after being submitted.
      setApiKey('')
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? 'Could not save that API key')
      }
      setLabel('')
      await loadCredentials()
    } catch (err) {
      setCredentialError(err instanceof Error ? err.message : 'Could not save that API key')
    } finally {
      setCredentialSaving(false)
    }
  }

  const removeCredential = async (id: number) => {
    await authedFetch(`/credentials/${id}`, { method: 'DELETE' })
    setCredentials((c) => c.filter((cred) => cred.id !== id))
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200/80 bg-white/95 px-5 py-2.5 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </button>
        <h1 className="text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50">Settings</h1>
        <div className="ml-auto">
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 shadow-sm transition-all duration-150 hover:border-red-300 hover:bg-red-100 active:scale-[0.97] dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-5 py-8">
        <SectionCard title="Preferences">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
            <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {theme === 'dark' ? 'Dark mode' : 'Light mode'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
              className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Profile" description="Your display name and the email you sign in with.">
          <form onSubmit={saveProfile} className="space-y-3">
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              Name
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setProfileSaved(false)
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setProfileSaved(false)
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            {profileError && <p className="text-sm text-red-600 dark:text-red-400">{profileError}</p>}
            {profileSaved && !profileError && (
              <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Saved
              </p>
            )}
            <button
              type="submit"
              disabled={profileSaving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {profileSaving ? 'Saving...' : 'Save profile'}
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Password" description="Change the password you use to sign in.">
          <form onSubmit={savePassword} className="space-y-3">
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              Current password
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              New password
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              Confirm new password
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
            {passwordSaved && !passwordError && (
              <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Password changed
              </p>
            )}
            <button
              type="submit"
              disabled={passwordSaving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {passwordSaving ? 'Changing...' : 'Change password'}
            </button>
          </form>
        </SectionCard>

        <SectionCard
          title="AI API keys"
          description="Paste an API key - we recognize which platform it's from automatically, no need to pick it yourself."
        >
          {credentialsLoading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
          ) : credentials.length === 0 ? (
            <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">No API keys linked yet.</p>
          ) : (
            <ul className="mb-4 space-y-1.5">
              {credentials.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <span>
                    <span className="font-medium text-gray-700 dark:text-gray-200">{c.label}</span>{' '}
                    {c.verified && (
                      <span
                        className="inline-flex align-middle text-green-600 dark:text-green-400"
                        title="Verified with the provider"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}{' '}
                    <span className="text-gray-400 dark:text-gray-500">
                      ({c.provider}, {c.api_key_masked})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCredential(c.id)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addCredential} className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
            <input
              type="text"
              required
              placeholder="Label, e.g. Personal key"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <input
              type="password"
              required
              placeholder="API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            {detectedProvider && (
              <p
                className={`text-[11px] ${
                  detectedProvider === 'other'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {detectedProvider === 'other'
                  ? "Doesn't look like a recognized key format (OpenAI, Anthropic, Google) - won't be accepted."
                  : detectedProvider === 'test'
                    ? 'Recognized as a test key - verifies instantly, no real provider called.'
                    : `Recognized as ${detectedProvider}`}
              </p>
            )}
            {credentialError && <p className="text-sm text-red-600 dark:text-red-400">{credentialError}</p>}
            <button
              type="submit"
              disabled={credentialSaving}
              className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {credentialSaving ? 'Verifying with provider...' : 'Add API key'}
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  )
}
