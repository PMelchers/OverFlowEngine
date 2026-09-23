import { Receipt } from 'lucide-react'
import { useRef } from 'react'
import { Handle, Position, useEdges, useNodeId, useNodes, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function CostEstimateNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const availableVariables = data.availableVariables ?? []
  const stopsRef = useRef<HTMLInputElement>(null)
  const nodeId = useNodeId()
  const edges = useEdges()
  const nodes = useNodes<BlockNodeData>()
  const modelEdge = edges.find((e) => e.target === nodeId && e.targetHandle === 'model')
  const modelNode = modelEdge ? nodes.find((n) => n.id === modelEdge.source) : undefined
  const connectedModel = modelNode?.data.model
    ? `${modelNode.data.model} (${modelNode.data.provider})`
    : undefined

  const insertIntoStops = (name: string) => {
    if (!name) return
    const token = `{${name}}`
    const el = stopsRef.current
    const current = data.waypoints ?? ''
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    data.onChange?.({ waypoints: next })
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
          : 'border-yellow-500 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-yellow-600" />
      <BlockHeader icon={<Receipt className="h-3 w-3" />} badgeClassName="bg-yellow-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-yellow-400 bg-white px-2 py-1 text-sm font-medium dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-yellow-800 dark:text-yellow-300">Model</label>
      <p
        className={`mb-2 w-full rounded border px-2 py-1 text-sm ${
          connectedModel
            ? 'border-yellow-400 bg-white text-yellow-700 dark:border-yellow-700 dark:bg-gray-900 dark:text-yellow-300'
            : 'border-dashed border-yellow-400 bg-yellow-50 text-yellow-500 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-500'
        }`}
      >
        {connectedModel ?? 'Connect an AI Model block below ↓ to search for real prices'}
      </p>

      <label className="mb-1 block text-[11px] font-medium text-yellow-800 dark:text-yellow-300">
        Route stops to price - passed ON THE WAY ("|"-separated)
      </label>
      <input
        ref={stopsRef}
        type="text"
        value={data.waypoints ?? ''}
        placeholder="e.g. {routeActivities}"
        onChange={(e) => data.onChange?.({ waypoints: e.target.value })}
        className="nodrag mb-1 w-full rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {availableVariables.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            insertIntoStops(e.target.value)
            e.target.value = ''
          }}
          className="nodrag mb-2 w-full rounded border border-yellow-400 bg-white px-2 py-1 text-sm text-yellow-700 dark:border-yellow-700 dark:bg-gray-900 dark:text-yellow-300"
        >
          <option value="">Insert a variable...</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.varType})
            </option>
          ))}
        </select>
      )}

      <label className="mb-1 block text-[11px] font-medium text-yellow-800 dark:text-yellow-300">
        Destination activities to price - done ONCE ARRIVED ("|"-separated)
      </label>
      <input
        type="text"
        value={data.destinationStops ?? ''}
        placeholder="e.g. {destinationStops}"
        onChange={(e) => data.onChange?.({ destinationStops: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <label className="mb-1 block text-[11px] font-medium text-yellow-800 dark:text-yellow-300">
        Origin (for the transport line)
      </label>
      <input
        type="text"
        value={data.origin ?? ''}
        placeholder="e.g. {startingAddress}"
        onChange={(e) => data.onChange?.({ origin: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <label className="mb-1 block text-[11px] font-medium text-yellow-800 dark:text-yellow-300">
        Destination context
      </label>
      <input
        type="text"
        value={data.activityContext ?? ''}
        placeholder="e.g. {destinationAddress}"
        onChange={(e) => data.onChange?.({ activityContext: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <p className="mb-1 text-[11px] font-semibold text-yellow-800 dark:text-yellow-300">
        Accommodation &amp; transport (leave blank to skip)
      </p>
      <div className="mb-2 grid grid-cols-2 gap-1">
        <input
          type="text"
          value={data.stayType ?? ''}
          placeholder="stay type, e.g. {stayType}"
          onChange={(e) => data.onChange?.({ stayType: e.target.value })}
          className="nodrag rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={data.transportMode ?? ''}
          placeholder="transport, e.g. {transportMode}"
          onChange={(e) => data.onChange?.({ transportMode: e.target.value })}
          className="nodrag rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={data.checkInDate ?? ''}
          placeholder="check-in, e.g. {tripStartDate}"
          onChange={(e) => data.onChange?.({ checkInDate: e.target.value })}
          className="nodrag rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={data.checkOutDate ?? ''}
          placeholder="check-out, e.g. {tripEndDate}"
          onChange={(e) => data.onChange?.({ checkOutDate: e.target.value })}
          className="nodrag rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      <p className="mb-1 text-[11px] font-semibold text-yellow-800 dark:text-yellow-300">
        Travelers (every price is the total for the group)
      </p>
      <div className="mb-2 grid grid-cols-2 gap-1">
        <input
          type="text"
          value={data.adults ?? ''}
          placeholder="adults, e.g. {tripAdults}"
          onChange={(e) => data.onChange?.({ adults: e.target.value })}
          className="nodrag rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={data.children ?? ''}
          placeholder="children, e.g. {tripChildren}"
          onChange={(e) => data.onChange?.({ children: e.target.value })}
          className="nodrag rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      <div className="mb-2 grid grid-cols-2 gap-1">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-yellow-800 dark:text-yellow-300">Budget</label>
          <input
            type="text"
            value={data.budget ?? ''}
            placeholder="e.g. {tripBudget}"
            onChange={(e) => data.onChange?.({ budget: e.target.value })}
            className="nodrag w-full rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-yellow-800 dark:text-yellow-300">Currency</label>
          <input
            type="text"
            value={data.currency ?? ''}
            placeholder="EUR"
            onChange={(e) => data.onChange?.({ currency: e.target.value })}
            className="nodrag w-full rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      <label className="mb-1 block text-[11px] font-medium text-yellow-800 dark:text-yellow-300">Save breakdown as</label>
      <input
        type="text"
        value={data.outputVariable ?? ''}
        placeholder="variable name (optional)"
        onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
        className="nodrag w-full rounded border border-yellow-400 bg-white px-2 py-1 text-sm dark:border-yellow-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <p className="mt-1 text-[10px] text-yellow-700 dark:text-yellow-400">
        Searches the web for real prices per stop, plus accommodation/transport if filled in, and
        shows a cost card in the sidebar - not just a console line. Every price is totaled for the
        whole group (not per person) and converted to Currency above - a price the AI couldn't
        convert is flagged, not silently trusted. Car/own-vehicle transport is priced as fuel only,
        never a rental.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-yellow-600" />
      <Handle type="target" position={Position.Bottom} id="model" className="!bg-yellow-600" />
    </GridSnapBox>
  )
}
