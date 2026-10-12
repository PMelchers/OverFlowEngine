export type FlowSummary = { id: number; name: string; created_at: string }
export type Task = { id: number; title: string; done: boolean; created_at: string }
export type Assignment = {
  id: number
  name: string
  description: string | null
  created_at: string
  flows: { id: number; name: string }[]
}

/** Lifecycle of a workflow_runs row (see the backend's executor._advance_and_record).
 *  "interrupted" = cut off by a backend restart, "expired" = paused too long without a
 *  choice (both set by executor.expire_stale_runs). "completed" only appears on rows
 *  logged before runs had this lifecycle. */
export type RunStatus =
  | 'running'
  | 'awaiting_choice'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'expired'
  | 'completed'

export type RunSummary = {
  id: number
  status: RunStatus
  flow_id: number | null
  /** null for a run of an unsaved canvas (blank or a template that was never saved) */
  flow_name: string | null
  created_at: string
  finished_at: string | null
}

export type RunStep = {
  node_id: string | null
  type: string
  label: string
  message: string
  /** set on the step of a block that couldn't do its job - what makes a run "failed" */
  error?: boolean
}

export type RunDetail = RunSummary & {
  steps: RunStep[]
  /** the variables this run ended with (or has so far) - scoped to the run itself */
  variables: Record<string, { type: string; value: string }>
}
