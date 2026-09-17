import { GitFork } from 'lucide-react'
import { useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { ChoiceBlockData } from './types'

export default function ChoiceNode({ data }: NodeProps<ChoiceBlockData>) {
  const active = data.status === 'active'
  const options = data.options ?? []
  const [draft, setDraft] = useState('')

  const addOption = () => {
    const value = draft.trim()
    if (!value || options.includes(value)) return
    data.onChange?.({ options: [...options, value] })
    setDraft('')
  }

  const removeOption = (opt: string) => {
    data.onChange?.({ options: options.filter((o) => o !== opt) })
  }

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-teal-500 bg-teal-50 dark:border-teal-700 dark:bg-teal-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-teal-600" />
      <BlockHeader icon={<GitFork className="h-3 w-3" />} badgeClassName="bg-teal-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-teal-300 bg-white px-2 py-1 text-sm font-medium dark:border-teal-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <ul className="mb-2 space-y-1">
        {options.map((opt) => (
          <li
            key={opt}
            className="flex items-center justify-between rounded border border-teal-200 bg-white px-2 py-1 text-xs dark:border-teal-800 dark:bg-gray-900 dark:text-gray-200"
          >
            <span className="truncate">{opt}</span>
            <button
              type="button"
              onClick={() => removeOption(opt)}
              className="nodrag ml-2 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
            >
              ×
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="text-xs text-gray-400 dark:text-gray-500">No options yet.</li>}
      </ul>

      <div className="flex gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addOption()
            }
          }}
          placeholder="Add option"
          className="nodrag min-w-0 flex-1 rounded border border-teal-300 bg-white px-2 py-1 text-xs dark:border-teal-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={addOption}
          className="nodrag rounded bg-teal-600 px-2 text-xs font-semibold text-white hover:bg-teal-700"
        >
          +
        </button>
      </div>

      {options.map((opt, i) => (
        <Handle
          key={opt}
          type="source"
          position={Position.Right}
          id={opt}
          style={{ top: `${((i + 1) / (options.length + 1)) * 100}%` }}
          className="!bg-teal-600"
        />
      ))}
    </GridSnapBox>
  )
}
