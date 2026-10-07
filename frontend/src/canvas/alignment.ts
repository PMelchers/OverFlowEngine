import type { Node } from 'reactflow'
import type { BlockNodeData } from '../nodes/types'

const SNAP_THRESHOLD = 8

export interface AlignmentGuides {
  x?: number
  y?: number
}

export interface AlignmentResult {
  position: { x: number; y: number }
  guides: AlignmentGuides
}

/**
 * Given the node currently being dragged, checks its left/center/right edges
 * (and top/center/bottom) against every other node's matching edges. If any
 * pair is within SNAP_THRESHOLD px, the dragged node's position is nudged so
 * that pair lines up exactly, and the aligned coordinate is returned so a
 * guide line can be drawn through it.
 */
export function snapToNearbyNodes(
  dragged: Node<BlockNodeData>,
  others: Node<BlockNodeData>[],
): AlignmentResult {
  const dw = dragged.width ?? 0
  const dh = dragged.height ?? 0

  const xCandidates = [dragged.position.x, dragged.position.x + dw / 2, dragged.position.x + dw]
  const yCandidates = [dragged.position.y, dragged.position.y + dh / 2, dragged.position.y + dh]

  let bestDx: number | null = null
  let bestDy: number | null = null
  let guideX: number | undefined
  let guideY: number | undefined

  for (const other of others) {
    const ow = other.width ?? 0
    const oh = other.height ?? 0
    const otherX = [other.position.x, other.position.x + ow / 2, other.position.x + ow]
    const otherY = [other.position.y, other.position.y + oh / 2, other.position.y + oh]

    for (const dx of xCandidates) {
      for (const ox of otherX) {
        const diff = ox - dx
        if (Math.abs(diff) <= SNAP_THRESHOLD && (bestDx === null || Math.abs(diff) < Math.abs(bestDx))) {
          bestDx = diff
          guideX = ox
        }
      }
    }
    for (const dy of yCandidates) {
      for (const oy of otherY) {
        const diff = oy - dy
        if (Math.abs(diff) <= SNAP_THRESHOLD && (bestDy === null || Math.abs(diff) < Math.abs(bestDy))) {
          bestDy = diff
          guideY = oy
        }
      }
    }
  }

  return {
    position: {
      x: dragged.position.x + (bestDx ?? 0),
      y: dragged.position.y + (bestDy ?? 0),
    },
    guides: { x: guideX, y: guideY },
  }
}
