import { useRef } from 'react'
import type { BlockNodeData } from './types'
import { useConnectedModel } from './useConnectedModel'
import { useVariableInsertion } from './useVariableInsertion'

/** Fields shown inside an App Action block once its app is set to "AI" - the model
 *  comes from an AI Model block wired to this node's own "model" handle, same as an
 *  AI Agent block, so AI actions reuse the credential/model-picking UI that already
 *  exists rather than duplicating it here. */
export default function AiCallFields({ data }: { data: BlockNodeData }) {
  const availableVariables = data.availableVariables ?? []
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const connectedModel = useConnectedModel()
  const insertVariable = useVariableInsertion(promptRef, data.prompt ?? '', (next) => data.onChange?.({ prompt: next }))

  return (
    <>
      <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Model</label>
      <p
        className={`mb-2 w-full rounded border px-2 py-1 text-sm ${
          connectedModel
            ? 'border-emerald-300 bg-white text-emerald-700 dark:border-emerald-700 dark:bg-gray-900 dark:text-emerald-300'
            : 'border-dashed border-emerald-300 bg-emerald-50 text-emerald-400 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-500'
        }`}
      >
        {connectedModel ?? 'Connect an AI Model block below ↓'}
      </p>

      <label className="mb-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Prompt</label>
      <textarea
        ref={promptRef}
        value={data.prompt ?? ''}
        onChange={(e) => data.onChange?.({ prompt: e.target.value })}
        placeholder="What should the model do?"
        rows={3}
        className="nodrag w-full resize-none rounded border border-emerald-300 bg-white px-2 py-1 text-xs dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {availableVariables.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            insertVariable(e.target.value)
            e.target.value = ''
          }}
          className="nodrag mb-2 mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-emerald-600 dark:border-emerald-700 dark:bg-gray-900 dark:text-emerald-300"
        >
          <option value="">Insert a variable into Prompt...</option>
          {availableVariables.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.varType})
            </option>
          ))}
        </select>
      )}

      <label className="mb-1 mt-2 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
        Save reply as
      </label>
      <input
        type="text"
        value={data.outputVariable ?? ''}
        placeholder="variable name"
        onChange={(e) => data.onChange?.({ outputVariable: e.target.value })}
        className="nodrag w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm dark:border-emerald-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
        Preview action - simulates a reply from the connected model; real model calls aren't wired up yet.
      </p>
    </>
  )
}
