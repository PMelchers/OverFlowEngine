import { Lightbulb } from 'lucide-react'
import { useRef } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { ActivitySuggestionBlockData } from './types'
import { useConnectedModel } from './useConnectedModel'
import { useVariableInsertion } from './useVariableInsertion'

export default function ActivitySuggestionNode({ data }: NodeProps<ActivitySuggestionBlockData>) {
  const active = data.status === 'active'
  const availableVariables = data.availableVariables ?? []
  const contextRef = useRef<HTMLInputElement>(null)
  const connectedModel = useConnectedModel()

  const insertIntoContext = useVariableInsertion(contextRef, data.activityContext ?? '', (next) =>
    data.onChange?.({ activityContext: next }),
  )

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-orange-400 bg-orange-50 dark:border-orange-700 dark:bg-orange-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-orange-500" />
      <BlockHeader icon={<Lightbulb className="h-3 w-3" />} badgeClassName="bg-orange-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-orange-300 bg-white px-2 py-1 text-sm font-medium dark:border-orange-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-orange-800 dark:text-orange-300">
        Starting point (so route stops can be spread across the whole trip, not just near the destination)
      </label>
      <input
        type="text"
        value={data.origin ?? ''}
        placeholder="e.g. {startingAddress}"
        onChange={(e) => data.onChange?.({ origin: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-orange-300 bg-white px-2 py-1 text-sm dark:border-orange-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <label className="mb-1 block text-[11px] font-medium text-orange-800 dark:text-orange-300">
        Destination
      </label>
      <input
        ref={contextRef}
        type="text"
        value={data.activityContext ?? ''}
        placeholder="e.g. {destinationAddress}"
        onChange={(e) => data.onChange?.({ activityContext: e.target.value })}
        className="nodrag mb-1 w-full rounded border border-orange-300 bg-white px-2 py-1 text-sm dark:border-orange-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {availableVariables.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            insertIntoContext(e.target.value)
            e.target.value = ''
          }}
          className="nodrag mb-2 w-full rounded border border-orange-300 bg-white px-2 py-1 text-sm text-orange-700 dark:border-orange-700 dark:bg-gray-900 dark:text-orange-300"
        >
          <option value="">Insert a variable...</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.varType})
            </option>
          ))}
        </select>
      )}

      <label className="mb-1 block text-[11px] font-medium text-orange-800 dark:text-orange-300">Model</label>
      <p
        className={`mb-2 w-full rounded border px-2 py-1 text-sm ${
          connectedModel
            ? 'border-orange-300 bg-white text-orange-700 dark:border-orange-700 dark:bg-gray-900 dark:text-orange-300'
            : 'border-dashed border-orange-300 bg-orange-50 text-orange-400 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-500'
        }`}
      >
        {connectedModel ?? 'Connect an AI Model block below ↓ for real suggestions'}
      </p>

      <label className="mb-1 block text-[11px] font-medium text-orange-800 dark:text-orange-300">
        Interests (optional)
      </label>
      <input
        type="text"
        value={data.interests ?? ''}
        placeholder="e.g. hiking, local food"
        onChange={(e) => data.onChange?.({ interests: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-orange-300 bg-white px-2 py-1 text-sm dark:border-orange-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <label className="mb-1 block text-[11px] font-medium text-orange-800 dark:text-orange-300">
        Save accepted route stops as
      </label>
      <input
        type="text"
        value={data.outputVariable ?? ''}
        placeholder="e.g. routeActivities"
        onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-orange-300 bg-white px-2 py-1 text-sm dark:border-orange-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <label className="mb-1 block text-[11px] font-medium text-orange-800 dark:text-orange-300">
        Save accepted destination activities as
      </label>
      <input
        type="text"
        value={data.destinationOutputVariable ?? ''}
        placeholder="e.g. destinationStops"
        onChange={(e) => data.onChange?.({ destinationOutputVariable: e.target.value })}
        className="nodrag w-full rounded border border-orange-300 bg-white px-2 py-1 text-sm dark:border-orange-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <p className="mt-1 text-[10px] text-orange-700 dark:text-orange-400">
        Pauses the run with two suggestion lists: stops spread across the WHOLE route from start to
        destination - could be 20km in or 200km in, not just near the end (reference the first
        variable from a Maps Route block's Waypoints field, e.g. {'{routeActivities}'}) - and things
        to do ONCE AT the destination (not added to the route - reference the second variable from
        a Trip Cost block's Destination activities field). Rejecting leaves both unchanged.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-orange-500" />
      <Handle type="target" position={Position.Bottom} id="model" className="!bg-orange-500" />
    </GridSnapBox>
  )
}
