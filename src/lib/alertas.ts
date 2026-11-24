import type { DB } from './types'
import type { Derivados } from './plans'
import { fechaFeedback, limiteFeedback, tieneHallazgo } from './plans'
import { planSemanal } from './muestreo'
import { calcularKpis } from './kpis'
import { camposFaltantes, estadoFirmas, NOMBRE_DOC } from '../documents/reglas'
import { claveMes, diaLocal, diasEntre, fechaCorta, fechaMedia, sumarDias } from './dates'
import { nombreCorto, num } from './format'

export type Gravedad = 'alta' | 'media' | 'baja'
export type CategoriaAlerta = 'planes' | 'feedback' | 'firmas' | 'auditorias' | 'bases' | 'kpis' | 'calibracion' | 'ingresos' | 'datos'

export type DestinoAlerta =
  | { tipo: 'panel'; panel: 'ev' | 'plan' | 'doc' | 'ag'; id: string }
  | { tipo: 'pagina'; pagina: string; sub?: string; params?: Record<string, string> }

export interface Alerta {
  id: string
  gravedad: Gravedad
  categoria: CategoriaAlerta
  titulo: string
  detalle: string
  fecha: string
  destino: DestinoAlerta
  accion: string
}

export const NOMBRE_CATEGORIA: Record<CategoriaAlerta, string> = {
  planes: 'Planes de acción',
  feedback: 'Feedback',
  firmas: 'Firmas de documentos',
  auditorias: 'Auditorías',
  bases: 'Bases y correos',
  kpis: 'KPIs',
  calibracion: 'Calibración',
  ingresos: 'Nuevos ingresos',
  datos: 'Datos y configuración',
}

const ORDEN_GRAVEDAD: Record<Gravedad, number> = { alta: 0, media: 1, baja: 2 }
export const DIAS_CALIBRACION = 15
const DIAS_FEEDBACK = 30

function enDias(d: number): string {
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  if (d === -1) return 'ayer'
  return d > 0 ? `en ${d} días` : `hace ${-d} días`
}

export function calcularAlertas(db: DB, derivados: Derivados, hoy: string, ahora: Date = new Date()): Alerta[] {
  const alertas: Alerta[] = []
  const add = (a: Alerta) => alertas.push(a)

  for (const p of derivados.planes) {
    const agente = nombreCorto(p.ev.agenteNombre)
    const rubro = p.fallas[0]?.topico ?? 'Calificación debajo de la meta'
    if (p.estado === 'vencido') {
      add({
        id: `plan-vencido:${p.id}`,
        gravedad: 'alta',
        categoria: 'planes',
        titulo: `Plan N${p.nivel} vencido · ${agente}`,
        detalle: `La fecha compromiso fue el ${fechaMedia(p.compromiso)} (${enDias(p.diasParaCompromiso)}) y no hay acción registrada. ${rubro}.`,
        fecha: p.compromiso,
        destino: { tipo: 'panel', panel: 'plan', id: p.id },
        accion: 'Atender plan',
      })
    } else if (p.estado === 'pendiente' && p.diasParaCompromiso <= 2) {
      add({
        id: `plan-por-vencer:${p.id}`,
        gravedad: 'media',
        categoria: 'planes',
        titulo: `Plan N${p.nivel} vence ${enDias(p.diasParaCompromiso)} · ${agente}`,
        detalle: `${p.ruta.nombre}: ${rubro}. Registra la acción antes del ${fechaMedia(p.compromiso)}.`,
        fecha: p.compromiso,
        destino: { tipo: 'panel', panel: 'plan', id: p.id },
        accion: 'Ver plan',
      })
    }
  }
  const historicos = derivados.planes.filter((p) => p.estado === 'historico').length
  if (historicos) {
    add({
      id: 'planes-historicos',
      gravedad: 'baja',
      categoria: 'planes',
      titulo: `${historicos} planes del Excel sin seguimiento`,
      detalle: 'Vienen de la migración sin registro de feedback ni acciones. Decide si los retomas para que entren a las alertas de vencimiento.',
      fecha: '9999',
      destino: { tipo: 'pagina', pagina: 'seguimiento', params: { estado: 'historico' } },
      accion: 'Revisar',
    })
  }

  const retros = db.documentos.filter((d) => d.tipo === 'retro')
  const desdeFeedback = sumarDias(hoy, -DIAS_FEEDBACK)
  for (const ev of db.evaluaciones) {
    if (ev.origen?.tipo === 'excel' || ev.fechaEvaluacion < desdeFeedback || !tieneHallazgo(ev)) continue
    const plan = derivados.planPorEval.get(ev.id)
    if (plan?.seguimiento?.cierreManual) continue
    if (fechaFeedback(ev, retros)) continue
    const limite = limiteFeedback(ev)
    const dias = diasEntre(hoy, limite)
    const agente = nombreCorto(ev.agenteNombre)
    add({
      id: `feedback:${ev.id}`,
      gravedad: dias < 0 ? 'alta' : 'media',
      categoria: 'feedback',
      titulo: dias < 0 ? `Feedback fuera de plazo · ${agente}` : `Feedback pendiente · ${agente}`,
      detalle: `${ev.folio} del ${fechaCorta(ev.fechaEvaluacion)}${ev.critico ? ' con error crítico (plazo 24 h)' : ' (plazo 48 h)'}: ${dias < 0 ? `venció ${enDias(dias)}` : `vence ${enDias(dias)}`}. Se registra al firmar el colaborador la retroalimentación.`,
      fecha: limite,
      destino: { tipo: 'panel', panel: 'ev', id: ev.id },
      accion: 'Dar feedback',
    })
  }

  const evPorId = new Map(db.evaluaciones.map((e) => [e.id, e]))
  for (const d of db.documentos) {
    if (d.anulado) continue
    const f = estadoFirmas(d)
    if (f.completo) continue
    const ev = evPorId.get(d.evaluacionId)
    const faltan = camposFaltantes(d, ev)
    const dias = diasEntre(diaLocal(d.creadoEn || hoy), hoy)
    const agente = nombreCorto(d.agenteNombre)
    add({
      id: `firmas:${d.id}`,
      gravedad: dias >= 2 ? 'alta' : 'media',
      categoria: 'firmas',
      titulo: `${NOMBRE_DOC[d.tipo]} por firmar · ${agente}`,
      detalle: `${d.folio}: ${f.firmadas} de ${f.total} firmas${dias > 0 ? `, generado ${enDias(-dias)}` : ', generado hoy'}.${faltan.length ? ` Falta llenar: ${faltan.map((x) => x.etiqueta).join(', ')}.` : ''}`,
      fecha: diaLocal(d.creadoEn || hoy),
      destino: { tipo: 'panel', panel: 'doc', id: d.id },
      accion: faltan.length ? 'Completar' : 'Firmar',
    })
  }

  const semana = planSemanal(db, derivados.planes, hoy)
  if (semana.pendientes > 0) {
    const diaSemana = diasEntre(semana.lunes, hoy)
    add({
      id: 'muestreo-semana',
      gravedad: diaSemana >= 3 && semana.rojosPendientes > 0 ? 'alta' : 'media',
      categoria: 'auditorias',
      titulo: `Faltan ${num(semana.pendientes)} auditorías del plan semanal`,
      detalle: `${num(semana.agentesPendientes)} ejecutivos sin su cuota de la semana (${fechaCorta(semana.lunes)} – ${fechaCorta(semana.domingo)})${semana.rojosPendientes ? `; ${semana.rojosPendientes} en rojo o con plan N3/N4` : ''}.`,
      fecha: semana.lunes,
      destino: { tipo: 'pagina', pagina: 'operacion', sub: 'muestreo' },
      accion: 'Ver a quién auditar',
    })
  }
  const mes = claveMes(hoy)
  if (Number(hoy.slice(8, 10)) >= 15) {
    const auditados = new Set(db.evaluaciones.filter((e) => claveMes(e.fechaEvaluacion) === mes).map((e) => e.agenteId))
    const sin = db.agentes.filter((a) => a.activo && !auditados.has(a.id))
    if (sin.length) {
      add({
        id: 'cobertura-mes',
        gravedad: 'media',
        categoria: 'auditorias',
        titulo: `${sin.length} ejecutivos activos sin auditoría este mes`,
        detalle: `Regla del muestreo: nadie cierra el mes sin auditorías. Por ejemplo: ${sin.slice(0, 3).map((a) => nombreCorto(a.nombre)).join(', ')}${sin.length > 3 ? '…' : ''}.`,
        fecha: `${mes}-15`,
        destino: { tipo: 'pagina', pagina: 'operacion', sub: 'muestreo' },
        accion: 'Ver muestreo',
      })
    }
  }

  for (const b of db.operacion.bases) {
    if (b.respondido) continue
    const recibido = new Date(b.recibido)
    if (Number.isNaN(recibido.getTime())) continue
    const horas = (ahora.getTime() - recibido.getTime()) / 3600000
    const restantes = 24 - horas
    add({
      id: `base:${b.id}`,
      gravedad: restantes <= 0 ? 'alta' : restantes <= 6 ? 'media' : 'baja',
      categoria: 'bases',
      titulo: restantes <= 0 ? `${b.tipo === 'correo' ? 'Correo' : 'Base'} fuera de SLA · ${b.nombre}` : `${b.tipo === 'correo' ? 'Correo' : 'Base'} abierta · ${b.nombre}`,
      detalle: restantes <= 0 ? `Recibida hace ${num(horas, 0)} h; el SLA es de 24 h.` : `Quedan ${num(restantes, restantes < 10 ? 1 : 0)} h para responder (${b.casos} casos).`,
      fecha: diaLocal(b.recibido),
      destino: { tipo: 'pagina', pagina: 'operacion', sub: 'bases' },
      accion: 'Registrar respuesta',
    })
  }

  const kpis = calcularKpis(db, mes, derivados, hoy).filter((k) => k.estado === 'NO CUMPLE')
  if (kpis.length) {
    add({
      id: `kpis:${mes}`,
      gravedad: 'media',
      categoria: 'kpis',
      titulo: `${kpis.length} KPI${kpis.length === 1 ? '' : 's'} del mes no cumple${kpis.length === 1 ? '' : 'n'} la meta`,
      detalle: kpis.map((k) => k.def.nombre).join(' · '),
      fecha: `${mes}-01`,
      destino: { tipo: 'pagina', pagina: 'operacion', sub: 'kpis' },
      accion: 'Ver KPIs',
    })
  }

  const ultimaCal = (db.operacion.calibraciones ?? []).reduce((m, c) => (c.fecha > m ? c.fecha : m), '')
  const diasCal = ultimaCal ? diasEntre(ultimaCal, hoy) : null
  if (diasCal === null || diasCal > DIAS_CALIBRACION) {
    add({
      id: 'calibracion',
      gravedad: 'media',
      categoria: 'calibracion',
      titulo: diasCal === null ? 'Sin calibraciones registradas' : `Calibración vencida (hace ${diasCal} días)`,
      detalle: 'Regla del modelo: calibración quincenal entre analistas. Registra la diferencia de puntaje en la misma llamada para el KPI de desviación.',
      fecha: ultimaCal || '0000',
      destino: { tipo: 'pagina', pagina: 'operacion', sub: 'calibraciones' },
      accion: 'Registrar calibración',
    })
  }

  for (const a of db.agentes) {
    if (!a.activo || !a.fechaIngreso || a.dictamen) continue
    const dias = diasEntre(a.fechaIngreso, hoy)
    if (dias < 28 || dias > 90) continue
    add({
      id: `dictamen:${a.id}`,
      gravedad: dias >= 30 ? 'media' : 'baja',
      categoria: 'ingresos',
      titulo: `Dictamen del periodo de prueba · ${nombreCorto(a.nombre)}`,
      detalle: `Día ${dias + 1} desde su ingreso (${fechaMedia(a.fechaIngreso)}). Corte 3 (día 30): evaluación final y dictamen acredita / no acredita.`,
      fecha: a.fechaIngreso,
      destino: { tipo: 'pagina', pagina: 'operacion', sub: 'equipo' },
      accion: 'Registrar dictamen',
    })
  }

  const faltanFirmantes = [
    !db.config.supervisorCalidad?.trim() && 'Supervisor(a) de calidad',
    !db.config.ciudad?.trim() && 'Ciudad del acta',
  ].filter(Boolean) as string[]
  if (faltanFirmantes.length) {
    add({
      id: 'config-firmantes',
      gravedad: 'baja',
      categoria: 'datos',
      titulo: 'Completa los datos de los formatos',
      detalle: `Sin esto los documentos salen con espacios en blanco: ${faltanFirmantes.join(' y ')}.`,
      fecha: '9999',
      destino: { tipo: 'pagina', pagina: 'ajustes' },
      accion: 'Completar',
    })
  }
  const provisionales = db.agentes.filter((a) => a.activo && a.idProvisional).length
  if (provisionales) {
    add({
      id: 'ids-provisionales',
      gravedad: 'baja',
      categoria: 'datos',
      titulo: `${provisionales} ejecutivos con ID provisional`,
      detalle: 'No tenían ID en los Excel. Reemplázalo por el usuario o número de empleado real.',
      fecha: '9999',
      destino: { tipo: 'pagina', pagina: 'ajustes', sub: 'ejecutivos' },
      accion: 'Corregir',
    })
  }

  return alertas.sort((a, b) => ORDEN_GRAVEDAD[a.gravedad] - ORDEN_GRAVEDAD[b.gravedad] || a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, 'es'))
}

export function resumenAlertas(alertas: Alerta[]) {
  const alta = alertas.filter((a) => a.gravedad === 'alta').length
  const media = alertas.filter((a) => a.gravedad === 'media').length
  return { alta, media, baja: alertas.length - alta - media, atender: alta + media }
}
