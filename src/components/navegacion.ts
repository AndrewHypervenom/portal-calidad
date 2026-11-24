import { BarChart3, BookOpen, ClipboardCheck, Gauge, History, Home, ListChecks, Settings, Target, Users, type LucideIcon } from 'lucide-react'
import type { Rol } from '../lib/supabase'

export interface Pagina {
  id: string
  titulo: string
  corto: string
  descripcion: string
  icono: LucideIcon
  palabras?: string
  movil?: boolean
  roles?: Rol[]
}

export const PAGINAS: Pagina[] = [
  { id: 'inicio', titulo: 'Resumen', corto: 'Resumen', descripcion: 'Indicadores clave, alertas, tendencias y a quién atender', icono: Home, palabras: 'inicio tablero dashboard kpi alertas pendientes', movil: true },
  { id: 'evaluar', titulo: 'Nueva evaluación', corto: 'Evaluar', descripcion: 'Calificar una llamada con la cédula', icono: ClipboardCheck, palabras: 'evaluar cedula calificar monitoreo inbound auditoria', movil: true },
  { id: 'evaluaciones', titulo: 'Evaluaciones', corto: 'Historial', descripcion: 'Todas las auditorías (antes: hoja Acumulado)', icono: ListChecks, palabras: 'acumulado historial folios auditorias', movil: true },
  { id: 'equipo', titulo: 'Equipo', corto: 'Equipo', descripcion: 'Ejecutivos y analistas de calidad', icono: Users, palabras: 'ejecutivos agentes analistas desempeño', movil: true },
  { id: 'seguimiento', titulo: 'Planes y actas', corto: 'Planes', descripcion: 'Planes de acción, retroalimentación, cartas y actas', icono: Target, palabras: 'plan accion reincidencia actas carta compromiso retroalimentacion firmas', movil: true },
  { id: 'analisis', titulo: 'Análisis', corto: 'Análisis', descripcion: 'Resultados por cédula, rubro, semana y motivo', icono: BarChart3, palabras: 'resultados reportes errores rubros cedulas semana' },
  { id: 'operacion', titulo: 'Operación de calidad', corto: 'Operación', descripcion: 'Capacidad, muestreo por riesgo, KPIs, calibraciones y tiempos del equipo', icono: Gauge, palabras: 'capacidad dimensionamiento muestreo kpis tiempos parametros calibracion nuevos ingresos dictamen' },
  { id: 'guia', titulo: 'Guía', corto: 'Guía', descripcion: 'Cédulas, criterios, errores críticos y ruta antirreincidencia', icono: BookOpen, palabras: 'cedulas descriptor criterios ayuda modelo' },
  { id: 'bitacora', titulo: 'Bitácora', corto: 'Bitácora', descripcion: 'Historial de cambios: quién hizo qué y cuándo', icono: History, palabras: 'historial cambios actividad registro auditoria log quien firmas', roles: ['admin']  },
  { id: 'ajustes', titulo: 'Ajustes', corto: 'Ajustes', descripcion: 'Parámetros, catálogos, ejecutivos y datos', icono: Settings, palabras: 'configuracion respaldo importar excel catalogo', roles: ['admin'] },
]

export function paginasPara(rol: Rol | undefined): Pagina[] {
  return PAGINAS.filter((p) => !p.roles || (!!rol && p.roles.includes(rol)))
}

export function puedeVer(id: string, rol: Rol | undefined): boolean {
  return paginasPara(rol).some((p) => p.id === id)
}
