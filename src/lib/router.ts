import { useSyncExternalStore } from 'react'

export interface Ruta {
  pagina: string
  sub: string | null
  params: URLSearchParams
  paneles: { tipo: TipoPanel; id: string }[]
}

export type TipoPanel = 'ev' | 'ag' | 'plan' | 'doc' | 'an' | 'alertas'

function leer(): Ruta {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [camino, query = ''] = h.split('?')
  const [pagina = 'inicio', sub = null] = camino.split('/').filter(Boolean)
  const params = new URLSearchParams(query)
  const paneles = (params.get('p') ?? '')
    .split(',')
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf(':')
      return { tipo: x.slice(0, i) as TipoPanel, id: decodeURIComponent(x.slice(i + 1)) }
    })
    .filter((x) => x.tipo && x.id)
  return { pagina: pagina || 'inicio', sub, params, paneles }
}

let ruta = typeof window !== 'undefined' ? leer() : ({ pagina: 'inicio', sub: null, params: new URLSearchParams(), paneles: [] } as Ruta)
const oyentes = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    ruta = leer()
    for (const fn of oyentes) fn()
  })
}

export function useRuta(): Ruta {
  return useSyncExternalStore(
    (fn) => {
      oyentes.add(fn)
      return () => oyentes.delete(fn)
    },
    () => ruta,
    () => ruta,
  )
}

function construir(pagina: string, sub: string | null, params: URLSearchParams): string {
  const q = params.toString()
  return `#/${pagina}${sub ? `/${sub}` : ''}${q ? `?${q.replace(/%2C/g, ',').replace(/%3A/g, ':')}` : ''}`
}

function navegar(hash: string, reemplazar = false) {
  if (hash === window.location.hash) return
  if (reemplazar) {
    history.replaceState(null, '', hash)
    ruta = leer()
    for (const fn of oyentes) fn()
  } else window.location.hash = hash
}

export function ir(pagina: string, opciones: { sub?: string | null; params?: Record<string, string | null | undefined>; conservarPaneles?: boolean } = {}) {
  const params = new URLSearchParams()
  if (opciones.conservarPaneles && ruta.params.get('p')) params.set('p', ruta.params.get('p')!)
  for (const [k, v] of Object.entries(opciones.params ?? {})) if (v) params.set(k, v)
  navegar(construir(pagina, opciones.sub ?? null, params))
}

export function setParams(cambios: Record<string, string | null | undefined>, reemplazar = true) {
  const params = new URLSearchParams(ruta.params)
  for (const [k, v] of Object.entries(cambios)) {
    if (v === null || v === undefined || v === '') params.delete(k)
    else params.set(k, v)
  }
  navegar(construir(ruta.pagina, ruta.sub, params), reemplazar)
}

function pilaTexto(paneles: { tipo: string; id: string }[]) {
  return paneles.map((p) => `${p.tipo}:${encodeURIComponent(p.id)}`).join(',')
}

export function abrirPanel(tipo: TipoPanel, id: string) {
  const pila = ruta.paneles.filter((p) => !(p.tipo === tipo && p.id === id))
  const sinMismoTipo = pila.filter((p) => p.tipo !== tipo)
  setParams({ p: pilaTexto([...sinMismoTipo, { tipo, id }]) }, false)
}

export function cerrarPanel() {
  const pila = ruta.paneles.slice(0, -1)
  setParams({ p: pila.length ? pilaTexto(pila) : null }, false)
}

export function cerrarTodos() {
  setParams({ p: null }, false)
}

export function enlace(pagina: string, sub?: string | null): string {
  return construir(pagina, sub ?? null, new URLSearchParams())
}
