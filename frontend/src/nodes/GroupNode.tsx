import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function GroupNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const count = data.subgraph?.nodes.length ?? 0

  return (
    <GridSnapBox
      className={`w-40 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-indigo-500" />
      <BlockHeader icon="⬡" badgeClassName="bg-indigo-600" />
      <input
        type="text"
        value={data.label}
        onChange={(e) => data.onChange?.({ label: e.target.value })}
        className="nodrag w-full rounded border border-indigo-300 bg-white px-2 py-1 text-sm font-medium dark:border-indigo-700 dark:bg-gray-900 dark:text-gray-100"
      />
      <p className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-300">
        {count} block{count === 1 ? '' : 's'} chained
      </p>
      <Handle type="source" position={Position.Right} className="!bg-indigo-500" />
    </GridSnapBox>
  )
}
