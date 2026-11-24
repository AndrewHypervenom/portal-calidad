import type { DB, Documento, Evaluacion, TipoDoc } from '../lib/types'
import type { Plan } from '../lib/plans'
import { store } from '../lib/store'
import { bloquesDeCedula, cedulaPorId } from '../lib/catalog'
import { fechaLarga, fechaMedia, hoyIso, partesFecha, sumarDias } from '../lib/dates'
import { duracion, pct, uid } from '../lib/format'

export { CAMPOS, FIRMANTES, NOMBRE_DOC, NOMBRE_DOC_CORTO, camposFaltantes, estadoFirmas } from './reglas'
export type { CampoDoc, Firmante } from './reglas'

interface Incumplimiento {
  bloque: string
  topico: string
  motivo?: string
  area?: string
  critico: boolean
}

function incumplimientosDe(db: DB, ev: Evaluacion): Incumplimiento[] {
  const lista: Incumplimiento[] = []
  for (const g of bloquesDeCedula(db.catalogo, ev.cedulaId)) {
    for (const it of g.items) {
      if (ev.respuestas[it.key] !== 'N') continue
      const modo = ev.criticos[it.key]
      const critico = modo === 'siempre' || (modo === 'motivo' && !!it.def.motivos?.some((m) => m.label === ev.motivos[it.key] && m.critico))
      lista.push({ bloque: g.bloque, topico: it.def.topico, motivo: ev.motivos[it.key], area: ev.areas[it.key], critico })
    }
  }
  return lista
}

function textoIncumplimiento(i: Incumplimiento): string {
  return `${i.bloque} · ${i.topico}${i.motivo ? ` (${i.motivo})` : ''}${i.critico ? ' [error crítico]' : ''}${i.area ? `: ${i.area}` : ''}`
}

function resumenCriterios(db: DB, ev: Evaluacion): string {
  const ced = cedulaPorId(db.catalogo, ev.cedulaId)
  const partes = bloquesDeCedula(db.catalogo, ev.cedulaId).map((g) => {
    let si = 0
    let posibles = 0
    for (const it of g.items) {
      const r = ev.respuestas[it.key]
      const peso = ev.pesos[it.key] ?? it.peso
      if (r === 'S') si += peso
      if (r === 'S' || r === 'N') posibles += peso
    }
    return `${g.bloque}: ${posibles ? `${si}/${posibles} pts` : 'no aplica'}`
  })
  return `Cédula ${ced?.nombre ?? ''} (${ev.canal}${ev.canal === 'Monitoreo' ? ` · ${ev.proceso}` : ''}). ${partes.join(' · ')}.`
}

export function camposIniciales(tipo: TipoDoc, db: DB, ev: Evaluacion, plan?: Plan): Record<string, string> {
  const cfg = db.config
  const agente = db.agentes.find((a) => a.id === ev.agenteId)
  const supervisor = agente?.supervisor || cfg.supervisorOperaciones
  const incumplimientos = incumplimientosDe(db, ev)
  const ced = cedulaPorId(db.catalogo, ev.cedulaId)
  if (tipo === 'retro') {
    return {
      agente: ev.agenteNombre,
      auditor: ev.analista,
      fechaLlamada: ev.fechaLlamada ? fechaLarga(ev.fechaLlamada) : fechaLarga(ev.fechaEvaluacion),
      fechaEvaluacion: fechaLarga(ev.fechaEvaluacion),
      tipoAuditoria: ev.tipoAuditoria ?? 'AUDIO Y PROCESOS',
      centroResultados: cfg.centroResultados,
      caso: ev.idCaso,
      duracion: duracion(ev.duracionSeg),
      calificacion: pct(ev.puntaje),
      criterios: resumenCriterios(db, ev),
      areas: incumplimientos.length ? incumplimientos.map((i) => `• ${textoIncumplimiento(i)}`).join('\n') + (ev.observaciones ? `\n\nObservaciones: ${ev.observaciones}` : '') : ev.observaciones || 'Sin incumplimientos. ¡Buen trabajo!',
      compromiso: incumplimientos.length ? 'Me comprometo a ' : '',
      porQue: '',
      desconocia: '',
      supervisor,
      supCalidad: cfg.supervisorCalidad,
      cc: '',
    }
  }
  if (tipo === 'carta') {
    const compromisos = [
      ...[...new Set(incumplimientos.map((i) => i.topico))].map((t) => `Aplicar correctamente “${t}” conforme a la cédula de calidad.`),
      `Mantener una calificación igual o mayor a ${pct(cfg.meta, 0)} y sin errores críticos en las siguientes 3 auditorías.`,
      plan ? `Cumplir el plan de mejora: ${plan.ruta.accion}` : '',
    ].filter(Boolean)
    return {
      fecha: fechaMedia(hoyIso()),
      creadoPor: ev.analista,
      asociado: ev.agenteNombre,
      area: `${cfg.area} · ${ev.canal === 'Inbound' ? 'Inbound' : ev.proceso}`,
      motivo: `los indicadores de calidad de la cédula ${ced?.nombre ?? ''} (evaluación ${ev.folio}, ${fechaMedia(ev.fechaEvaluacion)}, calificación ${pct(ev.puntaje)})`,
      incumplimientos: incumplimientos.map((x, i) => `${i + 1}. ${textoIncumplimiento(x)}`).join('\n'),
      compromisos: compromisos.map((l, i) => `${i + 1}. ${l}`).join('\n'),
      supervisor,
      analista: ev.analista,
      testigo: '',
    }
  }
  const { dia, mes, anio } = partesFecha(hoyIso())
  const desde = sumarDias(ev.fechaEvaluacion, -30)
  const historial = db.evaluaciones
    .filter((e) => e.agenteId === ev.agenteId && e.fechaEvaluacion >= desde && e.fechaEvaluacion <= ev.fechaEvaluacion && Object.values(e.respuestas).includes('N'))
    .sort((a, b) => a.fechaEvaluacion.localeCompare(b.fechaEvaluacion))
  const motivos = historial.map((e) => {
    const fallas = incumplimientosDe(db, e).map((i) => `${i.topico}${i.critico ? ' (crítico)' : ''}`)
    return `- ${fechaMedia(e.fechaEvaluacion)}, evaluación ${e.folio} (${cedulaPorId(db.catalogo, e.cedulaId)?.nombre ?? ''}), calificación ${pct(e.puntaje)}: ${fallas.join('; ')}.`
  })
  if (plan) {
    const repetidos = plan.fallas.filter((f) => f.reincidencia > 0)
    if (repetidos.length)
      motivos.push(`- Reincidencia: ${repetidos.map((f) => `“${f.topico}” (${f.reincidencia + 1} veces en 30 días)`).join(', ')}, después de recibir retroalimentación y plan de acción.`)
    if (plan.fallas.some((f) => f.critico)) motivos.push('- Se registraron errores críticos conforme a la cédula de calidad.')
  }
  return {
    dia: String(dia),
    mes,
    anio: String(anio),
    hora: '',
    ciudad: cfg.ciudad,
    agente: ev.agenteNombre,
    puesto: cfg.puestoAgente,
    analista: ev.analista,
    supervisor,
    motivos: motivos.join('\n'),
    talentoHumano: cfg.talentoHumano,
  }
}

export function nuevoDocumento(tipo: TipoDoc, db: DB, ev: Evaluacion, plan?: Plan): Documento {
  return {
    id: uid(),
    folio: '',
    tipo,
    evaluacionId: ev.id,
    agenteId: ev.agenteId,
    agenteNombre: ev.agenteNombre,
    campos: camposIniciales(tipo, db, ev, plan),
    firmas: {},
    creadoEn: '',
    actualizadoEn: '',
    creadoPor: '',
  }
}

export async function crearDocumento(tipo: TipoDoc, db: DB, ev: Evaluacion, plan?: Plan): Promise<Documento> {
  return store.op<Documento>('documento.guardar', nuevoDocumento(tipo, db, ev, plan))
}

export async function crearDocumentosAutomaticos(db: DB, ev: Evaluacion, plan: Plan): Promise<Documento[]> {
  const creados: Documento[] = []
  for (const tipo of plan.docsRequeridos) {
    const existe = db.documentos.some((d) => d.evaluacionId === ev.id && d.tipo === tipo && !d.anulado)
    if (!existe) creados.push(await crearDocumento(tipo, store.get().db ?? db, ev, plan))
  }
  return creados
}
