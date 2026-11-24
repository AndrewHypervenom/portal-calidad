import type { Calibracion, DB, KpiDef } from './types'
import type { Derivados } from './plans'
import { fechaFeedback, limiteFeedback, tieneHallazgo } from './plans'
import { diaLocal, diasHabiles, fechaCorta, hoyIso, primerDiaMes, ultimoDiaMes } from './dates'
import { promedio } from './analytics'
import { calificarEvaluacion } from './scoring'
import { num, pct } from './format'

export function desviacionCalibracion(c: Calibracion): number | null {
  const v = Object.values(c.puntajes ?? {}).filter((x) => typeof x === 'number' && !Number.isNaN(x))
  if (v.length < 2) return null
  return Math.round((Math.max(...v) - Math.min(...v)) * 1000) / 10
}

export type EstadoKpi = 'CUMPLE' | 'EN RIESGO' | 'NO CUMPLE'

export interface ResultadoKpi {
  def: KpiDef
  valor: number | null
  fuente: 'auto' | 'manual' | 'sin-dato'
  detalle: string
  cumplimiento: number | null
  estado: EstadoKpi | null
}

export function cumplimiento(def: KpiDef, real: number): number {
  if (def.sentido === 'mayor') return def.meta === 0 ? 1 : real / def.meta
  if (real <= def.meta) return 1
  if (real === 0) return 1
  if (def.meta === 0) return 0
  return def.meta / real
}

export function estadoKpi(c: number): EstadoKpi {
  if (c >= 1 - 1e-9) return 'CUMPLE'
  if (c >= 0.9) return 'EN RIESGO'
  return 'NO CUMPLE'
}

export function formatoKpi(def: KpiDef, v: number | null): string {
  if (v === null) return '—'
  if (def.unidad === 'pct') return pct(v)
  if (def.unidad === 'pts') return `${num(v, 1)} pts`
  return num(v)
}

export function calcularKpis(db: DB, mes: string, derivados: Derivados, hoy = hoyIso()): ResultadoKpi[] {
  const desde = primerDiaMes(mes)
  const hasta = ultimoDiaMes(mes)
  const corte = hoy < hasta ? hoy : hasta
  const evals = db.evaluaciones.filter((e) => e.fechaEvaluacion >= desde && e.fechaEvaluacion <= hasta)
  const p = db.operacion.parametros
  const manual = db.operacion.kpisManual[mes] ?? {}
  const habiles = diasHabiles(desde, corte)

  const auto: Record<string, { valor: number | null; detalle: string }> = {}

  const esperadas = (p.metaAudDia || 0) * habiles
  auto.metaAuditorias = {
    valor: esperadas ? evals.length / esperadas : null,
    detalle: `${num(evals.length)} auditorías de ${num(esperadas)} esperadas (${num(p.metaAudDia)} diarias × ${habiles} días hábiles${corte < hasta ? ' transcurridos' : ''})`,
  }

  for (const [id, tipo] of [['slaBases', 'base'], ['slaCorreos', 'correo']] as const) {
    const regs = db.operacion.bases.filter((b) => b.tipo === tipo && diaLocal(b.recibido) >= desde && diaLocal(b.recibido) <= hasta)
    const enTiempo = regs.filter((b) => b.respondido && new Date(b.respondido).getTime() - new Date(b.recibido).getTime() <= 24 * 3600 * 1000).length
    auto[id] = regs.length
      ? { valor: enTiempo / regs.length, detalle: `${enTiempo} de ${regs.length} ${tipo === 'base' ? 'bases' : 'correos'} respondidos en 24 h` }
      : { valor: null, detalle: `Sin ${tipo === 'base' ? 'bases' : 'correos'} registrados en el mes` }
  }

  const activos = db.agentes.filter((a) => a.activo)
  const conteo = new Map<string, number>()
  for (const e of evals) conteo.set(e.agenteId, (conteo.get(e.agenteId) ?? 0) + 1)
  const cubiertos = activos.filter((a) => (conteo.get(a.id) ?? 0) >= 4).length
  auto.cobertura = activos.length
    ? { valor: cubiertos / activos.length, detalle: `${cubiertos} de ${activos.length} ejecutivos activos con 4 o más auditorías` }
    : { valor: null, detalle: 'Sin ejecutivos activos' }

  const retros = db.documentos.filter((d) => d.tipo === 'retro')
  const conHallazgo = evals.filter((e) => tieneHallazgo(e) && (e.origen?.tipo !== 'excel' || fechaFeedback(e, retros)))
  let conRegistro = 0
  let oportunos = 0
  let evaluables = 0
  for (const e of conHallazgo) {
    const limite = limiteFeedback(e)
    const f = fechaFeedback(e, retros)
    if (f) conRegistro++
    if (f || limite < hoy) {
      evaluables++
      if (f && f <= limite) oportunos++
    }
  }
  auto.feedbackOportuno = conRegistro && evaluables
    ? { valor: oportunos / evaluables, detalle: `${oportunos} de ${evaluables} evaluaciones con hallazgo recibieron feedback a tiempo` }
    : { valor: null, detalle: 'Aún no hay feedback registrado en el mes (márcalo al firmar la retroalimentación)' }

  const planesMes = derivados.planes.filter((pl) => pl.ev.fechaEvaluacion >= desde && pl.ev.fechaEvaluacion <= hasta)
  const agentesConPlan = new Set(planesMes.map((pl) => pl.ev.agenteId))
  const agentesReinciden = new Set(planesMes.filter((pl) => pl.reincidencia > 0).map((pl) => pl.ev.agenteId))
  auto.reincidencia = agentesConPlan.size
    ? { valor: agentesReinciden.size / agentesConPlan.size, detalle: `${agentesReinciden.size} de ${agentesConPlan.size} ejecutivos con plan repitieron un rubro en 30 días` }
    : { valor: null, detalle: 'Sin planes de acción en el mes' }

  const vencen = derivados.planes.filter((pl) => pl.estado !== 'historico' && pl.compromiso >= desde && pl.compromiso <= hasta && pl.compromiso <= hoy)
  const conAccion = vencen.filter((pl) => pl.accionFecha)
  const aTiempo = vencen.filter((pl) => pl.accionFecha && pl.accionFecha <= pl.compromiso).length
  auto.planesATiempo = vencen.length && conAccion.length
    ? { valor: aTiempo / vencen.length, detalle: `${aTiempo} de ${vencen.length} planes con la acción realizada antes de la fecha compromiso` }
    : { valor: null, detalle: vencen.length ? 'Aún no se registran acciones realizadas en los planes del mes' : 'Sin planes que venzan en el mes' }

  const prom = promedio(evals.map((e) => e.puntaje))
  auto.calidadPromedio = { valor: prom, detalle: `${num(evals.length)} auditorías del mes` }
  const conCritico = evals.filter((e) => e.critico)
  const criticos = conCritico.reduce((s, e) => s + Math.max(1, calificarEvaluacion(e, db.catalogo).criticos.length), 0)
  auto.erroresCriticos = {
    valor: evals.length ? criticos : null,
    detalle: `${criticos} error${criticos === 1 ? '' : 'es'} crítico${criticos === 1 ? '' : 's'} en ${conCritico.length} evaluaci${conCritico.length === 1 ? 'ón' : 'ones'} (Inbound + Monitoreo)`,
  }

  const minutos = db.operacion.tiempos.filter((t) => t.fecha >= desde && t.fecha <= hasta).reduce((s, t) => s + (t.minutos || 0), 0)
  const disponibles = (p.horasJornada || 0) * (p.pctEfectiva || 0) * habiles * (p.nAnalistas || 0)
  auto.ocupacion = minutos && disponibles
    ? { valor: minutos / 60 / disponibles, detalle: `${num(minutos / 60, 1)} h registradas de ${num(disponibles, 1)} h productivas disponibles` }
    : { valor: null, detalle: 'Sin registros en la toma de tiempos del mes' }

  const calibraciones = (db.operacion.calibraciones ?? [])
    .filter((c) => c.fecha >= desde && c.fecha <= hasta)
    .map((c) => ({ c, d: desviacionCalibracion(c) }))
    .filter((x): x is { c: Calibracion; d: number } => x.d !== null)
    .sort((a, b) => a.c.fecha.localeCompare(b.c.fecha))
  if (calibraciones.length) {
    const peor = calibraciones.reduce((m, x) => (x.d > m.d ? x : m))
    const ultima = calibraciones[calibraciones.length - 1]
    auto.calibracion = {
      valor: peor.d,
      detalle: `Mayor diferencia en ${calibraciones.length} calibración${calibraciones.length === 1 ? '' : 'es'} del mes (${peor.c.referencia || fechaCorta(peor.c.fecha)}); última ${fechaCorta(ultima.c.fecha)}: ${num(ultima.d, 1)} pts`,
    }
  } else auto.calibracion = { valor: null, detalle: 'Sin calibraciones registradas en el mes (Operación → Calibraciones)' }

  const dictaminados = db.agentes.filter((a) => a.dictamen && a.fechaDictamen && a.fechaDictamen >= desde && a.fechaDictamen <= hasta)
  const acreditan = dictaminados.filter((a) => a.dictamen === 'acredita').length
  auto.acreditan = dictaminados.length
    ? { valor: acreditan / dictaminados.length, detalle: `${acreditan} de ${dictaminados.length} nuevos ingresos con dictamen ACREDITA en el mes` }
    : { valor: null, detalle: 'Sin dictámenes del periodo de prueba en el mes (Operación → Equipo y nuevos ingresos)' }

  return db.operacionDef.kpis.map((def) => {
    const m = manual[def.id]
    const a = auto[def.id] ?? { valor: null, detalle: '' }
    const valor = m !== undefined ? m : a.valor
    const fuente: ResultadoKpi['fuente'] = m !== undefined ? 'manual' : a.valor !== null ? 'auto' : 'sin-dato'
    const c = valor === null ? null : cumplimiento(def, valor)
    return { def, valor, fuente, detalle: m !== undefined ? `Capturado manualmente · cálculo automático: ${formatoKpi(def, a.valor)}` : a.detalle, cumplimiento: c, estado: c === null ? null : estadoKpi(c) }
  })
}
