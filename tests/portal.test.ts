process.env.TZ = 'America/Mexico_City'

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { aplicar, crearDbDesdeSeed } from '../src/shared/reducer.js'
import { diaLocal, sumarDias } from '../src/lib/dates'
import { derivarPlanes, fechaFeedback } from '../src/lib/plans'
import { calcularAlertas } from '../src/lib/alertas'
import { calcularKpis } from '../src/lib/kpis'
import { planSemanal } from '../src/lib/muestreo'
import { matrizProcesoTipo, porAgente, promedio } from '../src/lib/analytics'
import { camposFaltantes } from '../src/documents/reglas'
import type { DB, Documento, Evaluacion, Resp } from '../src/lib/types'

const seed = JSON.parse(readFileSync(new URL('../public/seed.json', import.meta.url), 'utf8'))
const HOY = '2026-10-05'
const base = (): DB => crearDbDesdeSeed(seed, '2026-10-02T12:00:00.000Z')
let n = 0
const op = (db: DB, nombre: string, payload: unknown, now = '2026-10-05T15:00:00.000Z') => aplicar(db, { opId: `op-${++n}`, op: nombre, payload, por: 'Adriana Nery', now }).db

function evaluacion(db: DB, fecha: string, agenteId = 'AUEE', critico = false): Evaluacion {
  const ced = db.catalogo.cedulas.find((c) => c.id === 'inb-fraude')!
  const respuestas: Record<string, Resp> = Object.fromEntries(ced.items.map((i) => [i.key, 'S' as Resp]))
  const clave = critico ? ced.items.find((i) => i.critico === 'siempre')!.key : ced.items.find((i) => i.critico === 'no')!.key
  respuestas[clave] = 'N'
  return {
    id: `prueba-${fecha}-${agenteId}-${critico}`,
    folio: '',
    canal: 'Inbound',
    cedulaId: ced.id,
    tipoLlamada: ced.nombreExcel,
    proceso: 'Inbound',
    agenteId,
    agenteNombre: db.agentes.find((a) => a.id === agenteId)!.nombre,
    analistaId: 'adriana-nery',
    analista: 'Adriana Nery',
    fechaLlamada: fecha,
    fechaEvaluacion: fecha,
    semana: 1,
    duracionSeg: 300,
    idCaso: `caso-${fecha}`,
    respuestas,
    motivos: {},
    areas: {},
    observaciones: '',
    pesos: Object.fromEntries(ced.items.map((i) => [i.key, i.peso])),
    criticos: Object.fromEntries(ced.items.filter((i) => i.critico !== 'no').map((i) => [i.key, i.critico])),
    puntaje: critico ? 0 : 0.95,
    critico,
    origen: { tipo: 'portal' },
    creadoEn: '',
    actualizadoEn: '',
    creadoPor: '',
  }
}

function retro(ev: Evaluacion, campos: Record<string, string> = {}): Documento {
  return {
    id: `doc-${ev.id}`,
    folio: '',
    tipo: 'retro',
    evaluacionId: ev.id,
    agenteId: ev.agenteId,
    agenteNombre: ev.agenteNombre,
    campos: { compromiso: 'Me comprometo a ', porQue: '', desconocia: '', supervisor: 'Aneth Michelle Manzano', ...campos },
    firmas: {},
    creadoEn: '',
    actualizadoEn: '',
    creadoPor: '',
  }
}

describe('fechas locales', () => {
  it('una firma a las 19:30 de México (01:30 UTC del día siguiente) cuenta para el mismo día', () => {
    expect(diaLocal('2026-10-06T01:30:00.000Z')).toBe('2026-10-05')
    expect(diaLocal('2026-10-05')).toBe('2026-10-05')
    expect(diaLocal('2026-10-05T09:30')).toBe('2026-10-05')
  })
})

describe('firmas y feedback', () => {
  it('la firma del colaborador en la retroalimentación registra el feedback de la evaluación y queda en la bitácora', () => {
    let db = base()
    const ev = evaluacion(db, '2026-10-05')
    db = op(db, 'evaluacion.guardar', ev)
    db = op(db, 'documento.guardar', retro(ev, { compromiso: 'Me comprometo a validar el bloqueo', porQue: 'Prisa', desconocia: 'No' }))
    const doc = db.documentos[0]
    const firma = { nombre: 'Alan Uriel Estrada Esparza', img: 'data:,', fecha: '2026-10-06T01:30:00.000Z' }
    db = op(db, 'documento.guardar', { ...doc, firmas: { colaborador: firma } })
    const guardada = db.evaluaciones.find((e) => e.id === ev.id)!
    expect(guardada.feedback?.fecha).toBe(firma.fecha)
    expect(fechaFeedback(guardada, db.documentos)).toBe('2026-10-05')
    expect(db.actividad[0].accion).toBe('Documento firmado')
    expect(db.actividad[0].detalle).toContain('firmó Colaborador (Alan Uriel Estrada Esparza)')
    db = op(db, 'documento.guardar', { ...db.documentos[0], firmas: {} })
    expect(db.actividad[0].accion).toBe('Firma retirada')
  })

  it('“Falta llenar”: la retroalimentación con hallazgos exige compromiso, causa y si desconocía la información', () => {
    const db = base()
    const ev = evaluacion(db, '2026-10-05')
    expect(camposFaltantes(retro(ev), ev).map((f) => f.id)).toEqual(['compromiso', 'porQue', 'desconocia'])
    expect(camposFaltantes(retro(ev, { compromiso: 'Me comprometo a cerrar Falcon correctamente', porQue: 'Desconocía el cierre', desconocia: 'Sí' }), ev)).toEqual([])
    const perfecta = { ...ev, respuestas: Object.fromEntries(Object.keys(ev.respuestas).map((k) => [k, 'S' as Resp])) }
    expect(camposFaltantes(retro(perfecta), perfecta)).toEqual([])
  })
})

describe('centro de alertas', () => {
  it('feedback fuera de plazo (48 h) y documento por firmar con campos faltantes', () => {
    let db = base()
    const ev = evaluacion(db, sumarDias(HOY, -3))
    db = op(db, 'evaluacion.guardar', ev)
    db = op(db, 'documento.guardar', retro(ev))
    let alertas = calcularAlertas(db, derivarPlanes(db, HOY), HOY, new Date('2026-10-05T18:00:00Z'))
    const fb = alertas.find((a) => a.id === `feedback:${ev.id}`)
    expect(fb?.gravedad).toBe('alta')
    const firmas = alertas.find((a) => a.categoria === 'firmas')
    expect(firmas?.gravedad).toBe('media')
    expect(firmas?.detalle).toContain('Falta llenar')
    const tarde = '2026-10-07'
    alertas = calcularAlertas(db, derivarPlanes(db, tarde), tarde)
    expect(alertas.find((a) => a.categoria === 'firmas')?.gravedad).toBe('alta')
  })

  it('con la retroalimentación firmada por el colaborador ya no hay alerta de feedback', () => {
    let db = base()
    const ev = evaluacion(db, sumarDias(HOY, -1))
    db = op(db, 'evaluacion.guardar', ev)
    db = op(db, 'documento.guardar', retro(ev, { compromiso: 'Me comprometo a validar', porQue: 'Prisa', desconocia: 'No' }))
    db = op(db, 'documento.guardar', { ...db.documentos[0], firmas: { colaborador: { nombre: 'Alan', img: 'data:,', fecha: '2026-10-05T16:00:00.000Z' } } })
    const alertas = calcularAlertas(db, derivarPlanes(db, HOY), HOY)
    expect(alertas.some((a) => a.id === `feedback:${ev.id}`)).toBe(false)
  })

  it('las evaluaciones migradas del Excel no generan alertas de feedback', () => {
    const db = base()
    const alertas = calcularAlertas(db, derivarPlanes(db, HOY), HOY)
    expect(alertas.filter((a) => a.categoria === 'feedback')).toHaveLength(0)
    expect(alertas.find((a) => a.id === 'planes-historicos')?.gravedad).toBe('baja')
  })

  it('base fija sin responder después de 24 h y calibración quincenal pendiente', () => {
    let db = base()
    db = op(db, 'base.guardar', { id: 'b1', tipo: 'base', nombre: 'Transacciones CNF', enviadaPor: 'Miguel', recibido: '2026-10-04T08:00', respondido: '', casos: 12, analistaId: 'norma-ruiz', hallazgos: [] })
    let alertas = calcularAlertas(db, derivarPlanes(db, HOY), HOY, new Date('2026-10-05T12:00:00'))
    expect(alertas.find((a) => a.id === 'base:b1')?.gravedad).toBe('alta')
    expect(alertas.some((a) => a.id === 'calibracion')).toBe(true)
    db = op(db, 'calibracion.guardar', { id: 'c1', fecha: '2026-10-01', referencia: 'INB-00010', canal: 'Inbound', puntajes: { 'adriana-nery': 0.9, 'norma-ruiz': 0.86 }, notas: '' })
    alertas = calcularAlertas(db, derivarPlanes(db, HOY), HOY)
    expect(alertas.some((a) => a.id === 'calibracion')).toBe(false)
  })
})

describe('KPIs automáticos', () => {
  it('desviación en calibración = mayor diferencia del mes (puntos)', () => {
    let db = base()
    db = op(db, 'calibracion.guardar', { id: 'c1', fecha: '2026-10-01', referencia: 'A', canal: 'Inbound', puntajes: { a: 0.9, b: 0.86, c: 0.88 }, notas: '' })
    db = op(db, 'calibracion.guardar', { id: 'c2', fecha: '2026-10-03', referencia: 'B', canal: 'Inbound', puntajes: { a: 0.95, b: 0.93 }, notas: '' })
    const k = calcularKpis(db, '2026-10', derivarPlanes(db, HOY), HOY).find((x) => x.def.id === 'calibracion')!
    expect(k.valor).toBeCloseTo(4, 9)
    expect(k.fuente).toBe('auto')
    expect(k.estado).toBe('CUMPLE')
  })

  it('nuevos ingresos que acreditan, con el dictamen del periodo de prueba', () => {
    let db = base()
    const [a, b] = db.agentes
    db = op(db, 'agente.guardar', { ...a, fechaIngreso: '2026-09-01', dictamen: 'acredita', fechaDictamen: '2026-10-01' })
    db = op(db, 'agente.guardar', { ...b, fechaIngreso: '2026-09-01', dictamen: 'no-acredita', fechaDictamen: '2026-10-02' })
    const k = calcularKpis(db, '2026-10', derivarPlanes(db, HOY), HOY).find((x) => x.def.id === 'acreditan')!
    expect(k.valor).toBe(0.5)
    expect(db.actividad[0].accion).toBe('Dictamen del periodo de prueba')
  })
})

describe('muestreo de la semana', () => {
  it('un plan nivel 2 o mayor suma 2 auditorías extra en sus primeras 2 semanas', () => {
    let db = base()
    const ev = evaluacion(db, '2026-10-05', 'AUEE', true)
    db = op(db, 'evaluacion.guardar', ev)
    const plan = derivarPlanes(db, HOY).planPorEval.get(ev.id)!
    expect(plan.nivel).toBeGreaterThanOrEqual(3)
    const fila = planSemanal(db, derivarPlanes(db, HOY).planes, HOY).filas.find((f) => f.agente.id === 'AUEE')!
    expect(fila.extra).toBe(2)
    expect(fila.objetivo).toBe(Math.ceil(db.operacion.parametros.freqRojo) + 2)
    const despues = planSemanal(db, derivarPlanes(db, '2026-10-26').planes, '2026-10-26').filas.find((f) => f.agente.id === 'AUEE')!
    expect(despues.extra).toBe(0)
  })
})

describe('bitácora', () => {
  it('registra parámetros, KPIs, tiempos y bases que antes no dejaban rastro', () => {
    let db = base()
    db = op(db, 'operacion.parametro', { key: 'metaAudDia', valor: 18 })
    expect(db.actividad[0]).toMatchObject({ accion: 'Parámetro actualizado' })
    expect(db.actividad[0].detalle).toContain('15 → 18')
    db = op(db, 'operacion.kpi', { mes: '2026-10', id: 'calibracion', valor: 3 })
    expect(db.actividad[0].accion).toBe('KPI capturado')
    db = op(db, 'tiempo.guardar', { id: 't1', fecha: '2026-10-05', analistaId: 'adriana-nery', tareaId: 'T01', inicio: '08:30', fin: '10:30', minutos: 120, cantidad: 7, observacion: '' })
    expect(db.actividad[0].accion).toBe('Tiempo registrado')
    db = op(db, 'base.guardar', { id: 'b1', tipo: 'correo', nombre: 'Solicitud por correo', enviadaPor: 'Ana', recibido: '2026-10-05T08:00', respondido: '', casos: 3, analistaId: 'norma-ruiz', hallazgos: [] })
    expect(db.actividad[0].accion).toBe('Correo registrado')
  })
})

describe('vista “Tipo Llamada y Agente” (Monitoreo por proceso y tipo)', () => {
  it('separa fraude con y sin afectación y el fraude es el promedio real de sus llamadas', () => {
    const db = base()
    const mon = db.evaluaciones.filter((e) => e.canal === 'Monitoreo')
    const tipos = db.catalogo.cedulas.filter((c) => c.canal === 'Monitoreo').flatMap((c) => c.tiposLlamada ?? [])
    const m = matrizProcesoTipo(mon, db.config.procesosMonitoreo, tipos)
    expect(m.columnas.map((c) => c.etiqueta)).toEqual(['Total', 'No fraude', 'Fraude (todos)', 'Fraude con afectación', 'Fraude sin afectación'])
    const vcas = m.filas.find((r) => r.proceso === 'VCAS')!
    expect(vcas.celdas.map((c) => c.n)).toEqual([27, 20, 7, 4, 3])
    const fraude = mon.filter((e) => e.proceso === 'VCAS' && e.tipoLlamada.startsWith('FRAUDE'))
    expect(vcas.celdas[2].promedio).toBeCloseTo(promedio(fraude.map((e) => e.puntaje))!, 12)
    const fila = porAgente(mon, db.agentes, db.config).get(fraude[0].agenteId)!
    expect(fila.porTipo.get(fraude[0].tipoLlamada)!.n).toBeGreaterThan(0)
  })
})
