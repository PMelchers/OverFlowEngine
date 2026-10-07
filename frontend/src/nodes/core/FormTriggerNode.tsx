import { ClipboardList, Play, X } from 'lucide-react'
import { useState } from 'react'
import { Handle, Position, useNodeId, type NodeProps } from 'reactflow'
import BlockHeader from '../shared/BlockHeader'
import FormSubmissionModal from './FormSubmissionModal'
import GridSnapBox from '../shared/GridSnapBox'
import type { FormField, FormTriggerBlockData, VariableType } from '../types'

const VAR_TYPES: VariableType[] = ['string', 'int', 'boolean']

/** camelCase-ish slug so a field's label ("Start date") gives a sane default variable
 *  name ("startDate") without the user having to type both by hand. */
function slugify(label: string): string {
  const words = label
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  if (words.length === 0) return ''
  return words
    .map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1)))
    .join('')
}

export default function FormTriggerNode({ data }: NodeProps<FormTriggerBlockData>) {
  const active = data.status === 'active'
  const fields = data.fields ?? []
  const nodeId = useNodeId()
  const [modalOpen, setModalOpen] = useState(false)

  const addField = () => {
    const n = fields.length + 1
    data.onChange?.({
      fields: [...fields, { name: `field${n}`, label: `Question ${n}`, varType: 'string', value: '' }],
    })
  }

  const updateField = (i: number, patch: Partial<FormField>) => {
    data.onChange?.({ fields: fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) })
  }

  const removeField = (i: number) => {
    data.onChange?.({ fields: fields.filter((_, idx) => idx !== i) })
  }

  const submitForm = (submitted: FormField[]) => {
    setModalOpen(false)
    if (!nodeId) return
    data.onTrigger?.({ nodeId, fields: submitted })
  }

  return (
    <GridSnapBox
      className={`w-80 rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-300 hover:shadow-md ${
        active
          ? 'node-flash border-green-500 bg-green-100 dark:border-green-600 dark:bg-green-950'
          : 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950'
      }`}
    >
      <BlockHeader icon={<ClipboardList className="h-3 w-3" />} badgeClassName="bg-blue-600">
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange?.({ label: e.target.value })}
          className="nodrag w-0 min-w-0 flex-1 rounded border border-blue-300 bg-white px-2 py-1 text-sm font-medium dark:border-blue-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </BlockHeader>

      <div className="mb-2 space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="nodrag rounded border border-blue-200 bg-white p-2 dark:border-blue-800 dark:bg-gray-900">
            <div className="mb-1 flex items-center gap-1">
              <input
                type="text"
                value={f.label}
                placeholder="Question shown in the form"
                onChange={(e) => {
                  const label = e.target.value
                  // Only follow the label while the name still looks auto-generated -
                  // once someone's hand-edited the name, stop overwriting their choice.
                  const autoName = slugify(f.label) === f.name || f.name === ''
                  updateField(i, autoName ? { label, name: slugify(label) || f.name } : { label })
                }}
                className="min-w-0 flex-1 rounded border border-blue-300 bg-white px-2 py-1 text-xs dark:border-blue-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <select
                value={f.varType}
                onChange={(e) => updateField(i, { varType: e.target.value as VariableType })}
                className="rounded border border-blue-300 bg-white px-1 py-1 text-xs dark:border-blue-700 dark:bg-gray-900 dark:text-gray-100"
              >
                {VAR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeField(i)}
                className="text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={f.name}
              placeholder="variable name"
              onChange={(e) => updateField(i, { name: e.target.value })}
              className="mb-1 w-full rounded border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-[11px] text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
            />
            <input
              type="text"
              value={f.value}
              placeholder="default value"
              onChange={(e) => updateField(i, { value: e.target.value })}
              className="w-full rounded border border-blue-300 bg-white px-2 py-1 text-xs dark:border-blue-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        ))}
        {fields.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No fields yet.</p>}
      </div>

      <button
        type="button"
        onClick={addField}
        className="nodrag mb-2 w-full rounded border border-dashed border-blue-300 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
      >
        + Add field
      </button>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="nodrag flex w-full items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-transform hover:bg-blue-700 active:scale-95 active:bg-blue-800"
      >
        <Play className="h-3.5 w-3.5" fill="currentColor" /> Fill in & run
      </button>

      {modalOpen && (
        <FormSubmissionModal
          label={data.label}
          fields={fields}
          onSubmit={submitForm}
          onCancel={() => setModalOpen(false)}
        />
      )}

      <Handle type="source" position={Position.Right} className="!bg-blue-500" />
    </GridSnapBox>
  )
}
