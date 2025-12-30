import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AudioContextProvider } from './contexts/AudioContextProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioContextProvider>
      <App />
    </AudioContextProvider>
  </StrictMode>,
)
