import { Receipt, Search, X } from 'lucide-react'
import type { CostBreakdown } from './nodes/types'

/** Renders a Cost Estimate block's result as an actual priced table instead of a plain
 *  console line - shown in the sidebar once a run produces a costBreakdown step. */
export default function CostSummaryCard({ breakdown, onClose }: { breakdown: CostBreakdown; onClose: () => void }) {
  return (
    <div className="mb-3 shrink-0 overflow-hidden rounded-xl border border-yellow-300 bg-yellow-50 shadow-sm dark:border-yellow-800 dark:bg-yellow-950">
      <div className="flex items-center justify-between border-b border-yellow-200 px-3 py-2 dark:border-yellow-800">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-yellow-800 dark:text-yellow-300">
          <Receipt className="h-3.5 w-3.5" /> Trip Cost
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-yellow-500 hover:text-yellow-700 dark:text-yellow-500 dark:hover:text-yellow-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto px-3 py-2">
        {breakdown.items.length === 0 ? (
          <p className="text-xs text-yellow-700 dark:text-yellow-400">No priced stops.</p>
        ) : (
          <ul className="space-y-1">
            {breakdown.items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-xs">
                <span className="text-yellow-900 dark:text-yellow-200">
                  {item.name}
                  {item.note && <span className="block text-[10px] text-yellow-600 dark:text-yellow-500">{item.note}</span>}
                </span>
                <span className="shrink-0 font-mono font-medium text-yellow-800 dark:text-yellow-300">
                  {item.estimated_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} {item.currency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-yellow-200 px-3 py-2 dark:border-yellow-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-yellow-900 dark:text-yellow-200">Total</span>
          <span className="font-mono text-sm font-bold text-yellow-900 dark:text-yellow-100">
            {breakdown.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} {breakdown.currency}
          </span>
        </div>
        {breakdown.budget !== null && (
          <p
            className={`mt-1 text-[11px] font-medium ${
              breakdown.overBudget ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            }`}
          >
            {breakdown.overBudget ? 'Over' : 'Under'} your budget of{' '}
            {breakdown.budget.toLocaleString(undefined, { maximumFractionDigits: 0 })} {breakdown.currency}
          </p>
        )}
        <p className="mt-1 flex items-center gap-1 text-[10px] text-yellow-600 dark:text-yellow-500">
          <Search className="h-3 w-3" />
          {breakdown.searched ? 'Prices found via live web search' : 'Rough AI estimate - not searched'}
        </p>
      </div>
    </div>
  )
}
