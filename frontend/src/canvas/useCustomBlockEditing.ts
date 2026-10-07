import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { Edge, Node, useReactFlow } from 'reactflow'
import { TRIGGER_NODE_TYPES, sanitizeData } from './canvasGraph'
import {
  deleteCustomBlock,
  listCustomBlocks,
  propagateCustomBlockUpdate,
  refreshGroupInstances,
  saveCustomBlock,
  type CustomBlock,
} from './customBlocks'
import type { BlockDataPatch, BlockNodeData, FormField, VariableType } from '../nodes/types'

interface UseCustomBlockEditingArgs {
  nodesRef: RefObject<Node<BlockNodeData>[]>
  edgesRef: RefObject<Edge[]>
  setNodes: Dispatch<SetStateAction<Node<BlockNodeData>[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  updateNodeData: (id: string, patch: BlockDataPatch) => void
  runWorkflow: (formOverride?: { nodeId: string; fields: FormField[] }) => Promise<void>
  availableVariablesRef: RefObject<{ name: string; varType: VariableType }[]>
  appConnectionsRef: RefObject<Record<string, boolean>>
  openConnectedApps: () => void
  refreshAppConnections: () => void
  fitView: ReturnType<typeof useReactFlow>['fitView']
  addLog: (message: string) => void
}

export function useCustomBlockEditing({
  nodesRef,
  edgesRef,
  setNodes,
  setEdges,
  setSelectedIds,
  updateNodeData,
  runWorkflow,
  availableVariablesRef,
  appConnectionsRef,
  openConnectedApps,
  refreshAppConnections,
  fitView,
  addLog,
}: UseCustomBlockEditingArgs) {
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([])
  const [editingBlock, setEditingBlock] = useState<CustomBlock | null>(null)
  /** Selection snapshot awaiting a name from GroupNameModal before groupSelected commits it. */
  const preEditSnapshot = useRef<{ nodes: Node<BlockNodeData>[]; edges: Edge[] } | null>(null)

  useEffect(() => {
    setCustomBlocks(listCustomBlocks())
  }, [])

  const addCustomBlock = useCallback((block: CustomBlock) => {
    setCustomBlocks(saveCustomBlock(block))
  }, [])

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
          onChange: (patch: BlockDataPatch) => updateNodeData(sn.id, patch),
          ...(TRIGGER_NODE_TYPES.has(sn.type) ? { onTrigger: runWorkflow } : {}),
          ...(sn.type === 'if' ||
          sn.type === 'ifOne' ||
          sn.type === 'log' ||
          sn.type === 'task' ||
          sn.type === 'appAction' ||
          sn.type === 'mapsAction' ||
          sn.type === 'activitySuggestion' ||
          sn.type === 'costEstimate' ||
          sn.type === 'tripSummary'
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
    [
      setNodes,
      setEdges,
      updateNodeData,
      runWorkflow,
      fitView,
      openConnectedApps,
      refreshAppConnections,
      nodesRef,
      edgesRef,
      setSelectedIds,
      availableVariablesRef,
      appConnectionsRef,
    ],
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
  }, [editingBlock, addLog, exitEditMode, nodesRef, edgesRef])

  return {
    customBlocks,
    editingBlock,
    addCustomBlock,
    removeCustomBlock,
    startEditingBlock,
    exitEditMode,
    saveEditedBlock,
  }
}
