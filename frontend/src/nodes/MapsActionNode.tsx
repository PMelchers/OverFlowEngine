import { MapPin } from 'lucide-react'
import { useRef } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

const TRAVEL_MODES: { value: NonNullable<BlockNodeData['travelMode']>; label: string }[] = [
  { value: 'driving', label: 'Driving' },
  { value: 'walking', label: 'Walking' },
  { value: 'transit', label: 'Transit' },
  { value: 'bicycling', label: 'Bicycling (Google only)' },
]

export default function MapsActionNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const availableVariables = data.availableVariables ?? []
  const destRef = useRef<HTMLInputElement>(null)

  const insertIntoDestination = (name: string) => {
    if (!name) return
    const token = `{${name}}`
    const el = destRef.current
    const current = data.destination ?? ''
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    data.onChange?.({ destination: next })
    requestAnimationFrame(() => {
      el?.focus()
      const caret = start + token.length
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-lime-500 bg-lime-50 dark:border-lime-700 dark:bg-lime-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-lime-600" />
      <BlockHeader icon={<MapPin className="h-3 w-3" />} badgeClassName="bg-lime-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-lime-400 bg-white px-2 py-1 text-sm font-medium dark:border-lime-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-lime-800 dark:text-lime-300">Provider</label>
      <div className="nodrag mb-2 flex overflow-hidden rounded border border-lime-400 text-xs font-semibold dark:border-lime-700">
        <button
          type="button"
          onClick={() => data.onChange?.({ mapsProvider: 'google' })}
          className={`flex-1 py-1 ${
            (data.mapsProvider ?? 'google') === 'google'
              ? 'bg-lime-600 text-white'
              : 'bg-white text-lime-700 dark:bg-gray-900 dark:text-lime-300'
          }`}
        >
          Google Maps
        </button>
        <button
          type="button"
          onClick={() => data.onChange?.({ mapsProvider: 'apple' })}
          className={`flex-1 border-l border-lime-400 py-1 dark:border-lime-700 ${
            data.mapsProvider === 'apple'
              ? 'bg-lime-600 text-white'
              : 'bg-white text-lime-700 dark:bg-gray-900 dark:text-lime-300'
          }`}
        >
          Apple Maps
        </button>
      </div>

      <label className="mb-1 block text-[11px] font-medium text-lime-800 dark:text-lime-300">
        Origin (optional - blank asks the maps app to use current location)
      </label>
      <input
        type="text"
        value={data.origin ?? ''}
        placeholder="e.g. Home"
        onChange={(e) => data.onChange?.({ origin: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-lime-400 bg-white px-2 py-1 text-sm dark:border-lime-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <label className="mb-1 block text-[11px] font-medium text-lime-800 dark:text-lime-300">Destination</label>
      <input
        ref={destRef}
        type="text"
        value={data.destination ?? ''}
        placeholder="e.g. {destinationCountry}"
        onChange={(e) => data.onChange?.({ destination: e.target.value })}
        className="nodrag mb-1 w-full rounded border border-lime-400 bg-white px-2 py-1 text-sm dark:border-lime-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {availableVariables.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            insertIntoDestination(e.target.value)
            e.target.value = ''
          }}
          className="nodrag mb-2 w-full rounded border border-lime-400 bg-white px-2 py-1 text-sm text-lime-700 dark:border-lime-700 dark:bg-gray-900 dark:text-lime-300"
        >
          <option value="">Insert a variable into Destination...</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.varType})
            </option>
          ))}
        </select>
      )}

      <label className="mb-1 block text-[11px] font-medium text-lime-800 dark:text-lime-300">Travel mode</label>
      <select
        value={data.travelMode ?? 'driving'}
        onChange={(e) => data.onChange?.({ travelMode: e.target.value as BlockNodeData['travelMode'] })}
        className="nodrag mb-2 w-full rounded border border-lime-400 bg-white px-2 py-1 text-sm dark:border-lime-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {TRAVEL_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-[11px] font-medium text-lime-800 dark:text-lime-300">Save link as</label>
      <input
        type="text"
        value={data.outputVariable ?? ''}
        placeholder="variable name (optional)"
        onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
        className="nodrag w-full rounded border border-lime-400 bg-white px-2 py-1 text-sm dark:border-lime-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <p className="mt-1 text-[10px] text-lime-700 dark:text-lime-400">
        Builds a real, working directions link - no API key needed.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-lime-600" />
    </GridSnapBox>
  )
}
