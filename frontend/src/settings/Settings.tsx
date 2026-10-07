import { ArrowLeft, Check, ChevronRight, KeyRound, Link2, Lock, Moon, ShieldCheck, Sun, Unlock } from 'lucide-react'
import { useState } from 'react'
import ApiKeysPage from './ApiKeysPage'
import { useAuth } from '../shared/auth'
import ConnectedAppsPage from './ConnectedAppsPage'
import ReauthGate from './ReauthGate'
import SecurityPage from './SecurityPage'
import { useTheme } from '../shared/theme'

type SubPage = 'security' | 'api-keys' | 'connected-apps'

const SUB_PAGES: { key: SubPage; label: string; description: string; icon: typeof KeyRound }[] = [
  {
    key: 'api-keys',
    label: 'API Keys',
    description: 'Link the AI provider keys your workflows run on.',
    icon: KeyRound,
  },
  {
    key: 'connected-apps',
    label: 'Connected Apps',
    description: 'Calendars and other real accounts your flows can act on.',
    icon: Link2,
  },
  {
    key: 'security',
    label: 'Security',
    description: 'Change the password you use to sign in.',
    icon: ShieldCheck,
  },
]

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

export default function Settings({
  onBack,
  initialSubPage,
}: {
  onBack: () => void
  /** Deep-link straight into the reauth gate for a sub-page, e.g. from a Canvas "Connect this
   *  app" nudge - still has to pass the same password re-check as clicking it normally. */
  initialSubPage?: SubPage
}) {
  const { user, logout, updateProfile } = useAuth()
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

  // --- Sensitive sub-pages, gated behind a password re-check ---
  const [subPage, setSubPage] = useState<SubPage | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [pendingPage, setPendingPage] = useState<SubPage | null>(initialSubPage ?? null)

  const openSubPage = (page: SubPage) => {
    if (unlocked) setSubPage(page)
    else setPendingPage(page)
  }

  if (subPage === 'security') return <SecurityPage onBack={() => setSubPage(null)} />
  if (subPage === 'api-keys') return <ApiKeysPage onBack={() => setSubPage(null)} />
  if (subPage === 'connected-apps') return <ConnectedAppsPage onBack={() => setSubPage(null)} />

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

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
            {unlocked ? (
              <Unlock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            )}
            Sensitive settings
          </h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            {unlocked
              ? 'Unlocked for this visit - confirmed with your password.'
              : 'API keys, connected apps, and account security - confirm your password to open any of these.'}
          </p>
          <ul className="mt-4 space-y-1.5">
            {SUB_PAGES.map((page) => (
              <li key={page.key}>
                <button
                  type="button"
                  onClick={() => openSubPage(page.key)}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                    <page.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                      {page.label}
                    </span>
                    <span className="block text-xs text-gray-400 dark:text-gray-500">{page.description}</span>
                  </span>
                  {unlocked ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {pendingPage && (
        <ReauthGate
          title="Unlock sensitive settings"
          onSuccess={() => {
            setUnlocked(true)
            setSubPage(pendingPage)
            setPendingPage(null)
          }}
          onCancel={() => setPendingPage(null)}
        />
      )}
    </div>
  )
}
