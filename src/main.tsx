import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { aplicarTema } from './lib/prefs'
import { store } from './lib/store'

aplicarTema()
void store.iniciar()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
