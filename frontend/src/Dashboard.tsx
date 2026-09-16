import { Blocks, Check, ClipboardList, Folders, Plus, Settings as SettingsIcon, Store, X, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import AboutDropdown from './AboutDropdown'
import AuthModal from './AuthModal'
import { useAuth } from './auth'
import { TEMPLATES } from './templates'

type FlowSummary = { id: number; name: string; created_at: string }
type Task = { id: number; title: string; done: boolean; created_at: string }
type Assignment = {
  id: number
  name: string
  description: string | null
  created_at: string
  flows: { id: number; name: string }[]
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function AssignmentModal({
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-96 max-h-[80vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-800 dark:text-gray-100">
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
      </div>
    </div>
  )
}

export default function Dashboard({
  onCreateNew,
  onCreateFromTemplate,
  onOpenFlow,
  onOpenSettings,
  onOpenMarketplace,
}: {
  onCreateNew: () => void
  onCreateFromTemplate: (templateId: string) => void
  onOpenFlow: (flowId: number) => void
  onOpenSettings: () => void
  onOpenMarketplace: () => void
}) {
  const { user, authedFetch } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const logoRef = useRef<HTMLButtonElement>(null)
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [newTask, setNewTask] = useState('')

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentModal, setAssignmentModal] = useState<'new' | Assignment | null>(null)

  const loadFlows = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const res = await authedFetch('/flows')
      if (!res.ok) throw new Error('Could not load your saved flows')
      setFlows(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your saved flows')
    } finally {
      setLoading(false)
    }
  }

  const loadTasks = async () => {
    if (!user) return
    setTasksLoading(true)
    try {
      const res = await authedFetch('/tasks')
      if (res.ok) setTasks(await res.json())
    } finally {
      setTasksLoading(false)
    }
  }

  const loadAssignments = async () => {
    if (!user) return
    setAssignmentsLoading(true)
    try {
      const res = await authedFetch('/assignments')
      if (res.ok) setAssignments(await res.json())
    } finally {
      setAssignmentsLoading(false)
    }
  }

  useEffect(() => {
    loadFlows()
    loadTasks()
    loadAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const deleteFlow = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return
    setDeletingId(id)
    try {
      await authedFetch(`/flows/${id}`, { method: 'DELETE' })
      setFlows((f) => f.filter((flow) => flow.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = newTask.trim()
    if (!title) return
    setNewTask('')
    const res = await authedFetch('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (res.ok) {
      const created = await res.json()
      setTasks((t) => [created, ...t])
    }
  }

  const toggleTask = async (task: Task) => {
    setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, done: !x.done } : x)))
    await authedFetch(`/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !task.done }),
    })
  }

  const deleteTask = async (id: number) => {
    setTasks((t) => t.filter((x) => x.id !== id))
    await authedFetch(`/tasks/${id}`, { method: 'DELETE' })
  }

  const deleteAssignment = async (id: number) => {
    if (!window.confirm('Delete this assignment? Bound flows are not affected.')) return
    setAssignments((a) => a.filter((x) => x.id !== id))
    await authedFetch(`/assignments/${id}`, { method: 'DELETE' })
  }

  const displayName = user?.name || user?.email || ''
  const firstName = displayName.split(/[\s@]/)[0]

  return (
    <div className="flex h-screen w-screen bg-white dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        <div className="px-4 pt-4">
          <button
            ref={logoRef}
            type="button"
            onClick={() => setAboutOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-red-600 text-white shadow-sm">
              <Zap className="h-4 w-4" fill="currentColor" />
            </div>
            <span className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-50">
              OverFlowEngine
            </span>
          </button>
          {aboutOpen && <AboutDropdown anchorRef={logoRef} onClose={() => setAboutOpen(false)} />}
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={onCreateNew}
            className="flex w-full items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> New Workflow
          </button>
        </div>

        <nav className="space-y-0.5 px-3">
          <button
            type="button"
            onClick={onOpenMarketplace}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Store className="h-4 w-4" /> Marketplace
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <SettingsIcon className="h-4 w-4" /> Settings
          </button>
        </nav>

        <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
          <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Saved Flows
          </p>
          <div className="flex-1 overflow-y-auto pb-2">
            {!user ? (
              <p className="px-2.5 py-1 text-xs text-gray-400 dark:text-gray-500">Sign in to see your flows.</p>
            ) : loading ? (
              <p className="px-2.5 py-1 text-xs text-gray-400 dark:text-gray-500">Loading...</p>
            ) : error ? (
              <p className="px-2.5 py-1 text-xs text-red-500 dark:text-red-400">{error}</p>
            ) : flows.length === 0 ? (
              <p className="px-2.5 py-1 text-xs text-gray-400 dark:text-gray-500">No saved flows yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {flows.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onOpenFlow(f.id)}
                      title={`Saved ${relativeDate(f.created_at)}`}
                      className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-gray-200/60 dark:hover:bg-gray-800"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400 dark:bg-blue-500" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
                        {f.name}
                      </span>
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => deleteFlow(f.id, f.name, e)}
                        className={`shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-gray-500 dark:hover:text-red-400 ${
                          deletingId === f.id ? 'opacity-100' : ''
                        }`}
                        title="Delete"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          {user ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-200/60 dark:hover:bg-gray-800"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-red-500 text-[11px] font-bold text-white">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                {displayName}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Sign in
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="mb-6 flex items-center justify-center gap-2.5 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            <Zap className="h-7 w-7 text-blue-600 dark:text-blue-400" fill="currentColor" />
            {user ? `Back at it, ${firstName}` : 'Welcome to OverFlowEngine'}
          </h1>

          <button
            type="button"
            onClick={onCreateNew}
            className="group flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-left shadow-sm transition-all duration-150 hover:border-blue-300 hover:bg-white hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:bg-gray-800"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition-transform group-hover:scale-105">
              <Plus className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                Start a new workflow
              </span>
              <span className="block text-xs text-gray-400 dark:text-gray-500">
                Open a blank canvas and drag blocks onto it
              </span>
            </span>
          </button>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.description}
                onClick={() => onCreateFromTemplate(t.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-all duration-150 hover:border-red-300 hover:bg-red-50 hover:text-red-700 active:scale-[0.97] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
              >
                <Blocks className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>

          {user && (
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Tasks */}
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

              {/* Assignments */}
              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    <Folders className="h-4 w-4 text-red-600 dark:text-red-400" /> Assignments
                  </h2>
                  <button
                    type="button"
                    onClick={() => setAssignmentModal('new')}
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
                            onClick={() => setAssignmentModal(a)}
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
                            onClick={() => deleteAssignment(a.id)}
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
            </div>
          )}
        </div>
      </main>

      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      {assignmentModal && (
        <AssignmentModal
          assignment={assignmentModal === 'new' ? null : assignmentModal}
          flows={flows}
          onClose={() => setAssignmentModal(null)}
          onSaved={loadAssignments}
        />
      )}
    </div>
  )
}
