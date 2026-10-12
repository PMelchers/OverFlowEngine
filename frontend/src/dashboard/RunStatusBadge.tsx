import { CheckCircle2, Loader2, PauseCircle, XCircle, type LucideIcon } from 'lucide-react'
import type { RunStatus } from './types'

const STATUS_STYLES: Record<RunStatus, { label: string; className: string; Icon: LucideIcon }> = {
  succeeded: {
    label: 'Succeeded',
    className: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    Icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    Icon: XCircle,
  },
  awaiting_choice: {
    label: 'Waiting for input',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    Icon: PauseCircle,
  },
  running: {
    label: 'Running',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    Icon: Loader2,
  },
  // The backend restarted while this run was still going.
  interrupted: {
    label: 'Interrupted',
    className: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    Icon: XCircle,
  },
  // Paused on a choice nobody answered within the backend's PENDING_RUN_TTL.
  expired: {
    label: 'Expired',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    Icon: PauseCircle,
  },
  completed: {
    label: 'Completed',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    Icon: CheckCircle2,
  },
}

export default function RunStatusBadge({ status }: { status: RunStatus }) {
  const { label, className, Icon } = STATUS_STYLES[status] ?? STATUS_STYLES.completed
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  )
}
