import { ArrowLeft, Check, KeyRound, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth'
import { useAuthedResource } from '../useAuthedResource'

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
  // Classic Google API key format, plus the newer "AQ." Gemini key format.
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'google'
  return 'other'
}

export default function ApiKeysPage({ onBack }: { onBack: () => void }) {
  const { authedFetch } = useAuth()

  const {
    data: credentialsData,
    loading: credentialsLoading,
    error: loadError,
    reload: loadCredentials,
  } = useAuthedResource<Credential[]>('/credentials', 'Could not load API keys')
  const credentials = credentialsData ?? []
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [credentialSaving, setCredentialSaving] = useState(false)
  const detectedProvider = detectProviderPreview(apiKey)

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
    await loadCredentials()
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
          <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" /> API Keys
        </h1>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-8">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI API keys</h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Paste an API key - we recognize which platform it's from automatically, no need to pick it
            yourself.
          </p>

          <div className="mt-4">
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
                      <X className="h-3.5 w-3.5" />
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
              {(credentialError ?? loadError) && (
                <p className="text-sm text-red-600 dark:text-red-400">{credentialError ?? loadError}</p>
              )}
              <button
                type="submit"
                disabled={credentialSaving}
                className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {credentialSaving ? 'Verifying with provider...' : 'Add API key'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
