export type BlockStatus = 'idle' | 'active'
export type VariableType = 'string' | 'int' | 'boolean'

export interface SubgraphNode {
  id: string
  type: string
  data: BlockNodeData
  /** position relative to the chain's centroid at save time, so it lays out sensibly when reopened for editing */
  position: { x: number; y: number }
}

export interface SubgraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

/** A saved chain of blocks, flattened into a single Group block. */
export interface Subgraph {
  nodes: SubgraphNode[]
  edges: SubgraphEdge[]
  /** ids of internal nodes with no internal incoming edge (where execution enters) */
  entry: string[]
  /** ids of internal nodes with no internal outgoing edge (where execution exits) */
  exit: string[]
}

export type ConditionOperator = '==' | '!=' | '>' | '>=' | '<' | '<='

export interface IfCondition {
  variable: string
  operator: ConditionOperator
  value: string
  /** how this clause combines with the running result of the clauses before it (ignored on the first clause) */
  combinator?: 'and' | 'or'
}

export interface BlockNodeData {
  label: string
  status?: BlockStatus
  onTrigger?: () => void
  onChange?: (patch: Partial<BlockNodeData>) => void
  // if-block
  conditions?: IfCondition[]
  /** variables currently on the canvas, synced in by Canvas so the picker can suggest them */
  availableVariables?: { name: string; varType: VariableType }[]
  // variable-block
  varType?: VariableType
  value?: string
  // log-block
  message?: string
  // choice-block
  options?: string[]
  // group-block
  subgraph?: Subgraph
  /** id of the saved custom block this instance was created from, if any - lets edits to that
   *  saved block propagate to every instance stamped out from it */
  sourceBlockId?: string
  // ai-agent block
  prompt?: string
  // ai-model block (circular) - unlocked by picking one of the user's verified API keys
  credentialId?: number | null
  /** the linked credential's auto-detected provider - scopes which models can be chosen */
  provider?: string
  /** the chosen model id, e.g. "gpt-4o" - also what the AI Agent block reads as its model */
  model?: string
  // ai-input block reuses `value` (the text/expression fed into the agent)
  // ai-output block reuses `label` as the variable name the result is saved into
  // app-trigger block
  sourceApp?: string
  outputVariable?: string
  // app-trigger block reuses `value` for the sample incoming message/payload
}

export type BlockKind =
  | 'trigger'
  | 'appTrigger'
  | 'block'
  | 'ifOne'
  | 'if'
  | 'variable'
  | 'log'
  | 'choice'
  | 'group'
  | 'aiAgent'
  | 'aiInput'
  | 'aiOutput'
  | 'aiModel'

export type PaletteCategory = 'core' | 'agentic'

export interface PaletteItem {
  kind: BlockKind
  label: string
  description: string
  color: string
  icon: string
  badgeClassName: string
  category: PaletteCategory
}

export const APP_TRIGGER_SOURCES = ['Microsoft Teams', 'Slack', 'Email', 'Webhook']

export const PALETTE_ITEMS: PaletteItem[] = [
  { kind: 'trigger', label: 'Start Button', description: 'Starts the workflow', color: 'bg-purple-100 border-purple-400', icon: '▶', badgeClassName: 'bg-purple-600', category: 'core' },
  { kind: 'appTrigger', label: 'App Trigger', description: 'Starts the workflow with input from another app (e.g. Teams)', color: 'bg-cyan-100 border-cyan-400', icon: '⚡', badgeClassName: 'bg-cyan-600', category: 'core' },
  { kind: 'block', label: 'Action Block', description: 'Generic function block', color: 'bg-white border-gray-300', icon: '●', badgeClassName: 'bg-gray-500', category: 'core' },
  { kind: 'ifOne', label: 'If Block (Single)', description: 'Branches Yes/No on one check', color: 'bg-amber-100 border-amber-400', icon: '◆', badgeClassName: 'bg-amber-600', category: 'core' },
  { kind: 'if', label: 'If Block (Multiple)', description: 'Branches Yes/No on several checks (AND/OR)', color: 'bg-amber-100 border-amber-400', icon: '☰', badgeClassName: 'bg-amber-600', category: 'core' },
  { kind: 'variable', label: 'Variable Block', description: 'Declare & update a variable', color: 'bg-sky-100 border-sky-400', icon: '𝑥', badgeClassName: 'bg-sky-600', category: 'core' },
  { kind: 'log', label: 'Log Block', description: 'Prints a message to the backend console', color: 'bg-slate-200 border-slate-500', icon: '»', badgeClassName: 'bg-slate-600', category: 'core' },
  { kind: 'choice', label: 'Choice Block', description: 'Pauses and asks the user to pick a path', color: 'bg-teal-100 border-teal-500', icon: '◇', badgeClassName: 'bg-teal-600', category: 'core' },
  { kind: 'aiInput', label: 'AI Input Block', description: 'Defines the text/data fed into an AI agent', color: 'bg-violet-100 border-violet-400', icon: 'IN', badgeClassName: 'bg-violet-600', category: 'agentic' },
  { kind: 'aiAgent', label: 'AI Agent Block', description: 'Runs an AI agent using a model connected below it', color: 'bg-fuchsia-100 border-fuchsia-400', icon: '◈', badgeClassName: 'bg-fuchsia-600', category: 'agentic' },
  { kind: 'aiOutput', label: 'AI Output Block', description: 'Captures what the agent responded with', color: 'bg-pink-100 border-pink-400', icon: 'OUT', badgeClassName: 'bg-pink-600', category: 'agentic' },
  { kind: 'aiModel', label: 'AI Model', description: 'Unlock with a verified API key, then connect it under an AI Agent block', color: 'bg-fuchsia-50 border-fuchsia-300', icon: '◎', badgeClassName: 'bg-fuchsia-500', category: 'agentic' },
]
