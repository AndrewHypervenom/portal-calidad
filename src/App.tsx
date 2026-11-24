import { Suspense, lazy, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useStore, store } from './lib/store'
import { useRuta, ir } from './lib/router'
import { setPrefs } from './lib/prefs'
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
import { useSesion } from './lib/sesion'
import { Login } from './pages/Login'
import { puedeVer } from './components/navegacion'

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
  const { perfil } = useSesion()
  const permitido = puedeVer(ruta.pagina, perfil?.rol)

 
  useEffect(() => {
    if (!permitido) ir('inicio')
  }, [permitido])

  if (!permitido) return null
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

export function App() {
  const { cargando, perfil } = useSesion()
  const { db, error } = useStore()
  const [buscar, setBuscar] = useState(false)

  
  useEffect(() => {
    if (!perfil) return
    store.por = perfil.nombre
    setPrefs({ analistaId: perfil.analista_id ?? 'consulta' })
    if (!store.get().db) void store.iniciar()
  }, [perfil])

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

  
  if (cargando)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <Marca className="h-[24px]" />
        <Cargando texto="Verificando sesión…" />
      </div>
    )


  if (!perfil) return <Login />

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
      <Confirmaciones />
      <Toasts />
    </>
  )
}