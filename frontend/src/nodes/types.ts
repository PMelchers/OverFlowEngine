import {
  BarChart3,
  Bot,
  Calendar,
  CalendarDays,
  Circle,
  Diamond,
  FileSearch,
  FileText,
  GitFork,
  Hash,
  Languages,
  Layers,
  Lightbulb,
  ListChecks,
  ListTodo,
  LogIn,
  LogOut,
  type LucideIcon,
  Mail,
  MapPin,
  PenLine,
  Play,
  Reply,
  Sparkles,
  Tag,
  Terminal,
  Users,
  Variable as VariableIcon,
  Cpu,
  Webhook,
  Zap,
} from 'lucide-react'

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
  // app-trigger / app-action blocks - synced in by Canvas from /calendar/connections,
  // keyed by app label (e.g. "Google Calendar"); missing keys read as not connected
  appConnections?: Record<string, boolean>
  /** opens Settings straight to Connected Apps - synced in by Canvas */
  onOpenSettings?: (subPage?: 'connected-apps') => void
  /** re-fetches appConnections after the in-canvas connect modal finishes - synced in by Canvas */
  onAppConnected?: () => void
  // variable-block
  varType?: VariableType
  value?: string
  // log-block
  message?: string
  // task-block (adds a small to-do item to the signed-in user's dashboard when it runs)
  title?: string
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
  /** sample sender address, e.g. for an email trigger - saved as "{outputVariable}From" so a
   *  downstream App Action block can reply to whoever sent the original message */
  fromAddress?: string
  // app-trigger block reuses `value` for the sample incoming message/payload
  // app-action block (does one action against another connected app - which action
  // is available depends on targetApp, so the palette stays at one Trigger block and
  // one Action block no matter how many apps get added later)
  targetApp?: string
  /** which action to run against targetApp - 'sendMessage' (Email/Slack/Teams/Webhook),
   *  'aiCall' (targetApp = "AI" - no external account, calls a connected model instead),
   *  or, for Google/Microsoft Calendar, 'fetchEvents' | 'createEvent' | 'deleteEvent' */
  targetAction?: 'sendMessage' | 'aiCall' | 'fetchEvents' | 'createEvent' | 'deleteEvent'
  to?: string
  subject?: string
  body?: string
  // app-action block, targetApp = "AI" (targetAction "aiCall") - reuses `credentialId`/
  // `provider`/`model` (same fields as an AI Model block) and `prompt` (same field as an
  // AI Agent block); which quick-action template last filled `prompt`, purely so the
  // picker can show it selected again when reopened
  aiCallMode?: AiCallMode
  // maps-action block (builds a real Google/Apple Maps directions URL - no API key needed)
  mapsProvider?: 'google' | 'apple'
  origin?: string
  destination?: string
  travelMode?: 'driving' | 'walking' | 'bicycling' | 'transit'
  // maps-action block reuses `outputVariable` for the variable name the built URL is saved into
  // activity-suggestion block (AI suggests stops along a route; console-logged, added to the
  // route only if accepted) - reuses `outputVariable` for the variable name the accepted
  // suggestion is saved into, which a downstream Maps Route block can weave into its Destination
  // with e.g. "{destinationCountry}, via {routeActivities}"
  activityContext?: string
  interests?: string
  // app-action block, targetApp = "Google Calendar" | "Microsoft Calendar" (real OAuth
  // account, connected from Settings - the provider is just targetApp, lowercased)
  /** targetAction "fetchEvents": how many days ahead of now to fetch, e.g. "7" */
  daysAhead?: string
  /** targetAction "createEvent" */
  eventTitle?: string
  startTime?: string
  endTime?: string
  eventDescription?: string
  /** targetAction "deleteEvent": the event id to remove - typically {a Create/Fetch block's outputVariable} */
  eventId?: string
  // "fetchEvents"/"createEvent" reuse `outputVariable` for the variable name the
  // result (an event summary, or a newly-created event's id) is saved into
}

export type BlockKind =
  | 'trigger'
  | 'appTrigger'
  | 'block'
  | 'ifOne'
  | 'if'
  | 'variable'
  | 'log'
  | 'task'
  | 'choice'
  | 'group'
  | 'aiAgent'
  | 'aiInput'
  | 'aiOutput'
  | 'aiModel'
  | 'appAction'
  | 'mapsAction'
  | 'activitySuggestion'

export type PaletteCategory = 'core' | 'agentic'

export interface PaletteItem {
  kind: BlockKind
  label: string
  description: string
  color: string
  icon: LucideIcon
  badgeClassName: string
  category: PaletteCategory
}

// One shared app list for both the Trigger block (click it, pick the app that starts
// the flow) and the Action block (click it, pick the app, then pick the action to run
// against it). Adding a new integration means adding one entry here - not a new block
// type, new palette entry, or new set of Canvas wiring - so the palette stays exactly
// two blocks ("App Trigger" / "App Action") no matter how many apps get connected.
export const APP_TRIGGER_SOURCES = [
  'Microsoft Teams',
  'Slack',
  'Email',
  'Webhook',
  'Google Calendar',
  'Microsoft Calendar',
]

/** Apps with more than one possible action - the Action block shows an action picker
 *  only for these; every other app just sends a message (its only action). */
export const CALENDAR_APPS = ['Google Calendar', 'Microsoft Calendar']

/** Calendar OAuth provider id <-> the app label shown on App Trigger/Action blocks. */
export const CALENDAR_PROVIDER_TO_APP: Record<string, string> = {
  google: 'Google Calendar',
  microsoft: 'Microsoft Calendar',
}
export const APP_TO_CALENDAR_PROVIDER: Record<string, 'google' | 'microsoft'> = {
  'Google Calendar': 'google',
  'Microsoft Calendar': 'microsoft',
}

/** One icon per real app, shown in the app picker window and on the block itself. */
export const APP_ICONS: Record<string, LucideIcon> = {
  'Microsoft Teams': Users,
  Slack: Hash,
  Email: Mail,
  Webhook: Webhook,
  'Google Calendar': Calendar,
  'Microsoft Calendar': CalendarDays,
}

/** Sentinel targetApp value for an App Action block doing an AI call instead of talking
 *  to a real external app - keeps the same "one Action block" palette promise. */
export const AI_ACTION_APP = 'AI'

export type AiCallMode = 'custom' | 'extract' | 'summarize' | 'classify' | 'write' | 'translate' | 'analyze'

export interface AiQuickAction {
  key: AiCallMode
  label: string
  description: string
  icon: LucideIcon
  /** starting point dropped into the prompt field when picked - fully editable after */
  promptTemplate: string
}

// The AI category of the App Action picker - same idea as Zapier's "AI by Zapier"
// quick actions, minus the ones we have no backing feature for (transcribe, search).
export const AI_QUICK_ACTIONS: AiQuickAction[] = [
  { key: 'custom', label: 'Custom prompt', description: 'Write your own instructions', icon: Sparkles, promptTemplate: '' },
  {
    key: 'extract',
    label: 'Extract',
    description: 'Pull structured fields out of text',
    icon: FileSearch,
    promptTemplate: 'Extract the following fields as JSON from this text:\n\n{input}',
  },
  {
    key: 'summarize',
    label: 'Summarize',
    description: 'Condense text into a short summary',
    icon: FileText,
    promptTemplate: 'Summarize the following text in a few sentences:\n\n{input}',
  },
  {
    key: 'classify',
    label: 'Classify',
    description: 'Sort text into one of your categories',
    icon: Tag,
    promptTemplate: 'Classify the following text into one of these categories: [list your categories]\n\n{input}',
  },
  {
    key: 'write',
    label: 'Write',
    description: 'Draft new text from instructions',
    icon: PenLine,
    promptTemplate: 'Write the following:\n\n{input}',
  },
  {
    key: 'translate',
    label: 'Translate',
    description: 'Translate text into another language',
    icon: Languages,
    promptTemplate: 'Translate the following text into [target language]:\n\n{input}',
  },
  {
    key: 'analyze',
    label: 'Analyze',
    description: 'Analyze text and report findings',
    icon: BarChart3,
    promptTemplate: 'Analyze the following text and report your findings:\n\n{input}',
  },
]

export const PALETTE_ITEMS: PaletteItem[] = [
  { kind: 'trigger', label: 'Start Button', description: 'Starts the workflow', color: 'bg-purple-100 border-purple-400 dark:bg-purple-950 dark:border-purple-700', icon: Play, badgeClassName: 'bg-purple-600', category: 'core' },
  { kind: 'appTrigger', label: 'App Trigger', description: 'Starts the workflow from another app - click it to pick which one (Teams, Outlook, Google/Microsoft Calendar, ...)', color: 'bg-cyan-100 border-cyan-400 dark:bg-cyan-950 dark:border-cyan-700', icon: Zap, badgeClassName: 'bg-cyan-600', category: 'core' },
  { kind: 'appAction', label: 'App Action', description: 'Does one action in another app, or runs an AI call - click it to pick from the app list or the AI category', color: 'bg-emerald-100 border-emerald-400 dark:bg-emerald-950 dark:border-emerald-700', icon: Reply, badgeClassName: 'bg-emerald-600', category: 'core' },
  { kind: 'mapsAction', label: 'Maps Route', description: 'Builds a real Google Maps or Apple Maps directions link - no API key needed', color: 'bg-lime-100 border-lime-500 dark:bg-lime-950 dark:border-lime-700', icon: MapPin, badgeClassName: 'bg-lime-600', category: 'core' },
  { kind: 'activitySuggestion', label: 'Suggest Activities', description: 'AI suggests stops along the route, logs the suggestion, and adds it to the route only if accepted', color: 'bg-orange-100 border-orange-400 dark:bg-orange-950 dark:border-orange-700', icon: Lightbulb, badgeClassName: 'bg-orange-600', category: 'agentic' },
  { kind: 'block', label: 'Action Block', description: 'Generic function block', color: 'bg-white border-gray-300 dark:bg-gray-800 dark:border-gray-600', icon: Circle, badgeClassName: 'bg-gray-500', category: 'core' },
  { kind: 'ifOne', label: 'If Block (Single)', description: 'Branches Yes/No on one check', color: 'bg-amber-100 border-amber-400 dark:bg-amber-950 dark:border-amber-700', icon: Diamond, badgeClassName: 'bg-amber-600', category: 'core' },
  { kind: 'if', label: 'If Block (Multiple)', description: 'Branches Yes/No on several checks (AND/OR)', color: 'bg-amber-100 border-amber-400 dark:bg-amber-950 dark:border-amber-700', icon: ListChecks, badgeClassName: 'bg-amber-600', category: 'core' },
  { kind: 'variable', label: 'Variable Block', description: 'Declare & update a variable', color: 'bg-sky-100 border-sky-400 dark:bg-sky-950 dark:border-sky-700', icon: VariableIcon, badgeClassName: 'bg-sky-600', category: 'core' },
  { kind: 'log', label: 'Log Block', description: 'Prints a message to the backend console', color: 'bg-slate-200 border-slate-500 dark:bg-slate-800 dark:border-slate-600', icon: Terminal, badgeClassName: 'bg-slate-600', category: 'core' },
  { kind: 'task', label: 'Task Block', description: 'Adds a small task to your dashboard when it runs (only while signed in)', color: 'bg-rose-100 border-rose-400 dark:bg-rose-950 dark:border-rose-700', icon: ListTodo, badgeClassName: 'bg-rose-600', category: 'core' },
  { kind: 'choice', label: 'Choice Block', description: 'Pauses and asks the user to pick a path', color: 'bg-teal-100 border-teal-500 dark:bg-teal-950 dark:border-teal-700', icon: GitFork, badgeClassName: 'bg-teal-600', category: 'core' },
  { kind: 'aiInput', label: 'AI Input Block', description: 'Defines the text/data fed into an AI agent', color: 'bg-violet-100 border-violet-400 dark:bg-violet-950 dark:border-violet-700', icon: LogIn, badgeClassName: 'bg-violet-600', category: 'agentic' },
  { kind: 'aiAgent', label: 'AI Agent Block', description: 'Runs an AI agent using a model connected below it', color: 'bg-fuchsia-100 border-fuchsia-400 dark:bg-fuchsia-950 dark:border-fuchsia-700', icon: Bot, badgeClassName: 'bg-fuchsia-600', category: 'agentic' },
  { kind: 'aiOutput', label: 'AI Output Block', description: 'Captures what the agent responded with', color: 'bg-pink-100 border-pink-400 dark:bg-pink-950 dark:border-pink-700', icon: LogOut, badgeClassName: 'bg-pink-600', category: 'agentic' },
  { kind: 'aiModel', label: 'AI Model', description: 'Unlock with a verified API key, then connect it under an AI Agent block', color: 'bg-fuchsia-50 border-fuchsia-300 dark:bg-fuchsia-950 dark:border-fuchsia-800', icon: Cpu, badgeClassName: 'bg-fuchsia-500', category: 'agentic' },
]

/** Icon for the Group block (created via "Group Selected", not dragged from the palette). */
export const GROUP_ICON: LucideIcon = Layers
