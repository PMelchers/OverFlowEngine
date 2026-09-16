import { CheckCircle2 } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Rendered instead of the whole app when this tab is the small popup ConnectAppModal
 * opened for OAuth consent - the provider's redirect lands it back here (see the
 * calendar_connected query param in main.py's callback). Posts back to the canvas
 * tab that opened it and closes itself, so the connect flow never leaves the canvas.
 */
export default function OAuthPopupBridge({ provider }: { provider: string }) {
  useEffect(() => {
    window.opener?.postMessage({ type: 'calendar-connected', provider }, window.location.origin)
    const timer = window.setTimeout(() => window.close(), 900)
    return () => window.clearTimeout(timer)
  }, [provider])

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-900">
      <CheckCircle2 className="h-10 w-10 text-green-500" />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Connected - you can close this window</p>
    </div>
  )
}
