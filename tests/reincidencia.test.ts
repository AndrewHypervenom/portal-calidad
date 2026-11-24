process.env.TZ = 'America/Mexico_City'

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { aplicar, crearDbDesdeSeed, migrarDb, VERSION_DB } from '../src/shared/reducer.js'
import { calificar } from '../src/lib/scoring'
import { contarReincidencia, derivarPlanes } from '../src/lib/plans'
import { calcularKpis } from '../src/lib/kpis'
import { matrizErrores } from '../src/lib/analytics'
import type { DB, Evaluacion, Resp } from '../src/lib/types'

const seed = JSON.parse(readFileSync(new URL('../public/seed.json', import.meta.url), 'utf8'))
const base = (): DB => crearDbDesdeSeed(seed, '2026-10-02T12:00:00.000Z')
let n = 0
const op = (db: DB, nombre: string, payload: unknown) => aplicar(db, { opId: `op-${++n}`, op: nombre, payload, por: 'Adriana Nery', now: '2026-11-20T15:00:00.000Z' }).db

const AGENTE = 'FMRG'
const NO_CRITICO = 'inb.vrm-comentario'
const OTRO_NO_CRITICO = 'inb.script-app'
const CRITICO = 'inb.cierre-caso'
const OTRO_CRITICO = 'inb.codificacion'

function evaluacion(db: DB, id: string, fecha: string, fallas: string[], cedulaId = 'inb-fraude', creadoEn = `${fecha}T15:00:00.000Z`): Evaluacion {
  const ced = db.catalogo.cedulas.find((c) => c.id === cedulaId)!
  const respuestas: Record<string, Resp> = Object.fromEntries(ced.items.map((i) => [i.key, (fallas.includes(i.key) ? 'N' : 'S') as Resp]))
  const c = calificar(ced.items, db.catalogo.items, respuestas, {})
  return {
    id,
    folio: '',
    canal: 'Inbound',
    cedulaId,
    tipoLlamada: ced.nombreExcel,
    proceso: 'Inbound',
    agenteId: AGENTE,
    agenteNombre: db.agentes.find((a) => a.id === AGENTE)!.nombre,
    analistaId: 'adriana-nery',
    analista: 'Adriana Nery',
    fechaLlamada: fecha,
    fechaEvaluacion: fecha,
    semana: 1,
    duracionSeg: 300,
    idCaso: id,
    respuestas,
    motivos: {},
    areas: {},
    observaciones: '',
    pesos: Object.fromEntries(ced.items.map((i) => [i.key, i.peso])),
    criticos: Object.fromEntries(ced.items.filter((i) => i.critico !== 'no').map((i) => [i.key, i.critico])),
    puntaje: c.puntaje,
    critico: c.critico,
    origen: { tipo: 'portal' },
    creadoEn,
    actualizadoEn: creadoEn,
    creadoPor: 'Adriana Nery',
  }
}

function conEvaluaciones(...evs: ((db: DB) => Evaluacion)[]): DB {
  let db = base()
  for (const f of evs) db = op(db, 'evaluacion.guardar', f(db))
  return db
}

const infoDe = (db: DB, id: string) => derivarPlanes(db, '2026-11-30').info.get(id)!

describe('reincidencia como la columna K del PLAN ACCION IND', () => {
  it('el mismo rubro de la misma cédula en días anteriores cuenta como reincidencia', () => {
    const db = conEvaluaciones((d) => evaluacion(d, 'a', '2026-11-02', [NO_CRITICO]), (d) => evaluacion(d, 'b', '2026-11-10', [NO_CRITICO]))
    expect(infoDe(db, 'a').nivel).toBe(0)
    expect(infoDe(db, 'b').reincidencia).toBe(1)
    expect(infoDe(db, 'b').nivel).toBe(2)
  })

  it('el mismo día no cuenta (Excel: fecha < B)', () => {
    const db = conEvaluaciones(
      (d) => evaluacion(d, 'a', '2026-11-02', [NO_CRITICO], 'inb-fraude', '2026-11-02T15:00:00.000Z'),
      (d) => evaluacion(d, 'b', '2026-11-02', [NO_CRITICO], 'inb-fraude', '2026-11-02T18:00:00.000Z'),
    )
    expect(infoDe(db, 'b').reincidencia).toBe(0)
    expect(infoDe(db, 'b').nivel).toBe(0)
  })

  it('el mismo ítem en otra cédula es otro rubro (“Cédula · Ítem”)', () => {
    const db = conEvaluaciones((d) => evaluacion(d, 'a', '2026-11-02', [NO_CRITICO]), (d) => evaluacion(d, 'b', '2026-11-10', [NO_CRITICO], 'inb-roext'))
    expect(infoDe(db, 'b').reincidencia).toBe(0)
  })

  it('la ventana es de 30 días: el día −30 cuenta, el −31 no', () => {
    const db = base()
    const previa = (fecha: string) => evaluacion(db, `p-${fecha}`, fecha, [NO_CRITICO])
    expect(contarReincidencia([previa('2026-10-11')], '2026-11-10', 'inb-fraude', NO_CRITICO)).toBe(1)
    expect(contarReincidencia([previa('2026-10-10')], '2026-11-10', 'inb-fraude', NO_CRITICO)).toBe(0)
    expect(contarReincidencia([previa('2026-11-10')], '2026-11-10', 'inb-fraude', NO_CRITICO)).toBe(0)
    expect(contarReincidencia([previa('2026-11-01')], '2026-11-10', 'inb-roext', NO_CRITICO)).toBe(0)
  })
})

describe('nivel por rubro como la columna M del PLAN ACCION IND', () => {
  it('un crítico nuevo junto a otro rubro que se repite es nivel 3, no 4', () => {
    const db = conEvaluaciones((d) => evaluacion(d, 'a', '2026-11-02', [NO_CRITICO]), (d) => evaluacion(d, 'b', '2026-11-10', [CRITICO, NO_CRITICO]))
    const b = infoDe(db, 'b')
    expect(b.ev.critico).toBe(true)
    expect(b.reincidencia).toBe(1)
    expect(b.nivel).toBe(3)
  })

  it('repetir el mismo rubro crítico es nivel 4', () => {
    const db = conEvaluaciones((d) => evaluacion(d, 'a', '2026-11-02', [CRITICO]), (d) => evaluacion(d, 'b', '2026-11-10', [CRITICO]))
    expect(infoDe(db, 'b').nivel).toBe(4)
  })

  it('un crítico distinto al que se repite tampoco sube a 4', () => {
    const db = conEvaluaciones((d) => evaluacion(d, 'a', '2026-11-02', [OTRO_CRITICO]), (d) => evaluacion(d, 'b', '2026-11-10', [CRITICO, OTRO_NO_CRITICO]))
    expect(infoDe(db, 'b').nivel).toBe(3)
  })

  it('3.ª vez del mismo rubro = nivel 3 y 4.ª vez = nivel 4', () => {
    const db = conEvaluaciones(
      (d) => evaluacion(d, 'a', '2026-11-02', [NO_CRITICO]),
      (d) => evaluacion(d, 'b', '2026-11-05', [NO_CRITICO]),
      (d) => evaluacion(d, 'c', '2026-11-09', [NO_CRITICO]),
      (d) => evaluacion(d, 'e', '2026-11-12', [NO_CRITICO]),
    )
    expect(['a', 'b', 'c', 'e'].map((id) => infoDe(db, id).nivel)).toEqual([0, 2, 3, 4])
  })
})

describe('verificación del plan', () => {
  it('solo cuentan auditorías de días posteriores a la detección', () => {
    const db = conEvaluaciones(
      (d) => evaluacion(d, 'a', '2026-11-02', [CRITICO], 'inb-fraude', '2026-11-02T15:00:00.000Z'),
      (d) => evaluacion(d, 'mismo-dia', '2026-11-02', [], 'inb-fraude', '2026-11-02T18:00:00.000Z'),
      (d) => evaluacion(d, 'v1', '2026-11-04', []),
      (d) => evaluacion(d, 'v2', '2026-11-06', []),
    )
    const plan = derivarPlanes(db, '2026-11-30').planPorEval.get('a')!
    expect(plan.verificaciones.map((v) => v.ev.id)).toEqual(['v1', 'v2'])
  })

  it('un fallo del mismo rubro el mismo día no marca el plan como “reincidió”', () => {
    const db = conEvaluaciones(
      (d) => evaluacion(d, 'a', '2026-11-02', [OTRO_NO_CRITICO, CRITICO], 'inb-fraude', '2026-11-02T15:00:00.000Z'),
      (d) => evaluacion(d, 'b', '2026-11-02', [OTRO_NO_CRITICO], 'inb-fraude', '2026-11-02T18:00:00.000Z'),
    )
    expect(derivarPlanes(db, '2026-11-30').planPorEval.get('a')!.estado).not.toBe('reincide')
  })
})

describe('KPI “Errores críticos”', () => {
  it('cuenta errores críticos (rubros), no evaluaciones', () => {
    const db = conEvaluaciones((d) => evaluacion(d, 'a', '2026-11-02', [CRITICO, OTRO_CRITICO]), (d) => evaluacion(d, 'b', '2026-11-03', [CRITICO]))
    const k = calcularKpis(db, '2026-11', derivarPlanes(db, '2026-11-30'), '2026-11-30').find((x) => x.def.id === 'erroresCriticos')!
    expect(k.valor).toBe(3)
    expect(k.detalle).toContain('3 errores críticos en 2 evaluaciones')
  })

  it('en septiembre (Excel) son 7 errores críticos en 5 evaluaciones', () => {
    const db = base()
    const k = calcularKpis(db, '2026-09', derivarPlanes(db, '2026-10-05'), '2026-10-05').find((x) => x.def.id === 'erroresCriticos')!
    expect(k.valor).toBe(7)
  })
})

describe('KPI “Feedback oportuno”', () => {
  it('las auditorías del Excel sin registro de feedback no cuentan como tardías', () => {
    let db = base()
    const ev = db.evaluaciones.find((e) => Object.entries(e.respuestas).some(([k, r]) => r === 'N' && k in e.pesos))!
    db = op(db, 'evaluacion.feedback', { id: ev.id, fecha: ev.fechaEvaluacion })
    const k = calcularKpis(db, '2026-09', derivarPlanes(db, '2026-10-05'), '2026-10-05').find((x) => x.def.id === 'feedbackOportuno')!
    expect(k.valor).toBe(1)
    expect(k.detalle).toContain('1 de 1')
  })
})

describe('migración de bases anteriores (v1 → v2)', () => {
  const FRONT = 'inb.califica-llamada-front'
  const FALCON = 'inb.califica-llamada-falcon'
  const v1 = (): DB => {
    const db = base()
    const items = { ...db.catalogo.items, [FRONT]: { ...db.catalogo.items[FRONT], tema: db.catalogo.items[FALCON].tema } }
    return { ...db, version: 1, catalogo: { ...db.catalogo, items } }
  }

  it('Falcon y Front (“Califica correctamente la llamada”) quedan como rubros distintos', () => {
    const db = migrarDb(v1())
    expect(db.version).toBe(VERSION_DB)
    expect(db.catalogo.items[FALCON].tema).toBe('inb:califica-correctamente-la-llamada')
    expect(db.catalogo.items[FRONT].tema).toBe('inb:califica-correctamente-la-llamada:front')
    expect(db.catalogo.items['inb.vcas-calificacion'].tema).toBe(db.catalogo.items['inb.vcas-calificacion-aclaracion'].tema)
    const m = matrizErrores(db.evaluaciones, db.catalogo, 'Inbound')
    expect(m.temas.filter((t) => t.keys.includes(FALCON) || t.keys.includes(FRONT))).toHaveLength(2)
  })

  it('es idempotente y una base nueva ya nace migrada', () => {
    const una = migrarDb(v1())
    expect(migrarDb(una)).toBe(una)
    const nueva = base()
    expect(nueva.version).toBe(VERSION_DB)
    expect(migrarDb(nueva)).toBe(nueva)
  })

  it('agrega los hallazgos de la conciliación sin repetirlos', () => {
    const antes = { ...v1(), hallazgos: seed.hallazgos as string[] }
    const despues = migrarDb(antes)
    expect(despues.hallazgos.length).toBe(seed.hallazgos.length + 6)
    expect(despues.hallazgos.some((h) => h.startsWith('PLAN ACCION IND: la reincidencia'))).toBe(true)
    expect(new Set(despues.hallazgos).size).toBe(despues.hallazgos.length)
    expect(base().hallazgos).toEqual(despues.hallazgos)
  })

  it('restaurar un respaldo anterior lo migra', () => {
    const db = op(base(), 'datos.restaurar', { db: v1() })
    expect(db.version).toBe(VERSION_DB)
    expect(db.catalogo.items[FRONT].tema).toBe('inb:califica-correctamente-la-llamada:front')
  })
})
