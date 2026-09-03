import { useEffect, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useAuth } from '../auth'
import type { BlockNodeData } from './types'

type Credential = { id: number; provider: string; label: string; verified: boolean }

export default function AiModelNode({ data }: NodeProps<BlockNodeData>) {
  const { authedFetch } = useAuth()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const locked = !data.credentialId

  // Only the platform the linked key was recognized as belonging to - so you
  // can never pick a model the connected credential can't actually call.
  useEffect(() => {
    if (!open || !locked) return
    setLoading(true)
    authedFetch('/credentials')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Credential[]) => setCredentials(list.filter((c) => c.verified)))
      .finally(() => setLoading(false))
  }, [open, locked, authedFetch])

  useEffect(() => {
    if (!open || locked || !data.provider) return
    authedFetch(`/models/${data.provider}`)
      .then((res) => (res.ok ? res.json() : { models: [] }))
      .then((body) => setModelOptions(body.models ?? []))
  }, [open, locked, data.provider, authedFetch])

  const unlock = (cred: Credential) => {
    data.onChange?.({ credentialId: cred.id, provider: cred.provider, model: undefined })
  }

  const pickModel = (model: string) => {
    data.onChange?.({ model })
    setOpen(false)
  }

  const relock = () => {
    data.onChange?.({ credentialId: null, provider: undefined, model: undefined })
  }

  const displayText = locked ? 'Locked' : (data.model ?? 'Pick a model')

  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 text-center shadow-sm transition-all hover:shadow-md ${
          locked
            ? 'border-gray-400 bg-gray-100 text-gray-400'
            : 'border-fuchsia-500 bg-fuchsia-100 text-fuchsia-700'
        }`}
        title={locked ? 'Click to unlock with a verified API key' : `${data.provider}: ${data.model ?? 'no model chosen yet'}`}
      >
        <span className="text-lg leading-none">{locked ? '🔒' : '🔓'}</span>
        <span className="mt-1 max-w-[4.5rem] truncate px-1 text-[10px] font-medium leading-tight">
          {displayText}
        </span>
      </button>

      {open && (
        <div className="absolute top-24 z-10 w-56 rounded-lg border border-gray-300 bg-white p-2 text-left shadow-lg">
          {locked ? (
            <>
              <p className="mb-1 text-[11px] font-semibold text-gray-600">Pick a verified API key</p>
              {loading ? (
                <p className="text-xs text-gray-400">Loading...</p>
              ) : credentials.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No verified API keys yet - add one from the account menu (paste a real key, or type
                  anything starting with "test" to try this out without a real provider).
                </p>
              ) : (
                <ul className="space-y-1">
                  {credentials.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => unlock(c)}
                        className="w-full rounded px-2 py-1 text-left text-xs hover:bg-fuchsia-50"
                      >
                        ✓ {c.label} <span className="text-gray-400">({c.provider})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="mb-1 text-[11px] font-semibold text-gray-600">Pick a {data.provider} model</p>
              {modelOptions.length === 0 ? (
                <p className="text-xs text-gray-400">No known models for this platform yet.</p>
              ) : (
                <ul className="space-y-1">
                  {modelOptions.map((m) => (
                    <li key={m}>
                      <button
                        type="button"
                        onClick={() => pickModel(m)}
                        className={`w-full rounded px-2 py-1 text-left text-xs hover:bg-fuchsia-50 ${
                          data.model === m ? 'bg-fuchsia-100 font-medium' : ''
                        }`}
                      >
                        {m}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={relock}
                className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-red-500 hover:bg-red-50"
              >
                🔒 Lock / change key
              </button>
            </>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Top} className="!bg-fuchsia-500" />
    </div>
  )
}
