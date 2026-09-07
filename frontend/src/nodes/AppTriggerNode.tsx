import { Zap } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import { APP_TRIGGER_SOURCES, type BlockNodeData } from './types'

export default function AppTriggerNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-cyan-400 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950'
      }`}
    >
      <BlockHeader icon={<Zap className="h-3 w-3" />} badgeClassName="bg-cyan-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-cyan-300 bg-white px-2 py-1 text-sm font-medium dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-cyan-700 dark:text-cyan-300">Source app</label>
      <select
        value={data.sourceApp ?? APP_TRIGGER_SOURCES[0]}
        onChange={(e) => data.onChange?.({ sourceApp: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-cyan-300 bg-white px-2 py-1 text-sm dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {APP_TRIGGER_SOURCES.map((app) => (
          <option key={app} value={app}>
            {app}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-[11px] font-medium text-cyan-700 dark:text-cyan-300">Sample sender (e.g. email address)</label>
      <input
        type="text"
        value={data.fromAddress ?? ''}
        onChange={(e) => data.onChange?.({ fromAddress: e.target.value })}
        placeholder="e.g. someone@example.com"
        className="nodrag mb-2 w-full rounded border border-cyan-300 bg-white px-2 py-1 text-sm dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <label className="mb-1 block text-[11px] font-medium text-cyan-700 dark:text-cyan-300">Sample incoming message</label>
      <textarea
        value={data.value ?? ''}
        onChange={(e) => data.onChange?.({ value: e.target.value })}
        placeholder="e.g. Please reply confirming the meeting time"
        rows={2}
        className="nodrag mb-2 w-full resize-none rounded border border-cyan-300 bg-white px-2 py-1 text-xs dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <label className="mb-1 block text-[11px] font-medium text-cyan-700 dark:text-cyan-300">Save message as</label>
      <input
        type="text"
        value={data.outputVariable ?? ''}
        placeholder="variable name"
        onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
        className="nodrag w-full rounded border border-cyan-300 bg-white px-2 py-1 text-sm dark:border-cyan-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {data.outputVariable && data.fromAddress && (
        <p className="mt-1 text-[10px] text-cyan-600 dark:text-cyan-400">
          Sender also saved as {'{' + data.outputVariable + 'From}'} - reference it in an App Action
          block's "To" field to reply.
        </p>
      )}

      <button
        type="button"
        onClick={data.onTrigger}
        className="nodrag mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-transform hover:bg-cyan-700 active:scale-95 active:bg-cyan-800"
      >
        <Zap className="h-3.5 w-3.5" /> Simulate incoming message
      </button>
      <p className="mt-1 text-[10px] text-cyan-600 dark:text-cyan-400">
        Preview trigger - simulates a message arriving; a real Teams/Slack connection isn't wired up yet.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-cyan-500" />
    </GridSnapBox>
  )
}
