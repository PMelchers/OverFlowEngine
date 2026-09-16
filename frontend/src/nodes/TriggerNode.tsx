import { Play } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function TriggerNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-40 rounded-lg border-2 px-4 py-3 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-purple-400 bg-purple-50 dark:border-purple-700 dark:bg-purple-950'
      }`}
    >
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => data.onTrigger?.()}
          className="flex items-center gap-1.5 rounded bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition-transform hover:bg-purple-700 active:scale-95 active:bg-purple-800"
        >
          <Play className="h-3.5 w-3.5" fill="currentColor" /> {data.label}
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-purple-500" />
    </GridSnapBox>
  )
}
