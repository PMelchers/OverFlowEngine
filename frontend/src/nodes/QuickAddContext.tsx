import { createContext, useContext } from 'react'
import type { BlockKind } from './types'

/** Supplied once by Canvas (see quickAddBlock) so QuickAddButton, rendered inside every
 *  wrapped node, doesn't need this threaded through each node's own `data`. */
export const QuickAddContext = createContext<(sourceId: string, kind: BlockKind) => void>(() => {})

export function useQuickAdd() {
  return useContext(QuickAddContext)
}
