import { useEffect, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useAuth } from '../auth'
import type { BlockNodeData } from './types'

type Credential = { id: number; provider: string; label: string; verified: boolean }

export default function AiModelNode({ data }: NodeProps<BlockNodeData>) {
  const { authedFetch } = useAuth()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState(false)
  const locked = !data.credentialId

  useEffect(() => {
    if (!picking) return
    setLoading(true)
    authedFetch('/credentials')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Credential[]) => setCredentials(list.filter((c) => c.verified)))
      .finally(() => setLoading(false))
  }, [picking, authedFetch])

  const unlock = (cred: Credential) => {
    data.onChange?.({ credentialId: cred.id, model: `${cred.label} (${cred.provider})` })
    setPicking(false)
  }

  const relock = () => {
    data.onChange?.({ credentialId: null, model: undefined })
    setPicking(false)
  }

  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        onClick={() => setPicking((p) => !p)}
        className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-full border-4 text-center shadow-sm transition-all hover:shadow-md ${
          locked
            ? 'border-gray-400 bg-gray-100 text-gray-400'
            : 'border-fuchsia-500 bg-fuchsia-100 text-fuchsia-700'
        }`}
        title={locked ? 'Click to unlock with a verified API key' : data.model}
      >
        <span className="text-lg leading-none">{locked ? '🔒' : '🔓'}</span>
        <span className="mt-1 max-w-[4.5rem] truncate px-1 text-[10px] font-medium leading-tight">
          {locked ? 'Locked' : data.model}
        </span>
      </button>

      {picking && (
        <div className="absolute top-24 z-10 w-52 rounded-lg border border-gray-300 bg-white p-2 text-left shadow-lg">
          <p className="mb-1 text-[11px] font-semibold text-gray-600">Pick a verified API key</p>
          {loading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : credentials.length === 0 ? (
            <p className="text-xs text-gray-400">
              No verified API keys yet - add one from the account menu, or use provider "test" to try this
              out without a real key.
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
          {!locked && (
            <button
              type="button"
              onClick={relock}
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-red-500 hover:bg-red-50"
            >
              🔒 Lock again
            </button>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Top} className="!bg-fuchsia-500" />
    </div>
  )
}
