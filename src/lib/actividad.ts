import { ClipboardList, FileSignature, Gauge, Settings, Target, Users, type LucideIcon } from 'lucide-react'
import type { Actividad, DB } from './types'
import { abrirPanel, ir } from './router'

export type CategoriaActividad = 'evaluaciones' | 'planes' | 'documentos' | 'personas' | 'operacion' | 'configuracion'

export const NOMBRE_CATEGORIA_ACTIVIDAD: Record<CategoriaActividad, string> = {
  evaluaciones: 'Evaluaciones y feedback',
  planes: 'Planes de acción',
  documentos: 'Documentos y firmas',
  personas: 'Ejecutivos y analistas',
  operacion: 'Operación (bases, tiempos, KPIs, calibraciones)',
  configuracion: 'Configuración y datos',
}

export const ICONO_ACTIVIDAD: Record<CategoriaActividad, LucideIcon> = {
  evaluaciones: ClipboardList,
  planes: Target,
  documentos: FileSignature,
  personas: Users,
  operacion: Gauge,
  configuracion: Settings,
}

export function categoriaActividad(a: Actividad): CategoriaActividad {
  const t = a.ref?.tipo ?? ''
  if (t === 'documento' || /^Documento|^Firma/.test(a.accion)) return 'documentos'
  if (t === 'plan' || /^Plan|^Causa raíz|^Acción del plan/.test(a.accion)) return 'planes'
  if (t === 'evaluacion' || /^Evaluación|^Importación|^Feedback/.test(a.accion)) return 'evaluaciones'
  if (t === 'agente' || t === 'analista' || /^Ejecutivo|^Analista|^Dictamen/.test(a.accion)) return 'personas'
  if (['base', 'tiempo', 'tarea', 'kpi', 'parametro', 'calibracion'].includes(t) || /^Base|^Correo|^Registro de base|^Tiempo|^KPI|^Parámetro|^Calibración/.test(a.accion)) return 'operacion'
  return 'configuracion'
}

export function destinoActividad(a: Actividad, db: DB): (() => void) | null {
  const r = a.ref
  if (!r) return null
  switch (r.tipo) {
    case 'evaluacion':
      return db.evaluaciones.some((e) => e.id === r.id) ? () => abrirPanel('ev', r.id) : null
    case 'plan':
      return db.evaluaciones.some((e) => e.id === r.id) ? () => abrirPanel('plan', r.id) : null
    case 'documento':
      return db.documentos.some((d) => d.id === r.id) ? () => abrirPanel('doc', r.id) : null
    case 'agente':
      return db.agentes.some((x) => x.id === r.id) ? () => abrirPanel('ag', r.id) : null
    case 'analista':
      return db.analistas.some((x) => x.id === r.id) ? () => abrirPanel('an', r.id) : null
    case 'base':
      return () => ir('operacion', { sub: 'bases' })
    case 'tiempo':
    case 'tarea':
      return () => ir('operacion', { sub: 'tiempos' })
    case 'kpi':
      return () => ir('operacion', { sub: 'kpis' })
    case 'parametro':
      return () => ir('operacion', { sub: 'parametros' })
    case 'calibracion':
      return () => ir('operacion', { sub: 'calibraciones' })
    default:
      return null
  }
}

export function historialDe(db: DB, refs: { tipo: string; id: string }[]): Actividad[] {
  const claves = new Set(refs.map((r) => `${r.tipo}:${r.id}`))
  return db.actividad.filter((a) => a.ref && claves.has(`${a.ref.tipo}:${a.ref.id}`))
}
