import { Handle, Position, useEdges, useNodeId, useNodes, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function AiAgentNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const nodeId = useNodeId()
  const edges = useEdges()
  const nodes = useNodes<BlockNodeData>()
  const modelEdge = edges.find((e) => e.target === nodeId && e.targetHandle === 'model')
  const modelNode = modelEdge ? nodes.find((n) => n.id === modelEdge.source) : undefined
  const connectedModel = modelNode?.data.model

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active ? 'node-flash border-green-500 bg-green-100' : 'border-fuchsia-400 bg-fuchsia-50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-fuchsia-500" />
      <BlockHeader icon="◈" badgeClassName="bg-fuchsia-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-fuchsia-300 bg-white px-2 py-1 text-sm font-medium"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-fuchsia-700">Model</label>
      <p
        className={`mb-2 w-full rounded border px-2 py-1 text-sm ${
          connectedModel
            ? 'border-fuchsia-300 bg-white text-fuchsia-700'
            : 'border-dashed border-fuchsia-300 bg-fuchsia-50 text-fuchsia-400'
        }`}
      >
        {connectedModel ?? 'Connect an AI Model block below ↓'}
      </p>

      <label className="mb-1 block text-[11px] font-medium text-fuchsia-700">Instructions</label>
      <textarea
        value={data.prompt ?? ''}
        onChange={(e) => data.onChange?.({ prompt: e.target.value })}
        placeholder="What should this agent do?"
        rows={3}
        className="nodrag w-full resize-none rounded border border-fuchsia-300 bg-white px-2 py-1 text-xs"
      />

      <p className="mt-1 text-[10px] text-fuchsia-500">
        Preview block - runs as a placeholder step until real model calls are wired up.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-fuchsia-500" />
      <Handle type="target" position={Position.Bottom} id="model" className="!bg-fuchsia-500" />
    </GridSnapBox>
  )
}
