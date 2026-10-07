import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { Edge, Node, NodeDragHandler, useReactFlow } from 'reactflow'
import { type AlignmentGuides, snapToNearbyNodes } from './alignment'
import { TRIGGER_NODE_TYPES, defaultDataFor, nextId, sanitizeData } from './canvasGraph'
import { CUSTOM_DRAG_PREFIX, DRAG_DATA_FORMAT } from './Palette'
import { type CustomBlock } from './customBlocks'
import type { BlockDataPatch, BlockKind, BlockNodeData, FormField, Subgraph, VariableType } from '../nodes/types'
import { TEMPLATE_DRAG_PREFIX, TEMPLATES, type WorkflowTemplate } from '../shared/templates'

/** Selection snapshot awaiting a name from GroupNameModal before groupSelected commits it. */
export interface PendingGroup {
  selected: Node<BlockNodeData>[]
  defaultLabel: string
  groupIdCount: number
}

interface UseBlockCreationArgs {
  nodesRef: RefObject<Node<BlockNodeData>[]>
  edgesRef: RefObject<Edge[]>
  setNodes: Dispatch<SetStateAction<Node<BlockNodeData>[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  updateNodeData: (id: string, patch: BlockDataPatch) => void
  runWorkflow: (formOverride?: { nodeId: string; fields: FormField[] }) => Promise<void>
  availableVariablesRef: RefObject<{ name: string; varType: VariableType }[]>
  appConnectionsRef: RefObject<Record<string, boolean>>
  openConnectedApps: () => void
  refreshAppConnections: () => void
  selectedIds: Set<string>
  customBlocks: CustomBlock[]
  addCustomBlock: (block: CustomBlock) => void
  addLog: (message: string) => void
  fitView: ReturnType<typeof useReactFlow>['fitView']
  screenToFlowPosition: ReturnType<typeof useReactFlow>['screenToFlowPosition']
}

export function useBlockCreation({
  nodesRef,
  edgesRef,
  setNodes,
  setEdges,
  updateNodeData,
  runWorkflow,
  availableVariablesRef,
  appConnectionsRef,
  openConnectedApps,
  refreshAppConnections,
  selectedIds,
  customBlocks,
  addCustomBlock,
  addLog,
  fitView,
  screenToFlowPosition,
}: UseBlockCreationArgs) {
  const [alignGuides, setAlignGuides] = useState<AlignmentGuides>({})
  const [pendingGroup, setPendingGroup] = useState<PendingGroup | null>(null)

  const createNodeFromKind = useCallback(
    (kind: BlockKind, position: { x: number; y: number }, connectFrom?: string) => {
      const num = nextId()
      const id = `${kind}-${num}`
      const label = ({
        trigger: 'Start',
        appTrigger: `App Trigger ${num}`,
        formTrigger: `Form ${num}`,
        costEstimate: `Trip Cost ${num}`,
        ifOne: `If ${num}`,
        aiAgent: `AI Agent ${num}`,
        aiInput: `AI Input ${num}`,
        aiOutput: `AI Output ${num}`,
      } as Partial<Record<BlockKind, string>>)[kind] ?? `${kind[0].toUpperCase()}${kind.slice(1)} ${num}`
      const newNode: Node<BlockNodeData> = {
        id,
        type: kind,
        position,
        data: {
          ...defaultDataFor(kind, label),
          status: 'idle',
          onChange: (patch: BlockDataPatch) => updateNodeData(id, patch),
          ...(TRIGGER_NODE_TYPES.has(kind) ? { onTrigger: runWorkflow } : {}),
          ...(kind === 'if' ||
          kind === 'ifOne' ||
          kind === 'log' ||
          kind === 'task' ||
          kind === 'appAction' ||
          kind === 'mapsAction' ||
          kind === 'activitySuggestion' ||
          kind === 'costEstimate' ||
          kind === 'tripSummary'
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
    [setNodes, setEdges, updateNodeData, runWorkflow, openConnectedApps, refreshAppConnections, availableVariablesRef, appConnectionsRef],
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
    [createNodeFromKind, nodesRef],
  )

  const createNodeFromCustomBlock = useCallback(
    (block: CustomBlock, position: { x: number; y: number }) => {
      const id = `group-${nextId()}`
      const subgraph: Subgraph = JSON.parse(JSON.stringify(block.subgraph))
      const newNode: Node<BlockNodeData> = {
        id,
        type: 'group',
        position,
        data: {
          kind: 'group',
          label: block.label,
          subgraph,
          sourceBlockId: block.id,
          status: 'idle',
          onChange: (patch: BlockDataPatch) => updateNodeData(id, patch),
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
      const batch = nextId()
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
            onChange: (patch: BlockDataPatch) => updateNodeData(id, patch),
            ...(TRIGGER_NODE_TYPES.has(n.type) ? { onTrigger: runWorkflow } : {}),
            ...(n.type === 'if' ||
            n.type === 'ifOne' ||
            n.type === 'log' ||
            n.type === 'task' ||
            n.type === 'appAction' ||
            n.type === 'mapsAction' ||
            n.type === 'activitySuggestion' ||
            n.type === 'costEstimate' ||
            n.type === 'tripSummary'
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
    [
      setNodes,
      setEdges,
      updateNodeData,
      runWorkflow,
      addLog,
      fitView,
      openConnectedApps,
      refreshAppConnections,
      nodesRef,
      availableVariablesRef,
      appConnectionsRef,
    ],
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
    [setNodes, nodesRef],
  )

  const onNodeDragStop = useCallback(() => {
    setAlignGuides({})
  }, [])

  const groupSelected = useCallback(() => {
    const currentNodes = nodesRef.current
    const selected = currentNodes.filter((n) => selectedIds.has(n.id))

    if (selected.length < 2) return
    if (selected.some((n) => n.type && TRIGGER_NODE_TYPES.has(n.type))) {
      window.alert('Triggers cannot be part of a saved block group.')
      return
    }

    const groupIdCount = nextId()
    setPendingGroup({ selected, defaultLabel: `Group ${groupIdCount}`, groupIdCount })
  }, [selectedIds, nodesRef])

  const confirmGroupSelected = useCallback(
    (label: string) => {
      if (!pendingGroup) return
      const { selected, groupIdCount } = pendingGroup
      const currentEdges = edgesRef.current
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

      const groupId = `group-${groupIdCount}`

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
          kind: 'group',
          label,
          subgraph,
          sourceBlockId: `custom-${groupId}`,
          status: 'idle',
          onChange: (patch: BlockDataPatch) => updateNodeData(groupId, patch),
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
      addCustomBlock(saved)
      addLog(`Saved "${label}" (${selected.length} blocks) as a reusable block`)
      setPendingGroup(null)
    },
    [pendingGroup, setNodes, setEdges, updateNodeData, addLog, addCustomBlock, edgesRef],
  )

  return {
    alignGuides,
    pendingGroup,
    setPendingGroup,
    createNodeFromKind,
    quickAddBlock,
    createNodeFromCustomBlock,
    insertTemplate,
    onDragOver,
    onDrop,
    onNodeDrag,
    onNodeDragStop,
    groupSelected,
    confirmGroupSelected,
  }
}
