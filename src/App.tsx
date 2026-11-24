import { Suspense, lazy, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useStore, store } from './lib/store'
import { useRuta } from './lib/router'
import { setPrefs, usePrefs } from './lib/prefs'
import { Layout, Marca } from './components/Layout'
import { Comandos } from './components/Comandos'
import { Confirmaciones, Toasts } from './components/feedback'
import { Boton, Cargando } from './components/ui'
import { Inicio } from './pages/Inicio'
import { Evaluar } from './pages/Evaluar'
import { Evaluaciones } from './pages/Evaluaciones'
import { PanelEvaluacion } from './panels/PanelEvaluacion'
import { PanelAgente } from './panels/PanelAgente'
import { PanelPlan } from './panels/PanelPlan'
import { PanelAnalista } from './panels/PanelAnalista'
import { PanelAlertas } from './panels/PanelAlertas'

const Equipo = lazy(() => import('./pages/Equipo').then((m) => ({ default: m.Equipo })))
const Seguimiento = lazy(() => import('./pages/Seguimiento').then((m) => ({ default: m.Seguimiento })))
const Analisis = lazy(() => import('./pages/Analisis').then((m) => ({ default: m.Analisis })))
const Operacion = lazy(() => import('./pages/Operacion').then((m) => ({ default: m.Operacion })))
const Guia = lazy(() => import('./pages/Guia').then((m) => ({ default: m.Guia })))
const Ajustes = lazy(() => import('./pages/Ajustes').then((m) => ({ default: m.Ajustes })))
const Bitacora = lazy(() => import('./pages/Bitacora').then((m) => ({ default: m.Bitacora })))
const EditorDocumento = lazy(() => import('./documents/EditorDocumento').then((m) => ({ default: m.EditorDocumento })))

function Pagina() {
  const ruta = useRuta()
  switch (ruta.pagina) {
    case 'evaluar':
      return <Evaluar />
    case 'evaluaciones':
      return <Evaluaciones />
    case 'equipo':
      return <Equipo />
    case 'seguimiento':
      return <Seguimiento />
    case 'analisis':
      return <Analisis />
    case 'operacion':
      return <Operacion />
    case 'guia':
      return <Guia />
    case 'ajustes':
      return <Ajustes />
    case 'bitacora':
      return <Bitacora />
    default:
      return <Inicio />
  }
}

function Paneles() {
  const ruta = useRuta()
  return (
    <>
      {ruta.paneles.map((p, i) => {
        const k = `${p.tipo}:${p.id}`
        const props = { id: p.id, profundidad: i, arriba: i === ruta.paneles.length - 1 }
        switch (p.tipo) {
          case 'ev':
            return <PanelEvaluacion key={k} {...props} />
          case 'ag':
            return <PanelAgente key={k} {...props} />
          case 'plan':
            return <PanelPlan key={k} {...props} />
          case 'an':
            return <PanelAnalista key={k} {...props} />
          case 'alertas':
            return <PanelAlertas key={k} {...props} />
          case 'doc':
            return (
              <Suspense key={k} fallback={null}>
                <EditorDocumento {...props} />
              </Suspense>
            )
          default:
            return null
        }
      })}
    </>
  )
}

function Bienvenida() {
  const { db } = useStore()
  if (!db) return null
  return (
    <div className="anim-fundido fixed inset-0 z-[85] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="anim-escala w-full max-w-[440px] rounded-[24px] bg-elevated p-7 text-center shadow-pop">
        <Marca className="mx-auto h-[26px]" />
        <div className="linea-marca mx-auto mt-4 h-[3px] w-16 rounded-full" aria-hidden />
        <h2 className="mt-4 text-[22px] font-bold tracking-[-0.02em]">Portal de Calidad</h2>
        <p className="mt-1.5 text-[14px] text-ink-2">¿Quién usa este equipo? Tu nombre quedará como analista en las evaluaciones que registres. Puedes cambiarlo después en la barra lateral.</p>
        <div className="mt-5 flex flex-col gap-2">
          {db.analistas
            .filter((a) => a.activo)
            .map((a) => (
              <Boton key={a.id} variante="secundario" tam="lg" className="w-full justify-start" onClick={() => setPrefs({ analistaId: a.id })}>
                {a.nombre}
              </Boton>
            ))}
          <button className="mt-1 text-[13px] font-medium text-accent-ink hover:underline" onClick={() => setPrefs({ analistaId: 'consulta' })}>
            Solo voy a consultar
          </button>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const { db, error } = useStore()
  const prefs = usePrefs()
  const [buscar, setBuscar] = useState(false)

  useEffect(() => {
    const analista = db?.analistas.find((a) => a.id === prefs.analistaId)
    store.por = analista?.nombre ?? ''
  }, [db?.analistas, prefs.analistaId])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const enCampo = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBuscar((v) => !v)
      } else if (e.key === '/' && !enCampo) {
        e.preventDefault()
        setBuscar(true)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  if (error)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="size-10 text-warn" />
        <h1 className="text-[20px] font-semibold">No se pudieron cargar los datos</h1>
        <p className="max-w-md text-[14px] text-ink-2">{error}</p>
        <Boton variante="primario" onClick={() => location.reload()}>
          Reintentar
        </Boton>
      </div>
    )
  if (!db)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <Marca className="h-[24px]" />
        <Cargando texto="Cargando el portal…" />
      </div>
    )
  return (
    <>
      <Layout onBuscar={() => setBuscar(true)}>
        <Suspense fallback={<Cargando />}>
          <Pagina />
        </Suspense>
      </Layout>
      <Paneles />
      <Comandos abierto={buscar} onCerrar={() => setBuscar(false)} />
      {!prefs.analistaId && <Bienvenida />}
      <Confirmaciones />
      <Toasts />
    </>
  )
}
