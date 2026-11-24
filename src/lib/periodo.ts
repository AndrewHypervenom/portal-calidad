import type { Canal, Evaluacion } from './types'
import { claveMes, mesAnterior, nombreMesCapital, primerDiaMes, sumarDias, ultimoDiaMes, fechaMedia, diasEntre } from './dates'

export type Periodo =
  | { tipo: 'mes'; mes: string }
  | { tipo: 'dias'; dias: number }
  | { tipo: 'anio'; anio: number }
  | { tipo: 'todo' }
  | { tipo: 'rango'; desde: string; hasta: string }

export type FiltroCanal = 'todos' | Canal

export interface Rango {
  desde: string
  hasta: string
  etiqueta: string
  anterior: { desde: string; hasta: string; etiqueta: string } | null
  mes: string | null
}

export function resolverPeriodo(p: Periodo, hoy: string, minFecha = '2000-01-01'): Rango {
  switch (p.tipo) {
    case 'mes': {
      const ant = mesAnterior(p.mes)
      return {
        desde: primerDiaMes(p.mes),
        hasta: ultimoDiaMes(p.mes),
        etiqueta: nombreMesCapital(p.mes),
        anterior: { desde: primerDiaMes(ant), hasta: ultimoDiaMes(ant), etiqueta: nombreMesCapital(ant) },
        mes: p.mes,
      }
    }
    case 'dias': {
      const desde = sumarDias(hoy, -(p.dias - 1))
      return {
        desde,
        hasta: hoy,
        etiqueta: `Últimos ${p.dias} días`,
        anterior: { desde: sumarDias(desde, -p.dias), hasta: sumarDias(desde, -1), etiqueta: `${p.dias} días previos` },
        mes: null,
      }
    }
    case 'anio':
      return {
        desde: `${p.anio}-01-01`,
        hasta: `${p.anio}-12-31`,
        etiqueta: `Año ${p.anio}`,
        anterior: { desde: `${p.anio - 1}-01-01`, hasta: `${p.anio - 1}-12-31`, etiqueta: `Año ${p.anio - 1}` },
        mes: null,
      }
    case 'rango': {
      const n = diasEntre(p.desde, p.hasta) + 1
      return {
        desde: p.desde,
        hasta: p.hasta,
        etiqueta: `${fechaMedia(p.desde)} – ${fechaMedia(p.hasta)}`,
        anterior: { desde: sumarDias(p.desde, -n), hasta: sumarDias(p.desde, -1), etiqueta: 'periodo previo' },
        mes: p.desde.slice(0, 7) === p.hasta.slice(0, 7) && p.desde.endsWith('-01') && p.hasta === ultimoDiaMes(p.desde.slice(0, 7)) ? p.desde.slice(0, 7) : null,
      }
    }
    default:
      return { desde: minFecha, hasta: '2999-12-31', etiqueta: 'Todo el historial', anterior: null, mes: null }
  }
}

export function mesesConDatos(evals: Evaluacion[]): string[] {
  return [...new Set(evals.map((e) => claveMes(e.fechaEvaluacion)))].sort().reverse()
}

export function periodoInicial(evals: Evaluacion[], hoy: string): Periodo {
  const meses = mesesConDatos(evals)
  const actual = claveMes(hoy)
  if (meses.includes(actual) || meses.length === 0) return { tipo: 'mes', mes: actual }
  return { tipo: 'mes', mes: meses[0] }
}

export function filtrar(evals: Evaluacion[], desde: string, hasta: string, canal: FiltroCanal): Evaluacion[] {
  return evals.filter((e) => e.fechaEvaluacion >= desde && e.fechaEvaluacion <= hasta && (canal === 'todos' || e.canal === canal))
}

export function claveTexto(p: Periodo): string {
  switch (p.tipo) {
    case 'mes':
      return `mes:${p.mes}`
    case 'dias':
      return `dias:${p.dias}`
    case 'anio':
      return `anio:${p.anio}`
    case 'rango':
      return `rango:${p.desde}:${p.hasta}`
    default:
      return 'todo'
  }
}

export function deClaveTexto(t: string | null | undefined): Periodo | null {
  if (!t) return null
  const [tipo, a, b] = t.split(':')
  if (tipo === 'mes' && /^\d{4}-\d{2}$/.test(a)) return { tipo: 'mes', mes: a }
  if (tipo === 'dias' && Number(a) > 0) return { tipo: 'dias', dias: Number(a) }
  if (tipo === 'anio' && Number(a) > 2000) return { tipo: 'anio', anio: Number(a) }
  if (tipo === 'rango' && a && b) return { tipo: 'rango', desde: a, hasta: b }
  if (tipo === 'todo') return { tipo: 'todo' }
  return null
}
