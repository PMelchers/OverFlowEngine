import { Variable } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from '../shared/BlockHeader'
import GridSnapBox from '../shared/GridSnapBox'
import type { VariableBlockData, VariableType } from '../types'

const TYPE_OPTIONS: VariableType[] = ['string', 'int', 'boolean']

export default function VariableNode({ data }: NodeProps<VariableBlockData>) {
  const active = data.status === 'active'
  const varType = data.varType ?? 'string'

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-sky-500" />
      <BlockHeader icon={<Variable className="h-3 w-3" />} badgeClassName="bg-sky-600" />

      <input
        type="text"
        value={data.label}
        placeholder="name"
        onChange={(e) => data.onChange?.({ label: e.target.value })}
        className="nodrag mb-1 w-full rounded border border-sky-300 bg-white px-2 py-1 text-sm dark:border-sky-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <select
        value={varType}
        onChange={(e) => {
          const nextType = e.target.value as VariableType
          const patch: Partial<VariableBlockData> = { varType: nextType }
          // Keep data.value in sync with the visible default so a switch to boolean
          // is actually saved as "false" right away, not left empty until touched.
          if (nextType === 'boolean' && data.value !== 'true' && data.value !== 'false') {
            patch.value = 'false'
          } else if (nextType === 'int' && !/^-?\d+$/.test(data.value ?? '')) {
            patch.value = '0'
          }
          data.onChange?.(patch)
        }}
        className="nodrag mb-1 w-full rounded border border-sky-300 bg-white px-2 py-1 text-sm dark:border-sky-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {varType === 'boolean' ? (
        <select
          value={data.value ?? 'false'}
          onChange={(e) => data.onChange?.({ value: e.target.value })}
          className="nodrag w-full rounded border border-sky-300 bg-white px-2 py-1 text-sm dark:border-sky-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type={varType === 'int' ? 'number' : 'text'}
          value={data.value ?? ''}
          placeholder="value"
          onChange={(e) => data.onChange?.({ value: e.target.value })}
          className="nodrag w-full rounded border border-sky-300 bg-white px-2 py-1 text-sm dark:border-sky-700 dark:bg-gray-900 dark:text-gray-100"
        />
      )}

      <Handle type="source" position={Position.Right} className="!bg-sky-500" />
    </GridSnapBox>
  )
}
