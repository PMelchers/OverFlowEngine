import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'

type UseAuthedResourceState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** Fetches `path` with the current auth token on mount and exposes `reload()` to
 *  re-run it on demand (e.g. after a mutation) - the [data, loading, error] +
 *  try/catch/finally pattern hand-rolled across ApiKeysPage, ConnectedAppsPage,
 *  Marketplace, Dashboard and FlowsPanel. */
export function useAuthedResource<T>(path: string, errorFallback = 'Could not load data'): UseAuthedResourceState<T> {
  const { authedFetch } = useAuth()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authedFetch(path)
      if (!res.ok) throw new Error(errorFallback)
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : errorFallback)
    } finally {
      setLoading(false)
    }
    // authedFetch's identity changes whenever the token does (see auth.tsx) - callers
    // reload explicitly after a mutation, so this intentionally only re-runs on mount
    // or when the resource itself (path) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, errorFallback])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload }
}
