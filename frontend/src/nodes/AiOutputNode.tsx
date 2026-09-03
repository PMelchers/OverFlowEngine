import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function AiOutputNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active ? 'node-flash border-green-500 bg-green-100' : 'border-pink-400 bg-pink-50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-pink-500" />
      <BlockHeader icon="OUT" badgeClassName="bg-pink-600" />

      <label className="mb-1 block text-[11px] font-medium text-pink-700">Save agent's reply as</label>
      <input
        type="text"
        value={data.label}
        placeholder="variable name"
        onChange={(e) => data.onChange?.({ label: e.target.value })}
        className="nodrag w-full rounded border border-pink-300 bg-white px-2 py-1 text-sm"
      />
      <p className="mt-1 text-[10px] text-pink-500">
        Whatever the closest AI Agent block responds with gets saved under this name.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-pink-500" />
    </GridSnapBox>
  )
}
