import { Check, Diamond, X } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import ConditionRow, { emptyCondition } from './ConditionRow'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData } from './types'

export default function IfSingleNode({ data }: NodeProps<BlockNodeData>) {
  const active = data.status === 'active'
  const availableVariables = data.availableVariables ?? []
  const cond = data.conditions?.[0] ?? emptyCondition()

  const update = (patch: Partial<typeof cond>) => {
    data.onChange?.({ conditions: [{ ...cond, ...patch }] })
  }

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
      <BlockHeader icon={<Diamond className="h-3 w-3" />} badgeClassName="bg-amber-600">
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">If this is true...</span>
      </BlockHeader>
      <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
        Check one thing, then send the flow down Yes or No.
      </p>

      <ConditionRow cond={cond} availableVariables={availableVariables} onUpdate={update} />

      <div className="mt-2 flex justify-between text-xs font-semibold">
        <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900 dark:text-green-300">
          <Check className="h-3 w-3" /> Yes
        </span>
        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-600 dark:bg-red-900 dark:text-red-300">
          <X className="h-3 w-3" /> No
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '55%' }}
        className="!bg-green-600"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '80%' }}
        className="!bg-red-500"
      />
    </GridSnapBox>
  )
}
