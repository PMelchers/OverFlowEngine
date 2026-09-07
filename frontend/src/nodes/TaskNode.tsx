import { ListTodo } from 'lucide-react'
import { useRef } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function TaskNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const availableVariables = data.availableVariables ?? []
  const inputRef = useRef<HTMLInputElement>(null)

  const insertVariable = (name: string) => {
    if (!name) return
    const token = `{${name}}`
    const input = inputRef.current
    const current = data.title ?? ''
    const start = input?.selectionStart ?? current.length
    const end = input?.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    data.onChange?.({ title: next })
    requestAnimationFrame(() => {
      input?.focus()
      const caret = start + token.length
      input?.setSelectionRange(caret, caret)
    })
  }

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-rose-400 bg-rose-50 dark:border-rose-700 dark:bg-rose-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-rose-500" />
      <BlockHeader icon={<ListTodo className="h-3 w-3" />} badgeClassName="bg-rose-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-rose-300 bg-white px-2 py-1 text-sm font-medium dark:border-rose-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <label className="mb-1 block text-[11px] font-medium text-rose-800 dark:text-rose-300">Task title</label>
      <input
        ref={inputRef}
        type="text"
        value={data.title ?? ''}
        placeholder="e.g. Follow up with {customerName}"
        onChange={(e) => data.onChange?.({ title: e.target.value })}
        className="nodrag mb-1 w-full rounded border border-rose-300 bg-white px-2 py-1 text-sm dark:border-rose-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {availableVariables.length > 0 && (
        <select
          value=""
          onChange={(e) => insertVariable(e.target.value)}
          className="nodrag mb-1 w-full rounded border border-rose-300 bg-white px-2 py-1 text-sm text-rose-700 dark:border-rose-700 dark:bg-gray-900 dark:text-rose-300"
        >
          <option value="">Insert a variable...</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.varType})
            </option>
          ))}
        </select>
      )}

      <p className="mt-1 text-[10px] text-rose-700 dark:text-rose-400">
        Adds a small task to your dashboard when this block runs - only if you're signed in.
      </p>

      <Handle type="source" position={Position.Right} className="!bg-rose-500" />
    </GridSnapBox>
  )
}
