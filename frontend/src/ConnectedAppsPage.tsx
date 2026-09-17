import { ArrowLeft, Calendar, Check, Link2, MessageSquare, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { useAuthedResource } from './useAuthedResource'

type CalendarProvider = 'google' | 'microsoft'
type CalendarConnection = {
  provider: CalendarProvider
  has_app: boolean
  client_id: string | null
  connected: boolean
  account_email: string | null
}

type AppCredential = {
  id: number
  target_app: string
  label: string
  token_masked: string
  verified: boolean
  created_at: string
}

const CALENDAR_LABELS: Record<CalendarProvider, string> = {
  google: 'Google Calendar',
  microsoft: 'Microsoft Calendar',
}

const CALENDAR_REDIRECT_URIS: Record<CalendarProvider, string> = {
  google: 'http://localhost:8000/calendar/google/callback',
  microsoft: 'http://localhost:8000/calendar/microsoft/callback',
}

export default function ConnectedAppsPage({ onBack }: { onBack: () => void }) {
  const { authedFetch } = useAuth()

  const {
    data: calendarData,
    loading: calendarLoading,
    reload: loadCalendars,
  } = useAuthedResource<CalendarConnection[]>('/calendar/connections')
  const calendarConnections = calendarData ?? []
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [connectingProvider, setConnectingProvider] = useState<CalendarProvider | null>(null)
  const [appForms, setAppForms] = useState<Record<CalendarProvider, { clientId: string; clientSecret: string }>>({
    google: { clientId: '', clientSecret: '' },
    microsoft: { clientId: '', clientSecret: '' },
  })
  const [savingApp, setSavingApp] = useState<CalendarProvider | null>(null)

  const saveCalendarApp = async (provider: CalendarProvider, e: React.FormEvent) => {
    e.preventDefault()
    setCalendarError(null)
    setSavingApp(provider)
    try {
      const { clientId, clientSecret } = appForms[provider]
      const res = await authedFetch(`/calendar/${provider}/app`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? `Could not save your ${CALENDAR_LABELS[provider]} app`)
      }
      // Clear the secret out of this form immediately regardless of outcome, so
      // it never lingers on screen after being submitted.
      setAppForms((f) => ({ ...f, [provider]: { clientId: '', clientSecret: '' } }))
      await loadCalendars()
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : `Could not save your ${CALENDAR_LABELS[provider]} app`)
    } finally {
      setSavingApp(null)
    }
  }

  const connectCalendar = async (provider: CalendarProvider) => {
    setCalendarError(null)
    setConnectingProvider(provider)
    try {
      const res = await authedFetch(`/calendar/${provider}/connect`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? `Could not connect ${CALENDAR_LABELS[provider]}`)
      }
      const { url } = await res.json()
      window.location.href = url
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : `Could not connect ${CALENDAR_LABELS[provider]}`)
      setConnectingProvider(null)
    }
  }

  const removeCalendar = async (provider: CalendarProvider) => {
    if (
      !window.confirm(
        `Remove your ${CALENDAR_LABELS[provider]} app and disconnect? You'll need to re-enter your client secret to reconnect.`,
      )
    ) {
      return
    }
    await authedFetch(`/calendar/${provider}`, { method: 'DELETE' })
    await loadCalendars()
  }

  // --- Discord bot tokens ---
  const [discordCreds, setDiscordCreds] = useState<AppCredential[]>([])
  const [discordCredsLoading, setDiscordCredsLoading] = useState(true)
  const [discordError, setDiscordError] = useState<string | null>(null)
  const [discordLabel, setDiscordLabel] = useState('')
  const [discordToken, setDiscordToken] = useState('')
  const [discordSaving, setDiscordSaving] = useState(false)

  const loadDiscordCreds = async () => {
    setDiscordCredsLoading(true)
    try {
      const res = await authedFetch('/app-credentials?target_app=Discord')
      if (!res.ok) throw new Error('Could not load Discord bots')
      setDiscordCreds(await res.json())
    } catch (err) {
      setDiscordError(err instanceof Error ? err.message : 'Could not load Discord bots')
    } finally {
      setDiscordCredsLoading(false)
    }
  }

  useEffect(() => {
    loadDiscordCreds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addDiscordCred = async (e: React.FormEvent) => {
    e.preventDefault()
    setDiscordError(null)
    setDiscordSaving(true)
    try {
      const res = await authedFetch('/app-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_app: 'Discord', label: discordLabel, token: discordToken }),
      })
      // Clear the token out of this form immediately regardless of outcome, so
      // it never lingers on screen after being submitted.
      setDiscordToken('')
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? 'Could not save that bot token')
      }
      setDiscordLabel('')
      await loadDiscordCreds()
    } catch (err) {
      setDiscordError(err instanceof Error ? err.message : 'Could not save that bot token')
    } finally {
      setDiscordSaving(false)
    }
  }

  const removeDiscordCred = async (id: number) => {
    await authedFetch(`/app-credentials/${id}`, { method: 'DELETE' })
    setDiscordCreds((c) => c.filter((cred) => cred.id !== id))
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200/80 bg-white/95 px-5 py-2.5 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Settings
        </button>
        <h1 className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50">
          <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Connected Apps
        </h1>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-8">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Calendars</h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Bring your own OAuth app - register one with Google/Microsoft yourself, paste its credentials
            below, then connect. Nothing is shared server-side.
          </p>

          <div className="mt-4">
            {calendarLoading ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
            ) : (
              <div className="space-y-4">
                {(['google', 'microsoft'] as const).map((provider) => {
                  const connection = calendarConnections.find((c) => c.provider === provider)
                  return (
                    <div key={provider} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          <div>
                            <p className="font-medium text-gray-700 dark:text-gray-200">
                              {CALENDAR_LABELS[provider]}
                            </p>
                            {connection?.connected ? (
                              <p className="text-xs text-green-600 dark:text-green-400">
                                Connected{connection.account_email ? ` as ${connection.account_email}` : ''}
                              </p>
                            ) : connection?.has_app ? (
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                App saved - not connected yet
                              </p>
                            ) : (
                              <p className="text-xs text-gray-400 dark:text-gray-500">No app registered yet</p>
                            )}
                          </div>
                        </div>
                        {connection?.has_app && (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => connectCalendar(provider)}
                              disabled={connectingProvider === provider}
                              className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {connectingProvider === provider
                                ? 'Redirecting...'
                                : connection.connected
                                  ? 'Reconnect'
                                  : 'Connect'}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCalendar(provider)}
                              className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                              title="Remove app & disconnect"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {!connection?.has_app && (
                        <form onSubmit={(e) => saveCalendarApp(provider, e)} className="space-y-2">
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">
                            Register your own OAuth app with{' '}
                            {provider === 'google' ? 'Google Cloud Console' : 'the Microsoft Entra admin center'}{' '}
                            and set its redirect URI to:{' '}
                            <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px] dark:bg-gray-700">
                              {CALENDAR_REDIRECT_URIS[provider]}
                            </code>
                          </p>
                          <input
                            type="text"
                            required
                            placeholder="Client ID"
                            value={appForms[provider].clientId}
                            onChange={(e) =>
                              setAppForms((f) => ({
                                ...f,
                                [provider]: { ...f[provider], clientId: e.target.value },
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          />
                          <input
                            type="password"
                            required
                            placeholder="Client secret"
                            value={appForms[provider].clientSecret}
                            onChange={(e) =>
                              setAppForms((f) => ({
                                ...f,
                                [provider]: { ...f[provider], clientSecret: e.target.value },
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          />
                          <button
                            type="submit"
                            disabled={savingApp === provider}
                            className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingApp === provider ? 'Saving...' : 'Save app'}
                          </button>
                        </form>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {calendarError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{calendarError}</p>}
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Discord bots
          </h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Link a bot token so App Action blocks can send to Discord as your own bot instead of the
            server's default one. Get a token from the Discord Developer Portal (Bot tab).
          </p>

          <div className="mt-4">
            {discordCredsLoading ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
            ) : discordCreds.length === 0 ? (
              <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">
                No Discord bots linked yet - App Action blocks will use the server's default bot.
              </p>
            ) : (
              <ul className="mb-4 space-y-1.5">
                {discordCreds.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                  >
                    <span>
                      <span className="font-medium text-gray-700 dark:text-gray-200">{c.label}</span>{' '}
                      {c.verified && (
                        <span
                          className="inline-flex align-middle text-green-600 dark:text-green-400"
                          title="Verified with Discord"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}{' '}
                      <span className="text-gray-400 dark:text-gray-500">({c.token_masked})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDiscordCred(c.id)}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={addDiscordCred} className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
              <input
                type="text"
                required
                placeholder="Label, e.g. Team server bot"
                value={discordLabel}
                onChange={(e) => setDiscordLabel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <input
                type="password"
                required
                placeholder="Bot token"
                value={discordToken}
                onChange={(e) => setDiscordToken(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              {discordError && <p className="text-sm text-red-600 dark:text-red-400">{discordError}</p>}
              <button
                type="submit"
                disabled={discordSaving}
                className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {discordSaving ? 'Verifying with Discord...' : 'Add Discord bot'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
