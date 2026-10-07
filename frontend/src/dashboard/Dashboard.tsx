import { Blocks, Plus, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import AuthModal from '../shared/AuthModal'
import { useAuth } from '../shared/auth'
import { TEMPLATES } from '../shared/templates'
import AssignmentModal from './AssignmentModal'
import AssignmentsPanel from './AssignmentsPanel'
import DashboardSidebar from './DashboardSidebar'
import TasksPanel from './TasksPanel'
import type { Assignment, FlowSummary, Task } from './types'

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
      <DashboardSidebar
        onCreateNew={onCreateNew}
        onOpenMarketplace={onOpenMarketplace}
        onOpenSettings={onOpenSettings}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        user={user}
        displayName={displayName}
        flows={flows}
        loading={loading}
        error={error}
        deletingId={deletingId}
        onOpenFlow={onOpenFlow}
        onDeleteFlow={deleteFlow}
      />

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
              <TasksPanel
                tasks={tasks}
                tasksLoading={tasksLoading}
                newTask={newTask}
                setNewTask={setNewTask}
                addTask={addTask}
                toggleTask={toggleTask}
                deleteTask={deleteTask}
              />
              <AssignmentsPanel
                assignments={assignments}
                assignmentsLoading={assignmentsLoading}
                onNewAssignment={() => setAssignmentModal('new')}
                onEditAssignment={(a) => setAssignmentModal(a)}
                onDeleteAssignment={deleteAssignment}
              />
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
