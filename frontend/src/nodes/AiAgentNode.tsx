import { Bot } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { AiAgentBlockData } from './types'
import { useConnectedModel } from './useConnectedModel'

export default function AiAgentNode({ data }: NodeProps<AiAgentBlockData>) {
  const active = data.status === 'active'
  const connectedModel = useConnectedModel()

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-fuchsia-400 bg-fuchsia-50 dark:border-fuchsia-700 dark:bg-fuchsia-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-fuchsia-500" />
      <BlockHeader icon={<Bot className="h-3 w-3" />} badgeClassName="bg-fuchsia-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-fuchsia-300 bg-white px-2 py-1 text-sm font-medium dark:border-fuchsia-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-fuchsia-700 dark:text-fuchsia-300">Model</label>
      <p
        className={`mb-2 w-full rounded border px-2 py-1 text-sm ${
          connectedModel
            ? 'border-fuchsia-300 bg-white text-fuchsia-700 dark:border-fuchsia-700 dark:bg-gray-900 dark:text-fuchsia-300'
            : 'border-dashed border-fuchsia-300 bg-fuchsia-50 text-fuchsia-400 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-500'
        }`}
      >
        {connectedModel ?? 'Connect an AI Model block below ↓'}
      </p>

      <label className="mb-1 block text-[11px] font-medium text-fuchsia-700 dark:text-fuchsia-300">
        Instructions
      </label>
      <textarea
        value={data.prompt ?? ''}
        onChange={(e) => data.onChange?.({ prompt: e.target.value })}
        placeholder="What should this agent do?"
        rows={3}
        className="nodrag w-full resize-none rounded border border-fuchsia-300 bg-white px-2 py-1 text-xs dark:border-fuchsia-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <p className="mt-1 text-[10px] text-fuchsia-500 dark:text-fuchsia-400">
        Calls the connected model for real - make sure you're logged in as the account that added its API key.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-fuchsia-500" />
      <Handle type="target" position={Position.Bottom} id="model" className="!bg-fuchsia-500" />
    </GridSnapBox>
  )
}
