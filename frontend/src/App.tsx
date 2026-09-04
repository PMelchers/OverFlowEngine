import Canvas from './Canvas'
import { AuthProvider } from './auth'
import { ThemeProvider } from './theme'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Canvas />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
