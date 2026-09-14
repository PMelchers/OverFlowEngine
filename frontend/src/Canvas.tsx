import {
  Blocks,
  ChevronDown,
  FolderOpen,
  Home,
  Layers,
  Package,
  Pencil,
  Save,
  Store,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addEdge,
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  MarkerType,
  type Node,
  type NodeDragHandler,
  type OnSelectionChangeParams,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import ActivitySuggestionNode from './nodes/ActivitySuggestionNode'
import AboutDropdown from './AboutDropdown'
import { type AlignmentGuides, snapToNearbyNodes } from './alignment'
import AuthModal from './AuthModal'
import { useAuth } from './auth'
import {
  deleteCustomBlock,
  listCustomBlocks,
  propagateCustomBlockUpdate,
  refreshGroupInstances,
  saveCustomBlock,
  type CustomBlock,
} from './customBlocks'
import FlowsPanel from './FlowsPanel'
import AiAgentNode from './nodes/AiAgentNode'
import AiInputNode from './nodes/AiInputNode'
import AiModelNode from './nodes/AiModelNode'
import AiOutputNode from './nodes/AiOutputNode'
import AppActionNode from './nodes/AppActionNode'
import AppTriggerNode from './nodes/AppTriggerNode'
import BlockNode from './nodes/BlockNode'
import ChoiceNode from './nodes/ChoiceNode'
import GroupNode from './nodes/GroupNode'
import IfNode from './nodes/IfNode'
import IfSingleNode from './nodes/IfSingleNode'
import LogNode from './nodes/LogNode'
import MapsActionNode from './nodes/MapsActionNode'
import QuickAddButton from './nodes/QuickAddButton'
import { QuickAddContext } from './nodes/QuickAddContext'
import TaskNode from './nodes/TaskNode'
import TriggerNode from './nodes/TriggerNode'
import {
  CALENDAR_PROVIDER_TO_APP,
  type BlockKind,
  type BlockNodeData,
  type Subgraph,
  type SubgraphEdge,
  type SubgraphNode,
  type VariableType,
} from './nodes/types'
import VariableNode from './nodes/VariableNode'
import Palette, { CUSTOM_DRAG_PREFIX, DRAG_DATA_FORMAT } from './Palette'
import { TEMPLATE_DRAG_PREFIX, TEMPLATES, type WorkflowTemplate } from './templates'
import { useTheme } from './theme'
import type { NodeProps } from 'reactflow'

/** Adds the green "+" quick-add button next to a node's single, unambiguous output -
 *  skipped for branching blocks (If/Choice, where "the next block" is ambiguous) and
 *  AI Model (whose only handle feeds *up* into an Agent, not "the next step"). Applied
 *  once at module scope, not per-render, so `nodeTypes` below stays referentially
 *  stable (React Flow remounts every node whenever that object's identity changes). */
function withQuickAdd(NodeComponent: React.ComponentType<NodeProps<BlockNodeData>>) {
  function Wrapped(props: NodeProps<BlockNodeData>) {
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

const nodeTypes = {
  trigger: withQuickAdd(TriggerNode),
  appTrigger: withQuickAdd(AppTriggerNode),
  appAction: withQuickAdd(AppActionNode),
  mapsAction: withQuickAdd(MapsActionNode),
  activitySuggestion: withQuickAdd(ActivitySuggestionNode),
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
const TRIGGER_NODE_TYPES = new Set(['trigger', 'appTrigger'])

/** Dashed lines shown while dragging a block that lines up with another block's edge/center. */
function AlignmentGuideLines({ guides }: { guides: AlignmentGuides }) {
  const { x: vx, y: vy, zoom } = useViewport()
  return (
    <>
      {guides.x !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: guides.x * zoom + vx,
            top: 0,
            bottom: 0,
            width: 0,
            borderLeft: '1px dashed #2563eb',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      )}
      {guides.y !== undefined && (
        <div
          style={{
            position: 'absolute',
            top: guides.y * zoom + vy,
            left: 0,
            right: 0,
            height: 0,
            borderTop: '1px dashed #2563eb',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      )}
    </>
  )
}

const API_BASE = 'http://localhost:8000'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let idCount = 1

function timestamp() {
  return new Date().toLocaleTimeString()
}

interface RunStep {
  node_id: string | null
  type: string
  label: string
  message: string
  branch?: string
  options?: string[]
}

interface StoredVariable {
  type: string
  value: string
}

interface RunResult {
  status: 'completed' | 'awaiting_choice' | 'error'
  run_id?: string | number
  node_id?: string
  label?: string
  options?: string[]
  steps: RunStep[]
  variables?: Record<string, StoredVariable>
  message?: string
}

interface PendingChoice {
  runId: string
  nodeId: string
  label: string
  options: string[]
}

function defaultDataFor(kind: BlockKind, label: string): BlockNodeData {
  switch (kind) {
    case 'ifOne':
    case 'if':
      return { label, conditions: [{ variable: '', operator: '==', value: '', combinator: 'and' }] }
    case 'variable':
      return { label: 'myVar', varType: 'string', value: '' }
    case 'log':
      return { label, message: '' }
    case 'task':
      return { label, title: '' }
    case 'choice':
      return { label, options: [] }
    case 'aiAgent':
      return { label, prompt: '' }
    case 'aiInput':
      return { label, value: '' }
    case 'aiOutput':
      return { label: 'agentReply' }
    case 'aiModel':
      return { label: 'Model', credentialId: null }
    case 'appTrigger':
      return { label, value: '', outputVariable: 'incomingMessage', fromAddress: '' }
    case 'appAction':
      return { label, to: '', subject: '', body: '' }
    case 'mapsAction':
      return { label, mapsProvider: 'google', origin: '', destination: '', travelMode: 'driving', outputVariable: '' }
    case 'activitySuggestion':
      return { label, activityContext: '', interests: '', outputVariable: '' }
    default:
      return { label }
  }
}

function sanitizeData(data: BlockNodeData): BlockNodeData {
  const { onChange, onTrigger, status, availableVariables, ...rest } = data
  return rest
}

/** Recursively inlines Group blocks into their stored subgraph so the backend only ever sees plain blocks. */
function expandGraph(
  rawNodes: { id: string; type: string; data: BlockNodeData }[],
  rawEdges: SubgraphEdge[],
): { nodes: { id: string; type: string; data: BlockNodeData }[]; edges: SubgraphEdge[] } {
  const outNodes: { id: string; type: string; data: BlockNodeData }[] = []
  const outEdges: SubgraphEdge[] = []
  const boundary: Record<string, { entry: string[]; exit: string[] }> = {}

  for (const n of rawNodes) {
    if (n.type === 'group' && n.data.subgraph) {
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

interface CanvasProps {
  /** Flow to load into a fresh canvas on mount, e.g. when opened from the dashboard's flow list. */
  initialFlowId?: number | null
  /** Template to drop onto a fresh canvas on mount, e.g. from one of the dashboard's quick-start chips. */
  initialTemplateId?: string | null
  onExitToDashboard?: () => void
  onOpenSettings?: (subPage?: 'connected-apps') => void
  onOpenMarketplace?: () => void
}

function CanvasInner({
  initialFlowId = null,
  initialTemplateId = null,
  onExitToDashboard,
  onOpenSettings,
  onOpenMarketplace,
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [logs, setLogs] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [variables, setVariables] = useState<Record<string, StoredVariable>>({})
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([])
  const [alignGuides, setAlignGuides] = useState<AlignmentGuides>({})
  const [editingBlock, setEditingBlock] = useState<CustomBlock | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [flowsPanelOpen, setFlowsPanelOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [appConnections, setAppConnections] = useState<Record<string, boolean>>({})
  const logoRef = useRef<HTMLButtonElement>(null)
  const { user, authedFetch } = useAuth()
  const { theme } = useTheme()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const templatesButtonRef = useRef<HTMLButtonElement>(null)

  // Smooth, rounded connector lines with a matching arrowhead instead of React Flow's
  // thin default bezier - recomputed only when the theme flips so the color stays readable.
  const defaultEdgeOptions = useMemo<DefaultEdgeOptions>(() => {
    const stroke = theme === 'dark' ? '#93c5fd' : '#2563eb'
    return {
      type: 'smoothstep',
      pathOptions: { borderRadius: 16 },
      style: { stroke, strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: stroke },
    }
  }, [theme])
  const preEditSnapshot = useRef<{ nodes: Node<BlockNodeData>[]; edges: Edge[] } | null>(null)

  const nodesRef = useRef<Node<BlockNodeData>[]>([])
  const edgesRef = useRef<Edge[]>([])
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  // Variables the If block can offer as a pick-list, so people don't have to retype an
  // exact name from memory. Sourced from both Variable blocks currently on the canvas
  // AND variables already saved in the backend (so a variable a prior run saved is
  // still recognized even if its block was later deleted or the page was reloaded).
  // Reduced to stable string keys so this only recomputes when the underlying set of
  // names/types actually changes - not on every unrelated node/data edit.
  const canvasVariableKey = nodes
    .filter((n) => n.type === 'variable')
    .map((n) => `${n.data.label}:${n.data.varType ?? 'string'}`)
    .join('|')
  const savedVariableKey = Object.entries(variables)
    .map(([name, v]) => `${name}:${v.type}`)
    .join('|')

  const availableVariables = useMemo(() => {
    const merged = new Map<string, VariableType>()
    for (const entry of savedVariableKey ? savedVariableKey.split('|') : []) {
      const [name, varType] = entry.split(':')
      merged.set(name, (varType as VariableType) || 'string')
    }
    // Canvas blocks win over saved state: they reflect the latest, possibly-unsaved edit.
    for (const entry of canvasVariableKey ? canvasVariableKey.split('|') : []) {
      const [name, varType] = entry.split(':')
      merged.set(name, (varType as VariableType) || 'string')
    }
    return Array.from(merged.entries()).map(([name, varType]) => ({ name, varType }))
  }, [canvasVariableKey, savedVariableKey])

  // So a brand-new If block can be seeded with the current variable list immediately
  // on creation, instead of waiting for availableVariables to next change (which,
  // if the variable set was already stable, might never happen).
  const availableVariablesRef = useRef(availableVariables)
  useEffect(() => {
    availableVariablesRef.current = availableVariables
  }, [availableVariables])

  // nodeTypes must stay referentially stable - React Flow remounts every node
  // (breaking focus/clicks mid-edit) whenever this object's identity changes.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        n.type === 'if' ||
        n.type === 'ifOne' ||
        n.type === 'log' ||
        n.type === 'task' ||
        n.type === 'appAction' ||
        n.type === 'mapsAction' ||
        n.type === 'activitySuggestion'
          ? { ...n, data: { ...n.data, availableVariables } }
          : n,
      ),
    )
  }, [availableVariables, setNodes])

  // Which real apps are actually connected (right now, only Google/Microsoft Calendar
  // have an OAuth flow - everything else in APP_TRIGGER_SOURCES stays unconnected until
  // it gets one). Missing keys just read as "not connected" wherever this is consumed.
  // Also handed to nodes (as onAppConnected) so the in-canvas connect modal can ask for
  // a refresh the moment its popup finishes, instead of waiting for the next canvas visit.
  const refreshAppConnections = useCallback(() => {
    authedFetch('/calendar/connections')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: { provider: string; connected: boolean }[]) => {
        const map: Record<string, boolean> = {}
        for (const c of list) {
          const app = CALENDAR_PROVIDER_TO_APP[c.provider]
          if (app) map[app] = c.connected
        }
        setAppConnections(map)
      })
      .catch(() => {})
  }, [authedFetch])

  useEffect(() => {
    refreshAppConnections()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const appConnectionsRef = useRef(appConnections)
  useEffect(() => {
    appConnectionsRef.current = appConnections
  }, [appConnections])

  // Stable identity (unlike onOpenSettings itself, which App.tsx recreates every render)
  // so it's safe to hand straight to nodes without churning their data on every render.
  const onOpenSettingsRef = useRef(onOpenSettings)
  useEffect(() => {
    onOpenSettingsRef.current = onOpenSettings
  }, [onOpenSettings])
  const openConnectedApps = useCallback(() => onOpenSettingsRef.current?.('connected-apps'), [])

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        n.type === 'appTrigger' || n.type === 'appAction'
          ? { ...n, data: { ...n.data, appConnections, onOpenSettings: openConnectedApps, onAppConnected: refreshAppConnections } }
          : n,
      ),
    )
  }, [appConnections, openConnectedApps, refreshAppConnections, setNodes])

  const addLog = useCallback((message: string) => {
    setLogs((l) => [...l, `[${timestamp()}] ${message}`])
  }, [])

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight })
  }, [logs])

  const updateNodeData = useCallback(
    (id: string, patch: Partial<BlockNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
    },
    [setNodes],
  )

  const activateNode = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: 'active' } } : n)),
      )
      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: 'idle' } } : n)),
        )
      }, 700)
    },
    [setNodes],
  )

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/state`)
      const data = await res.json()
      setVariables(data.variables ?? {})
    } catch {
      // backend unreachable; leave last known state as-is
    }
  }, [])

  const playResult = useCallback(
    async (result: RunResult) => {
      if (result.status === 'error') {
        addLog(`Error: ${result.message ?? 'workflow failed'}`)
        setPendingChoice(null)
        setRunning(false)
        return
      }

      // Map an internal (possibly namespaced "group::inner") node id back to the
      // top-level node actually visible on the canvas, so grouped blocks still flash.
      const canvasIds = new Set(nodesRef.current.map((n) => n.id))
      const visibleId = (id: string) => {
        if (canvasIds.has(id)) return id
        const outer = id.split('::')[0]
        return canvasIds.has(outer) ? outer : null
      }

      for (const step of result.steps) {
        if (step.node_id) {
          const target = visibleId(step.node_id)
          if (target) activateNode(target)
        }
        addLog(step.message)
        await sleep(450)
      }

      setVariables(result.variables ?? {})

      if (result.status === 'awaiting_choice' && result.run_id && result.node_id && result.options) {
        setPendingChoice({
          runId: String(result.run_id),
          nodeId: result.node_id,
          label: result.label ?? result.node_id,
          options: result.options,
        })
      } else {
        setPendingChoice(null)
        setRunning(false)
      }
    },
    [addLog, activateNode],
  )

  const runWorkflow = useCallback(async () => {
    if (running) return
    setRunning(true)

    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current

    const { nodes: flatNodes, edges: flatEdges } = expandGraph(
      currentNodes.map((n) => ({ id: n.id, type: n.type ?? 'block', data: n.data })),
      currentEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    )

    let result: RunResult
    try {
      // authedFetch, not plain fetch - so a Task block can attribute the tasks it
      // creates to the signed-in user. Anonymous runs still work fine (no header sent).
      const res = await authedFetch('/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: flatNodes.map((n) => ({ id: n.id, type: n.type, data: sanitizeData(n.data) })),
          edges: flatEdges,
        }),
      })
      if (!res.ok) throw new Error(`backend returned ${res.status}`)
      result = await res.json()
    } catch {
      addLog('Error: could not reach backend at ' + API_BASE + ' - workflow was not run')
      setRunning(false)
      return
    }

    await playResult(result)
  }, [running, addLog, playResult, authedFetch])

  const resolveChoice = useCallback(
    async (option: string) => {
      if (!pendingChoice) return
      const { runId } = pendingChoice
      setPendingChoice(null)

      let result: RunResult
      try {
        const res = await authedFetch('/workflows/continue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_id: runId, choice: option }),
        })
        if (!res.ok) throw new Error(`backend returned ${res.status}`)
        result = await res.json()
      } catch {
        addLog('Error: could not reach backend to continue the workflow')
        setRunning(false)
        return
      }

      await playResult(result)
    },
    [pendingChoice, addLog, playResult, authedFetch],
  )

  const wipeData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/state`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`backend returned ${res.status}`)
      setVariables({})
      setLogs([])
      addLog('Saved data wiped')
    } catch {
      addLog('Error: could not reach backend, nothing was wiped')
    }
  }, [addLog])

  useEffect(() => {
    fetchState()
    setCustomBlocks(listCustomBlocks())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the trigger node's onTrigger pointing at the latest runWorkflow closure.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => (n.type && TRIGGER_NODE_TYPES.has(n.type) ? { ...n, data: { ...n.data, onTrigger: runWorkflow } } : n)),
    )
  }, [runWorkflow, setNodes])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  )

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams) => {
    setSelectedIds(new Set(selected.map((n) => n.id)))
  }, [])

  // While dragging a block, snap it to line up with any nearby block's edge/center
  // (left, center, or right; top, middle, or bottom) and show a guide line for it.
  const onNodeDrag: NodeDragHandler = useCallback(
    (_event, node) => {
      const others = nodesRef.current.filter((n) => n.id !== node.id)
      const { position, guides } = snapToNearbyNodes(node as Node<BlockNodeData>, others)
      setAlignGuides(guides)
      if (position.x !== node.position.x || position.y !== node.position.y) {
        setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position } : n)))
      }
    },
    [setNodes],
  )

  const onNodeDragStop = useCallback(() => {
    setAlignGuides({})
  }, [])

  const createNodeFromKind = useCallback(
    (kind: BlockKind, position: { x: number; y: number }, connectFrom?: string) => {
      idCount += 1
      const id = `${kind}-${idCount}`
      const label = ({
        trigger: 'Start',
        appTrigger: `App Trigger ${idCount}`,
        ifOne: `If ${idCount}`,
        aiAgent: `AI Agent ${idCount}`,
        aiInput: `AI Input ${idCount}`,
        aiOutput: `AI Output ${idCount}`,
      } as Partial<Record<BlockKind, string>>)[kind] ?? `${kind[0].toUpperCase()}${kind.slice(1)} ${idCount}`
      const newNode: Node<BlockNodeData> = {
        id,
        type: kind,
        position,
        data: {
          ...defaultDataFor(kind, label),
          status: 'idle',
          onChange: (patch) => updateNodeData(id, patch),
          ...(TRIGGER_NODE_TYPES.has(kind) ? { onTrigger: runWorkflow } : {}),
          ...(kind === 'if' ||
          kind === 'ifOne' ||
          kind === 'log' ||
          kind === 'task' ||
          kind === 'appAction' ||
          kind === 'mapsAction' ||
          kind === 'activitySuggestion'
            ? { availableVariables: availableVariablesRef.current }
            : {}),
          ...(kind === 'appTrigger' || kind === 'appAction'
            ? {
                appConnections: appConnectionsRef.current,
                onOpenSettings: openConnectedApps,
                onAppConnected: refreshAppConnections,
              }
            : {}),
        },
      }
      setNodes((nds) => [...nds, newNode])
      if (connectFrom) {
        setEdges((eds) => [...eds, { id: `e-quickadd-${connectFrom}-${id}`, source: connectFrom, target: id }])
      }
    },
    [setNodes, setEdges, updateNodeData, runWorkflow, openConnectedApps, refreshAppConnections],
  )

  // The green "+" next to a block's output handle (QuickAddButton) - places the new
  // block one step to the right of its source and wires them up in one click, instead
  // of dragging in a palette block and then dragging a connection to it by hand. Stable
  // identity (no deps beyond createNodeFromKind, itself stable) so it's handed to every
  // node once via QuickAddContext rather than threaded through each node's own data.
  const quickAddBlock = useCallback(
    (sourceId: string, kind: BlockKind) => {
      const source = nodesRef.current.find((n) => n.id === sourceId)
      let position = source ? { x: source.position.x + 380, y: source.position.y } : { x: 0, y: 0 }
      while (
        nodesRef.current.some((n) => Math.abs(n.position.x - position.x) < 40 && Math.abs(n.position.y - position.y) < 40)
      ) {
        position = { x: position.x, y: position.y + 140 }
      }
      createNodeFromKind(kind, position, sourceId)
    },
    [createNodeFromKind],
  )

  const createNodeFromCustomBlock = useCallback(
    (block: CustomBlock, position: { x: number; y: number }) => {
      idCount += 1
      const id = `group-${idCount}`
      const subgraph: Subgraph = JSON.parse(JSON.stringify(block.subgraph))
      const newNode: Node<BlockNodeData> = {
        id,
        type: 'group',
        position,
        data: {
          label: block.label,
          subgraph,
          sourceBlockId: block.id,
          status: 'idle',
          onChange: (patch) => updateNodeData(id, patch),
        },
      }
      setNodes((nds) => [...nds, newNode])
    },
    [setNodes, updateNodeData],
  )

  /** Inserts a whole template's blocks as plain, individually-editable nodes (not collapsed
   *  into a Group) - fresh ids so dropping the same template twice doesn't collide. */
  const insertTemplate = useCallback(
    (template: WorkflowTemplate, dropPosition?: { x: number; y: number }) => {
      idCount += 1
      const batch = idCount
      const idMap = new Map(template.nodes.map((n) => [n.id, `tmpl${batch}-${n.id}`]))

      let base = dropPosition
      if (!base) {
        const current = nodesRef.current
        base = current.length === 0 ? { x: 0, y: 0 } : { x: Math.max(...current.map((n) => n.position.x)) + 400, y: 0 }
      }

      const newNodes: Node<BlockNodeData>[] = template.nodes.map((n) => {
        const id = idMap.get(n.id)!
        return {
          id,
          type: n.type,
          position: { x: base!.x + n.position.x, y: base!.y + n.position.y },
          data: {
            ...n.data,
            status: 'idle',
            onChange: (patch) => updateNodeData(id, patch),
            ...(TRIGGER_NODE_TYPES.has(n.type) ? { onTrigger: runWorkflow } : {}),
            ...(n.type === 'if' ||
            n.type === 'ifOne' ||
            n.type === 'log' ||
            n.type === 'task' ||
            n.type === 'appAction' ||
            n.type === 'mapsAction' ||
            n.type === 'activitySuggestion'
              ? { availableVariables: availableVariablesRef.current }
              : {}),
            ...(n.type === 'appTrigger' || n.type === 'appAction'
              ? {
                appConnections: appConnectionsRef.current,
                onOpenSettings: openConnectedApps,
                onAppConnected: refreshAppConnections,
              }
              : {}),
          },
        }
      })
      const newEdges: Edge[] = template.edges.map((e) => ({
        id: `tmpl${batch}-${e.id}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      }))

      setNodes((nds) => [...nds, ...newNodes])
      setEdges((eds) => [...eds, ...newEdges])
      addLog(`Inserted template "${template.label}" (${newNodes.length} blocks)`)
      // Bring the newly-dropped blocks into view - without this, inserting a second
      // template (or one via the click path, which places it past whatever's already on
      // the canvas) can land entirely outside the current viewport and look like nothing
      // happened.
      requestAnimationFrame(() =>
        fitView({ padding: 0.3, nodes: newNodes.map((n) => ({ id: n.id })), duration: 300 }),
      )
    },
    [setNodes, setEdges, updateNodeData, runWorkflow, addLog, fitView, openConnectedApps, refreshAppConnections],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const payload = event.dataTransfer.getData(DRAG_DATA_FORMAT)
      if (!payload) return

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })

      if (payload.startsWith(CUSTOM_DRAG_PREFIX)) {
        const customId = payload.slice(CUSTOM_DRAG_PREFIX.length)
        const block = customBlocks.find((b) => b.id === customId)
        if (block) createNodeFromCustomBlock(block, position)
        return
      }

      if (payload.startsWith(TEMPLATE_DRAG_PREFIX)) {
        const templateId = payload.slice(TEMPLATE_DRAG_PREFIX.length)
        const template = TEMPLATES.find((t) => t.id === templateId)
        if (template) insertTemplate(template, position)
        return
      }

      createNodeFromKind(payload as BlockKind, position)
    },
    [screenToFlowPosition, customBlocks, createNodeFromCustomBlock, createNodeFromKind, insertTemplate],
  )

  const groupSelected = useCallback(() => {
    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current
    const selected = currentNodes.filter((n) => selectedIds.has(n.id))

    if (selected.length < 2) return
    if (selected.some((n) => n.type && TRIGGER_NODE_TYPES.has(n.type))) {
      window.alert('Triggers cannot be part of a saved block group.')
      return
    }

    const selIds = new Set(selected.map((n) => n.id))
    const internalEdges = currentEdges.filter((e) => selIds.has(e.source) && selIds.has(e.target))
    const hasIncoming = new Set(internalEdges.map((e) => e.target))
    const hasOutgoing = new Set(internalEdges.map((e) => e.source))
    const entry = selected.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id)
    const exit = selected.filter((n) => !hasOutgoing.has(n.id)).map((n) => n.id)

    const centroid = {
      x: selected.reduce((s, n) => s + n.position.x, 0) / selected.length,
      y: selected.reduce((s, n) => s + n.position.y, 0) / selected.length,
    }

    idCount += 1
    const groupId = `group-${idCount}`
    const defaultLabel = `Group ${idCount}`
    const label = window.prompt('Name this saved block:', defaultLabel)?.trim() || defaultLabel

    const subgraph: Subgraph = {
      nodes: selected.map((n) => ({
        id: n.id,
        type: n.type ?? 'block',
        data: sanitizeData(n.data),
        position: { x: n.position.x - centroid.x, y: n.position.y - centroid.y },
      })),
      edges: internalEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
      entry,
      exit,
    }

    const groupNode: Node<BlockNodeData> = {
      id: groupId,
      type: 'group',
      position: centroid,
      data: {
        label,
        subgraph,
        sourceBlockId: `custom-${groupId}`,
        status: 'idle',
        onChange: (patch) => updateNodeData(groupId, patch),
      },
    }

    setNodes((nds) => [...nds.filter((n) => !selIds.has(n.id)), groupNode])

    setEdges((eds) => {
      const rewired: Edge[] = []
      for (const e of eds) {
        const srcSel = selIds.has(e.source)
        const tgtSel = selIds.has(e.target)
        if (srcSel && tgtSel) continue
        if (srcSel && !tgtSel) {
          rewired.push({ ...e, id: `${e.id}-${groupId}`, source: groupId, sourceHandle: undefined })
        } else if (!srcSel && tgtSel) {
          rewired.push({ ...e, id: `${e.id}-${groupId}`, target: groupId, targetHandle: undefined })
        } else {
          rewired.push(e)
        }
      }
      return rewired
    })

    const saved: CustomBlock = { id: `custom-${groupId}`, label, subgraph }
    setCustomBlocks(saveCustomBlock(saved))
    addLog(`Saved "${label}" (${selected.length} blocks) as a reusable block`)
  }, [selectedIds, setNodes, setEdges, updateNodeData, addLog])

  const removeCustomBlock = useCallback((id: string) => {
    setCustomBlocks(deleteCustomBlock(id))
  }, [])

  const startEditingBlock = useCallback(
    (block: CustomBlock) => {
      preEditSnapshot.current = { nodes: nodesRef.current, edges: edgesRef.current }

      const loadedNodes: Node<BlockNodeData>[] = block.subgraph.nodes.map((sn) => ({
        id: sn.id,
        type: sn.type,
        position: sn.position,
        data: {
          ...sn.data,
          status: 'idle',
          onChange: (patch) => updateNodeData(sn.id, patch),
          ...(TRIGGER_NODE_TYPES.has(sn.type) ? { onTrigger: runWorkflow } : {}),
          ...(sn.type === 'if' ||
          sn.type === 'ifOne' ||
          sn.type === 'log' ||
          sn.type === 'task' ||
          sn.type === 'appAction' ||
          sn.type === 'mapsAction' ||
          sn.type === 'activitySuggestion'
            ? { availableVariables: availableVariablesRef.current }
            : {}),
          ...(sn.type === 'appTrigger' || sn.type === 'appAction'
            ? {
                appConnections: appConnectionsRef.current,
                onOpenSettings: openConnectedApps,
                onAppConnected: refreshAppConnections,
              }
            : {}),
        },
      }))
      const loadedEdges: Edge[] = block.subgraph.edges.map((se) => ({
        id: se.id,
        source: se.source,
        target: se.target,
        sourceHandle: se.sourceHandle ?? undefined,
        targetHandle: se.targetHandle ?? undefined,
      }))

      setNodes(loadedNodes)
      setEdges(loadedEdges)
      setSelectedIds(new Set())
      setEditingBlock(block)
      requestAnimationFrame(() => fitView({ padding: 0.3 }))
    },
    [setNodes, setEdges, updateNodeData, runWorkflow, fitView, openConnectedApps, refreshAppConnections],
  )

  const exitEditMode = useCallback(() => {
    const snap = preEditSnapshot.current
    setNodes(snap?.nodes ?? [])
    setEdges(snap?.edges ?? [])
    preEditSnapshot.current = null
    setEditingBlock(null)
  }, [setNodes, setEdges])

  const saveEditedBlock = useCallback(() => {
    if (!editingBlock) return
    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current

    if (currentNodes.length === 0) {
      window.alert('Add at least one block before saving.')
      return
    }

    const centroid = {
      x: currentNodes.reduce((s, n) => s + n.position.x, 0) / currentNodes.length,
      y: currentNodes.reduce((s, n) => s + n.position.y, 0) / currentNodes.length,
    }
    const hasIncoming = new Set(currentEdges.map((e) => e.target))
    const hasOutgoing = new Set(currentEdges.map((e) => e.source))
    const entry = currentNodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id)
    const exit = currentNodes.filter((n) => !hasOutgoing.has(n.id)).map((n) => n.id)

    const updated: CustomBlock = {
      id: editingBlock.id,
      label: editingBlock.label,
      subgraph: {
        nodes: currentNodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'block',
          data: sanitizeData(n.data),
          position: { x: n.position.x - centroid.x, y: n.position.y - centroid.y },
        })),
        edges: currentEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })),
        entry,
        exit,
      },
    }

    setCustomBlocks(propagateCustomBlockUpdate(updated))

    // Refresh any instance of this block already sitting on the canvas we're about to restore.
    if (preEditSnapshot.current) {
      const { items, changed } = refreshGroupInstances(preEditSnapshot.current.nodes, updated.id, updated.subgraph)
      if (changed) {
        preEditSnapshot.current = { ...preEditSnapshot.current, nodes: items }
      }
    }

    addLog(`Saved changes to "${updated.label}" - all instances of it updated`)
    exitEditMode()
  }, [editingBlock, addLog, exitEditMode])

  const saveCurrentFlow = useCallback(
    async (name: string) => {
      const currentNodes = nodesRef.current
      const currentEdges = edgesRef.current
      if (currentNodes.length === 0) {
        throw new Error('Add at least one block before saving')
      }
      const payload = {
        name,
        nodes: currentNodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'block',
          data: sanitizeData(n.data),
          position: n.position,
        })),
        edges: currentEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })),
      }
      const res = await authedFetch('/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? 'Could not save this flow')
      }
      addLog(`Saved flow "${name}"`)
    },
    [authedFetch, addLog],
  )

  const loadFlow = useCallback(
    (flowNodes: SubgraphNode[], flowEdges: SubgraphEdge[]) => {
      if (nodesRef.current.length > 0 && !window.confirm('Loading this flow will replace your current canvas. Continue?')) {
        return
      }
      const loadedNodes: Node<BlockNodeData>[] = flowNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          ...n.data,
          status: 'idle',
          onChange: (patch) => updateNodeData(n.id, patch),
          ...(TRIGGER_NODE_TYPES.has(n.type) ? { onTrigger: runWorkflow } : {}),
          ...(n.type === 'if' ||
          n.type === 'ifOne' ||
          n.type === 'log' ||
          n.type === 'task' ||
          n.type === 'appAction' ||
          n.type === 'mapsAction' ||
          n.type === 'activitySuggestion'
            ? { availableVariables: availableVariablesRef.current }
            : {}),
          ...(n.type === 'appTrigger' || n.type === 'appAction'
            ? {
                appConnections: appConnectionsRef.current,
                onOpenSettings: openConnectedApps,
                onAppConnected: refreshAppConnections,
              }
            : {}),
        },
      }))
      const loadedEdges: Edge[] = flowEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      }))
      setNodes(loadedNodes)
      setEdges(loadedEdges)
      setSelectedIds(new Set())
      addLog('Loaded flow')
      requestAnimationFrame(() => fitView({ padding: 0.3 }))
    },
    [setNodes, setEdges, updateNodeData, runWorkflow, fitView, addLog, openConnectedApps, refreshAppConnections],
  )

  // Opened straight from a dashboard "Open" click - load that flow onto the (empty) canvas
  // as soon as we mount. nodesRef.current is always empty at this point, so loadFlow's
  // "replace the canvas?" confirm never fires here.
  useEffect(() => {
    if (initialFlowId == null) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await authedFetch(`/flows/${initialFlowId}`)
        if (!res.ok || cancelled) return
        const body = await res.json()
        if (!cancelled) loadFlow(body.nodes, body.edges)
      } catch {
        // Ignore - the user just starts from an empty canvas instead.
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFlowId])

  // Opened via one of the dashboard's quick-start template chips - drop that template onto
  // the (empty) canvas as soon as we mount. Guarded by a ref (not just the effect body)
  // because React 18 StrictMode deliberately runs mount effects twice in dev to surface
  // exactly this kind of bug - without the guard, insertTemplate had no cleanup to undo
  // the first run, so the whole template landed on the canvas twice, stacked on top of
  // itself. The ref survives that mount/cleanup/remount cycle, so only the first run acts.
  const insertedTemplateRef = useRef(false)
  useEffect(() => {
    if (!initialTemplateId || insertedTemplateRef.current) return
    const template = TEMPLATES.find((t) => t.id === initialTemplateId)
    if (template) {
      insertedTemplateRef.current = true
      insertTemplate(template)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId])

  // A brand-new blank workflow (not opened from a saved flow or a template) starts
  // with an App Trigger already wired to an App Action, instead of an empty canvas -
  // a starting point to edit rather than a blank slate. Guarded by a ref (not just
  // the initialFlowId/initialTemplateId check) for the same StrictMode double-mount
  // reason as the template effect above.
  const insertedStarterRef = useRef(false)
  useEffect(() => {
    if (initialFlowId != null || initialTemplateId || insertedStarterRef.current) return
    insertedStarterRef.current = true

    idCount += 1
    const triggerId = `starter-trigger-${idCount}`
    const actionId = `starter-action-${idCount}`
    const triggerNode: Node<BlockNodeData> = {
      id: triggerId,
      type: 'appTrigger',
      position: { x: 0, y: 0 },
      data: {
        ...defaultDataFor('appTrigger', 'App Trigger'),
        status: 'idle',
        onChange: (patch) => updateNodeData(triggerId, patch),
        onTrigger: runWorkflow,
        appConnections: appConnectionsRef.current,
        onOpenSettings: openConnectedApps,
        onAppConnected: refreshAppConnections,
      },
    }
    const actionNode: Node<BlockNodeData> = {
      id: actionId,
      type: 'appAction',
      position: { x: 380, y: 0 },
      data: {
        ...defaultDataFor('appAction', 'App Action'),
        status: 'idle',
        onChange: (patch) => updateNodeData(actionId, patch),
        availableVariables: availableVariablesRef.current,
        appConnections: appConnectionsRef.current,
        onOpenSettings: openConnectedApps,
        onAppConnected: refreshAppConnections,
      },
    }
    setNodes([triggerNode, actionNode])
    setEdges([{ id: `starter-edge-${idCount}`, source: triggerId, target: actionId }])
    requestAnimationFrame(() => fitView({ padding: 0.3 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canGroup = selectedIds.size >= 2

  return (
    <div className="h-screen w-screen flex flex-col dark:bg-gray-900">
      {editingBlock ? (
        <header className="flex items-center gap-4 border-b border-blue-300/60 bg-gradient-to-r from-blue-50 via-blue-50 to-red-50 px-5 py-2.5 shadow-sm dark:border-blue-800/60 dark:from-blue-950 dark:via-blue-950 dark:to-red-950">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Pencil className="h-4 w-4" />
            </div>
            <h1 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Editing <span className="font-bold">"{editingBlock.label}"</span>
            </h1>
          </div>
          <span className="flex-1 truncate text-xs text-blue-500 dark:text-blue-300">
            Edit the chain below like any other workflow, then save your changes back to this saved block.
          </span>
          <button
            type="button"
            onClick={saveEditedBlock}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow active:scale-[0.97]"
          >
            <Save className="h-4 w-4" /> Save Changes
          </button>
          <button
            type="button"
            onClick={exitEditMode}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white/70 px-3.5 py-1.5 text-sm font-medium text-blue-600 shadow-sm transition-all duration-150 hover:bg-white active:scale-[0.97] dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
        </header>
      ) : (
        <header className="flex items-center gap-3 border-b border-gray-200/80 bg-white/95 px-5 py-2.5 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
          <button
            ref={logoRef}
            type="button"
            onClick={() => setAboutOpen((o) => !o)}
            className="flex shrink-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-red-600 text-white shadow-sm">
              <Zap className="h-4 w-4" fill="currentColor" />
            </div>
            <div className="text-left leading-tight">
              <h1 className="text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50">
                OverFlowEngine
              </h1>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Visual agentic workflow builder</p>
            </div>
          </button>
          {aboutOpen && <AboutDropdown anchorRef={logoRef} onClose={() => setAboutOpen(false)} />}

          <span className="hidden flex-1 truncate text-xs text-gray-400 dark:text-gray-500 xl:block">
            Drag blocks from the left onto the canvas, Ctrl/Shift-click to select several, then group them into
            one reusable block. Click Start to run the workflow.
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="relative">
              <button
                ref={templatesButtonRef}
                type="button"
                onClick={() => setTemplatesOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition-all duration-150 hover:border-red-300 hover:bg-red-100 hover:shadow active:scale-[0.97] dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
              >
                <Blocks className="h-4 w-4" /> Templates
              </button>
              {templatesOpen &&
                (() => {
                  const rect = templatesButtonRef.current?.getBoundingClientRect()
                  const top = (rect?.bottom ?? 0) + 8
                  const right = rect ? window.innerWidth - rect.right : 16
                  // Rendered through a portal straight into <body>, positioned with fixed
                  // viewport coordinates from the button's own rect - anchoring it inside the
                  // header instead let some ancestor's stacking context (backdrop-blur, or
                  // React Flow's own internal z-index) trap it below the canvas pane, so drags
                  // and even plain clicks landed on the pane underneath instead of the menu.
                  return createPortal(
                    <>
                      <div className="fixed inset-0 z-[100]" onClick={() => setTemplatesOpen(false)} />
                      <div
                        style={{ top, right }}
                        className="fixed z-[101] w-80 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-800"
                      >
                        <p className="mb-1 px-2 pt-1 text-[11px] text-gray-400 dark:text-gray-500">
                          Click anywhere on a template to drop it into the canvas, or drag it to place it
                          exactly where you want.
                        </p>
                        {TEMPLATES.map((t) => (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(DRAG_DATA_FORMAT, TEMPLATE_DRAG_PREFIX + t.id)
                              // Close the dropdown (and its backdrop) the instant the drag starts -
                              // otherwise the backdrop still covers the canvas mid-drag and the drop
                              // never reaches it.
                              setTemplatesOpen(false)
                            }}
                            onClick={() => {
                              insertTemplate(t)
                              setTemplatesOpen(false)
                            }}
                            className="cursor-pointer rounded-lg p-2 transition-colors duration-100 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.label}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t.description}</p>
                          </div>
                        ))}
                      </div>
                    </>,
                    document.body,
                  )
                })()}
            </div>

            <button
              type="button"
              onClick={groupSelected}
              disabled={!canGroup}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 shadow-sm transition-all duration-150 hover:border-blue-300 hover:bg-blue-100 hover:shadow active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
            >
              <Layers className="h-4 w-4" /> Group{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>

            <button
              type="button"
              onClick={wipeData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 shadow-sm transition-all duration-150 hover:border-red-300 hover:bg-red-100 hover:shadow active:scale-[0.97] dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            >
              <Trash2 className="h-4 w-4" /> Wipe Data
            </button>

            <div className="mx-0.5 h-6 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />

            {onExitToDashboard && (
              <button
                type="button"
                onClick={onExitToDashboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Home className="h-4 w-4" /> Dashboard
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={() => setFlowsPanelOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <FolderOpen className="h-4 w-4" /> My Flows
              </button>
            )}
            {onOpenMarketplace && (
              <button
                type="button"
                onClick={onOpenMarketplace}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Store className="h-4 w-4" /> Marketplace
              </button>
            )}
            {user ? (
              <button
                type="button"
                onClick={() => onOpenSettings?.()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-red-500 text-[9px] font-bold text-white">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </span>
                {user.name || user.email}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow active:scale-[0.97]"
              >
                Sign in
              </button>
            )}
          </div>
        </header>
      )}
      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      {flowsPanelOpen && (
        <FlowsPanel onClose={() => setFlowsPanelOpen(false)} onLoad={loadFlow} onSaveCurrent={saveCurrentFlow} />
      )}
      <div className="flex flex-1 min-h-0">
        <Palette
          customBlocks={customBlocks}
          onDeleteCustomBlock={removeCustomBlock}
          onEditCustomBlock={startEditingBlock}
          editingBlockId={editingBlock?.id}
        />
        <div className="flex-1 dark:bg-gray-900" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
          <QuickAddContext.Provider value={quickAddBlock}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode={['Meta', 'Control']}
              selectionKeyCode={['Shift']}
              edgesFocusable
              elementsSelectable
              snapToGrid
              snapGrid={[10, 10]}
              defaultEdgeOptions={defaultEdgeOptions}
              proOptions={{ hideAttribution: true }}
              fitView
            >
              <Background gap={10} color={theme === 'dark' ? '#374151' : undefined} />
              <Controls />
              <AlignmentGuideLines guides={alignGuides} />
            </ReactFlow>
          </QuickAddContext.Provider>
          <datalist id="overflowengine-variable-names">
            {availableVariables.map((v) => (
              <option key={v.name} value={v.name} />
            ))}
          </datalist>
        </div>
        <aside className="flex w-80 shrink-0 flex-col gap-3 border-l border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
          {pendingChoice && (
            <div className="shrink-0 rounded-xl border border-blue-300 bg-gradient-to-br from-blue-50 to-cyan-50 p-3 shadow-sm dark:border-blue-700 dark:from-blue-950 dark:to-cyan-950">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-blue-800 dark:text-blue-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                  ?
                </span>
                <span className="truncate">{pendingChoice.label}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {pendingChoice.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => resolveChoice(opt)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow active:scale-[0.97]"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setVariablesOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <span className="flex items-center gap-1.5">
                <Package className="h-4 w-4" /> Saved Variables
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                  {Object.keys(variables).length}
                </span>
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${variablesOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {variablesOpen && (
              <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                {Object.keys(variables).length === 0 ? (
                  <p className="p-3 text-sm text-gray-400 dark:text-gray-500">Nothing saved yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {Object.entries(variables).map(([name, v]) => (
                      <li key={name} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span
                          className="shrink-0 truncate font-mono text-xs font-medium text-gray-700 dark:text-gray-200"
                          title={name}
                        >
                          {name}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="truncate font-mono text-xs text-gray-500 dark:text-gray-400"
                            title={v.value}
                          >
                            {v.value}
                          </span>
                          <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gray-400 dark:bg-gray-700 dark:text-gray-400">
                            {v.type}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.5)]" />
                Console
              </span>
              <button
                type="button"
                onClick={() => setLogs([])}
                disabled={logs.length === 0}
                className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-500 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                Clear
              </button>
            </div>
            <div ref={consoleRef} className="console-scroll flex-1 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed">
              {logs.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-600">No activity yet - run the workflow to see it here.</p>
              ) : (
                logs.map((entry, i) => (
                  <p key={i} className="whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">
                    <span className="text-emerald-600 dark:text-emerald-500">›</span> {entry}
                  </p>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
