import { useState } from 'react'
import type { ConditionOperator, IfCondition, VariableType } from '../types'

export const TYPE_BADGE: Record<VariableType, string> = {
  boolean: 'bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  int: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  string: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
}

const CUSTOM_ENTRY = '__custom__'

const NUMERIC_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: '>', label: 'is greater than' },
  { value: '>=', label: 'is greater than or equal to' },
  { value: '<', label: 'is less than' },
  { value: '<=', label: 'is less than or equal to' },
]

export function operatorsFor(varType: VariableType): { value: ConditionOperator; label: string }[] {
  const equality =
    varType === 'string'
      ? [
          { value: '==' as const, label: 'matches' },
          { value: '!=' as const, label: "doesn't match" },
        ]
      : [
          { value: '==' as const, label: 'is equal to' },
          { value: '!=' as const, label: 'is not equal to' },
        ]
  return varType === 'int' ? [...equality, ...NUMERIC_OPERATORS] : equality
}

export function emptyCondition(): IfCondition {
  return { variable: '', operator: '==', value: '', combinator: 'and' }
}

interface ConditionRowProps {
  cond: IfCondition
  availableVariables: { name: string; varType: VariableType }[]
  onUpdate: (patch: Partial<IfCondition>) => void
  onRemove?: () => void
}

export default function ConditionRow({ cond, availableVariables, onUpdate, onRemove }: ConditionRowProps) {
  const [manualEntry, setManualEntry] = useState(false)
  const varType = availableVariables.find((v) => v.name === cond.variable)?.varType ?? 'string'
  const operatorChoices = operatorsFor(varType)

  return (
    <div className="rounded border border-amber-300 bg-white p-2 dark:border-amber-800 dark:bg-gray-900">
      <div className="flex items-center gap-1 text-xs">
        <span className="shrink-0 text-gray-500 dark:text-gray-400">If</span>

        {manualEntry || availableVariables.length === 0 ? (
          <input
            type="text"
            list="overflowengine-variable-names"
            value={cond.variable}
            placeholder="type a variable name"
            onChange={(e) => onUpdate({ variable: e.target.value })}
            className="nodrag w-0 min-w-0 flex-1 rounded border border-amber-200 bg-white px-1 py-0.5 dark:border-amber-800 dark:bg-gray-800 dark:text-gray-100"
          />
        ) : (
          <select
            value={availableVariables.some((v) => v.name === cond.variable) ? cond.variable : ''}
            onChange={(e) => {
              if (e.target.value === CUSTOM_ENTRY) {
                setManualEntry(true)
              } else {
                onUpdate({ variable: e.target.value })
              }
            }}
            className="nodrag w-0 min-w-0 flex-1 rounded border border-amber-200 bg-white px-1 py-0.5 dark:border-amber-800 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">Choose a variable...</option>
            {availableVariables.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.varType})
              </option>
            ))}
            <option value={CUSTOM_ENTRY}>Type a name...</option>
          </select>
        )}

        {cond.variable && (
          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[varType]}`}>
            {varType}
          </span>
        )}

        {manualEntry && availableVariables.length > 0 && (
          <button
            type="button"
            onClick={() => setManualEntry(false)}
            className="nodrag shrink-0 text-[10px] text-amber-700 underline dark:text-amber-400"
          >
            list
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="nodrag shrink-0 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
          >
            ×
          </button>
        )}
      </div>

      {varType === 'boolean' ? (
        <div className="mt-1 flex overflow-hidden rounded border border-amber-200 text-xs font-medium dark:border-amber-800">
          <button
            type="button"
            onClick={() => onUpdate({ operator: '==', value: 'true' })}
            className={`nodrag flex-1 py-1 ${
              (cond.value || 'true') !== 'false'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            Is True
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ operator: '==', value: 'false' })}
            className={`nodrag flex-1 border-l border-amber-200 py-1 dark:border-amber-800 ${
              cond.value === 'false'
                ? 'bg-red-500 text-white'
                : 'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            Is False
          </button>
        </div>
      ) : (
        <>
          <select
            value={cond.operator}
            onChange={(e) => onUpdate({ operator: e.target.value as ConditionOperator })}
            className="nodrag mt-1 w-full rounded border border-amber-200 bg-white px-1 py-0.5 text-xs dark:border-amber-800 dark:bg-gray-800 dark:text-gray-100"
          >
            {operatorChoices.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          <input
            type={varType === 'int' ? 'number' : 'text'}
            value={cond.value}
            placeholder={varType === 'int' ? 'this number' : 'matching text'}
            onChange={(e) => onUpdate({ value: e.target.value })}
            className="nodrag mt-1 w-full rounded border border-amber-200 bg-white px-1 py-0.5 text-xs dark:border-amber-800 dark:bg-gray-800 dark:text-gray-100"
          />
        </>
      )}
    </div>
  )
}
