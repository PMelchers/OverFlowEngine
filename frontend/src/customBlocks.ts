import type { BlockNodeData, Subgraph } from './nodes/types'

export interface CustomBlock {
  id: string
  label: string
  subgraph: Subgraph
}

const STORAGE_KEY = 'overflowengine.customBlocks'

export function listCustomBlocks(): CustomBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CustomBlock[]) : []
  } catch {
    return []
  }
}

export function saveCustomBlock(block: CustomBlock) {
  const blocks = [...listCustomBlocks(), block]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks))
  return blocks
}

export function deleteCustomBlock(id: string) {
  const blocks = listCustomBlocks().filter((b) => b.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks))
  return blocks
}

/**
 * Walks a list of nodes (either a live canvas's nodes, or a saved block's own
 * subgraph.nodes) and refreshes any Group node whose `sourceBlockId` matches
 * `targetId` - including ones nested inside other Group nodes' subgraphs - so
 * every instance stamped out from a saved block picks up its latest edit.
 */
export function refreshGroupInstances<T extends { type?: string; data: BlockNodeData }>(
  items: T[],
  targetId: string,
  newSubgraph: Subgraph,
): { items: T[]; changed: boolean } {
  let changed = false
  const next = items.map((item) => {
    if (item.data.kind !== 'group' || !item.data.subgraph) return item

    if (item.data.sourceBlockId === targetId) {
      changed = true
      return { ...item, data: { ...item.data, subgraph: JSON.parse(JSON.stringify(newSubgraph)) } }
    }

    const inner = refreshGroupInstances(item.data.subgraph.nodes, targetId, newSubgraph)
    if (inner.changed) {
      changed = true
      return { ...item, data: { ...item.data, subgraph: { ...item.data.subgraph, nodes: inner.items } } }
    }
    return item
  })
  return { items: next, changed }
}

/** Saves `updatedBlock` and propagates its new subgraph into every other saved block that nests an instance of it. */
export function propagateCustomBlockUpdate(updatedBlock: CustomBlock): CustomBlock[] {
  const blocks = listCustomBlocks().map((b) => {
    if (b.id === updatedBlock.id) return updatedBlock
    const { items, changed } = refreshGroupInstances(b.subgraph.nodes, updatedBlock.id, updatedBlock.subgraph)
    return changed ? { ...b, subgraph: { ...b.subgraph, nodes: items } } : b
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks))
  return blocks
}
