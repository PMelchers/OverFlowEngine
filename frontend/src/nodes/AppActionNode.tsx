import { useRef } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import { APP_TRIGGER_SOURCES, type BlockNodeData } from './types'

export default function AppActionNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const availableVariables = data.availableVariables ?? []
  const toRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const insertInto = (
    field: 'to' | 'body',
    ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
    name: string,
  ) => {
    if (!name) return
    const token = `{${name}}`
    const el = ref.current
    const current = data[field] ?? ''
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    data.onChange?.({ [field]: next })
    requestAnimationFrame(() => {
      el?.focus()
      const caret = start + token.length
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active ? 'node-flash border-green-500 bg-green-100' : 'border-emerald-400 bg-emerald-50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" />
      <BlockHeader icon="↩" badgeClassName="bg-emerald-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-emerald-300 bg-white px-2 py-1 text-sm font-medium"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-emerald-700">Target app</label>
      <select
        value={data.targetApp ?? APP_TRIGGER_SOURCES[0]}
        onChange={(e) => data.onChange?.({ targetApp: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm"
      >
        {APP_TRIGGER_SOURCES.map((app) => (
          <option key={app} value={app}>
            {app}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-[11px] font-medium text-emerald-700">To</label>
      <input
        ref={toRef}
        type="text"
        value={data.to ?? ''}
        placeholder="e.g. {incomingMessageFrom}"
        onChange={(e) => data.onChange?.({ to: e.target.value })}
        className="nodrag mb-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm"
      />
      {availableVariables.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            insertInto('to', toRef, e.target.value)
            e.target.value = ''
          }}
          className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-emerald-600"
        >
          <option value="">Insert a variable into To...</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.varType})
            </option>
          ))}
        </select>
      )}

      <label className="mb-1 block text-[11px] font-medium text-emerald-700">Subject (optional)</label>
      <input
        type="text"
        value={data.subject ?? ''}
        placeholder="e.g. Re: your request"
        onChange={(e) => data.onChange?.({ subject: e.target.value })}
        className="nodrag mb-2 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm"
      />

      <label className="mb-1 block text-[11px] font-medium text-emerald-700">Message</label>
      <textarea
        ref={bodyRef}
        value={data.body ?? ''}
        placeholder="e.g. {agentReply}"
        onChange={(e) => data.onChange?.({ body: e.target.value })}
        rows={3}
        className="nodrag w-full resize-none rounded border border-emerald-300 bg-white px-2 py-1 text-xs"
      />

      {availableVariables.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            insertInto('body', bodyRef, e.target.value)
            e.target.value = ''
          }}
          className="nodrag mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-emerald-600"
        >
          <option value="">Insert a variable into Message...</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.varType})
            </option>
          ))}
        </select>
      )}

      <p className="mt-1 text-[10px] text-emerald-600">
        Preview action - logs what would be sent; a real {data.targetApp ?? 'app'} connection isn't
        wired up yet.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </GridSnapBox>
  )
}
