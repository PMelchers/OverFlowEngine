import { Bike, CalendarDays, Car, ChevronDown, ExternalLink, Footprints, MapPin, Receipt, Route, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import Modal from '../shared/Modal'
import RouteMap from './RouteMap'
import { formatDuration } from './tripFormat'
import type { CostBreakdownItem, RouteDirections, RouteDirectionsLeg, TripSummary } from '../nodes/types'


function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`
}

const BOLD_RE = /\*\*(.+?)\*\*/g

function inline(text: string): ReactNode[] {
  // **bold** is the only inline markup AI itineraries reliably use; split keeps the
  // captured bold parts at the odd indexes.
  return text.split(BOLD_RE).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))
}

/** The same small markdown subset the old PDF renderer understood (#/##/### headings, -/*
 *  bullets, **bold**, blank-line paragraphs) - enough for an AI's day-by-day plan to read
 *  cleanly, without pulling in a markdown library for one view. */
function Itinerary({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length} className="mb-2 list-disc space-y-0.5 pl-5">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      )
      bullets = []
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const heading = /^(#{1,3})\s+(.*)/.exec(line)
    const bullet = /^[-*]\s+(.*)/.exec(line)
    if (!line) {
      flush()
    } else if (heading) {
      flush()
      blocks.push(
        heading[1].length === 1 ? (
          <h3 key={blocks.length} className="mb-1.5 mt-4 text-base font-semibold text-gray-900 first:mt-0 dark:text-gray-100">
            {inline(heading[2])}
          </h3>
        ) : (
          <h4 key={blocks.length} className="mb-1 mt-3 text-sm font-semibold text-gray-800 first:mt-0 dark:text-gray-200">
            {inline(heading[2])}
          </h4>
        ),
      )
    } else if (bullet) {
      bullets.push(bullet[1])
    } else {
      flush()
      blocks.push(
        <p key={blocks.length} className="mb-2">
          {inline(line)}
        </p>,
      )
    }
  }
  flush()
  return <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{blocks}</div>
}

function Leg({ leg, index, isLast, defaultOpen }: { leg: RouteDirectionsLeg; index: number; isLast: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <li className="rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">
            {leg.from} → {isLast ? leg.to : `Stop ${index + 1}: ${leg.to}`}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {leg.distanceKm.toLocaleString()} km · {formatDuration(leg.durationMin)} · {leg.steps.length} directions
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="divide-y divide-gray-100 border-t border-gray-200 dark:divide-gray-700/60 dark:border-gray-700">
          {leg.steps.map((step, i) => (
            <li
              key={i}
              className={`flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${
                step.arrival ? 'bg-amber-50 font-medium dark:bg-amber-950/40' : ''
              }`}
            >
              <span className={step.arrival ? 'text-amber-900 dark:text-amber-200' : 'text-gray-700 dark:text-gray-300'}>
                <span className="mr-2 inline-block w-6 text-right text-xs tabular-nums text-gray-400">{i + 1}</span>
                {step.instruction}
              </span>
              {step.distanceM > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">{formatDistance(step.distanceM)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

/** The route's defined stops in order, with how far into the trip each one is - the
 *  overview the turn-by-turn legs below are split by. */
function StopList({ route }: { route: RouteDirections }) {
  // Point i is reached at the end of leg i-1, so its distance is the sum of legs 0..i-1.
  const reached = route.points.map((_, i) => {
    const legs = route.legs.slice(0, i)
    return {
      km: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
      minutes: legs.reduce((sum, leg) => sum + leg.durationMin, 0),
    }
  })
  return (
    <ol className="space-y-1">
      {route.points.map((point, i) => {
        const badge =
          point.kind === 'start' ? 'bg-green-600' : point.kind === 'end' ? 'bg-red-600' : 'bg-amber-600'
        const title = point.kind === 'start' ? 'Start' : point.kind === 'end' ? 'Destination' : `Stop ${i}`
        return (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${badge}`}>
              {point.kind === 'stop' ? i : point.kind === 'start' ? 'A' : 'B'}
            </span>
            <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100">
              <span className="text-gray-500 dark:text-gray-400">{title}:</span> {point.name}
            </span>
            {i > 0 && (
              <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {Math.round(reached[i].km).toLocaleString()} km · {formatDuration(reached[i].minutes)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const MODE_META = {
  driving: { label: 'By car', icon: Car },
  cycling: { label: 'By bike', icon: Bike },
  walking: { label: 'On foot', icon: Footprints },
} as const

function RouteTab({ summary }: { summary: TripSummary }) {
  const route = summary.directions
  const ModeIcon = route ? MODE_META[route.mode].icon : Route
  return (
    <div className="space-y-4">
      {route ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5 font-medium">
              <ModeIcon className="h-4 w-4" /> {MODE_META[route.mode].label}
            </span>
            <span>{route.distanceKm.toLocaleString()} km</span>
            <span>about {formatDuration(route.durationMin)} without breaks</span>
          </div>
          <StopList route={route} />
          <RouteMap route={route} />
          {route.skippedStops.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Left out of the route because they couldn't be found on the map: {route.skippedStops.join(', ')}
            </p>
          )}
          <ul className="space-y-2">
            {route.legs.map((leg, i) => (
              <Leg key={i} leg={leg} index={i} isLast={i === route.legs.length - 1} defaultOpen={route.legs.length === 1} />
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-400">
          {summary.directionsNote ? summary.directionsNote.charAt(0).toUpperCase() + summary.directionsNote.slice(1) : 'No route directions.'}
        </p>
      )}
      {summary.routeLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.routeLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

const CATEGORY_LABELS: Record<CostBreakdownItem['category'], string> = {
  route_activity: 'On the way',
  destination_activity: 'At the destination',
  accommodation: 'Accommodation',
  transport: 'Transport',
}

function CostsTab({ summary }: { summary: TripSummary }) {
  const costs = summary.costBreakdown!
  const money = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${costs.currency}`
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <th className="py-1.5 font-medium">Item</th>
            <th className="py-1.5 font-medium">Category</th>
            <th className="py-1.5 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {costs.items.map((item, i) => (
            <tr key={i} className="text-gray-700 dark:text-gray-300">
              <td className="py-1.5 pr-2">
                {item.name}
                {item.note && <span className="block text-xs text-gray-500 dark:text-gray-400">{item.note}</span>}
              </td>
              <td className="py-1.5 pr-2 text-gray-500 dark:text-gray-400">{CATEGORY_LABELS[item.category] ?? item.category}</td>
              <td className="py-1.5 text-right tabular-nums">{money(item.estimated_cost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-300 font-semibold text-gray-900 dark:border-gray-600 dark:text-gray-100">
            <td className="py-2" colSpan={2}>
              Total
            </td>
            <td className="py-2 text-right tabular-nums">{money(costs.total)}</td>
          </tr>
        </tfoot>
      </table>
      {costs.budget !== null && (
        <p className={`mt-2 text-sm ${costs.overBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {costs.overBudget ? 'Over' : 'Under'} the budget of {money(costs.budget)}
        </p>
      )}
    </div>
  )
}

type Tab = 'itinerary' | 'route' | 'costs'

/** Full in-app view of a Trip Summary block's result - replaces the PDF download it used
 *  to produce. Only tabs with something in them are shown. */
export default function TripSummaryView({ summary, onClose }: { summary: TripSummary; onClose: () => void }) {
  const titleId = useId()
  const tabs: { id: Tab; label: string; icon: typeof Route }[] = [
    ...(summary.itinerary ? [{ id: 'itinerary' as const, label: 'Itinerary', icon: CalendarDays }] : []),
    { id: 'route', label: 'Route', icon: MapPin },
    ...(summary.costBreakdown?.items?.length ? [{ id: 'costs' as const, label: 'Costs', icon: Receipt }] : []),
  ]
  const [tab, setTab] = useState<Tab>(tabs[0].id)

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex max-h-[85vh] w-[min(48rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800"
    >
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 pt-4 dark:border-gray-700">
        <div className="min-w-0 pb-3">
          <h2 id={titleId} className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
            {summary.destination ? `Trip to ${summary.destination}` : 'Trip summary'}
          </h2>
          {(summary.dateRange || summary.origin) && (
            <p className="truncate text-sm text-gray-500 dark:text-gray-400">
              {[summary.origin && `from ${summary.origin}`, summary.dateRange].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div role="tablist" className="flex gap-1 border-b border-gray-200 px-4 dark:border-gray-700">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-slate-700 text-slate-900 dark:border-slate-300 dark:text-slate-100'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === 'itinerary' && <Itinerary text={summary.itinerary} />}
        {tab === 'route' && <RouteTab summary={summary} />}
        {tab === 'costs' && <CostsTab summary={summary} />}
      </div>
    </Modal>
  )
}
