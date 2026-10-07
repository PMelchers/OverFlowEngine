import { Folders, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../shared/auth'
import Modal from '../shared/Modal'
import type { Assignment, FlowSummary } from './types'

export default function AssignmentModal({
  assignment,
  flows,
  onClose,
  onSaved,
}: {
  assignment: Assignment | null
  flows: FlowSummary[]
  onClose: () => void
  onSaved: () => void
}) {
  const { authedFetch } = useAuth()
  const [name, setName] = useState(assignment?.name ?? '')
  const [description, setDescription] = useState(assignment?.description ?? '')
  const [flowIds, setFlowIds] = useState<Set<number>>(new Set(assignment?.flows.map((f) => f.id) ?? []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleFlow = (id: number) => {
    setFlowIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!name.trim()) {
      setError('Give this assignment a name')
      return
    }
    setError(null)
    setSaving(true)
    try {
      let assignmentId = assignment?.id
      if (assignmentId == null) {
        const res = await authedFetch('/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        })
        if (!res.ok) throw new Error('Could not create the assignment')
        assignmentId = (await res.json()).id
      } else {
        const res = await authedFetch(`/assignments/${assignmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        })
        if (!res.ok) throw new Error('Could not update the assignment')
      }

      // Bind/unbind only what actually changed - each flow may be bound to other
      // assignments too, so this only ever touches this one assignment's link to it.
      const wasBoundIds = new Set(assignment?.flows.map((f) => f.id) ?? [])
      for (const flow of flows) {
        const isBound = flowIds.has(flow.id)
        const wasBound = wasBoundIds.has(flow.id)
        if (isBound === wasBound) continue
        await authedFetch(`/flows/${flow.id}/assignments/${assignmentId}`, {
          method: isBound ? 'POST' : 'DELETE',
        })
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this assignment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      panelClassName="w-96 max-h-[80vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
      labelledBy="assignment-modal-title"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="assignment-modal-title"
          className="flex items-center gap-1.5 text-base font-semibold text-gray-800 dark:text-gray-100"
        >
          <Folders className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          {assignment ? 'Edit Assignment' : 'New Assignment'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="mb-3 block text-sm text-gray-600 dark:text-gray-300">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q4 Product Launch"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="mb-3 block text-sm text-gray-600 dark:text-gray-300">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What's this assignment about?"
            className="mt-1 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <p className="mb-1.5 text-sm text-gray-600 dark:text-gray-300">Bind flows to this assignment</p>
        {flows.length === 0 ? (
          <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
            No saved flows yet - save one from the editor first.
          </p>
        ) : (
          <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
            {flows.map((f) => (
              <li key={f.id}>
                <label className="flex items-center gap-2 rounded px-1 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={flowIds.has(f.id)}
                    onChange={() => toggleFlow(f.id)}
                    className="h-3.5 w-3.5 rounded accent-blue-600"
                  />
                  <span className="truncate">{f.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : assignment ? 'Save Changes' : 'Create Assignment'}
        </button>
    </Modal>
  )
}
