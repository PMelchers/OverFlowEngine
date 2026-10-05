import { AlertTriangle, Bed, Car, MapPinned, Receipt, Search, Ticket, X } from 'lucide-react'
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
/** An item with no price and a note is either a parse failure or one the AI skipped
 *  despite instructions - either way, not a real 0-cost item, so flag it like a currency
 *  mismatch rather than let it blend in as "this genuinely costs nothing". */
function isUnreliable(item: CostBreakdownItem, breakdownCurrency: string) {
  return item.currency !== breakdownCurrency || (item.estimated_cost === 0 && item.note.length > 0)
}

export default function CostSummaryCard({ breakdown, onClose }: { breakdown: CostBreakdown; onClose: () => void }) {
  const groups = (['route_activity', 'destination_activity', 'accommodation', 'transport'] as const)
    .map((category) => ({ category, items: breakdown.items.filter((i) => i.category === category) }))
    .filter((g) => g.items.length > 0)
  const hasUnreliable = breakdown.items.some((i) => isUnreliable(i, breakdown.currency))

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

      {hasUnreliable && (
        <p className="flex items-center gap-1.5 border-b border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {breakdown.currencyWarning
            ? "One or more prices weren't converted to " + breakdown.currency + " - "
            : ''}
          Some items below weren't priced (parse failure or skipped by the AI) - the total is
          likely too low.
        </p>
      )}

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
                  {group.items.map((item, i) => {
                    const unreliable = isUnreliable(item, breakdown.currency)
                    return (
                      <li key={i} className="flex items-start justify-between gap-2 text-xs">
                        <span className={unreliable ? 'text-red-700 dark:text-red-400' : 'text-yellow-900 dark:text-yellow-200'}>
                          {item.name}
                          {item.live && (
                            <span className="ml-1 rounded bg-green-600 px-1 py-px align-middle text-[9px] font-semibold uppercase text-white">
                              live
                            </span>
                          )}
                          {item.note && (
                            <span
                              className={`block text-[10px] ${unreliable ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-500'}`}
                            >
                              {item.note}
                            </span>
                          )}
                          {item.fuelStops && item.fuelStops.length > 0 && (
                            <details className="mt-1 text-[10px] text-yellow-700 dark:text-yellow-400">
                              <summary className="cursor-pointer font-medium">
                                {item.fuelStops.length} fuel stop{item.fuelStops.length === 1 ? '' : 's'}
                              </summary>
                              <ol className="mt-1 space-y-0.5 pl-1">
                                {item.fuelStops.map((stop, n) => (
                                  <li key={n} className="flex justify-between gap-2 font-mono">
                                    <span>
                                      {n + 1}. km {stop.km.toLocaleString()} · {stop.country}
                                    </span>
                                    <span>
                                      {stop.liters} L × {stop.pricePerLiter.toFixed(2)} = {stop.cost.toFixed(2)}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            </details>
                          )}
                        </span>
                        <span
                          className={`shrink-0 font-mono font-medium ${unreliable ? 'text-red-700 dark:text-red-400' : 'text-yellow-800 dark:text-yellow-300'}`}
                        >
                          {formatMoney(item.estimated_cost, item.currency)}
                        </span>
                      </li>
                    )
                  })}
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
          {breakdown.items.some((i) => i.live)
            ? 'Items marked live use current booking-site prices; the rest via AI web search'
            : breakdown.searched
              ? 'Prices found via live web search'
              : 'Rough AI estimate - not searched'}
        </p>
      </div>
    </div>
  )
}
