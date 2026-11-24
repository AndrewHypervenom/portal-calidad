import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { calificar, calificarEvaluacion } from '../src/lib/scoring'
import { calcularCapacidad, calcularMuestreo, repartoEquipo } from '../src/lib/operacion'
import { derivarPlanes, nivelDe } from '../src/lib/plans'
import { aplicar, crearDbDesdeSeed } from '../src/shared/reducer.js'
import { semanaDelMes } from '../src/lib/dates'
import type { DB, Evaluacion, Resp } from '../src/lib/types'

const seed = JSON.parse(readFileSync(new URL('../public/seed.json', import.meta.url), 'utf8'))
const db: DB = crearDbDesdeSeed(seed, '2026-10-02T12:00:00.000Z')

describe('calificación igual a los Excel', () => {
  it('recalcula las 114 evaluaciones históricas con el mismo Promedio que el Acumulado', () => {
    expect(db.evaluaciones).toHaveLength(114)
    for (const ev of db.evaluaciones) {
      const r = calificarEvaluacion(ev, db.catalogo)
      expect(r.puntaje, `${ev.folio} (${ev.origen?.archivo} fila ${ev.origen?.fila})`).toBeCloseTo(Number(ev.origen?.promedioExcel), 12)
    }
  })

  it('también cuadra usando el catálogo vigente (no solo la fotografía guardada)', () => {
    for (const ev of db.evaluaciones) {
      const ced = db.catalogo.cedulas.find((c) => c.id === ev.cedulaId)!
      const r = calificar(ced.items, db.catalogo.items, ev.respuestas, ev.motivos)
      expect(r.puntaje).toBeCloseTo(Number(ev.origen?.promedioExcel), 12)
    }
  })

  it('un "No" en rubro crítico deja la calificación en 0', () => {
    const ced = db.catalogo.cedulas.find((c) => c.id === 'inb-fraude')!
    const resp: Record<string, Resp> = Object.fromEntries(ced.items.map((i) => [i.key, 'S' as Resp]))
    resp['inb.bloqueo-correcto'] = 'N'
    const r = calificar(ced.items, db.catalogo.items, resp, {})
    expect(r.critico).toBe(true)
    expect(r.puntaje).toBe(0)
  })

  it('en rubros con motivo, solo el motivo crítico vuelve crítico el "No"', () => {
    const ced = db.catalogo.cedulas.find((c) => c.id === 'inb-rechazo')!
    const resp: Record<string, Resp> = Object.fromEntries(ced.items.map((i) => [i.key, 'S' as Resp]))
    resp['inb.autentica'] = 'N'
    const sinMotivo = calificar(ced.items, db.catalogo.items, resp, {})
    expect(sinMotivo.critico).toBe(false)
    expect(sinMotivo.motivoPendiente).toEqual(['inb.autentica'])
    expect(sinMotivo.puntaje).toBeCloseTo((121 - 11) / 121, 12)
    const otp = calificar(ced.items, db.catalogo.items, resp, { 'inb.autentica': 'Aut CallerID/OTP' })
    expect(otp.critico).toBe(false)
    const incompleta = calificar(ced.items, db.catalogo.items, resp, { 'inb.autentica': 'Aut Incompleta' })
    expect(incompleta.critico).toBe(true)
    expect(incompleta.puntaje).toBe(0)
  })

  it('"No aplica" no cuenta en la calificación', () => {
    const ced = db.catalogo.cedulas.find((c) => c.id === 'mon-nofraude')!
    const resp: Record<string, Resp> = Object.fromEntries(ced.items.map((i) => [i.key, 'S' as Resp]))
    resp['mon.vrm-mantenimiento'] = 'A'
    resp['mon.escucha-activa'] = 'N'
    const r = calificar(ced.items, db.catalogo.items, resp, {})
    expect(r.puntaje).toBeCloseTo((98 - 8 - 4) / (98 - 8), 12)
  })

  it('la semana del mes coincide con la capturada en Excel (113 de 114; 1 error de captura)', () => {
    const distintas = db.evaluaciones.filter((e: Evaluacion) => semanaDelMes(e.fechaEvaluacion) !== e.semana)
    expect(distintas).toHaveLength(1)
  })
})

describe('modelo de capacidad igual al libro "Modelo Reincidencias"', () => {
  const p = db.operacion.parametros
  const m = calcularCapacidad(p, db.operacionDef.tareas, {}, [])

  it('reproduce las horas de cada una de las 26 tareas', () => {
    for (const t of m.tareas) expect(t.horas, t.def.id).toBeCloseTo(t.def.excelHoras, 9)
  })

  it('reproduce el dimensionamiento', () => {
    expect(m.demanda).toBeCloseTo(380.58666666666664, 9)
    expect(m.capacidadEquipo).toBeCloseTo(453.6, 9)
    expect(m.ocupacion).toBeCloseTo(0.8390358612580834, 12)
    expect(m.demandaAnalista).toBeCloseTo(126.86222222222221, 9)
    expect(m.horasLibres).toBeCloseTo(1.6577777777777953, 9)
    expect(m.estado).toBe('SOSTENIBLE')
    expect(m.sla.pico.horas).toBeCloseTo(5.333333333333333, 9)
    expect(m.sla.pico.analistas).toBe(1)
  })

  it('reproduce el muestreo por riesgo', () => {
    const mu = calcularMuestreo(p)
    expect(mu.segmentos.map((s) => s.agentes)).toEqual([27, 9, 9, 6])
    expect(mu.totalSemana).toBeCloseTo(75, 9)
    expect(mu.totalMes).toBeCloseTo(324.75, 9)
    expect(mu.diarias).toBeCloseTo(15, 9)
    expect(mu.cobertura).toBeCloseTo(6.176470588235294, 9)
    expect([mu.repartoMonitoreo, mu.repartoInbound]).toEqual([10, 5])
    expect(mu.minimoMes).toBe(4)
  })

  it('reproduce el reparto del equipo', () => {
    expect(repartoEquipo(p)).toEqual([
      { agentes: 16, diarias: 5 },
      { agentes: 15, diarias: 5 },
      { agentes: 14, diarias: 5 },
    ])
  })
})

describe('plan de acción individual', () => {
  it('aplica la ruta escalonada como el PLAN ACCION IND', () => {
    expect(nivelDe(0.72, true, 1, 'SABER', 0.9, 0.8)).toBe(4)
    expect(nivelDe(0.85, false, 0, 'SABER', 0.9, 0.8)).toBe(1)
    expect(nivelDe(0.75, false, 0, undefined, 0.9, 0.8)).toBe(2)
    expect(nivelDe(0.95, false, 1, undefined, 0.9, 0.8)).toBe(2)
    expect(nivelDe(0.95, false, 2, undefined, 0.9, 0.8)).toBe(3)
    expect(nivelDe(0.95, false, 2, 'QUERER', 0.9, 0.8)).toBe(4)
    expect(nivelDe(1, false, 0, undefined, 0.9, 0.8)).toBe(0)
  })

  it('genera planes para las evaluaciones históricas debajo de la meta', () => {
    const d = derivarPlanes(db, '2026-10-02')
    const debajo = db.evaluaciones.filter((e) => e.critico || (e.puntaje ?? 1) < 0.9)
    expect(d.planes.length).toBeGreaterThanOrEqual(debajo.length)
    for (const pl of d.planes) {
      expect(pl.nivel).toBeGreaterThanOrEqual(1)
      if (pl.ev.critico) expect(pl.nivel).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('núcleo de datos compartido', () => {
  it('asigna folio consecutivo y es idempotente', () => {
    const base = db.evaluaciones[0]
    const nueva = { ...base, id: 'prueba-1', folio: '', canal: 'Inbound' as const }
    const r1 = aplicar(db, { opId: 'op1', op: 'evaluacion.guardar', payload: nueva, por: 'test', now: '2026-10-02T12:00:00Z' }, { autoritativo: true })
    const guardada = r1.db.evaluaciones.find((e: Evaluacion) => e.id === 'prueba-1')!
    expect(guardada.folio).toBe('INB-00057')
    const r2 = aplicar(r1.db, { opId: 'op1', op: 'evaluacion.guardar', payload: r1.payload, por: 'test', now: '2026-10-02T12:00:00Z' })
    expect(r2.db.evaluaciones).toHaveLength(115)
    expect(r2.db.actividad).toHaveLength(1)
  })
})
