import { useCallback, type RefObject } from 'react'

/** Inserts `{name}` at the current caret position of a text input/textarea and
 *  restores focus + caret after the value updates - the token-insertion behavior
 *  used by every node's "insert a variable" dropdown. One call per field: a node
 *  with several insertable fields (e.g. To/Subject/Message) calls this once per
 *  field, each with its own ref and value. */
export function useVariableInsertion(
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  value: string,
  onInsert: (next: string) => void,
) {
  return useCallback(
    (name: string) => {
      if (!name) return
      const token = `{${name}}`
      const el = ref.current
      const start = el?.selectionStart ?? value.length
      const end = el?.selectionEnd ?? value.length
      const next = value.slice(0, start) + token + value.slice(end)
      onInsert(next)
      requestAnimationFrame(() => {
        el?.focus()
        const caret = start + token.length
        el?.setSelectionRange(caret, caret)
      })
    },
    [ref, value, onInsert],
  )
}
