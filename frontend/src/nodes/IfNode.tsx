import { Check, ListChecks, X } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import ConditionRow, { emptyCondition } from './ConditionRow'
import GridSnapBox from './GridSnapBox'
import type { IfBlockData, IfCondition } from './types'

export default function IfNode({ data }: NodeProps<IfBlockData>) {
  const active = data.status === 'active'
  const conditions = data.conditions ?? []
  const availableVariables = data.availableVariables ?? []

  const update = (index: number, patch: Partial<IfCondition>) => {
    const next = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c))
    data.onChange?.({ conditions: next })
  }

  const addCondition = () => {
    data.onChange?.({ conditions: [...conditions, emptyCondition()] })
  }

  const removeCondition = (index: number) => {
    data.onChange?.({ conditions: conditions.filter((_, i) => i !== index) })
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
      <BlockHeader icon={<ListChecks className="h-3 w-3" />} badgeClassName="bg-amber-600">
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          If all/any of these are true...
        </span>
      </BlockHeader>
      <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
        Check multiple things, then send the flow down Yes or No.
      </p>

      <div className="space-y-2">
        {conditions.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No checks yet - add one below.</p>
        )}
        {conditions.map((cond, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="mb-1.5 flex overflow-hidden rounded border border-amber-300 text-[11px] font-semibold dark:border-amber-800">
                <button
                  type="button"
                  onClick={() => update(i, { combinator: 'and' })}
                  className={`nodrag flex-1 py-0.5 ${
                    (cond.combinator ?? 'and') === 'and'
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-amber-700 dark:bg-gray-900 dark:text-amber-300'
                  }`}
                >
                  AND (both must be true)
                </button>
                <button
                  type="button"
                  onClick={() => update(i, { combinator: 'or' })}
                  className={`nodrag flex-1 border-l border-amber-300 py-0.5 dark:border-amber-800 ${
                    cond.combinator === 'or'
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-amber-700 dark:bg-gray-900 dark:text-amber-300'
                  }`}
                >
                  OR (either can be true)
                </button>
              </div>
            )}
            <ConditionRow
              cond={cond}
              availableVariables={availableVariables}
              onUpdate={(patch) => update(i, patch)}
              onRemove={() => removeCondition(i)}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addCondition}
        className="nodrag mt-1.5 w-full rounded border border-amber-300 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900"
      >
        + Add another check
      </button>

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
