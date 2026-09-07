import { useState } from 'react'
import Canvas from './Canvas'
import Dashboard from './Dashboard'
import Marketplace from './Marketplace'
import Settings from './Settings'
import { AuthProvider } from './auth'
import { ThemeProvider } from './theme'

type View =
  | { kind: 'dashboard' }
  | { kind: 'editor'; flowId: number | null; templateId?: string | null }
  | { kind: 'settings'; from: View }
  | { kind: 'marketplace'; from: View }

function AppShell() {
  const [view, setView] = useState<View>({ kind: 'dashboard' })

  if (view.kind === 'settings') {
    return <Settings onBack={() => setView(view.from)} />
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
        onOpenSettings={() => setView({ kind: 'settings', from: view })}
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
