import { Link2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { APP_ICONS, CALENDAR_APPS } from '../types'

/**
 * Slides in from the right edge of the screen after picking an app that isn't connected
 * yet - a nudge, not a blocker, so it doesn't stop you from configuring the block while
 * the account gets connected separately (from Settings).
 */
export default function ConnectAppNudge({
  app,
  onConnect,
  onClose,
}: {
  app: string
  onConnect: () => void
  onClose: () => void
}) {
  const Icon = APP_ICONS[app] ?? Link2
  const canConnect = CALENDAR_APPS.includes(app)

  return createPortal(
    <div className="slide-in-right fixed right-4 top-1/2 z-[110] w-72 rounded-xl border border-amber-300 bg-white p-4 shadow-xl ring-1 ring-black/5 dark:border-amber-700 dark:bg-gray-800">
      <div className="mb-2 flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{app} isn't connected</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {canConnect
          ? `Connect your real ${app} account so this block can actually read/write it. Until then it runs in preview mode.`
          : `${app} doesn't have a live connection yet - this block simulates the action until real ${app} support is added.`}
      </p>
      {canConnect && (
        <button
          type="button"
          onClick={() => {
            onConnect()
            onClose()
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          <Link2 className="h-3.5 w-3.5" /> Connect now
        </button>
      )}
    </div>,
    document.body,
  )
}
