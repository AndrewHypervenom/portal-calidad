import type { Canal, Catalogo, Cedula, CedulaItem, ItemDef } from './types'

export const ORDEN_BLOQUES = ['Falcon', 'Front', 'Vcas', 'Vision', 'Vision+', 'VRM', 'B.I', 'BI', 'Manejo de llamada', 'Control de llamada']

export interface ItemCompleto extends CedulaItem {
  def: ItemDef
}

export interface GrupoBloque {
  bloque: string
  items: ItemCompleto[]
  puntos: number
}

const cache = new WeakMap<Catalogo, Map<string, GrupoBloque[]>>()

export function cedulaPorId(cat: Catalogo, id: string): Cedula | undefined {
  return cat.cedulas.find((c) => c.id === id)
}

export function cedulasDeCanal(cat: Catalogo, canal: Canal): Cedula[] {
  return cat.cedulas.filter((c) => c.canal === canal)
}

export function bloquesDeCedula(cat: Catalogo, cedulaId: string): GrupoBloque[] {
  let porCat = cache.get(cat)
  if (!porCat) {
    porCat = new Map()
    cache.set(cat, porCat)
  }
  const hit = porCat.get(cedulaId)
  if (hit) return hit
  const ced = cedulaPorId(cat, cedulaId)
  if (!ced) return []
  const grupos = new Map<string, GrupoBloque>()
  const items = ced.items
    .map((it) => ({ ...it, def: cat.items[it.key] }))
    .filter((it) => it.def)
    .sort((a, b) => a.def.fila - b.def.fila)
  for (const it of items) {
    const g = grupos.get(it.def.bloque) ?? { bloque: it.def.bloque, items: [], puntos: 0 }
    g.items.push(it)
    g.puntos += it.peso
    grupos.set(it.def.bloque, g)
  }
  const res = [...grupos.values()].sort((a, b) => indiceBloque(a.bloque) - indiceBloque(b.bloque) || a.items[0].def.fila - b.items[0].def.fila)
  porCat.set(cedulaId, res)
  return res
}

function indiceBloque(b: string) {
  const i = ORDEN_BLOQUES.indexOf(b)
  return i < 0 ? 99 : i
}

export function cedulaPorTipoLlamada(cat: Catalogo, canal: Canal, tipo: string): Cedula | undefined {
  const t = tipo.trim().toUpperCase()
  return cat.cedulas.find((c) => c.canal === canal && [c.nombreExcel, ...c.alias, ...(c.tiposLlamada ?? [])].some((x) => x.toUpperCase() === t))
}

export function tiposLlamada(cat: Catalogo, canal: Canal): { tipo: string; cedulaId: string }[] {
  if (canal === 'Inbound') return cedulasDeCanal(cat, canal).map((c) => ({ tipo: c.nombreExcel, cedulaId: c.id }))
  return cedulasDeCanal(cat, canal).flatMap((c) => (c.tiposLlamada ?? [c.nombreExcel]).map((t) => ({ tipo: t, cedulaId: c.id })))
}

export function etiquetaTipo(tipo: string): string {
  const t = tipo.toUpperCase()
  if (t === 'NO FRAUDE') return 'No fraude'
  if (t.startsWith('FRAUDE/CON')) return 'Fraude con afectación'
  if (t.startsWith('FRAUDE/SIN')) return 'Fraude sin afectación'
  return tipo
}

export function nombreCedulaCorto(ced?: Cedula): string {
  if (!ced) return '—'
  return ced.nombre
}

export function temasDeCanal(cat: Catalogo, canal: Canal): { tema: string; topico: string; bloque: string; keys: string[] }[] {
  const mapa = new Map<string, { tema: string; topico: string; bloque: string; keys: string[] }>()
  for (const def of Object.values(cat.items)) {
    if (def.canal !== canal) continue
    const t = mapa.get(def.tema) ?? { tema: def.tema, topico: def.topico, bloque: def.bloque, keys: [] }
    t.keys.push(def.key)
    mapa.set(def.tema, t)
  }
  return [...mapa.values()].sort((a, b) => {
    const fa = cat.items[a.keys[0]].fila
    const fb = cat.items[b.keys[0]].fila
    return indiceBloque(a.bloque) - indiceBloque(b.bloque) || fa - fb
  })
}

export function itemsCriticos(ced: Cedula): CedulaItem[] {
  return ced.items.filter((i) => i.critico !== 'no')
}
