import { FileDown } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function TripSummaryNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-slate-400 bg-slate-50 dark:border-slate-600 dark:bg-slate-900'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500" />
      <BlockHeader icon={<FileDown className="h-3 w-3" />} badgeClassName="bg-slate-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm font-medium dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">Destination</label>
      <input
        type="text"
        value={data.activityContext ?? ''}
        placeholder="e.g. {destinationAddress}"
        onChange={(e) => data.onChange?.({ activityContext: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
      />

      <div className="mb-2 grid grid-cols-2 gap-1">
        <input
          type="text"
          value={data.checkInDate ?? ''}
          placeholder="from, e.g. {tripStartDate}"
          onChange={(e) => data.onChange?.({ checkInDate: e.target.value })}
          className="nodrag rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={data.checkOutDate ?? ''}
          placeholder="to, e.g. {tripEndDate}"
          onChange={(e) => data.onChange?.({ checkOutDate: e.target.value })}
          className="nodrag rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">Itinerary text</label>
      <input
        type="text"
        value={data.itinerary ?? ''}
        placeholder="e.g. {vacationPlan}"
        onChange={(e) => data.onChange?.({ itinerary: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
      />

      <div className="mb-2 grid grid-cols-2 gap-1">
        <input
          type="text"
          value={data.googleMapsLink ?? ''}
          placeholder="Google Maps link"
          onChange={(e) => data.onChange?.({ googleMapsLink: e.target.value })}
          className="nodrag rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={data.appleMapsLink ?? ''}
          placeholder="Apple Maps link"
          onChange={(e) => data.onChange?.({ appleMapsLink: e.target.value })}
          className="nodrag rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">Cost breakdown</label>
      <input
        type="text"
        value={data.costBreakdownData ?? ''}
        placeholder="e.g. {tripCostEstimate}"
        onChange={(e) => data.onChange?.({ costBreakdownData: e.target.value })}
        className="nodrag w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
      />

      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        Builds a clean PDF - itinerary, route links, cost table - from the fields above, and gives
        you a download button in the sidebar. Any field left blank is left out of the PDF.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-slate-500" />
    </GridSnapBox>
  )
}
