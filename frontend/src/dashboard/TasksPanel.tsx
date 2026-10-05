import { Check, ClipboardList, Plus, X } from 'lucide-react'
import type { Task } from './types'

export default function TasksPanel({
  tasks,
  tasksLoading,
  newTask,
  setNewTask,
  addTask,
  toggleTask,
  deleteTask,
}: {
  tasks: Task[]
  tasksLoading: boolean
  newTask: string
  setNewTask: (value: string) => void
  addTask: (e: React.FormEvent) => void
  toggleTask: (task: Task) => void
  deleteTask: (id: number) => void
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
        <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Tasks
      </h2>
      <p className="mb-3 text-[11px] text-gray-400 dark:text-gray-500">
        Add your own, or drop a Task block into a flow to fill this in automatically when it runs.
      </p>
      <form onSubmit={addTask} className="mb-3 flex gap-1.5">
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a task..."
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
      {tasksLoading ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">No tasks yet.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <button
                type="button"
                onClick={() => toggleTask(t)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  t.done
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {t.done && <Check className="h-3 w-3" />}
              </button>
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  t.done
                    ? 'text-gray-400 line-through dark:text-gray-500'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                {t.title}
              </span>
              <button
                type="button"
                onClick={() => deleteTask(t.id)}
                className="shrink-0 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
