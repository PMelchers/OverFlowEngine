import { X, XCircle } from 'lucide-react'
import Modal from '../shared/Modal'
import { useAuthedResource } from '../shared/useAuthedResource'
import RunStatusBadge from './RunStatusBadge'
import { runDuration } from './runDuration'
import type { RunDetail } from './types'

function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '-'
}

export default function RunDetailModal({ runId, onClose }: { runId: number; onClose: () => void }) {
  const { data: run, loading, error } = useAuthedResource<RunDetail>(`/runs/${runId}`, 'Could not load this run')
  const errorCount = run?.steps.filter((s) => s.error).length ?? 0

  return (
    <Modal
      onClose={onClose}
      panelClassName="flex w-[36rem] max-w-[calc(100vw-2rem)] max-h-[85vh] flex-col rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
      labelledBy="run-detail-title"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="run-detail-title"
            className="truncate text-base font-semibold text-gray-800 dark:text-gray-100"
          >
            {run ? run.flow_name ?? 'Unsaved workflow' : 'Run details'}
          </h2>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">Run #{runId}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      ) : error || !run ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error ?? 'Could not load this run'}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500 dark:text-gray-400">Status</dt>
            <dd className="flex items-center gap-2">
              <RunStatusBadge status={run.status} />
              {errorCount > 0 && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {errorCount} step{errorCount === 1 ? '' : 's'} failed
                </span>
              )}
            </dd>
            <dt className="text-gray-500 dark:text-gray-400">Started</dt>
            <dd className="text-gray-700 dark:text-gray-200">{formatTime(run.created_at)}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Finished</dt>
            <dd className="text-gray-700 dark:text-gray-200">{formatTime(run.finished_at)}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Duration</dt>
            <dd className="text-gray-700 dark:text-gray-200">{runDuration(run.created_at, run.finished_at) ?? '-'}</dd>
          </dl>

          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Steps
          </h3>
          <ol className="mb-4 space-y-1">
            {run.steps.map((step, i) => (
              <li
                key={i}
                className={`rounded-lg px-2.5 py-1.5 text-xs ${
                  step.error
                    ? 'border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
                    : step.type === 'system'
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'bg-gray-50 dark:bg-gray-900'
                }`}
              >
                {step.type !== 'system' && (
                  <p
                    className={`mb-0.5 flex items-center gap-1 font-medium ${
                      step.error ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {step.error && <XCircle className="h-3 w-3 shrink-0" />}
                    {step.label}
                  </p>
                )}
                <p
                  className={`whitespace-pre-wrap break-words ${
                    step.error ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-300'
                  } ${step.type === 'system' ? 'italic' : ''}`}
                >
                  {step.message}
                </p>
              </li>
            ))}
          </ol>

          {Object.keys(run.variables).length > 0 && (
            <>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Variables
              </h3>
              <ul className="divide-y divide-gray-100 rounded-lg bg-gray-50 text-xs dark:divide-gray-700 dark:bg-gray-900">
                {Object.entries(run.variables).map(([name, v]) => (
                  <li key={name} className="flex gap-3 px-2.5 py-1.5">
                    <span className="shrink-0 font-mono font-medium text-gray-700 dark:text-gray-200">{name}</span>
                    <span className="min-w-0 break-words text-gray-600 dark:text-gray-300">{v.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
