import { Blocks, Plus, Settings as SettingsIcon, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import AuthModal from './AuthModal'
import { useAuth } from './auth'
import { TEMPLATES } from './templates'

type FlowSummary = { id: number; name: string; created_at: string }

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function Dashboard({
  onCreateNew,
  onCreateFromTemplate,
  onOpenFlow,
  onOpenSettings,
}: {
  onCreateNew: () => void
  onCreateFromTemplate: (templateId: string) => void
  onOpenFlow: (flowId: number) => void
  onOpenSettings: () => void
}) {
  const { user, authedFetch } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadFlows = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const res = await authedFetch('/flows')
      if (!res.ok) throw new Error('Could not load your saved flows')
      setFlows(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your saved flows')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFlows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const deleteFlow = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return
    setDeletingId(id)
    try {
      await authedFetch(`/flows/${id}`, { method: 'DELETE' })
      setFlows((f) => f.filter((flow) => flow.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const displayName = user?.name || user?.email || ''
  const firstName = displayName.split(/[\s@]/)[0]

  return (
    <div className="flex h-screen w-screen bg-white dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2.5 px-4 pt-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-red-600 text-white shadow-sm">
            <Zap className="h-4 w-4" fill="currentColor" />
          </div>
          <span className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-50">OverFlowEngine</span>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={onCreateNew}
            className="flex w-full items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> New Workflow
          </button>
        </div>

        <nav className="space-y-0.5 px-3">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <SettingsIcon className="h-4 w-4" /> Settings
          </button>
        </nav>

        <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
          <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Saved Flows
          </p>
          <div className="flex-1 overflow-y-auto pb-2">
            {!user ? (
              <p className="px-2.5 py-1 text-xs text-gray-400 dark:text-gray-500">Sign in to see your flows.</p>
            ) : loading ? (
              <p className="px-2.5 py-1 text-xs text-gray-400 dark:text-gray-500">Loading...</p>
            ) : error ? (
              <p className="px-2.5 py-1 text-xs text-red-500 dark:text-red-400">{error}</p>
            ) : flows.length === 0 ? (
              <p className="px-2.5 py-1 text-xs text-gray-400 dark:text-gray-500">No saved flows yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {flows.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onOpenFlow(f.id)}
                      title={`Saved ${relativeDate(f.created_at)}`}
                      className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-gray-200/60 dark:hover:bg-gray-800"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400 dark:bg-blue-500" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
                        {f.name}
                      </span>
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => deleteFlow(f.id, f.name, e)}
                        className={`shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-gray-500 dark:hover:text-red-400 ${
                          deletingId === f.id ? 'opacity-100' : ''
                        }`}
                        title="Delete"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          {user ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-200/60 dark:hover:bg-gray-800"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-red-500 text-[11px] font-bold text-white">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                {displayName}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Sign in
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6">
        <div className="w-full max-w-2xl">
          <h1 className="mb-6 flex items-center justify-center gap-2.5 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            <Zap className="h-7 w-7 text-blue-600 dark:text-blue-400" fill="currentColor" />
            {user ? `Back at it, ${firstName}` : 'Welcome to OverFlowEngine'}
          </h1>

          <button
            type="button"
            onClick={onCreateNew}
            className="group flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-left shadow-sm transition-all duration-150 hover:border-blue-300 hover:bg-white hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:bg-gray-800"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition-transform group-hover:scale-105">
              <Plus className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                Start a new workflow
              </span>
              <span className="block text-xs text-gray-400 dark:text-gray-500">
                Open a blank canvas and drag blocks onto it
              </span>
            </span>
          </button>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.description}
                onClick={() => onCreateFromTemplate(t.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-all duration-150 hover:border-red-300 hover:bg-red-50 hover:text-red-700 active:scale-[0.97] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
              >
                <Blocks className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </main>

      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
    </div>
  )
}
