import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function AiInputNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active ? 'node-flash border-green-500 bg-green-100' : 'border-violet-400 bg-violet-50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />
      <BlockHeader icon="IN" badgeClassName="bg-violet-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-violet-300 bg-white px-2 py-1 text-sm font-medium"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-violet-700">Text sent to the agent</label>
      <textarea
        value={data.value ?? ''}
        onChange={(e) => data.onChange?.({ value: e.target.value })}
        placeholder="e.g. Summarize {notes}"
        rows={3}
        className="nodrag w-full resize-none rounded border border-violet-300 bg-white px-2 py-1 text-xs"
      />
      <p className="mt-1 text-[10px] text-violet-500">Use {'{varName}'} to insert a saved variable.</p>

      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
    </GridSnapBox>
  )
}
