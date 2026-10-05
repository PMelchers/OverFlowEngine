export type FlowSummary = { id: number; name: string; created_at: string }
export type Task = { id: number; title: string; done: boolean; created_at: string }
export type Assignment = {
  id: number
  name: string
  description: string | null
  created_at: string
  flows: { id: number; name: string }[]
}
