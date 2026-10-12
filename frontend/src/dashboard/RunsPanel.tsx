import { History, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../shared/auth'
import { relativeDate } from '../shared/relativeDate'
import RunDetailModal from './RunDetailModal'
import RunStatusBadge from './RunStatusBadge'
import { runDuration } from './runDuration'
import type { RunSummary } from './types'

const PAGE_SIZE = 20

/** The signed-in user's workflow runs, newest first, each opening its own detail
 *  dialog. Loads its own data (unlike Tasks/Assignments, which share Dashboard's state)
 *  because nothing else on the dashboard needs the runs - and it pages by appending,
 *  which useAuthedResource doesn't do. */
export default function RunsPanel() {
  const { authedFetch } = useAuth()
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openRunId, setOpenRunId] = useState<number | null>(null)

  const fetchPage = useCallback(
    async (offset: number) => {
      const res = await authedFetch(`/runs?limit=${PAGE_SIZE}&offset=${offset}`)
      if (!res.ok) throw new Error('Could not load your runs')
      const page: RunSummary[] = await res.json()
      setRuns((prev) => (offset === 0 ? page : [...prev, ...page]))
      // A full page may or may not be followed by more - in the rare exact-multiple case
      // "Load more" just comes back empty, which beats a separate count query.
      setHasMore(page.length === PAGE_SIZE)
    },
    [authedFetch],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await fetchPage(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your runs')
    } finally {
      setLoading(false)
    }
  }, [fetchPage])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      await fetchPage(runs.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your runs')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    reload()
    // Only on mount: authedFetch's identity changes with the token, and the dashboard
    // already remounts this panel on sign-in/out (it only renders for a signed-in user).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
          <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Recent runs
        </h2>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="rounded-lg border border-gray-200 p-1 text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
          title="Refresh runs"
          aria-label="Refresh runs"
        >
          <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="mb-3 text-[11px] text-gray-400 dark:text-gray-500">
        Every workflow you run while signed in. Click a run to see what each block did.
      </p>
      {loading && runs.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Loading...</p>
      ) : error ? (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      ) : runs.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">No runs yet - run a workflow from the editor.</p>
      ) : (
        <>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {runs.map((run) => {
              const duration = runDuration(run.created_at, run.finished_at)
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => setOpenRunId(run.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {/* Fixed width so the names line up whatever the badge says. */}
                    <span className="w-[8.5rem] shrink-0">
                      <RunStatusBadge status={run.status} />
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        run.flow_name
                          ? 'text-gray-700 dark:text-gray-200'
                          : 'italic text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {run.flow_name ?? 'Unsaved workflow'}
                    </span>
                    {duration && (
                      <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{duration}</span>
                    )}
                    <span
                      className="w-14 shrink-0 text-right text-[11px] text-gray-400 dark:text-gray-500"
                      title={new Date(run.created_at).toLocaleString()}
                    >
                      {relativeDate(run.created_at)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-2 w-full rounded-lg border border-gray-200 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </>
      )}
      {openRunId != null && <RunDetailModal runId={openRunId} onClose={() => setOpenRunId(null)} />}
    </section>
  )
}
