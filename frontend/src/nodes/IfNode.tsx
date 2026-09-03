import { Handle, Position, type NodeProps } from 'reactflow'
import BlockHeader from './BlockHeader'
import ConditionRow, { emptyCondition } from './ConditionRow'
import GridSnapBox from './GridSnapBox'
import type { BlockNodeData, IfCondition } from './types'

export default function IfNode({ data }: NodeProps<BlockNodeData>) {
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
        active ? 'node-flash border-green-500 bg-green-100' : 'border-amber-400 bg-amber-50'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
      <BlockHeader icon="☰" badgeClassName="bg-amber-600">
        <span className="text-sm font-semibold text-amber-800">If all/any of these are true...</span>
      </BlockHeader>
      <p className="mb-2 text-[11px] text-gray-500">Check multiple things, then send the flow down Yes or No.</p>

      <div className="space-y-2">
        {conditions.length === 0 && (
          <p className="text-xs text-gray-400">No checks yet - add one below.</p>
        )}
        {conditions.map((cond, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="mb-1.5 flex overflow-hidden rounded border border-amber-300 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => update(i, { combinator: 'and' })}
                  className={`nodrag flex-1 py-0.5 ${
                    (cond.combinator ?? 'and') === 'and' ? 'bg-amber-500 text-white' : 'bg-white text-amber-700'
                  }`}
                >
                  AND (both must be true)
                </button>
                <button
                  type="button"
                  onClick={() => update(i, { combinator: 'or' })}
                  className={`nodrag flex-1 border-l border-amber-300 py-0.5 ${
                    cond.combinator === 'or' ? 'bg-amber-500 text-white' : 'bg-white text-amber-700'
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
        className="nodrag mt-1.5 w-full rounded border border-amber-300 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
      >
        + Add another check
      </button>

      <div className="mt-2 flex justify-between text-xs font-semibold">
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">✓ Yes</span>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-600">✗ No</span>
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
