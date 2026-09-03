import { useEffect, useState } from 'react'
import { useAuth } from './auth'

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

export default function AccountPanel({ onClose }: { onClose: () => void }) {
  const { user, logout, authedFetch } = useAuth()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const detectedProvider = detectProviderPreview(apiKey)

  const loadCredentials = async () => {
    setLoading(true)
    try {
      const res = await authedFetch('/credentials')
      if (!res.ok) throw new Error('Could not load API keys')
      setCredentials(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCredentials()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addCredential = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
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
      setError(err instanceof Error ? err.message : 'Could not save that API key')
    } finally {
      setSaving(false)
    }
  }

  const removeCredential = async (id: number) => {
    await authedFetch(`/credentials/${id}`, { method: 'DELETE' })
    setCredentials((c) => c.filter((cred) => cred.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-96 rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Account</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">Signed in as {user?.email}</p>

        <h3 className="mb-2 text-sm font-semibold text-gray-700">AI API keys</h3>
        <p className="mb-2 text-xs text-gray-500">
          Paste an API key - we recognize which platform it's from automatically, no need to pick it
          yourself.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : credentials.length === 0 ? (
          <p className="mb-3 text-sm text-gray-400">No API keys linked yet.</p>
        ) : (
          <ul className="mb-3 space-y-1">
            {credentials.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm"
              >
                <span>
                  <span className="font-medium text-gray-700">{c.label}</span>{' '}
                  {c.verified && (
                    <span className="text-green-600" title="Verified with the provider">
                      ✓
                    </span>
                  )}{' '}
                  <span className="text-gray-400">
                    ({c.provider}, {c.api_key_masked})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeCredential(c.id)}
                  className="text-red-500 hover:text-red-700"
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addCredential} className="space-y-2 border-t border-gray-200 pt-3">
          <input
            type="text"
            required
            placeholder="Label, e.g. Personal key"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            type="password"
            required
            placeholder="API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          {detectedProvider && (
            <p className={`text-[11px] ${detectedProvider === 'other' ? 'text-amber-600' : 'text-gray-400'}`}>
              {detectedProvider === 'other'
                ? "Doesn't look like a recognized key format (OpenAI, Anthropic, Google) - won't be accepted."
                : detectedProvider === 'test'
                  ? 'Recognized as a test key - verifies instantly, no real provider called.'
                  : `Recognized as ${detectedProvider}`}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Verifying with provider...' : 'Add API key'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            logout()
            onClose()
          }}
          className="mt-4 w-full rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
