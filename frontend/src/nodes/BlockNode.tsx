import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function BlockNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-40 rounded-lg border-2 px-4 py-3 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <BlockHeader icon="●" badgeClassName="bg-gray-500">
        <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{data.label}</span>
      </BlockHeader>
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </GridSnapBox>
  )
}
