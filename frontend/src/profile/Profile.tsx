import { ArrowLeft, MessageSquare, Trash2, User } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../shared/auth'
import { relativeDate } from '../shared/relativeDate'
import { useAuthedResource } from '../shared/useAuthedResource'

type Preference = { id: number; category: string; key: string; value: string; updated_at: string | null }
type Feedback = {
  id: number
  result_type: string
  rating: number | null
  text: string | null
  created_at: string | null
}
type LearnedSignal = { id: number; kind: 'block' | 'app' | 'rating'; key: string; count: number; average: number | null }
type Learning = { enabled: boolean; signals: LearnedSignal[]; hints: string[] }
type ProfileData = { preferences: Preference[]; feedback: Feedback[]; learning: Learning }

function describeSignal(s: LearnedSignal): string {
  if (s.kind === 'block') return `Uses ${s.key} blocks (${s.count} saved workflows)`
  if (s.kind === 'app') return `Connects ${s.key} (${s.count} saved workflows)`
  return `Replies from '${s.key}': average ${s.average ?? '-'} / 5 (${s.count} ratings)`
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'

export default function Profile({ onBack }: { onBack: () => void }) {
  const { authedFetch } = useAuth()
  const { data, loading, error, reload } = useAuthedResource<ProfileData>('/profile', 'Could not load your profile')
  const profile: ProfileData = data ?? { preferences: [], feedback: [], learning: { enabled: false, signals: [], hints: [] } }
  const learning = profile.learning

  // Shown straight away on click; the server answer then replaces it, so the switch never waits on a reload.
  const [learnOverride, setLearnOverride] = useState<boolean | null>(null)
  const learningOn = learnOverride ?? learning.enabled

  const setLearning = async (enabled: boolean) => {
    setLearnOverride(enabled)
    try {
      await authedFetch('/profile/learning', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      await reload()
    } finally {
      setLearnOverride(null)
    }
  }

  const deleteSignal = async (id: number) => {
    await authedFetch(`/profile/learning/${id}`, { method: 'DELETE' })
    await reload()
  }

  const resetLearning = async () => {
    if (!window.confirm('Forget everything the app has learned about you?')) return
    await authedFetch('/profile/learning', { method: 'DELETE' })
    await reload()
  }

  const [prefCategory, setPrefCategory] = useState('')
  const [prefKey, setPrefKey] = useState('')
  const [prefValue, setPrefValue] = useState('')
  const [prefError, setPrefError] = useState<string | null>(null)

  const savePreference = async (e: React.FormEvent) => {
    e.preventDefault()
    setPrefError(null)
    const key = prefKey.trim()
    if (!key || !prefValue.trim()) {
      setPrefError('Give the preference a name and a value')
      return
    }
    const res = await authedFetch(`/profile/preferences/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: prefCategory, value: prefValue }),
    })
    if (!res.ok) {
      setPrefError('Could not save that preference')
      return
    }
    setPrefKey('')
    setPrefValue('')
    await reload()
  }

  const deletePreference = async (key: string) => {
    await authedFetch(`/profile/preferences/${encodeURIComponent(key)}`, { method: 'DELETE' })
    await reload()
  }

  const deleteFeedback = async (id: number) => {
    await authedFetch(`/profile/feedback/${id}`, { method: 'DELETE' })
    await reload()
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200/80 bg-white/95 px-5 py-2.5 shadow-sm dark:border-gray-800 dark:bg-gray-900/95">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50">
          <User className="h-4 w-4 text-sky-600 dark:text-sky-400" /> My profile
        </h1>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 content-start gap-4 overflow-hidden px-5 py-6 md:grid-cols-2">
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
          Your preferences and feedback are saved only in your account. An AI Agent sees them only when you connect
          a <b>My Profile</b> block to that agent's Profile handle. Nothing is shared by default.
        </p>

        {loading && !data && <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Learn from my workflows</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span>{learningOn ? 'On' : 'Off'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={learningOn}
              aria-label="Learn from my workflows"
              onClick={() => setLearning(!learningOn)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${learningOn ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${learningOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </label>
          </div>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            When on, the app notices the blocks and apps you keep in workflows and the replies you rate. Only habits
            that repeat are used, and only by an AI Agent you connect to your profile. Workflows saved in privacy mode
            and ratings given in privacy mode are never counted.
          </p>

          {learning.enabled && learning.hints.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-[11px] font-semibold uppercase text-gray-400 dark:text-gray-500">
                What an AI Agent would be told
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-700 dark:text-gray-300">
                {learning.hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {learning.signals.length === 0 ? (
            <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">Nothing learned yet.</p>
          ) : (
            <ul className="mb-3 space-y-1.5">
              {learning.signals.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <span className="text-gray-700 dark:text-gray-200">{describeSignal(s)}</span>
                  <button
                    type="button"
                    onClick={() => deleteSignal(s.id)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400"
                    title="Forget this"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {learning.signals.length > 0 && (
            <button
              type="button"
              onClick={resetLearning}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Forget everything learned
            </button>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">Preferences</h2>
          {profile.preferences.length === 0 ? (
            <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">No preferences saved yet.</p>
          ) : (
            <ul className="mb-4 space-y-1.5">
              {profile.preferences.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <span className="min-w-0">
                    <span className="text-[11px] uppercase text-gray-400 dark:text-gray-500">{p.category}</span>{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-200">{p.key}</span>:{' '}
                    <span className="text-gray-600 dark:text-gray-300">{p.value}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => deletePreference(p.key)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400"
                    title="Delete preference"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={savePreference} className="grid grid-cols-1 gap-2 border-t border-gray-200 pt-3 sm:grid-cols-3 dark:border-gray-700">
            <input className={inputClass} placeholder="Category (e.g. travel)" value={prefCategory} onChange={(e) => setPrefCategory(e.target.value)} />
            <input className={inputClass} placeholder="Name (e.g. diet)" value={prefKey} onChange={(e) => setPrefKey(e.target.value)} />
            <input className={inputClass} placeholder="Value (e.g. vegetarian)" value={prefValue} onChange={(e) => setPrefValue(e.target.value)} />
            <div className="sm:col-span-3 flex items-center gap-3">
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
                Save preference
              </button>
              {prefError && <span className="text-sm text-red-600 dark:text-red-400">{prefError}</span>}
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <MessageSquare className="h-4 w-4 text-sky-600 dark:text-sky-400" /> Feedback history
          </h2>
          {profile.feedback.length === 0 ? (
            <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">No feedback yet. After a workflow run that gives an AI reply, you'll be asked to rate it, and it will appear here.</p>
          ) : (
            <ul className="mb-4 space-y-1.5">
              {profile.feedback.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{f.result_type}</span>
                    {f.rating !== null && <span className="ml-2 text-amber-600 dark:text-amber-400">{'★'.repeat(f.rating)}</span>}
                    {f.text && <span className="block text-gray-600 dark:text-gray-300">{f.text}</span>}
                    {f.created_at && (
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">{relativeDate(f.created_at)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteFeedback(f.id)}
                    className="shrink-0 text-red-500 hover:text-red-700 dark:text-red-400"
                    title="Delete feedback"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

        </section>
      </div>
    </div>
  )
}
