import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import type { SubgraphEdge, SubgraphNode } from './nodes/types'

type FlowSummary = { id: number; name: string; created_at: string }

export default function FlowsPanel({
  onClose,
  onLoad,
  onSaveCurrent,
}: {
  onClose: () => void
  onLoad: (nodes: SubgraphNode[], edges: SubgraphEdge[]) => void
  onSaveCurrent: (name: string) => Promise<void>
}) {
  const { authedFetch } = useAuth()
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingId, setLoadingId] = useState<number | null>(null)

  const loadList = async () => {
    setLoading(true)
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
    loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSaveCurrent(name)
      setName('')
      await loadList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this flow')
    } finally {
      setSaving(false)
    }
  }

  const handleLoad = async (id: number) => {
    setError(null)
    setLoadingId(id)
    try {
      const res = await authedFetch(`/flows/${id}`)
      if (!res.ok) throw new Error('Could not load that flow')
      const body = await res.json()
      onLoad(body.nodes, body.edges)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that flow')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    await authedFetch(`/flows/${id}`, { method: 'DELETE' })
    setFlows((f) => f.filter((flow) => flow.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-96 rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">My Flows</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        ) : flows.length === 0 ? (
          <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">No saved flows yet.</p>
        ) : (
          <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto">
            {flows.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <span className="truncate font-medium text-gray-700 dark:text-gray-200">{f.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoad(f.id)}
                    disabled={loadingId === f.id}
                    className="text-blue-600 hover:text-blue-800 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {loadingId === f.id ? 'Loading...' : 'Load'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(f.id)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title="Delete"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSave} className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <input
            type="text"
            required
            placeholder="Flow name, e.g. Email Auto-Reply"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save current canvas as new flow'}
          </button>
        </form>
      </div>
    </div>
  )
}
