import { ChevronDown, Package } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import CostSummaryCard from '../CostSummaryCard'
import type { CostBreakdown } from '../nodes/types'
import TripPdfCard, { type TripPdf } from '../TripPdfCard'
import type { PendingChoice, StoredVariable } from './useWorkflowRun'

interface CanvasSidebarProps {
  pendingChoice: PendingChoice | null
  onResolveChoice: (option: string) => void
  variables: Record<string, StoredVariable>
  costSummary: CostBreakdown | null
  onCloseCostSummary: () => void
  tripPdf: TripPdf | null
  onCloseTripPdf: () => void
  logs: string[]
  onClearLogs: () => void
}

export default function CanvasSidebar({
  pendingChoice,
  onResolveChoice,
  variables,
  costSummary,
  onCloseCostSummary,
  tripPdf,
  onCloseTripPdf,
  logs,
  onClearLogs,
}: CanvasSidebarProps) {
  const [variablesOpen, setVariablesOpen] = useState(false)
  const consoleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight })
  }, [logs])

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 border-l border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
      {pendingChoice && (
        <div className="shrink-0 rounded-xl border border-blue-300 bg-gradient-to-br from-blue-50 to-cyan-50 p-3 shadow-sm dark:border-blue-700 dark:from-blue-950 dark:to-cyan-950">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-blue-800 dark:text-blue-200">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
              ?
            </span>
            <span className="truncate">{pendingChoice.label}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {pendingChoice.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onResolveChoice(opt)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow active:scale-[0.97]"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="shrink-0">
        <button
          type="button"
          onClick={() => setVariablesOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <span className="flex items-center gap-1.5">
            <Package className="h-4 w-4" /> Saved Variables
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              {Object.keys(variables).length}
            </span>
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${variablesOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {variablesOpen && (
          <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            {Object.keys(variables).length === 0 ? (
              <p className="p-3 text-sm text-gray-400 dark:text-gray-500">Nothing saved yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {Object.entries(variables).map(([name, v]) => (
                  <li key={name} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span
                      className="shrink-0 truncate font-mono text-xs font-medium text-gray-700 dark:text-gray-200"
                      title={name}
                    >
                      {name}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="truncate font-mono text-xs text-gray-500 dark:text-gray-400"
                        title={v.value}
                      >
                        {v.value}
                      </span>
                      <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gray-400 dark:bg-gray-700 dark:text-gray-400">
                        {v.type}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {costSummary && <CostSummaryCard breakdown={costSummary} onClose={onCloseCostSummary} />}
      {tripPdf && <TripPdfCard pdf={tripPdf} onClose={onCloseTripPdf} />}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.5)]" />
            Console
          </span>
          <button
            type="button"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-500 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            Clear
          </button>
        </div>
        <div ref={consoleRef} className="console-scroll flex-1 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-600">No activity yet - run the workflow to see it here.</p>
          ) : (
            logs.map((entry, i) => (
              <p key={i} className="whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">
                <span className="text-emerald-600 dark:text-emerald-500">›</span> {entry}
              </p>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
