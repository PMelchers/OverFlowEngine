import { Plus, Settings as SettingsIcon, Store, X, Zap } from 'lucide-react'
import { useRef, useState } from 'react'
import AboutDropdown from '../AboutDropdown'
import type { AuthUser } from '../auth'
import { relativeDate } from '../relativeDate'
import type { FlowSummary } from './types'

export default function DashboardSidebar({
  onCreateNew,
  onOpenMarketplace,
  onOpenSettings,
  onOpenAuthModal,
  user,
  displayName,
  flows,
  loading,
  error,
  deletingId,
  onOpenFlow,
  onDeleteFlow,
}: {
  onCreateNew: () => void
  onOpenMarketplace: () => void
  onOpenSettings: () => void
  onOpenAuthModal: () => void
  user: AuthUser | null
  displayName: string
  flows: FlowSummary[]
  loading: boolean
  error: string | null
  deletingId: number | null
  onOpenFlow: (flowId: number) => void
  onDeleteFlow: (id: number, name: string, e: React.MouseEvent) => void
}) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const logoRef = useRef<HTMLButtonElement>(null)

  return (
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
                      onClick={(e) => onDeleteFlow(f.id, f.name, e)}
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
            onClick={onOpenAuthModal}
            className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Sign in
          </button>
        )}
      </div>
    </aside>
  )
}
