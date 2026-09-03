import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
  type NodeDragHandler,
  type OnSelectionChangeParams,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import AccountPanel from './AccountPanel'
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
import AiAgentNode from './nodes/AiAgentNode'
import AiInputNode from './nodes/AiInputNode'
import AiModelNode from './nodes/AiModelNode'
import AiOutputNode from './nodes/AiOutputNode'
import AppTriggerNode from './nodes/AppTriggerNode'
import BlockNode from './nodes/BlockNode'
import ChoiceNode from './nodes/ChoiceNode'
import GroupNode from './nodes/GroupNode'
import IfNode from './nodes/IfNode'
import IfSingleNode from './nodes/IfSingleNode'
import LogNode from './nodes/LogNode'
import TriggerNode from './nodes/TriggerNode'
import { APP_TRIGGER_SOURCES, type BlockKind, type BlockNodeData, type Subgraph, type SubgraphEdge, type SubgraphNode, type VariableType } from './nodes/types'
import VariableNode from './nodes/VariableNode'
import Palette, { CUSTOM_DRAG_PREFIX, DRAG_DATA_FORMAT } from './Palette'

const nodeTypes = {
  trigger: TriggerNode,
  appTrigger: AppTriggerNode,
  block: BlockNode,
  ifOne: IfSingleNode,
  if: IfNode,
  variable: VariableNode,
  log: LogNode,
  choice: ChoiceNode,
  group: GroupNode,
  aiAgent: AiAgentNode,
  aiInput: AiInputNode,
  aiOutput: AiOutputNode,
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
            borderLeft: '1px dashed #6366f1',
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
            borderTop: '1px dashed #6366f1',
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
      return { label, sourceApp: APP_TRIGGER_SOURCES[0], value: '', outputVariable: 'incomingMessage' }
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

function CanvasInner() {
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
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const { user } = useAuth()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
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
        n.type === 'if' || n.type === 'ifOne' || n.type === 'log'
          ? { ...n, data: { ...n.data, availableVariables } }
          : n,
      ),
    )
  }, [availableVariables, setNodes])

  const addLog = useCallback((message: string) => {
    setLogs((l) => [...l, `[${timestamp()}] ${message}`])
  }, [])

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
      const res = await fetch(`${API_BASE}/workflows/run`, {
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
  }, [running, addLog, playResult])

  const resolveChoice = useCallback(
    async (option: string) => {
      if (!pendingChoice) return
      const { runId } = pendingChoice
      setPendingChoice(null)

      let result: RunResult
      try {
        const res = await fetch(`${API_BASE}/workflows/continue`, {
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
    [pendingChoice, addLog, playResult],
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
    (kind: BlockKind, position: { x: number; y: number }) => {
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
          ...(kind === 'if' || kind === 'ifOne' || kind === 'log'
            ? { availableVariables: availableVariablesRef.current }
            : {}),
        },
      }
      setNodes((nds) => [...nds, newNode])
    },
    [setNodes, updateNodeData, runWorkflow],
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

      createNodeFromKind(payload as BlockKind, position)
    },
    [screenToFlowPosition, customBlocks, createNodeFromCustomBlock, createNodeFromKind],
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
          ...(sn.type === 'if' || sn.type === 'ifOne' || sn.type === 'log'
            ? { availableVariables: availableVariablesRef.current }
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
    [setNodes, setEdges, updateNodeData, runWorkflow, fitView],
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

  const canGroup = selectedIds.size >= 2

  return (
    <div className="h-screen w-screen flex flex-col">
      {editingBlock ? (
        <header className="flex items-center gap-4 border-b border-2 border-indigo-400 bg-indigo-50 px-4 py-2">
          <h1 className="text-lg font-semibold text-indigo-800">✎ Editing "{editingBlock.label}"</h1>
          <span className="flex-1 text-sm text-indigo-600">
            Edit the chain below like any other workflow, then save your changes back to this saved block.
          </span>
          <button
            type="button"
            onClick={saveEditedBlock}
            className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
          >
            💾 Save Changes
          </button>
          <button
            type="button"
            onClick={exitEditMode}
            className="rounded border border-indigo-300 px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
          >
            ✕ Cancel
          </button>
        </header>
      ) : (
        <header className="flex items-center gap-4 border-b border-gray-200 px-4 py-2">
          <h1 className="text-lg font-semibold">OverFlowEngine</h1>
          <span className="flex-1 text-sm text-gray-500">
            Drag blocks from the left onto the canvas. Ctrl/Shift-click or drag-select multiple blocks, then
            group them into one reusable block. Click the Start button to run the workflow.
          </span>
          <button
            type="button"
            onClick={groupSelected}
            disabled={!canGroup}
            className="rounded border border-indigo-300 px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Group Selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          <button
            type="button"
            onClick={wipeData}
            className="rounded border border-red-300 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Wipe Saved Data
          </button>
          {user ? (
            <button
              type="button"
              onClick={() => setAccountPanelOpen(true)}
              className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              👤 {user.email}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign in
            </button>
          )}
        </header>
      )}
      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      {accountPanelOpen && <AccountPanel onClose={() => setAccountPanelOpen(false)} />}
      <div className="flex flex-1 min-h-0">
        <Palette
          customBlocks={customBlocks}
          onDeleteCustomBlock={removeCustomBlock}
          onEditCustomBlock={startEditingBlock}
          editingBlockId={editingBlock?.id}
        />
        <div className="flex-1" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
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
            fitView
          >
            <Background gap={10} />
            <Controls />
            <AlignmentGuideLines guides={alignGuides} />
          </ReactFlow>
          <datalist id="overflowengine-variable-names">
            {availableVariables.map((v) => (
              <option key={v.name} value={v.name} />
            ))}
          </datalist>
        </div>
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 p-3">
          {pendingChoice && (
            <div className="mb-4 rounded-lg border-2 border-teal-500 bg-teal-50 p-3">
              <p className="mb-2 text-sm font-semibold text-teal-800">
                Choose a path: {pendingChoice.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {pendingChoice.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => resolveChoice(opt)}
                    className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 active:bg-teal-800"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <h2 className="mb-2 text-sm font-semibold text-gray-700">Saved Variables</h2>
          {Object.keys(variables).length === 0 && (
            <p className="mb-3 text-sm text-gray-400">Nothing saved yet.</p>
          )}
          <ul className="mb-4 space-y-1">
            {Object.entries(variables).map(([name, v]) => (
              <li key={name} className="font-mono text-xs text-gray-600">
                {name} = {v.value} <span className="text-gray-400">({v.type})</span>
              </li>
            ))}
          </ul>

          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Activation Log</h2>
            <button
              type="button"
              onClick={() => setLogs([])}
              disabled={logs.length === 0}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear Log
            </button>
          </div>
          {logs.length === 0 && <p className="text-sm text-gray-400">No activity yet.</p>}
          <ul className="space-y-1">
            {logs.map((entry, i) => (
              <li key={i} className="font-mono text-xs text-gray-600">
                {entry}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
