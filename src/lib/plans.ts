import type { Causa, DB, Documento, Evaluacion, RutaNivel, Semaforo, Seguimiento, TipoDoc } from './types'
import { semaforoDe } from './scoring'
import { diaLocal, diasEntre, sumarDias } from './dates'

export type EstadoPlan = 'pendiente' | 'verificacion' | 'vencido' | 'reincide' | 'cerrado' | 'historico'

export const ETIQUETA_ESTADO: Record<EstadoPlan, string> = {
  pendiente: 'Acción pendiente',
  verificacion: 'En verificación',
  vencido: 'Vencido',
  reincide: 'Reincidió',
  cerrado: 'Cerrado',
  historico: 'Histórico (Excel)',
}

export const DOCS_POR_NIVEL: Record<number, TipoDoc[]> = { 0: [], 1: ['retro'], 2: ['retro'], 3: ['retro', 'carta'], 4: ['retro', 'acta'] }

export const FIRMA_ACCION: Record<TipoDoc, string> = { retro: 'colaborador', carta: 'agente', acta: 'agente' }
const DOC_ACCION: Record<number, TipoDoc> = { 1: 'retro', 2: 'retro', 3: 'carta', 4: 'acta' }

export interface FallaPlan {
  key: string
  rubro: string
  tema: string
  topico: string
  bloque: string
  critico: boolean
  reincidencia: number
  motivo?: string
  area?: string
}

export interface Verificacion {
  ev: Evaluacion
  pasa: boolean
  razon: string
}

export interface InfoEvaluacion {
  ev: Evaluacion
  nivel: number
  reincidencia: number
  fallas: FallaPlan[]
  semaforo: Semaforo | null
  causa?: Causa
}

export interface Plan extends InfoEvaluacion {
  id: string
  ruta: RutaNivel
  compromiso: string
  diasParaCompromiso: number
  accionFecha: string | null
  accionOrigen: 'manual' | 'documento' | 'feedback' | null
  verificaciones: Verificacion[]
  estado: EstadoPlan
  sucesorId: string | null
  fechaCierre: string | null
  diasAbiertos: number
  seguimiento?: Seguimiento
  documentos: Documento[]
  docsRequeridos: TipoDoc[]
  docsFaltantes: TipoDoc[]
}

export function tieneHallazgo(ev: Evaluacion): boolean {
  return Object.entries(ev.respuestas).some(([k, r]) => r === 'N' && k in ev.pesos)
}

export function fechaFeedback(ev: Evaluacion, documentos: Documento[]): string | null {
  const fechas: string[] = []
  if (ev.feedback?.fecha) fechas.push(diaLocal(ev.feedback.fecha))
  for (const d of documentos) {
    const f = d.evaluacionId === ev.id && d.tipo === 'retro' && !d.anulado ? d.firmas?.[FIRMA_ACCION.retro] : undefined
    if (f) fechas.push(diaLocal(f.fecha))
  }
  return fechas.sort()[0] ?? null
}

export function limiteFeedback(ev: Evaluacion): string {
  return sumarDias(ev.fechaEvaluacion, ev.critico ? 1 : 2)
}

export function nivelDe(puntaje: number | null, critico: boolean, reinc: number, causa: Causa | undefined, meta: number, umbral: number): number {
  if (puntaje === null && !critico) return 0
  const p = puntaje ?? 0
  if (reinc >= 3 || (critico && reinc >= 1) || (causa === 'QUERER' && reinc >= 2)) return 4
  if (critico || reinc === 2) return 3
  if (p < umbral - 1e-9 || reinc === 1) return 2
  if (p < meta - 1e-9) return 1
  return 0
}

export function nivelPlan(
  puntaje: number | null,
  critico: boolean,
  fallas: { critico: boolean; reincidencia: number }[],
  causa: Causa | undefined,
  meta: number,
  umbral: number,
): number {
  let nivel = nivelDe(puntaje, critico, 0, causa, meta, umbral)
  for (const f of fallas) nivel = Math.max(nivel, nivelDe(puntaje, f.critico, f.reincidencia, causa, meta, umbral))
  return nivel
}

export function rubroPlan(cedulaId: string, key: string): string {
  return `${cedulaId}|${key}`
}

export function rubrosFallados(ev: Evaluacion): Set<string> {
  const s = new Set<string>()
  for (const [k, r] of Object.entries(ev.respuestas)) if (r === 'N' && k in ev.pesos) s.add(rubroPlan(ev.cedulaId, k))
  return s
}

export function contarReincidencia(previas: Evaluacion[], fecha: string, cedulaId: string, key: string): number {
  const desde = sumarDias(fecha, -30)
  const rubro = rubroPlan(cedulaId, key)
  let n = 0
  for (const e of previas) if (e.fechaEvaluacion >= desde && e.fechaEvaluacion < fecha && rubrosFallados(e).has(rubro)) n++
  return n
}

export function ordenarEvaluaciones(evs: Evaluacion[]): Evaluacion[] {
  return evs.slice().sort((a, b) => a.fechaEvaluacion.localeCompare(b.fechaEvaluacion) || a.creadoEn.localeCompare(b.creadoEn) || a.folio.localeCompare(b.folio))
}

export interface Derivados {
  planes: Plan[]
  info: Map<string, InfoEvaluacion>
  planPorEval: Map<string, Plan>
  ordenadas: Evaluacion[]
}

const memo = new WeakMap<DB, Map<string, Derivados>>()

export function derivarPlanes(db: DB, hoy: string): Derivados {
  let porHoy = memo.get(db)
  if (!porHoy) {
    porHoy = new Map()
    memo.set(db, porHoy)
  }
  const hit = porHoy.get(hoy)
  if (hit) return hit

  const { meta, umbralRojo } = db.config
  const ordenadas = ordenarEvaluaciones(db.evaluaciones)
  const grupos = new Map<string, Evaluacion[]>()
  for (const ev of ordenadas) {
    const k = `${ev.canal}|${ev.agenteId}`
    const g = grupos.get(k)
    if (g) g.push(ev)
    else grupos.set(k, [ev])
  }
  const docsPorEval = new Map<string, Documento[]>()
  for (const d of db.documentos) {
    const l = docsPorEval.get(d.evaluacionId)
    if (l) l.push(d)
    else docsPorEval.set(d.evaluacionId, [d])
  }

  const info = new Map<string, InfoEvaluacion>()
  const planes: Plan[] = []
  const planPorEval = new Map<string, Plan>()

  for (const grupo of grupos.values()) {
    const fallados = grupo.map(rubrosFallados)
    grupo.forEach((ev, i) => {
      const desde = sumarDias(ev.fechaEvaluacion, -30)
      const fallas: FallaPlan[] = []
      for (const [key, r] of Object.entries(ev.respuestas)) {
        if (r !== 'N' || !(key in ev.pesos)) continue
        const def = db.catalogo.items[key]
        const rubro = rubroPlan(ev.cedulaId, key)
        let reinc = 0
        for (let j = 0; j < i; j++) {
          const previa = grupo[j].fechaEvaluacion
          if (previa >= desde && previa < ev.fechaEvaluacion && fallados[j].has(rubro)) reinc++
        }
        const modo = ev.criticos[key] ?? 'no'
        const critico =
          modo === 'siempre' || (modo === 'motivo' && !!def?.motivos?.some((m) => m.label === ev.motivos[key] && m.critico))
        fallas.push({ key, rubro, tema: def?.tema ?? key, topico: def?.topico ?? key, bloque: def?.bloque ?? '', critico, reincidencia: reinc, motivo: ev.motivos[key], area: ev.areas[key] })
      }
      fallas.sort((a, b) => Number(b.critico) - Number(a.critico) || b.reincidencia - a.reincidencia || (db.catalogo.items[a.key]?.fila ?? 0) - (db.catalogo.items[b.key]?.fila ?? 0))
      const reincidencia = fallas.reduce((m, f) => Math.max(m, f.reincidencia), 0)
      const seguimiento = db.seguimientos[ev.id]
      const causa = seguimiento?.causa
      const nivel = nivelPlan(ev.puntaje, ev.critico, fallas, causa, meta, umbralRojo)
      const base: InfoEvaluacion = { ev, nivel, reincidencia, fallas, semaforo: semaforoDe(ev.puntaje, ev.critico, db.config), causa }
      info.set(ev.id, base)
      if (nivel < 1) return

      const ruta = db.modelo.ruta.find((r) => r.nivel === nivel) ?? db.modelo.ruta[db.modelo.ruta.length - 1]
      const compromiso = sumarDias(ev.fechaEvaluacion, ruta.plazo)
      const rubrosPlan = new Set(fallas.map((f) => f.rubro))

      const verificaciones: Verificacion[] = []
      for (let j = i + 1; j < grupo.length && verificaciones.length < 3; j++) {
        const v = grupo[j]
        if (v.fechaEvaluacion <= ev.fechaEvaluacion) continue
        const repetidos = [...fallados[j]].filter((t) => rubrosPlan.has(t))
        let razon = 'En meta'
        let pasa = true
        if (v.critico) {
          pasa = false
          razon = 'Error crítico'
        } else if (v.puntaje !== null && v.puntaje < meta - 1e-9) {
          pasa = false
          razon = 'Debajo de la meta'
        } else if (repetidos.length) {
          pasa = false
          razon = 'Repite el mismo rubro'
        }
        verificaciones.push({ ev: v, pasa, razon })
        if (!pasa) break
      }
      let criticoEn30 = false
      if (nivel === 3) {
        const limite = sumarDias(ev.fechaEvaluacion, 30)
        for (let j = i + 1; j < grupo.length && grupo[j].fechaEvaluacion <= limite; j++) {
          if (grupo[j].fechaEvaluacion > ev.fechaEvaluacion && grupo[j].critico) criticoEn30 = true
        }
      }

      const documentos = (docsPorEval.get(ev.id) ?? []).filter((d) => !d.anulado)
      let accionFecha: string | null = null
      let accionOrigen: Plan['accionOrigen'] = null
      const considerar = (fecha: string | undefined | null, origen: Plan['accionOrigen']) => {
        if (!fecha) return
        const f = diaLocal(fecha)
        if (!accionFecha || f < accionFecha) {
          accionFecha = f
          accionOrigen = origen
        }
      }
      considerar(seguimiento?.accionRealizada, 'manual')
      const docAccion = documentos.find((d) => d.tipo === DOC_ACCION[nivel])
      considerar(docAccion?.firmas?.[FIRMA_ACCION[DOC_ACCION[nivel]]]?.fecha, 'documento')
      if (nivel <= 2) considerar(ev.feedback?.fecha, 'feedback')

      const fallida = verificaciones.find((v) => !v.pasa)
      let estado: EstadoPlan
      let fechaCierre: string | null = null
      let sucesorId: string | null = null
      if (seguimiento?.cierreManual) {
        estado = 'cerrado'
        fechaCierre = diaLocal(seguimiento.cierreManual.fecha)
      } else if (fallida || criticoEn30) {
        estado = 'reincide'
        sucesorId = fallida?.ev.id ?? null
        fechaCierre = fallida?.ev.fechaEvaluacion ?? null
      } else if (nivel < 4 && verificaciones.length >= 3) {
        estado = 'cerrado'
        fechaCierre = verificaciones[2].ev.fechaEvaluacion
      } else if (!accionFecha) {
        estado = hoy > compromiso ? 'vencido' : 'pendiente'
      } else {
        estado = 'verificacion'
      }
      if ((estado === 'pendiente' || estado === 'vencido') && ev.origen?.tipo === 'excel' && !seguimiento && !documentos.length && !ev.feedback) {
        estado = 'historico'
      }
      const docsRequeridos = DOCS_POR_NIVEL[nivel] ?? []
      const plan: Plan = {
        ...base,
        id: ev.id,
        ruta,
        compromiso,
        diasParaCompromiso: diasEntre(hoy, compromiso),
        accionFecha,
        accionOrigen,
        verificaciones,
        estado,
        sucesorId,
        fechaCierre,
        diasAbiertos: Math.max(0, diasEntre(ev.fechaEvaluacion, fechaCierre ?? hoy)),
        seguimiento,
        documentos,
        docsRequeridos,
        docsFaltantes: docsRequeridos.filter((t) => !documentos.some((d) => d.tipo === t)),
      }
      planes.push(plan)
      planPorEval.set(ev.id, plan)
    })
  }
  planes.sort((a, b) => b.ev.fechaEvaluacion.localeCompare(a.ev.fechaEvaluacion) || b.ev.creadoEn.localeCompare(a.ev.creadoEn))
  const res: Derivados = { planes, info, planPorEval, ordenadas }
  porHoy.set(hoy, res)
  return res
}

export function planAbierto(p: Plan): boolean {
  return p.estado === 'pendiente' || p.estado === 'verificacion' || p.estado === 'vencido'
}

export function nivelVigente(planes: Plan[], agenteId: string): Plan | null {
  let mejor: Plan | null = null
  for (const p of planes) {
    if (p.ev.agenteId !== agenteId || !planAbierto(p)) continue
    if (!mejor || p.nivel > mejor.nivel || (p.nivel === mejor.nivel && p.ev.fechaEvaluacion > mejor.ev.fechaEvaluacion)) mejor = p
  }
  return mejor
}
