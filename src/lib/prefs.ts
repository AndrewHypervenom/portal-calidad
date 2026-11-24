import { useSyncExternalStore } from 'react'
import type { FiltroCanal } from './periodo'

export type Tema = 'sistema' | 'claro' | 'oscuro'

export interface Prefs {
  tema: Tema
  analistaId: string
  periodo: string
  canal: FiltroCanal
  barraCompacta: boolean
}

const CLAVE = 'portal-calidad:prefs'
const DEFECTO: Prefs = { tema: 'sistema', analistaId: '', periodo: '', canal: 'todos', barraCompacta: false }

function leer(): Prefs {
  try {
    const t = localStorage.getItem(CLAVE)
    return t ? { ...DEFECTO, ...JSON.parse(t) } : DEFECTO
  } catch {
    return DEFECTO
  }
}

let actual = leer()
const oyentes = new Set<() => void>()

export function setPrefs(parcial: Partial<Prefs>) {
  actual = { ...actual, ...parcial }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(actual))
  } catch {
  }
  aplicarTema()
  for (const fn of oyentes) fn()
}

export function getPrefs() {
  return actual
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (fn) => {
      oyentes.add(fn)
      return () => oyentes.delete(fn)
    },
    () => actual,
    () => actual,
  )
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function temaEfectivo(): 'claro' | 'oscuro' {
  if (actual.tema === 'sistema') return media?.matches ? 'oscuro' : 'claro'
  return actual.tema
}

export function aplicarTema() {
  if (typeof document === 'undefined') return
  const t = temaEfectivo()
  document.documentElement.dataset.theme = t === 'oscuro' ? 'dark' : 'light'
  document.documentElement.style.colorScheme = t === 'oscuro' ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'oscuro' ? '#000000' : '#edf2f0')
}

media?.addEventListener('change', () => {
  if (actual.tema === 'sistema') {
    aplicarTema()
    for (const fn of oyentes) fn()
  }
})
