import { ArrowLeft, Globe, Rocket, Store, User, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../shared/auth'
import Modal from '../shared/Modal'
import { relativeDate } from '../shared/relativeDate'
import { useAuthedResource } from '../shared/useAuthedResource'

type Listing = { id: number; name: string; description: string | null; author: string; created_at: string }
type MyFlow = { id: number; name: string; description: string | null; is_public: boolean; created_at: string }

function PublishModal({
  flow,
  onClose,
  onPublished,
}: {
  flow: MyFlow
  onClose: () => void
  onPublished: (patch: Partial<MyFlow>) => void
}) {
  const { authedFetch } = useAuth()
  const [description, setDescription] = useState(flow.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const publish = async () => {
    setError(null)
    setSaving(true)
    try {
      const res = await authedFetch(`/flows/${flow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: true, description }),
      })
      if (!res.ok) throw new Error('Could not publish this flow')
      onPublished({ is_public: true, description })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish this flow')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      panelClassName="w-96 rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
      labelledBy="publish-modal-title"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="publish-modal-title"
          className="flex items-center gap-1.5 text-base font-semibold text-gray-800 dark:text-gray-100"
        >
          <Rocket className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Publish "{flow.name}"
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
        Anyone will be able to see and copy this flow into their own account. AI Model blocks are never
        shared - copiers link their own API key.
      </p>
      <label className="mb-3 block text-sm text-gray-600 dark:text-gray-300">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this workflow do?"
          rows={3}
          className="mt-1 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </label>
      {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="button"
        onClick={publish}
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Publishing...' : 'Publish to Marketplace'}
      </button>
    </Modal>
  )
}

export default function Marketplace({ onBack }: { onBack: () => void }) {
  const { user, authedFetch } = useAuth()
  const [tab, setTab] = useState<'browse' | 'publish'>('browse')

  const {
    data: listingsData,
    loading: listingsLoading,
    error: listingsError,
  } = useAuthedResource<Listing[]>('/marketplace', 'Could not load the marketplace')
  const listings = listingsData ?? []
  const [copyingId, setCopyingId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const [myFlows, setMyFlows] = useState<MyFlow[]>([])
  const [myFlowsLoading, setMyFlowsLoading] = useState(false)
  const [publishTarget, setPublishTarget] = useState<MyFlow | null>(null)

  const loadMyFlows = async () => {
    if (!user) return
    setMyFlowsLoading(true)
    try {
      const res = await authedFetch('/flows')
      if (res.ok) setMyFlows(await res.json())
    } finally {
      setMyFlowsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'publish') loadMyFlows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user])

  const copyFlow = async (listing: Listing) => {
    if (!user) return
    setCopyingId(listing.id)
    try {
      const res = await authedFetch(`/marketplace/${listing.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${listing.name} (copy)` }),
      })
      if (res.ok) {
        setCopiedId(listing.id)
        setTimeout(() => setCopiedId((c) => (c === listing.id ? null : c)), 2500)
      }
    } finally {
      setCopyingId(null)
    }
  }

  const unpublish = async (flow: MyFlow) => {
    await authedFetch(`/flows/${flow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: false }),
    })
    setMyFlows((flows) => flows.map((f) => (f.id === flow.id ? { ...f, is_public: false } : f)))
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200/80 bg-white/95 px-5 py-2.5 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50">
          <Store className="h-4 w-4 text-red-600 dark:text-red-400" /> Marketplace
        </h1>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <div className="mb-6 flex overflow-hidden rounded-lg border border-gray-200 text-sm font-semibold dark:border-gray-700">
          <button
            type="button"
            onClick={() => setTab('browse')}
            className={`flex-1 py-2 ${
              tab === 'browse'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Browse
          </button>
          <button
            type="button"
            onClick={() => setTab('publish')}
            className={`flex-1 border-l border-gray-200 py-2 dark:border-gray-700 ${
              tab === 'publish'
                ? 'bg-red-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Publish a Flow
          </button>
        </div>

        {tab === 'browse' ? (
          listingsLoading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
          ) : listingsError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{listingsError}</p>
          ) : listings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
              Nothing published yet - be the first to share a workflow.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {listings.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-150 hover:border-blue-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-800 dark:hover:border-blue-700"
                >
                  <div>
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{l.name}</p>
                    {l.description && (
                      <p className="mt-1 line-clamp-3 text-xs text-gray-500 dark:text-gray-400">{l.description}</p>
                    )}
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                      <User className="h-3 w-3" /> {l.author} · {relativeDate(l.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyFlow(l)}
                    disabled={!user || copyingId === l.id}
                    title={user ? undefined : 'Sign in to copy this flow'}
                    className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copyingId === l.id
                      ? 'Copying...'
                      : copiedId === l.id
                        ? 'Copied to My Flows'
                        : 'Copy to My Flows'}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : !user ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
            Sign in to publish one of your saved flows.
          </div>
        ) : myFlowsLoading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        ) : myFlows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
            You don't have any saved flows yet - build one in the editor and save it first.
          </div>
        ) : (
          <ul className="space-y-2">
            {myFlows.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{f.name}</p>
                  {f.is_public ? (
                    <p className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                      <Globe className="h-3 w-3" /> Published to the marketplace
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">Private</p>
                  )}
                </div>
                {f.is_public ? (
                  <button
                    type="button"
                    onClick={() => unpublish(f)}
                    className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Unpublish
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPublishTarget(f)}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                  >
                    Publish
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {publishTarget && (
        <PublishModal
          flow={publishTarget}
          onClose={() => setPublishTarget(null)}
          onPublished={(patch) =>
            setMyFlows((flows) => flows.map((f) => (f.id === publishTarget.id ? { ...f, ...patch } : f)))
          }
        />
      )}
    </div>
  )
}
