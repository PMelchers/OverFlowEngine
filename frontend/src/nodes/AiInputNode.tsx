import { LogIn } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { AiInputBlockData } from './types'

export default function AiInputNode({ data }: NodeProps<AiInputBlockData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />
      <BlockHeader icon={<LogIn className="h-3 w-3" />} badgeClassName="bg-violet-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-violet-300 bg-white px-2 py-1 text-sm font-medium dark:border-violet-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-violet-700 dark:text-violet-300">
        Text sent to the agent
      </label>
      <textarea
        value={data.value ?? ''}
        onChange={(e) => data.onChange?.({ value: e.target.value })}
        placeholder="e.g. Summarize {notes}"
        rows={3}
        className="nodrag w-full resize-none rounded border border-violet-300 bg-white px-2 py-1 text-xs dark:border-violet-700 dark:bg-gray-900 dark:text-gray-100"
      />
      <p className="mt-1 text-[10px] text-violet-500 dark:text-violet-400">
        Use {'{varName}'} to insert a saved variable.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
    </GridSnapBox>
  )
}
