import { Bed, Car, MapPinned, Receipt, Search, Ticket, X } from 'lucide-react'
import type { CostBreakdown, CostBreakdownItem } from './nodes/types'

const CATEGORY_META: Record<CostBreakdownItem['category'], { label: string; icon: typeof Ticket }> = {
  route_activity: { label: 'On the way', icon: MapPinned },
  destination_activity: { label: 'At the destination', icon: Ticket },
  accommodation: { label: 'Accommodation', icon: Bed },
  transport: { label: 'Transport', icon: Car },
}

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`
}

/** Renders a Cost Estimate block's result as an actual priced table (grouped by
 *  activities/accommodation/transport) instead of a plain console line - shown in the
 *  sidebar once a run produces a costBreakdown step. */
export default function CostSummaryCard({ breakdown, onClose }: { breakdown: CostBreakdown; onClose: () => void }) {
  const groups = (['route_activity', 'destination_activity', 'accommodation', 'transport'] as const)
    .map((category) => ({ category, items: breakdown.items.filter((i) => i.category === category) }))
    .filter((g) => g.items.length > 0)

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

      <div className="max-h-56 overflow-y-auto px-3 py-2">
        {groups.length === 0 ? (
          <p className="text-xs text-yellow-700 dark:text-yellow-400">Nothing priced yet.</p>
        ) : (
          groups.map((group) => {
            const meta = CATEGORY_META[group.category]
            const Icon = meta.icon
            const subtotal = group.items.reduce((s, i) => s + i.estimated_cost, 0)
            return (
              <div key={group.category} className="mb-2 last:mb-0">
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-400">
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                  <span className="font-mono text-[10px] text-yellow-600 dark:text-yellow-500">
                    {formatMoney(subtotal, group.items[0]?.currency ?? breakdown.currency)}
                  </span>
                </div>
                <ul className="space-y-1">
                  {group.items.map((item, i) => (
                    <li key={i} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-yellow-900 dark:text-yellow-200">
                        {item.name}
                        {item.note && (
                          <span className="block text-[10px] text-yellow-600 dark:text-yellow-500">{item.note}</span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono font-medium text-yellow-800 dark:text-yellow-300">
                        {formatMoney(item.estimated_cost, item.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })
        )}
      </div>

      <div className="border-t border-yellow-200 px-3 py-2 dark:border-yellow-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-yellow-900 dark:text-yellow-200">Total</span>
          <span className="font-mono text-sm font-bold text-yellow-900 dark:text-yellow-100">
            {formatMoney(breakdown.total, breakdown.currency)}
          </span>
        </div>
        {breakdown.budget !== null && (
          <p
            className={`mt-1 text-[11px] font-medium ${
              breakdown.overBudget ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            }`}
          >
            {breakdown.overBudget ? 'Over' : 'Under'} your budget of {formatMoney(breakdown.budget, breakdown.currency)}
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
