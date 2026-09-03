import Canvas from './Canvas'
import { AuthProvider } from './auth'

function App() {
  return (
    <AuthProvider>
      <Canvas />
    </AuthProvider>
  )
}

export default App
