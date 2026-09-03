import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import { APP_TRIGGER_SOURCES, type BlockNodeData } from './types'

export default function AppTriggerNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active ? 'node-flash border-green-500 bg-green-100' : 'border-cyan-400 bg-cyan-50'
      }`}
    >
      <BlockHeader icon="⚡" badgeClassName="bg-cyan-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-cyan-300 bg-white px-2 py-1 text-sm font-medium"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-cyan-700">Source app</label>
      <select
        value={data.sourceApp ?? APP_TRIGGER_SOURCES[0]}
        onChange={(e) => data.onChange?.({ sourceApp: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-cyan-300 bg-white px-2 py-1 text-sm"
      >
        {APP_TRIGGER_SOURCES.map((app) => (
          <option key={app} value={app}>
            {app}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-[11px] font-medium text-cyan-700">Sample incoming message</label>
      <textarea
        value={data.value ?? ''}
        onChange={(e) => data.onChange?.({ value: e.target.value })}
        placeholder="e.g. @bot please restart the pipeline"
        rows={2}
        className="nodrag mb-2 w-full resize-none rounded border border-cyan-300 bg-white px-2 py-1 text-xs"
      />

      <label className="mb-1 block text-[11px] font-medium text-cyan-700">Save message as</label>
      <input
        type="text"
        value={data.outputVariable ?? ''}
        placeholder="variable name"
        onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
        className="nodrag w-full rounded border border-cyan-300 bg-white px-2 py-1 text-sm"
      />

      <button
        type="button"
        onClick={data.onTrigger}
        className="nodrag mt-2 w-full rounded bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-transform hover:bg-cyan-700 active:scale-95 active:bg-cyan-800"
      >
        ⚡ Simulate incoming message
      </button>
      <p className="mt-1 text-[10px] text-cyan-600">
        Preview trigger - simulates a message arriving; a real Teams/Slack connection isn't wired up yet.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-cyan-500" />
    </GridSnapBox>
  )
}
