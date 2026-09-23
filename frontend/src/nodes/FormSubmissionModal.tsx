import { ClipboardList, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormField } from './types'

/** Pops up (via portal, so it isn't clipped/mispositioned by React Flow's canvas
 *  transform) when a Form Trigger block is run - one input per field, prefilled with
 *  that field's design-time default. Submitting hands back the same fields with each
 *  `value` replaced by what was typed, ready to save as variables. */
export default function FormSubmissionModal({
  label,
  fields,
  onSubmit,
  onCancel,
}: {
  label: string
  fields: FormField[]
  onSubmit: (fields: FormField[]) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, f.value])),
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(fields.map((f) => ({ ...f, value: values[f.name] ?? f.value })))
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-96 overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-800 dark:text-gray-100">
            <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" /> {label}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {fields.length === 0 ? (
          <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
            This form has no fields yet - add some on the block before running it.
          </p>
        ) : (
          <div className="mb-4 space-y-3">
            {fields.map((f, i) => (
              <div key={f.name || i}>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{f.label || f.name}</label>
                {f.varType === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={(values[f.name] ?? '').toLowerCase() === 'true'}
                    autoFocus={i === 0}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked ? 'true' : 'false' }))}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                ) : (
                  <input
                    type={f.varType === 'int' ? 'number' : 'text'}
                    required
                    autoFocus={i === 0}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={fields.length === 0}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
