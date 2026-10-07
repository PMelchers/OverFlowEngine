import ActivitySuggestionNode from '../nodes/trip/ActivitySuggestionNode'
import AiAgentNode from '../nodes/ai/AiAgentNode'
import AiInputNode from '../nodes/ai/AiInputNode'
import AiModelNode from '../nodes/ai/AiModelNode'
import AiOutputNode from '../nodes/ai/AiOutputNode'
import AppActionNode from '../nodes/apps/AppActionNode'
import AppTriggerNode from '../nodes/apps/AppTriggerNode'
import BlockNode from '../nodes/core/BlockNode'
import ChoiceNode from '../nodes/core/ChoiceNode'
import CostEstimateNode from '../nodes/trip/CostEstimateNode'
import FormTriggerNode from '../nodes/core/FormTriggerNode'
import GroupNode from '../nodes/core/GroupNode'
import IfNode from '../nodes/core/IfNode'
import IfSingleNode from '../nodes/core/IfSingleNode'
import LogNode from '../nodes/core/LogNode'
import MapsActionNode from '../nodes/trip/MapsActionNode'
import QuickAddButton from './QuickAddButton'
import TaskNode from '../nodes/core/TaskNode'
import TripSummaryNode from '../nodes/trip/TripSummaryNode'
import TriggerNode from '../nodes/core/TriggerNode'
import type {
  AppActionBlockData,
  AppTriggerBlockData,
  BlockKind,
  BlockNodeData,
  SubgraphEdge,
  SubgraphNode,
} from '../nodes/types'
import VariableNode from '../nodes/core/VariableNode'
import type { NodeProps } from 'reactflow'

/** Adds the green "+" quick-add button next to a node's single, unambiguous output -
 *  skipped for branching blocks (If/Choice, where "the next block" is ambiguous) and
 *  AI Model (whose only handle feeds *up* into an Agent, not "the next step"). Applied
 *  once at module scope, not per-render, so `nodeTypes` below stays referentially
 *  stable (React Flow remounts every node whenever that object's identity changes). */
export function withQuickAdd<T extends BlockNodeData>(NodeComponent: React.ComponentType<NodeProps<T>>) {
  function Wrapped(props: NodeProps<T>) {
    return (
      <div className="relative">
        <NodeComponent {...props} />
        <QuickAddButton />
      </div>
    )
  }
  Wrapped.displayName = `withQuickAdd(${NodeComponent.displayName ?? NodeComponent.name ?? 'Node'})`
  return Wrapped
}

export const nodeTypes = {
  trigger: withQuickAdd(TriggerNode),
  appTrigger: withQuickAdd(AppTriggerNode),
  formTrigger: withQuickAdd(FormTriggerNode),
  appAction: withQuickAdd(AppActionNode),
  mapsAction: withQuickAdd(MapsActionNode),
  activitySuggestion: withQuickAdd(ActivitySuggestionNode),
  costEstimate: withQuickAdd(CostEstimateNode),
  tripSummary: withQuickAdd(TripSummaryNode),
  block: withQuickAdd(BlockNode),
  ifOne: IfSingleNode,
  if: IfNode,
  variable: withQuickAdd(VariableNode),
  log: withQuickAdd(LogNode),
  task: withQuickAdd(TaskNode),
  choice: ChoiceNode,
  group: withQuickAdd(GroupNode),
  aiAgent: withQuickAdd(AiAgentNode),
  aiInput: withQuickAdd(AiInputNode),
  aiOutput: withQuickAdd(AiOutputNode),
  aiModel: AiModelNode,
}

/** Blocks that can start a workflow run - React Flow's `type` field, not the BlockKind palette id. */
export const TRIGGER_NODE_TYPES = new Set(['trigger', 'appTrigger', 'formTrigger'])

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let idCount = 1

/** Increments and returns the shared canvas id counter - every call site used to do
 *  `idCount += 1` and then read `idCount`, so this preserves that exact sequence. */
export function nextId(): number {
  idCount += 1
  return idCount
}

export function timestamp() {
  return new Date().toLocaleTimeString()
}

// Overloads so a call site with a literal kind (the "starter" nodes below, which spread
// the result and add more of that kind's own fields) gets the narrowed return type back,
// instead of the full union every other (kind: BlockKind, generic) call site gets.
export function defaultDataFor(kind: 'appTrigger', label: string): AppTriggerBlockData
export function defaultDataFor(kind: 'appAction', label: string): AppActionBlockData
export function defaultDataFor(kind: BlockKind, label: string): BlockNodeData
export function defaultDataFor(kind: BlockKind, label: string): BlockNodeData {
  switch (kind) {
    case 'ifOne':
      return { kind, label, conditions: [{ variable: '', operator: '==', value: '', combinator: 'and' }] }
    case 'if':
      return { kind, label, conditions: [{ variable: '', operator: '==', value: '', combinator: 'and' }] }
    case 'variable':
      return { kind, label: 'myVar', varType: 'string', value: '' }
    case 'log':
      return { kind, label, message: '' }
    case 'task':
      return { kind, label, title: '' }
    case 'choice':
      return { kind, label, options: [] }
    case 'aiAgent':
      return { kind, label, prompt: '' }
    case 'aiInput':
      return { kind, label, value: '' }
    case 'aiOutput':
      return { kind, label: 'agentReply' }
    case 'aiModel':
      return { kind, label: 'Model', credentialId: null }
    case 'appTrigger':
      return { kind, label, value: '', outputVariable: 'incomingMessage', fromAddress: '' }
    case 'formTrigger':
      return { kind, label, fields: [] }
    case 'appAction':
      return { kind, label, to: '', subject: '', body: '' }
    case 'mapsAction':
      return {
        kind,
        label,
        mapsProvider: 'google',
        origin: '',
        destination: '',
        waypoints: '',
        travelMode: 'driving',
        outputVariable: '',
      }
    case 'activitySuggestion':
      return { kind, label, activityContext: '', interests: '', outputVariable: '' }
    case 'trigger':
      return { kind, label }
    case 'block':
      return { kind, label }
    case 'group':
      return { kind, label }
    case 'costEstimate':
      return {
        kind,
        label,
        waypoints: '',
        destinationStops: '',
        origin: '',
        activityContext: '',
        stayType: '',
        transportMode: '',
        checkInDate: '',
        checkOutDate: '',
        adults: '',
        children: '',
        budget: '',
        currency: 'EUR',
        outputVariable: '',
      }
    case 'tripSummary':
      return {
        kind,
        label,
        activityContext: '',
        checkInDate: '',
        checkOutDate: '',
        itinerary: '',
        googleMapsLink: '',
        appleMapsLink: '',
        costBreakdownData: '',
      }
  }
}

export function sanitizeData(data: BlockNodeData): BlockNodeData {
  // onTrigger/availableVariables aren't declared on every kind (only the ones that use
  // them) - widen the destructure target so this stays kind-agnostic cleanup, same as
  // it was before the discriminated union.
  const { onChange, onTrigger, status, availableVariables, ...rest } = data as BlockNodeData & {
    onTrigger?: unknown
    availableVariables?: unknown
  }
  return rest as BlockNodeData
}

/** Recursively inlines Group blocks into their stored subgraph so the backend only ever sees plain blocks. */
export function expandGraph(
  rawNodes: { id: string; type: string; data: BlockNodeData }[],
  rawEdges: SubgraphEdge[],
): { nodes: { id: string; type: string; data: BlockNodeData }[]; edges: SubgraphEdge[] } {
  const outNodes: { id: string; type: string; data: BlockNodeData }[] = []
  const outEdges: SubgraphEdge[] = []
  const boundary: Record<string, { entry: string[]; exit: string[] }> = {}

  for (const n of rawNodes) {
    if (n.data.kind === 'group' && n.data.subgraph) {
      const sub = n.data.subgraph
      const prefix = `${n.id}::`
      const prefixedNodes = sub.nodes.map((sn: SubgraphNode) => ({ ...sn, id: prefix + sn.id }))
      const prefixedEdges = sub.edges.map((se: SubgraphEdge) => ({
        ...se,
        id: prefix + se.id,
        source: prefix + se.source,
        target: prefix + se.target,
      }))
      const inner = expandGraph(prefixedNodes, prefixedEdges)
      outNodes.push(...inner.nodes)
      outEdges.push(...inner.edges)
      boundary[n.id] = {
        entry: sub.entry.map((id) => prefix + id),
        exit: sub.exit.map((id) => prefix + id),
      }
    } else {
      outNodes.push({ id: n.id, type: n.type, data: n.data })
    }
  }

  for (const e of rawEdges) {
    const sources = boundary[e.source]?.exit ?? [e.source]
    const targets = boundary[e.target]?.entry ?? [e.target]
    for (const s of sources) {
      for (const t of targets) {
        outEdges.push({
          id: `${e.id}-${s}-${t}`,
          source: s,
          target: t,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        })
      }
    }
  }

  return { nodes: outNodes, edges: outEdges }
}
