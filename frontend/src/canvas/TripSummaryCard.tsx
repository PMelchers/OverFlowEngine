import { Maximize2, Route, X } from 'lucide-react'
import { useState } from 'react'
import type { TripSummary } from '../nodes/types'
import { formatDuration } from './tripFormat'
import TripSummaryView from './TripSummaryView'

/** Sidebar card for a Trip Summary block's result. The sidebar is too narrow for a full
 *  itinerary plus a long list of directions, so the card only shows the headline numbers
 *  and opens the full TripSummaryView. A new run's summary pops the view open by itself,
 *  since looking at it is the whole point of the block. */
export default function TripSummaryCard({
  summary,
  onClose,
}: {
  summary: TripSummary
  onClose: () => void
}) {
  const [open, setOpen] = useState(true)
  // React's "adjust state while rendering" pattern: a different summary object means a new
  // run produced it, so reopen the view without an effect (and its extra closed render).
  const [shownSummary, setShownSummary] = useState(summary)
  if (shownSummary !== summary) {
    setShownSummary(summary)
    setOpen(true)
  }
  const route = summary.directions

  return (
    <div className="mb-3 shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          <Route className="h-3.5 w-3.5" /> Trip Summary
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close trip summary"
          className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
            {summary.destination ? `Trip to ${summary.destination}` : 'Trip summary'}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {route
              ? `${route.distanceKm.toLocaleString()} km · ${formatDuration(route.durationMin)}`
              : summary.dateRange || 'No route directions'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Open
        </button>
      </div>
      {open && <TripSummaryView summary={summary} onClose={() => setOpen(false)} />}
    </div>
  )
}
