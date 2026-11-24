import type { RegistroTiempo, TareaDef } from './types'
import { num, pct } from './format'

export type Parametros = Record<string, number>

const f1 = (v: number) => num(v, 1)
const f0 = (v: number) => num(v, 0)
const f2 = (v: number) => num(v, 2)

export function agentesActivos(p: Parametros) {
  return (p.agMonitoreo || 0) + (p.agInbound || 0)
}

function volumen(id: string, p: Parametros, unidad: string): { v: number; texto: string } {
  const ag = agentesActivos(p)
  const calibracionesMes = (p.calibracionesSem || 0) * (p.semanasMes || 0)
  const r = (v: number, texto: string) => ({ v, texto: `${texto} = ${f1(v)} ${unidad}` })
  switch (id) {
    case 'T01': return r(p.metaAudDia * p.diasMes, `${f0(p.metaAudDia)} auditorías/día × ${f0(p.diasMes)} días hábiles`)
    case 'T02': return r(p.basesSemana * p.semanasMes * p.casosBaseProm, `${f2(p.basesSemana)} bases/semana × ${f2(p.semanasMes)} semanas × ${f2(p.casosBaseProm)} casos/base`)
    case 'T03': return r(p.basesSemana * p.semanasMes, `${f2(p.basesSemana)} bases/semana × ${f2(p.semanasMes)} semanas`)
    case 'T04': return r(p.correosDia * p.diasMes * p.casosCorreoProm, `${f2(p.correosDia)} correos/día × ${f0(p.diasMes)} días hábiles × ${f2(p.casosCorreoProm)} casos/correo`)
    case 'T05': return r(p.correosDia * p.diasMes, `${f2(p.correosDia)} correos/día × ${f0(p.diasMes)} días hábiles`)
    case 'T06': return r(ag * p.pctRojo * p.audVerifMes, `${f0(ag)} agentes × ${pct(p.pctRojo)} en rojo × ${f0(p.audVerifMes)} aud. verificación/agente`)
    case 'T07': return r(calibracionesMes, `${f1(calibracionesMes)} calibraciones/mes (${f0(p.calibracionesSem)} por semana × semanas)`)
    case 'T08': return r(ag * p.feedbackAgMes, `${f0(ag)} agentes × ${f0(p.feedbackAgMes)} feedback/agente`)
    case 'T09': return r(ag * p.pctRojo * p.refuerzoIndMes, `${f0(ag)} agentes × ${pct(p.pctRojo)} en rojo × ${f0(p.refuerzoIndMes)} refuerzos/agente`)
    case 'T10': return r(p.refuerzoGrupalSem * p.semanasMes, `${f0(p.refuerzoGrupalSem)} refuerzos grupales/semana × ${f2(p.semanasMes)} semanas`)
    case 'T11': return r(ag * p.semanasMes, `${f0(ag)} agentes × ${f2(p.semanasMes)} semanas`)
    case 'T12': return r(p.diasMes, `${f0(p.diasMes)} días hábiles`)
    case 'T13': return r(p.semanasMes, `${f2(p.semanasMes)} semanas`)
    case 'T14': return r(1, '1 vez al mes')
    case 'T15': return r(p.diasMes, `${f0(p.diasMes)} días hábiles`)
    case 'T16': return r(p.circularesMes, `${f0(p.circularesMes)} circulares/mes`)
    case 'T17': return r(p.circularesMes * ag, `${f0(p.circularesMes)} circulares/mes × ${f0(ag)} agentes`)
    case 'T18': return r(p.circularesMes, `${f0(p.circularesMes)} circulares/mes`)
    case 'T19':
    case 'T20':
    case 'T21':
    case 'T22': return r(p.cohortesMes, `${f0(p.cohortesMes)} cohortes`)
    case 'T23': return r(p.ingresosMes * p.audNesting, `${f0(p.ingresosMes)} nuevos ingresos × ${f0(p.audNesting)} auditorías de nesting`)
    case 'T24': return r(p.ingresosMes * p.fbNesting, `${f0(p.ingresosMes)} nuevos ingresos × ${f0(p.fbNesting)} feedback de nesting`)
    case 'T25': return r(p.ingresosMes * 3, `${f0(p.ingresosMes)} nuevos ingresos × 3 cortes de evaluación`)
    case 'T26': return r(p.ingresosMes, `${f0(p.ingresosMes)} nuevos ingresos`)
    default: return { v: 0, texto: 'Sin fórmula' }
  }
}

export interface ResultadoTarea {
  def: TareaDef
  volumen: number
  textoVolumen: string
  minEstandar: number
  mediciones: number
  minReal: number | null
  minAplicado: number
  usaReal: boolean
  horas: number
  textoHoras: string
  pct: number
}

export type EstadoEquipo = 'SOSTENIBLE' | 'AL LÍMITE' | 'SOBRECARGA'

export interface ModeloCapacidad {
  tareas: ResultadoTarea[]
  demanda: number
  capacidadAnalista: number
  capacidadEquipo: number
  ocupacion: number
  diferencia: number
  demandaAnalista: number
  demandaDia: number
  horasLibres: number
  estado: EstadoEquipo
  porCategoria: { categoria: string; horas: number; pct: number }[]
  sla: { promedio: Sla; pico: Sla }
  conclusion: string
}

export interface Sla {
  casos: number
  horas: number
  pctJornada: number
  analistas: number
}

export function estadoOcupacion(ocupacion: number, objetivo: number): EstadoEquipo {
  if (ocupacion > 1) return 'SOBRECARGA'
  if (ocupacion > objetivo) return 'AL LÍMITE'
  return 'SOSTENIBLE'
}

export function calcularCapacidad(p: Parametros, tareas: TareaDef[], tareasMin: Record<string, number>, tiempos: RegistroTiempo[]): ModeloCapacidad {
  const minMed = p.minMediciones || 5
  const filas: ResultadoTarea[] = tareas.map((def) => {
    const { v, texto } = volumen(def.id, p, def.unidad)
    const minEstandar = tareasMin[def.id] ?? def.minEstandar
    const regs = tiempos.filter((t) => t.tareaId === def.id && t.minutos > 0)
    const sumMin = regs.reduce((s, t) => s + t.minutos, 0)
    const sumCant = regs.reduce((s, t) => s + (t.cantidad || 0), 0)
    const minReal = regs.length && sumCant > 0 ? sumMin / sumCant : null
    const usaReal = regs.length >= minMed && (minReal ?? 0) > 0
    const minAplicado = usaReal ? (minReal as number) : minEstandar
    const factor = def.id === 'T07' ? p.asistCalibracion || 1 : 1
    const horas = (v * minAplicado) / 60 * factor
    const textoHoras = `${f1(v)} ${def.unidad} × ${f0(minAplicado)} min ÷ 60${def.id === 'T07' ? ` × ${f0(factor)} analistas` : ''} = ${f1(horas)} h`
    return { def, volumen: v, textoVolumen: texto, minEstandar, mediciones: regs.length, minReal, minAplicado, usaReal, horas, textoHoras, pct: 0 }
  })
  const demanda = filas.reduce((s, t) => s + t.horas, 0)
  for (const t of filas) t.pct = demanda ? t.horas / demanda : 0
  const capacidadAnalista = p.horasJornada * p.pctEfectiva * p.diasMes
  const capacidadEquipo = capacidadAnalista * p.nAnalistas
  const ocupacion = capacidadEquipo ? demanda / capacidadEquipo : 0
  const demandaAnalista = p.nAnalistas ? demanda / p.nAnalistas : 0
  const demandaDia = p.diasMes ? demandaAnalista / p.diasMes : 0
  const horasLibres = capacidadAnalista * p.ocupObj - demandaAnalista
  const estado = estadoOcupacion(ocupacion, p.ocupObj)
  const categorias = new Map<string, number>()
  for (const t of filas) categorias.set(t.def.categoria, (categorias.get(t.def.categoria) ?? 0) + t.horas)
  const porCategoria = [...categorias.entries()].map(([categoria, horas]) => ({ categoria, horas, pct: demanda ? horas / demanda : 0 }))

  const t02 = filas.find((t) => t.def.id === 'T02')?.minAplicado ?? 15
  const t03 = filas.find((t) => t.def.id === 'T03')?.minAplicado ?? 20
  const sla = (casos: number): Sla => {
    const horas = (casos * t02) / 60 + t03 / 60
    const pctJornada = horas / (p.horasJornada * p.pctEfectiva)
    return { casos, horas, pctJornada, analistas: Math.ceil(pctJornada - 1e-9) }
  }
  const pico = sla(p.casosBasePico)
  const conclusion =
    `Con ${f0(p.nAnalistas)} analistas de calidad la demanda del mes es de ${f1(demanda)} h contra ${f1(capacidadEquipo)} h de capacidad productiva: ` +
    `ocupación de ${pct(ocupacion, 0)} (${estado}). Cada analista carga ${f1(demandaAnalista)} h al mes (${f1(demandaDia)} h por día) y le quedan ` +
    `${f1(horasLibres)} h libres antes de pasar el ${pct(p.ocupObj, 0)} de ocupación. En un día con base pico (${f0(p.casosBasePico)} casos) se necesita dedicar ` +
    `${pico.analistas} analista(s) a la base.` +
    (ocupacion > p.ocupObj ? ' Para bajar la carga ajusta la meta diaria o la política de feedback/refuerzos en los parámetros.' : '')

  return {
    tareas: filas,
    demanda,
    capacidadAnalista,
    capacidadEquipo,
    ocupacion,
    diferencia: demanda - capacidadEquipo,
    demandaAnalista,
    demandaDia,
    horasLibres,
    estado,
    porCategoria,
    sla: { promedio: sla(p.casosBaseProm), pico },
    conclusion,
  }
}

export interface Segmento {
  id: 'verde' | 'amarillo' | 'rojo' | 'nuevo'
  nombre: string
  criterio: string
  pct: number | null
  agentes: number
  frecuencia: number
  semana: number
  mes: number
}

export interface Muestreo {
  segmentos: Segmento[]
  totalAgentes: number
  totalSemana: number
  totalMes: number
  diarias: number
  meta: number
  libres: number
  cobertura: number
  repartoMonitoreo: number
  repartoInbound: number
  minimoMes: number
}

export function calcularMuestreo(p: Parametros, real?: { verde: number; amarillo: number; rojo: number; nuevos: number }): Muestreo {
  const total = agentesActivos(p)
  const seg = (id: Segmento['id'], nombre: string, criterio: string, pctV: number | null, agentes: number, frecuencia: number): Segmento => ({
    id, nombre, criterio, pct: pctV, agentes, frecuencia, semana: agentes * frecuencia, mes: agentes * frecuencia * p.semanasMes,
  })
  const pctVerde = 1 - p.pctRojo - p.pctAmarillo
  const segmentos = real
    ? [
        seg('verde', 'Verde', 'Calidad ≥ meta y sin errores críticos en el mes', null, real.verde, p.freqVerde),
        seg('amarillo', 'Amarillo', 'Calidad entre el umbral de rojo y la meta', null, real.amarillo, p.freqAmarillo),
        seg('rojo', 'Rojo', 'Calidad < umbral de rojo o cualquier error crítico', null, real.rojo, p.freqRojo),
        seg('nuevo', 'Nuevo ingreso (primeros 60 días)', 'Agentes en nesting y seguimiento intensivo', null, real.nuevos, p.freqNuevo),
      ]
    : [
        seg('verde', 'Verde', 'Calidad ≥ meta y sin errores críticos en el mes', pctVerde, Math.round(pctVerde * total), p.freqVerde),
        seg('amarillo', 'Amarillo', 'Calidad entre el umbral de rojo y la meta', p.pctAmarillo, Math.round(p.pctAmarillo * total), p.freqAmarillo),
        seg('rojo', 'Rojo', 'Calidad < umbral de rojo o cualquier error crítico', p.pctRojo, Math.round(p.pctRojo * total), p.freqRojo),
        seg('nuevo', 'Nuevo ingreso (primeros 60 días)', 'Agentes en nesting y seguimiento intensivo', null, p.ingresosMes, p.freqNuevo),
      ]
  const totalSemana = segmentos.reduce((s, x) => s + x.semana, 0)
  const diarias = totalSemana / 5
  const repartoMonitoreo = total ? Math.round((p.metaAudDia * p.agMonitoreo) / total) : 0
  return {
    segmentos,
    totalAgentes: segmentos.reduce((s, x) => s + x.agentes, 0),
    totalSemana,
    totalMes: segmentos.reduce((s, x) => s + x.mes, 0),
    diarias,
    meta: p.metaAudDia,
    libres: p.metaAudDia - diarias,
    cobertura: (p.metaAudDia * p.diasMes) / (total + p.ingresosMes || 1),
    repartoMonitoreo,
    repartoInbound: p.metaAudDia - repartoMonitoreo,
    minimoMes: Math.floor(Math.min(p.freqVerde, p.freqAmarillo, p.freqRojo, p.freqNuevo) * p.semanasMes),
  }
}

export function repartoEquipo(p: Parametros) {
  const total = agentesActivos(p) || 1
  const a1 = Math.ceil(p.agMonitoreo / 2)
  const a2 = p.agMonitoreo - a1
  const a3 = p.agInbound
  const d1 = Math.round((p.metaAudDia * a1) / total)
  const d2 = Math.round((p.metaAudDia * a2) / total)
  return [
    { agentes: a1, diarias: d1 },
    { agentes: a2, diarias: d2 },
    { agentes: a3, diarias: p.metaAudDia - d1 - d2 },
  ]
}
