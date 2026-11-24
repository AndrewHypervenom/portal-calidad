import type { Agente, DB } from './types'
import type { Plan } from './plans'
import { planAbierto } from './plans'
import { semaforoAgentes, type EstadoAgente } from './analytics'
import { diasEntre, inicioSemana, sumarDias } from './dates'

export const EXTRA_POR_PLAN = 2
export const SEMANAS_EXTRA = 2

export interface FilaPlanSemanal {
  agente: Agente
  nuevo: boolean
  estado: EstadoAgente
  critico: boolean
  frecuencia: number
  extra: number
  objetivo: number
  hechas: number
  pendientes: number
  ultima: string
  plan: Plan | null
}

export interface PlanSemanal {
  lunes: string
  domingo: string
  filas: FilaPlanSemanal[]
  pendientes: number
  agentesPendientes: number
  rojosPendientes: number
}

const ORDEN: Record<EstadoAgente, number> = { rojo: 0, amarillo: 1, 'sin-dato': 2, verde: 3 }

export function esNuevoIngreso(a: Agente, hoy: string): boolean {
  if (!a.fechaIngreso) return false
  const d = diasEntre(a.fechaIngreso, hoy)
  return d >= 0 && d <= 60
}

export function planSemanal(db: DB, planes: Plan[], hoy: string): PlanSemanal {
  const p = db.operacion.parametros
  const lunes = inicioSemana(hoy)
  const domingo = sumarDias(lunes, 6)
  const semaforos = semaforoAgentes(db.evaluaciones, db.agentes, hoy, db.config)
  const conteo = new Map<string, { hechas: number; ultima: string }>()
  for (const e of db.evaluaciones) {
    const x = conteo.get(e.agenteId) ?? { hechas: 0, ultima: '' }
    if (e.fechaEvaluacion >= lunes && e.fechaEvaluacion <= domingo) x.hechas++
    if (e.fechaEvaluacion > x.ultima) x.ultima = e.fechaEvaluacion
    conteo.set(e.agenteId, x)
  }
  const planVigente = new Map<string, Plan>()
  for (const pl of planes) {
    if (!planAbierto(pl)) continue
    const actual = planVigente.get(pl.ev.agenteId)
    if (!actual || pl.nivel > actual.nivel || (pl.nivel === actual.nivel && pl.ev.fechaEvaluacion > actual.ev.fechaEvaluacion)) planVigente.set(pl.ev.agenteId, pl)
  }
  const filas: FilaPlanSemanal[] = db.agentes
    .filter((a) => a.activo)
    .map((a) => {
      const nuevo = esNuevoIngreso(a, hoy)
      const s = semaforos.get(a.id)
      const estado = s?.estado ?? 'sin-dato'
      const frecuencia = nuevo ? p.freqNuevo : estado === 'rojo' ? p.freqRojo : estado === 'amarillo' ? p.freqAmarillo : p.freqVerde
      const plan = planVigente.get(a.id) ?? null
      const extra = plan && plan.nivel >= 2 && diasEntre(plan.ev.fechaEvaluacion, hoy) < SEMANAS_EXTRA * 7 ? EXTRA_POR_PLAN : 0
      const objetivo = Math.ceil(frecuencia || 0) + extra
      const c = conteo.get(a.id) ?? { hechas: 0, ultima: '' }
      return { agente: a, nuevo, estado, critico: !!s?.criticosMes, frecuencia, extra, objetivo, hechas: c.hechas, pendientes: Math.max(0, objetivo - c.hechas), ultima: c.ultima, plan }
    })
    .sort((x, y) => y.pendientes - x.pendientes || ORDEN[x.estado] - ORDEN[y.estado] || (y.plan?.nivel ?? 0) - (x.plan?.nivel ?? 0) || (x.ultima || '0').localeCompare(y.ultima || '0'))
  const conPendientes = filas.filter((f) => f.pendientes > 0)
  return {
    lunes,
    domingo,
    filas,
    pendientes: conPendientes.reduce((s, f) => s + f.pendientes, 0),
    agentesPendientes: conPendientes.length,
    rojosPendientes: conPendientes.filter((f) => f.estado === 'rojo' || (f.plan?.nivel ?? 0) >= 3).length,
  }
}
