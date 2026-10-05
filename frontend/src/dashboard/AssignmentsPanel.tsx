import { Folders, Plus, X } from 'lucide-react'
import type { Assignment } from './types'

export default function AssignmentsPanel({
  assignments,
  assignmentsLoading,
  onNewAssignment,
  onEditAssignment,
  onDeleteAssignment,
}: {
  assignments: Assignment[]
  assignmentsLoading: boolean
  onNewAssignment: () => void
  onEditAssignment: (assignment: Assignment) => void
  onDeleteAssignment: (id: number) => void
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
          <Folders className="h-4 w-4 text-red-600 dark:text-red-400" /> Assignments
        </h2>
        <button
          type="button"
          onClick={onNewAssignment}
          className="rounded-lg border border-gray-200 p-1 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
          title="New assignment"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mb-3 text-[11px] text-gray-400 dark:text-gray-500">
        Group related flows under one bigger piece of work.
      </p>
      {assignmentsLoading ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Loading...</p>
      ) : assignments.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">No assignments yet.</p>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="group rounded-lg border border-gray-200 p-2 dark:border-gray-700"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onEditAssignment(a)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                    {a.name}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {a.flows.length} flow{a.flows.length === 1 ? '' : 's'} bound
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteAssignment(a.id)}
                  className="shrink-0 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {a.flows.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {a.flows.map((f) => (
                    <span
                      key={f.id}
                      className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                    >
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
