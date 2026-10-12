/** "850 ms", "4.2s", "38s" or "2m 05s" - null while the run hasn't finished. */
export function runDuration(startIso: string, finishIso: string | null): string | null {
  if (!finishIso) return null
  const ms = new Date(finishIso).getTime() - new Date(startIso).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  if (ms < 1000) return `${ms} ms`
  const secs = ms / 1000
  if (secs < 10) return `${secs.toFixed(1)}s`
  if (secs < 60) return `${Math.floor(secs)}s`
  return `${Math.floor(secs / 60)}m ${String(Math.floor(secs % 60)).padStart(2, '0')}s`
}
