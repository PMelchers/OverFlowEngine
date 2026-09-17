import { Terminal } from 'lucide-react'
import { useRef } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import GridSnapBox from './GridSnapBox'
import type { LogBlockData } from './types'
import { useVariableInsertion } from './useVariableInsertion'

export default function LogNode({ data }: NodeProps<LogBlockData>) {
  const active = data.status === 'active'
  const availableVariables = data.availableVariables ?? []
  const inputRef = useRef<HTMLInputElement>(null)

  const insertVariable = useVariableInsertion(inputRef, data.message ?? '', (next) => data.onChange?.({ message: next }))

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-slate-500 bg-slate-100 dark:border-slate-600 dark:bg-slate-800'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500" />
      <BlockHeader icon={<Terminal className="h-3 w-3" />} badgeClassName="bg-slate-600" />
      <input
        ref={inputRef}
        type="text"
        value={data.message ?? ''}
        placeholder="e.g. count is {count}"
        onChange={(e) => data.onChange?.({ message: e.target.value })}
        className="nodrag w-full rounded border border-slate-400 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-gray-900 dark:text-gray-100"
      />
      {availableVariables.length > 0 && (
        <select
          value=""
          onChange={(e) => insertVariable(e.target.value)}
          className="nodrag mt-1 w-full rounded border border-slate-400 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-600 dark:bg-gray-900 dark:text-slate-300"
        >
          <option value="">Insert a variable...</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.varType})
            </option>
          ))}
        </select>
      )}
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        Use {'{varName}'} to insert a saved variable.
      </p>
      <Handle type="source" position={Position.Right} className="!bg-slate-500" />
    </GridSnapBox>
  )
}
