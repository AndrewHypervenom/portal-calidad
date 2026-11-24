import type { Agente, Analista, Canal, Catalogo, Config, Evaluacion, Semaforo } from './types'
import { claveMes, deIso, diasEntre, fechaCorta, inicioSemana, primerDiaMes, sumarDias, ultimoDiaMes, semanaDelMes, aIso } from './dates'
import type { Rango } from './periodo'
import { etiquetaTipo, temasDeCanal } from './catalog'

export function promedio(valores: (number | null | undefined)[]): number | null {
  let s = 0
  let n = 0
  for (const v of valores) {
    if (typeof v === 'number' && !Number.isNaN(v)) {
      s += v
      n++
    }
  }
  return n ? s / n : null
}

export const enMeta = (e: Evaluacion, cfg: Pick<Config, 'meta'>) => !e.critico && e.puntaje !== null && e.puntaje >= cfg.meta - 1e-9

export interface Resumen {
  n: number
  promedio: number | null
  enMeta: number
  criticos: number
  agentes: number
  duracionProm: number | null
  porCanal: Record<Canal, { n: number; promedio: number | null }>
}

export function resumen(evals: Evaluacion[], cfg: Config): Resumen {
  const porCanal: Resumen['porCanal'] = {
    Inbound: { n: 0, promedio: null },
    Monitoreo: { n: 0, promedio: null },
  }
  for (const c of ['Inbound', 'Monitoreo'] as Canal[]) {
    const l = evals.filter((e) => e.canal === c)
    porCanal[c] = { n: l.length, promedio: promedio(l.map((e) => e.puntaje)) }
  }
  return {
    n: evals.length,
    promedio: promedio(evals.map((e) => e.puntaje)),
    enMeta: evals.filter((e) => enMeta(e, cfg)).length,
    criticos: evals.filter((e) => e.critico).length,
    agentes: new Set(evals.map((e) => e.agenteId)).size,
    duracionProm: promedio(evals.map((e) => e.duracionSeg)),
    porCanal,
  }
}

export interface PuntoSerie {
  clave: string
  etiqueta: string
  detalle: string
  desde: string
  hasta: string
  n: number
  promedio: number | null
  porCanal: Record<Canal, { n: number; promedio: number | null }>
}

export function seriePorSemana(evals: Evaluacion[], rango: Rango): PuntoSerie[] {
  const cubetas = new Map<string, Evaluacion[]>()
  const puntos: PuntoSerie[] = []
  if (rango.mes) {
    const ultimo = ultimoDiaMes(rango.mes)
    const totalSemanas = semanaDelMes(ultimo)
    for (let s = 1; s <= totalSemanas; s++) cubetas.set(String(s), [])
    for (const e of evals) {
      if (claveMes(e.fechaEvaluacion) !== rango.mes) continue
      const k = String(e.semana || semanaDelMes(e.fechaEvaluacion))
      if (!cubetas.has(k)) cubetas.set(k, [])
      cubetas.get(k)!.push(e)
    }
    const primero = primerDiaMes(rango.mes)
    for (const [k, l] of cubetas) {
      const s = Number(k)
      const d = deIso(primero)
      while (semanaDelMes(aIso(d)) < s && aIso(d) < ultimo) d.setDate(d.getDate() + 1)
      const desde = aIso(d)
      let hasta = desde
      while (sumarDias(hasta, 1) <= ultimo && semanaDelMes(sumarDias(hasta, 1)) === s) hasta = sumarDias(hasta, 1)
      puntos.push(armar(k, `Sem ${k}`, `${fechaCorta(desde)} – ${fechaCorta(hasta)}`, desde, hasta, l))
    }
    return puntos.sort((a, b) => Number(a.clave) - Number(b.clave))
  }
  for (const e of evals) {
    const k = inicioSemana(e.fechaEvaluacion)
    if (!cubetas.has(k)) cubetas.set(k, [])
    cubetas.get(k)!.push(e)
  }
  const claves = [...cubetas.keys()].sort()
  if (claves.length) {
    for (let k = claves[0]; k <= claves[claves.length - 1]; k = sumarDias(k, 7)) if (!cubetas.has(k)) cubetas.set(k, [])
  }
  for (const k of [...cubetas.keys()].sort()) {
    const hasta = sumarDias(k, 6)
    puntos.push(armar(k, fechaCorta(k), `${fechaCorta(k)} – ${fechaCorta(hasta)}`, k, hasta, cubetas.get(k)!))
  }
  return puntos
}

function armar(clave: string, etiqueta: string, detalle: string, desde: string, hasta: string, l: Evaluacion[]): PuntoSerie {
  const inb = l.filter((e) => e.canal === 'Inbound')
  const mon = l.filter((e) => e.canal === 'Monitoreo')
  return {
    clave,
    etiqueta,
    detalle,
    desde,
    hasta,
    n: l.length,
    promedio: promedio(l.map((e) => e.puntaje)),
    porCanal: {
      Inbound: { n: inb.length, promedio: promedio(inb.map((e) => e.puntaje)) },
      Monitoreo: { n: mon.length, promedio: promedio(mon.map((e) => e.puntaje)) },
    },
  }
}

export interface FilaCedula {
  cedulaId: string
  nombre: string
  canal: Canal
  n: number
  promedio: number | null
  delta: number | null
  criticos: number
  enMeta: number
  porSemana: Map<number, { n: number; promedio: number | null }>
}

export function porCedula(evals: Evaluacion[], cat: Catalogo, cfg: Config): FilaCedula[] {
  const global = promedio(evals.map((e) => e.puntaje))
  return cat.cedulas.map((c) => {
    const l = evals.filter((e) => e.cedulaId === c.id)
    const porSemana = new Map<number, { n: number; promedio: number | null }>()
    for (const s of [...new Set(l.map((e) => e.semana))].sort()) {
      const ls = l.filter((e) => e.semana === s)
      porSemana.set(s, { n: ls.length, promedio: promedio(ls.map((e) => e.puntaje)) })
    }
    const p = promedio(l.map((e) => e.puntaje))
    return {
      cedulaId: c.id,
      nombre: c.nombre,
      canal: c.canal,
      n: l.length,
      promedio: p,
      delta: p !== null && global !== null ? p - global : null,
      criticos: l.filter((e) => e.critico).length,
      enMeta: l.filter((e) => enMeta(e, cfg)).length,
      porSemana,
    }
  })
}

export interface FilaAgente {
  agente: Agente
  evals: Evaluacion[]
  n: number
  promedio: number | null
  criticos: number
  enMeta: number
  porSemana: Map<number, number | null>
  porCedula: Map<string, { n: number; promedio: number | null }>
  porProceso: Map<string, { n: number; promedio: number | null }>
  porTipo: Map<string, { n: number; promedio: number | null }>
  fallasPorTema: Map<string, number>
  ultima: Evaluacion | null
}

export function matrizProcesoTipo(evals: Evaluacion[], procesos: string[], tipos: string[]) {
  const esFraude = (t: string) => t.toUpperCase().startsWith('FRAUDE')
  const defs: { id: string; etiqueta: string; incluye: (e: Evaluacion) => boolean }[] = [
    { id: 'total', etiqueta: 'Total', incluye: () => true },
    ...tipos.filter((t) => !esFraude(t)).map((t) => ({ id: t, etiqueta: etiquetaTipo(t), incluye: (e: Evaluacion) => e.tipoLlamada === t })),
    { id: 'fraude', etiqueta: 'Fraude (todos)', incluye: (e: Evaluacion) => esFraude(e.tipoLlamada) },
    ...tipos.filter(esFraude).map((t) => ({ id: t, etiqueta: etiquetaTipo(t), incluye: (e: Evaluacion) => e.tipoLlamada === t })),
  ]
  const celda = (l: Evaluacion[]) => ({ n: l.length, promedio: promedio(l.map((e) => e.puntaje)) })
  return {
    columnas: defs.map(({ id, etiqueta }) => ({ id, etiqueta })),
    filas: procesos.map((proceso) => {
      const l = evals.filter((e) => e.proceso === proceso)
      return { proceso, celdas: defs.map((d) => celda(l.filter(d.incluye))) }
    }),
  }
}

export function porAgente(evals: Evaluacion[], agentes: Agente[], cfg: Pick<Config, 'meta'>): Map<string, FilaAgente> {
  const mapa = new Map<string, FilaAgente>()
  const indice = new Map(agentes.map((a) => [a.id, a]))
  const grupos = new Map<string, Evaluacion[]>()
  for (const e of evals) {
    const l = grupos.get(e.agenteId)
    if (l) l.push(e)
    else grupos.set(e.agenteId, [e])
  }
  for (const [id, l] of grupos) {
    const agente = indice.get(id) ?? { id, nombre: l[0].agenteNombre, canal: l[0].canal, proceso: l[0].proceso, activo: false }
    const ordenadas = l.slice().sort((a, b) => a.fechaEvaluacion.localeCompare(b.fechaEvaluacion) || a.creadoEn.localeCompare(b.creadoEn))
    const porSemana = new Map<number, number | null>()
    for (const s of [...new Set(l.map((e) => e.semana))]) porSemana.set(s, promedio(l.filter((e) => e.semana === s).map((e) => e.puntaje)))
    const porCedulaMap = new Map<string, { n: number; promedio: number | null }>()
    for (const c of [...new Set(l.map((e) => e.cedulaId))]) {
      const lc = l.filter((e) => e.cedulaId === c)
      porCedulaMap.set(c, { n: lc.length, promedio: promedio(lc.map((e) => e.puntaje)) })
    }
    const porProceso = new Map<string, { n: number; promedio: number | null }>()
    for (const pr of [...new Set(l.map((e) => e.proceso))]) {
      const lp = l.filter((e) => e.proceso === pr)
      porProceso.set(pr, { n: lp.length, promedio: promedio(lp.map((e) => e.puntaje)) })
    }
    const porTipo = new Map<string, { n: number; promedio: number | null }>()
    for (const t of [...new Set(l.map((e) => e.tipoLlamada))]) {
      const lt = l.filter((e) => e.tipoLlamada === t)
      porTipo.set(t, { n: lt.length, promedio: promedio(lt.map((e) => e.puntaje)) })
    }
    const fallasPorTema = new Map<string, number>()
    for (const e of l) {
      for (const [k, r] of Object.entries(e.respuestas)) {
        if (r !== 'N' || !(k in e.pesos)) continue
        fallasPorTema.set(k, (fallasPorTema.get(k) ?? 0) + 1)
      }
    }
    mapa.set(id, {
      agente,
      evals: ordenadas,
      n: l.length,
      promedio: promedio(l.map((e) => e.puntaje)),
      criticos: l.filter((e) => e.critico).length,
      enMeta: l.filter((e) => enMeta(e, cfg)).length,
      porSemana,
      porCedula: porCedulaMap,
      porProceso,
      porTipo,
      fallasPorTema,
      ultima: ordenadas[ordenadas.length - 1] ?? null,
    })
  }
  return mapa
}

export interface FilaAnalista {
  analista: Analista
  n: number
  promedio: number | null
  criticos: number
  porDia: Map<string, number>
  diasActivos: number
  porCanal: Record<Canal, number>
}

export function porAnalista(evals: Evaluacion[], analistas: Analista[]): FilaAnalista[] {
  const grupos = new Map<string, Evaluacion[]>()
  for (const e of evals) {
    const l = grupos.get(e.analistaId)
    if (l) l.push(e)
    else grupos.set(e.analistaId, [e])
  }
  const filas: FilaAnalista[] = []
  for (const [id, l] of grupos) {
    const analista = analistas.find((a) => a.id === id) ?? { id, nombre: l[0].analista, corto: l[0].analista, activo: false, alias: [] }
    const porDia = new Map<string, number>()
    for (const e of l) porDia.set(e.fechaEvaluacion, (porDia.get(e.fechaEvaluacion) ?? 0) + 1)
    filas.push({
      analista,
      n: l.length,
      promedio: promedio(l.map((e) => e.puntaje)),
      criticos: l.filter((e) => e.critico).length,
      porDia,
      diasActivos: porDia.size,
      porCanal: { Inbound: l.filter((e) => e.canal === 'Inbound').length, Monitoreo: l.filter((e) => e.canal === 'Monitoreo').length },
    })
  }
  return filas.sort((a, b) => b.n - a.n)
}

export interface ErrorTema {
  tema: string
  canal: Canal
  topico: string
  bloque: string
  keys: string[]
  fallas: number
  evaluados: number
  tasa: number
  criticos: number
  agentes: number
}

export function erroresPorTema(evals: Evaluacion[], cat: Catalogo): ErrorTema[] {
  const mapa = new Map<string, ErrorTema & { _ag: Set<string> }>()
  for (const e of evals) {
    for (const [k, r] of Object.entries(e.respuestas)) {
      if (!(k in e.pesos) || (r !== 'S' && r !== 'N')) continue
      const def = cat.items[k]
      if (!def) continue
      let t = mapa.get(def.tema)
      if (!t) {
        t = { tema: def.tema, canal: def.canal, topico: def.topico, bloque: def.bloque, keys: [], fallas: 0, evaluados: 0, tasa: 0, criticos: 0, agentes: 0, _ag: new Set() }
        mapa.set(def.tema, t)
      }
      if (!t.keys.includes(k)) t.keys.push(k)
      t.evaluados++
      if (r === 'N') {
        t.fallas++
        t._ag.add(e.agenteId)
        const modo = e.criticos[k]
        if (modo === 'siempre' || (modo === 'motivo' && def.motivos?.some((m) => m.label === e.motivos[k] && m.critico))) t.criticos++
      }
    }
  }
  return [...mapa.values()]
    .map(({ _ag, ...t }) => ({ ...t, agentes: _ag.size, tasa: t.evaluados ? t.fallas / t.evaluados : 0 }))
    .sort((a, b) => b.fallas - a.fallas || b.tasa - a.tasa)
}

export interface CeldaMatriz {
  si: number
  no: number
  tasa: number | null
}

export function matrizErrores(evals: Evaluacion[], cat: Catalogo, canal: Canal) {
  const cedulas = cat.cedulas.filter((c) => c.canal === canal)
  const temas = temasDeCanal(cat, canal).filter((t) => cedulas.some((c) => c.items.some((i) => t.keys.includes(i.key))))
  const celdas = new Map<string, CeldaMatriz>()
  for (const t of temas) for (const c of cedulas) if (c.items.some((i) => t.keys.includes(i.key))) celdas.set(`${t.tema}|${c.id}`, { si: 0, no: 0, tasa: null })
  for (const e of evals) {
    if (e.canal !== canal) continue
    for (const [k, r] of Object.entries(e.respuestas)) {
      if (!(k in e.pesos) || (r !== 'S' && r !== 'N')) continue
      const def = cat.items[k]
      if (!def) continue
      const celda = celdas.get(`${def.tema}|${e.cedulaId}`)
      if (!celda) continue
      if (r === 'S') celda.si++
      else celda.no++
    }
  }
  for (const c of celdas.values()) c.tasa = c.si + c.no ? c.no / (c.si + c.no) : null
  const totalPorTema = new Map<string, CeldaMatriz>()
  for (const t of temas) {
    let si = 0
    let no = 0
    for (const c of cedulas) {
      const x = celdas.get(`${t.tema}|${c.id}`)
      if (x) {
        si += x.si
        no += x.no
      }
    }
    totalPorTema.set(t.tema, { si, no, tasa: si + no ? no / (si + no) : null })
  }
  return { cedulas, temas, celdas, totalPorTema }
}

export interface ResumenMotivo {
  key: string
  topico: string
  fallas: number
  sinMotivo: number
  porMotivo: { label: string; critico: boolean; n: number }[]
}

export function motivosResumen(evals: Evaluacion[], cat: Catalogo): ResumenMotivo[] {
  const res: ResumenMotivo[] = []
  for (const def of Object.values(cat.items)) {
    if (!def.motivos?.length) continue
    const fallas = evals.filter((e) => e.respuestas[def.key] === 'N' && def.key in e.pesos)
    res.push({
      key: def.key,
      topico: def.topico,
      fallas: fallas.length,
      sinMotivo: fallas.filter((e) => !e.motivos[def.key]).length,
      porMotivo: def.motivos.map((m) => ({ ...m, n: fallas.filter((e) => e.motivos[def.key] === m.label).length })),
    })
  }
  return res.sort((a, b) => (cat.items[a.key]?.fila ?? 0) - (cat.items[b.key]?.fila ?? 0))
}

export type EstadoAgente = Semaforo | 'sin-dato'

export interface SemaforoAgente {
  estado: EstadoAgente
  promedio: number | null
  n: number
  criticosMes: number
}

export function semaforoAgentes(evals: Evaluacion[], agentes: Agente[], referencia: string, cfg: Config): Map<string, SemaforoAgente> {
  const desde = sumarDias(referencia, -27)
  const inicioMes = primerDiaMes(claveMes(referencia))
  const res = new Map<string, SemaforoAgente>()
  for (const a of agentes) res.set(a.id, { estado: 'sin-dato', promedio: null, n: 0, criticosMes: 0 })
  const grupos = new Map<string, Evaluacion[]>()
  for (const e of evals) {
    if (e.fechaEvaluacion > referencia) continue
    const l = grupos.get(e.agenteId)
    if (l) l.push(e)
    else grupos.set(e.agenteId, [e])
  }
  for (const [id, l] of grupos) {
    const ventana = l.filter((e) => e.fechaEvaluacion >= desde)
    const criticosMes = l.filter((e) => e.critico && e.fechaEvaluacion >= inicioMes).length
    const p = promedio(ventana.map((e) => e.puntaje))
    let estado: EstadoAgente = 'sin-dato'
    if (ventana.length || criticosMes) {
      if (criticosMes > 0 || (p !== null && p < cfg.umbralRojo - 1e-9)) estado = 'rojo'
      else if (p !== null && p < cfg.meta - 1e-9) estado = 'amarillo'
      else if (p !== null) estado = 'verde'
    }
    res.set(id, { estado, promedio: p, n: ventana.length, criticosMes })
  }
  return res
}

export const BINS = [
  { etiqueta: '0% (crítico)', min: -1, max: 0 },
  { etiqueta: '1–69%', min: 0, max: 0.6999 },
  { etiqueta: '70–79%', min: 0.6999, max: 0.7999 },
  { etiqueta: '80–89%', min: 0.7999, max: 0.8999 },
  { etiqueta: '90–94%', min: 0.8999, max: 0.9499 },
  { etiqueta: '95–99%', min: 0.9499, max: 0.9999 },
  { etiqueta: '100%', min: 0.9999, max: 2 },
]

export function distribucion(evals: Evaluacion[]) {
  return BINS.map((b) => ({ ...b, n: evals.filter((e) => e.puntaje !== null && (b.min < 0 ? e.puntaje === 0 : e.puntaje > b.min && e.puntaje <= b.max)).length }))
}

export function ritmoDiario(evals: Evaluacion[], desde: string, hasta: string) {
  const dias: { fecha: string; n: number; habil: boolean }[] = []
  const fin = hasta > aIso(new Date()) ? aIso(new Date()) : hasta
  if (diasEntre(desde, fin) > 400) return dias
  for (let d = desde; d <= fin; d = sumarDias(d, 1)) {
    const w = deIso(d).getDay()
    dias.push({ fecha: d, n: evals.filter((e) => e.fechaEvaluacion === d).length, habil: w !== 0 && w !== 6 })
  }
  return dias
}
