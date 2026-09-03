import { Handle, Position, type NodeProps } from 'reactflow'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function TriggerNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-40 rounded-lg border-2 px-4 py-3 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100'
          : 'border-purple-400 bg-purple-50'
      }`}
    >
      <div className="flex justify-center">
        <button
          type="button"
          onClick={data.onTrigger}
          className="rounded bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition-transform hover:bg-purple-700 active:scale-95 active:bg-purple-800"
        >
          ▶ {data.label}
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-purple-500" />
    </GridSnapBox>
  )
}
