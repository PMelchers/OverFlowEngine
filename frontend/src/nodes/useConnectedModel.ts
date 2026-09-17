import { useNodeId, useStore, type ReactFlowState } from 'reactflow'
import type { BlockNodeData } from './types'

/** The label for whatever AI Model block feeds this node's "model" handle, e.g.
 *  "gpt-4o (openai)" - shared by AiCallFields, AiAgentNode and ActivitySuggestionNode.
 *  Reads via a selector on the store instead of useNodes()/useEdges(), which
 *  subscribe to every node/edge on the canvas and re-render on any of their changes;
 *  this only re-renders when the resolved label for *this* node actually changes. */
export function useConnectedModel(): string | undefined {
  const nodeId = useNodeId()
  return useStore((state: ReactFlowState) => {
    if (!nodeId) return undefined
    const edge = state.edges.find((e) => e.target === nodeId && e.targetHandle === 'model')
    const sourceData = edge ? (state.nodeInternals.get(edge.source)?.data as BlockNodeData | undefined) : undefined
    // A "model" edge should always come from an AI Model block, but nothing besides this
    // check actually guarantees it - narrow explicitly rather than assuming.
    if (sourceData?.kind !== 'aiModel' || !sourceData.model) return undefined
    return `${sourceData.model} (${sourceData.provider})`
  })
}
