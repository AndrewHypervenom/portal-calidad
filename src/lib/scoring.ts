import type { Catalogo, Config, CriticoModo, Evaluacion, ItemDef, Resp, Semaforo } from './types'

export interface ItemPeso {
  key: string
  peso: number
  critico: CriticoModo
}

export interface Calificacion {
  puntaje: number | null
  critico: boolean
  criticos: string[]
  fallas: string[]
  si: number
  no: number
  posibles: number
  aplicables: number
  respondidos: number
  faltantes: string[]
  motivoPendiente: string[]
}

export function esFallaCritica(item: ItemPeso, def: ItemDef | undefined, resp: Resp | undefined, motivo: string | undefined): boolean {
  if (resp !== 'N') return false
  if (item.critico === 'siempre') return true
  if (item.critico === 'motivo') return !!def?.motivos?.some((m) => m.label === motivo && m.critico)
  return false
}

export function calificar(
  items: ItemPeso[],
  defs: Record<string, ItemDef>,
  respuestas: Record<string, Resp | undefined>,
  motivos: Record<string, string | undefined>,
): Calificacion {
  const r: Calificacion = {
    puntaje: null,
    critico: false,
    criticos: [],
    fallas: [],
    si: 0,
    no: 0,
    posibles: 0,
    aplicables: items.length,
    respondidos: 0,
    faltantes: [],
    motivoPendiente: [],
  }
  for (const it of items) {
    const resp = respuestas[it.key]
    if (!resp) {
      r.faltantes.push(it.key)
      continue
    }
    r.respondidos++
    if (resp === 'A') continue
    r.posibles += it.peso
    if (resp === 'S') r.si += it.peso
    else {
      r.no += it.peso
      r.fallas.push(it.key)
      const def = defs[it.key]
      if (it.critico === 'motivo' && def?.motivos?.length && !motivos[it.key]) r.motivoPendiente.push(it.key)
      if (esFallaCritica(it, def, resp, motivos[it.key])) r.criticos.push(it.key)
    }
  }
  r.critico = r.criticos.length > 0
  r.puntaje = r.critico ? 0 : r.si + r.no > 0 ? r.si / (r.si + r.no) : null
  return r
}

export function calificarEvaluacion(ev: Evaluacion, cat: Catalogo): Calificacion {
  const items: ItemPeso[] = Object.entries(ev.pesos).map(([key, peso]) => ({ key, peso, critico: ev.criticos[key] ?? 'no' }))
  return calificar(items, cat.items, ev.respuestas, ev.motivos)
}

export function semaforoDe(puntaje: number | null, critico: boolean, cfg: Pick<Config, 'meta' | 'umbralRojo'>): Semaforo | null {
  if (critico) return 'rojo'
  if (puntaje === null) return null
  if (puntaje >= cfg.meta - 1e-9) return 'verde'
  if (puntaje >= cfg.umbralRojo - 1e-9) return 'amarillo'
  return 'rojo'
}

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  verde: 'En meta',
  amarillo: 'En riesgo',
  rojo: 'Bajo desempeño',
}

export function etiquetaResultado(puntaje: number | null, critico: boolean, cfg: Pick<Config, 'meta' | 'umbralRojo'>): string {
  if (critico) return 'Error crítico'
  const s = semaforoDe(puntaje, critico, cfg)
  return s ? ETIQUETA_SEMAFORO[s] : 'Sin calificación'
}
