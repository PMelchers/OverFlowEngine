import { useEffect, useRef, useState } from 'react'
import Canvas from './canvas/Canvas'
import Dashboard from './dashboard/Dashboard'
import Marketplace from './marketplace/Marketplace'
import OAuthPopupBridge from './OAuthPopupBridge'
import Settings from './settings/Settings'
import { AuthProvider, useAuth } from './auth'
import { ThemeProvider } from './theme'

type View =
  | { kind: 'dashboard' }
  | { kind: 'editor'; flowId: number | null; templateId?: string | null }
  | { kind: 'settings'; from: View; initialSubPage?: 'connected-apps' }
  | { kind: 'marketplace'; from: View }

function AppShell() {
  const { user } = useAuth()
  const [view, setView] = useState<View>({ kind: 'dashboard' })

  // Every other view assumes it's rendering for a signed-in user and has no
  // sign-in gate of its own (only Dashboard checks `user`) - without this,
  // logging out from Settings/Canvas/Marketplace would leave that same
  // now-stale, now-unauthenticated page on screen instead of showing signed
  // out state anywhere. Only fires on an actual sign-in -> sign-out transition
  // (tracked via the ref) - anonymous browsing (never signed in at all) is a
  // supported mode on its own and must not get bounced back to Dashboard.
  const wasSignedIn = useRef(!!user)
  useEffect(() => {
    if (wasSignedIn.current && !user && view.kind !== 'dashboard') {
      setView({ kind: 'dashboard' })
    }
    wasSignedIn.current = !!user
  }, [user, view.kind])

  // This tab is the small OAuth consent popup ConnectAppModal opened, landing back
  // here after the provider redirects it - not the app itself. window.opener is only
  // set when a script (our own window.open) opened this tab, so a normal visit to
  // this URL never gets caught here even if the query param is somehow present.
  const [oauthPopupProvider] = useState(() =>
    window.opener ? new URLSearchParams(window.location.search).get('calendar_connected') : null,
  )
  if (oauthPopupProvider) {
    return <OAuthPopupBridge provider={oauthPopupProvider} />
  }

  if (view.kind === 'settings') {
    return <Settings onBack={() => setView(view.from)} initialSubPage={view.initialSubPage} />
  }

  if (view.kind === 'marketplace') {
    return <Marketplace onBack={() => setView(view.from)} />
  }

  if (view.kind === 'editor') {
    return (
      <Canvas
        initialFlowId={view.flowId}
        initialTemplateId={view.templateId ?? null}
        onExitToDashboard={() => setView({ kind: 'dashboard' })}
        onOpenSettings={(subPage) => setView({ kind: 'settings', from: view, initialSubPage: subPage })}
        onOpenMarketplace={() => setView({ kind: 'marketplace', from: view })}
      />
    )
  }

  return (
    <Dashboard
      onCreateNew={() => setView({ kind: 'editor', flowId: null })}
      onCreateFromTemplate={(templateId) => setView({ kind: 'editor', flowId: null, templateId })}
      onOpenFlow={(flowId) => setView({ kind: 'editor', flowId })}
      onOpenSettings={() => setView({ kind: 'settings', from: view })}
      onOpenMarketplace={() => setView({ kind: 'marketplace', from: view })}
    />
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
