import { AlertTriangle, Check, ExternalLink, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../shared/auth'
import Modal from '../shared/Modal'
import { APP_ICONS, APP_TO_CALENDAR_PROVIDER } from './types'

type CalendarProvider = 'google' | 'microsoft'

const REDIRECT_URIS: Record<CalendarProvider, string> = {
  google: 'http://localhost:8000/calendar/google/callback',
  microsoft: 'http://localhost:8000/calendar/microsoft/callback',
}

const CONSOLE_LINKS: Record<CalendarProvider, { label: string; url: string }> = {
  google: { label: 'Google Cloud Console - Credentials', url: 'https://console.cloud.google.com/apis/credentials' },
  microsoft: {
    label: 'Microsoft Entra admin center - App registrations',
    url: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
  },
}

const STEPS: Record<CalendarProvider, string[]> = {
  google: [
    'Open Google Cloud Console (link below) and pick or create a project.',
    'Under "APIs & Services" -> "Library", enable the Google Calendar API for that project.',
    'Under "APIs & Services" -> "Credentials", click "Create Credentials" -> "OAuth client ID", application type "Web application".',
    'Under "Authorized redirect URIs", add the exact URL shown below.',
    'Copy the Client ID and Client secret it generates and paste them in below.',
  ],
  microsoft: [
    'Open the Microsoft Entra admin center (link below) and click "New registration".',
    'Under "Redirect URI" choose platform "Web" and paste the exact URL shown below.',
    'After it\'s created, go to "Certificates & secrets" -> "New client secret" and copy the secret VALUE immediately (it\'s hidden after you leave the page).',
    'Go to "API permissions" -> "Add a permission" -> Microsoft Graph -> Delegated, and add Calendars.ReadWrite and offline_access.',
    'Copy the "Application (client) ID" from the Overview page and paste it, along with the secret, below.',
  ],
}

type Status = 'loading' | 'needsApp' | 'needsConnect' | 'connecting' | 'connected'

/**
 * Connect an app without leaving the canvas - registering the OAuth app + granting
 * consent all happen through this modal (consent itself opens in a popup, so the
 * builder tab never navigates away). Settings > Connected Apps still exists for
 * managing/disconnecting later, but this is the fast path from where you need it.
 */
export default function ConnectAppModal({
  app,
  onClose,
  onConnected,
  onOpenSettings,
}: {
  app: string
  onClose: () => void
  onConnected?: () => void
  onOpenSettings?: (subPage?: 'connected-apps') => void
}) {
  const { authedFetch } = useAuth()
  const provider = APP_TO_CALENDAR_PROVIDER[app]
  const Icon = APP_ICONS[app]

  const [status, setStatus] = useState<Status>('loading')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const popupTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (popupTimerRef.current) window.clearInterval(popupTimerRef.current)
    }
  }, [])

  const loadStatus = () => {
    authedFetch('/calendar/connections')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: { provider: string; has_app: boolean; connected: boolean; account_email: string | null }[]) => {
        const row = list.find((c) => c.provider === provider)
        if (row?.connected) {
          setStatus('connected')
          setAccountEmail(row.account_email)
        } else if (row?.has_app) {
          setStatus('needsConnect')
        } else {
          setStatus('needsApp')
        }
      })
      .catch(() => setStatus('needsApp'))
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listens for the popup finishing consent (it posts back once it lands on the
  // app's own origin after the provider redirects it there) - the primary signal.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'calendar-connected' && e.data?.provider === provider) {
        onConnected?.()
        loadStatus()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  const openConsentPopup = async () => {
    setError(null)
    setStatus('connecting')
    try {
      const res = await authedFetch(`/calendar/${provider}/connect`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? 'Could not start connecting')
      }
      const { url } = await res.json()
      const popup = window.open(url, 'overflowengine-connect', 'width=520,height=680')
      if (!popup) {
        throw new Error('Your browser blocked the popup - allow popups for this site and try again')
      }
      // Fallback for the (rare) case the popup closes without ever posting a message
      // back - e.g. the user just closes it. Re-checks real status either way.
      popupTimerRef.current = window.setInterval(() => {
        if (popup.closed) {
          if (popupTimerRef.current) window.clearInterval(popupTimerRef.current)
          onConnected?.()
          loadStatus()
        }
      }, 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start connecting')
      setStatus('needsConnect')
    }
  }

  const saveApp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await authedFetch(`/calendar/${provider}/app`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      })
      setClientSecret('')
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? 'Could not save your app')
      }
      setStatus('needsConnect')
      await openConsentPopup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your app')
    }
  }

  if (!provider) return null

  return (
    <Modal
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[110] flex items-center justify-center bg-black/40"
      panelClassName="max-h-[85vh] w-[420px] overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
      labelledBy="connect-app-title"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="connect-app-title"
          className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-50"
        >
          {Icon && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          Connect {app}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

        {status === 'loading' && (
          <p className="flex items-center gap-2 py-6 text-sm text-gray-400 dark:text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection status...
          </p>
        )}

        {status === 'connected' && (
          <div className="py-4 text-center">
            <p className="mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
              <Check className="h-3.5 w-3.5" /> Connected{accountEmail ? ` as ${accountEmail}` : ''}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              This block can now use your real {app} account.{' '}
              {onOpenSettings ? (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSettings('connected-apps')
                    onClose()
                  }}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Manage or disconnect it from Settings.
                </button>
              ) : (
                'Manage or disconnect it later from Settings.'
              )}
            </p>
          </div>
        )}

        {(status === 'needsApp' || status === 'needsConnect' || status === 'connecting') && (
          <>
            <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              There's no shared {app} account behind the scenes - you register your own free OAuth app with{' '}
              {provider === 'google' ? 'Google' : 'Microsoft'} and connect it here. Nothing goes through
              anyone else's credentials.
            </p>

            {status === 'needsApp' && (
              <>
                <ol className="mb-3 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  {STEPS[provider].map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <a
                  href={CONSOLE_LINKS[provider].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  <ExternalLink className="h-3 w-3" /> {CONSOLE_LINKS[provider].label}
                </a>
                <label className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  Redirect URI to register (copy exactly)
                </label>
                <code className="mb-3 block w-full break-all rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  {REDIRECT_URIS[provider]}
                </code>

                <form onSubmit={saveApp} className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                  <input
                    type="text"
                    required
                    placeholder="Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Client secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                  {error && (
                    <p className="flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
                  >
                    Save & connect
                  </button>
                </form>
              </>
            )}

            {(status === 'needsConnect' || status === 'connecting') && (
              <div className="text-center">
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  Your {app} app is saved. Click below to grant access - it opens in a small popup so you
                  stay right here on the canvas.
                </p>
                {error && (
                  <p className="mb-2 flex items-start gap-1 text-left text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={openConsentPopup}
                  disabled={status === 'connecting'}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  {status === 'connecting' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {status === 'connecting' ? 'Waiting for the popup...' : `Connect ${app}`}
                </button>
              </div>
            )}
          </>
        )}
    </Modal>
  )
}
