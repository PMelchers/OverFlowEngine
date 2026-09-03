import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function LogNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active ? 'node-flash border-green-500 bg-green-100' : 'border-slate-500 bg-slate-100'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500" />
      <BlockHeader icon="»" badgeClassName="bg-slate-600" />
      <input
        type="text"
        value={data.message ?? ''}
        placeholder="e.g. count is {count}"
        onChange={(e) => data.onChange?.({ message: e.target.value })}
        className="nodrag w-full rounded border border-slate-400 bg-white px-2 py-1 text-sm"
      />
      <p className="mt-1 text-[11px] text-slate-500">Use {'{varName}'} to insert a saved variable.</p>
      <Handle type="source" position={Position.Right} className="!bg-slate-500" />
    </GridSnapBox>
  )
}
