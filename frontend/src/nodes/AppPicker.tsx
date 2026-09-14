import { Search, Sparkles, Wrench } from 'lucide-react'
import { type RefObject, useState } from 'react'
import { createPortal } from 'react-dom'
import { AI_QUICK_ACTIONS, APP_ICONS, type AiCallMode } from './types'

type Category = 'apps' | 'ai'

/**
 * App picker window - click an app chip on an App Trigger/Action block to open this.
 * Rendered through a portal straight into <body>, positioned from the chip's own rect,
 * same reasoning as AboutDropdown: an ancestor's stacking context (React Flow's own
 * z-index, the node's transform) would otherwise trap it below the canvas pane.
 */
export default function AppPicker({
  anchorRef,
  onClose,
  apps,
  selectedApp,
  onSelectApp,
  aiActions,
}: {
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  apps: string[]
  selectedApp?: string
  onSelectApp: (app: string) => void
  aiActions?: {
    selectedMode?: AiCallMode
    onSelect: (mode: AiCallMode) => void
  }
}) {
  const [category, setCategory] = useState<Category>(selectedApp === 'AI' && aiActions ? 'ai' : 'apps')
  const [search, setSearch] = useState('')

  const rect = anchorRef.current?.getBoundingClientRect()
  const top = (rect?.bottom ?? 0) + 6
  const left = rect?.left ?? 16

  const query = search.trim().toLowerCase()
  const filteredApps = apps.filter((a) => a.toLowerCase().includes(query))
  const filteredAiActions = AI_QUICK_ACTIONS.filter(
    (a) => a.label.toLowerCase().includes(query) || a.description.toLowerCase().includes(query),
  )

  const showApps = category === 'apps' || (query !== '' && filteredApps.length > 0)
  const showAi = aiActions && (category === 'ai' || (query !== '' && filteredAiActions.length > 0))

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div
        style={{ top, left }}
        className="fixed z-[101] flex h-96 w-[420px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={aiActions ? 'Search apps or AI actions...' : 'Search apps...'}
            className="w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-gray-100"
          />
        </div>

        <div className="flex min-h-0 flex-1">
          {!query && (
            <div className="flex w-28 shrink-0 flex-col gap-0.5 border-r border-gray-100 bg-gray-50/60 p-2 dark:border-gray-700 dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => setCategory('apps')}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                  category === 'apps'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-50'
                    : 'text-gray-500 hover:bg-white/60 dark:text-gray-400 dark:hover:bg-gray-700/50'
                }`}
              >
                <Wrench className="h-3.5 w-3.5" /> Apps
              </button>
              {aiActions && (
                <button
                  type="button"
                  onClick={() => setCategory('ai')}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                    category === 'ai'
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-50'
                      : 'text-gray-500 hover:bg-white/60 dark:text-gray-400 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" /> AI
                </button>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {showApps && (
              <>
                {filteredApps.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-gray-400 dark:text-gray-500">No apps match "{search}"</p>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredApps.map((app) => {
                      const Icon = APP_ICONS[app] ?? Wrench
                      return (
                        <li key={app}>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectApp(app)
                              onClose()
                            }}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                              selectedApp === app
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60'
                            }`}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            {app}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}

            {showAi && aiActions && (
              <>
                {showApps && (
                  <p className="mb-1 mt-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    AI actions
                  </p>
                )}
                {filteredAiActions.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-gray-400 dark:text-gray-500">No AI actions match "{search}"</p>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredAiActions.map((a) => (
                      <li key={a.key}>
                        <button
                          type="button"
                          onClick={() => {
                            aiActions.onSelect(a.key)
                            onClose()
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                            selectedApp === 'AI' && aiActions.selectedMode === a.key
                              ? 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300'
                              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60'
                          }`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950 dark:text-fuchsia-400">
                            <a.icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{a.label}</span>
                            <span className="block truncate text-[11px] text-gray-400 dark:text-gray-500">
                              {a.description}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
