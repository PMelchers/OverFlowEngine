import { Layers, X } from 'lucide-react'
import { useState } from 'react'
import Modal from '../shared/Modal'

/** Replaces window.prompt (unstyled, ignores the app's theme entirely) for naming a
 *  new saved block when grouping selected canvas nodes. */
export default function GroupNameModal({
  defaultLabel,
  blockCount,
  onConfirm,
  onCancel,
}: {
  defaultLabel: string
  blockCount: number
  onConfirm: (label: string) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(defaultLabel)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm(label.trim() || defaultLabel)
  }

  return (
    <Modal onClose={onCancel} panelClassName="w-80 rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800" labelledBy="group-name-title">
      <form onSubmit={submit}>
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="group-name-title"
            className="flex items-center gap-1.5 text-base font-semibold text-gray-800 dark:text-gray-100"
          >
            <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Save as a block
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          Groups the {blockCount} selected blocks into one reusable block, saved under "My Blocks".
        </p>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Name</label>
        <input
          type="text"
          required
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
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
            className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Save block
          </button>
        </div>
      </form>
    </Modal>
  )
}
