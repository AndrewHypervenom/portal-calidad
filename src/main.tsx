import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { aplicarTema } from './lib/prefs'
import { FirmaPublica } from './pages/FirmaPublica'

aplicarTema()


const tokenFirma = /^#\/firmar\/([A-Za-z0-9_-]+)/.exec(window.location.hash)?.[1]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {tokenFirma ? <FirmaPublica token={tokenFirma} /> : <App />}
  </StrictMode>,
)